#!/usr/bin/env python3
"""Assemble ../index.html from the pieces in this directory + data.json.

The page is head.html + body.html + app.js with two substitutions:
  __DATA__      in app.js  -> the entire data.json object (the engine's D block)
  {{token}}     in body.html -> data.json["prose"][token]  (numbers quoted in prose,
                filled at build time so the words can never drift from the data)

Also rebuilds shim.js (the headless test harness) so `node src/shim.js` always
tests the same bytes the page ships.
"""
import json, pathlib, sys
SRC = pathlib.Path(__file__).parent
data = json.loads((SRC/"data.json").read_text())
body = (SRC/"body.html").read_text()
for k, v in data.get("prose", {}).items():
    # ⚠ A null TOKEN IS A FAILURE, NOT A VALUE. An ABSENT key correctly trips the assert below,
    # but a key present and null passed straight through as the string "None" — publishing
    # "Today's fast track — None since July 2026" and "at None minutes", with the build exiting 0
    # and the harness green. A SQL aggregate over an empty window returns None, so this is the
    # ordinary failure of a narrow window, not an exotic one.
    if v is None:
        raise SystemExit(f"prose token {k!r} is null — the pipeline could not measure it; "
                         "publishing would print 'None' in a sentence")
    body = body.replace("{{%s}}" % k, str(v))
assert "{{" not in body, "unfilled token in body.html: " + body[body.index("{{"):body.index("{{")+40]
# ⚠ AND NOTHING MAY CLOSE THE SCRIPT TAG. app.js is inlined into the page, so a "</script>"
# anywhere in data.json — a chief complaint is operator-typed free text — ends the block early
# and the browser executes a fraction of the file: static prose, no lab, no error. The harness
# cannot see it BY CONSTRUCTION, because shim.js is built by stripping those very tags.
_blob = json.dumps(data)
if "</script" in _blob.lower():
    raise SystemExit("data.json contains a closing script tag — it would truncate the page")
app = (SRC/"app.js").read_text().replace("__DATA__", json.dumps(data), 1)
# ⚠ app.js CARRIES {{tokens}} TOO, AND THEY SHIPPED RAW. Substitution ran on body.html only, and
# the assert above checks only body.html — so `{{docqm}}` and `{{docmin}}` in a control's hint text
# went out as literal markup on the live page, justifying the largest term in the score with
# broken text. Substitute everywhere, and assert on what is actually WRITTEN.
for k, v in data.get("prose", {}).items():
    app = app.replace("{{%s}}" % k, str(v))
page = (SRC/"head.html").read_text() + body + app
if "{{" in page:
    raise SystemExit("unfilled token in the built page: " + page[page.index("{{"):page.index("{{")+40])
(SRC.parent/"index.html").write_text(page)
shim = (SRC/"shim_head.js").read_text() + app + (SRC/"shim_tail.js").read_text()
shim = shim.replace("<script>", "").replace("</script>", "")
(SRC/"shim.js").write_text(shim)
print("built index.html (%d bytes) + shim.js" % (SRC.parent/"index.html").stat().st_size)
