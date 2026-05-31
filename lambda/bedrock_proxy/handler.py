"""
Bedrock Proxy Lambda
────────────────────
Exposes POST /chat and GET /health via API Gateway HTTP API v2.

Environment variables
─────────────────────
BEDROCK_MODEL_ID  (required) Model ID, cross-region inference profile ID, or full ARN.
                  Examples:
                    eu.anthropic.claude-3-5-sonnet-20241022-v2:0
                    arn:aws:bedrock:eu-west-2::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0
                    arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-opus-4-5
BEDROCK_REGION    (optional, default eu-west-2) Fallback region when the model ID
                  does not embed a region. Auto-detected from ARNs.
SYSTEM_PROMPT     (optional) Default system prompt injected into every conversation.
MAX_TOKENS        (optional, default 2048) Default max response tokens.
TEMPERATURE       (optional, default 0.7) Default sampling temperature.
TOP_P             (optional, default 0.9) Default top-p nucleus sampling.
ALLOWED_ORIGINS   (optional, default *) Comma-separated CORS allowed origins.
LOG_LEVEL         (optional, default INFO) Python log level.
"""

import base64
import json
import logging
import os
import re

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

# ── Logging ───────────────────────────────────────────────────────────────────

logger = logging.getLogger(__name__)
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO").upper())

# ── Configuration from environment ────────────────────────────────────────────

_BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "")
_BEDROCK_REGION = os.environ.get("BEDROCK_REGION", "eu-west-2")
_SYSTEM_PROMPT = os.environ.get("SYSTEM_PROMPT", "")
_MAX_TOKENS = int(os.environ.get("MAX_TOKENS", "512"))
_TEMPERATURE = float(os.environ.get("TEMPERATURE", "0.7"))
_TOP_P = float(os.environ.get("TOP_P", "0.9"))
_ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")

# Tune via env vars — lower values make timeouts visible sooner in local use.
# For AWS Lambda deployment, increase these (e.g. BEDROCK_READ_TIMEOUT=120, BEDROCK_MAX_RETRIES=3).
_BEDROCK_READ_TIMEOUT = int(os.environ.get("BEDROCK_READ_TIMEOUT", "45"))
_BEDROCK_MAX_RETRIES = int(os.environ.get("BEDROCK_MAX_RETRIES", "1"))

# Boto3 client cache — keyed by region to support cross-region requests.
_clients: dict[str, object] = {}

_BOTO_CONFIG = Config(
    tcp_keepalive=True,
    max_pool_connections=5,
    retries={"mode": "standard", "max_attempts": _BEDROCK_MAX_RETRIES},
    connect_timeout=10,
    read_timeout=_BEDROCK_READ_TIMEOUT,
)

# ── Helpers ───────────────────────────────────────────────────────────────────

_ARN_REGION_RE = re.compile(r"^arn:aws[a-z-]*:bedrock:([a-z0-9-]+):", re.IGNORECASE)


def _region_for(model_id: str) -> str:
    """Return the Bedrock region to use for this model ID or ARN."""
    m = _ARN_REGION_RE.match(model_id)
    return m.group(1) if m else _BEDROCK_REGION


def _bedrock_client(region: str):
    """Return a cached bedrock-runtime client for *region*."""
    if region not in _clients:
        _clients[region] = boto3.client(
            "bedrock-runtime",
            region_name=region,
            config=_BOTO_CONFIG,
        )
    return _clients[region]


def _cors_headers(origin: str | None) -> dict:
    allowed = [o.strip() for o in _ALLOWED_ORIGINS.split(",") if o.strip()]
    if "*" in allowed:
        allow_origin = "*"
    elif origin and origin in allowed:
        allow_origin = origin
    else:
        allow_origin = allowed[0] if allowed else "*"
    return {
        "Access-Control-Allow-Origin": allow_origin,
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
    }


def _response(status: int, body: dict, origin: str | None = None) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", **_cors_headers(origin)},
        "body": json.dumps(body),
    }

