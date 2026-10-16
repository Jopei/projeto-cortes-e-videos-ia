"use client";

import { useMemo, useState } from "react";
import {
  seriesApi,
  type Bible,
  type Character,
  type SeriesDetail,
} from "@/lib/series";
import { errorCode, seriesErrorMessage } from "@/lib/series-errors";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { CharacterCard, CharacterEditDialog, ReferenceImageDialog } from "@/components/series/CharacterParts";
import { CharacterEventTimeline } from "@/components/series/CharacterEventTimeline";
import { Field, Notice, cardClass, hintClass, inputClass, labelClass, primaryButton, secondaryButton } from "@/components/series/common";

const EDITABLE_STATUSES = ["planned", "active", "paused"];

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function slugKey(name: string, taken: Set<string>): string {
  const base = (name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "local").slice(0, 28).padEnd(2, "x");
  let key = base;
  let i = 2;
  while (taken.has(key)) key = `${base.slice(0, 28)}_${i++}`;
  return key;
}

export function BibleTab({
  series,
  onChanged,
  onOpenEpisode,
}: {
  series: SeriesDetail;
  onChanged: () => Promise<void> | void;
  onOpenEpisode: (n: number) => void;
}) {
  const { showToast } = useToast();
  const bible = series.bible;
  const [draft, setDraft] = useState<Bible | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editChar, setEditChar] = useState<Character | null>(null);
  const [imageChar, setImageChar] = useState<Character | null>(null);
  const [imageVersion, setImageVersion] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<"all" | "alive" | "dead" | "other">("all");

  const canEdit = EDITABLE_STATUSES.includes(series.status);
  const editing = draft !== null;
  const impacted = series.episodes.filter((e) => e.status === "script_ready" || e.status === "awaiting_script_approval").length;

  const dirty = useMemo(() => editing && bible !== null && JSON.stringify(draft) !== JSON.stringify(bible), [editing, draft, bible]);

  const characters = useMemo(() => {
    const rank = (c: Character) => (c.role === "protagonist" ? 0 : 1) * 10 + (c.status === "dead" ? 1 : 0);
    return [...series.characters]
      .filter((c) => (filter === "all" ? true : filter === "alive" ? c.status === "alive" : filter === "dead" ? c.status === "dead" : c.status !== "alive" && c.status !== "dead"))
      .sort((a, b) => rank(a) - rank(b));
  }, [series.characters, filter]);

  if (!bible) {
    return <p className="text-sm text-slate-600 dark:text-slate-300">A bíblia ainda não foi gerada.</p>;
  }

  const view = draft ?? bible;
  const update = (fn: (b: Bible) => void) =>
    setDraft((prev) => {
      if (!prev) return prev;
      const next = clone(prev);
      fn(next);
      return next;
    });

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await seriesApi.putBible(series.id, series.bible_version, draft);
      showToast("Bíblia salva.", "success");
      setDraft(null);
      setConfirmOpen(false);
      setConflict(null);
      await onChanged();
    } catch (err) {
      setConfirmOpen(false);
      if (errorCode(err) === "bible_version_conflict") setConflict(seriesErrorMessage(err));
      else setError(seriesErrorMessage(err, "Não foi possível salvar a bíblia."));
    } finally {
      setSaving(false);
    }
  }

  async function reloadDiscarding() {
    setDraft(null);
    setConflict(null);
    setError(null);
    await onChanged();
  }

  const ro = !editing;
  const flat = (label: string, id: string, value: string, set: (v: string) => void, opts?: { max?: number; rows?: number }) => (
    <Field
      id={id}
      label={label}
      counter={opts?.max && editing ? <span className="text-xs text-slate-500">{value.length}/{opts.max}</span> : undefined}
    >
      {ro ? (
        <p className="whitespace-pre-wrap text-sm text-slate-900 dark:text-slate-100">{value || "—"}</p>
      ) : opts?.rows ? (
        <textarea id={id} rows={opts.rows} maxLength={opts.max} value={value} onChange={(e) => set(e.target.value)} className={inputClass} />
      ) : (
        <input id={id} maxLength={opts?.max} value={value} onChange={(e) => set(e.target.value)} className={inputClass} />
      )}
    </Field>
  );

  return (
    <div className="flex flex-col gap-4 pb-16">
      {conflict ? (
        <Notice
          tone="danger"
          action={
            <button type="button" onClick={() => (dirty ? setDiscardOpen(true) : void reloadDiscarding())} className={secondaryButton}>
              Recarregar
            </button>
          }
        >
          {conflict}
        </Notice>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={hintClass}>
          {canEdit ? "Edite a bíblia para ajustar mundo, estilo e arco da temporada." : "A bíblia só pode ser editada com a série planejada, ativa ou pausada."}
        </p>
        {canEdit && !editing ? (
          <button type="button" onClick={() => setDraft(clone(bible))} className={secondaryButton}>
            Editar bíblia
          </button>
        ) : null}
      </div>

      <details open className={cardClass}>
        <summary className="cursor-pointer text-base font-semibold text-slate-900 dark:text-slate-50">Mundo</summary>
        <div className="mt-3 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {flat("Cenário", "bible-setting", view.world.setting, (v) => update((b) => void (b.world.setting = v)), { rows: 2 })}
            {flat("Época", "bible-era", view.world.era, (v) => update((b) => void (b.world.era = v)))}
          </div>
          <div className="flex flex-col gap-2">
            <span className={labelClass}>Regras do mundo</span>
            {view.world.rules.length === 0 && ro ? <p className="text-sm text-slate-500">—</p> : null}
            <ul className="flex flex-col gap-2">
              {view.world.rules.map((rule, i) => (
                <li key={i} className="flex items-start gap-2">
                  {ro ? (
                    <span className="text-sm text-slate-900 dark:text-slate-100">• {rule}</span>
                  ) : (
                    <>
                      <input aria-label={`Regra ${i + 1}`} value={rule} onChange={(e) => update((b) => void (b.world.rules[i] = e.target.value))} className={inputClass} />
                      <button type="button" onClick={() => update((b) => void b.world.rules.splice(i, 1))} className={secondaryButton} aria-label={`Remover regra ${i + 1}`}>
                        Remover
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {editing ? (
              <button type="button" onClick={() => update((b) => void b.world.rules.push(""))} className={`${secondaryButton} self-start`}>
                Adicionar regra
              </button>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <span className={labelClass}>Locais</span>
            <ul className="grid gap-3 md:grid-cols-2">
              {view.world.locations.map((loc, i) => (
                <li key={loc.key} className="flex flex-col gap-1 rounded-md border border-slate-200 p-2 dark:border-slate-700">
                  {ro ? (
                    <>
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-50">{loc.name}</span>
                      <span className="text-xs text-slate-600 dark:text-slate-300">{loc.visual_description}</span>
                    </>
                  ) : (
                    <>
                      <input aria-label={`Nome do local ${i + 1}`} value={loc.name} onChange={(e) => update((b) => void (b.world.locations[i].name = e.target.value))} className={inputClass} />
                      <textarea aria-label={`Descrição visual do local ${i + 1}`} rows={2} maxLength={300} value={loc.visual_description} onChange={(e) => update((b) => void (b.world.locations[i].visual_description = e.target.value))} className={inputClass} />
                      <button type="button" onClick={() => update((b) => void b.world.locations.splice(i, 1))} className={`${secondaryButton} self-start`}>
                        Remover local
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            {editing ? (
              <button
                type="button"
                onClick={() =>
                  update((b) => {
                    const key = slugKey("local novo", new Set(b.world.locations.map((l) => l.key)));
                    b.world.locations.push({ key, name: "Novo local", visual_description: "" });
                  })
                }
                className={`${secondaryButton} self-start`}
              >
                Adicionar local
              </button>
            ) : null}
          </div>
        </div>
      </details>

      <details open className={cardClass}>
        <summary className="cursor-pointer text-base font-semibold text-slate-900 dark:text-slate-50">Estilo</summary>
        <div className="mt-3 flex flex-col gap-4">
          {flat("Voz de narração", "bible-voice", view.style_guide.narration_voice, (v) => update((b) => void (b.style_guide.narration_voice = v)), { rows: 2 })}
          {flat("Estilo visual", "bible-visual", view.style_guide.visual_style, (v) => update((b) => void (b.style_guide.visual_style = v)), { max: 300, rows: 3 })}
          <ChipEditor
            label="Elementos proibidos"
            values={view.style_guide.banned_elements}
            editing={editing}
            onChange={(vals) => update((b) => void (b.style_guide.banned_elements = vals))}
          />
          <div className="flex flex-col gap-1">
            <span className={labelClass}>Premissa-núcleo (somente leitura)</span>
            <ul className="flex flex-wrap gap-1.5">
              {view.premise_core_elements.length === 0 ? <li className="text-sm text-slate-500">—</li> : null}
              {view.premise_core_elements.map((el) => (
                <li key={el} className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                  {el}
                </li>
              ))}
            </ul>
            <p className={hintClass}>Elementos da premissa original que a IA precisa respeitar. Não podem ser editados.</p>
          </div>
        </div>
      </details>

      <details open className={cardClass}>
        <summary className="cursor-pointer text-base font-semibold text-slate-900 dark:text-slate-50">Arco da temporada</summary>
        <div className="mt-3 flex flex-col gap-4">
          {flat("Tema", "bible-theme", view.season_arc.theme, (v) => update((b) => void (b.season_arc.theme = v)))}
          {flat("Pergunta central", "bible-question", view.season_arc.central_question, (v) => update((b) => void (b.season_arc.central_question = v)), { rows: 2 })}
          {flat("Resumo do final", "bible-ending", view.season_arc.ending_summary, (v) => update((b) => void (b.season_arc.ending_summary = v)), { rows: 3 })}
          <div className="flex flex-col gap-1">
            <span className={labelClass}>Fios abertos</span>
            <ul className="flex flex-col gap-1">
              {view.open_threads.length === 0 ? <li className="text-sm text-slate-500">Nenhum.</li> : null}
              {view.open_threads.map((t) => (
                <li key={t.key} className="flex flex-wrap items-center gap-2 text-sm text-slate-900 dark:text-slate-100">
                  <span>{t.description}</span>
                  <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
                    {t.closed_in != null ? `fechado no Ep. ${t.closed_in}` : `aberto desde Ep. ${t.introduced_in}${t.planned_resolution_in != null ? ` / previsto Ep. ${t.planned_resolution_in}` : ""}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      <section className={cardClass} aria-labelledby="characters-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="characters-heading" className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Personagens
          </h2>
          <div role="group" aria-label="Filtrar personagens" className="flex overflow-hidden rounded-md border border-slate-300 text-sm dark:border-slate-600">
            {(
              [
                ["all", "Todos"],
                ["alive", "Vivos"],
                ["dead", "Mortos"],
                ["other", "Outros"],
              ] as const
            ).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)} className={`min-h-[36px] px-3 py-1 font-medium ${filter === v ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {characters.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Nenhum personagem neste filtro.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {characters.map((c) => (
              <CharacterCard
                key={c.id}
                seriesId={series.id}
                character={c}
                imageVersion={imageVersion[c.id]}
                onEdit={() => setEditChar(c)}
                onImage={() => setImageChar(c)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className={cardClass} aria-labelledby="events-heading">
        <h2 id="events-heading" className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-50">
          Eventos de personagem
        </h2>
        <CharacterEventTimeline characters={series.characters} onOpenEpisode={onOpenEpisode} />
      </section>

      {editing ? (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 md:left-64">
          <span className="mr-auto text-xs text-slate-600 dark:text-slate-300">{dirty ? "Alterações não salvas" : "Sem alterações"}</span>
          <button type="button" onClick={() => (dirty ? setDiscardOpen(true) : setDraft(null))} className={secondaryButton}>
            Descartar
          </button>
          <button type="button" onClick={() => (impacted > 0 ? setConfirmOpen(true) : void save())} disabled={!dirty || saving} className={primaryButton}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      ) : null}

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Salvar bíblia">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Salvar a bíblia marca como Desatualizados os episódios com roteiro pronto ou aguardando aprovação ({impacted} {impacted === 1 ? "episódio" : "episódios"}). Eles serão reescritos.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" data-autofocus onClick={() => setConfirmOpen(false)} className={secondaryButton}>
              Voltar
            </button>
            <button type="button" onClick={save} disabled={saving} className={primaryButton}>
              {saving ? "Salvando…" : "Salvar mesmo assim"}
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog open={discardOpen} onClose={() => setDiscardOpen(false)} title="Descartar alterações">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700 dark:text-slate-200">Suas edições na bíblia serão perdidas.</p>
          <div className="flex justify-end gap-2">
            <button type="button" data-autofocus onClick={() => setDiscardOpen(false)} className={secondaryButton}>
              Voltar
            </button>
            <button
              type="button"
              onClick={() => {
                setDiscardOpen(false);
                void reloadDiscarding();
              }}
              className={primaryButton}
            >
              Descartar
            </button>
          </div>
        </div>
      </Dialog>

      {editChar ? (
        <CharacterEditDialog
          seriesId={series.id}
          character={editChar}
          onClose={() => setEditChar(null)}
          onSaved={async () => {
            setEditChar(null);
            await onChanged();
          }}
        />
      ) : null}
      {imageChar ? (
        <ReferenceImageDialog
          series={series}
          character={imageChar}
          imageVersion={imageVersion[imageChar.id]}
          onClose={() => setImageChar(null)}
          onChanged={async () => {
            setImageVersion((v) => ({ ...v, [imageChar.id]: Date.now() }));
            await onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function ChipEditor({ label, values, editing, onChange }: { label: string; values: string[]; editing: boolean; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  function add() {
    const v = text.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setText("");
  }
  return (
    <div className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <ul className="flex flex-wrap gap-1.5">
        {values.length === 0 ? <li className="text-sm text-slate-500">—</li> : null}
        {values.map((v) => (
          <li key={v} className="flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
            {v}
            {editing ? (
              <button type="button" aria-label={`Remover ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="font-semibold">
                <span aria-hidden="true">✕</span>
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {editing ? (
        <div className="flex gap-2">
          <input
            aria-label={`Adicionar a ${label}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className={inputClass}
          />
          <button type="button" onClick={add} className={secondaryButton}>
            Adicionar
          </button>
        </div>
      ) : null}
    </div>
  );
}

