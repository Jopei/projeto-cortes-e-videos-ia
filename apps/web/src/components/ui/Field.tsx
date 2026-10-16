import { useId } from "react";

/** Label + control + help/error wrapper. Pass a render function to receive the
 * generated `id` and `aria-describedby` for the control. */
export function Field({
  label,
  help,
  error,
  required,
  children,
  className = "",
}: {
  label: string;
  help?: string;
  error?: string | null;
  required?: boolean;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean; "aria-required"?: boolean }) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const descId = `${id}-desc`;
  const hasDesc = Boolean(help || error);
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </label>
      {children({
        id,
        "aria-describedby": hasDesc ? descId : undefined,
        "aria-invalid": error ? true : undefined,
        "aria-required": required || undefined,
      })}
      {error ? (
        <p id={descId} className="text-sm text-danger">
          {error}
        </p>
      ) : help ? (
        <p id={descId} className="text-xs text-fg-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}