# ── Route handlers ────────────────────────────────────────────────────────────

def _handle_health(origin: str | None) -> dict:
    model_id = _BEDROCK_MODEL_ID
    return _response(200, {
        "status": "ok",
        "model_id": model_id or None,
        "bedrock_region": _region_for(model_id) if model_id else _BEDROCK_REGION,
        "configured": bool(model_id),
    }, origin)


def _handle_chat(body: dict, origin: str | None) -> dict:
    model_id = _BEDROCK_MODEL_ID
    if not model_id:
        return _response(500, {
            "error": "BEDROCK_MODEL_ID is not configured",
            "code": "MISSING_CONFIG",
        }, origin)

    # Build the messages list — accept single-turn ("message"), multi-turn ("messages"),
    # or evaluator history format ("history" + "message").
    if "messages" in body:
        messages = body["messages"]
        if not isinstance(messages, list) or not messages:
            return _response(400, {
                "error": "'messages' must be a non-empty list",
                "code": "INVALID_REQUEST",
            }, origin)
    elif "history" in body:
        # Evaluator sends: { history: [{role: "customer"|"agent", content}, ...], message: "..." }
        # Convert roles: customer → user, agent → assistant
        role_map = {"customer": "user", "agent": "assistant", "user": "user", "assistant": "assistant"}
        history = body["history"]
        if not isinstance(history, list):
            return _response(400, {
                "error": "'history' must be a list",
                "code": "INVALID_REQUEST",
            }, origin)
        messages = []
        for entry in history:
            if not isinstance(entry, dict):
                continue
            role = role_map.get(entry.get("role", ""), "user")
            content = entry.get("content", "")
            messages.append({"role": role, "content": content})
        # Append the current turn's message
        current_message = body.get("message", "")
        if not isinstance(current_message, str) or not current_message.strip():
            return _response(400, {
                "error": "'message' must be a non-empty string",
                "code": "INVALID_REQUEST",
            }, origin)
        messages.append({"role": "user", "content": current_message})
    elif "message" in body:
        if not isinstance(body["message"], str) or not body["message"].strip():
            return _response(400, {
                "error": "'message' must be a non-empty string",
                "code": "INVALID_REQUEST",
            }, origin)
        messages = [{"role": "user", "content": body["message"]}]
    else:
        return _response(400, {
            "error": "Request body must include 'message' (string), 'messages' (list), or 'history' (list) + 'message'",
            "code": "INVALID_REQUEST",
        }, origin)

    # Validate each message object.
    for idx, msg in enumerate(messages):
        if not isinstance(msg, dict):
            return _response(400, {
                "error": f"messages[{idx}] must be an object",
                "code": "INVALID_REQUEST",
            }, origin)
        role = msg.get("role")
        if role not in ("user", "assistant"):
            return _response(400, {
                "error": f"messages[{idx}].role must be 'user' or 'assistant', got '{role}'",
                "code": "INVALID_REQUEST",
            }, origin)
        if "content" not in msg:
            return _response(400, {
                "error": f"messages[{idx}] must have a 'content' field",
                "code": "INVALID_REQUEST",
            }, origin)

    # Per-request inference parameter overrides.
    try:
        max_tokens = int(body.get("max_tokens", _MAX_TOKENS))
        temperature = float(body.get("temperature", _TEMPERATURE))
        # top_p is optional; only include if the caller explicitly sets it
        # (sending both temperature and top_p causes ValidationException on some models)
        top_p_raw = body.get("top_p", None)
        top_p = float(top_p_raw) if top_p_raw is not None else None
    except (TypeError, ValueError) as exc:
        return _response(400, {
            "error": f"Invalid inference parameter: {exc}",
            "code": "INVALID_REQUEST",
        }, origin)

    # Per-request system prompt override.
    system_prompt = body.get("system_prompt", _SYSTEM_PROMPT)

    # Normalise content: if a message's content is a plain string wrap it in the
    # content-block list format that the Converse API expects.
    def _normalise_content(content):
        if isinstance(content, str):
            return [{"text": content}]
        return content  # already a list of content blocks

    converse_messages = [
        {"role": m["role"], "content": _normalise_content(m["content"])}
        for m in messages
    ]

    region = _region_for(model_id)
    client = _bedrock_client(region)

    invoke_kwargs: dict = {
        "modelId": model_id,
        "messages": converse_messages,
        "inferenceConfig": {
            "maxTokens": max_tokens,
            "temperature": temperature,
            **({"topP": top_p} if top_p is not None else {}),
        },
    }
    if system_prompt:
        invoke_kwargs["system"] = [{"text": system_prompt}]

    logger.info(json.dumps({
        "event": "bedrock_invoke",
        "model_id": model_id,
        "region": region,
        "message_count": len(converse_messages),
        "max_tokens": max_tokens,
    }))

    try:
        resp = client.converse(**invoke_kwargs)
    except ClientError as exc:
        error_code = exc.response["Error"]["Code"]
        error_msg = exc.response["Error"]["Message"]
        logger.error("Bedrock ClientError %s: %s", error_code, error_msg)
        status = 400 if error_code in (
            "ValidationException",
            "AccessDeniedException",
            "ResourceNotFoundException",
        ) else 502
        return _response(status, {"error": error_msg, "code": error_code}, origin)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error invoking Bedrock")
        return _response(502, {"error": str(exc), "code": "BEDROCK_ERROR"}, origin)

    # Extract reply text from the response output message.
    output_message = resp.get("output", {}).get("message", {})
    content_blocks = output_message.get("content", [])
    reply = " ".join(
        block.get("text", "")
        for block in content_blocks
        if isinstance(block, dict) and block.get("type", "text") == "text"
    )

    usage = resp.get("usage", {})
    stop_reason = resp.get("stopReason", "")

    logger.info(json.dumps({
        "event": "bedrock_response",
        "model_id": model_id,
        "stop_reason": stop_reason,
        "input_tokens": usage.get("inputTokens"),
        "output_tokens": usage.get("outputTokens"),
    }))

    return _response(200, {
        "reply": reply,
        "model_id": model_id,
        "region": region,
        "stop_reason": stop_reason,
        "usage": {
            "input_tokens": usage.get("inputTokens", 0),
            "output_tokens": usage.get("outputTokens", 0),
        },
    }, origin)


