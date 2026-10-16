"""Fake image provider (cost 0): a deterministic 1080x1920 PNG gradient
(colour derived from the prompt hash), written in pure Python — no ffmpeg or
PIL needed (so it also runs in the plain dev venv). Only registered when
STORY_FAKE_PROVIDERS_ENABLED."""

from __future__ import annotations

import hashlib
import os
import struct
import zlib

from app.worker.genmedia.base import CALL_LOG, ImageGenProvider, ImageResult

WIDTH, HEIGHT = 1080, 1920


def _png(width: int, height: int, color: tuple[int, int, int]) -> bytes:
    r0, g0, b0 = color
    ramp = [(x * 255) // width for x in range(0, width, 4)]
    rows = []
    for y in range(height):
        shift = int(80 * y / height)
        row = bytearray()
        for v in ramp:
            px = bytes(((r0 + v // 3 + shift) % 256, (g0 + shift) % 256, (b0 + v // 2) % 256))
            row += px * 4
        row = row[: width * 3]
        if height // 3 < y < height // 3 + 220:  # contrasting block: makes Ken Burns motion visible
            mid = width // 2 * 3
            row[mid - 330 : mid + 330] = bytes((250, 240, 200)) * 220
        rows.append(b"\x00" + bytes(row))
    raw = b"".join(rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")


class FakeImageProvider(ImageGenProvider):
    id = "fake_image"
    supports_reference_images = True
    max_reference_images = 3

    def estimate_cost(self) -> float:
        return 0.0

    def generate(self, prompt, negative_prompt, aspect_ratio, reference_image_paths, dest_path, options=None) -> ImageResult:
        digest = hashlib.sha256(prompt.encode()).digest()
        CALL_LOG.calls.append(("image.generate", digest.hex()))
        with open(dest_path, "wb") as fh:
            fh.write(_png(WIDTH, HEIGHT, (digest[0], digest[1], digest[2])))
        return ImageResult(size_bytes=os.path.getsize(dest_path), cost_usd=0.0)
