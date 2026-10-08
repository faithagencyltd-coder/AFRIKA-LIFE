// Étapes 4 à 8 — Moteur : temps, besoins, activités, trajets, métiers, argent.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { newPlayer, pool, rejects, rewind, setGameTime, setNeeds, teleport, tx } from "./helpers.mjs";

after(() => pool.end());

const ledger = (t, id) => t.q("select amount::int, balance_after::int, kind, ref from transactions where character_id = $1 order by id", [id]);

describe("Horloge du jeu", () => {
  test("1 minute réelle = 15 minutes de jeu ; durées réelles ; heures d'ouverture", async () => {
    await tx(async (t) => {
      const [r] = await t.q(`select
        game_minute(world_epoch) as start,
        game_minute(world_epoch + interval '4 minutes') as plus4,
        extract(epoch from real_duration(480))::int as nuit_s,
        building_is_open(6, 19, 18 * 60 + 59) as marche_1859,
        building_is_open(6, 19, 19 * 60) as marche_19h,
        building_is_open(18, 2, 1440 * 3 + 60) as lounge_1h,
        building_is_open(18, 2, 1440 * 3 + 12 * 60) as lounge_midi,
        building_is_open(0, 24, 3 * 60) as auberge_3h
        from game_config`);
      assert.equal(Number(r.start), 7 * 60, "le monde commence au jour 1 à 7 h");
      assert.equal(Number(r.plus4), 7 * 60 + 60);
      assert.equal(r.nuit_s, 32 * 60, "une nuit de 8 h dure 32 min réelles");
      assert.deepEqual([r.marche_1859, r.marche_19h, r.lounge_1h, r.lounge_midi, r.auberge_3h], [true, false, true, false, true]);
    });
  });

  test("niveaux : joueur (100/300/600 XP) et métier (0/40/120/240/400), salaire +25 % par niveau", async () => {
    await tx(async (t) => {
      const [r] = await t.q(`select
        array[player_level(0), player_level(99), player_level(100), player_level(300), player_level(600)] as joueur,
        array[job_level(0), job_level(39), job_level(40), job_level(120), job_level(400), job_level(9999)] as metier,
        array[job_pay(3000, 1), job_pay(3000, 2), job_pay(3000, 5), job_pay(3500, 2)] as paie`);
      assert.deepEqual(r.joueur, [1, 1, 2, 3, 4]);
      assert.deepEqual(r.metier, [1, 1, 2, 3, 5, 5]);
      assert.deepEqual(r.paie.map(Number), [3000, 3750, 6000, 4400]);
    });
  });
});

describe("Besoins (§7)", () => {
  test("baisse horaire pendant le jeu, plafonnée à 30 min réelles pendant une absence", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      // 4 minutes réelles = 1 h de jeu.
      await rewind(t, p.characterId, 4, p.userId);
      let s = await t.rpc("game_state");
      assert.deepEqual(s.character.needs, { hunger: 75, energy: 76, hygiene: 77, fun: 77, social: 78, bladder: 72 });
      // Absence de 10 h réelles : comptée comme 30 min réelles (7 h 30 de jeu).
      await setNeeds(t, p.characterId, { hunger: 80, energy: 80, hygiene: 80, fun: 80, social: 80, bladder: 80 });
      await rewind(t, p.characterId, 600, p.userId);
      s = await t.rpc("game_state");
      assert.deepEqual(s.character.needs, { hunger: 42.5, energy: 50, hygiene: 57.5, fun: 57.5, social: 65, bladder: 20 });
      // Jamais sous 0.
      await rewind(t, p.characterId, 600, p.userId);
      s = await t.rpc("game_state");
      assert.equal(s.character.needs.bladder, 0);
      assert.equal(s.character.needs.hunger, 5);
    });
  });
});

