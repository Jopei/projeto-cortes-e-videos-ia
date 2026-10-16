"""Dispara a analise dos uploads da demo e espera terminar."""
import sys, os, time, json
sys.path.insert(0, os.path.dirname(__file__))
from common import Client
c = Client("ana.demo")
jobs = []
for m in c.call("GET", "/api/media-assets")[1]:
    st, j = c.call("POST", f"/api/media-assets/{m['id']}/analyze", {"preset": "action" if "sintel" in m["filename"] or "mares" in m["filename"] else "suspense", "params": {"max_clips": 4, "burn_subtitles": False}})
    print(m["filename"], st, j if st >= 300 else j["status"]); 
    if st < 300: jobs.append(j["id"])
t = time.time()
while time.time() - t < 900:
    js = [c.call("GET", f"/api/jobs/{i}")[1] for i in jobs]
    print([(j["status"], j["progress"], j.get("stage")) for j in js], flush=True)
    if all(j["status"] in ("done", "failed", "canceled") for j in js): break
    time.sleep(10)
for j in js: print(j["status"], j.get("error"))
