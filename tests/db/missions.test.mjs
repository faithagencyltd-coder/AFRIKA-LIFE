// Phase A3 — Missions et objectifs : progression calculée par le serveur, récompense unique.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { newPlayer, pool, rejects, rewind, setGameTime, teleport, tx } from "./helpers.mjs";

after(() => pool.end());

const mission = (s, code) => s.missions.find((m) => m.code === code);

describe("Missions « Nouvelle vie » (CdC §33)", () => {
  test("parcours guidé : seule la première mission est ouverte au départ", async () => {
    await tx(async (t) => {
      const { state } = await newPlayer(t);
      assert.equal(state.missions.length, 11);
      assert.deepEqual(mission(state, "premier_repas"), { code: "premier_repas", progress: 0, status: "active" });
      assert.equal(mission(state, "trouver_travail").status, "locked");
    });
  });

  test("manger puis réclamer : +2 000 FCFA, +10 XP, une seule fois ; la mission suivante s'ouvre", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await setGameTime(t, 12, 0, p.userId);
      assert.match(await rejects(t.rpc("claim_mission", "premier_repas")), /pas encore accomplie \(0 \/ 1\)/);
      await t.rpc("start_activity", "bon_coin_plat");
      await rewind(t, p.characterId, 2, p.userId);
      let s = await t.rpc("game_state");
      assert.equal(mission(s, "premier_repas").status, "ready");
      const cash = s.character.cash;
      const xp = s.character.xp;
      s = await t.rpc("claim_mission", "premier_repas");
      assert.equal(s.character.cash, cash + 2000);
      assert.equal(s.character.xp, xp + 10);
      assert.equal(mission(s, "premier_repas").status, "claimed");
      assert.equal(mission(s, "trouver_travail").status, "active");
      assert.match(await rejects(t.rpc("claim_mission", "premier_repas")), /déjà reçue/);
      const [l] = await t.q("select amount::int, kind, ref from transactions where character_id = $1 order by id desc limit 1", [p.characterId]);
      assert.deepEqual(l, { amount: 2000, kind: "mission", ref: "premier_repas" });
    });
  });

  test("« Trouve un travail » rapporte 10 000 FCFA ; impossible de sauter une étape", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await teleport(t, p.characterId, "dantokpa", p.userId);
      await t.rpc("apply_for_job", "vendeur_marche");
      assert.match(await rejects(t.rpc("claim_mission", "trouver_travail")), /mission précédente/);
      await t.asSystem();
      await t.q("insert into character_missions (character_id, mission_code) values ($1, 'premier_repas')", [p.characterId]);
      await t.asUser(p.userId);
      const before = (await t.rpc("game_state")).character.cash;
      const s = await t.rpc("claim_mission", "trouver_travail");
      assert.equal(s.character.cash, before + 10000);
    });
  });

  test("« Travaille 5 jours » compte des jours de jeu différents", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await t.asSystem();
      for (const day of [0, 0, 1, 2, 3]) {
        await t.q(
          `insert into activity_log (character_id, kind, code, label, started_at, ended_at)
           select $1, 'work', 'vendeur_marche', 'Service', ts, ts
           from (select world_epoch + make_interval(secs => ($2::int * 1440 + 600 - start_game_minute) * 60.0 / time_scale) as ts from game_config) x`,
          [p.characterId, day],
        );
      }
      const [{ v }] = await t.q("select public._objective_progress($1, 'work_days') v", [p.characterId]);
      assert.equal(Number(v), 4);
    });
  });
});

describe("Objectifs personnels (CdC V2 §50)", () => {
  test("choisir jusqu'à 3 objectifs, voir sa progression, en abandonner", async () => {
    await tx(async (t) => {
      await newPlayer(t);
      let s = await t.rpc("choose_goal", "million");
      assert.deepEqual(s.goals, [{ code: "million", progress: 500000 }]);
      await t.rpc("choose_goal", "maison");
      await t.rpc("choose_goal", "expert");
      assert.match(await rejects(t.rpc("choose_goal", "gourmet")), /Trois objectifs au maximum/);
      assert.match(await rejects(t.rpc("choose_goal", "million")), /déjà choisi/);
      s = await t.rpc("drop_goal", "maison");
      assert.deepEqual(s.goals.map((g) => g.code), ["million", "expert"]);
      assert.match(await rejects(t.rpc("drop_goal", "maison")), /ne fait pas partie/);
      assert.match(await rejects(t.rpc("choose_goal", "licorne")), /n'existe pas/);
    });
  });
});
