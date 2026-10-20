#!/usr/bin/env python3
"""Private, invitation-based annotation API. Python standard library + SQLite."""
import argparse
import hashlib
import json
import os
import re
import secrets
import sqlite3
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from contextlib import contextmanager

SCHEMA = """
CREATE TABLE IF NOT EXISTS contributors(
 id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, scope TEXT NOT NULL,
 created INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS invites(
 hash TEXT PRIMARY KEY, scope TEXT NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS annotations(
 contributor TEXT NOT NULL, post_id TEXT NOT NULL, user_id TEXT NOT NULL,
 handle TEXT NOT NULL, label TEXT, revision INTEGER NOT NULL, updated INTEGER NOT NULL,
 PRIMARY KEY(contributor, post_id));
CREATE INDEX IF NOT EXISTS author_idx ON annotations(user_id, updated);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT OR IGNORE INTO meta VALUES('revision',0);
"""
ID = re.compile(r"^\d{1,25}$")
HANDLE = re.compile(r"^[a-zA-Z0-9_]{1,15}$")
digest = lambda s: hashlib.sha256(s.encode()).hexdigest()
now = lambda: int(time.time())


class Store:
    def __init__(self, path):
        self.path = path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript(SCHEMA)
            db.execute("PRAGMA journal_mode=WAL")
        os.chmod(path, 0o600)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def invite(self, scope="contribute", hours=168):
        code = secrets.token_urlsafe(32)
        with self.connect() as db:
            db.execute("INSERT INTO invites VALUES(?,?,?,0)", (digest(code), scope, now()+hours*3600))
        return code

    def enroll(self, code):
        if not isinstance(code, str) or len(code) > 100:
            raise ValueError("邀请码无效")
        token, identity = secrets.token_urlsafe(32), secrets.token_hex(12)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            invite = db.execute("SELECT * FROM invites WHERE hash=? AND used=0 AND expires>?", (digest(code), now())).fetchone()
            if not invite:
                raise ValueError("邀请码已使用或已过期")
            db.execute("UPDATE invites SET used=1 WHERE hash=?", (digest(code),))
            db.execute("INSERT INTO contributors VALUES(?,?,?,?,0)", (identity, digest(token), invite["scope"], now()))
        return {"token": token, "scope": invite["scope"], "contributor": identity}

    def auth(self, token):
        if not isinstance(token, str) or not 30 <= len(token) <= 100:
            return None
        with self.connect() as db:
            r = db.execute("SELECT id,scope FROM contributors WHERE token_hash=? AND revoked=0", (digest(token),)).fetchone()
            return dict(r) if r else None

    def update(self, identity, data):
        if identity["scope"] != "contribute":
            raise PermissionError("此身份仅可订阅")
        post, user, handle = data.get("postId"), data.get("userId"), data.get("handle")
        revision, label = data.get("revision"), data.get("label")
        if not isinstance(post, str) or not ID.fullmatch(post) or not isinstance(user, str) or not ID.fullmatch(user):
            raise ValueError("缺少稳定的公开账号或帖子 ID")
        if not isinstance(handle, str) or not HANDLE.fullmatch(handle) or label not in ("ai", "human", None):
            raise ValueError("标注字段无效")
        if type(revision) is not int or not 1 <= revision <= 9007199254740991:
            raise ValueError("修订版本无效")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT * FROM annotations WHERE contributor=? AND post_id=?", (identity["id"], post)).fetchone()
            if previous and revision <= previous["revision"]:
                # Retries must not replace a newer edit or resurrect a withdrawal.
                return {"accepted": False, "revision": previous["revision"]}
            if previous and previous["user_id"] != user:
                raise ValueError("同一帖子不能更换作者")
            db.execute("INSERT OR REPLACE INTO annotations VALUES(?,?,?,?,?,?,?)",
                       (identity["id"], post, user, handle.lower(), label, revision, now()))
            db.execute("UPDATE meta SET value=value+1 WHERE key='revision'")
        return {"accepted": True, "revision": revision}

    def query(self, ids, exclude=None):
        if not isinstance(ids, list) or not 1 <= len(ids) <= 50 or any(not isinstance(v, str) or not ID.fullmatch(v) for v in ids):
            raise ValueError("每次查询 1–50 个公开账号 ID")
        result = []
        with self.connect() as db:
            revision = db.execute("SELECT value FROM meta WHERE key='revision'").fetchone()[0]
            for uid in dict.fromkeys(ids):
                # Never let one's own label masquerade as independent community support.
                where = """FROM annotations a JOIN contributors c ON c.id=a.contributor AND c.revoked=0
                    WHERE a.user_id=? AND a.label IS NOT NULL AND a.contributor!=?"""
                params = (uid, exclude or "")
                r = db.execute("""SELECT coalesce(sum(a.label='ai'),0) ai,
                    coalesce(sum(a.label='human'),0) human, count(distinct a.post_id) posts,
                    count(distinct a.contributor) contributors """ + where, params).fetchone()
                conflicts = db.execute("SELECT count(*) FROM (SELECT a.post_id " + where +
                    " GROUP BY a.post_id HAVING count(distinct a.label)>1)", params).fetchone()[0]
                result.append({"userId": uid, **dict(r), "conflictingPosts": conflicts})
        return {"revision": revision, "accounts": result, "asOf": now()*1000, "source": "community-manual-labels"}

    def revoke(self, identity):
        with self.connect() as db:
            db.execute("UPDATE contributors SET revoked=1 WHERE id=?", (identity,))
            db.execute("UPDATE meta SET value=value+1 WHERE key='revision'")

    def withdraw_all(self, identity):
        with self.connect() as db:
            db.execute("UPDATE annotations SET label=NULL,revision=revision+1,updated=? WHERE contributor=?", (now(), identity))
            db.execute("UPDATE meta SET value=value+1 WHERE key='revision'")
        return {"withdrawn": True}


