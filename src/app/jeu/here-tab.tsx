import { formatGameDuration, isOpenAt, realMsForGameMinutes } from "@/game/clock";
import { fcfa, jobName } from "@/game/format";
import type { Activity, Building } from "@/game/types";
import { fr } from "@/i18n/fr";
import { applyForJob, doActivity, startWork } from "@/server/game-actions";

import { EffectChips } from "./effect-chips";
import type { GameContext } from "./game-screen";

const BUILDING_ICON: Record<string, string> = {
  marche: "🛒",
  maquis: "🍲",
  restaurant: "🍽️",
  bar: "🍸",
  toilettes: "🚻",
  hebergement: "🛏️",
  bureaux: "🏢",
  supermarche: "🏪",
  plage: "🏖️",
  sport: "🏋️",
  cinema: "🎬",
  garage: "🔧",
  chantier: "🏗️",
  transport: "🚕",
  livraison: "📦",
};

export function HereTab({ ctx }: { ctx: GameContext }) {
  const { state, catalog } = ctx;
  const district = catalog.districts.find((d) => d.code === state.character.district_code);
  const buildings = catalog.buildings.filter((b) => b.district_code === state.character.district_code);
  const anywhere = catalog.activities.filter((a) => a.building_code === null);

  return (
    <div className="space-y-4">
      <section>
        <h1 className="text-2xl font-black">{district?.name}</h1>
        <p className="text-sm text-brume">{district?.description}</p>
      </section>

      {buildings.map((b) => (
        <BuildingCard key={b.code} building={b} ctx={ctx} />
      ))}

      <section className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
        <h2 className="font-bold">📱 Partout</h2>
        <ul className="mt-2 divide-y divide-encre/5">
          {anywhere.map((a) => (
            <ActivityRow key={a.code} activity={a} open ctx={ctx} />
          ))}
        </ul>
      </section>

      <button onClick={() => ctx.goToMap(state.character.district_code)} className="w-full rounded-2xl bg-papyrus py-3 font-semibold ring-1 ring-encre/10">
        🗺️ Aller ailleurs
      </button>
    </div>
  );
}

function BuildingCard({ building: b, ctx }: { building: Building; ctx: GameContext }) {
  const { state, catalog, minute } = ctx;
  const open = isOpenAt(b.open_hour, b.close_hour, minute);
  const activities = catalog.activities.filter((a) => a.building_code === b.code);
  const jobs = catalog.jobs.filter((j) => j.building_code === b.code);
  const hours = b.open_hour === 0 && b.close_hour === 24 ? "24 h/24" : `${b.open_hour}h – ${b.close_hour % 24}h`;

  return (
    <section className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">
            <span aria-hidden>{BUILDING_ICON[b.kind] ?? "📍"}</span> {b.name}
          </h2>
          {b.description && <p className="text-xs text-brume">{b.description}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${open ? "bg-foret/10 text-foret" : "bg-encre/10 text-brume"}`}>
          {open ? fr.game.open : fr.game.closed} · {hours}
        </span>
      </div>

      {activities.length > 0 && (
        <ul className="mt-2 divide-y divide-encre/5">
          {activities.map((a) => (
            <ActivityRow key={a.code} activity={a} open={open} ctx={ctx} />
          ))}
        </ul>
      )}

      {jobs.map((j) => {
        const mine = state.job?.code === j.code;
        const locked = state.character.level < j.required_level;
        return (
          <div key={j.code} className="mt-3 rounded-xl bg-indigo/5 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {mine ? "💼 Votre poste" : "📢 Recrute"} : {jobName(j, state.character.gender)}
                </p>
                <p className="text-xs text-brume">
                  {fcfa(mine ? state.job!.pay : j.base_pay)} / service de {formatGameDuration(j.shift_minutes)} · {j.shift_start_hour}h – {j.shift_end_hour % 24}h
                  {locked && ` · niveau ${j.required_level} requis`}
                </p>
              </div>
              {mine ? (
                <button
                  disabled={ctx.busy || ctx.pending}
                  onClick={() => ctx.run(() => startWork(), "Au travail ! Le salaire tombera à la fin du service.")}
                  className="shrink-0 rounded-xl bg-indigo px-3 py-2 font-bold text-white disabled:opacity-50"
                >
                  Travailler
                </button>
              ) : (
                <button
                  disabled={locked || ctx.busy || ctx.pending}
                  onClick={() => ctx.run(() => applyForJob(j.code), `${state.character.gender === "femme" ? "Embauchée" : "Embauché"} : ${jobName(j, state.character.gender)} !`)}
                  className="shrink-0 rounded-xl bg-papyrus px-3 py-2 font-semibold ring-1 ring-indigo/30 disabled:opacity-50"
                >
                  Postuler
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function ActivityRow({ activity: a, open, ctx }: { activity: Activity; open: boolean; ctx: GameContext }) {
  const tooExpensive = a.price > ctx.state.character.cash;
  const realMinutes = Math.round(realMsForGameMinutes(a.duration_minutes, ctx.state.clock.time_scale) / 60_000);
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{a.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-brume">
          <span>
            ⏱ {formatGameDuration(a.duration_minutes)}
            <span className="opacity-70"> ({realMinutes < 1 ? "< 1" : realMinutes} min)</span>
          </span>
          <EffectChips effects={a.effects} />
        </div>
      </div>
      <button
        disabled={!open || tooExpensive || ctx.busy || ctx.pending}
        onClick={() => ctx.run(() => doActivity(a.code))}
        className="shrink-0 rounded-xl bg-terre px-3 py-2 text-sm font-bold text-white transition hover:bg-terre-fonce disabled:bg-encre/20"
      >
        {a.price > 0 ? fcfa(a.price) : fr.game.free}
      </button>
    </li>
  );
}
