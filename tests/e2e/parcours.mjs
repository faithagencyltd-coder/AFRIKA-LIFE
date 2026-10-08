// Parcours complet dans un vrai navigateur (Supabase local + `npm run dev` lancés) :
// inscription → personnage → toilettes → zémidjan → embauche → service → salaire
// → agence → location → nuit chez soi.
// Usage : node tests/e2e/parcours.mjs [dossier_captures]
// Variables : BASE_URL (http://localhost:3000), DATABASE_URL (Supabase local), CHROMIUM_PATH.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

import pg from "pg";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.argv[2] ?? "test-results/e2e";
mkdirSync(OUT, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();

const pseudo = `e2e_${Date.now().toString(36)}`;
const email = `${pseudo}@wa-life.test`;

/** Termine immédiatement l'action en cours du personnage (accélérateur de test). */
async function finishActivity() {
  await db.query(
    `update characters set activity_started_at = activity_started_at - (activity_ends_at - now()) - interval '1 second',
       activity_ends_at = now() - interval '1 second' where pseudo = $1 and activity is not null`,
    [pseudo],
  );
}
/** Place l'horloge partagée à 9 h (les lieux et le marché sont ouverts). */
async function morning() {
  await db.query(`update game_config set world_epoch = now() - make_interval(secs => ((9 * 60) - start_game_minute) * 60.0 / time_scale)`);
}
const cash = async () => Number((await db.query("select cash from characters where pseudo = $1", [pseudo])).rows[0].cash);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "fr-FR" });
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const tab = (name) => page.getByRole("navigation").getByRole("button", { name });
/** Ouvre une application du téléphone. */
const openApp = async (name) => {
  await tab("Téléphone").click();
  await page.getByRole("button", { name, exact: true }).click();
};
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

