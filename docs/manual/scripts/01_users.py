"""Cria 2 usuarios ficticios de demonstracao (rodar dentro do container api).
Uso: docker compose exec -T -e DEMO_PW=... api python - < 01_users.py"""
import json, os, urllib.request, http.cookiejar
BASE="http://localhost:8000"; jar=http.cookiejar.CookieJar(); op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def call(m,p,b=None):
    req=urllib.request.Request(BASE+p,data=json.dumps(b).encode() if b is not None else None,method=m,headers={"Content-Type":"application/json"})
    try:
        r=op.open(req,timeout=60); raw=r.read(); return r.status,(json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e: return e.code,e.read()[:300]
print(call("POST","/api/auth/login",{"username":os.environ["ADMIN_USERNAME"],"password":os.environ["ADMIN_PASSWORD"]})[0])
pw=os.environ["DEMO_PW"]
print(call("POST","/api/admin/users",{"username":"ana.demo","password":pw,"display_name":"Ana Demo","is_admin":True,"must_change_password":False})[0])
print(call("POST","/api/admin/users",{"username":"bruno.demo","password":pw,"display_name":"Bruno Demo","is_admin":False,"must_change_password":False,"storage_quota_gb":20,"daily_analysis_quota":5,"max_channels":2})[0])
