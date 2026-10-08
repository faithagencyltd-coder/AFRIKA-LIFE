import { formatRealRemaining } from "@/game/clock";
import { fcfa } from "@/game/format";
import type { CurrentActivity } from "@/game/types";

import { EffectChips } from "./effect-chips";

const ICON = { activity: "⏳", travel: "🛣️", work: "💼" } as const;

export function BusyCard({ activity, now }: { activity: CurrentActivity; now: number }) {
  const start = Date.parse(activity.started_at);
  const end = Date.parse(activity.ends_at);
  const progress = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
  const done = now >= end;
  return (
    <section aria-live="polite" className="rounded-2xl bg-indigo p-4 text-white shadow-lg shadow-indigo/25">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{done ? "Terminé" : "En cours"}</p>
          <p className="font-bold">
            {ICON[activity.kind]} {activity.label}
          </p>
        </div>
        <p className="shrink-0 font-mono text-lg font-bold tabular-nums">{done ? "✓" : formatRealRemaining(end - now)}</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full bg-ocre transition-[width] duration-1000 ease-linear" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/85">
        {activity.earn ? <span className="rounded-full bg-foret px-2 py-0.5 font-semibold">+{fcfa(activity.earn)} à la fin</span> : null}
        <EffectChips effects={activity.effects} tone="dark" />
      </div>
    </section>
  );
}