# ── Main handler ──────────────────────────────────────────────────────────────

def lambda_handler(event: dict, context) -> dict:  # noqa: ANN001
    """AWS Lambda entry point — HTTP API v2 payload format."""
    # HTTP API v2 embeds method/path inside requestContext.http.
    http_ctx = event.get("requestContext", {}).get("http", {})
    method = (http_ctx.get("method") or event.get("httpMethod", "")).upper()
    path = (http_ctx.get("path") or event.get("path", "")).rstrip("/") or "/"

    raw_headers = event.get("headers") or {}
    origin = raw_headers.get("origin") or raw_headers.get("Origin")

    logger.debug(json.dumps({"event": "request", "method": method, "path": path}))

    # CORS preflight — respond immediately without auth.
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": _cors_headers(origin), "body": ""}

    # Health check — unauthenticated so load-balancers and monitoring can probe it.
    if method == "GET" and path.endswith("/health"):
        return _handle_health(origin)

    # Chat endpoint.
    if method == "POST" and path.endswith("/chat"):
        raw_body = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            raw_body = base64.b64decode(raw_body).decode("utf-8")
        try:
            body = json.loads(raw_body)
        except json.JSONDecodeError as exc:
            return _response(400, {
                "error": f"Invalid JSON body: {exc}",
                "code": "INVALID_JSON",
            }, origin)
        if not isinstance(body, dict):
            return _response(400, {
                "error": "Request body must be a JSON object",
                "code": "INVALID_REQUEST",
            }, origin)
        return _handle_chat(body, origin)

    return _response(404, {"error": "Not found", "code": "NOT_FOUND"}, origin)
