"""Mock OpenAI-compatible LLM server powered by openhands-sdk TestLLM.

Serves scripted trajectories as OpenAI /v1/chat/completions responses.
The agent-server's litellm layer talks to this instead of a real LLM provider.

Usage:
    python mock-llm-server.py [--port PORT]

The server defines a single trajectory: one terminal tool call followed by a
text reply. Extend TRAJECTORY to test richer scenarios (multi-turn, errors, etc).
"""

import json
import os
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

os.environ["OPENHANDS_SUPPRESS_BANNER"] = "1"

from openhands.sdk.llm import Message, MessageToolCall, TextContent
from openhands.sdk.llm.exceptions import (
    LLMAuthenticationError,
    LLMBadRequestError,
    LLMContextWindowExceedError,
    LLMRateLimitError,
    LLMServiceUnavailableError,
    LLMTimeoutError,
)
from openhands.sdk.testing import TestLLM, TestLLMExhaustedError

BASH_TOKEN = "MOCK_LLM_E2E_BASH_OK"
REPLY_TOKEN = "MOCK_LLM_E2E_REPLY_OK"

# SDK exception → (HTTP status, OpenAI error type)
ERROR_MAP: dict[type, tuple[int, str]] = {
    LLMAuthenticationError: (401, "invalid_api_key"),
    LLMRateLimitError: (429, "rate_limit_exceeded"),
    LLMContextWindowExceedError: (400, "context_length_exceeded"),
    LLMBadRequestError: (400, "invalid_request_error"),
    LLMTimeoutError: (408, "timeout"),
    LLMServiceUnavailableError: (503, "server_error"),
}


def build_trajectory() -> list[Message | Exception]:
    """Build the scripted trajectory for the E2E test.

    Turn 1: Agent calls the terminal tool with a printf command.
    Turn 2: Agent replies with the expected token and finishes.
    """
    return [
        Message(
            role="assistant",
            content=[TextContent(text="")],
            tool_calls=[
                MessageToolCall(
                    id="call_mock_001",
                    name="terminal",
                    arguments=json.dumps(
                        {"command": f"printf '{BASH_TOKEN}\\n'"}
                    ),
                    origin="completion",
                )
            ],
        ),
        Message(
            role="assistant",
            content=[TextContent(text=REPLY_TOKEN)],
        ),
    ]


class MockLLMHandler(BaseHTTPRequestHandler):
    test_llm: TestLLM  # set by serve()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}

        try:
            response = self.test_llm.completion([])
        except TestLLMExhaustedError:
            self._send_error(
                500,
                "server_error",
                f"Mock LLM exhausted after {self.test_llm.call_count} calls",
            )
            return
        except tuple(ERROR_MAP.keys()) as exc:
            status, error_type = ERROR_MAP[type(exc)]
            self._send_error(status, error_type, str(exc))
            return

        raw = response.raw_response.model_dump()

        if body.get("stream"):
            self._send_streaming(raw)
        else:
            self._send_json(200, raw)

    def _send_streaming(self, raw: dict):
        """SSE streaming: emit content chunk + finish chunk + [DONE]."""
        choice = raw["choices"][0]
        base = {
            "id": raw["id"],
            "object": "chat.completion.chunk",
            "created": raw.get("created", int(time.time())),
            "model": raw["model"],
        }

        content_chunk = {
            **base,
            "choices": [
                {"index": 0, "delta": choice["message"], "finish_reason": None}
            ],
        }
        finish_chunk = {
            **base,
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 5,
                "total_tokens": 15,
            },
        }

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        for chunk in [content_chunk, finish_chunk]:
            self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, status: int, error_type: str, message: str):
        self._send_json(
            status,
            {"error": {"message": message, "type": error_type, "code": error_type}},
        )

    def log_message(self, format, *args):
        print(f"[mock-llm] {args[0]}", file=sys.stderr, flush=True)


def serve(port: int = 9999):
    test_llm = TestLLM.from_messages(build_trajectory())
    MockLLMHandler.test_llm = test_llm

    server = HTTPServer(("127.0.0.1", port), MockLLMHandler)
    print(f"Mock LLM server ready on http://127.0.0.1:{port}", flush=True)
    print(f"Trajectory: {test_llm.remaining_responses} scripted turns", flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Mock OpenAI LLM server")
    parser.add_argument("--port", type=int, default=9999)
    args = parser.parse_args()
    serve(args.port)
