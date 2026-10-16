"use client";

import { useEffect, useState } from "react";
import { formatDateTimeShort, formatUsd } from "@/lib/format";
import { getMyUsage, type UsageRead } from "@/lib/me";
import { costsByEpisode, seriesApi, type SeriesDetail } from "@/lib/series";
import { useResource } from "@/lib/use-resource";
import { useAuth } from "@/lib/user-context";
import { Skeleton } from "@/components/ui/Skeleton";
import { UsageBar } from "@/components/ui/UsageBar";
import { LoadError, Notice, UnavailableNotice, cardClass, primaryButton, secondaryButton } from "@/components/series/common";

const KIND_LABELS = { llm: "Texto (LLM)", video: "Vídeo", image: "Imagem", tts: "Voz" } as const;

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div role="img" aria-label={label} className="h-2 w-full overflow-hidden rounded-full bg-border">
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function CostsTab({ series, onEditBudget }: { series: SeriesDetail; onEditBudget: () => void }) {
  const { user } = useAuth();
  const res = useResource((signal) => seriesApi.costs(series.id, signal), `${series.id}|${series.status}`, {
    errorFallback: "Não foi possível carregar os custos.",
  });
  const [usage, setUsage] = useState<UsageRead | null>(null);
  useEffect(() => {
    if (user && !user.is_admin) getMyUsage().then(setUsage).catch(() => undefined);
  }, [user]);

  if (res.loading && !res.data) return <Skeleton className="h-48 w-full" />;
  if (res.unavailable) return <UnavailableNotice onRetry={res.reload} />;
  if (!res.data) return <LoadError message={res.error ?? "Erro desconhecido."} onRetry={res.reload} />;

  const costs = res.data;
  const limit = costs.budget_limit_usd;
  const ratio = limit ? costs.total_usd / limit : null;
  const kinds = (Object.keys(KIND_LABELS) as (keyof typeof KIND_LABELS)[]).map((k) => ({ k, v: costs.by_kind?.[k] ?? 0 }));
  const kindMax = Math.max(...kinds.map((x) => x.v), 0);
  const perEpisode = costsByEpisode(costs);
  const epMax = Math.max(...perEpisode.map((x) => x.cost_usd), 0);
  const remaining = series.estimated_cost ? Math.max(0, series.estimated_cost.season_usd - costs.total_usd) : null;

  return (
    <div className="flex flex-col gap-4">
      {ratio != null && ratio >= 1 ? (
        <Notice
          tone="danger"
          action={
            <button type="button" onClick={onEditBudget} className={primaryButton}>
              Editar orçamento
            </button>
          }
        >
          Orçamento atingido. {series.status === "paused" ? "A série foi pausada." : "A série será pausada."}
        </Notice>
      ) : ratio != null && ratio >= 0.8 ? (
        <Notice
          tone="warning"
          role="status"
          action={
            <button type="button" onClick={onEditBudget} className={secondaryButton}>
              Editar orçamento
            </button>
          }
        >
          Você já usou {Math.round(ratio * 100)}% do orçamento da série.
        </Notice>
      ) : null}

      <section className={`${cardClass} flex flex-col gap-3`} aria-labelledby="costs-total-heading">
        <h2 id="costs-total-heading" className="text-base font-semibold text-fg">
          Total: {formatUsd(costs.total_usd)}
        </h2>
        <UsageBar label={limit != null ? `Limite: ${formatUsd(limit)}` : "Sem limite de orçamento"} used={costs.total_usd} quota={limit} formatValue={formatUsd} />
        {series.estimated_cost ? (
          <p className="text-sm text-fg-muted">
            Estimado restante: {formatUsd(remaining)} (temporada: {formatUsd(series.estimated_cost.season_usd)})
          </p>
        ) : null}
        {usage && usage.monthly_ai_budget_usd != null ? (
          <UsageBar label="Orçamento mensal de IA (todas as séries)" used={usage.ai_spend_month_usd} quota={usage.monthly_ai_budget_usd} formatValue={formatUsd} />
        ) : null}
        <p className="text-xs text-fg-subtle">Os valores são estimativas do provedor e podem diferir da fatura.</p>
      </section>

      {costs.total_usd === 0 && costs.recent.length === 0 ? (
        <p className="text-sm text-fg-muted">Nenhum gasto ainda. O primeiro custo aparece quando a IA planejar a série.</p>
      ) : (
        <>
          <section className={cardClass} aria-labelledby="costs-kind-heading">
            <h2 id="costs-kind-heading" className="mb-3 text-base font-semibold text-fg">
              Por tipo
            </h2>
            <ul className="flex flex-col gap-2">
              {kinds.map(({ k, v }) => (
                <li key={k} className="grid grid-cols-[8rem_1fr_5rem] items-center gap-3 text-sm">
                  <span className="text-fg-muted">{KIND_LABELS[k]}</span>
                  <Bar value={v} max={kindMax} label={`${KIND_LABELS[k]}: ${formatUsd(v)}`} />
                  <span className="text-right text-fg">{formatUsd(v)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={cardClass} aria-labelledby="costs-ep-heading">
            <h2 id="costs-ep-heading" className="mb-3 text-base font-semibold text-fg">
              Por episódio
            </h2>
            {perEpisode.length === 0 ? (
              <p className="text-sm text-fg-muted">Sem custos por episódio ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <caption className="sr-only">Custo por episódio</caption>
                <thead>
                  <tr className="text-left text-xs uppercase text-fg-subtle">
                    <th scope="col" className="py-1 pr-3">Ep.</th>
                    <th scope="col" className="py-1 pr-3">Custo</th>
                    <th scope="col" className="py-1 pr-3">% do total</th>
                    <th scope="col" className="w-1/2 py-1"><span className="sr-only">Proporção</span></th>
                  </tr>
                </thead>
                <tbody>
                  {perEpisode.map((x) => (
                    <tr key={x.episode_number}>
                      <td className="py-1 pr-3 text-fg">{x.episode_number}</td>
                      <td className="py-1 pr-3 text-fg">{formatUsd(x.cost_usd)}</td>
                      <td className="py-1 pr-3 text-fg-muted">{costs.total_usd > 0 ? Math.round((x.cost_usd / costs.total_usd) * 100) : 0}%</td>
                      <td className="py-1"><Bar value={x.cost_usd} max={epMax} label={`Ep. ${x.episode_number}: ${formatUsd(x.cost_usd)}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className={cardClass} aria-labelledby="costs-recent-heading">
            <h2 id="costs-recent-heading" className="mb-3 text-base font-semibold text-fg">
              Últimas {costs.recent.length} operações
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <caption className="sr-only">Últimas operações de IA e seus custos</caption>
                <thead>
                  <tr className="text-left text-xs uppercase text-fg-subtle">
                    {["Data", "Tipo", "Provedor", "Modelo", "Episódio", "Custo"].map((h) => (
                      <th key={h} scope="col" className="py-1 pr-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {costs.recent.map((ev, i) => (
                    <tr key={ev.id ?? i}>
                      <td className="whitespace-nowrap py-1 pr-3 text-fg-muted">{formatDateTimeShort(ev.created_at)}</td>
                      <td className="py-1 pr-3 text-fg">{KIND_LABELS[ev.kind] ?? ev.kind}</td>
                      <td className="py-1 pr-3 text-fg-muted">{ev.provider ?? "—"}</td>
                      <td className="py-1 pr-3 text-fg-muted">{ev.model ?? "—"}</td>
                      <td className="py-1 pr-3 text-fg-muted">{ev.episode_number ?? "—"}</td>
                      <td className="whitespace-nowrap py-1 text-fg">{formatUsd(ev.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
