"""Rights gate: the single place that decides if a clip may be published.

This module is intentionally pure (no DB session, no HTTP, no imports from
`app.models`) so it stays trivial to unit test and safe to reuse from the
worker (publishers/*) without pulling in the whole API stack. Structural
typing (`Protocol`) means the SQLAlchemy `Source` model satisfies
`PublishableSource` without either module importing the other.

Nothing should call a Publisher.upload() without first calling
`check_publishable` and getting `ok=True`.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Protocol, runtime_checkable


@runtime_checkable
class PublishableSource(Protocol):
    license_type: str | None
    allowed_platforms: Iterable[str] | None
    valid_from: datetime | None
    valid_until: datetime | None
    monetization_allowed: bool


MISSING_LICENSE = "missing_license"
OUTSIDE_VALIDITY_WINDOW = "outside_validity_window"
PLATFORM_NOT_ALLOWED = "platform_not_allowed"
CC_BY_NC_MONETIZATION_FORBIDDEN = "cc_by_nc_monetization_forbidden"
CC_BY_ND_DERIVATIVE_FORBIDDEN = "cc_by_nd_derivative_forbidden"
MONETIZATION_NOT_ALLOWED = "monetization_not_allowed"


def check_publishable(
    source: PublishableSource | None,
    platform: str,
    now: datetime,
    monetized: bool = True,
) -> tuple[bool, list[str]]:
    """Decide whether a clip derived from `source` may be published on `platform`.

    Returns `(ok, reasons)`; `reasons` is empty iff `ok` is True. Never
    raises. A missing source (or one without a license_type) is always a
    hard block — it can never be treated as "allowed by default".

    Blocking rules (any one of these blocks publication):
    - license missing;
    - outside the source's validity window (`valid_from`/`valid_until`);
    - platform not in the source's `allowed_platforms` (when that list is
      non-empty — an empty list means "no restriction recorded yet", which
      is deliberately NOT the same as "no platforms allowed");
    - `cc_by_nc` license while `monetized=True`;
    - `cc_by_nd` license, always — a vertical cut is a derivative work by
      definition, and ND forbids derivative works unconditionally;
    - `monetization_allowed=False` on the source while `monetized=True`.
    """
    if source is None or not source.license_type:
        return False, [MISSING_LICENSE]

    reasons: list[str] = []

    if source.valid_from and now < source.valid_from:
        reasons.append(OUTSIDE_VALIDITY_WINDOW)
    if source.valid_until and now > source.valid_until and OUTSIDE_VALIDITY_WINDOW not in reasons:
        reasons.append(OUTSIDE_VALIDITY_WINDOW)

    allowed_platforms = list(source.allowed_platforms or [])
    if allowed_platforms and platform not in allowed_platforms:
        reasons.append(PLATFORM_NOT_ALLOWED)

    license_type = source.license_type

    if license_type == "cc_by_nd":
        reasons.append(CC_BY_ND_DERIVATIVE_FORBIDDEN)

    if license_type == "cc_by_nc" and monetized:
        reasons.append(CC_BY_NC_MONETIZATION_FORBIDDEN)

    if monetized and not source.monetization_allowed:
        reasons.append(MONETIZATION_NOT_ALLOWED)

    return (len(reasons) == 0, reasons)
