"""Optional LLM scoring pass: Claude rates a shortlist of ~20 candidate
windows (already picked by a first `scorer.select_clips` pass without the
`llm` signal) for hook/climax/punchline strength, purely from their
transcript excerpt. Fully optional — no `ANTHROPIC_API_KEY`, a network
error, a timeout, or an unparsable response all fall back to "no LLM signal"
(all-zero) rather than failing the job.
"""

from __future__ import annotations

import json
import logging
import re

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-5"

_PROMPT_TEMPLATE = """You are scoring candidate clips cut from a longer video for how good they'd \
be as a standalone short-form video (YouTube Shorts/TikTok/Reels).

For each candidate below, give a single score from 0.0 to 1.0 for how strong its "hook" \
(grabs attention fast), "climax" (a clear peak moment) and "punchline"/payoff are, combined \
into one overall score. A candidate with little or no transcript (action/music only) should \
not automatically get a low score just for lacking dialogue.

Candidates (index, transcript excerpt):
{items}

Respond with ONLY a JSON array, no prose, no markdown fences: \
[{{"index": 0, "score": 0.0}}, ...] with exactly one entry per candidate index above.
"""


def _transcript_excerpt(segments: list[dict], start: float, end: float) -> str:
    parts = [seg["text"] for seg in segments if seg["end"] > start and seg["start"] < end]
    return " ".join(parts).strip()


def _extract_json_array(text: str) -> list:
    text = text.strip()
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        text = match.group(0)
    return json.loads(text)


def score_candidates(
    candidates: list,
    segments: list[dict],
    *,
    api_key: str | None,
    model: str = MODEL,
    timeout: float = 45.0,
) -> dict[int, float]:
    """Returns `{candidate_index: score}` for as many candidates as the LLM
    scored successfully (possibly empty, never raises).
    """
    if not api_key or not candidates:
        return {}
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key, timeout=timeout)
        items_text = "\n".join(
            f"{i}: {_transcript_excerpt(segments, c.start, c.end) or '(no dialogue)'}"
            for i, c in enumerate(candidates)
        )
        prompt = _PROMPT_TEMPLATE.format(items=items_text)
        response = client.messages.create(
            model=model,
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = "".join(block.text for block in response.content if getattr(block, "type", None) == "text")
        data = _extract_json_array(raw_text)
        scores: dict[int, float] = {}
        for item in data:
            idx = int(item["index"])
            score = float(item["score"])
            scores[idx] = max(0.0, min(1.0, score))
        return scores
    except Exception:  # noqa: BLE001 - any failure here must not fail the job
        logger.exception("LLM candidate scoring failed; continuing without an llm signal")
        return {}
