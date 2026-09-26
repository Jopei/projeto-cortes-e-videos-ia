"""Enum types shared by more than one model (kept in one place so the same
`Platform` value set — and the same underlying Postgres ENUM type name,
`platform` — is reused by `ClipMetadata`, `PlatformAccount` and
`Publication` instead of drifting into three near-identical enums).
"""

from __future__ import annotations

import enum

from sqlalchemy import Enum


class Platform(str, enum.Enum):
    YOUTUBE = "youtube"
    TIKTOK = "tiktok"
    BILIBILI = "bilibili"
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"


# Single SQLAlchemy type instance so every column that uses it shares one
# named type (`platform`) rather than each mapped_column() minting its own.
platform_enum = Enum(Platform, name="platform", values_callable=lambda e: [m.value for m in e])
