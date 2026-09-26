export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:18000";

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    throw new ApiError(`Request failed: ${res.status} ${res.statusText}`, res.status);
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
};

export type HealthStatus = {
  status: string;
  [key: string]: unknown;
};

export function getHealth(signal?: AbortSignal): Promise<HealthStatus> {
  return api.get<HealthStatus>("/api/health", { signal });
}
