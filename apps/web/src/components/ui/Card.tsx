import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article" | "li";
  /** Clickable cards (channel, series): lift on hover. */
  interactive?: boolean;
  padded?: boolean;
};

export function Card({ as: Tag = "div", interactive = false, padded = true, className = "", ...rest }: CardProps) {
  return (
    <Tag
      className={`rounded-xl border border-border bg-surface shadow-card dark:shadow-none dark:ring-1 dark:ring-white/5 ${
        padded ? "p-4 sm:p-5" : ""
      } ${
        interactive
          ? "transition-shadow duration-200 hover:border-border-strong hover:shadow-card-hover motion-reduce:transition-none"
          : ""
      } ${className}`}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  action,
  id,
  description,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  description?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="text-base font-semibold text-fg">
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