try {
  await page.goto(BASE);
  await shot("01-accueil");

  // Inscription
  await page.goto(`${BASE}/connexion?mode=inscription`);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill("WaLife-Test-2026");
  await page.getByRole("checkbox").check();
  await shot("02-inscription");
  await page.getByRole("button", { name: "Créer un compte" }).last().click();
  await page.waitForURL("**/personnage");

  // Personnage
  await page.getByLabel("Prénom").fill("Afiavi");
  await page.getByLabel("Pseudo (unique)").fill(pseudo);
  await page.getByRole("button", { name: "Coiffure" }).click();
  await page.getByRole("button", { name: "Foulard (gèlè)" }).click();
  await page.getByRole("button", { name: "Tenue", exact: true }).click();
  await page.getByRole("button", { name: "Robe en wax" }).click();
  await shot("03-personnage");
  await page.getByRole("button", { name: /Commencer ma vie/ }).click();
  await page.waitForURL("**/jeu");
  assert.equal(await cash(), 500000);
  await morning();
  await page.reload();
  await shot("04-jeu-agla");

  // Toilettes de l'auberge (gratuit)
  await page.locator("li", { hasText: "Utiliser les toilettes" }).getByRole("button").click();
  await page.getByText("Utiliser les toilettes").first().waitFor();
  await page.locator("section[aria-live]").waitFor();
  await shot("05-action-en-cours");
  await finishActivity();
  await page.reload();
  await page.locator("section[aria-live]").waitFor({ state: "detached" });

  // Zémidjan vers Dantokpa
  await tab("Carte").click();
  await page.getByRole("button", { name: "Dantokpa" }).click();
  await shot("06-carte");
  await page.locator("li", { hasText: "Zémidjan" }).getByRole("button").click();
  await page.locator("section[aria-live]", { hasText: "Trajet vers Dantokpa" }).waitFor();
  assert.equal(await cash(), 499400);
  await finishActivity();
  await page.reload();
  await tab("Ici").click();
  await page.getByRole("heading", { name: "Dantokpa", exact: true }).waitFor();

  // Marché : beignets et basin brodé, beignets mangés depuis le sac, basin porté via la garde-robe
  const wallet = await cash();
  await page.locator("li", { hasText: /🍩\s*Beignets/ }).getByRole("button").click();
  await page.getByText("Beignets ajouté au sac").waitFor();
  await page.locator("li", { hasText: /👘\s*Basin brodé/ }).getByRole("button").click();
  await page.getByText("Basin brodé ajouté au sac").waitFor();
  assert.equal(await cash(), wallet - 300 - 42000);
  await shot("06b-marche");
  await openApp("Sac");
  await page.locator("li", { hasText: /🍩\s*Beignets/ }).getByRole("button", { name: "Consommer" }).click();
  await page.locator("section[aria-live]", { hasText: "Consommer : Beignets" }).waitFor();
  await finishActivity();
  await page.reload();
  await openApp("Garde-robe");
  await page.getByRole("button", { name: /Basin brodé/ }).click();
  await page.locator('button[aria-pressed="true"]', { hasText: "Basin brodé" }).waitFor();
  await shot("06c-garde-robe");
  // Mission 1 accomplie en mangeant : récompense réclamée
  await openApp("Missions");
  await page.getByRole("button", { name: /Réclamer la récompense/ }).click();
  await page.getByText("Trouve un travail").first().waitFor();
  await shot("06d-missions");
  await tab("Ici").click();

  // Embauche puis service
  await page.locator("div", { hasText: /^📢 Recrute : Vendeuse au marché/ }).getByRole("button", { name: "Postuler" }).click();
  await page.getByText("Votre poste").waitFor();
  await shot("07-dantokpa-embauche");
  await page.getByRole("button", { name: "Travailler" }).first().click();
  await page.locator("section[aria-live]", { hasText: "Service : Vendeuse au marché" }).waitFor();
  await shot("08-service");
  await finishActivity();
  await page.reload();
  await page.locator("section[aria-live]").waitFor({ state: "detached" });
  assert.equal(await cash(), 502400 - 42300 + 2000, "500 000 − 600 (zém) − 42 300 (marché) + 2 000 (mission) + 3 000 (salaire)");

  // Logement : zémidjan jusqu'à l'agence (Ganhi), location d'une chambre à Agla, retour, nuit chez soi.
  await tab("Carte").click();
  await page.getByRole("button", { name: "Ganhi" }).click();
  await page.locator("li", { hasText: "Zémidjan" }).getByRole("button").click();
  await page.locator("section[aria-live]", { hasText: "Trajet vers Ganhi" }).waitFor();
  await finishActivity();
  await page.reload();
  await tab("Ici").click();
  await page.getByRole("button", { name: /Voir les annonces/ }).click();
  await shot("09-annonces");
  const before = await cash();
  await page.locator("li", { hasText: "Chambre à Agla" }).getByRole("button", { name: /Louer/ }).click();
  await page.getByText("Prochain prélèvement").waitFor();
  assert.equal(await cash(), before - 30000, "1re semaine + caution");
  await shot("10-logement");
  await page.getByRole("button", { name: /Rentrer à Agla/ }).click();
  await page.locator("li", { hasText: "Zémidjan" }).getByRole("button").click();
  await page.locator("section[aria-live]", { hasText: "Trajet vers Agla" }).waitFor();
  await finishActivity();
  await page.reload();
  await tab("Ici").click();
  await page.getByText("🏠 Chez moi").waitFor();
  await page.locator("li", { hasText: "Dormir chez soi" }).getByRole("button").click();
  await page.locator("section[aria-live]", { hasText: "Dormir chez soi" }).waitFor();
  await shot("11-chez-moi");
  await finishActivity();
  await page.reload();

  await tab("Téléphone").click();
  await shot("12-telephone");
  await openApp("Emplois");
  await shot("12-travail");
  // Compétences gagnées pendant le service au marché
  await openApp("Compétences");
  await page.getByText("3/25 XP").first().waitFor();
  await shot("12b-competences");
  await tab("Moi").click();
  await page.getByText("Salaire").first().waitFor();
  await shot("13-moi");

  // Administration : le joueur reçoit le rôle admin (SQL, comme pour le premier admin réel)
  await db.query("insert into admins (user_id, role) select user_id, 'admin' from characters where pseudo = $1", [pseudo]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/admin`);
  await page.getByText("Sources et puits d'argent").waitFor();
  await shot("15-admin-economie");
  await page.goto(`${BASE}/admin/joueurs?q=${pseudo}`);
  await page.getByRole("button", { name: new RegExp(`@${pseudo}`) }).click();
  await page.getByPlaceholder("Motif (obligatoire)").fill("Test de modération");
  await page.getByRole("button", { name: "Suspendre" }).click();
  await page.getByText("Joueur suspendu.").waitFor();
  await shot("16-admin-joueurs");
  await page.goto(`${BASE}/jeu`);
  await page.getByText("Compte suspendu").waitFor();
  await page.goto(`${BASE}/admin/joueurs?q=${pseudo}`);
  await page.getByRole("button", { name: new RegExp(`@${pseudo}`) }).click();
  await page.getByRole("button", { name: "Lever la sanction" }).click();
  await page.getByText("Sanction levée.").waitFor();
  await page.goto(`${BASE}/admin/journal`);
  await page.getByText("sanction suspendu").first().waitFor();
  await page.goto(`${BASE}/jeu`);

  await tab("Carte").click();
  await shot("14-ordinateur-carte");

  assert.deepEqual(errors, [], "aucune erreur JavaScript");
  console.log(`✔ Parcours complet réussi (${pseudo}). Captures : ${OUT}`);
} finally {
  await browser.close();
  await db.end();
}
