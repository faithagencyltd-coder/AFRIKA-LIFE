// Les options d'apparence de l'interface doivent être exactement celles autorisées par la base.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { APPEARANCE, APPEARANCE_CATEGORIES, DEFAULT_APPEARANCE, randomAppearance } from "../../src/game/appearance.ts";
import { NEED_KEYS } from "../../src/game/needs.ts";

const sql = readFileSync(new URL("../../supabase/migrations/20261008000100_catalogue.sql", import.meta.url), "utf8");
const block = sql.slice(sql.indexOf("insert into public.appearance_options"));
const dbOptions = [...block.matchAll(/\('(\w+)', '(\w+)', '((?:[^']|'')*)', \d+\)/g)].map((m) => `${m[1]}:${m[2]}`);

describe("Apparence", () => {
  test("mêmes catégories et codes que la table appearance_options", () => {
    const ui = APPEARANCE_CATEGORIES.flatMap((c) => APPEARANCE[c].options.map((o) => `${c}:${o.code}`));
    assert.ok(dbOptions.length > 30);
    assert.deepEqual([...ui].sort(), [...dbOptions].sort());
  });

  test("apparence par défaut et aléatoire valides", () => {
    for (const look of [DEFAULT_APPEARANCE, randomAppearance(() => 0.999), randomAppearance(() => 0)]) {
      for (const c of APPEARANCE_CATEGORIES) {
        assert.ok(APPEARANCE[c].options.some((o) => o.code === look[c]), `${c}=${look[c]}`);
      }
    }
  });

  test("besoins : même ordre que need_keys() en SQL", () => {
    assert.match(sql, new RegExp(`array\\[${NEED_KEYS.map((k) => `'${k}'`).join(", ")}\\]`));
  });
});
