# Specification: release 1

What release 1 must do. Each requirement has an ID so tests and pull requests can cite it. Open questions are marked as such and get resolved by a decision record in `decisions/`.

Release 1 uses server-guided ad insertion (SGAI): the server marks the break in the playlist as an HLS Interstitial, and the player fetches and plays the ads itself. Nothing is stitched into the stream, so there are no stitching events, and quartile events (proof of viewing) are out of scope.

## Trace events

The names below are this project's trace events, defined in `packages/contracts`. They are not SCTE-35 terms. SCTE-35 only signals where a break starts and ends; everything after that is ours to name and measure.

### The deadline chain

One ad break passes through eight hops, in this order (the `Hop` enum). Each has one authoritative recorder (`authoritativeRecorder`).

1. `cue_observed` (mapper): the mapper has read and accepted an SCTE-35 cue for a new break in the source playlist. Generation may start here.
2. `manifest_published` (mapper): the mapper first serves a playlist revision that contains the break's interstitial.
3. `manifest_loaded` (player): the player has loaded a playlist and discovered the break's interstitial in it. This is discovery of that specific interstitial, not any playlist load. The gap after `manifest_published` is the player's reload interval, and it counts against the deadline.
4. `asset_list_requested` (player): the player requests the interstitial's asset list (the `X-ASSET-LIST` URL). The player decides when; the server cannot.
5. `asset_list_answered` (decision service): the decision service has finished writing its response. This is a service-side mark. The player may record a secondary mark when it receives the response.
6. `break_reached` (player): the playhead reaches the interstitial's START-DATE. This is the playback deadline, observed directly.
7. `first_ad_frame` (player): the player decodes the first frame of the first ad.
8. `primary_resumed` (player): the player returns to the program.

- CHAIN-1: Every hop is recorded as a `HopMark` with the hop, the recorder, and the time in the recorder's clock.
- CHAIN-2: The authoritative recorder's mark defines the hop. Another component may record a secondary mark for the same hop, with its own `recordedBy`; secondary marks are used to compare clocks (CLOCK-2), never to replace the authoritative mark. The decision service always records a secondary `asset_list_requested` when the request arrives.

### Creative readiness

Making a generated creative ready runs beside the chain, in the decision service, which runs the Generator. Its stages are the `CreativeStage` enum, recorded as `CreativeMark`s.

- READY-1: Generation, packaging, and checks each have a start mark and exactly one end mark, so each duration is measured separately, including for a stage that fails: `generation_started` to `generation_finished` or `generation_failed`, `packaging_started` to `packaging_finished` or `packaging_failed`, and `checks_started` to `checks_passed` or `checks_failed`. A failed stage's end mark carries the reason in `detail`.
- READY-2: `creative_ready` means validated and retrievable: the checks passed, the packaged HLS creative is stored at the URL the asset list will give the player, and the decision service has fetched that URL back successfully. Generated, or packaged but unchecked, is not ready.
- READY-3: Any failure ends with `creative_failed`, with the reason in `detail`. When a stage failed, its `*_failed` mark comes first, so the failed stage is a recorded fact, not text to parse. The break then gets the advertiser's pre-approved creative (DEC-4).
- READY-4: Missing the break doesn't stop a creative. Every stage runs to its end mark even after the asset list is answered, so stage durations are measured in full rather than cut off at the deadline. A miss is not a failure and gets no mark of its own: it shows as `creative_ready` after the decision service's secondary `asset_list_requested` (CLOCK-3). The finished creative stays stored at its URL (READY-2).
- READY-5: Each stage has a timeout, set in config, for calls that hang. A stage that hits it ends with its `*_failed` mark, `detail: "timeout"`, then `creative_failed`. The timeout bounds stuck work; it is not the break deadline.
- READY-6: Release 1 never plays a creative in a break other than the one it was made for. Reusing a stored creative in a later break needs a cache key, an expiry, and a fresh eligibility check, which changes DEC-4, so it waits for its own decision record.

### Correlation

- CORR-1: Every mark carries `breakId`, our identifier, which is stable for a break and loop iteration (MAP-2). These fields are optional, recorded whenever they exist:
  - `spliceEventId`: from a `splice_insert()` command, when the cue has one.
  - `segmentationEventId`: from a segmentation descriptor, when the cue has one. A cue may have either, both, or neither.
  - `mediaSequence`: the playlist's `EXT-X-MEDIA-SEQUENCE`, which says which segments it covers.
  - `playlistRevision`: our counter for the served playlist's content. It changes whenever the content changes, including when an interstitial is added without any new segment, so it can change while `mediaSequence` stays the same.
  - `programDateTimeMs`: the event's position on the media timeline, when it has one.
- CORR-2: Fields that can't exist yet are left out, not invented. A rejected cue has no `breakId` (MAP-6).

## Clocks and deadlines