describe("Activités", () => {
  test("manger au maquis : paiement immédiat, effets à la fin, journal, XP", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await setGameTime(t, 12, 0, p.userId);
      let s = await t.rpc("start_activity", "bon_coin_plat");
      assert.equal(s.character.cash, 498800);
      assert.equal(s.character.activity.kind, "activity");
      assert.equal(s.character.activity.label, "Manger un plat d'amiwo au poulet");
      assert.equal(s.character.needs.hunger, 80, "effet pas encore appliqué");
      // Occupé : impossible de lancer autre chose.
      assert.match(await rejects(t.rpc("start_activity", "auberge_douche")), /Action en cours : Manger un plat/);
      // 30 min de jeu = 2 min réelles.
      await rewind(t, p.characterId, 2, p.userId);
      s = await t.rpc("game_state");
      assert.equal(s.character.activity, null);
      assert.equal(s.character.needs.hunger, 100, "80 − 2,5 + 40, plafonné à 100");
      assert.equal(s.character.needs.social, 84);
      assert.equal(s.character.xp, 1);
      const [log] = await t.q("select kind, code, cost::int, district_code from activity_log where character_id = $1", [p.characterId]);
      assert.deepEqual(log, { kind: "activity", code: "bon_coin_plat", cost: 1200, district_code: "agla" });
      assert.deepEqual((await ledger(t, p.characterId)).at(-1), { amount: -1200, balance_after: 498800, kind: "activity", ref: "bon_coin_plat" });
    });
  });

  test("il faut être dans le bon quartier, pendant les heures d'ouverture", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await setGameTime(t, 15, 0, p.userId);
      assert.match(await rejects(t.rpc("start_activity", "maquis_tantie_plat")), /Rendez-vous d'abord à Maquis Chez Tantie Rose \(Dantokpa\)/);
      await setGameTime(t, 3, 0, p.userId);
      assert.match(await rejects(t.rpc("start_activity", "bon_coin_plat")), /Maquis Le Bon Coin est fermé à cette heure \(ouvert de 8h à 23h\)/);
      // L'auberge est ouverte la nuit ; appeler la famille se fait partout.
      await t.rpc("start_activity", "auberge_toilettes");
      await rewind(t, p.characterId, 1, p.userId);
      const s = await t.rpc("start_activity", "appeler_famille");
      assert.equal(s.character.activity.code, "appeler_famille");
      assert.match(await rejects(t.rpc("start_activity", "inexistante")), /Action en cours|n'existe pas/);
    });
  });

  test("pas assez d'argent : l'action est refusée et rien n'est débité", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await setGameTime(t, 20, 0, p.userId);
      await t.asSystem();
      await t.q("update characters set cash = 1000 where id = $1", [p.characterId]);
      await t.asUser(p.userId);
      assert.match(await rejects(t.rpc("start_activity", "auberge_nuit")), /il vous manque 4 000 FCFA/);
      const s = await t.rpc("game_state");
      assert.equal(s.character.cash, 1000);
      assert.equal(s.character.activity, null);
    });
  });

  test("dormir une nuit : 8 h de jeu, énergie pleine, la faim baisse pendant le sommeil", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await setGameTime(t, 22, 0, p.userId);
      await setNeeds(t, p.characterId, { energy: 10, hunger: 90 }, p.userId);
      await t.rpc("start_activity", "auberge_nuit");
      await rewind(t, p.characterId, 32, p.userId);
      const s = await t.rpc("game_state");
      assert.equal(s.character.needs.energy, 100);
      assert.equal(s.character.needs.hunger, 50, "90 − 8 h × 5");
    });
  });
});

describe("Trajets (§15)", () => {
  test("devis cohérents, paiement, arrivée à destination à la fin du trajet", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      const quotes = await t.q("select mode_code, km::float, fare::int, game_minutes, effects from travel_quotes('agla') where to_district = 'dantokpa'");
      assert.deepEqual(quotes.map((r) => r.mode_code), ["marche", "zemidjan", "taxi_ville", "bus"]);
      const by = Object.fromEntries(quotes.map((r) => [r.mode_code, r]));
      assert.equal(by.marche.km, 6.1);
      assert.equal(by.marche.fare, 0);
      assert.deepEqual(by.marche.effects, { energy: -18.2 });
      assert.equal(by.zemidjan.fare, 600, "100 + 80 × 6,07 km = 586 → 600");
      assert.equal(by.zemidjan.game_minutes, 19);
      assert.ok(by.marche.game_minutes > by.bus.game_minutes && by.bus.game_minutes > by.zemidjan.game_minutes);

      let s = await t.rpc("travel_to", "dantokpa", "zemidjan");
      assert.equal(s.character.cash, 499400);
      assert.equal(s.character.district_code, "agla", "toujours au départ pendant le trajet");
      assert.equal(s.character.activity.to_district, "dantokpa");
      await rewind(t, p.characterId, 2, p.userId);
      s = await t.rpc("game_state");
      assert.equal(s.character.district_code, "dantokpa");
      assert.deepEqual((await ledger(t, p.characterId)).at(-1), { amount: -600, balance_after: 499400, kind: "travel", ref: "zemidjan" });
    });
  });

  test("à pied : gratuit mais fatigant ; refus si déjà sur place ou quartier inconnu", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      assert.match(await rejects(t.rpc("travel_to", "agla", "marche")), /déjà à Agla/);
      assert.match(await rejects(t.rpc("travel_to", "plateau", "marche")), /n'existe pas/);
      assert.match(await rejects(t.rpc("travel_to", "gbegamey", "fusee")), /inconnu/);
      await t.rpc("travel_to", "gbegamey", "marche");
      await rewind(t, p.characterId, 30, p.userId);
      const s = await t.rpc("game_state");
      assert.equal(s.character.district_code, "gbegamey");
      assert.equal(s.character.cash, 500000);
      assert.ok(s.character.needs.energy < 70);
    });
  });
});

