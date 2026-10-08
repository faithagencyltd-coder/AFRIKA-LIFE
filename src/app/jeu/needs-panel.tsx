import { mostUrgentNeed, NEED_KEYS, NEEDS, needLevel } from "@/game/needs";
import type { Needs } from "@/game/types";

const BAR: Record<ReturnType<typeof needLevel>, string> = {
  critique: "bg-red-600",
  bas: "bg-ocre",
  correct: "bg-indigo",
  bon: "bg-foret",
};

export function NeedsPanel({ needs }: { needs: Needs }) {
  const urgent = mostUrgentNeed(needs);
  const showTip = needs[urgent] < 35;
  return (
    <section aria-label="Besoins" className="rounded-2xl bg-papyrus p-3 ring-1 ring-encre/5">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
        {NEED_KEYS.map((key) => {
          const value = needs[key];
          const level = needLevel(value);
          return (
            <div key={key}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  <span aria-hidden>{NEEDS[key].icon}</span> {NEEDS[key].label}
                </span>
                <span className={`font-mono tabular-nums ${level === "critique" ? "font-bold text-red-700" : "text-brume"}`}>{Math.round(value)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-encre/10" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={NEEDS[key].label}>
                <div className={`h-full rounded-full transition-all duration-700 ${BAR[level]}`} style={{ width: `${Math.max(2, value)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {showTip && (
        <p className="mt-3 rounded-xl bg-ocre/15 px-3 py-2 text-xs">
          <strong>
            {NEEDS[urgent].icon} {NEEDS[urgent].label} au plus bas.
          </strong>{" "}
          {NEEDS[urgent].hint}
        </p>
      )}
    </section>
  );
}
