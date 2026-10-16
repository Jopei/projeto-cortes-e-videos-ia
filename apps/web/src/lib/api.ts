export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:18000";

/** Business errors from the Series IA routes: `{"detail": {"code", "message"}}`. */
export type ApiBusinessErrorDetail = { code: string; message?: string };

export type FastApiValidationError = {
  detail?:
    | string
    | ApiBusinessErrorDetail
    | {
        loc?: (string | number)[];
        msg: string;
        type: string;
      }[];
};

export class ApiError extends Error {
  status?: number;
  detail?: FastApiValidationError["detail"];
  /** Set when `detail` is a `{code, message}` object (Series IA business errors). */
  code?: string;

  constructor(message: string, status?: number, detail?: FastApiValidationError["detail"]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    if (detail && typeof detail === "object" && !Array.isArray(detail) && typeof detail.code === "string") {
      this.code = detail.code;
    }
  }
}

/** Turns a FastAPI 422 body into a single human-readable string. */
export function formatApiErrorDetail(detail: FastApiValidationError["detail"]): string {
  if (!detail) return "Erro desconhecido.";
  if (typeof detail === "string") return detail;
  if (!Array.isArray(detail)) return detail.message || detail.code;
  return detail
    .map((issue) => {
      const field = issue.loc?.filter((part) => part !== "body").join(".") || "campo";
      return `${field}: ${issue.msg}`;
    })
    .join("; ");
}

/** Builds a same-origin path (route + query string) to send back as `next` after login. */
function currentLocationPath(): string | null {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search}`;
}

/** Login itself returning 401 (bad credentials) must not trigger a redirect loop. */
const AUTH_LOGIN_PATH = "/api/auth/login";

let redirectingToLogin = false;

/**
 * Sends the browser to /login after a 401. The session cookie is cleared
 * first: a cookie the API no longer accepts (expired, revoked by a password
 * change) would otherwise make the middleware bounce /login back into the
 * app, which 401s again — an endless reload loop.
 */
export function redirectToLogin(): void {
  if (typeof window === "undefined" || redirectingToLogin) return;
  if (window.location.pathname === "/login") return;
  redirectingToLogin = true;
  const next = currentLocationPath();
  const target = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  fetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" })
    .catch(() => undefined)
    .finally(() => {
      window.location.href = target;
    });
}

/**
 * Admin "ver como outro usuário" state (see CLAUDE.md "Auth" / `app.scope`).
 * Persisted to localStorage so it survives reloads; every `api.*` call below
 * automatically attaches it as the `X-As-User` header. For the handful of
 * plain URLs used as `<video src>`/`<img src>`/download links (no way to set
 * a header there), use `withAsUserParam` to append `?as_user=` instead.
 * Non-admins never have this set (see `lib/admin-view.tsx`), and the backend
 * silently ignores it for non-admins either way.
 */
export const AS_USER_STORAGE_KEY = "cortes.as-user-id";
/** Fired on every change so other contexts (e.g. the channel picker, which
 * must reset when impersonation changes) can react without a hard reload. */
export const AS_USER_CHANGED_EVENT = "cortes:as-user-changed";

export function getAsUserId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AS_USER_STORAGE_KEY);
}

export function setAsUserId(id: string | null): void {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(AS_USER_STORAGE_KEY, id);
  else window.localStorage.removeItem(AS_USER_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(AS_USER_CHANGED_EVENT, { detail: id }));
}

/** Appends `as_user=<id>` to a plain URL (never a header) when impersonating
 * someone — for `<video src>`/`<img src>`/download links that `request()`
 * below can't attach a header to. No-op when not impersonating. */
export function withAsUserParam(url: string): string {
  const asUser = getAsUserId();
  if (!asUser) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}as_user=${asUser}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const asUser = getAsUserId();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(asUser ? { "X-As-User": asUser } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401 && path !== AUTH_LOGIN_PATH) {
    redirectToLogin();
  }

  if (!res.ok) {
    let detail: FastApiValidationError["detail"];
    try {
      const body = (await res.json()) as FastApiValidationError;
      detail = body.detail;
    } catch {
      // response had no JSON body; keep detail undefined
    }
    throw new ApiError(
      detail ? formatApiErrorDetail(detail) : `Request failed: ${res.status} ${res.statusText}`,
      res.status,
      detail,
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }

  return undefined as T;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: "GET" }),
  post: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { ...init, method: "DELETE" }),
};

export type HealthStatus = {
  status: string;
  [key: string]: unknown;
};

export function getHealth(signal?: AbortSignal): Promise<HealthStatus> {
  return api.get<HealthStatus>("/api/health", { signal });
}