def make_server(store, host="127.0.0.1", port=3258):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *_):
            pass  # No bearer tokens, browsing IDs or request bodies in access logs.

        def reply(self, status, value):
            body = json.dumps(value, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(body)
            self.close_connection = True

        def do_GET(self):
            if self.path == "/health":
                return self.reply(200, {"ok": True, "service": "qiaomu-x-community", "version": 1})
            self.reply(404, {"error": "未找到接口"})

        def do_POST(self):
            try:
                if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                    return self.reply(415, {"error": "只接受 JSON"})
                size = int(self.headers.get("Content-Length", "0"))
                if not 1 <= size <= 16384:
                    return self.reply(413, {"error": "请求超过大小限制"})
                self.connection.settimeout(10)
                data = json.loads(self.rfile.read(size))
                if not isinstance(data, dict):
                    raise ValueError("请求必须是对象")
                if self.path == "/v1/enroll":
                    return self.reply(200, store.enroll(data.get("invite")))
                auth = self.headers.get("Authorization", "")
                identity = store.auth(auth[7:] if auth.startswith("Bearer ") else "")
                if not identity:
                    return self.reply(401, {"error": "社区身份无效或已停用"})
                if self.path == "/v1/annotations":
                    return self.reply(200, store.update(identity, data))
                if self.path == "/v1/accounts/query":
                    return self.reply(200, store.query(data.get("userIds"), identity["id"]))
                if self.path == "/v1/withdraw":
                    return self.reply(200, store.withdraw_all(identity["id"]))
                self.reply(404, {"error": "未找到接口"})
            except PermissionError as e:
                self.reply(403, {"error": str(e)})
            except (ValueError, TypeError, KeyError):
                self.reply(400, {"error": "请求无效、修订冲突，或邀请码已使用/过期"})
            except (sqlite3.Error, OSError):
                self.reply(503, {"error": "服务暂不可用，请稍后重试"})
    return ThreadingHTTPServer((host, port), Handler)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--db", default=os.environ.get("COMMUNITY_DB", "./community.sqlite"))
    p.add_argument("--port", type=int, default=3258)
    p.add_argument("--invite-file", help="Create one-use invite in a local 0600 file, never stdout")
    p.add_argument("--scope", choices=["read", "contribute"], default="contribute")
    p.add_argument("--revoke", help="Contributor ID to revoke; excludes all of their votes")
    args = p.parse_args()
    store = Store(args.db)
    if args.invite_file:
        fd = os.open(args.invite_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(store.invite(args.scope))
        print("Invitation saved to private file.")
    elif args.revoke:
        store.revoke(args.revoke)
        print("Contributor revoked.")
    else:
        make_server(store, port=args.port).serve_forever()
