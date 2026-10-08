// Phase A4 — Administration : rôles, sanctions, argent tracé, prix, audit, tableau de bord économique.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { newPlayer, pool, rejects, teleport, tx } from "./helpers.mjs";

after(() => pool.end());

/** Crée un compte avec le rôle donné et le connecte. */
async function staff(t, role) {
  const id = await t.newUser();
  await t.q("insert into admins (user_id, role) values ($1, $2)", [id, role]);
  await t.asUser(id);
  return id;
}

describe("Accès", () => {
  test("un joueur ordinaire n'a accès à aucune fonction d'administration", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      assert.equal(await t.rpc("admin_role"), null);
      for (const call of [
        () => t.rpc("admin_economy"),
        () => t.rpc("admin_players", null),
        () => t.rpc("admin_prices"),
        () => t.rpc("admin_audit_log"),
        () => t.rpc("admin_adjust_cash", p.characterId, 1000000, "triche"),
        () => t.rpc("admin_sanction", p.characterId, null, null, null),
        () => t.rpc("admin_set_price", "jobs", "vendeur_marche", 999999),
      ]) {
        assert.match(await rejects(call()), /réservé à l'administration/);
      }
      assert.match(await rejects(t.q("select * from admins")), /permission denied/);
      assert.match(await rejects(t.q("select * from admin_audit")), /permission denied/);
    });
  });

  test("un modérateur consulte et suspend, mais ne bannit pas et ne touche ni à l'argent ni aux prix", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await t.asSystem();
      await staff(t, "moderateur");
      assert.equal(await t.rpc("admin_role"), "moderateur");
      assert.ok((await t.rpc("admin_players", "")).some((x) => x.id === p.characterId));
      await t.rpc("admin_sanction", p.characterId, "suspendu", 24, "Insultes dans le chat");
      assert.match(await rejects(t.rpc("admin_sanction", p.characterId, "banni", null, "Triche")), /réservé/);
      assert.match(await rejects(t.rpc("admin_adjust_cash", p.characterId, 1000, "test")), /réservé/);
      assert.match(await rejects(t.rpc("admin_set_price", "jobs", "vendeur_marche", 9000)), /réservé/);
    });
  });
});

describe("Sanctions", () => {
  test("joueur suspendu : plus aucune action ; l'état affiche le motif ; levée par un admin", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await t.asSystem();
      await staff(t, "admin");
      await t.rpc("admin_sanction", p.characterId, "suspendu", 48, "Spam");
      assert.match(await rejects(t.rpc("admin_sanction", p.characterId, "suspendu", 1, " ")), /motif/);
      await t.asUser(p.userId);
      assert.match(await rejects(t.rpc("start_activity", "appeler_famille")), /Compte suspendu jusqu'au .* : Spam/);
      const s = await t.rpc("game_state");
      assert.equal(s.sanction.kind, "suspendu");
      assert.equal(s.sanction.reason, "Spam");

      await t.asSystem();
      await staff(t, "admin");
      await t.rpc("admin_sanction", p.characterId, null, null, null);
      await t.asUser(p.userId);
      assert.equal((await t.rpc("game_state")).sanction, null);
      await t.rpc("start_activity", "appeler_famille");
    });
  });

  test("bannissement définitif ; une suspension expirée ne bloque plus", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await t.asSystem();
      await t.q("update characters set sanction = 'suspendu', sanction_until = now() - interval '1 hour', sanction_reason = 'x' where id = $1", [p.characterId]);
      await t.asUser(p.userId);
      await t.rpc("start_activity", "appeler_famille");
      await t.asSystem();
      await staff(t, "admin");
      await t.rpc("admin_sanction", p.characterId, "banni", null, "Multi-comptes");
      await t.asUser(p.userId);
      assert.match(await rejects(t.rpc("quit_job")), /Compte banni : Multi-comptes/);
    });
  });
});

describe("Argent et prix", () => {
  test("ajustement d'argent tracé (grand livre + audit) ; montant et motif contrôlés", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await t.asSystem();
      await staff(t, "admin");
      await t.rpc("admin_adjust_cash", p.characterId, 25000, "Compensation bug loyer");
      assert.match(await rejects(t.rpc("admin_adjust_cash", p.characterId, 0, "x")), /Montant invalide/);
      assert.match(await rejects(t.rpc("admin_adjust_cash", p.characterId, 5, "")), /motif/);
      assert.match(await rejects(t.rpc("admin_adjust_cash", p.characterId, -10000000, "retrait")), /il vous manque/);
      await t.asSystem();
      const [l] = await t.q("select amount::int, kind, ref from transactions where character_id = $1 order by id desc limit 1", [p.characterId]);
      assert.deepEqual(l, { amount: 25000, kind: "admin", ref: "Compensation bug loyer" });
      const [a] = await t.q("select action, details from admin_audit order by id desc limit 1");
      assert.equal(a.action, "ajustement_argent");
      assert.equal(a.details.amount, 25000);
    });
  });

  test("modifier un prix : appliqué aux nouvelles actions, audité", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await t.asSystem();
      await staff(t, "admin");
      const prices = await t.rpc("admin_prices");
      assert.ok(prices.shop.some((x) => x.code === "marche_dantokpa:beignets"));
      await t.rpc("admin_set_price", "jobs", "vendeur_marche", 3200);
      await t.rpc("admin_set_price", "shop", "marche_dantokpa:beignets", 350);
      assert.match(await rejects(t.rpc("admin_set_price", "jobs", "astronaute", 1000)), /introuvable/);
      assert.match(await rejects(t.rpc("admin_set_price", "jobs", "vendeur_marche", 0)), /invalide/);
      const log = await t.rpc("admin_audit_log");
      assert.deepEqual(log[0].details, { old: 300, new: 350 });
      await teleport(t, p.characterId, "dantokpa", p.userId);
      const s = await t.rpc("apply_for_job", "vendeur_marche");
      assert.equal(s.job.pay, 3200);
    });
  });
});

describe("Tableau de bord économique (CdC V2 §43)", () => {
  test("argent créé / détruit par nature, circulation, joueurs, métiers", async () => {
    await tx(async (t) => {
      const a = await newPlayer(t);
      await newPlayer(t);
      await t.asUser(a.userId);
      await t.rpc("start_activity", "appeler_famille");
      await t.asSystem();
      const [{ total }] = await t.q("select sum(cash)::bigint total from characters");
      await staff(t, "moderateur");
      const e = await t.rpc("admin_economy");
      assert.ok(e.players.total >= 2);
      const start = e.flows.find((f) => f.kind === "starting_cash");
      const act = e.flows.find((f) => f.kind === "activity");
      assert.ok(start.created_all >= 1000000);
      assert.ok(act.destroyed_all >= 100);
      assert.equal(Number(e.money.circulation), Number(total));
      assert.equal(e.jobs.length, 10);
    });
  });
});
