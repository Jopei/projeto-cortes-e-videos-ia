"""Aprova/rejeita cortes, ajusta metadados e cria publicacoes (exportada, agendada, bloqueada) na demo."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from common import Client
D = os.environ["DEMO_DIR"]; ids = json.load(open(f"{D}/ids.json"))
c = Client("ana.demo")
assets = {m["id"]: m["filename"] for m in c.call("GET", "/api/media-assets")[1]}
clips = [x for x in c.call("GET", "/api/clips")[1] if x.get("media_asset_id")]
by = {}
for x in sorted(clips, key=lambda x: -(x["score"] or 0)): by.setdefault(assets[x["media_asset_id"]], []).append(x)
for k, v in by.items(): print(k, len(v), [round(x["score"] or 0, 2) for x in v])
accs = {a["display_name"]: a["id"] for a in c.call("GET", "/api/accounts")[1]}
st, a = c.call("POST", "/api/accounts", {"platform": "tiktok", "display_name": "@acaoem60s (TikTok)", "mode": "oauth", "channel_id": ids["ch"][1], "daily_limit": 2, "posting_windows": [{"days": [0, 1, 2, 3, 4, 5, 6], "start": "18:00", "end": "21:00"}]}); print("oauth acc", st)
accs["@acaoem60s (TikTok)"] = a["id"]
def approve(x): print("approve", c.call("PATCH", f"/api/clips/{x['id']}", {"status": "approved"})[0])
def reject(x): print("reject", c.call("PATCH", f"/api/clips/{x['id']}", {"status": "rejected"})[0])
S = by["sintel_trecho_720p.mp4"]; F = by["farol_trecho_720p.mp4"]; M = by["mares_do_sul_trecho.mp4"]; N = by["sombras_curta.mp4"]
for x in S[:3] + F[:2] + M[:2] + N[:2]: approve(x)
reject(S[3]); reject(F[3])
meta = {
 S[0]["id"]: {"youtube": ("A perseguição que ninguém esperava", "Os melhores segundos de Sintel em formato vertical. Trecho do curta aberto da Blender Foundation.", ["#Shorts", "#Animação", "#CurtaMetragem", "#Blender"])},
 S[1]["id"]: {"youtube": ("O encontro no desfiladeiro", "Mais um trecho de Sintel, o curta aberto da Blender Foundation.", ["#Shorts", "#Animação", "#Blender"])},
}
for cid, pl in meta.items():
    for p, (t, d, h) in pl.items(): print("meta", c.call("PUT", f"/api/clips/{cid}/metadata/{p}", {"title": t, "description": d, "hashtags": h})[0])
def batch(clips_, acc_names, sched="auto"):
    st, r = c.call("POST", "/api/publications/batch", {"clip_ids": [x["id"] for x in clips_], "account_ids": [accs[n] for n in acc_names], "schedule": sched})
    print("batch", st, json.dumps(r, ensure_ascii=False)[:300])
batch(S[:2], ["Ação em 60s (YouTube)", "Ação em 60s (Bilibili)"])
batch(S[2:3], ["@acaoem60s (TikTok)"])
batch(F[:2], ["Histórias de Farol (YouTube)"])
batch(M[:2], ["Ação em 60s (YouTube)", "Ação em 60s (Bilibili)"])
batch(N[:2], ["Mistérios Curtos (YouTube)", "@misterioscurtos"])
