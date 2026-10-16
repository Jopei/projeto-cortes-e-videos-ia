"""Dados minimos do usuario comum ficticio bruno.demo (para ilustrar 'Ver como' e cotas)."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from common import Client
c = Client("bruno.demo")
st, ch = c.call("POST", "/api/channels", {"name": "Dicas Rápidas", "slug": "dicas-rapidas", "niche": "Dicas do dia a dia", "color": "#059669", "default_preset": "comedy"}); print(st)
print(c.call("POST", "/api/accounts", {"platform": "youtube", "display_name": "Dicas Rápidas (YouTube)", "mode": "manual", "channel_id": ch["id"]})[0])
print(c.call("POST", "/api/sources", {"title": "Vídeos próprios — Dicas Rápidas", "work_name": "Dicas Rápidas", "license_type": "own", "default_channel_id": ch["id"], "allowed_platforms": ["youtube"], "monetization_allowed": True, "attribution_text": "Dicas Rápidas"})[0])
