from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.rights.gate import (
    CC_BY_NC_MONETIZATION_FORBIDDEN,
    CC_BY_ND_DERIVATIVE_FORBIDDEN,
    MISSING_LICENSE,
    MONETIZATION_NOT_ALLOWED,
    OUTSIDE_VALIDITY_WINDOW,
    PLATFORM_NOT_ALLOWED,
    check_publishable,
)


@dataclass
class FakeSource:
    license_type: str | None = "cc_by"
    allowed_platforms: list[str] = field(default_factory=lambda: ["youtube", "tiktok"])
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    monetization_allowed: bool = True


NOW = datetime(2026, 1, 1, 12, 0, 0)


def test_allowed_when_everything_checks_out() -> None:
    ok, reasons = check_publishable(FakeSource(), "youtube", NOW, monetized=True)
    assert ok is True
    assert reasons == []


def test_blocks_missing_source() -> None:
    ok, reasons = check_publishable(None, "youtube", NOW)
    assert ok is False
    assert reasons == [MISSING_LICENSE]


def test_blocks_missing_license_type() -> None:
    ok, reasons = check_publishable(FakeSource(license_type=None), "youtube", NOW)
    assert ok is False
    assert reasons == [MISSING_LICENSE]


def test_blocks_outside_validity_before_start() -> None:
    source = FakeSource(valid_from=NOW + timedelta(days=1))
    ok, reasons = check_publishable(source, "youtube", NOW)
    assert ok is False
    assert OUTSIDE_VALIDITY_WINDOW in reasons


def test_blocks_outside_validity_after_end() -> None:
    source = FakeSource(valid_until=NOW - timedelta(days=1))
    ok, reasons = check_publishable(source, "youtube", NOW)
    assert ok is False
    assert OUTSIDE_VALIDITY_WINDOW in reasons


def test_blocks_platform_not_allowed() -> None:
    source = FakeSource(allowed_platforms=["youtube"])
    ok, reasons = check_publishable(source, "tiktok", NOW)
    assert ok is False
    assert PLATFORM_NOT_ALLOWED in reasons


def test_blocks_cc_by_nc_when_monetized() -> None:
    source = FakeSource(license_type="cc_by_nc")
    ok, reasons = check_publishable(source, "youtube", NOW, monetized=True)
    assert ok is False
    assert CC_BY_NC_MONETIZATION_FORBIDDEN in reasons


def test_allows_cc_by_nc_when_not_monetized() -> None:
    source = FakeSource(license_type="cc_by_nc")
    ok, reasons = check_publishable(source, "youtube", NOW, monetized=False)
    assert ok is True
    assert reasons == []


def test_blocks_cc_by_nd_always() -> None:
    source = FakeSource(license_type="cc_by_nd")
    ok, reasons = check_publishable(source, "youtube", NOW, monetized=False)
    assert ok is False
    assert CC_BY_ND_DERIVATIVE_FORBIDDEN in reasons


def test_blocks_monetization_not_allowed() -> None:
    source = FakeSource(monetization_allowed=False)
    ok, reasons = check_publishable(source, "youtube", NOW, monetized=True)
    assert ok is False
    assert MONETIZATION_NOT_ALLOWED in reasons


def test_allows_when_monetization_not_allowed_but_not_monetizing() -> None:
    source = FakeSource(monetization_allowed=False)
    ok, reasons = check_publishable(source, "youtube", NOW, monetized=False)
    assert ok is True
    assert reasons == []
