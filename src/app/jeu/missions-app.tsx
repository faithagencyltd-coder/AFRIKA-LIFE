import { fcfa } from "@/game/format";
import { chooseGoal, claimMission, dropGoal } from "@/server/game-actions";

import type { GameContext } from "./game-screen";

function Progress({ value, target }: { value: number; target: number }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-encre/10" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={value}>
      <div className="h-full rounded-full bg-ocre" style={{ width: `${Math.min(100, (value / target) * 100)}%` }} />
    </div>
  );
}

const amount = (n: number, type: string) => (type === "cash" ? fcfa(n) : n.toLocaleString("fr-FR"));

/** Mission en cours (ou prête à réclamer) du parcours guidé. */
export function currentMission(ctx: GameContext) {
  const st = ctx.state.missions.find((m) => m.status === "ready") ?? ctx.state.missions.find((m) => m.status === "active");
  const m = st && ctx.catalog.missions.find((x) => x.code === st.code);
  return st && m ? { ...m, ...st } : null;
}

/** Bandeau compact pour l'onglet « Ici ». */
export function MissionBanner({ ctx }: { ctx: GameContext }) {
  const m = currentMission(ctx);
  if (!m) return null;
  return (
    <button onClick={() => ctx.open("missions")} className="w-full rounded-2xl bg-indigo/10 p-3 text-left ring-1 ring-indigo/20">
      <p className="text-xs font-semibold uppercase tracking-wider text-indigo">{m.status === "ready" ? "🎁 Récompense à réclamer" : "🎯 Mission"}</p>
      <p className="font-bold">
        {m.icon} {m.title}{" "}
        <span className="font-normal text-brume">
          · {m.progress}/{m.target}
        </span>
      </p>
      <p className="text-xs text-brume">{m.description}</p>
    </button>
  );
}

export function MissionsApp({ ctx }: { ctx: GameContext }) {
  const current = currentMission(ctx);
  const done = ctx.state.missions.filter((m) => m.status === "claimed");
  const chosen = ctx.state.goals;
  const available = ctx.catalog.goals.filter((g) => !chosen.some((c) => c.code === g.code));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">🎯 Missions</h1>

      {current ? (
        <section className="rounded-2xl bg-papyrus p-4 ring-2 ring-ocre/50">
          <p className="text-xs font-semibold uppercase tracking-wider text-brume">
            Nouvelle vie · {done.length + 1}/{ctx.catalog.missions.length}
          </p>
          <h2 className="text-xl font-black">
            {current.icon} {current.title}
          </h2>
          <p className="text-sm text-brume">{current.description}</p>
          <Progress value={current.progress} target={current.target} />
          <p className="mt-1 text-xs text-brume">
            {current.progress} / {current.target} · Récompense : {fcfa(current.reward_cash)}
            {current.reward_xp > 0 && ` et ${current.reward_xp} XP`}
          </p>
          <button
            disabled={current.status !== "ready" || ctx.pending}
            onClick={() => ctx.run(() => claimMission(current.code), `Bravo ! +${fcfa(current.reward_cash)}`)}
            className="mt-3 w-full rounded-xl bg-terre py-3 font-bold text-white disabled:bg-encre/20"
          >
            {current.status === "ready" ? "🎁 Réclamer la récompense" : "En cours…"}
          </button>
        </section>
      ) : (
        <section className="rounded-2xl bg-foret/10 p-4">
          <h2 className="font-black">🏅 Parcours « Nouvelle vie » terminé !</h2>
          <p className="text-sm">Fixe-toi maintenant tes propres objectifs.</p>
        </section>
      )}

      <section className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
        <h2 className="font-bold">Mes objectifs ({chosen.length}/3)</h2>
        <p className="text-xs text-brume">La vie que tu veux construire : choisis jusqu&apos;à trois objectifs.</p>
        <ul className="mt-2 space-y-3">
          {chosen.map((c) => {
            const g = ctx.catalog.goals.find((x) => x.code === c.code);
            if (!g) return null;
            const reached = c.progress >= g.target;
            return (
              <li key={g.code}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {g.icon} {g.title} {reached && <span className="text-foret">✓ atteint</span>}
                  </p>
                  <button onClick={() => ctx.run(() => dropGoal(g.code))} disabled={ctx.pending} className="text-xs text-brume underline">
                    Retirer
                  </button>
                </div>
                <Progress value={c.progress} target={g.target} />
                <p className="mt-0.5 text-[11px] text-brume">
                  {amount(c.progress, g.objective_type)} / {amount(g.target, g.objective_type)}
                </p>
              </li>
            );
          })}
        </ul>
        {chosen.length < 3 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {available.map((g) => (
              <button
                key={g.code}
                disabled={ctx.pending}
                onClick={() => ctx.run(() => chooseGoal(g.code), `Objectif ajouté : ${g.title}`)}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-encre/15"
              >
                {g.icon} {g.title}
              </button>
            ))}
          </div>
        )}
      </section>

      {done.length > 0 && (
        <section className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
          <h2 className="font-bold">Accomplies</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {done.map((d) => {
              const m = ctx.catalog.missions.find((x) => x.code === d.code);
              return (
                <li key={d.code} className="flex justify-between">
                  <span>
                    ✅ {m?.icon} {m?.title}
                  </span>
                  <span className="text-xs text-foret">+{fcfa(m?.reward_cash ?? 0)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
