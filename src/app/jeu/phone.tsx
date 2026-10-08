// Téléphone du personnage : point d'entrée de tous les modules (docs/ANALYSE-V2.md §5.2).
import type { GameContext } from "./game-screen";

export type AppId = "missions" | "work" | "home" | "bag" | "wardrobe" | "skills" | "bank" | "social" | "market" | "school" | "garage" | "business";

interface PhoneApp {
  id: AppId;
  icon: string;
  name: string;
  /** Application disponible ; sinon affichée « Bientôt ». */
  ready: boolean;
  color: string;
  badge?: (ctx: GameContext) => string | null;
}

export const APPS: PhoneApp[] = [
  {
    id: "missions",
    icon: "🎯",
    name: "Missions",
    ready: true,
    color: "bg-foret",
    badge: (c) => (c.state.missions.some((m) => m.status === "ready") ? "🎁" : null),
  },
  { id: "work", icon: "💼", name: "Emplois", ready: true, color: "bg-indigo", badge: (c) => (c.state.job ? null : "!") },
  { id: "home", icon: "🏠", name: "Immobilier", ready: true, color: "bg-terre", badge: (c) => (c.state.home?.arrears ? "!" : null) },
  { id: "bag", icon: "🎒", name: "Sac", ready: true, color: "bg-ocre" },
  { id: "wardrobe", icon: "👗", name: "Garde-robe", ready: true, color: "bg-terre-fonce" },
  { id: "skills", icon: "📈", name: "Compétences", ready: true, color: "bg-indigo-fonce" },
  { id: "bank", icon: "🏦", name: "Banque", ready: false, color: "bg-foret" },
  { id: "social", icon: "💬", name: "WA Social", ready: false, color: "bg-ocre" },
  { id: "market", icon: "🛍️", name: "Marché", ready: false, color: "bg-terre-fonce" },
  { id: "school", icon: "🎓", name: "Formations", ready: false, color: "bg-indigo-fonce" },
  { id: "garage", icon: "🏍️", name: "Véhicules", ready: false, color: "bg-encre" },
  { id: "business", icon: "🏢", name: "Entreprise", ready: false, color: "bg-brume" },
];

export function PhoneHome({ ctx }: { ctx: GameContext }) {
  return (
    <section aria-label="Téléphone" className="mx-auto max-w-sm rounded-[2.2rem] bg-encre p-3 shadow-2xl">
      <div className="rounded-[1.8rem] bg-gradient-to-b from-indigo to-terre px-4 pt-5 pb-6">
        <p className="text-center text-xs font-semibold tracking-wider text-white/70">WEST AFRICA LIFE</p>
        <div className="mt-5 grid grid-cols-4 gap-x-3 gap-y-5">
          {APPS.map((app) => {
            const badge = app.ready ? app.badge?.(ctx) : null;
            return (
              <button
                key={app.id}
                disabled={!app.ready}
                onClick={() => ctx.open(app.id)}
                className="group flex flex-col items-center gap-1 disabled:opacity-60"
                aria-label={app.ready ? app.name : `${app.name} (bientôt)`}
              >
                <span className={`relative grid h-14 w-14 place-items-center rounded-2xl text-2xl shadow-md ${app.color}`}>
                  {app.icon}
                  {badge && (
                    <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white">
                      {badge}
                    </span>
                  )}
                </span>
                <span className="text-center text-[11px] font-semibold leading-tight text-white">{app.name}</span>
                {!app.ready && <span className="-mt-1 text-[9px] text-white/70">Bientôt</span>}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
