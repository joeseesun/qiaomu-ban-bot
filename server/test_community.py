import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from community import Store, make_server


class CommunityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(self.temp.name + "/labels.sqlite")
        self.a = self.identity()
        self.b = self.identity()

    def tearDown(self):
        self.temp.cleanup()

    def identity(self, scope="contribute"):
        token = self.store.enroll(self.store.invite(scope))["token"]
        return self.store.auth(token)

    def row(self, **patch):
        return dict(postId="123", userId="456", handle="example", label="ai", revision=1, **patch)

    def test_distinct_contributors_revisions_conflicts_and_withdrawal(self):
        row = self.row()
        self.store.update(self.a, row)
        self.assertFalse(self.store.update(self.a, row)["accepted"])
        self.store.update(self.b, {**row, "label": "human"})
        r = self.store.query(["456"])["accounts"][0]
        self.assertEqual((r["contributors"], r["posts"], r["ai"], r["human"], r["conflictingPosts"]), (2, 1, 1, 1, 1))
        self.store.update(self.a, {**row, "revision": 2, "label": None})
        self.store.update(self.a, row)
        self.assertEqual(self.store.query(["456"])["accounts"][0]["ai"], 0)
        self.assertEqual(self.store.query(["456"], self.b["id"])["accounts"][0]["posts"], 0)

    def test_revoke_removes_votes_and_old_identity_cannot_change_author(self):
        self.store.update(self.a, self.row())
        with self.assertRaises(ValueError):
            self.store.update(self.a, {**self.row(), "userId": "999", "revision": 2})
        self.store.revoke(self.a["id"])
        self.assertEqual(self.store.query(["456"])["accounts"][0]["posts"], 0)

    def test_invites_are_single_use_read_only_scope_and_restart(self):
        code = self.store.invite("read")
        saved = self.store.enroll(code)
        with self.assertRaises(ValueError):
            self.store.enroll(code)
        with self.assertRaises(PermissionError):
            self.store.update(self.store.auth(saved["token"]), self.row())
        restarted = Store(self.store.path)
        self.assertEqual(restarted.auth(saved["token"])["scope"], "read")
        self.assertIsNone(restarted.auth("invalid-token"))

    def test_bulk_withdrawal_and_restore_requires_new_revision(self):
        row = self.row()
        self.store.update(self.a, row)
        self.store.withdraw_all(self.a["id"])
        self.assertFalse(self.store.update(self.a, row)["accepted"])
        self.assertEqual(self.store.query(["456"])["accounts"][0]["posts"], 0)
        self.store.update(self.a, {**row, "revision": 3})
        self.assertEqual(self.store.query(["456"])["accounts"][0]["posts"], 1)

    def test_http_auth_validation_health_and_no_cors(self):
        server = make_server(self.store, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = "http://127.0.0.1:" + str(server.server_port)
        try:
            with urllib.request.urlopen(url + "/health") as r:
                self.assertTrue(json.load(r)["ok"])
                self.assertIsNone(r.headers.get("Access-Control-Allow-Origin"))
            req = urllib.request.Request(url + "/v1/accounts/query", data=b'{"userIds":["456"]}', headers={"Content-Type": "application/json"})
            with self.assertRaises(urllib.error.HTTPError) as err:
                urllib.request.urlopen(req)
            self.assertEqual(err.exception.code, 401)
            err.exception.close()
            req = urllib.request.Request(url + "/v1/enroll", data=b'[]', headers={"Content-Type": "application/json"})
            with self.assertRaises(urllib.error.HTTPError) as err:
                urllib.request.urlopen(req)
            self.assertEqual(err.exception.code, 400)
            err.exception.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
