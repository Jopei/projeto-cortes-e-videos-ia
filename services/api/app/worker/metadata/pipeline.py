"""Per-platform title/description/hashtags generation (Claude, with a
deterministic fallback when there's no `ANTHROPIC_API_KEY`).

`template` is the *effective* template for a (channel, account) pair — see
`app.channels.effective_template` — with keys `language`, `tone`,
`fixed_hashtags` (list[str]), `title_max` (int), `extra_description` (str).
None of them are required; every missing key has a sane default here.

Vimeo note: Vimeo's own API takes plain `tags` (no `#` prefix), not
hashtags — we deliberately do NOT special-case that here and keep
generating the same `#`-prefixed `hashtags` list for every platform
(minus the YouTube-only `#Shorts`, see `_fallback_hashtags`/
`generate_metadata` below). The future `app/worker/publishers/vimeo.py`
upload path is the one place responsible for stripping the leading `#`
(and any other Vimeo-specific normalization) when it builds the `tags`
field for the Vimeo API call — this module's output stays a single
platform-agnostic shape.

The description ALWAYS ends with the Source's attribution
(`app.rights.attribution.build_description`) — callers must not skip that
step, so `generate_metadata` does it internally rather than leaving it to
the caller to remember.
"""

from __future__ import annotations

import json
import logging
import re

from app.rights.attribution import build_description

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-5"
DEFAULT_TITLE_MAX = 100

_PLATFORM_TITLE_MAX_DEFAULT: dict[str, int] = {
    "vimeo": 128,
}
"""Per-platform hard default for title length when the (channel, account)
`template` doesn't set an explicit `title_max` — Vimeo allows longer titles
(128 chars) than the generic 100-char default used elsewhere. An explicit
`template["title_max"]` always wins over this."""


def _title_max_for(template: dict, platform: str) -> int:
    return template.get("title_max") or _PLATFORM_TITLE_MAX_DEFAULT.get(platform, DEFAULT_TITLE_MAX)


def _clean_excerpt(transcript: str | None, *, max_chars: int = 600) -> str:
    if not transcript:
        return ""
    text = re.sub(r"\s+", " ", transcript).strip()
    return text[:max_chars]


def _truncate_title(title: str, title_max: int) -> str:
    title = title.strip()
    if len(title) <= title_max:
        return title
    return title[: max(0, title_max - 1)].rstrip() + "…"


def _fallback_hashtags(template: dict, work_name: str, platform: str) -> list[str]:
    tags = list(template.get("fixed_hashtags") or [])
    work_tag = "#" + re.sub(r"[^0-9A-Za-z]", "", work_name.title())
    if work_tag != "#" and work_tag not in tags:
        tags.append(work_tag)
    if platform == "youtube" and "#Shorts" not in tags:
        tags.append("#Shorts")
    return tags


def _fallback_title(work_name: str, transcript_excerpt: str, title_max: int) -> str:
    if transcript_excerpt:
        snippet = transcript_excerpt.split(".")[0][:80].strip()
        title = f"{work_name} — {snippet}" if snippet else work_name
    else:
        title = work_name
    return _truncate_title(title, title_max)


def fallback_metadata(
    *,
    work_name: str,
    transcript: str | None,
    template: dict,
    platform: str,
) -> tuple[str, str, list[str]]:
    """Deterministic title/description/hashtags — used when there's no
    `ANTHROPIC_API_KEY` or the LLM call fails. Never raises."""
    title_max = _title_max_for(template, platform)
    excerpt = _clean_excerpt(transcript)
    title = _fallback_title(work_name, excerpt, title_max)
    extra = (template.get("extra_description") or "").strip()
    description_parts = [p for p in [excerpt, extra] if p]
    description = "\n\n".join(description_parts)
    hashtags = _fallback_hashtags(template, work_name, platform)
    return title, description, hashtags


_LLM_PROMPT = """You write short-form video metadata ({platform}) in {language}, tone: {tone}.

Source work: "{work_name}"
Transcript excerpt of this specific clip:
\"\"\"{excerpt}\"\"\"

Write a catchy title (max {title_max} characters) and a short description (2-4 sentences, \
no hashtags in it) for this clip. Then propose 3-6 relevant hashtags (without the \
"{fixed_hashtags}" ones, which are added automatically).

Respond with ONLY a JSON object, no prose, no markdown fences: \
{{"title": "...", "description": "...", "hashtags": ["...", ...]}}
"""


def _extract_json_object(text: str) -> dict:
    text = text.strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        text = match.group(0)
    return json.loads(text)


def llm_metadata(
    *,
    work_name: str,
    transcript: str | None,
    template: dict,
    platform: str,
    api_key: str,
    model: str = MODEL,
    timeout: float = 45.0,
) -> tuple[str, str, list[str]] | None:
    """Returns `(title, description, extra_hashtags)` or `None` on any
    failure (never raises) — caller should fall back to
    `fallback_metadata` in that case."""
    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key, timeout=timeout)
        title_max = _title_max_for(template, platform)
        fixed_hashtags = template.get("fixed_hashtags") or []
        prompt = _LLM_PROMPT.format(
            platform=platform,
            language=template.get("language") or "pt-BR",
            tone=template.get("tone") or "neutral, engaging",
            work_name=work_name,
            excerpt=_clean_excerpt(transcript) or "(no dialogue in this clip)",
            title_max=title_max,
            fixed_hashtags=", ".join(fixed_hashtags),
        )
        response = client.messages.create(
            model=model,
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = "".join(block.text for block in response.content if getattr(block, "type", None) == "text")
        data = _extract_json_object(raw_text)
        title = _truncate_title(str(data["title"]), title_max)
        description = str(data.get("description") or "").strip()
        hashtags = [str(h) for h in (data.get("hashtags") or [])]
        return title, description, hashtags
    except Exception:  # noqa: BLE001 - fall back to deterministic metadata
        logger.exception("LLM metadata generation failed; using fallback")
        return None


def generate_metadata(
    *,
    work_name: str,
    transcript: str | None,
    template: dict,
    platform: str,
    attribution_text: str | None,
    api_key: str | None,
) -> tuple[str, str, list[str]]:
    """Full pipeline for one platform: LLM (if available) or fallback, then
    always append the Source attribution to the description, then always
    merge in the template's fixed hashtags (+ #Shorts for YouTube).
    """
    result = None
    if api_key:
        result = llm_metadata(work_name=work_name, transcript=transcript, template=template, platform=platform, api_key=api_key)

    if result is not None:
        title, description, extra_hashtags = result
        hashtags = list(template.get("fixed_hashtags") or [])
        for tag in extra_hashtags:
            if tag not in hashtags:
                hashtags.append(tag)
        if platform == "youtube" and "#Shorts" not in hashtags:
            hashtags.append("#Shorts")
    else:
        title, description, hashtags = fallback_metadata(
            work_name=work_name, transcript=transcript, template=template, platform=platform
        )

    description = build_description(description, attribution_text)
    return title, description, hashtags
