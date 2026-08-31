"""One-shot localhost UI for storing an OpenAI key in the Windows user environment."""

from __future__ import annotations

import argparse
import html
import threading
import urllib.parse
import winreg
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


PAGE = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>TheatreFlow · OpenAI configuration</title>
<style>
body{margin:0;background:#f4f7f7;color:#102a30;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:560px;margin:10vh auto;padding:36px;background:#fff;border:1px solid #dce5e5;border-radius:16px;box-shadow:0 12px 35px #17383d14}
h1{margin:0 0 8px;font-size:25px}p{color:#526a70}label{display:block;margin:24px 0 8px;font-weight:650}
input{box-sizing:border-box;width:100%;padding:13px 14px;border:1px solid #b8c9cc;border-radius:9px;font:inherit}
input:focus{outline:3px solid #65c7b34d;border-color:#258d7d}button{width:100%;margin-top:18px;padding:13px;border:0;border-radius:9px;background:#207f72;color:#fff;font:700 16px inherit;cursor:pointer}
.note{font-size:13px;color:#6b7f83}.ok{padding:14px;background:#e9f7f3;border-radius:9px;color:#17675c}
</style></head><body><main>{content}</main></body></html>"""


FORM = """<h1>Configure the OpenAI API key</h1>
<p>The key is submitted only to <code>127.0.0.1</code> on this machine. It is never written to a project file or shown in a log.</p>
<form method="post" action="/save" autocomplete="off">
<input type="hidden" name="token" value="{token}">
<label for="key">New API key</label>
<input id="key" name="key" type="password" required minlength="20" placeholder="sk-…" autofocus>
<button type="submit">Save securely</button></form>
<p class="note">Saved to the current Windows user’s environment variables. This configuration server shuts down once the key is stored.</p>"""


def save_user_environment(api_key: str) -> None:
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment", 0, winreg.KEY_SET_VALUE) as key:
        values = {
            "OPENAI_API_KEY": api_key,
            "NLP_PROVIDER": "auto",
            "NLP_OPENAI_MODEL": "gpt-5.6-luna",
            "NLP_ALLOW_RULE_FALLBACK": "true",
        }
        for name, value in values.items():
            winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)


def handler_for(token: str):
    class ConfigHandler(BaseHTTPRequestHandler):
        server_version = "TheatreFlowKeySetup/1.0"

        def _send_html(self, status: HTTPStatus, content: str) -> None:
            body = PAGE.replace("{content}", content).encode("utf-8")
            self.send_response(int(status))
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Pragma", "no-cache")
            self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802
            parsed = urllib.parse.urlparse(self.path)
            supplied = urllib.parse.parse_qs(parsed.query).get("token", [""])[0]
            if parsed.path != "/" or supplied != token:
                self._send_html(HTTPStatus.FORBIDDEN, "<h1>This link is invalid or has expired</h1>")
                return
            self._send_html(HTTPStatus.OK, FORM.format(token=html.escape(token, quote=True)))

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/save":
                self._send_html(HTTPStatus.NOT_FOUND, "<h1>Not found</h1>")
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 10_000:
                    raise ValueError("Invalid submission size")
                values = urllib.parse.parse_qs(self.rfile.read(length).decode("utf-8"), keep_blank_values=True)
                if values.get("token", [""])[0] != token:
                    raise ValueError("This configuration link has expired")
                api_key = values.get("key", [""])[0].strip()
                if not api_key.startswith("sk-") or len(api_key) < 20:
                    raise ValueError("Invalid API key format. Use a newly created key beginning with sk-")
                save_user_environment(api_key)
            except (UnicodeDecodeError, ValueError) as error:
                self._send_html(HTTPStatus.BAD_REQUEST, f"<h1>Could not save</h1><p>{html.escape(str(error))}</p>")
                return

            self._send_html(
                HTTPStatus.OK,
                "<h1>Saved</h1><div class='ok'>The key is stored. You can close this page and restart the NLP service.</div>",
            )
            threading.Thread(target=self.server.shutdown, daemon=True).start()

        def log_message(self, format: str, *args) -> None:
            return

    return ConfigHandler


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", required=True)
    parser.add_argument("--port", type=int, default=8199)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler_for(args.token))
    print(f"READY http://127.0.0.1:{server.server_port}/?token={args.token}", flush=True)
    server.serve_forever()
    server.server_close()


if __name__ == "__main__":
    main()
