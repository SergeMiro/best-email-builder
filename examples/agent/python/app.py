"""
A minimal agent behind best-email-builder: each turn goes to an
OpenAI-compatible chat API (OpenRouter's free models by default). Your real
agent replaces `complete`: its own model, its tools, its rights.

    pip install fastapi uvicorn httpx
    AGENT_TOKEN=change-me LLM_API_KEY=sk-or-... uvicorn app:app --port 8800

Then, on the builder's server:

    agentEmailModel({
      url: 'http://localhost:8800/email-builder',
      headers: () => ({ Authorization: `Bearer ${process.env.AGENT_TOKEN}` }),
    })
"""

import os

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException

from email_builder_agent import AgentError, email_builder_router

LLM_URL = os.environ.get("LLM_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/") + "/chat/completions"
LLM_MODEL = os.environ.get("LLM_MODEL", "openrouter/free")
AGENT_TOKEN = os.environ.get("AGENT_TOKEN", "")


def caller(authorization: str = Header("")) -> None:
    """Who may ask. A real agent reads the user here (a signed token) and applies their rights."""
    if not AGENT_TOKEN or authorization != f"Bearer {AGENT_TOKEN}":
        raise HTTPException(status_code=401, detail="Authentication required")


async def complete(task, system, messages, schema, request):
    async with httpx.AsyncClient(timeout=150) as client:
        response = await client.post(
            LLM_URL,
            headers={"Authorization": f"Bearer {os.environ['LLM_API_KEY']}"},
            json={"model": LLM_MODEL, "messages": [{"role": "system", "content": system}, *messages]},
        )
    if response.status_code in (429, 503):
        raise AgentError("MODEL_BUSY", f"{response.status_code}: {response.text[:200]}")
    if response.status_code >= 400:
        raise AgentError("MODEL_ERROR", f"{response.status_code}: {response.text[:200]}")
    choice = response.json()["choices"][0]
    if choice.get("finish_reason") == "length":
        raise AgentError("TRUNCATED")
    return choice["message"].get("content") or ""


app = FastAPI()
app.include_router(email_builder_router(complete, dependencies=[Depends(caller)]))
