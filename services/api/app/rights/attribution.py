"""Shared helper: a published description must always carry the Source's
`attribution_text` (required by CC-BY and good practice for every license
type). Single place so no router/task/publisher re-implements this.
"""

from __future__ import annotations


def build_description(base_description: str | None, attribution_text: str | None) -> str:
    """Append `attribution_text` to `base_description`, separated by a blank line.

    Never drops either piece: an empty base with attribution returns just the
    attribution, and a missing attribution returns the base description
    unchanged (never None; empty string if both are missing/blank).
    """
    base = (base_description or "").rstrip()
    attribution = (attribution_text or "").strip()
    if not attribution:
        return base
    if not base:
        return attribution
    return f"{base}\n\n{attribution}"
