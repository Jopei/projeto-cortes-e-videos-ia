"use client";

import { useChannelContext } from "@/lib/channel-context";

/** Global channel filter, shown in the sidebar. Selecting "Todos os canais"
 * clears the filter (empty string) everywhere that reads from the context. */
export function ChannelPicker() {
  const { channels, selectedChannelId, setSelectedChannelId, loading, selectedChannel } = useChannelContext();

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="global-channel-picker" className="px-1 text-xs font-medium text-fg-subtle">
        Canal
      </label>
      <div className="relative">
        {selectedChannel ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
            <ChannelColorDot color={selectedChannel.color} />
          </span>
        ) : null}
        <select
          id="global-channel-picker"
          value={selectedChannelId}
          onChange={(e) => setSelectedChannelId(e.target.value)}
          disabled={loading}
          className={`field-control w-full bg-surface-2 text-sm font-medium ${selectedChannel ? "pl-8" : ""}`}
        >
          <option value="">Todos os canais</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
      </div>
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
