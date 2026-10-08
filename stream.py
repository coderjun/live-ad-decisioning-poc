"""The Network: a fictional channel whose program clips and ad breaks loop forever as one live HLS stream.

For each break in data/breaks.json, the loop plays a program clip (assets/program-<break-id>.mp4, or a title card until that file exists), 
then a one-second "AD BREAK" marker. The marker is signaled in HLS with #EXT-X-CUE-OUT 
as a legacy ad-break cue and an #EXT-X-DATERANGE that carries the break ID plus planned duration/SCTE-35-related metadata; 
downstream ad or playback logic may use the DATERANGE to identify and time the break.


POC shortcut: rather than carry the break's full duration in the stream, the player pauses the stream for
the break (see LiveLoop.pause) and resumes it when its ads finish, so the program returns right away."""
import bisect, datetime as dt, itertools, math, os, subprocess, textwrap, time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).parent
HLS_DIR = ROOT / "media" / "hls"
PLACEHOLDER_SECONDS = 10
PLAYLIST_WINDOW = 8  # segments per live playlist; each is one second
FONT = next((f for f in ("/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
             if os.path.exists(f)), None)


@lru_cache(maxsize=None)
def ffprobe(path, entries="format=duration"):
    return subprocess.run(["ffprobe", "-v", "error", "-show_entries", entries, "-of", "csv=p=0", str(ROOT / path)],
                          capture_output=True, text=True).stdout


def duration(path):
    """Seconds of media at path, relative to the project root. 0 if the file is missing."""
    try:
        return float(ffprobe(str(path)))
    except ValueError:
        return 0.0


@dataclass
class Segment:
    uri: str
    seconds: float
    piece: int                    # which program clip or slate of the loop this belongs to
    starts_piece: bool            # each piece is encoded separately, so it starts with a discontinuity
    cue_in: bool = False          # first segment of a program: the previous break is over
    cue_out: dict | None = None   # the break marker: the break from breaks.json that starts here


def encode(name, seconds, source=None, card=""):
    """Encode one piece into 1-second HLS segments in media/hls/<name>/, unless that is already done.
    A source video is scaled to 720p; without one, a title card showing `card` runs for `seconds`."""
    out = HLS_DIR / name
    playlist = out / "index.m3u8"
    if playlist.exists() and (not source or playlist.stat().st_mtime > source.stat().st_mtime):
        return playlist
    out.mkdir(parents=True, exist_ok=True)
    video = "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p"
    silence = ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
    if source:
        has_audio = "audio" in ffprobe(str(source), "stream=codec_type")
        inputs = ["-i", str(source), *silence, "-map", "0:v:0", "-map", "0:a:0" if has_audio else "1:a",
                  "-t", str(duration(source))]
    else:
        (out / "card.txt").write_text(card)
        inputs = ["-f", "lavfi", "-i", f"color=c=0x14141c:s=1280x720:r=30:d={seconds}", *silence, "-t", str(seconds)]
        if FONT:
            video += f",drawtext=fontfile={FONT}:textfile={out / 'card.txt'}:fontcolor=white:fontsize=40:line_spacing=12:x=80:y=(h-text_h)/2"
    subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-vf", video,
                    "-c:v", "libx264", "-preset", "veryfast", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0",
                    "-c:a", "aac", "-ar", "48000", "-ac", "2", "-f", "hls", "-hls_time", "1", "-hls_playlist_type", "vod",
                    "-hls_segment_filename", str(out / "%03d.ts"), str(playlist)], check=True)
    return playlist


def read_segments(playlist):
    """(file name, seconds) for each segment in an HLS playlist."""
    lines = playlist.read_text().splitlines()
    return [(lines[i + 1], float(line[len("#EXTINF:"):].rstrip(","))) for i, line in enumerate(lines)
            if line.startswith("#EXTINF:")]


def build(breaks):
    """Encode a program clip and a break marker for every break. Returns one loop of the channel as segments."""
    segments = []
    for brk in breaks:
        clip = ROOT / "assets" / f"program-{brk['id']}.mp4"
        program = encode(f"program-{brk['id']}", PLACEHOLDER_SECONDS, clip if clip.exists() else None,
                         card=f"PROGRAM ({brk['content_rating']}): {brk['id']}\n\n" + textwrap.fill(brk["preceding_context"], 52))
        marker = encode(f"break-{brk['id']}", 1, card="AD BREAK")
        for playlist, is_break in ((program, False), (marker, True)):
            piece = segments[-1].piece + 1 if segments else 0
            for i, (name, seconds) in enumerate(read_segments(playlist)):
                segments.append(Segment(f"media/hls/{playlist.parent.name}/{name}", seconds, piece, starts_piece=i == 0,
                                        cue_in=i == 0 and not is_break, cue_out=brk if i == 0 and is_break else None))
    return segments


class LiveLoop:
    """Repeats one loop of segments as a live stream. Stream time runs with the wall clock except while paused
    for an ad break, so after a break the program continues where it left off. One viewer at a time (POC)."""

    def __init__(self, segments):
        self.segments = segments
        self.offsets = list(itertools.accumulate((s.seconds for s in segments), initial=0))  # last one is the loop length
        self.pieces = segments[-1].piece + 1
        self.started, self.paused_at, self.paused_seconds = time.time(), None, 0.0

    def pause(self):
        self.paused_at = self.paused_at or time.time()

    def resume(self):
        if self.paused_at:
            self.paused_seconds += time.time() - self.paused_at
            self.paused_at = None

    def stream_seconds(self):
        """How far the channel has played since the server started, not counting ad breaks."""
        return (self.paused_at or time.time()) - self.started - self.paused_seconds

    def playlist(self):
        n, loop_seconds = len(self.segments), self.offsets[-1]
        loops, into_loop = divmod(self.stream_seconds(), loop_seconds)
        live_edge = int(loops) * n + bisect.bisect_right(self.offsets, into_loop) - 1  # segments count up forever
        first = max(0, live_edge - PLAYLIST_WINDOW + 1)
        lines = ["#EXTM3U", "#EXT-X-VERSION:6",
                 f"#EXT-X-TARGETDURATION:{math.ceil(max(s.seconds for s in self.segments))}",
                 f"#EXT-X-MEDIA-SEQUENCE:{first}",
                 f"#EXT-X-DISCONTINUITY-SEQUENCE:{first // n * self.pieces + self.segments[first % n].piece}"]
        for i in range(first, live_edge + 1):
            loop, k = divmod(i, n)
            seg = self.segments[k]
            # Program date-time is stream time, so it never jumps when a break pauses the stream.
            starts_at = dt.datetime.fromtimestamp(self.started + loop * loop_seconds + self.offsets[k], dt.timezone.utc)
            starts_at = starts_at.isoformat(timespec="milliseconds")
            if seg.starts_piece and i > first:
                lines.append("#EXT-X-DISCONTINUITY")
            if seg.cue_in and i > 0:
                lines.append("#EXT-X-CUE-IN")
            if seg.cue_out:
                brk = seg.cue_out
                lines += [f"#EXT-X-CUE-OUT:{brk['duration_seconds']}",
                          f'#EXT-X-DATERANGE:ID="{brk["id"]}-{loop}",CLASS="ad-break",START-DATE="{starts_at}",'
                          f'PLANNED-DURATION={brk["duration_seconds"]},X-BREAK-ID="{brk["id"]}"']
            lines += [f"#EXT-X-PROGRAM-DATE-TIME:{starts_at}", f"#EXTINF:{seg.seconds:.3f},", seg.uri]
        return "\n".join(lines) + "\n"
