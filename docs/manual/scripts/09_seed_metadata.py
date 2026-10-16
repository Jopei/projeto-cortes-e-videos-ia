"""Edita titulos/descricoes dos cortes pendentes (como um usuario faria) para a demo ficar legivel."""
import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from common import Client
c = Client("ana.demo")
assets = {m["id"]: m["filename"] for m in c.call("GET", "/api/media-assets")[1]}
T = {"sintel": ("Sintel: a busca pelo dragão", "Um trecho de Sintel, o curta aberto da Blender Foundation, em formato vertical.", ["#Shorts", "#Animação", "#Blender"]),
     "farol": ("O farol e o segredo do mar", "Cena de mistério à beira-mar, em 15 segundos.", ["#Shorts", "#Mistério", "#Farol"]),
     "mares": ("Mares do Sul: a travessia", "Trecho do documentário Mares do Sul.", ["#Shorts", "#Documentário", "#Mar"]),
     "sombras": ("Sombras: o corredor escuro", "Trecho do curta Sombras.", ["#Shorts", "#Suspense"])}
n = 0
for x in c.call("GET", "/api/clips")[1]:
    if not x.get("media_asset_id") or x["status"] != "pending_review": continue
    k = next(k for k in T if assets[x["media_asset_id"]].startswith(k)); t, d, h = T[k]; n += 1
    for p in ("youtube", "tiktok"):
        st, r = c.call("PUT", f"/api/clips/{x['id']}/metadata/{p}", {"title": f"{t} ({n})" if p == "youtube" else t, "description": d + "\n\nCréditos: ver licença da fonte.", "hashtags": h})
print("ok", n)
