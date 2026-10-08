// Options de personnalisation (CdC §6). Codes identiques à la table appearance_options
// (vérifié par tests/unit/appearance.test.ts) ; couleurs utilisées par l'avatar SVG.
import type { Appearance, AppearanceCategory } from "./types.ts";

export interface AppearanceOption {
  code: string;
  label: string;
  color?: string;
}

export const APPEARANCE: Record<AppearanceCategory, { label: string; options: AppearanceOption[] }> = {
  skin: {
    label: "Couleur de peau",
    options: [
      { code: "ebene", label: "Ébène", color: "#3b2219" },
      { code: "acajou", label: "Acajou", color: "#5a3422" },
      { code: "cacao", label: "Cacao", color: "#7a4a2e" },
      { code: "caramel", label: "Caramel", color: "#9a6440" },
      { code: "miel", label: "Miel", color: "#b77d4e" },
      { code: "sable", label: "Sable", color: "#d19a6a" },
    ],
  },
  face: {
    label: "Visage",
    options: [
      { code: "ovale", label: "Ovale" },
      { code: "rond", label: "Rond" },
      { code: "carre", label: "Carré" },
      { code: "long", label: "Allongé" },
    ],
  },
  hair: {
    label: "Coiffure",
    options: [
      { code: "ras", label: "Ras" },
      { code: "degrade", label: "Dégradé" },
      { code: "afro", label: "Afro" },
      { code: "locks", label: "Locks" },
      { code: "tresses", label: "Tresses" },
      { code: "bantu", label: "Bantu knots" },
      { code: "chignon", label: "Chignon" },
      { code: "foulard", label: "Foulard (gèlè)" },
    ],
  },
  outfit: {
    label: "Tenue",
    options: [
      { code: "tshirt_jean", label: "T-shirt et jean" },
      { code: "chemise_wax", label: "Chemise en wax" },
      { code: "boubou", label: "Boubou" },
      { code: "robe_wax", label: "Robe en wax" },
      { code: "ensemble_pagne", label: "Ensemble pagne" },
      { code: "costume", label: "Costume" },
      { code: "maillot", label: "Maillot de foot" },
    ],
  },
  outfit_color: {
    label: "Couleur de la tenue",
    options: [
      { code: "indigo", label: "Indigo", color: "#2e3a8c" },
      { code: "terracotta", label: "Terracotta", color: "#c4572e" },
      { code: "ocre", label: "Ocre", color: "#d69a2d" },
      { code: "vert", label: "Vert", color: "#2f7d4f" },
      { code: "bordeaux", label: "Bordeaux", color: "#7a1f3d" },
      { code: "noir", label: "Noir", color: "#23211f" },
      { code: "blanc", label: "Blanc", color: "#f2efe8" },
    ],
  },
  shoes: {
    label: "Chaussures",
    options: [
      { code: "sandales", label: "Sandales" },
      { code: "baskets", label: "Baskets" },
      { code: "mocassins", label: "Mocassins" },
      { code: "claquettes", label: "Claquettes" },
    ],
  },
  accessory: {
    label: "Accessoire",
    options: [
      { code: "aucun", label: "Aucun" },
      { code: "lunettes", label: "Lunettes" },
      { code: "casquette", label: "Casquette" },
      { code: "montre", label: "Montre" },
      { code: "chaine", label: "Chaîne" },
      { code: "boucles", label: "Boucles d'oreilles" },
    ],
  },
};

export const APPEARANCE_CATEGORIES = Object.keys(APPEARANCE) as AppearanceCategory[];

export const DEFAULT_APPEARANCE: Appearance = {
  skin: "cacao",
  face: "ovale",
  hair: "afro",
  outfit: "chemise_wax",
  outfit_color: "terracotta",
  shoes: "sandales",
  accessory: "aucun",
};

export function colorOf(category: "skin" | "outfit_color", code: string): string {
  const options = APPEARANCE[category].options;
  return (options.find((o) => o.code === code) ?? options[0]!).color!;
}

/** Apparence aléatoire (bouton « Surprends-moi »). */
export function randomAppearance(random: () => number = Math.random): Appearance {
  const pick = (c: AppearanceCategory) => {
    const options = APPEARANCE[c].options;
    return options[Math.floor(random() * options.length)]!.code;
  };
  return Object.fromEntries(APPEARANCE_CATEGORIES.map((c) => [c, pick(c)])) as Appearance;
}
