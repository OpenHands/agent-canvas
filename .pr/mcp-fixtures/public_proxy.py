#!/usr/bin/env python3
"""Path-routing proxy for public MCP fixture capture.

One ngrok tunnel points at this proxy. Paths are routed by prefix:

- /weather/* -> weather fixture
- /elevenlabs/* -> bearer-token fixture
- /datadog/* -> header-auth fixture
- /notion/* -> static OAuth fixture
- /linear/* -> dynamic OAuth fixture
- /mock-llm/* -> scripted mock LLM
"""

from __future__ import annotations

import argparse
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, urlunsplit

import requests


HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}


def _target_map() -> dict[str, str]:
    return {
        "weather": os.environ.get("MCP_WEATHER_TARGET", "http://127.0.0.1:19200"),
        "elevenlabs": os.environ.get(
            "MCP_ELEVENLABS_TARGET", "http://127.0.0.1:19201"
        ),
        "datadog": os.environ.get("MCP_DATADOG_TARGET", "http://127.0.0.1:19202"),
        "notion": os.environ.get("MCP_NOTION_TARGET", "http://127.0.0.1:19203"),
        "linear": os.environ.get("MCP_LINEAR_TARGET", "http://127.0.0.1:19204"),
        "mock-llm": os.environ.get("MOCK_LLM_TARGET", "http://127.0.0.1:19999"),
    }


class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self) -> None:
        self._proxy()

    def do_POST(self) -> None:
        self._proxy()

    def do_PUT(self) -> None:
        self._proxy()

    def do_PATCH(self) -> None:
        self._proxy()

    def do_DELETE(self) -> None:
        self._proxy()

    def do_OPTIONS(self) -> None:
        self._proxy()

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.client_address[0]} - {fmt % args}", flush=True)

    def _proxy(self) -> None:
        split = urlsplit(self.path)
        parts = [part for part in split.path.split("/") if part]
        if not parts:
            self._send_text(200, "fixture proxy ok\n")
            return

        prefix = parts[0]
        targets = _target_map()
        target_base = targets.get(prefix)
        if not target_base:
            self._send_text(404, f"unknown fixture prefix: {prefix}\n")
            return

        upstream_path = "/" + "/".join(parts[1:])
        if upstream_path == "/":
            upstream_path = "/"
        target = urlunsplit(
            (
                urlsplit(target_base).scheme,
                urlsplit(target_base).netloc,
                upstream_path,
                split.query,
                "",
            )
        )

        body = None
        content_length = self.headers.get("Content-Length")
        if content_length:
            body = self.rfile.read(int(content_length))

        request_headers = {
            key: value
            for key, value in self.headers.items()
            if key.lower() not in HOP_BY_HOP_HEADERS and key.lower() != "host"
        }

        try:
            with requests.request(
                self.command,
                target,
                headers=request_headers,
                data=body,
                allow_redirects=False,
                stream=True,
                timeout=(10, 300),
            ) as response:
                self.send_response(response.status_code)
                for key, value in response.headers.items():
                    if key.lower() in HOP_BY_HOP_HEADERS:
                        continue
                    self.send_header(key, value)
                self.end_headers()
                for chunk in response.iter_content(chunk_size=64 * 1024):
                    if chunk:
                        self.wfile.write(chunk)
        except requests.RequestException as exc:
            self._send_text(502, f"upstream request failed: {exc}\n")

    def _send_text(self, status: int, text: str) -> None:
        data = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=19300)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), ProxyHandler)
    print(f"fixture proxy listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
