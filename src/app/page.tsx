import Link from "next/link";

import { Avatar } from "@/components/avatar";
import type { Appearance } from "@/game/types";
import { fr } from "@/i18n/fr";

const CAST: { gender: "homme" | "femme"; look: Appearance }[] = [
  { gender: "femme", look: { skin: "acajou", face: "ovale", hair: "foulard", outfit: "robe_wax", outfit_color: "terracotta", shoes: "sandales", accessory: "boucles" } },
  { gender: "homme", look: { skin: "cacao", face: "carre", hair: "degrade", outfit: "costume", outfit_color: "indigo", shoes: "mocassins", accessory: "montre" } },
  { gender: "femme", look: { skin: "caramel", face: "rond", hair: "bantu", outfit: "tshirt_jean", outfit_color: "vert", shoes: "baskets", accessory: "lunettes" } },
  { gender: "homme", look: { skin: "ebene", face: "long", hair: "locks", outfit: "boubou", outfit_color: "ocre", shoes: "claquettes", accessory: "chaine" } },
];

const LOOP = [
  ["💼", "Travaille", "Vendeur à Dantokpa, livreur, serveur… monte jusqu'au niveau 5."],
  ["🍲", "Vis", "Mange au maquis, dors, douche-toi, sors au cinéma ou à la plage."],
  ["🏍️", "Bouge", "Zémidjan, taxi-ville, bus ou à pied, d'Agla à Akpakpa."],
  ["📈", "Progresse", "Gagne tes FCFA, débloque de meilleurs métiers, puis ton logement."],
];

export default function Home() {
  return (
    <main className="motif-wax min-h-dvh">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-5 py-10 md:py-16">
        <header className="flex items-center justify-between">
          <span className="text-lg font-black tracking-tight text-terre">{fr.app.name}</span>
          <Link href="/connexion" className="rounded-full border border-encre/15 bg-papyrus px-4 py-2 text-sm font-semibold">
            {fr.auth.signIn}
          </Link>
        </header>

        <section className="grid items-center gap-8 md:grid-cols-2">
          <div className="space-y-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo">🇧🇯 Cotonou · bientôt 🇹🇬 Lomé · 🇨🇮 Abidjan</p>
            <h1 className="text-4xl font-black leading-tight md:text-5xl">
              Commence avec presque rien.
              <br />
              <span className="text-terre">Construis ta vie.</span>
            </h1>
            <p className="max-w-md text-lg text-brume">
              Une simulation de vie ouest-africaine : trouve un travail, gère ta faim, ton énergie et ton argent, déplace-toi en zém et
              grimpe les échelons.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/jeu" className="rounded-2xl bg-terre px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-terre/30 transition hover:bg-terre-fonce">
                Jouer gratuitement
              </Link>
              <Link href="/connexion" className="rounded-2xl bg-papyrus px-6 py-3.5 text-base font-semibold ring-1 ring-encre/10">
                J&apos;ai déjà un compte
              </Link>
            </div>
            <p className="text-xs text-brume">Jeu réservé aux 18 ans et plus. Les FCFA du jeu sont virtuels et ne sont pas de l&apos;argent réel.</p>
          </div>
          <div className="flex items-end justify-center gap-1 rounded-[2rem] bg-gradient-to-b from-ocre/30 to-terre/20 p-6">
            {CAST.map((c, i) => (
              <Avatar key={i} appearance={c.look} gender={c.gender} size={i % 3 === 0 ? 96 : 110} />
            ))}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LOOP.map(([icon, title, text]) => (
            <div key={title} className="rounded-2xl bg-papyrus p-5 ring-1 ring-encre/5">
              <div className="text-3xl">{icon}</div>
              <h2 className="mt-2 font-bold">{title}</h2>
              <p className="mt-1 text-sm text-brume">{text}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
