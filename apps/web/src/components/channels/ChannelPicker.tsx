"use client";

import { Icon } from "@/components/ui/Icon";
import { MenuItem, Popover } from "@/components/ui/Popover";
import { useChannelContext } from "@/lib/channel-context";

/** Global channel filter, shown in the sidebar (popover listbox-style menu).
 * "Todos os canais" clears the filter (empty string) everywhere the context is read. */
export function ChannelPicker() {
  const { channels, selectedChannelId, setSelectedChannelId, loading, selectedChannel } = useChannelContext();
  const current = selectedChannel ? selectedChannel.name : "Todos os canais";

  return (
    <div className="flex flex-col gap-1">
      <span className="px-1 text-xs font-medium text-fg-subtle md:group-data-[collapsed=true]/sb:hidden">Canal</span>
      <Popover
        label="Escolher canal"
        minWidth={224}
        renderTrigger={(props) => (
          <button
            type="button"
            {...props}
            disabled={loading}
            title={`Canal: ${current}`}
            aria-label={`Canal: ${current}. Alterar`}
            className="focus-ring flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-left text-sm font-medium text-fg transition-colors hover:bg-border disabled:opacity-60 md:group-data-[collapsed=true]/sb:justify-center md:group-data-[collapsed=true]/sb:px-0"
          >
            {selectedChannel ? (
              <ChannelColorDot color={selectedChannel.color} />
            ) : (
              <Icon name="layers" size={16} className="text-fg-subtle" />
            )}
            <span className="min-w-0 flex-1 truncate md:group-data-[collapsed=true]/sb:hidden">{current}</span>
            <Icon name="chevronDown" size={16} className="text-fg-subtle md:group-data-[collapsed=true]/sb:hidden" />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuItem
              checked={selectedChannelId === ""}
              onSelect={() => {
                setSelectedChannelId("");
                close();
              }}
              icon={<Icon name="layers" size={16} />}
            >
              Todos os canais
            </MenuItem>
            {channels.map((channel) => (
              <MenuItem
                key={channel.id}
                checked={selectedChannelId === channel.id}
                onSelect={() => {
                  setSelectedChannelId(channel.id);
                  close();
                }}
                icon={<ChannelColorDot color={channel.color} />}
              >
                {channel.name}
              </MenuItem>
            ))}
          </>
        )}
      </Popover>
    </div>
  );
}

/** Small inline swatch for a channel's color, used across lists/cards. */
export function ChannelColorDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
      style={{ backgroundColor: color ?? "#94a3b8" }}
    />
  );
}
