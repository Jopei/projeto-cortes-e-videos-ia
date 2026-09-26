"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { useChannelContext } from "@/lib/channel-context";
import { PLATFORM_LABELS, type Channel } from "@/lib/channels";
import { listPublications, type Publication } from "@/lib/publications";
import { ChannelColorDot } from "@/components/channels/ChannelPicker";
import { Dialog } from "@/components/ui/Dialog";
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
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            ← Semana anterior
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setWeekStart((prev) => addDays(prev, 7))}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Próxima semana →
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {weekDays[0].toLocaleDateString("pt-BR")} – {weekDays[6].toLocaleDateString("pt-BR")}
        </p>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
        {channels.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <ChannelColorDot color={c.color} /> {c.name}
          </span>
        ))}
      </div>

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhuma publicação agendada"
          description="Publique cortes aprovados na tela de Revisão para vê-los aqui."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
          {weekDays.map((day) => {
            const dayItems = itemsByDay.get(day.toDateString()) ?? [];
            return (
              <div key={day.toISOString()} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                  {WEEKDAY_FULL[(day.getDay() + 6) % 7]} · {day.toLocaleDateString("pt-BR")}
                </p>
                {dayItems.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-600">—</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {dayItems.map((item) => {
                      const when = new Date(item.scheduled_at ?? item.published_at ?? "");
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setDetailItem(item)}
                            className="flex w-full items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-left text-xs hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:hover:bg-slate-900"
                          >
                            <ChannelColorDot color={item.channel?.color ?? null} />
                            <span className="font-medium">
                              {when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className="truncate text-slate-600 dark:text-slate-300">
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
            <dt className="font-medium text-slate-500 dark:text-slate-400">Canal</dt>
            <dd>{detailItem.channel?.name ?? "—"}</dd>
            <dt className="font-medium text-slate-500 dark:text-slate-400">Plataforma</dt>
            <dd>{PLATFORM_LABELS[detailItem.platform]}</dd>
            <dt className="font-medium text-slate-500 dark:text-slate-400">Status</dt>
            <dd>
              <PublicationStatusBadge status={detailItem.status} />
            </dd>
            <dt className="font-medium text-slate-500 dark:text-slate-400">Agendado para</dt>
            <dd>{detailItem.scheduled_at ? new Date(detailItem.scheduled_at).toLocaleString("pt-BR") : "—"}</dd>
            <dt className="font-medium text-slate-500 dark:text-slate-400">Publicado em</dt>
            <dd>{detailItem.published_at ? new Date(detailItem.published_at).toLocaleString("pt-BR") : "—"}</dd>
            {detailItem.external_url ? (
              <>
                <dt className="font-medium text-slate-500 dark:text-slate-400">Link</dt>
                <dd>
                  <a href={detailItem.external_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline dark:text-indigo-400">
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
