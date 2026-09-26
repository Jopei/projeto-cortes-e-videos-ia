"""Symmetric encryption for `PlatformAccount` OAuth tokens at rest.

Uses Fernet (AES-128-CBC + HMAC, from the `cryptography` package) with a
single key read from `TOKEN_ENCRYPTION_KEY` (see .env / app/config.py).
Generate a key with:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Never log or return a decrypted token through the API — `schemas/platform_account.py`
must never expose `encrypted_access_token`/`encrypted_refresh_token` fields.
"""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


def _fernet() -> Fernet:
    settings = get_settings()
    if not settings.token_encryption_key:
        raise RuntimeError(
            "TOKEN_ENCRYPTION_KEY is not set. Generate one with "
            '`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` '
            "and set it in .env before connecting any OAuth account."
        )
    return Fernet(settings.token_encryption_key.encode())


def encrypt_token(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_token(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Invalid or corrupted token ciphertext") from exc
