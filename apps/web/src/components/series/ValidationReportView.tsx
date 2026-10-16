import { Badge } from "@/components/ui/Badge";
import { VALIDATION_CODE_LABELS, type EpisodeScript, type ValidationReport } from "@/lib/series";
import { ProgressMeter } from "@/components/series/common";

const SCORE_LABELS: Record<string, string> = {
  premise_fidelity: "Fidelidade",
  coherence: "Coerência",
  interest: "Interesse",
  outline_adherence: "Aderência à sinopse",
};

export function blockerCount(v: ValidationReport | null): number {
  return v?.issues.filter((i) => i.severity === "blocker").length ?? 0;
}

export function ValidationReportView({
  validation,
  attempts,
  script,
  onJumpToScene,
}: {
  validation: ValidationReport | null;
  attempts: number;
  script: EpisodeScript | null;
  onJumpToScene: (position: number) => void;
}) {
  if (!validation) {
    return <p className="text-sm text-slate-600 dark:text-slate-300">Ainda não validado.</p>;
  }
  const blockers = validation.issues.filter((i) => i.severity === "blocker");
  const warnings = validation.issues.filter((i) => i.severity === "warning");
  const issues = [...blockers, ...warnings];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {blockers.length === 0 ? (
          <Badge variant="success">
            <span aria-hidden="true">✔</span> Sem bloqueios
          </Badge>
        ) : (
          <Badge variant="danger">
            {blockers.length} {blockers.length === 1 ? "bloqueio" : "bloqueios"}, {warnings.length} {warnings.length === 1 ? "aviso" : "avisos"}
          </Badge>
        )}
        {blockers.length === 0 && warnings.length > 0 ? <Badge variant="warning">{warnings.length} {warnings.length === 1 ? "aviso" : "avisos"}</Badge> : null}
        {attempts > 0 ? <span className="text-xs text-slate-500 dark:text-slate-400">Tentativa {Math.min(attempts, 3)} de 3</span> : null}
      </div>

      {validation.scores ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.entries(validation.scores).map(([k, v]) =>
            typeof v === "number" ? (
              <li key={k} className="flex flex-col gap-1">
                <span className="flex justify-between text-xs text-slate-700 dark:text-slate-200">
                  <span>{SCORE_LABELS[k] ?? k}</span>
                  <span>{v.toFixed(2)}</span>
                </span>
                <ProgressMeter value={v} max={1} label={`${SCORE_LABELS[k] ?? k}: ${v.toFixed(2)}`} tone={v < 0.6 ? "red" : v < 0.8 ? "amber" : "emerald"} />
              </li>
            ) : null,
          )}
        </ul>
      ) : null}

      {issues.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {issues.map((issue, i) => {
            const position =
              issue.scene_index != null && script ? script.scenes.findIndex((s) => s.index === issue.scene_index) : -1;
            return (
              <li key={i} className="flex flex-col gap-1 rounded-md border border-slate-200 p-2 text-sm dark:border-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={issue.severity === "blocker" ? "danger" : "warning"}>{issue.severity === "blocker" ? "Bloqueio" : "Aviso"}</Badge>
                  <span className="font-medium text-slate-900 dark:text-slate-50">{VALIDATION_CODE_LABELS[issue.code] ?? issue.code}</span>
                  {issue.scene_index != null ? (
                    position >= 0 ? (
                      <button type="button" onClick={() => onJumpToScene(position)} className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                        Cena {position + 1}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">Cena {issue.scene_index}</span>
                    )
                  ) : null}
                </div>
                <p className="text-slate-700 dark:text-slate-200">{issue.message}</p>
                {issue.suggestion ? <p className="text-xs text-slate-600 dark:text-slate-300">Sugestão: {issue.suggestion}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
