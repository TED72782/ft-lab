#!/usr/bin/env python3
"""Local shared leaderboard for the Fast Track Chair Lab.

Serves index.html AND a tiny shared board from this machine, so everyone in the room sees the
same list. Local network only — it binds to your LAN address, not the internet.

    python3 serve_board.py            # then share the http://... line it prints

⚠ WHY THIS SERVES THE PAGE TOO, rather than just the board: the GitHub Pages copy is HTTPS, and
a browser will not let an HTTPS page call an http:// endpoint. Serving both from here keeps them
on the same origin, which sidesteps that without any tunnel — and without exposing this machine
to the internet, which matters on a laptop that holds clinical data.

The board lives in board.json next to this file. Delete it to reset.
"""
import json, os, threading, socket, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).parent
BOARD = HERE / "board.json"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
MAX_ENTRIES = 500


def read():
    try:
        return json.loads(BOARD.read_text())
    except Exception:
        return []


_WRITE_LOCK = threading.Lock()


def _atomic_write(rows):
    """Write via a temp file and os.replace.

    ⚠ write_text TRUNCATES FIRST. Interrupt it — Ctrl-C, sleep, a full disk — and board.json is
    half a JSON document, which read()'s bare except turns into an empty board: every layout in
    the room vanishes with no message anywhere, and the next successful post makes the loss
    permanent. os.replace is atomic on POSIX, so a reader sees either the old board or the new
    one and never a torn one.
    """
    tmp = BOARD.with_suffix(".tmp")
    tmp.write_text(json.dumps(rows, indent=1))
    os.replace(tmp, BOARD)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(HERE), **kw)

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/board":
            return self._json(read())
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/board":
            return self.send_error(404)
        try:
            n = int(self.headers.get("Content-Length", 0))
            if n > 4096:                                   # a lane is ~100 bytes
                return self.send_error(413)
            e = json.loads(self.rfile.read(n))
            # Accept only the shape the page sends. Anything else is ignored rather than stored —
            # this is on a shared network, and the board should not become an echo of whatever
            # gets posted at it.
            #
            # ⚠ EVERY FIELD THE PAGE SENDS MUST BE STORED — the same rule the Apps Script backend
            # carries at the top of shared-board.gs, and this file was the copy that still broke
            # it. Keeping only the first six keys dropped `cc`, `start` and `len`, so a lane saved
            # from narrowed criteria or a moved window came back off this board as an
            # everyone-15:00-23:00 lane: ranked against a configuration nobody chose, and not
            # reproducible by its own load button. Adding a control to the page means adding a
            # key here.
            cfg_in = e.get("cfg") or {}
            entry = {"who": str(e.get("who", ""))[:28],
                     "cfg": {k: cfg_in.get(k) for k in
                             ("mode", "A", "R", "cyc", "assess", "fastDischarge",
                              "cc", "start", "len", "bedcc", "bedExtra", "bedIntp",
                              "bedGrp", "turnRoom", "turnChair", "roomsA", "assessNo")},
                     "at": int(e.get("at", 0))}
            # 'rooms'/'zone' retired with the four-mode UI; shared-board.gs already rejects them
            if not entry["who"] or entry["cfg"]["mode"] not in ("split", "pooled", "bedfirst", "stream"):
                return self.send_error(400)

            # One row per person per distinct lane. A row written before this file stored the
            # window ran the original 15:00-23:00 lane, which is how the page reads it back — so
            # compare on that basis, or re-adding an old lane appends a twin instead of
            # refreshing it.
            def lane(c):
                c = c or {}
                return {k: c.get(k) for k in ("mode", "A", "R", "cyc", "assess", "fastDischarge")} | {
                    "cc": c.get("cc") or "",
                    "start": 15 if c.get("start") in (None, "") else c.get("start"),
                    "len": 8 if c.get("len") in (None, "") else c.get("len"),
                    "bedcc": c.get("bedcc"), "bedExtra": c.get("bedExtra"),
                    "bedIntp": c.get("bedIntp"), "bedGrp": c.get("bedGrp"),
                    "turnRoom": c.get("turnRoom"), "turnChair": c.get("turnChair"),
                    "roomsA": c.get("roomsA"), "assessNo": c.get("assessNo"),
                    "loadPct": c.get("loadPct"), "docs": c.get("docs")}
            here = lane(entry["cfg"])
            # ⚠ ONE WRITER AT A TIME. ThreadingHTTPServer runs handlers concurrently and this
            # read-modify-write was unguarded, so two physicians adding at the same moment left
            # ONE lane on the board — reproducibly, 6 runs out of 6. Worse than silent: the
            # response is built from the in-memory list, which contains the losing poster's row,
            # so their page shows their lane ranked and it is simply not in the file. It
            # disappears on the next reload with no error. "Everyone add yours now" is exactly
            # how this gets used in a room. shared-board.gs already takes a LockService lock for
            # this reason; this file had no equivalent.
            with _WRITE_LOCK:
              board = [x for x in read()
                       if not (x.get("who") == entry["who"] and lane(x.get("cfg")) == here)]
              board.append(entry)
              _atomic_write(board[-MAX_ENTRIES:])
            return self._json(board)
        except Exception:
            return self.send_error(400)

    def log_message(self, *a):
        pass                                                # keep the console readable


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))                          # no packet is sent; picks the route
        return s.getsockname()[0]
    finally:
        s.close()


if __name__ == "__main__":
    ip = lan_ip()
    print(f"\n  Fast Track Chair Lab — shared board is up.\n")
    print(f"    On this machine   http://localhost:{PORT}/")
    print(f"    Share in the room http://{ip}:{PORT}/\n")
    print(f"  Board file: {BOARD}")
    print(f"  Local network only. Ctrl-C to stop.\n")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
