#!/usr/bin/env python3
"""Serves the player page, The Network's live stream, and the decision API.
Run: python3 app.py, then open http://localhost:8000"""
import json, os, posixpath, urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import stream
from decisioning import BREAKS, ROOT, decide, jobs

PUBLIC = ("/data/", "/assets/", "/media/")  # plus the page itself; never .env or source code


class Handler(SimpleHTTPRequestHandler):
    live = None  # the LiveLoop, set at startup

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path):
        clean = posixpath.normpath(urllib.parse.unquote(path.split("?")[0]))
        public = clean in ("/", "/index.html") or clean.startswith(PUBLIC)
        return super().translate_path(clean) if public else str(ROOT / "not-public")

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == "/live.m3u8":
            return self.reply(self.live.playlist(), "application/vnd.apple.mpegurl")
        if url.path == "/job":  # a custom ad being generated: its state and fal call, polled by the player
            src = urllib.parse.parse_qs(url.query).get("src", [""])[0]
            return self.reply(json.dumps(jobs.get(src, {})), "application/json")
        super().do_GET()

    def do_POST(self):
        if self.path == "/decide":  # an ad break has started: hold the program until the player resumes it
            self.live.pause()
            request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            result = decide(request["break_id"], request["viewer_id"], allow_generation=request.get("generate", False))
            return self.reply(json.dumps(result), "application/json")
        if self.path == "/pause":  # the player froze playback
            self.live.pause()
            return self.reply("{}", "application/json")
        if self.path == "/resume":  # the player finished the break's ads, or unfroze
            self.live.resume()
            return self.reply("{}", "application/json")
        self.send_error(404)

    def reply(self, body, content_type):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print("Encoding The Network's stream (the first run takes a minute)...")
    Handler.live = stream.LiveLoop(stream.build(BREAKS.values()))
    port = int(os.environ.get("PORT", "8000"))
    print(f"Live at http://localhost:{port} (the loop is {Handler.live.offsets[-1]:.0f} seconds)")
    ThreadingHTTPServer(("", port), Handler).serve_forever()
