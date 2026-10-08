import { CityMap } from "@/components/city-map";
import { formatGameDuration, realMsForGameMinutes } from "@/game/clock";
import { fcfa } from "@/game/format";
import { fr } from "@/i18n/fr";
import { travelTo } from "@/server/game-actions";

import { EffectChips } from "./effect-chips";
import type { GameContext } from "./game-screen";

export function MapTab({ ctx, focus, onFocus }: { ctx: GameContext; focus: string | null; onFocus: (code: string) => void }) {
  const { state, catalog } = ctx;
  const here = state.character.district_code;
  const selected = focus ?? here;
  const d = catalog.districts.find((x) => x.code === selected);
  const places = catalog.buildings.filter((b) => b.district_code === selected);
  const quotes = catalog.quotes.filter((q) => q.to_district === selected);
  const destination = state.character.activity?.to_district ?? null;

  return (
    <div className="space-y-4">
      <CityMap districts={catalog.districts} current={here} selected={selected} destination={destination} onSelect={onFocus} />
      {d && (
        <section className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
          <h2 className="text-lg font-black">{d.name}</h2>
          <p className="text-sm text-brume">{d.description}</p>
          <p className="mt-2 text-xs text-brume">{places.map((p) => p.name).join(" · ")}</p>

          {selected === here ? (
            <p className="mt-3 rounded-xl bg-terre/10 px-3 py-2 text-sm font-semibold text-terre">📍 {fr.game.youAreHere}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {quotes.map((q) => {
                const mode = catalog.modes.find((m) => m.code === q.mode_code);
                const realMin = Math.max(1, Math.round(realMsForGameMinutes(q.game_minutes, state.clock.time_scale) / 60_000));
                return (
                  <li key={q.mode_code} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 ring-1 ring-encre/5">
                    <div>
                      <p className="text-sm font-semibold">
                        {mode?.icon} {mode?.name}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-brume">
                        {q.km.toLocaleString("fr-FR")} km · {formatGameDuration(q.game_minutes)} ({realMin} min)
                        <EffectChips effects={q.effects} />
                      </p>
                    </div>
                    <button
                      disabled={ctx.busy || ctx.pending || q.fare > state.character.cash}
                      onClick={() => ctx.run(() => travelTo(selected, q.mode_code), `En route vers ${d.name} !`)}
                      className="shrink-0 rounded-xl bg-terre px-3 py-2 text-sm font-bold text-white disabled:bg-encre/20"
                    >
                      {q.fare > 0 ? fcfa(q.fare) : fr.game.free}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