describe("Métiers et carrière (§10, §11)", () => {
  test("postuler sur place, travailler pendant les horaires, être payé à la fin du service", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t, { gender: "femme" });
      assert.match(await rejects(t.rpc("apply_for_job", "vendeur_marche")), /rendez-vous à Grand marché Dantokpa \(Dantokpa\)/);
      await teleport(t, p.characterId, "dantokpa", p.userId);
      let s = await t.rpc("apply_for_job", "vendeur_marche");
      assert.equal(s.job.name, "Vendeuse au marché");
      assert.equal(s.job.level, 1);
      assert.equal(s.job.pay, 3000);
      assert.match(await rejects(t.rpc("apply_for_job", "vendeur_marche")), /déjà ce poste/);

      await setGameTime(t, 5, 0, p.userId);
      assert.match(await rejects(t.rpc("start_work")), /entre 6h et 19h \(dernier départ à 17h00\)/);
      await setGameTime(t, 17, 30, p.userId);
      assert.match(await rejects(t.rpc("start_work")), /dernier départ à 17h00/);

      await setGameTime(t, 9, 0, p.userId);
      s = await t.rpc("start_work");
      assert.equal(s.character.activity.kind, "work");
      assert.equal(s.character.activity.earn, 3000);
      assert.equal(s.character.cash, 500000, "le salaire arrive à la fin du service");
      // 2 h de jeu = 8 min réelles.
      await rewind(t, p.characterId, 8, p.userId);
      s = await t.rpc("game_state");
      assert.equal(s.character.cash, 503000);
      assert.equal(s.character.xp, 10);
      assert.equal(s.job.xp, 10);
      assert.equal(s.job.shifts, 1);
      assert.equal(s.character.needs.energy, 60, "80 − 2 h × 4 − 12");
      assert.deepEqual((await ledger(t, p.characterId)).at(-1), { amount: 3000, balance_after: 503000, kind: "salary", ref: "vendeur_marche" });
    });
  });

  test("progression : niveau 2 du métier après 40 XP → salaire +25 %", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await teleport(t, p.characterId, "dantokpa", p.userId);
      await t.rpc("apply_for_job", "vendeur_marche");
      await t.asSystem();
      await t.q("update character_jobs set xp = 40 where character_id = $1", [p.characterId]);
      await setGameTime(t, 9, 0, p.userId);
      const s = await t.rpc("start_work");
      assert.equal(s.job.level, 2);
      assert.equal(s.character.activity.earn, 3750);
    });
  });

  test("trop fatigué, affamé ou pressé : pas de travail", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await teleport(t, p.characterId, "dantokpa", p.userId);
      await t.rpc("apply_for_job", "vendeur_marche");
      await setGameTime(t, 9, 0, p.userId);
      await setNeeds(t, p.characterId, { energy: 19 }, p.userId);
      assert.match(await rejects(t.rpc("start_work")), /trop fatigué pour travailler/);
      await setNeeds(t, p.characterId, { energy: 80, hunger: 10 }, p.userId);
      assert.match(await rejects(t.rpc("start_work")), /trop faim/);
      await setNeeds(t, p.characterId, { hunger: 80, bladder: 5 }, p.userId);
      assert.match(await rejects(t.rpc("start_work")), /toilettes/);
    });
  });

  test("niveau requis, un seul emploi actif, démission, l'expérience est conservée", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await teleport(t, p.characterId, "gbegamey", p.userId);
      assert.match(await rejects(t.rpc("apply_for_job", "chauffeur_taxi")), /niveau 2 \(vous êtes niveau 1\)/);
      await t.rpc("apply_for_job", "livreur");
      await t.asSystem();
      await t.q("update character_jobs set xp = 120 where character_id = $1", [p.characterId]);
      await t.q("update characters set xp = 100 where id = $1", [p.characterId]);
      await t.asUser(p.userId);
      let s = await t.rpc("apply_for_job", "chauffeur_taxi");
      assert.equal(s.job.code, "chauffeur_taxi");
      assert.equal(s.careers.filter((c) => c.is_active).length, 1);
      s = await t.rpc("quit_job");
      assert.equal(s.job, null);
      assert.match(await rejects(t.rpc("quit_job")), /pas d'emploi/);
      s = await t.rpc("apply_for_job", "livreur");
      assert.equal(s.job.level, 3, "l'expérience du métier est conservée");
    });
  });

  test("on ne peut pas travailler loin de son lieu de travail", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await teleport(t, p.characterId, "dantokpa", p.userId);
      await t.rpc("apply_for_job", "vendeur_marche");
      await teleport(t, p.characterId, "agla", p.userId);
      await setGameTime(t, 9, 0, p.userId);
      assert.match(await rejects(t.rpc("start_work")), /Votre lieu de travail est Grand marché Dantokpa, à Dantokpa/);
    });
  });
});
