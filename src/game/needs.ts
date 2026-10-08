// Les six besoins du personnage (CdC §7). Ordre identique à need_keys() en SQL.
import type { Effects, NeedKey } from "./types.ts";

export const NEED_KEYS: readonly NeedKey[] = ["hunger", "energy", "hygiene", "fun", "social", "bladder"];

export const NEEDS: Record<NeedKey, { label: string; icon: string; hint: string }> = {
  hunger: { label: "Faim", icon: "🍔", hint: "Mangez dans un maquis, un restaurant ou au marché." },
  energy: { label: "Énergie", icon: "⚡", hint: "Dormez à l'auberge ou reposez-vous à la plage." },
  hygiene: { label: "Hygiène", icon: "🧼", hint: "Prenez une douche (auberge, salle de sport)." },
  fun: { label: "Divertissement", icon: "🎉", hint: "Cinéma, plage, lounge, match au maquis." },
  social: { label: "Social", icon: "👥", hint: "Causez au maquis, sortez, appelez la famille." },
  bladder: { label: "Besoin sanitaire", icon: "🚽", hint: "Toilettes publiques ou d'un lieu." },
};

export type NeedLevel = "critique" | "bas" | "correct" | "bon";

export function needLevel(value: number): NeedLevel {
  if (value < 15) return "critique";
  if (value < 35) return "bas";
  if (value < 70) return "correct";
  return "bon";
}

/** Effets triés dans l'ordre des besoins, sans les zéros. */
export function effectEntries(effects: Effects): { key: NeedKey; value: number }[] {
  return NEED_KEYS.flatMap((key) => {
    const value = effects[key];
    return value ? [{ key, value }] : [];
  });
}

/** Le besoin le plus urgent (valeur la plus basse), pour le conseil du jour. */
export function mostUrgentNeed(needs: Record<NeedKey, number>): NeedKey {
  return NEED_KEYS.reduce((worst, key) => (needs[key] < needs[worst] ? key : worst), NEED_KEYS[0]!);
}
