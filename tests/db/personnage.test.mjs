// Étape 3 — Création du personnage : validations, capital de départ, unicité.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { LOOK, newPlayer, pool, rejects, tx } from "./helpers.mjs";

after(() => pool.end());

describe("Création du personnage", () => {
  test("nouveau personnage : Cotonou, quartier d'arrivée, 500 000 FCFA tracés, besoins à 80", async () => {
    await tx(async (t) => {
      const { state, characterId } = await newPlayer(t, { firstName: "Afiavi", pseudo: "Afi_229", gender: "femme", age: 23 });
      const c = state.character;
      assert.equal(c.first_name, "Afiavi");
      assert.equal(c.pseudo, "Afi_229");
      assert.equal(c.country_code, "BJ");
      assert.equal(c.city_code, "cotonou");
      assert.equal(c.district_code, "agla");
      assert.equal(c.cash, 500000);
      assert.equal(c.level, 1);
      assert.deepEqual(Object.values(c.needs), [80, 80, 80, 80, 80, 80]);
      assert.equal(c.activity, null);
      assert.equal(state.job, null);
      const ledger = await t.q("select amount, balance_after, kind from transactions where character_id = $1", [characterId]);
      assert.deepEqual(ledger, [{ amount: "500000", balance_after: "500000", kind: "starting_cash" }]);
    });
  });

  test("un seul personnage par compte", async () => {
    await tx(async (t) => {
      await newPlayer(t);
      const msg = await rejects(t.rpc("create_character", "Koffi", "autre_pseudo", "homme", 30, "cotonou", JSON.stringify(LOOK)));
      assert.match(msg, /déjà un personnage/);
    });
  });

  test("pseudo unique sans tenir compte des majuscules", async () => {
    await tx(async (t) => {
      await newPlayer(t, { pseudo: "Kossi" });
      const other = await t.newUser();
      await t.asUser(other);
      assert.match(await rejects(t.rpc("create_character", "Kossi", "KOSSI", "homme", 30, "cotonou", JSON.stringify(LOOK))), /déjà pris/);
    });
  });

  test("validations : prénom, pseudo, sexe, âge (18 à 60 ans), ville ouverte, apparence", async () => {
    await tx(async (t) => {
      const id = await t.newUser();
      await t.asUser(id);
      const create = (o) => {
        const v = { first: "Koffi", pseudo: "koffi_bj", gender: "homme", age: 25, city: "cotonou", look: LOOK, ...o };
        return rejects(t.rpc("create_character", v.first, v.pseudo, v.gender, v.age, v.city, JSON.stringify(v.look)));
      };
      assert.match(await create({ first: "" }), /Prénom invalide/);
      assert.match(await create({ first: "<script>" }), /Prénom invalide/);
      assert.match(await create({ pseudo: "ab" }), /Pseudo invalide/);
      assert.match(await create({ pseudo: "nom avec espace" }), /Pseudo invalide/);
      assert.match(await create({ gender: "autre" }), /homme ou femme/);
      assert.match(await create({ age: 17 }), /entre 18 et 60/);
      assert.match(await create({ age: 61 }), /entre 18 et 60/);
      assert.match(await create({ city: "lome" }), /Lomé ouvrira bientôt/);
      assert.match(await create({ city: "atlantis" }), /Ville inconnue/);
      assert.match(await create({ look: { ...LOOK, hair: "crete_violette" } }), /Apparence invalide/);
      assert.match(await create({ look: { ...LOOK, skin: 3 } }), /Apparence invalide/);
      const incomplete = { ...LOOK };
      delete incomplete.accessory;
      assert.match(await create({ look: incomplete }), /Apparence invalide/);
      assert.match(await create({ look: { ...LOOK, cape: "rouge" } }), /Apparence invalide/);
      // Prénoms composés et accentués acceptés.
      const ok = await t.rpc("create_character", "Marie-Ève d'Almeida", "marie.eve", "femme", 60, "cotonou", JSON.stringify(LOOK));
      assert.equal(ok.character.first_name, "Marie-Ève d'Almeida");
    });
  });

  test("un visiteur non connecté ne peut pas créer de personnage", async () => {
    await tx(async (t) => {
      await t.asAnon();
      assert.match(await rejects(t.rpc("create_character", "Koffi", "koffi", "homme", 25, "cotonou", JSON.stringify(LOOK))), /permission denied/);
    });
  });

  test("game_state renvoie null tant que le personnage n'existe pas", async () => {
    await tx(async (t) => {
      const id = await t.newUser();
      await t.asUser(id);
      assert.equal(await t.rpc("game_state"), null);
    });
  });
});
