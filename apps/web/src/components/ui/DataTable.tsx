import { TD_CLASS, TH_CLASS, THEAD_CLASS, TR_CLASS } from "@/components/ui/Table";

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Right-aligned, tabular numbers. */
  numeric?: boolean;
  /** The main field: becomes the card title on mobile (and is not repeated in the label list). */
  primary?: boolean;
  /** Skip this column in the mobile card. */
  hideOnMobile?: boolean;
  className?: string;
};

/** Responsive data table: a real <table> from `md`, cards below it (title = the
 * `primary` column, other fields as label/value pairs, actions at the bottom). */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  actions,
  actionsHeader = "Ações",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  actions?: (row: T) => React.ReactNode;
  actionsHeader?: string;
}) {
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const secondary = columns.filter((c) => c !== primary && !c.hideOnMobile);
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className="rounded-xl border border-border bg-surface p-4 shadow-card dark:shadow-none"
          >
            <div className="font-medium text-fg">{primary.cell(row)}</div>
            <dl className="mt-3 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-2 text-sm">
              {secondary.map((c) => (
                <div key={c.id} className="contents">
                  <dt className="text-fg-subtle">{c.header}</dt>
                  <dd className="min-w-0 break-words text-fg-muted">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
            {actions ? <div className="mt-3 flex flex-wrap items-center gap-2">{actions(row)}</div> : null}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface shadow-card dark:shadow-none md:block">
        <table className="w-full min-w-full border-collapse text-sm tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead className={THEAD_CLASS}>
            <tr>
              {columns.map((c) => (
                <th key={c.id} scope="col" className={`${TH_CLASS} ${c.numeric ? "text-right" : ""}`}>
                  {c.header}
                </th>
              ))}
              {actions ? (
                <th scope="col" className={`${TH_CLASS} text-right`}>
                  {actionsHeader}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className={TR_CLASS}>
                {columns.map((c) => (
                  <td
                    key={c.id}
                    className={`${TD_CLASS} ${c.primary ? "font-medium text-fg" : ""} ${c.numeric ? "text-right" : ""} ${c.className ?? ""}`}
                  >
                    {c.cell(row)}
                  </td>
                ))}
                {actions ? (
                  <td className={`${TD_CLASS} whitespace-nowrap`}>
                    <div className="flex items-center justify-end gap-1">{actions(row)}</div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
