"""Cria uma serie IA de demonstracao (provedores de TESTE) e leva ep.1 a 'Aprovar video' e ep.2 a 'Aprovar roteiro'."""
import sys, os, time, json, subprocess, datetime, zoneinfo
sys.path.insert(0, os.path.dirname(__file__))
from common import Client
D = os.environ["DEMO_DIR"]; ids = json.load(open(f"{D}/ids.json"))
c = Client("ana.demo")
def wait(fn, what, timeout=400, every=3):
    t = time.time()
    while time.time() - t < timeout:
        v = fn()
        if v: return v
        time.sleep(every)
    raise SystemExit("TIMEOUT " + what)
def tick():
    subprocess.run(["docker", "compose", "exec", "-T", "api", "python", "-c", "from app.worker.story.tasks import series_tick; print(series_tick())"], cwd="/home/joaom/projetos/projetos_cortes", check=True)
premise = "Uma faroleira solitária descobre mensagens em garrafas chegando pelo mar, cada noite mais perto de revelar o que aconteceu com seu irmão desaparecido."
st, s = c.call("POST", "/api/series", {"premise": premise, "genre": "mistério", "tone": "intimista", "channel_id": ids["ch"][2], "visual_strategy": "hybrid", "max_video_scenes_per_episode": 1, "video_provider": "fake_video", "image_provider": "fake_image", "tts_provider": "fake_tts", "tts_voice_id": "fake_voice_f", "publish_time": "18:00", "originality_attestation": True, "timezone": "America/Sao_Paulo", "monetization_allowed": True})
print("create", st, s if st >= 300 else s["status"]); sid = s["id"]
json.dump(sid, open(f"{D}/series_id.json", "w"))
s = wait(lambda: (lambda d: d if d["status"] in ("planned", "plan_failed") else None)(c.call("GET", f"/api/series/{sid}")[1]), "plan")
print("plan", s["status"], s.get("error")); assert s["status"] == "planned"
today = datetime.datetime.now(zoneinfo.ZoneInfo("America/Sao_Paulo")).date()
st, r = c.call("POST", f"/api/series/{sid}/start", {"start_date": (today + datetime.timedelta(days=s["lead_days"])).isoformat()}); print("start", st)
ep = lambda n: c.call("GET", f"/api/series/{sid}/episodes/{n}")[1]
for i in range(8):
    tick(); time.sleep(5)
    print([ (n, ep(n)["status"]) for n in (1, 2, 3)])
    if ep(1)["status"] == "awaiting_script_approval" and ep(2)["status"] in ("awaiting_script_approval",): break
print(c.call("POST", f"/api/series/{sid}/episodes/1/approve-script")[0])
e = wait(lambda: (lambda d: d if d["status"] in ("pending_review", "needs_attention") else None)(ep(1)), "media1"); print("ep1", e["status"], e.get("error"))
print([(n, ep(n)["status"]) for n in (1, 2, 3)])
