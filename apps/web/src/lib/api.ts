export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:18000";

export type FastApiValidationError = {
  detail?:
    | string
    | {
        loc?: (string | number)[];
        msg: string;
        type: string;
      }[];
};

export class ApiError extends Error {
  status?: number;
  detail?: FastApiValidationError["detail"];

  constructor(message: string, status?: number, detail?: FastApiValidationError["detail"]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** Turns a FastAPI 422 body into a single human-readable string. */
export function formatApiErrorDetail(detail: FastApiValidationError["detail"]): string {
  if (!detail) return "Erro desconhecido.";
  if (typeof detail === "string") return detail;
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (res.status === 401 && path !== AUTH_LOGIN_PATH) {
    const current = currentLocationPath();
    if (current && typeof window !== "undefined") {
      window.location.href = `/login?next=${encodeURIComponent(current)}`;
    }
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
