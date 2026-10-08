// Phase A5 — Compétences et réputation : gagnées par le travail et les activités.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { newPlayer, pool, rewind, setGameTime, teleport, tx } from "./helpers.mjs";

after(() => pool.end());

const skill = (s, code) => s.skills.find((x) => x.code === code);

describe("Compétences et réputation (CdC V2 §7, §8)", () => {
  test("niveaux de compétence : 25 / 75 / 150 XP, plafond 10", async () => {
    await tx(async (t) => {
      const [r] = await t.q("select array[skill_level(0), skill_level(24), skill_level(25), skill_level(75), skill_level(150), skill_level(100000)] l");
      assert.deepEqual(r.l, [1, 1, 2, 3, 4, 10]);
    });
  });

  test("un nouveau personnage n'a ni compétence ni réputation", async () => {
    await tx(async (t) => {
      const { state } = await newPlayer(t);
      assert.deepEqual(state.skills, []);
      assert.deepEqual(state.reputation, { pro: 0, social: 0, commercial: 0 });
    });
  });

  test("un service au marché développe commerce et communication, réputation pro et commerciale", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await teleport(t, p.characterId, "dantokpa", p.userId);
      await t.rpc("apply_for_job", "vendeur_marche");
      await setGameTime(t, 9, 0, p.userId);
      let s = await t.rpc("start_work");
      assert.deepEqual(s.skills, [], "rien avant la fin du service");
      await rewind(t, p.characterId, 8, p.userId);
      s = await t.rpc("game_state");
      assert.deepEqual(skill(s, "commerce"), { code: "commerce", xp: 3, level: 1 });
      assert.deepEqual(skill(s, "communication"), { code: "communication", xp: 2, level: 1 });
      assert.deepEqual(s.reputation, { pro: 2, social: 0, commercial: 1 });
      assert.equal(s.character.cash, 503000, "le salaire est toujours versé");
    });
  });

  test("une soirée au lounge développe la communication et la réputation sociale ; les gains s'additionnent", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await teleport(t, p.characterId, "haie_vive", p.userId);
      await setGameTime(t, 20, 0, p.userId);
      for (let i = 0; i < 2; i++) {
        await t.rpc("start_activity", "lounge_soiree");
        await rewind(t, p.characterId, 8, p.userId);
      }
      const s = await t.rpc("game_state");
      assert.equal(skill(s, "communication").xp, 4);
      assert.equal(skill(s, "leadership").xp, 2);
      assert.equal(s.reputation.social, 4);
    });
  });

  test("la réputation est plafonnée à 1 000", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await t.asSystem();
      await t.q("update characters set rep_social = 999 where id = $1", [p.characterId]);
      await t.q(`select public._apply_gains($1, '{"rep": {"social": 5}}')`, [p.characterId]);
      const [{ rep_social }] = await t.q("select rep_social from characters where id = $1", [p.characterId]);
      assert.equal(rep_social, 1000);
    });
  });
});
