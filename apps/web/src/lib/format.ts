/** USD in pt-BR: "US$ 0,60"; 4 decimals under US$ 0,01 (spec: custo visível antes de ser gasto). */
export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const digits = value > 0 && value < 0.01 ? 4 : 2;
  return `US$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** "16/10 18:00" in the given IANA timezone (falls back to browser tz). */
export function formatDateTimeShort(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

/** "16/10 (qui)" for a date-only ISO string ("2026-10-16"). */
export function formatDateShort(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  const dm = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const wd = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return `${dm} (${wd})`;
}
