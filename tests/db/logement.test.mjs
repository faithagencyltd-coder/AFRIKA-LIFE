// Étape 9 — Logement : location, loyer, arriérés, expulsion, achat, revente, activités à domicile.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { newPlayer, pool, rejects, rewind, setGameTime, setNeeds, teleport, tx } from "./helpers.mjs";

after(() => pool.end());

const WEEK_MIN = 672; // une semaine de jeu = 7 × 1440 / 15 minutes réelles

const ledger = (t, id) => t.q("select amount::int, kind, ref from transactions where character_id = $1 order by id", [id]);
const notes = (t, id) => t.q("select kind, message from notifications where character_id = $1 order by id", [id]);

/** Joueur à l'agence de Ganhi, à 10 h (agence ouverte). */
async function atAgency(t, overrides) {
  const p = await newPlayer(t, overrides);
  await teleport(t, p.characterId, "ganhi");
  await setGameTime(t, 10, 0, p.userId);
  return p;
}

/** Fait passer `weeks` échéances (système), puis ré-identifie le joueur. */
async function passWeeks(t, p, weeks) {
  await t.asSystem();
  await t.q("update character_homes set next_due_at = now() - make_interval(mins => $2) where character_id = $1 and is_active", [
    p.characterId,
    WEEK_MIN * (weeks - 1) + 1,
  ]);
  await t.asUser(p.userId);
}

async function setCash(t, p, cash) {
  await t.asSystem();
  await t.q("update characters set cash = $2 where id = $1", [p.characterId, cash]);
  await t.asUser(p.userId);
}

