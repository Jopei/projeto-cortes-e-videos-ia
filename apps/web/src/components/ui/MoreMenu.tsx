"use client";

import { Icon } from "@/components/ui/Icon";
import { MenuItem, Popover } from "@/components/ui/Popover";

export type MoreMenuItem = { label: string; onSelect: () => void; danger?: boolean; disabled?: boolean };

/** "..." overflow menu for secondary/destructive row actions. */
export function MoreMenu({
  items,
  label,
  buttonLabel = "Mais ações",
  withText = false,
}: {
  items: MoreMenuItem[];
  /** Accessible name of the menu, e.g. "Ações de Fulano". */
  label: string;
  buttonLabel?: string;
  /** Renders "Ações" text next to the icon (series header). */
  withText?: boolean;
}) {
  return (
    <Popover
      label={label}
      placement="bottom-end"
      minWidth={176}
      renderTrigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={withText ? undefined : `${buttonLabel}: ${label}`}
          className={
            withText
              ? "btn btn-secondary"
              : "btn btn-ghost btn-sm !px-2"
          }
        >
          <Icon name="more" size={18} />
          {withText ? "Ações" : null}
        </button>
      )}
    >
      {(close) =>
        items.map((item) => (
          <MenuItem
            key={item.label}
            danger={item.danger}
            disabled={item.disabled}
            onSelect={() => {
              close();
              item.onSelect();
            }}
          >
            {item.label}
          </MenuItem>
        ))
      }
    </Popover>
  );
}
