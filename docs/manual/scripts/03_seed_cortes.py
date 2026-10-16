"""Popula canais, fontes, contas e uploads FICTICIOS para o usuario ana.demo. Rodar no host: DEMO_PW=... python3 03_seed_cortes.py"""
import sys, os, json, time
sys.path.insert(0, os.path.dirname(__file__))
from common import Client
D = os.environ["DEMO_DIR"]
c = Client("ana.demo")
def ok(t, r): print(t, r[0], "" if r[0] < 300 else r[1]); return r[1]
ch1 = ok("ch", c.call("POST", "/api/channels", {"name": "Mistérios Curtos", "slug": "misterios-curtos", "niche": "Mistério e suspense em cortes rápidos", "color": "#7c3aed", "default_preset": "suspense"}))
ch2 = ok("ch", c.call("POST", "/api/channels", {"name": "Ação em 60s", "slug": "acao-em-60s", "niche": "Cenas de ação e perseguição", "color": "#dc2626", "default_preset": "action"}))
ch3 = ok("ch", c.call("POST", "/api/channels", {"name": "Histórias de Farol", "slug": "historias-de-farol", "niche": "Dramas e histórias do mar", "color": "#0891b2", "default_preset": "drama"}))
def acc(p, n, ch, **k): return ok("acc", c.call("POST", "/api/accounts", {"platform": p, "display_name": n, "mode": "manual", "channel_id": ch["id"], **k}))
acc("youtube", "Mistérios Curtos (YouTube)", ch1); acc("tiktok", "@misterioscurtos", ch1)
acc("youtube", "Ação em 60s (YouTube)", ch2, monetized=True); acc("bilibili", "Ação em 60s (Bilibili)", ch2)
acc("youtube", "Histórias de Farol (YouTube)", ch3)
s1 = ok("src", c.call("POST", "/api/sources", {"title": "Sintel — Blender Foundation", "work_name": "Sintel", "license_type": "cc_by", "default_channel_id": ch2["id"], "proof_url": "https://durian.blender.org/sharing/", "allowed_platforms": ["youtube", "tiktok", "bilibili"], "monetization_allowed": True, "attribution_text": "Sintel © Blender Foundation | durian.blender.org (CC BY 3.0)"}))
s2 = ok("src", c.call("POST", "/api/sources", {"title": "A Viagem à Lua (1902)", "work_name": "A Viagem à Lua", "license_type": "public_domain", "default_channel_id": ch3["id"], "allowed_platforms": ["youtube", "tiktok"], "monetization_allowed": True, "attribution_text": "Georges Méliès, 1902 (domínio público)"}))
s3 = ok("src", c.call("POST", "/api/sources", {"title": "Documentário Mares do Sul (exemplo)", "work_name": "Mares do Sul", "license_type": "cc_by_nc", "default_channel_id": ch2["id"], "allowed_platforms": ["youtube", "bilibili"], "monetization_allowed": False, "attribution_text": "Mares do Sul, autor fictício (CC BY-NC)"}))
s4 = ok("src", c.call("POST", "/api/sources", {"title": "Curta Sombras (exemplo)", "work_name": "Sombras", "license_type": "cc_by_nd", "default_channel_id": ch1["id"], "allowed_platforms": ["youtube", "tiktok"], "monetization_allowed": False, "attribution_text": "Sombras, autor fictício (CC BY-ND)"}))
ups = [("sintel", s1, ch2), ("farol", s2, ch3), ("acao", s3, ch2), ("farol", s4, ch1)]
names = {"sintel": "sintel_trecho_720p.mp4", "farol": "farol_trecho_720p.mp4", "acao": "mares_do_sul_trecho.mp4"}
for i, (f, s, ch) in enumerate(ups):
    nm = names[f] if i != 3 else "sombras_curta.mp4"
    print("tus", nm, c.tus_upload(f"{D}/{f}.mp4", s["id"], ch["id"], nm))
time.sleep(3)
print(json.dumps([(m["id"], m.get("filename") or m.get("title")) for m in c.call("GET", "/api/media-assets")[1]]))
json.dump({"ch": [ch1["id"], ch2["id"], ch3["id"]], "src": [s1["id"], s2["id"], s3["id"], s4["id"]]}, open(f"{D}/ids.json", "w"))