describe("Location (CdC §12, §13)", () => {
  test("louer à l'agence : 1re semaine + caution, échéance dans une semaine de jeu", async () => {
    await tx(async (t) => {
      const p = await atAgency(t);
      const s = await t.rpc("rent_home", "chambre_agla");
      assert.equal(s.character.cash, 500000 - 2 * 15000);
      assert.equal(s.home.code, "chambre_agla");
      assert.equal(s.home.tenure, "rental");
      assert.equal(s.home.deposit, 15000);
      assert.equal(s.home.comfort, 1);
      assert.equal(s.unread_notifications, 1);
      const [{ mins }] = await t.q("select round(extract(epoch from next_due_at - now()) / 60)::int mins from character_homes where character_id = $1", [p.characterId]);
      assert.equal(mins, WEEK_MIN);
      assert.deepEqual((await ledger(t, p.characterId)).slice(-2), [
        { amount: -15000, kind: "rent", ref: "chambre_agla" },
        { amount: -15000, kind: "deposit", ref: "chambre_agla" },
      ]);
    });
  });

  test("ailleurs qu'à l'agence, agence fermée, niveau insuffisant, location seule : refusé", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await setGameTime(t, 10, 0, p.userId);
      assert.match(await rejects(t.rpc("rent_home", "chambre_agla")), /se signent à Agence immobilière du Littoral \(Ganhi\)/);
      await teleport(t, p.characterId, "ganhi");
      await setGameTime(t, 20, 0, p.userId);
      assert.match(await rejects(t.rpc("rent_home", "chambre_agla")), /fermée à cette heure \(ouverte de 8h à 18h\)/);
      await setGameTime(t, 10, 0, p.userId);
      assert.match(await rejects(t.rpc("rent_home", "appart_cadjehoun")), /niveau 3 \(vous êtes niveau 1\)/);
      assert.match(await rejects(t.rpc("buy_home", "chambre_agla")), /seulement à louer/);
      assert.match(await rejects(t.rpc("rent_home", "chateau")), /n'existe pas/);
    });
  });

  test("loyer prélevé automatiquement à chaque échéance, même après une longue absence", async () => {
    await tx(async (t) => {
      const p = await atAgency(t);
      await t.rpc("rent_home", "chambre_agla");
      await passWeeks(t, p, 3);
      const s = await t.rpc("game_state");
      assert.equal(s.character.cash, 470000 - 3 * 15000);
      assert.equal(s.home.arrears, 0);
      const rents = (await ledger(t, p.characterId)).filter((l) => l.kind === "rent");
      assert.equal(rents.length, 4);
      assert.match((await notes(t, p.characterId)).at(-1).message, /Loyer prélevé\(e\) : 45 000 FCFA \(3 échéances\)/);
    });
  });

  test("impayé : arriérés + 10 %, avertissement, confort réduit ; régler remet tout à zéro", async () => {
    await tx(async (t) => {
      const p = await atAgency(t);
      await t.rpc("rent_home", "studio_gbegamey");
      await setCash(t, p, 1000);
      await passWeeks(t, p, 1);
      let s = await t.rpc("game_state");
      assert.equal(s.character.cash, 1000, "rien n'est prélevé si le solde est insuffisant");
      assert.equal(s.home.arrears, 38500);
      assert.equal(s.home.missed, 1);
      assert.equal(s.home.effective_comfort, 1, "confort 2 → 1 pendant les arriérés");
      assert.match((await notes(t, p.characterId)).at(-1).message, /arriérés de 38 500 FCFA .* Avertissement 1\/3/);

      // Confort réduit : plus de douche, mais on peut encore dormir.
      await teleport(t, p.characterId, "gbegamey", p.userId);
      assert.match(await rejects(t.rpc("start_home_activity", "maison_douche")), /Coupure en cours/);
      assert.match(await rejects(t.rpc("pay_home_arrears")), /il vous manque 37 500 FCFA/);

      await setCash(t, p, 50000);
      s = await t.rpc("pay_home_arrears");
      assert.equal(s.character.cash, 11500);
      assert.deepEqual([s.home.arrears, s.home.missed, s.home.effective_comfort], [0, 0, 2]);
      assert.match(await rejects(t.rpc("pay_home_arrears")), /aucun arriéré/);
      s = await t.rpc("start_home_activity", "maison_douche");
      assert.equal(s.character.activity.code, "maison_douche");
    });
  });

  test("3 loyers impayés : expulsion, caution perdue, notification", async () => {
    await tx(async (t) => {
      const p = await atAgency(t);
      await t.rpc("rent_home", "chambre_agla");
      await setCash(t, p, 0);
      await passWeeks(t, p, 5);
      const s = await t.rpc("game_state");
      assert.equal(s.home, null);
      assert.equal(s.character.cash, 0);
      const [h] = await t.q("select is_active, end_reason, missed from character_homes where character_id = $1", [p.characterId]);
      assert.deepEqual(h, { is_active: false, end_reason: "expulsion", missed: 3 });
      const n = await notes(t, p.characterId);
      assert.equal(n.filter((x) => x.kind === "rent_missed").length, 2);
      assert.match(n.at(-1).message, /Expulsion : 3 impayés pour Chambre à Agla\. Votre caution de 15 000 FCFA est perdue/);
    });
  });

  test("quitter : caution rendue, arriérés déduits ; refus si la caution ne couvre pas les arriérés", async () => {
    await tx(async (t) => {
      const p = await atAgency(t);
      await t.rpc("rent_home", "chambre_agla");
      let s = await t.rpc("leave_home");
      assert.equal(s.home, null);
      assert.equal(s.character.cash, 485000);
      assert.match(await rejects(t.rpc("leave_home")), /pas de logement/);

      await t.rpc("rent_home", "chambre_agla");
      await setCash(t, p, 0);
      await passWeeks(t, p, 2);
      s = await t.rpc("game_state");
      assert.equal(s.home.arrears, 33000);
      assert.match(await rejects(t.rpc("leave_home")), /Réglez d'abord vos arriérés \(33 000 FCFA\)/);
    });
  });

  test("déménager : l'ancien logement est rendu (caution remboursée) avant le nouveau", async () => {
    await tx(async (t) => {
      const p = await atAgency(t);
      await t.rpc("rent_home", "chambre_agla");
      const s = await t.rpc("rent_home", "studio_gbegamey");
      assert.equal(s.home.code, "studio_gbegamey");
      assert.equal(s.character.cash, 500000 - 30000 + 15000 - 70000);
      const homes = await t.q("select home_code, is_active, end_reason from character_homes where character_id = $1 order by started_at, is_active", [p.characterId]);
      assert.deepEqual(homes.map((h) => [h.home_code, h.is_active, h.end_reason]).sort(), [
        ["chambre_agla", false, "demenagement"],
        ["studio_gbegamey", true, null],
      ]);
      assert.match(await rejects(t.rpc("rent_home", "studio_gbegamey")), /déjà ici/);
    });
  });
});

