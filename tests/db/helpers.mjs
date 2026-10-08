// Utilitaires de test : exécute des requêtes « en tant que » joueur Supabase
// (rôle authenticated + claims JWT), dans une transaction toujours annulée.
import { randomUUID } from "node:crypto";

import pg from "pg";

export const pool = new pg.Pool({
  host: process.env.PGHOST ?? "localhost",
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.PGDATABASE ?? "walife_test",
  max: 4,
});

/** Apparence valide par défaut. */
export const LOOK = {
  skin: "cacao",
  face: "ovale",
  hair: "afro",
  outfit: "chemise_wax",
  outfit_color: "indigo",
  shoes: "sandales",
  accessory: "aucun",
};

/**
 * Ouvre une transaction annulée à la fin. fn reçoit un objet :
 *  q(sql, params)       → lignes (chaque requête dans un savepoint)
 *  asUser(id) / asAnon() / asSystem()  → change d'identité
 *  newUser()            → crée un compte auth.users et renvoie son id
 *  rpc(name, ...args)   → appelle une fonction publique et renvoie son résultat
 */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const q = async (sql, params) => {
      await client.query("savepoint q");
      try {
        const result = await client.query(sql, params);
        await client.query("release savepoint q");
        return result.rows;
      } catch (error) {
        await client.query("rollback to savepoint q");
        throw error;
      }
    };
    const asSystem = async () => {
      await q("reset role");
      await q("select set_config('request.jwt.claims', '', true)");
    };
    const asUser = async (id) => {
      await asSystem();
      await q("set local role authenticated");
      await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
    };
    const asAnon = async () => {
      await asSystem();
      await q("set local role anon");
      await q(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    };
    const newUser = async () => {
      const id = randomUUID();
      await asSystem();
      await q("insert into auth.users (id, email, created_at) values ($1, $2, now())", [id, `${id}@test.local`]);
      return id;
    };
    const rpc = async (name, ...args) => {
      const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
      const [row] = await q(`select public.${name}(${placeholders}) as r`, args);
      return row.r;
    };
    return await fn({ q, asUser, asAnon, asSystem, newUser, rpc });
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}

/** Vérifie qu'une promesse échoue ; renvoie le message d'erreur. */
export async function rejects(promise) {
  try {
    await promise;
  } catch (error) {
    return error.message;
  }
  throw new Error("La requête aurait dû échouer.");
}

/** Crée un joueur avec un personnage à Cotonou et le connecte. */
export async function newPlayer(t, overrides = {}) {
  const id = await t.newUser();
  await t.asUser(id);
  const o = { firstName: "Koffi", pseudo: `j${id.slice(0, 8)}`, gender: "homme", age: 25, city: "cotonou", look: LOOK, ...overrides };
  const state = await t.rpc("create_character", o.firstName, o.pseudo, o.gender, o.age, o.city, JSON.stringify(o.look));
  return { userId: id, characterId: state.character.id, state };
}

/**
 * Place l'horloge du jeu à une heure donnée (minute du jour) en déplaçant world_epoch.
 * À appeler en système ; ré-identifie ensuite le joueur.
 */
export async function setGameTime(t, hour, minute = 0, userId) {
  await t.asSystem();
  await t.q(
    `update game_config set world_epoch = now() - make_interval(secs => (($1::int * 60 + $2::int) - start_game_minute) * 60.0 / time_scale)`,
    [hour, minute],
  );
  if (userId) await t.asUser(userId);
}

/** Fait comme si l'action en cours (et la dernière mise à jour des besoins) dataient de `realMinutes` minutes. */
export async function rewind(t, characterId, realMinutes, userId) {
  await t.asSystem();
  await t.q(
    `update characters set
       activity_started_at = activity_started_at - make_interval(mins => $2),
       activity_ends_at = activity_ends_at - make_interval(mins => $2),
       needs_updated_at = needs_updated_at - make_interval(mins => $2)
     where id = $1`,
    [characterId, realMinutes],
  );
  if (userId) await t.asUser(userId);
}

/** Fixe les besoins d'un personnage (système). */
export async function setNeeds(t, characterId, needs, userId) {
  await t.asSystem();
  const sets = Object.keys(needs).map((k, i) => `${k} = $${i + 2}`).join(", ");
  await t.q(`update characters set ${sets}, needs_updated_at = now() where id = $1`, [characterId, ...Object.values(needs)]);
  if (userId) await t.asUser(userId);
}

/** Déplace un personnage (système). */
export async function teleport(t, characterId, district, userId) {
  await t.asSystem();
  await t.q("update characters set district_code = $2 where id = $1", [characterId, district]);
  if (userId) await t.asUser(userId);
}
