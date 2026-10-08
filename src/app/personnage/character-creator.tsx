"use client";

import { useState, useTransition } from "react";

import { Avatar } from "@/components/avatar";
import { APPEARANCE, APPEARANCE_CATEGORIES, DEFAULT_APPEARANCE, randomAppearance, starterOptions } from "@/game/appearance";
import type { Appearance, AppearanceCategory, City, Country, Gender } from "@/game/types";
import { createCharacter } from "@/server/game-actions";

export function CharacterCreator({ countries, cities }: { countries: Country[]; cities: City[] }) {
  const [firstName, setFirstName] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [gender, setGender] = useState<Gender>("femme");
  const [age, setAge] = useState(24);
  const [country, setCountry] = useState("BJ");
  const [city, setCity] = useState("cotonou");
  const [look, setLook] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [category, setCategory] = useState<AppearanceCategory>("skin");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const countryCities = cities.filter((c) => c.country_code === country);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createCharacter({ firstName, pseudo, gender, age, city, appearance: look });
      if (result && !result.ok) setError(result.error);
    });
  };

  return (
    <form onSubmit={submit} className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[320px_1fr] md:py-12">
      {/* Aperçu */}
      <aside className="md:sticky md:top-8 md:self-start">
        <div className="flex flex-col items-center rounded-3xl bg-gradient-to-b from-ocre/25 to-terre/20 p-5">
          <Avatar appearance={look} gender={gender} size={150} title="Aperçu de votre personnage" />
          <p className="mt-2 text-xl font-black">{firstName || "Votre prénom"}</p>
          <p className="text-sm text-brume">
            @{pseudo || "pseudo"} · {age} ans
          </p>
          <button type="button" onClick={() => setLook(randomAppearance())} className="mt-3 rounded-full bg-papyrus px-4 py-1.5 text-sm font-semibold ring-1 ring-encre/10">
            🎲 Surprends-moi
          </button>
        </div>
      </aside>

      <div className="space-y-5">
        <h1 className="text-3xl font-black">Crée ton personnage</h1>

        <section className="space-y-3 rounded-3xl bg-papyrus p-5 ring-1 ring-encre/5">
          <h2 className="font-bold">Identité</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Prénom
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={30} className="mt-1 w-full rounded-xl border border-encre/15 bg-white px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium">
              Pseudo (unique)
              <input
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value.replace(/[^A-Za-z0-9_.-]/g, ""))}
                required
                minLength={3}
                maxLength={20}
                className="mt-1 w-full rounded-xl border border-encre/15 bg-white px-3 py-2.5"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <fieldset>
              <legend className="text-sm font-medium">Personnage</legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(["femme", "homme"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    aria-pressed={gender === g}
                    className={`rounded-xl py-2.5 font-semibold capitalize ring-1 ${gender === g ? "bg-indigo text-white ring-indigo" : "bg-white ring-encre/15"}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="text-sm font-medium">
              Âge : {age} ans
              <input type="range" min={18} max={60} value={age} onChange={(e) => setAge(Number(e.target.value))} className="mt-3 w-full accent-terre" />
            </label>
          </div>
        </section>

        <section className="space-y-3 rounded-3xl bg-papyrus p-5 ring-1 ring-encre/5">
          <h2 className="font-bold">Où commence ta vie ?</h2>
          <div className="flex flex-wrap gap-2">
            {countries.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setCountry(c.code)}
                aria-pressed={country === c.code}
                className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ${country === c.code ? "bg-indigo text-white ring-indigo" : "bg-white ring-encre/15"}`}
              >
                {c.flag} {c.name}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {countryCities.map((c) => (
              <button
                key={c.code}
                type="button"
                disabled={!c.is_open}
                onClick={() => setCity(c.code)}
                aria-pressed={city === c.code}
                className={`rounded-xl px-3 py-3 text-left ring-1 transition disabled:cursor-not-allowed disabled:opacity-55 ${city === c.code ? "bg-terre text-white ring-terre" : "bg-white ring-encre/15"}`}
              >
                <span className="block font-bold">{c.name}</span>
                <span className="text-xs">{c.is_open ? "Ouverte" : (c.release_label ?? "Bientôt")}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-3xl bg-papyrus p-5 ring-1 ring-encre/5">
          <h2 className="font-bold">Apparence</h2>
          <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
            {APPEARANCE_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${category === c ? "bg-encre text-white" : "text-brume"}`}
              >
                {APPEARANCE[c].label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {starterOptions(category).map((o) => (
              <button
                key={o.code}
                type="button"
                onClick={() => setLook({ ...look, [category]: o.code })}
                aria-pressed={look[category] === o.code}
                className={`flex flex-col items-center gap-1 rounded-xl p-2 text-xs font-semibold ring-1 ${look[category] === o.code ? "bg-ocre/20 ring-2 ring-terre" : "bg-white ring-encre/10"}`}
              >
                {o.color ? (
                  <span className="h-9 w-9 rounded-full ring-1 ring-encre/20" style={{ background: o.color }} />
                ) : (
                  <Avatar appearance={{ ...look, [category]: o.code }} gender={gender} size={44} />
                )}
                {o.label}
              </button>
            ))}
          </div>
        </section>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        <button disabled={pending} className="w-full rounded-2xl bg-terre py-4 text-lg font-black text-white shadow-lg shadow-terre/30 transition hover:bg-terre-fonce disabled:opacity-60">
          {pending ? "Création…" : "Commencer ma vie à Cotonou"}
        </button>
        <p className="text-center text-xs text-brume">Tu démarres avec 500 000 FCFA virtuels, sans emploi ni logement.</p>
      </div>
    </form>
  );
}
