"use client";

import { AiBadge } from "@/components/series/badges";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { useChannelContext } from "@/lib/channel-context";
import { PLATFORM_LABELS, type Channel } from "@/lib/channels";
import { listPublications, type Publication } from "@/lib/publications";
import { ChannelColorDot } from "@/components/channels/ChannelPicker";
import { Callout } from "@/components/ui/Callout";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { PublicationStatusBadge } from "@/components/ui/StatusBadges";

type AgendaItem = Publication & { channel: Channel | null };

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const WEEKDAY_FULL = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export function AgendaManager() {
  const { channels, selectedChannelId, selectedChannel } = useChannelContext();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<AgendaItem | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const targets = selectedChannelId
          ? [selectedChannel].filter((c): c is Channel => c !== null)
          : channels;

        if (targets.length === 0) {
          setItems([]);
          return;
        }

        const results = await Promise.all(
          targets.map(async (channel) => {
            const [scheduled, published] = await Promise.all([
              listPublications({ channel_id: channel.id, status: "scheduled" }, signal),
              listPublications({ channel_id: channel.id, status: "published" }, signal),
            ]);
            return [...scheduled, ...published].map((p) => ({ ...p, channel }));
          }),
        );
        setItems(results.flat());
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof ApiError ? err.message : "Não foi possível carregar a agenda.");
      } finally {
        setLoading(false);
      }
    },
    [channels, selectedChannelId, selectedChannel],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const item of items) {
      const when = item.scheduled_at ?? item.published_at;
      if (!when) continue;
      const date = new Date(when);
      const key = date.toDateString();
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    Array.from(map.values()).forEach((list) => {
      list.sort((a, b) => {
        const aTime = new Date(a.scheduled_at ?? a.published_at ?? 0).getTime();
        const bTime = new Date(b.scheduled_at ?? b.published_at ?? 0).getTime();
        return aTime - bTime;
      });
    });
    return map;
  }, [items]);

  const todayKey = new Date().toDateString();
  const rangeLabel = `${weekDays[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${weekDays[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Agenda"
        description="Calendário semanal das publicações agendadas e já publicadas, coloridas pelo canal de origem."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekStart((prev) => addDays(prev, -7))}
            aria-label="Semana anterior"
            className="btn btn-secondary !min-h-[40px] !w-10 !px-0"
          >
            <Icon name="chevronLeft" />
          </button>
          <p className="min-w-[11rem] px-2 text-center text-sm font-semibold tabular-nums text-fg" aria-live="polite">
            {rangeLabel}
          </p>
          <button
            type="button"
            onClick={() => setWeekStart((prev) => addDays(prev, 7))}
            aria-label="Próxima semana"
            className="btn btn-secondary !min-h-[40px] !w-10 !px-0"
          >
            <Icon name="chevronRight" />
          </button>
        </div>
        <Button variant="secondary" onClick={() => setWeekStart(startOfWeek(new Date()))}>
          Hoje
        </Button>
      </div>

      {channels.length > 0 ? (
        <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted" aria-label="Legenda de canais">
          {channels.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5">
              <ChannelColorDot color={c.color} /> {c.name}
            </li>
          ))}
        </ul>
      ) : null}

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <Callout variant="danger" role="alert" title="Não foi possível carregar a agenda">
          {error}
        </Callout>
      ) : items.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Nenhuma publicação agendada"
          description="Publique cortes aprovados na tela de Revisão para vê-los aqui."
          action={<Button href="/cortes/revisao">Ir para Revisão</Button>}
        />
      ) : (
        <ol className="grid grid-cols-1 gap-3 lg:grid-cols-7" aria-label="Dias da semana">
          {weekDays.map((day) => {
            const dayItems = itemsByDay.get(day.toDateString()) ?? [];
            const isToday = day.toDateString() === todayKey;
            return (
              <li
                key={day.toISOString()}
                aria-current={isToday ? "date" : undefined}
                className={`flex flex-col gap-2 rounded-xl border p-3 ${
                  isToday ? "border-primary/40 bg-primary-soft" : "border-border bg-surface"
                } ${dayItems.length === 0 ? "max-lg:py-2" : ""}`}
              >
                <p className="flex items-baseline justify-between gap-2 lg:flex-col lg:items-start lg:gap-0">
                  <span className={`text-sm font-semibold ${isToday ? "text-primary-text" : "text-fg"}`}>
                    {WEEKDAY_FULL[(day.getDay() + 6) % 7]}
                    {isToday ? <span className="ml-2 text-xs font-medium">hoje</span> : null}
                  </span>
                  <span className="text-xs tabular-nums text-fg-subtle">
                    {day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </span>
                </p>
                {dayItems.length === 0 ? (
                  <p className="text-xs text-fg-subtle max-lg:hidden">Sem publicações</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {dayItems.map((item) => {
                      const when = new Date(item.scheduled_at ?? item.published_at ?? "");
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setDetailItem(item)}
                            style={{ borderLeftColor: item.channel?.color ?? "#94a3b8" }}
                            className="focus-ring flex min-h-[44px] w-full flex-col items-start justify-center rounded-lg border border-l-4 border-border bg-surface px-3 py-1.5 text-left text-sm shadow-card transition-colors hover:bg-surface-2 dark:shadow-none lg:min-h-0"
                          >
                            <span className="font-semibold tabular-nums text-fg">
                              {when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="max-w-full truncate text-fg-muted">{PLATFORM_LABELS[item.platform]}</span>
                            {item.channel ? <span className="max-w-full truncate text-xs text-fg-subtle">{item.channel.name}</span> : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <Dialog open={detailItem !== null} onClose={() => setDetailItem(null)} title="Detalhe da publicação">
        {detailItem ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="text-fg-subtle">Canal</dt>
            <dd>{detailItem.channel?.name ?? "—"}</dd>
            <dt className="text-fg-subtle">Plataforma</dt>
            <dd>{PLATFORM_LABELS[detailItem.platform]}</dd>
            <dt className="text-fg-subtle">Status</dt>
            <dd>
              <span className="flex flex-wrap items-center gap-1.5">
                <PublicationStatusBadge status={detailItem.status} />
                {detailItem.synthetic_media ? <AiBadge /> : null}
              </span>
            </dd>
            <dt className="text-fg-subtle">Agendado para</dt>
            <dd>{detailItem.scheduled_at ? new Date(detailItem.scheduled_at).toLocaleString("pt-BR") : "—"}</dd>
            <dt className="text-fg-subtle">Publicado em</dt>
            <dd>{detailItem.published_at ? new Date(detailItem.published_at).toLocaleString("pt-BR") : "—"}</dd>
            {detailItem.external_url ? (
              <>
                <dt className="text-fg-subtle">Link</dt>
                <dd>
                  <a href={detailItem.external_url} target="_blank" rel="noreferrer" className="text-primary-text hover:underline">
                    Abrir
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </Dialog>
    </div>
  );
}
