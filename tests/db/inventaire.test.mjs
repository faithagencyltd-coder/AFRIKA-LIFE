// Phase A2 — Inventaire et boutiques : achat, stock, sac, consommation, meubles, garde-robe.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { LOOK, newPlayer, pool, rejects, rewind, setGameTime, setNeeds, teleport, tx } from "./helpers.mjs";

after(() => pool.end());

const bag = (s) => Object.fromEntries(s.inventory.map((i) => [i.code, i.quantity]));

async function atMarket(t) {
  const p = await newPlayer(t);
  await teleport(t, p.characterId, "dantokpa");
  await setGameTime(t, 10, 0, p.userId);
  return p;
}

describe("Inventaire (CdC §19)", () => {
  test("tout nouveau personnage a un téléphone basique dans son sac", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      assert.deepEqual(bag(p.state), { telephone_basique: 1 });
    });
  });

  test("acheter : paiement tracé, objet réellement ajouté au sac", async () => {
    await tx(async (t) => {
      const p = await atMarket(t);
      const s = await t.rpc("buy_item", "marche_dantokpa", "beignets", 3);
      assert.equal(s.character.cash, 499100);
      assert.equal(bag(s).beignets, 3);
      const [l] = await t.q("select amount::int, kind, ref from transactions where character_id = $1 order by id desc limit 1", [p.characterId]);
      assert.deepEqual(l, { amount: -900, kind: "purchase", ref: "beignets" });
      assert.equal(bag(await t.rpc("buy_item", "marche_dantokpa", "beignets", 2)).beignets, 5);
    });
  });

  test("refus : mauvais lieu, boutique fermée, article non vendu, quantité invalide, argent insuffisant", async () => {
    await tx(async (t) => {
      const p = await atMarket(t);
      assert.match(await rejects(t.rpc("buy_item", "supermarche_ganhi", "sandwich", 1)), /Rendez-vous d'abord à Supermarché du Centre \(Ganhi\)/);
      assert.match(await rejects(t.rpc("buy_item", "marche_dantokpa", "smartphone", 1)), /ne vend pas cet article/);
      assert.match(await rejects(t.rpc("buy_item", "marche_dantokpa", "beignets", 0)), /Quantité invalide/);
      assert.match(await rejects(t.rpc("buy_item", "marche_dantokpa", "beignets", 21)), /Quantité invalide/);
      await setGameTime(t, 20, 0, p.userId);
      assert.match(await rejects(t.rpc("buy_item", "marche_dantokpa", "beignets", 1)), /fermé à cette heure/);
      await setGameTime(t, 10, 0);
      await t.q("update characters set cash = 100 where id = $1", [p.characterId]);
      await t.asUser(p.userId);
      assert.match(await rejects(t.rpc("buy_item", "marche_dantokpa", "beignets", 1)), /il vous manque 200 FCFA/);
      assert.deepEqual(bag(await t.rpc("game_state")), { telephone_basique: 1 }, "rien n'a été ajouté");
    });
  });

  test("stock partagé, remis à neuf chaque jour de jeu ; limite de port", async () => {
    await tx(async (t) => {
      const p = await atMarket(t);
      await t.rpc("buy_item", "marche_dantokpa", "rechaud", 1);
      assert.match(await rejects(t.rpc("buy_item", "marche_dantokpa", "rechaud", 1)), /pas porter plus de 1 × Réchaud/);
      await t.asSystem();
      await t.q("update shop_items set stock = 2 where building_code = 'marche_dantokpa' and item_code = 'ingredients'");
      const [{ day }] = await t.q("select game_minute(now()) / 1440 as day");
      await t.q("update shop_items set restocked_day = $1 where building_code = 'marche_dantokpa'", [day]);
      await t.asUser(p.userId);
      assert.match(await rejects(t.rpc("buy_item", "marche_dantokpa", "ingredients", 3)), /il reste 2 × Panier d'ingrédients aujourd'hui/);
      await t.asSystem();
      await t.q("update shop_items set restocked_day = restocked_day - 1 where building_code = 'marche_dantokpa'");
      await t.asUser(p.userId);
      await t.rpc("buy_item", "marche_dantokpa", "ingredients", 3);
      const [{ stock }] = await t.q("select stock from shop_items where building_code = 'marche_dantokpa' and item_code = 'ingredients'");
      assert.equal(stock, 57, "60 au réassort − 3");
    });
  });

  test("consommer : retiré du sac, effets à la fin, où que l'on soit", async () => {
    await tx(async (t) => {
      const p = await atMarket(t);
      await t.rpc("buy_item", "marche_dantokpa", "gari_arachide", 1);
      await teleport(t, p.characterId, "akpakpa", p.userId);
      await setNeeds(t, p.characterId, { hunger: 30 }, p.userId);
      let s = await t.rpc("use_item", "gari_arachide");
      assert.equal(s.character.activity.label, "Consommer : Gari et arachides");
      assert.equal(bag(s).gari_arachide, undefined);
      await rewind(t, p.characterId, 1, p.userId);
      s = await t.rpc("game_state");
      assert.equal(s.character.needs.hunger, 48.8, "30 − 15 min de jeu × 5/h + 20");
      assert.match(await rejects(t.rpc("use_item", "gari_arachide")), /pas de Gari et arachides/);
      assert.match(await rejects(t.rpc("use_item", "telephone_basique")), /ne se consomme pas/);
    });
  });

  test("activité qui demande un objet : appeler la famille (téléphone), vidéos (smartphone)", async () => {
    await tx(async (t) => {
      const p = await newPlayer(t);
      await t.rpc("start_activity", "appeler_famille");
      await rewind(t, p.characterId, 2, p.userId);
      assert.match(await rejects(t.rpc("start_activity", "regarder_videos")), /Il vous faut : Smartphone/);
      await t.asSystem();
      await t.q("delete from inventory where character_id = $1", [p.characterId]);
      await t.asUser(p.userId);
      assert.match(await rejects(t.rpc("start_activity", "appeler_famille")), /Il vous faut : Téléphone basique ou Smartphone/);
    });
  });
});