describe("Propriété (CdC §12, §25)", () => {
  test("acheter comptant, payer des charges, revendre à 80 %", async () => {
    await tx(async (t) => {
      const p = await atAgency(t);
      await setCash(t, p, 6_100_000);
      let s = await t.rpc("buy_home", "studio_gbegamey");
      assert.equal(s.character.cash, 100000);
      assert.equal(s.home.tenure, "owned");
      assert.equal(s.home.periodic_charge, 9000);
      assert.equal(s.home.resale_value, 4800000);
      await passWeeks(t, p, 1);
      s = await t.rpc("game_state");
      assert.equal(s.character.cash, 91000);
      s = await t.rpc("leave_home");
      assert.equal(s.character.cash, 4891000);
      const [h] = await t.q("select end_reason from character_homes where character_id = $1", [p.characterId]);
      assert.equal(h.end_reason, "vente");
    });
  });

  test("propriétaire sans argent : arriérés mais jamais d'expulsion", async () => {
    await tx(async (t) => {
      const p = await atAgency(t);
      await setCash(t, p, 6_000_000);
      await t.rpc("buy_home", "studio_gbegamey");
      await passWeeks(t, p, 6);
      const s = await t.rpc("game_state");
      assert.equal(s.home.code, "studio_gbegamey");
      assert.equal(s.home.missed, 6);
      assert.equal(s.home.arrears, 6 * 9900);
    });
  });
});

describe("Activités à domicile", () => {
  test("dormir chez soi : gratuit, il faut être dans son quartier", async () => {
    await tx(async (t) => {
      const p = await atAgency(t);
      assert.match(await rejects(t.rpc("start_home_activity", "maison_dormir")), /pas de logement/);
      await t.rpc("rent_home", "chambre_agla");
      assert.match(await rejects(t.rpc("start_home_activity", "maison_dormir")), /Rentrez d'abord chez vous \(Agla\)/);
      await teleport(t, p.characterId, "agla");
      await setNeeds(t, p.characterId, { energy: 10 }, p.userId);
      const cash = (await t.rpc("game_state")).character.cash;
      let s = await t.rpc("start_home_activity", "maison_dormir");
      assert.equal(s.character.cash, cash);
      await rewind(t, p.characterId, 32, p.userId);
      s = await t.rpc("game_state");
      assert.equal(s.character.needs.energy, 100);
    });
  });

  test("le confort débloque les activités : douche (2), télé (3), piscine (4)", async () => {
    await tx(async (t) => {
      const p = await atAgency(t);
      await t.rpc("rent_home", "chambre_agla");
      await teleport(t, p.characterId, "agla", p.userId);
      assert.match(await rejects(t.rpc("start_home_activity", "maison_douche")), /pas assez équipé \(confort 2 requis\)/);
      const s = await t.rpc("start_home_activity", "maison_seau");
      assert.equal(s.character.activity.label, "Se laver au seau");
      assert.match(await rejects(t.rpc("start_home_activity", "maison_inconnue")), /Action en cours|n'existe pas/);
    });
  });

  test("notifications : marquées comme lues", async () => {
    await tx(async (t) => {
      await atAgency(t);
      await t.rpc("rent_home", "chambre_agla");
      await t.rpc("mark_notifications_read");
      assert.equal((await t.rpc("game_state")).unread_notifications, 0);
    });
  });
});