- CLOCK-1: There are two kinds of time. Wall-clock time (`atMs`) is when something happened, in the clock of the component that recorded it: the mapper, the decision service, or the player. Media time (`programDateTimeMs`) is a position in the stream, from `EXT-X-PROGRAM-DATE-TIME`. Durations are only computed between marks in the same clock domain, unless CLOCK-2 applies.
- CLOCK-2: To compare marks across components, estimate each clock's offset from paired marks of the same hop: the player's and the decision service's marks for `asset_list_requested` and `asset_list_answered` bracket one round trip. Release 1 runs every component on one machine, so the offsets should be near zero; the benchmark reports them anyway, so the method is proven before it matters.
- CLOCK-3: How the deadline maps to playback. The cue gives the splice point as a presentation timestamp (PTS). The mapper converts it to program date-time, using the segment that contains it, and publishes that as the interstitial's START-DATE (`BreakSchedule.spliceProgramDateTimeMs`). Each player reaches that point later than the live edge, by however far it plays behind live. So there are two deadlines, and the benchmark reports both:
  - The readiness deadline: a creative must be ready (READY-2) before the player asks for the asset list. Measured within the decision service's clock: `creative_ready` against its secondary `asset_list_requested`.
  - The playback deadline: `break_reached`, when this player actually needs the ad. Slack is measured from `asset_list_answered` to `break_reached`, after the clock offset in CLOCK-2.
- CLOCK-4: A generated creative meets the deadline only if it met the readiness deadline. The playback slack shows how much more time a different player request timing could have given it.

## Cue source

- CUE-1: Cue traces are deterministic: the same VOD source and the same SCTE-35 sidecar produce the same breaks at the same offsets every run. x9k3 loops the VOD as live (see `decisions/0002-cue-source.md`).
- CUE-2: Each trace sets the cue lead time, the time from cue to splice point. The default is 4 seconds, the commonly recommended minimum. Traces with longer and shorter lead times test the edges.

## Mapper

- MAP-1: For each accepted cue-out, publish one HLS Interstitial (`EXT-X-DATERANGE`, `CLASS="com.apple.hls.interstitial"`) whose START-DATE is the splice point's program date-time (CLOCK-3), with an `X-ASSET-LIST` URL that points at the decision service.
- MAP-2: The interstitial ID is stable for a given break and loop iteration, so a playlist reload never creates a second break.
- MAP-3: One rendition only in release 1.
- MAP-4: Resume policy: open question. The candidates are resuming at the live edge, or at the point the break started. Decide this after the interstitial spike.
- MAP-5: If the decision service is unreachable, the break still appears in the playlist; the player's fallback behavior is then measured and recorded, not hidden.
- MAP-6: A cue that can't become a break is recorded as a `CueRejectedMark`, with a reason, a SHA-256 of the raw cue so it can be found again, and any ids it had.

## Decision service

- DEC-1: Answers the asset-list request with an HLS Interstitials asset list whose ads fit the break's duration.
- DEC-2: Eligibility rules (flight dates, daypart, frequency cap, audience rules) are deterministic code, ported from the baseline with the same results.
- DEC-3: Brand safety and contextual fit come from a Judge. Judge implementations: replay (the default, from recorded responses), Jev, and any Jev-compatible server set by `JEV_URL`.
- DEC-4: Safety blocks an advertiser when it is false or below its threshold. Fit decides the creative: a confident strong fit uses a generated creative only if it is ready (READY-2) when the asset list is answered; otherwise the advertiser's pre-approved creative plays. The house ad closes the break.
- DEC-5: Every decision is logged with its judgments, probabilities, thresholds, route, and the marks it recorded.

## Generator

- GEN-1: Generation starts at `cue_observed`, keyed by advertiser, viewer segment, and content category, as in the baseline.
- GEN-2: Generator implementations: a stub with an injected delay (the default; it returns a prepackaged creative after N milliseconds), and fal.
- GEN-3: Every generated creative goes through the stages in READY-1 to READY-3, including the stub's.

## Benchmark

- BENCH-1: Runs a set of cue traces through the full chain with a headless hls.js player and reports each hop-to-hop duration, each creative stage, and the end-to-end total, at p50, p95, and p99.
- BENCH-2: Runs cold (empty creative cache) and warm (cache primed), and sweeps the stub's injected delay to find where generated creatives stop meeting the readiness deadline.
- BENCH-3: Records every failure, rejected cue, stall, and retry in a trace file that ships with the results, along with the clock offsets from CLOCK-2.
- BENCH-4: The default run needs no API keys and costs nothing.

## Behavior carried over from the baseline

- BASE-1: For the 20 labeled scenarios in `baseline/data/scenarios.json`, the new decision logic produces the same route, brand-safety result, and fit as the baseline, given the same Judge responses. The characterization tests enforce this.