describe("Meubles et cuisine à domicile", () => {
  test("le réchaud permet de cuisiner dans une chambre ; cuisiner consomme des ingrédients", async () => {
    await tx(async (t) => {
      const p = await atMarket(t);
      await teleport(t, p.characterId, "ganhi", p.userId);
      await t.rpc("rent_home", "chambre_agla");
      await teleport(t, p.characterId, "agla", p.userId);
      assert.match(await rejects(t.rpc("start_home_activity", "maison_cuisiner")), /confort 2\) ou : Réchaud à gaz/);
      await t.asSystem();
      await t.q("insert into inventory (character_id, item_code, quantity) values ($1, 'rechaud', 1)", [p.characterId]);
      await t.asUser(p.userId);
      assert.match(await rejects(t.rpc("start_home_activity", "maison_cuisiner")), /pas de Panier d'ingrédients/);
      await t.asSystem();
      await t.q("insert into inventory (character_id, item_code, quantity) values ($1, 'ingredients', 2)", [p.characterId]);
      await t.asUser(p.userId);
      const s = await t.rpc("start_home_activity", "maison_cuisiner");
      assert.equal(s.character.activity.code, "maison_cuisiner");
      assert.equal(bag(s).ingredients, 1);
    });
  });
});

describe("Garde-robe (CdC V2 §49)", () => {
  test("options de départ libres ; tenue achetée seulement si possédée ; pas à la création", async () => {
    await tx(async (t) => {
      await atMarket(t);
      let s = await t.rpc("change_look", "hair", "locks");
      assert.equal(s.character.appearance.hair, "locks");
      assert.match(await rejects(t.rpc("change_look", "outfit", "basin_brode")), /Achetez d'abord « Basin brodé »/);
      await t.rpc("buy_item", "marche_dantokpa", "basin_brode", 1);
      s = await t.rpc("change_look", "outfit", "basin_brode");
      assert.equal(s.character.appearance.outfit, "basin_brode");
      assert.match(await rejects(t.rpc("change_look", "outfit", "cape")), /inconnue/);

      const other = await t.newUser();
      await t.asUser(other);
      assert.match(
        await rejects(t.rpc("create_character", "Ama", "ama_tg", "femme", 30, "cotonou", JSON.stringify({ ...LOOK, outfit: "basin_brode" }))),
        /s'achète en boutique/,
      );
    });
  });
});
