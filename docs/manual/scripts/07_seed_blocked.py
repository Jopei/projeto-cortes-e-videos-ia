"""Marca a conta YouTube de Acao como monetizada e cria publicacoes bloqueadas (CC BY-NC monetizado, plataforma nao permitida)."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from common import Client
c = Client("ana.demo")
accs = {a["display_name"]: a["id"] for a in c.call("GET", "/api/accounts")[1]}
print(c.call("PATCH", f"/api/accounts/{accs['Ação em 60s (YouTube)']}", {"monetized": True})[0])
assets = {m["id"]: m["filename"] for m in c.call("GET", "/api/media-assets")[1]}
M = [x for x in c.call("GET", "/api/clips")[1] if x.get("media_asset_id") and assets[x["media_asset_id"]].startswith("mares") and x["status"] == "pending_review"]
x = M[0]; print(c.call("PATCH", f"/api/clips/{x['id']}", {"status": "approved"})[0])
st, r = c.call("POST", "/api/publications/batch", {"clip_ids": [x["id"]], "account_ids": [accs["Ação em 60s (YouTube)"], accs["@acaoem60s (TikTok)"], accs["Ação em 60s (Bilibili)"]], "schedule": "auto"})
print(st, [(p["status"], p["platform"], p["block_reasons"]) for p in r["created"]])
