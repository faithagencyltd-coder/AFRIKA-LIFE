import { canStartShift, formatGameDuration } from "@/game/clock";
import { fcfa, jobName } from "@/game/format";
import { quitJob, startWork } from "@/server/game-actions";

import { EffectChips } from "./effect-chips";
import type { GameContext } from "./game-screen";
import { GainChips } from "./skills-app";

export function WorkTab({ ctx }: { ctx: GameContext }) {
  const { state, catalog, minute } = ctx;
  const job = state.job;
  const c = state.character;
  const buildingOf = (code: string) => catalog.buildings.find((b) => b.code === code);
  const districtOf = (code: string) => catalog.districts.find((d) => d.code === code);

  let blocker: string | null = null;
  if (job) {
    if (c.district_code !== job.district_code) blocker = `Rendez-vous à ${buildingOf(job.building_code)?.name} (${districtOf(job.district_code)?.name}).`;
    else if (!canStartShift(job.shift_start_hour, job.shift_end_hour, job.shift_minutes, minute))
      blocker = `Les services ont lieu entre ${job.shift_start_hour}h et ${job.shift_end_hour % 24}h.`;
  }

  return (
    <div className="space-y-4">
      {job ? (
        <section className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
          <p className="text-xs font-semibold uppercase tracking-wider text-brume">Mon emploi</p>
          <h1 className="text-xl font-black">{job.name}</h1>
          <p className="text-sm text-brume">
            {buildingOf(job.building_code)?.name} · {districtOf(job.district_code)?.name}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <Stat label="Salaire / service" value={fcfa(job.pay)} />
            <Stat label="Horaires" value={`${job.shift_start_hour}h – ${job.shift_end_hour % 24}h`} />
            <Stat label="Services" value={String(job.shifts)} />
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-xs">
              <span className="font-semibold">
                Niveau {job.level}/{job.max_level}
              </span>
              <span className="text-brume">{job.next_level_xp ? `${job.xp} / ${job.next_level_xp} XP` : "Niveau maximum"}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-encre/10">
              <div className="h-full rounded-full bg-ocre" style={{ width: `${job.next_level_xp ? Math.min(100, (job.xp / job.next_level_xp) * 100) : 100}%` }} />
            </div>
            <p className="mt-1 text-xs text-brume">Chaque niveau augmente le salaire de 25 %.</p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-brume">
            Un service de {formatGameDuration(job.shift_minutes)} : <EffectChips effects={job.effects} />
          </div>
          {blocker && <p className="mt-3 rounded-xl bg-ocre/15 px-3 py-2 text-sm">{blocker}</p>}
          <div className="mt-3 flex gap-2">
            <button
              disabled={!!blocker || ctx.busy || ctx.pending}
              onClick={() => ctx.run(() => startWork(), "Au travail ! Le salaire tombera à la fin du service.")}
              className="flex-1 rounded-xl bg-indigo py-3 font-bold text-white disabled:opacity-50"
            >
              💼 Travailler ({formatGameDuration(job.shift_minutes)})
            </button>
            {blocker && c.district_code !== job.district_code && (
              <button onClick={() => ctx.goToMap(job.district_code)} className="rounded-xl bg-papyrus px-4 font-semibold ring-1 ring-encre/10">
                🗺️ Y aller
              </button>
            )}
          </div>
          <button
            disabled={ctx.busy || ctx.pending}
            onClick={() => confirm("Quitter cet emploi ? Votre expérience dans ce métier est conservée.") && ctx.run(() => quitJob(), "Vous avez démissionné.")}
            className="mt-3 text-xs text-brume underline disabled:opacity-50"
          >
            Démissionner
          </button>
        </section>
      ) : (
        <section className="rounded-2xl bg-ocre/15 p-4">
          <h1 className="text-lg font-black">Trouve ton premier travail</h1>
          <p className="text-sm">Rends-toi sur place et clique sur « Postuler ». Les métiers débutants n&apos;exigent aucun diplôme.</p>
        </section>
      )}

      <section className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
        <h2 className="font-bold">Offres d&apos;emploi à Cotonou</h2>
        <ul className="mt-2 divide-y divide-encre/5">
          {catalog.jobs.map((j) => {
            const b = buildingOf(j.building_code);
            const locked = c.level < j.required_level;
            const career = state.careers.find((x) => x.code === j.code);
            return (
              <li key={j.code} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {jobName(j, c.gender)}
                    {state.job?.code === j.code && <span className="ml-1 text-xs text-indigo">(actuel)</span>}
                  </p>
                  <p className="text-xs text-brume">
                    {fcfa(j.base_pay)} / service · {b?.name} · {districtOf(b?.district_code ?? "")?.name}
                    {career && !career.is_active && ` · ancien poste, niveau ${career.level}`}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <GainChips ctx={ctx} gains={j.gains} />
                  </div>
                </div>
                {locked ? (
                  <span className="shrink-0 rounded-full bg-encre/10 px-2 py-1 text-xs font-semibold text-brume">🔒 Niv. {j.required_level}</span>
                ) : (
                  <button onClick={() => b && ctx.goToMap(b.district_code)} className="shrink-0 rounded-xl px-2 py-1 text-xs font-semibold text-indigo ring-1 ring-indigo/30">
                    Voir
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-sable px-2 py-2">
      <p className="text-[11px] text-brume">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}
