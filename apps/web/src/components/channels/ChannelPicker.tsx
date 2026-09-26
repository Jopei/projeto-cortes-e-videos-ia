"use client";

import { useChannelContext } from "@/lib/channel-context";

/** Global channel filter, shown in the sidebar. Selecting "Todos os canais"
 * clears the filter (empty string) everywhere that reads from the context. */
export function ChannelPicker() {
  const { channels, selectedChannelId, setSelectedChannelId, loading } = useChannelContext();

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor="global-channel-picker"
        className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
      >
        Canal
      </label>
      <select
        id="global-channel-picker"
        value={selectedChannelId}
        onChange={(e) => setSelectedChannelId(e.target.value)}
        disabled={loading}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
      >
        <option value="">Todos os canais</option>
        {channels.map((channel) => (
          <option key={channel.id} value={channel.id}>
            {channel.name}
          </option>
        ))}
      </select>
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
