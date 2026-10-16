"""Provider interfaces for Series IA media generation (plano §5): video
(async submit/poll/download), image (sync, or submit/poll if a provider
needs it) and TTS (sync, with optional word timestamps). Adapters use only
`urllib`/`requests`-free stdlib HTTP and never cache credentials — the
registry builds them per task via `get_integration_value`.
"""

from __future__ import annotations

import os
import urllib.parse
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


class ProviderError(Exception):
    """Failure talking to a provider. `retryable`: worth trying again
    (rate limit, 5xx, network). `safety`: the provider refused the content
    (the scene must be re-scripted, not retried)."""

    def __init__(
        self, message: str, *, retryable: bool = False, retry_after: float | None = None, safety: bool = False
    ) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.retry_after = retry_after
        self.safety = safety


@dataclass
class SubmitResult:
    provider_job_id: str
    estimated_cost_usd: float = 0.0


@dataclass
class PollResult:
    state: str  # "running" | "succeeded" | "failed"
    progress: float | None = None
    error: str | None = None
    retryable: bool = False
    safety: bool = False


@dataclass
class DownloadResult:
    duration_s: float
    size_bytes: int
    actual_cost_usd: float | None = None


@dataclass
class ImageResult:
    size_bytes: int
    cost_usd: float = 0.0


@dataclass
class TTSResult:
    duration_s: float
    words: list[dict] | None  # [{word, start, end}] or None when unsupported
    cost_usd: float = 0.0
    size_bytes: int = 0


@dataclass(frozen=True)
class VideoCapabilities:
    allowed_durations: tuple[int, ...] = ()
    aspect_ratios: tuple[str, ...] = ("9:16",)
    supports_reference_images: bool = False
    max_reference_images: int = 0
    generates_audio: bool = False


class VideoGenProvider(ABC):
    id: str
    capabilities: VideoCapabilities
    download_hosts: tuple[str, ...] = ()
    """Hosts allowed in a result URL (see `safe_download`)."""

    @abstractmethod
    def estimate_cost(self, duration_s: float) -> float: ...

    @abstractmethod
    def submit(self, req: dict, idempotency_key: str) -> SubmitResult:
        """`req`: {prompt, negative_prompt, duration_s, aspect_ratio, reference_image_paths, options}."""

    @abstractmethod
    def poll(self, provider_job_id: str) -> PollResult: ...

    @abstractmethod
    def download(self, provider_job_id: str, dest_path: str) -> DownloadResult: ...

    def cancel(self, provider_job_id: str) -> None:  # best effort
        return None


class ImageGenProvider(ABC):
    id: str
    supports_reference_images: bool = False
    max_reference_images: int = 0

    @abstractmethod
    def estimate_cost(self) -> float: ...

    @abstractmethod
    def generate(
        self,
        prompt: str,
        negative_prompt: str,
        aspect_ratio: str,
        reference_image_paths: list[str],
        dest_path: str,
        options: dict | None = None,
    ) -> ImageResult: ...


class TTSProvider(ABC):
    id: str
    supports_word_timestamps: bool = False
    file_extension: str = "mp3"

    @abstractmethod
    def list_voices(self, language: str) -> list[dict]: ...

    @abstractmethod
    def estimate_cost(self, text: str) -> float: ...

    @abstractmethod
    def synthesize(
        self, text: str, voice_id: str, language: str, dest_path: str, options: dict | None = None
    ) -> TTSResult: ...


def max_download_bytes() -> int:
    from app.config import get_settings

    return get_settings().genmedia_download_max_mb * 1024 * 1024


def safe_download(url: str, dest_path: str, allowed_hosts: tuple[str, ...], *, max_bytes: int | None = None) -> int:
    """Download `url` to `dest_path` for a real video/image adapter: https
    only, host must be (a subdomain of) one of `allowed_hosts`, body capped
    at `max_bytes` (default GENMEDIA_DOWNLOAD_MAX_MB). Returns bytes
    written; raises `ProviderError` on any violation."""
    limit = max_bytes if max_bytes is not None else max_download_bytes()
    parsed = urllib.parse.urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https":
        raise ProviderError("URL de download não é https.", safety=False)
    if not any(host == h or host.endswith("." + h) for h in allowed_hosts):
        raise ProviderError(f"Host de download não permitido: {host}")
    written = 0
    try:
        with urllib.request.urlopen(url, timeout=60) as resp, open(dest_path, "wb") as out:  # noqa: S310 - validated above
            while True:
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > limit:
                    raise ProviderError("Arquivo de resultado maior que o limite permitido.")
                out.write(chunk)
    except ProviderError:
        _remove(dest_path)
        raise
    except Exception as exc:  # noqa: BLE001
        _remove(dest_path)
        raise ProviderError(f"Falha no download: {exc}", retryable=True) from exc
    return written


def _remove(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass


@dataclass
class FakeCallLog:
    """Shared by the fakes so tests can assert how many times a provider was
    really invoked (idempotency)."""

    calls: list[tuple] = field(default_factory=list)


CALL_LOG = FakeCallLog()
