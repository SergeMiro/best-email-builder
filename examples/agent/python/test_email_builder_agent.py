"""
The FastAPI side of best-email-builder/agent@1, the same rules as the
JavaScript one (tests/unit/agent.test.mjs).

    pip install fastapi httpx pytest && pytest examples/agent/python
"""

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

from email_builder_agent import PROTOCOL, AgentError, email_builder_router

GOOD = {
    "protocol": PROTOCOL,
    "task": "rewrite",
    "system": "S",
    "messages": [{"role": "user", "content": "U", "extra": 1}],
    "schema": {},
}


def client_for(complete, **options):
    app = FastAPI()
    app.include_router(email_builder_router(complete, **options))
    return TestClient(app, raise_server_exceptions=False)


def test_the_answer_goes_back_as_text_or_output():
    received = []

    async def complete(**task):
        received.append(task)
        return "the text" if len(received) == 1 else {"text": "a dict"}

    client = client_for(complete)
    first = client.post("/email-builder", json=GOOD)
    assert (first.status_code, first.json()) == (200, {"text": "the text"})
    second = client.post("/email-builder", json=GOOD)
    assert (second.status_code, second.json()) == (200, {"output": {"text": "a dict"}})
    assert received[0]["task"] == "rewrite"
    assert received[0]["messages"] == [{"role": "user", "content": "U"}], "only role and content are passed on"
    assert received[0]["request"].headers["content-type"] == "application/json"


def test_named_failures_keep_their_code_others_are_hidden(caplog):
    errors = iter([AgentError("MODEL_BUSY", "nothing free"), RuntimeError("db password=hunter2")])

    async def complete(**_task):
        raise next(errors)

    client = client_for(complete)
    busy = client.post("/email-builder", json=GOOD)
    assert (busy.status_code, busy.json()) == (503, {"error": "nothing free", "code": "MODEL_BUSY"})
    hidden = client.post("/email-builder", json=GOOD)
    assert (hidden.status_code, hidden.json()) == (502, {"error": "The agent could not answer", "code": "MODEL_ERROR"})
    assert "hunter2" in caplog.text, "logged, not answered"


def test_what_the_builder_sends_is_checked():
    calls = []

    async def complete(**task):
        calls.append(task)
        return "x"

    client = client_for(complete)
    cases = [
        ({**GOOD, "protocol": "best-email-builder/agent@2"}, "Unsupported protocol"),
        ({**GOOD, "task": "translate"}, "Unknown task"),
        ({**GOOD, "system": 1}, "`system` must be a string"),
        ({**GOOD, "schema": None}, "`schema` must be an object"),
        ({**GOOD, "messages": []}, "`messages` must hold 1 to 20"),
        ({**GOOD, "messages": [{"role": "system", "content": "x"}]}, "Each message is"),
    ]
    for body, message in cases:
        response = client.post("/email-builder", json=body)
        assert response.status_code == 400
        assert response.json()["code"] == "INVALID_REQUEST"
        assert message in response.json()["error"]
    bad = client.post("/email-builder", content=b"{nope", headers={"content-type": "application/json"})
    assert (bad.status_code, bad.json()["code"]) == (400, "INVALID_JSON")
    assert calls == [], "nothing refused reached the agent"


def test_dependencies_run_first_and_the_hosts_own_errors_go_out_as_they_are():
    def caller(authorization: str = Header("")):
        if authorization != "Bearer ok":
            raise HTTPException(status_code=401, detail="Authentication required")

    async def complete(**_task):
        return "x"

    client = client_for(complete, dependencies=[Depends(caller)], path="/agent/email-builder")
    refused = client.post("/agent/email-builder", json=GOOD)
    assert (refused.status_code, refused.json()) == (401, {"detail": "Authentication required"})
    allowed = client.post("/agent/email-builder", json=GOOD, headers={"Authorization": "Bearer ok"})
    assert allowed.json() == {"text": "x"}


def test_an_unknown_code_is_a_mistake_of_the_agent():
    try:
        AgentError("KEY_REFUSED")
    except ValueError as error:
        assert "MODEL_BUSY" in str(error)
    else:
        raise AssertionError("an unknown code must be refused")
