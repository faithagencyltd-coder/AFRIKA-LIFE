import { signed } from "@/game/format";
import { effectEntries, NEEDS } from "@/game/needs";
import type { Effects } from "@/game/types";

export function EffectChips({ effects, tone = "light" }: { effects: Effects; tone?: "light" | "dark" }) {
  return (
    <>
      {effectEntries(effects).map(({ key, value }) => (
        <span
          key={key}
          title={NEEDS[key].label}
          className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
            tone === "dark" ? "bg-white/15 text-white" : value > 0 ? "bg-foret/10 text-foret" : "bg-red-50 text-red-700"
          }`}
        >
          {NEEDS[key].icon} {signed(value)}
        </span>
      ))}
    </>
  );
}
