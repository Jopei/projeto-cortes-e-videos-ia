"use client";

import { forwardRef } from "react";
import { Badge } from "@/components/ui/Badge";
import { formatUsd } from "@/lib/format";
import {
  CHARACTER_STATUS_SYMBOLS,
  countWords,
  type Bible,
  type Character,
  type EpisodeScript,
  type ProvidersResponse,
  type Scene,
  type SeriesDetail,
} from "@/lib/series";
import { hintClass, inputClass, labelClass, secondaryButton } from "@/components/series/common";

const TARGET_S: [number, number] = [26, 34];
const TARGET_WORDS: [number, number] = [55, 85];

function rangeTone(value: number, [min, max]: [number, number]): string {
  if (value >= min && value <= max) return "text-emerald-700 dark:text-emerald-300";
  if (value >= min - 3 && value <= max + 5) return "text-amber-700 dark:text-amber-300";
  return "text-red-700 dark:text-red-300";
}

function rangeText(value: number, [min, max]: [number, number]): string {
  return value >= min && value <= max ? "dentro do alvo" : value < min ? "abaixo do alvo" : "acima do alvo";
}

export function ScriptTotals({ script }: { script: EpisodeScript }) {
  const duration = script.scenes.reduce((a, s) => a + (Number(s.duration_s) || 0), 0);
  const words = script.scenes.reduce((a, s) => a + countWords(s.narration), 0);
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <span className={rangeTone(duration, TARGET_S)}>
        Duração: {duration.toFixed(1).replace(".", ",")} s (alvo {TARGET_S[0]}–{TARGET_S[1]} s, {rangeText(duration, TARGET_S)})
      </span>
      <span className={rangeTone(words, TARGET_WORDS)}>
        Palavras: {words} (alvo {TARGET_WORDS[0]}–{TARGET_WORDS[1]}, {rangeText(words, TARGET_WORDS)})
      </span>
    </p>
  );
}

function CharacterChips({ keys, characters }: { keys: string[]; characters: Character[] }) {
  if (keys.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1">
      {keys.map((k) => {
        const c = characters.find((x) => x.key === k);
        return (
          <li key={k} className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
            {c?.status === "dead" ? <span aria-label="morto">{CHARACTER_STATUS_SYMBOLS.dead} </span> : null}
            {c?.name ?? k}
          </li>
        );
      })}
    </ul>
  );
}

export const SceneCard = forwardRef<HTMLLIElement, { scene: Scene; position: number; characters: Character[]; bible: Bible | null }>(function SceneCard(
  { scene, position, characters, bible },
  ref,
) {
  const location = bible?.world.locations.find((l) => l.key === scene.location_key);
  return (
    <li ref={ref} tabIndex={-1} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-900 dark:text-slate-50">Cena {position + 1}</span>
        <span className="text-xs text-slate-600 dark:text-slate-300">{Number(scene.duration_s).toFixed(1).replace(".", ",")} s</span>
        <Badge variant={scene.visual_mode === "video" ? "info" : "neutral"}>
          <span aria-hidden="true">{scene.visual_mode === "video" ? "▶" : "▣"}</span>
          {scene.visual_mode === "video" ? "Vídeo" : "Imagem"}
        </Badge>
        {scene.is_flashback ? <Badge variant="warning">Flashback</Badge> : null}
        <span className="text-xs text-slate-500 dark:text-slate-400">{countWords(scene.narration)} palavras</span>
      </div>
      <CharacterChips keys={scene.characters_on_screen} characters={characters} />
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {[location?.name ? `Local: ${location.name}` : null, scene.camera ? `Câmera: ${scene.camera}` : null, scene.mood ? `Clima: ${scene.mood}` : null].filter(Boolean).join(" · ")}
      </p>
      <p className="text-slate-900 dark:text-slate-100">
        <span className="font-medium">Narração:</span> {scene.narration}
      </p>
      <p className="text-slate-700 dark:text-slate-200">
        <span className="font-medium">Visual:</span> {scene.visual_prompt}
      </p>
    </li>
  );
});

