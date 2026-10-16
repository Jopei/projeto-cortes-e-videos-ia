import { ApiError, formatApiErrorDetail } from "@/lib/api";

/** Spec §8: PT messages by `detail.code`. The backend `message` is never shown for known codes. */
export const SERIES_ERROR_MESSAGES: Record<string, string> = {
  channel_without_accounts: "Este canal ainda não tem contas conectadas. Conecte ao menos uma conta para publicar.",
  provider_not_configured:
    "O provedor escolhido não está configurado. Peça ao administrador para cadastrar a chave ou escolha outro provedor.",
  invalid_transition: "Esta ação não está disponível no estado atual. Atualize a página e confira o status.",
  previous_episode_not_approved: "Aprove o episódio anterior antes deste.",
  regeneration_limit_reached:
    "Limite de regenerações deste episódio atingido. Edite o roteiro manualmente ou aumente o limite na configuração da série.",
  series_budget_exceeded: "O orçamento desta série foi atingido. Aumente o limite para continuar gerando.",
  user_ai_budget_exceeded:
    "Seu orçamento mensal de IA foi atingido. Fale com o administrador ou aguarde o próximo mês.",
  active_series_limit:
    "Você já tem o número máximo de séries ativas. Conclua ou cancele uma para criar outra.",
  bible_version_conflict:
    "A bíblia foi alterada em outro lugar. Recarregue para ver a versão atual; suas edições não foram salvas.",
  script_revision_conflict:
    "O roteiro mudou enquanto você editava. Recarregue para continuar; suas edições não foram salvas.",
  episode_busy: "O episódio está sendo processado. Aguarde terminar para fazer alterações.",
  episode_clip_managed_by_series:
    "Este corte pertence a um episódio de série. Aprove ou rejeite pelo episódio, na tela da série.",
};

const GENERIC = "Algo deu errado. Tente novamente.";

/** Message for any thrown value. `fallback` is used for non-coded HTTP errors without detail. */
export function seriesErrorMessage(err: unknown, fallback?: string): string {
  if (!(err instanceof ApiError)) return fallback ?? GENERIC;
  if (err.code && SERIES_ERROR_MESSAGES[err.code]) return SERIES_ERROR_MESSAGES[err.code];
  if (err.status === 413) return "Imagem maior que 5 MB.";
  if (err.status === 415) return "Formato não aceito. Use PNG, JPEG ou WebP.";
  if (err.status === 404 && !err.code) return "Não encontrado.";
  if (err.code) {
    const d = err.detail;
    const msg = d && typeof d === "object" && !Array.isArray(d) ? d.message : undefined;
    return msg || GENERIC;
  }
  if (err.status === 422 && err.detail) return formatApiErrorDetail(err.detail);
  if (err.detail && typeof err.detail === "string") return err.detail;
  return fallback ?? GENERIC;
}

export function errorCode(err: unknown): string | undefined {
  return err instanceof ApiError ? err.code : undefined;
}

/**
 * The Series IA routes may not be deployed yet: an unmapped FastAPI route
 * answers 404 `{"detail":"Not Found"}` (or 405). A real "série não
 * encontrada" carries a different detail.
 */
export function isUnavailable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.status === 405) return true;
  return err.status === 404 && err.detail === "Not Found";
}

export function isNotFound(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404 && !isUnavailable(err);
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
