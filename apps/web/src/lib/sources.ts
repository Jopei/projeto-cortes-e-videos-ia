import { api } from "@/lib/api";

/** Mirrors app/models/source.py::LicenseType (services/api). */
export const LICENSE_TYPES = [
  "public_domain",
  "cc_by",
  "cc_by_sa",
  "cc_by_nc",
  "cc_by_nd",
  "licensed",
  "own",
] as const;

export type LicenseType = (typeof LICENSE_TYPES)[number];

export const LICENSE_TYPE_LABELS: Record<LicenseType, string> = {
  public_domain: "Domínio público",
  cc_by: "CC BY (Atribuição)",
  cc_by_sa: "CC BY-SA (Compartilhamento igual)",
  cc_by_nc: "CC BY-NC (Não comercial)",
  cc_by_nd: "CC BY-ND (Sem derivações)",
  licensed: "Licenciado",
  own: "Conteúdo próprio",
};

export const ALLOWED_PLATFORM_OPTIONS = [
  "youtube",
  "tiktok",
  "bilibili",
  "instagram",
  "facebook",
] as const;

export type AllowedPlatform = (typeof ALLOWED_PLATFORM_OPTIONS)[number];

/** Mirrors app/schemas/source.py::SourceRead. */
export type Source = {
  id: string;
  owner_id: string;
  title: string;
  work_name: string;
  license_type: LicenseType;
  default_channel_id: string | null;
  proof_url: string | null;
  proof_file_key: string | null;
  allowed_platforms: string[];
  territories: string[];
  valid_from: string | null;
  valid_until: string | null;
  monetization_allowed: boolean;
  attribution_text: string | null;
  created_at: string;
};

/** Mirrors app/schemas/source.py::SourceBase/SourceCreate. */
export type SourceInput = {
  title: string;
  work_name: string;
  license_type: LicenseType;
  proof_url?: string | null;
  allowed_platforms: string[];
  territories: string[];
  valid_from?: string | null;
  valid_until?: string | null;
  monetization_allowed: boolean;
  attribution_text?: string | null;
};

export function listSources(signal?: AbortSignal): Promise<Source[]> {
  return api.get<Source[]>("/api/sources", { signal });
}

export function createSource(payload: SourceInput): Promise<Source> {
  return api.post<Source>("/api/sources", payload);
}

export function updateSource(id: string, payload: Partial<SourceInput>): Promise<Source> {
  return api.patch<Source>(`/api/sources/${id}`, payload);
}

export function deleteSource(id: string): Promise<void> {
  return api.delete<void>(`/api/sources/${id}`);
}

/** cc_by_nc/cc_by_nd carry hard usage restrictions worth flagging in the UI. */
export function licenseRestrictionWarning(licenseType: LicenseType): string | null {
  if (licenseType === "cc_by_nc") return "bloqueado para monetização";
  if (licenseType === "cc_by_nd") return "bloqueado: não permite derivados";
  return null;
}

export function isLicenseExpired(source: Pick<Source, "valid_until">): boolean {
  if (!source.valid_until) return false;
  return new Date(source.valid_until).getTime() < Date.now();
}