export function ScriptEditor({
  script,
  series,
  providers,
  onChange,
}: {
  script: EpisodeScript;
  series: SeriesDetail;
  providers: ProvidersResponse | null;
  onChange: (next: EpisodeScript) => void;
}) {
  const characters = series.characters;
  const locations = series.bible?.world.locations ?? [];
  const video = providers?.video.find((p) => p.id === series.video_provider);
  const image = providers?.image.find((p) => p.id === series.image_provider);
  const videoScenes = script.scenes.filter((s) => s.visual_mode === "video").length;
  const base = script.scenes.length ? Math.min(...script.scenes.map((s) => s.index)) : 0;

  function reindex(scenes: Scene[]): Scene[] {
    return scenes.map((s, i) => ({ ...s, index: base + i }));
  }
  function setScene(i: number, patch: Partial<Scene>) {
    onChange({ ...script, scenes: script.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  }
  function move(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= script.scenes.length) return;
    const scenes = [...script.scenes];
    [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
    onChange({ ...script, scenes: reindex(scenes) });
  }
  function remove(i: number) {
    if (script.scenes.length <= 3) return;
    if (!window.confirm(`Remover a cena ${i + 1}?`)) return;
    onChange({ ...script, scenes: reindex(script.scenes.filter((_, j) => j !== i)) });
  }
  function add() {
    if (script.scenes.length >= 6) return;
    const next: Scene = {
      index: base + script.scenes.length,
      duration_s: 5,
      narration: "",
      visual_prompt: "",
      visual_mode: "image",
      characters_on_screen: [],
      location_key: null,
      camera: "",
      mood: "",
      is_flashback: false,
    };
    onChange({ ...script, scenes: [...script.scenes, next] });
  }

  const videoImpact = (s: Scene): number | null => {
    if (!video || !image || video.est_cost_usd == null || image.est_cost_usd == null) return null;
    return video.est_cost_usd * Number(s.duration_s || 0) - image.est_cost_usd;
  };

  return (
    <div className="flex flex-col gap-3">
      <ScriptTotals script={script} />
      {series.visual_strategy === "hybrid" && videoScenes > series.max_video_scenes_per_episode ? (
        <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
          Atenção: {videoScenes} cenas em vídeo; o limite desta série é {series.max_video_scenes_per_episode} por episódio.
        </p>
      ) : null}
      <ol className="flex flex-col gap-3">
        {script.scenes.map((s, i) => {
          const id = `scene-${i}`;
          const impact = s.visual_mode === "video" ? videoImpact(s) : null;
          return (
            <li key={i} data-scene-position={i} tabIndex={-1} className="flex flex-col gap-3 rounded-md border border-slate-300 p-3 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-600">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">Cena {i + 1}</span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={secondaryButton} aria-label={`Subir cena ${i + 1}`}>
                    Subir
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === script.scenes.length - 1} className={secondaryButton} aria-label={`Descer cena ${i + 1}`}>
                    Descer
                  </button>
                  <button type="button" onClick={() => remove(i)} disabled={script.scenes.length <= 3} className={secondaryButton} aria-label={`Remover cena ${i + 1}`}>
                    Remover cena
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor={`${id}-narration`} className={labelClass}>
                  Narração <span className="font-normal text-slate-500">({countWords(s.narration)} palavras)</span>
                </label>
                <textarea id={`${id}-narration`} rows={3} value={s.narration} onChange={(e) => setScene(i, { narration: e.target.value })} className={inputClass} />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <label htmlFor={`${id}-visual`} className={labelClass}>
                    Prompt visual (em inglês)
                  </label>
                  <span className="text-xs text-slate-500">{s.visual_prompt.length}/600</span>
                </div>
                <textarea id={`${id}-visual`} rows={3} maxLength={600} value={s.visual_prompt} onChange={(e) => setScene(i, { visual_prompt: e.target.value })} className={inputClass} aria-describedby={`${id}-visual-hint`} />
                <p id={`${id}-visual-hint`} className={hintClass}>
                  Descreva só o visual. Sem texto na tela, sem falas.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <fieldset className="flex flex-col gap-1">
                  <legend className={labelClass}>Modo visual</legend>
                  <div className="flex gap-4">
                    {(["video", "image"] as const).map((m) => (
                      <label key={m} className="flex items-center gap-1.5 text-sm text-slate-800 dark:text-slate-100">
                        <input type="radio" name={`${id}-mode`} checked={s.visual_mode === m} onChange={() => setScene(i, { visual_mode: m })} className="h-4 w-4" />
                        {m === "video" ? "Vídeo" : "Imagem"}
                      </label>
                    ))}
                  </div>
                  {impact != null ? <p className={hintClass}>Vídeo {impact >= 0 ? "+" : "−"}{formatUsd(Math.abs(impact))} nesta cena</p> : null}
                </fieldset>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${id}-duration`} className={labelClass}>
                    Duração (s)
                  </label>
                  {s.visual_mode === "video" && video?.allowed_durations?.length ? (
                    <select id={`${id}-duration`} value={String(s.duration_s)} onChange={(e) => setScene(i, { duration_s: Number(e.target.value) })} className={inputClass}>
                      {Array.from(new Set([...video.allowed_durations, Number(s.duration_s)])).sort((a, b) => a - b).map((d) => (
                        <option key={d} value={d}>
                          {d} s
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input id={`${id}-duration`} type="number" min={1} max={15} step="0.5" value={s.duration_s} onChange={(e) => setScene(i, { duration_s: Number(e.target.value) })} className={inputClass} />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${id}-location`} className={labelClass}>
                    Local
                  </label>
                  <select id={`${id}-location`} value={s.location_key ?? ""} onChange={(e) => setScene(i, { location_key: e.target.value || null })} className={inputClass}>
                    <option value="">Sem local fixo</option>
                    {locations.map((l) => (
                      <option key={l.key} value={l.key}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${id}-camera`} className={labelClass}>
                    Câmera
                  </label>
                  <input id={`${id}-camera`} maxLength={80} value={s.camera} onChange={(e) => setScene(i, { camera: e.target.value })} className={inputClass} />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${id}-mood`} className={labelClass}>
                    Clima
                  </label>
                  <input id={`${id}-mood`} maxLength={40} value={s.mood} onChange={(e) => setScene(i, { mood: e.target.value })} className={inputClass} />
                </div>
                <label className="flex items-center gap-2 self-end text-sm text-slate-800 dark:text-slate-100">
                  <input type="checkbox" checked={s.is_flashback} onChange={(e) => setScene(i, { is_flashback: e.target.checked })} className="h-4 w-4" />
                  Flashback
                </label>
              </div>

              <fieldset className="flex flex-col gap-1">
                <legend className={labelClass}>Personagens em cena</legend>
                <div className="flex flex-wrap gap-3">
                  {characters.map((c) => (
                    <label key={c.key} className="flex items-center gap-1.5 text-sm text-slate-800 dark:text-slate-100">
                      <input
                        type="checkbox"
                        checked={s.characters_on_screen.includes(c.key)}
                        onChange={(e) =>
                          setScene(i, {
                            characters_on_screen: e.target.checked ? [...s.characters_on_screen, c.key] : s.characters_on_screen.filter((k) => k !== c.key),
                          })
                        }
                        className="h-4 w-4"
                      />
                      {c.status === "dead" ? `${CHARACTER_STATUS_SYMBOLS.dead} ` : ""}
                      {c.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      <button type="button" onClick={add} disabled={script.scenes.length >= 6} className={`${secondaryButton} self-start`}>
        Adicionar cena
      </button>
    </div>
  );
}
