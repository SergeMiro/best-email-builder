"""
best-email-builder, the agent's side of the connector: the endpoint that
speaks "best-email-builder/agent@1", for a FastAPI application.

The builder sends one POST per model turn. Your agent answers it however it
likes (one model call, or its own tools first: a knowledge base, the
customer's data), and the builder checks the answer the way it checks any
model's, so the agent needs to know nothing of MJML.

    from email_builder_agent import AgentError, email_builder_router

    async def complete(task, system, messages, schema, request):
        user = who_is(request)  # your rights: from a header, never from the body
        return await my_agent([{"role": "system", "content": system}, *messages], user)

    app.include_router(email_builder_router(complete))  # POST /email-builder

`complete` returns the text of its model (the JSON answer, as a string) or
the answer as a dict. Raise AgentError("MODEL_BUSY", "...") (or REFUSED,
TRUNCATED, MODEL_UNAVAILABLE, MODEL_CREDITS, MODEL_ERROR) for a failure the
builder explains to the user. Any other exception is logged and answered as
MODEL_ERROR without its message. An HTTPException of your own (a 401) goes
out as it is.

One file, no dependency beyond FastAPI: copy it into your agent.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Awaitable, Callable, Optional, Sequence, Union

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

PROTOCOL = "best-email-builder/agent@1"
TASKS = ("generate", "rewrite", "subjects")
# The failures the builder explains, and the status each goes out with.
ERROR_STATUS = {
    "REFUSED": 422,
    "TRUNCATED": 502,
    "MODEL_UNAVAILABLE": 502,
    "MODEL_CREDITS": 502,
    "MODEL_BUSY": 503,
    "MODEL_ERROR": 502,
}
# A repair turn carries the last answer: a whole email at most.
MAX_BODY_BYTES = 2 * 1024 * 1024
MAX_MESSAGES = 20

log = logging.getLogger("email_builder_agent")

Complete = Callable[..., Awaitable[Union[str, dict]]]


class AgentError(Exception):
    """A failure the builder explains: `code` is one of ERROR_STATUS."""

    def __init__(self, code: str, message: str = ""):
        if code not in ERROR_STATUS:
            raise ValueError(f"AgentError: unknown code {code!r}, use one of {', '.join(ERROR_STATUS)}")
        super().__init__(message or code)
        self.code = code
        self.message = message or code


def _refuse(error: str, code: str, status: int) -> JSONResponse:
    return JSONResponse({"error": error, "code": code}, status_code=status, headers={"Cache-Control": "no-store"})


def _problem(body: Any) -> Optional[str]:
    """What is wrong with what the builder sent, or None."""
    if not isinstance(body, dict):
        return "The body is not a JSON object"
    if body.get("protocol") != PROTOCOL:
        return f"Unsupported protocol {json.dumps(body.get('protocol'))}: this endpoint speaks {PROTOCOL}"
    if body.get("task") not in TASKS:
        return f"Unknown task {json.dumps(body.get('task'))}"
    if not isinstance(body.get("system"), str):
        return "`system` must be a string"
    if not isinstance(body.get("schema"), dict):
        return "`schema` must be an object"
    messages = body.get("messages")
    if not isinstance(messages, list) or not 1 <= len(messages) <= MAX_MESSAGES:
        return f"`messages` must hold 1 to {MAX_MESSAGES} messages"
    for message in messages:
        if (
            not isinstance(message, dict)
            or message.get("role") not in ("user", "assistant")
            or not isinstance(message.get("content"), str)
        ):
            return 'Each message is { role: "user"|"assistant", content: string }'
    return None


def email_builder_router(
    complete: Complete,
    *,
    path: str = "/email-builder",
    dependencies: Optional[Sequence[Any]] = None,
) -> APIRouter:
    """
    The endpoint, as a router to include. `complete(task, system, messages,
    schema, request)` is your agent; `dependencies` run first (your
    authentication: `[Depends(require_user)]`).
    """
    router = APIRouter(dependencies=list(dependencies or []))

    @router.post(path)
    async def email_builder(request: Request):
        raw = await request.body()
        if len(raw) > MAX_BODY_BYTES:
            return _refuse("Request too large", "TOO_LARGE", 413)
        try:
            body = json.loads(raw)
        except ValueError:
            return _refuse("Invalid JSON", "INVALID_JSON", 400)
        problem = _problem(body)
        if problem:
            return _refuse(problem, "INVALID_REQUEST", 400)

        try:
            answer = await complete(
                task=body["task"],
                system=body["system"],
                messages=[{"role": m["role"], "content": m["content"]} for m in body["messages"]],
                schema=body["schema"],
                request=request,
            )
        except AgentError as error:
            return _refuse(error.message, error.code, ERROR_STATUS[error.code])
        except HTTPException:
            raise
        except Exception:  # noqa: BLE001 — logged here, never sent back
            log.exception("email-builder agent: %s failed", body["task"])
            return _refuse("The agent could not answer", "MODEL_ERROR", 502)

        if isinstance(answer, str):
            return JSONResponse({"text": answer}, headers={"Cache-Control": "no-store"})
        if isinstance(answer, dict):
            return JSONResponse({"output": answer}, headers={"Cache-Control": "no-store"})
        return _refuse("The agent gave no answer", "MODEL_ERROR", 502)

    return router
