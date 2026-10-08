// Sécurité (§43, §44) — le serveur est la seule source de vérité.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { newPlayer, pool, rejects, tx } from "./helpers.mjs";

after(() => pool.end());

const PUBLIC_RPC = [
  "apply_for_job", "building_is_open", "create_character", "game_minute", "game_state", "job_level", "job_pay",
  "need_keys", "player_level", "quit_job", "real_duration", "start_activity", "start_work", "travel_quotes", "travel_to",
];

describe("Sécurité", () => {
  test("aucune écriture directe possible sur les tables, même sur son propre personnage", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      for (const sql of [
        "update characters set cash = 999999999",
        "update characters set hunger = 100",
        "insert into transactions (character_id, amount, balance_after, kind) values ('" + p.characterId + "', 1000000, 1000000, 'admin')",
        "delete from transactions",
        "update character_jobs set xp = 400",
        "update jobs set base_pay = 1000000",
        "update game_config set starting_cash = 999999999",
        "insert into activities (code, name, duration_minutes) values ('triche', 'Triche', 5)",
      ]) {
        assert.match(await rejects(t.q(sql)), /permission denied/, sql);
      }
    });
  });

  test("fonctions internes inaccessibles depuis l'API", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      assert.match(await rejects(t.q("select public._money($1, 1000000, 'admin', null)", [p.characterId])), /permission denied/);
      assert.match(await rejects(t.q("select public._apply_needs($1, '{\"hunger\": 100}')", [p.characterId])), /permission denied/);
      assert.match(await rejects(t.q("select public._complete_activity($1)", [p.characterId])), /permission denied/);
      assert.match(await rejects(t.q("select public._settle($1)", [p.characterId])), /permission denied/);
    });
  });

  test("liste blanche : seules les fonctions prévues sont exécutables par un joueur", async () => {
    await tx(async (t) => {
      const rows = await t.q(`
        select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
        order by 1`);
      assert.deepEqual(rows.map((r) => r.proname), PUBLIC_RPC);
    });
  });

  test("chaque joueur ne voit que ses propres données", async () => {
    await tx(async (t) => {
      const a = await newPlayer(t, { pseudo: "joueur_a" });
      const b = await newPlayer(t, { pseudo: "joueur_b" });
      // Connecté en tant que B.
      assert.deepEqual((await t.q("select pseudo from characters")).map((r) => r.pseudo), ["joueur_b"]);
      assert.equal((await t.q("select * from transactions where character_id = $1", [a.characterId])).length, 0);
      assert.equal((await t.q("select * from transactions where character_id = $1", [b.characterId])).length, 1);
      await t.asAnon();
      assert.match(await rejects(t.q("select * from characters")), /permission denied/);
      // Le catalogue reste public.
      assert.equal((await t.q("select count(*)::int n from districts where city_code = 'cotonou'"))[0].n, 8);
    });
  });

  test("double dépense impossible : deux actions simultanées sont sérialisées", async () => {
    await tx(async (t) => {
      await newPlayer(t);
      await t.rpc("start_activity", "appeler_famille");
      assert.match(await rejects(t.rpc("start_activity", "appeler_famille")), /Action en cours/);
      assert.match(await rejects(t.rpc("travel_to", "dantokpa", "zemidjan")), /Action en cours/);
    });
  });
});

describe("Catalogue", () => {
  test("lancement : Bénin ouvert, Cotonou seule ville ouverte ; Lomé et Abidjan présents", async () => {
    await tx(async (t) => {
      await t.asAnon();
      const cities = await t.q("select code, is_open from cities order by sort");
      assert.deepEqual(cities.filter((c) => c.is_open).map((c) => c.code), ["cotonou"]);
      assert.ok(cities.some((c) => c.code === "lome") && cities.some((c) => c.code === "abidjan"));
    });
  });

  test("cohérence : 10 métiers, chaque lieu propose quelque chose, toilettes et repas accessibles", async () => {
    await tx(async (t) => {
      const [{ n }] = await t.q("select count(*)::int n from jobs where is_active");
      assert.equal(n, 10);
      const empty = await t.q(`select b.code from buildings b
        where not exists (select 1 from activities a where a.building_code = b.code)
          and not exists (select 1 from jobs j where j.building_code = b.code)`);
      assert.deepEqual(empty, []);
      const fill = await t.q(`select key, count(*)::int n from activities, jsonb_each(effects) e
        where (e.value #>> '{}')::numeric > 0 group by key order by key`);
      assert.deepEqual(fill.map((r) => r.key), ["bladder", "energy", "fun", "hunger", "hygiene", "social"], "chaque besoin peut être rechargé");
    });
  });
});
