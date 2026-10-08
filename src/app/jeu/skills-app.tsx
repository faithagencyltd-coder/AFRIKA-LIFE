import type { Gains } from "@/game/types";

import type { GameContext } from "./game-screen";

const REPUTATION = [
  ["pro", "💼", "Professionnelle", "Services de travail accomplis."],
  ["social", "🤝", "Sociale", "Sorties, soirées, amis reçus."],
  ["commercial", "🛍️", "Commerciale", "Vente et commerce."],
] as const;

/** Seuils d'XP des niveaux de compétence (même formule que skill_level() en SQL). */
export const skillXpFor = (level: number) => (25 * level * (level - 1)) / 2;

/** « 🛍️ Commerce +3, 🗣️ Communication +2 » */
export function GainChips({ ctx, gains }: { ctx: GameContext; gains: Gains }) {
  const entries = Object.entries(gains.skills ?? {});
  if (entries.length === 0) return null;
  return (
    <>
      {entries.map(([code, pts]) => {
        const sk = ctx.catalog.skills.find((x) => x.code === code);
        return (
          <span key={code} title={sk?.name} className="rounded-full bg-indigo/10 px-2 py-0.5 text-xs font-semibold text-indigo">
            {sk?.icon} {sk?.name} +{pts}
          </span>
        );
      })}
    </>
  );
}

export function SkillsApp({ ctx }: { ctx: GameContext }) {
  const rep = ctx.state.reputation;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">📈 Compétences</h1>
      <p className="text-sm text-brume">Elles augmentent en travaillant et en vivant. Les formations et les meilleurs métiers s&apos;appuieront dessus.</p>

      <section className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
        <h2 className="font-bold">Réputation</h2>
        <ul className="mt-2 space-y-3">
          {REPUTATION.map(([key, icon, label, hint]) => (
            <li key={key}>
              <div className="flex justify-between text-sm">
                <span className="font-semibold">
                  {icon} {label}
                </span>
                <span className="font-mono tabular-nums text-brume">{rep[key]} / 1000</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-encre/10">
                <div className="h-full rounded-full bg-terre" style={{ width: `${Math.max(rep[key] > 0 ? 1 : 0, rep[key] / 10)}%` }} />
              </div>
              <p className="text-[11px] text-brume">{hint}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl bg-papyrus p-4 ring-1 ring-encre/5">
        <h2 className="font-bold">Compétences</h2>
        <ul className="mt-2 space-y-3">
          {ctx.catalog.skills.map((sk) => {
            const mine = ctx.state.skills.find((x) => x.code === sk.code);
            const level = mine?.level ?? 1;
            const xp = mine?.xp ?? 0;
            const from = skillXpFor(level);
            const to = skillXpFor(level + 1);
            const pct = level >= 10 ? 100 : ((xp - from) / (to - from)) * 100;
            return (
              <li key={sk.code} className={mine ? "" : "opacity-60"}>
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">
                    {sk.icon} {sk.name}
                  </span>
                  <span className="text-xs text-brume">
                    Niv. {level}
                    {level < 10 && ` · ${xp}/${to} XP`}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-encre/10">
                  <div className="h-full rounded-full bg-indigo" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                </div>
                <p className="text-[11px] text-brume">{sk.description}</p>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
