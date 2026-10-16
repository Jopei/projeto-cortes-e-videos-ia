"use client";

import { AiBadge } from "@/components/series/badges";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { useChannelContext } from "@/lib/channel-context";
import { PLATFORM_LABELS, type Channel } from "@/lib/channels";
import { listPublications, type Publication } from "@/lib/publications";
import { ChannelColorDot } from "@/components/channels/ChannelPicker";
import { Dialog } from "@/components/ui/Dialog";
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart((prev) => addDays(prev, -7))}
            className="btn btn-secondary btn-sm"
          >
            ← Semana anterior
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="btn btn-secondary btn-sm"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setWeekStart((prev) => addDays(prev, 7))}
            className="btn btn-secondary btn-sm"
          >
            Próxima semana →
          </button>
        </div>
        <p className="text-sm text-fg-subtle">
          {weekDays[0].toLocaleDateString("pt-BR")} – {weekDays[6].toLocaleDateString("pt-BR")}
        </p>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-fg-subtle">
        {channels.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <ChannelColorDot color={c.color} /> {c.name}
          </span>
        ))}
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : items.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Nenhuma publicação agendada"
          description="Publique cortes aprovados na tela de Revisão para vê-los aqui."
          action={<Button href="/cortes/revisao">Ir para Revisão</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
          {weekDays.map((day) => {
            const dayItems = itemsByDay.get(day.toDateString()) ?? [];
            return (
              <div key={day.toISOString()} className="flex flex-col gap-2 rounded-lg border border-border p-2">
                <p className="text-xs font-semibold uppercase text-fg-subtle">
                  {WEEKDAY_FULL[(day.getDay() + 6) % 7]} · {day.toLocaleDateString("pt-BR")}
                </p>
                {dayItems.length === 0 ? (
                  <p className="text-xs text-fg-subtle">—</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {dayItems.map((item) => {
                      const when = new Date(item.scheduled_at ?? item.published_at ?? "");
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setDetailItem(item)}
                            className="flex w-full items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-left text-xs hover:bg-surface-2 focus-ring"
                          >
                            <ChannelColorDot color={item.channel?.color ?? null} />
                            <span className="font-medium">
                              {when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="truncate text-fg-muted">
                              {PLATFORM_LABELS[item.platform]}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={detailItem !== null} onClose={() => setDetailItem(null)} title="Detalhe da publicação">
        {detailItem ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt className="font-medium text-fg-subtle">Canal</dt>
            <dd>{detailItem.channel?.name ?? "—"}</dd>
            <dt className="font-medium text-fg-subtle">Plataforma</dt>
            <dd>{PLATFORM_LABELS[detailItem.platform]}</dd>
            <dt className="font-medium text-fg-subtle">Status</dt>
            <dd>
              <span className="flex flex-wrap items-center gap-1.5">
                <PublicationStatusBadge status={detailItem.status} />
                {detailItem.synthetic_media ? <AiBadge /> : null}
              </span>
            </dd>
            <dt className="font-medium text-fg-subtle">Agendado para</dt>
            <dd>{detailItem.scheduled_at ? new Date(detailItem.scheduled_at).toLocaleString("pt-BR") : "—"}</dd>
            <dt className="font-medium text-fg-subtle">Publicado em</dt>
            <dd>{detailItem.published_at ? new Date(detailItem.published_at).toLocaleString("pt-BR") : "—"}</dd>
            {detailItem.external_url ? (
              <>
                <dt className="font-medium text-fg-subtle">Link</dt>
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
