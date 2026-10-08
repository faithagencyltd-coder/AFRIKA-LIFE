// Les options d'apparence de l'interface doivent être exactement celles autorisées par la base.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { APPEARANCE, APPEARANCE_CATEGORIES, DEFAULT_APPEARANCE, randomAppearance, starterOptions } from "../../src/game/appearance.ts";
import { NEED_KEYS } from "../../src/game/needs.ts";

const dir = new URL("../../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const sql = readFileSync(new URL(files[0]!, dir), "utf8");
// Lignes insérées dans appearance_options, toutes migrations confondues : catégorie, code, départ ?
const dbOptions = files.flatMap((f) => {
  const text = readFileSync(new URL(f, dir), "utf8");
  return text
    .split("insert into public.appearance_options")
    .slice(1)
    .flatMap((block) =>
      [...block.split(";")[0]!.matchAll(/\('(\w+)', '(\w+)', '(?:[^']|'')*', \d+(?:, (true|false))?\)/g)].map(
        (m) => `${m[1]}:${m[2]}:${m[3] === "false" ? "boutique" : "départ"}`,
      ),
    );
});

describe("Apparence", () => {
  test("mêmes catégories et codes que la table appearance_options", () => {
    const ui = APPEARANCE_CATEGORIES.flatMap((c) => APPEARANCE[c].options.map((o) => `${c}:${o.code}:${o.starter === false ? "boutique" : "départ"}`));
    assert.ok(dbOptions.length > 30);
    assert.deepEqual([...ui].sort(), [...dbOptions].sort());
  });

  test("apparence par défaut et aléatoire valides (options de départ uniquement)", () => {
    for (const look of [DEFAULT_APPEARANCE, randomAppearance(() => 0.999), randomAppearance(() => 0)]) {
      for (const c of APPEARANCE_CATEGORIES) {
        assert.ok(starterOptions(c).some((o) => o.code === look[c]), `${c}=${look[c]}`);
      }
    }
  });

  test("besoins : même ordre que need_keys() en SQL", () => {
    assert.match(sql, new RegExp(`array\\[${NEED_KEYS.map((k) => `'${k}'`).join(", ")}\\]`));
  });
});
