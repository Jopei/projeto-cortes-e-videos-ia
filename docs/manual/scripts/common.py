"""Helpers HTTP (host). Senha da demo vem da env DEMO_PW (nunca gravada)."""
import json, os, base64, urllib.request, urllib.error, http.cookiejar
API = "http://localhost:18000"; TUS = "http://localhost:11080/files/"
class Client:
    def __init__(self, username):
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        st, _ = self.call("POST", "/api/auth/login", {"username": username, "password": os.environ["DEMO_PW"]})
        assert st == 200, st
    def call(self, m, p, b=None, headers=None):
        h = {"Content-Type": "application/json"}; h.update(headers or {})
        req = urllib.request.Request(API + p, data=json.dumps(b).encode() if b is not None else None, method=m, headers=h)
        try:
            r = self.op.open(req, timeout=120); raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read()
            try: return e.code, json.loads(raw)
            except Exception: return e.code, raw[:300]
    @property
    def cookie(self):
        return "; ".join(f"{c.name}={c.value}" for c in self.jar)
    def tus_upload(self, path, source_id, channel_id=None, name=None):
        data = open(path, "rb").read(); name = name or os.path.basename(path)
        md = {"filename": name, "filetype": "video/mp4", "source_id": source_id}
        if channel_id: md["channel_id"] = channel_id
        mdh = ",".join(f"{k} {base64.b64encode(v.encode()).decode()}" for k, v in md.items())
        req = urllib.request.Request(TUS, method="POST", headers={"Tus-Resumable": "1.0.0", "Upload-Length": str(len(data)), "Upload-Metadata": mdh, "Cookie": self.cookie, "Content-Length": "0"})
        r = urllib.request.urlopen(req, timeout=60); loc = r.headers["Location"]
        if loc.startswith("/"): loc = "http://localhost:11080" + loc
        req = urllib.request.Request(loc, data=data, method="PATCH", headers={"Tus-Resumable": "1.0.0", "Upload-Offset": "0", "Content-Type": "application/offset+octet-stream", "Cookie": self.cookie})
        r = urllib.request.urlopen(req, timeout=300); return r.status
