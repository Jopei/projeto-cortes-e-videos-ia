"""Claude access for the Series IA worker: ONE entry point,
`call_structured`, that forces a tool call (`tool_choice`) so the answer is
always JSON matching the tool's schema, retries transient failures, and
prices the call from a configurable per-MTok table.

The `anthropic` SDK is imported lazily: it is only installed in the
`worker` image (not in the API image / the plain dev venv). Callers should
reference it as `llm.call_structured(...)` (module attribute) so tests can
monkeypatch it.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from decimal import Decimal

from app.config import get_settings

logger = logging.getLogger(__name__)


class LLMError(RuntimeError):
    """Non-recoverable (or retries exhausted) failure of an LLM call."""


def price_table() -> dict[str, tuple[float, float]]:
    try:
        raw = json.loads(get_settings().claude_prices_per_mtok)
        return {k: (float(v[0]), float(v[1])) for k, v in raw.items()}
    except Exception:  # noqa: BLE001 - malformed env must not take the pipeline down
        logger.warning("CLAUDE_PRICES_PER_MTOK is malformed; using built-in defaults")
        return {"default": (3.0, 15.0)}


def compute_cost_usd(model: str, input_tokens: int, output_tokens: int) -> Decimal:
    table = price_table()
    matches = [prefix for prefix in table if prefix != "default" and model.startswith(prefix)]
    in_price, out_price = table[max(matches, key=len)] if matches else table.get("default", (3.0, 15.0))
    cost = (input_tokens * in_price + output_tokens * out_price) / 1_000_000
    return Decimal(str(round(cost, 6)))


def _is_retryable(exc: Exception) -> bool:
    import anthropic

    if isinstance(exc, (anthropic.RateLimitError, anthropic.APIConnectionError, anthropic.APITimeoutError)):
        return True
    if isinstance(exc, anthropic.APIStatusError):
        return exc.status_code >= 500 or exc.status_code in (408, 409, 429)
    return False


def fake_enabled(api_key: str | None) -> bool:
    """Fake mode: opt-in setting AND no real Anthropic key."""
    return bool(get_settings().story_fake_llm_enabled) and not api_key


def is_available(api_key: str | None) -> bool:
    return bool(api_key) or fake_enabled(api_key)


def call_structured(
    model: str,
    system: str,
    messages: list[dict],
    tool_name: str,
    input_schema: dict,
    max_tokens: int,
    api_key: str,
    *,
    tool_description: str = "",
    client=None,
    max_attempts: int = 3,
    sleep: Callable[[float], None] = time.sleep,
) -> tuple[dict, dict]:
    """Returns `(tool_input, usage)`; `usage = {model, input_tokens,
    output_tokens, cost_usd (Decimal)}`. Raises `LLMError` when attempts are
    exhausted or the error is not retryable."""
    if client is None and fake_enabled(api_key):
        from app.worker.story.fake_llm import fake_tool_result

        usage = {"model": "fake_llm", "provider": "fake_llm", "input_tokens": 0, "output_tokens": 0, "cost_usd": Decimal("0")}
        return fake_tool_result(tool_name, messages), usage
    if client is None:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key, timeout=180.0)
    tool = {"name": tool_name, "description": tool_description or tool_name, "input_schema": input_schema}
    last_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            response = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
                tools=[tool],
                tool_choice={"type": "tool", "name": tool_name},
            )
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            retryable = False
            try:
                retryable = _is_retryable(exc)
            except ImportError:
                pass
            if not retryable or attempt == max_attempts:
                raise LLMError(f"Chamada ao Claude falhou: {exc}") from exc
            sleep(min(2.0 ** attempt, 30.0))
            continue
        block = next(
            (b for b in response.content if getattr(b, "type", None) == "tool_use" and getattr(b, "name", None) == tool_name),
            None,
        )
        usage_obj = getattr(response, "usage", None)
        in_tok = int(getattr(usage_obj, "input_tokens", 0) or 0)
        out_tok = int(getattr(usage_obj, "output_tokens", 0) or 0)
        if block is None or not isinstance(block.input, dict):
            last_error = LLMError("O Claude não devolveu a chamada de ferramenta esperada.")
            if attempt == max_attempts:
                raise last_error
            sleep(1.0)
            continue
        usage = {
            "model": model,
            "input_tokens": in_tok,
            "output_tokens": out_tok,
            "cost_usd": compute_cost_usd(model, in_tok, out_tok),
        }
        return dict(block.input), usage
    raise LLMError(f"Chamada ao Claude falhou: {last_error}")
