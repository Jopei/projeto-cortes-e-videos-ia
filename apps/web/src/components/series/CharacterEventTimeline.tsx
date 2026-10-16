"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { CHARACTER_STATUS_LABELS, CHARACTER_STATUS_SYMBOLS, type Character, type CharacterEvent } from "@/lib/series";
import { hintClass, linkClass } from "@/components/series/common";

type Row = CharacterEvent & { character: Character };

export function CharacterEventTimeline({ characters, onOpenEpisode }: { characters: Character[]; onOpenEpisode: (n: number) => void }) {
  const [who, setWho] = useState("");
  const [showDiscarded, setShowDiscarded] = useState(false);

  const rows = useMemo<Row[]>(
    () =>
      characters
        .filter((c) => !who || c.id === who)
        .flatMap((c) => c.events.map((e) => ({ ...e, character: c })))
        .filter((e) => showDiscarded || e.state !== "discarded")
        .sort((a, b) => a.episode_number - b.episode_number),
    [characters, who, showDiscarded],
  );

  function describe(e: Row): string {
    if (e.type === "introduce") return `${e.character.name} foi introduzido`;
    const to = e.to_status ? CHARACTER_STATUS_LABELS[e.to_status].toLowerCase() : "mudou";
    return `${e.character.name}: ${to}`;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className={hintClass}>Mortes e mudanças de status propostas pela IA só entram em vigor quando você aprova o vídeo do episódio.</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          Personagem
          <select value={who} onChange={(e) => setWho(e.target.value)} className="field-control">
            <option value="">Todos</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input type="checkbox" checked={showDiscarded} onChange={(e) => setShowDiscarded(e.target.checked)} className="h-4 w-4" />
          Mostrar descartados
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-fg-muted">Nenhum evento ainda.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((e) => (
            <li
              key={e.id}
              className={`flex flex-wrap items-start justify-between gap-2 rounded-lg border p-2 text-sm ${
                e.state === "proposed" ? "border-dashed border-amber-400" : e.state === "discarded" ? "border-border opacity-70" : "border-border-strong"
              }`}
            >
              <div className="min-w-0">
                <p className={`text-fg ${e.state === "discarded" ? "line-through" : ""}`}>
                  <span className="font-semibold">Ep. {e.episode_number}</span>{" "}
                  <span aria-hidden="true">{e.to_status ? CHARACTER_STATUS_SYMBOLS[e.to_status] : ""}</span> {describe(e)}
                </p>
                {e.description ? <p className="text-xs text-fg-muted">&ldquo;{e.description}&rdquo;</p> : null}
                <button type="button" onClick={() => onOpenEpisode(e.episode_number)} className={`${linkClass} text-xs`}>
                  Ver episódio
                </button>
              </div>
              {e.state === "applied" ? (
                <Badge variant="success">Aplicado</Badge>
              ) : e.state === "proposed" ? (
                <Badge variant="warning">Proposto — só vale ao aprovar o vídeo</Badge>
              ) : (
                <Badge variant="neutral">Descartado</Badge>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
