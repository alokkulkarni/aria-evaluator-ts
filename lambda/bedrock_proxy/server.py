"""
Local HTTP server that wraps lambda/bedrock_proxy/handler.py.

Converts raw HTTP requests into the API Gateway v2 event format expected by
lambda_handler() and translates the handler response back to HTTP.

Usage (inside the Docker container):
    python server.py

Environment variables:
    PORT      — TCP port to listen on (default: 8000)
    LOG_LEVEL — DEBUG | INFO | WARNING | ERROR (default: INFO)

All other env vars (BEDROCK_MODEL_ID, BEDROCK_REGION, SYSTEM_PROMPT, etc.)
are passed straight through to handler.py via os.environ.
"""

import json
import logging
import os
import socketserver
from http.server import BaseHTTPRequestHandler, HTTPServer

from handler import lambda_handler

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("bedrock-proxy-server")

PORT = int(os.environ.get("PORT", "8000"))


class Handler(BaseHTTPRequestHandler):
    """Minimal HTTP handler that forwards requests to lambda_handler()."""

    # Suppress default request-line logging — we log ourselves.
    def log_message(self, format, *args):  # noqa: A002
        pass

    def _read_body(self) -> str:
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length).decode("utf-8") if length > 0 else ""

    def _build_event(self, method: str, path: str, body: str) -> dict:
        """Build an API Gateway HTTP v2 event from the raw request."""
        # Lower-case all header names to match API Gateway behaviour.
        headers = {k.lower(): v for k, v in self.headers.items()}
        return {
            "requestContext": {
                "http": {
                    "method": method,
                    "path": path,
                }
            },
            "headers": headers,
            "body": body,
            "isBase64Encoded": False,
        }

    def _send_response(self, status: int, body: dict):
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _dispatch(self, method: str):
        path = self.path.split("?")[0]  # strip query string

        # Health check short-circuit — Docker/load-balancer probe.
        if method == "GET" and path == "/health":
            logger.debug("GET /health → 200")
            self._send_response(200, {"status": "ok"})
            return

        body = self._read_body() if method in ("POST", "PUT", "PATCH") else ""

        logger.info("%s %s", method, path)

        event = self._build_event(method, path, body)

        try:
            result = lambda_handler(event, None)
        except Exception as exc:
            logger.exception("Unhandled exception in lambda_handler: %s", exc)
            result = {
                "statusCode": 500,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Internal server error"}),
            }

        status_code = result.get("statusCode", 200)
        response_headers = result.get("headers", {})
        response_body = result.get("body", "")

        if isinstance(response_body, dict):
            response_body = json.dumps(response_body)

        encoded = response_body.encode("utf-8")

        self.send_response(status_code)
        for header_name, header_value in response_headers.items():
            self.send_header(header_name, str(header_value))
        # Ensure Content-Length is always present.
        if "Content-Length" not in response_headers:
            self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

        logger.info("→ %d (%d bytes)", status_code, len(encoded))

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_OPTIONS(self):
        # Pass OPTIONS through so handler.py can return CORS pre-flight headers.
        self._dispatch("OPTIONS")


class _ThreadedHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    """Handle each request in a separate thread so slow Bedrock calls don't block health checks or subsequent requests."""

    daemon_threads = True  # threads exit when the main process exits


def main():
    server = _ThreadedHTTPServer(("0.0.0.0", PORT), Handler)
    logger.info("Bedrock proxy listening on 0.0.0.0:%d", PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
