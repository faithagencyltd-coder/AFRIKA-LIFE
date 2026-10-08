# PROJECT WA LIFE — Feuille de route

Suivi des 17 étapes du cahier des charges (§56). Une étape est « faite »
quand son code, ses tests et sa documentation sont fusionnés et que
`npm run check` passe.

> Cahier des charges V2 (WEST AFRICA LIFE) : voir [ANALYSE-V2.md](ANALYSE-V2.md) pour la
> correspondance avec l'existant et l'ordre d'implémentation proposé (phases A à G).

| Étape | Module | État | Contenu livré / à livrer |
|------:|--------|------|--------------------------|
| 1 | Architecture | ✅ Fait | `docs/ARCHITECTURE.md`, dépôt, CI, base de test locale |
| 2 | Authentification | ✅ Fait | E-mail + mot de passe, Google (à activer dans Supabase), confirmation d'e-mail, déconnexion, proxy de session |
| 3 | Création du personnage | ✅ Fait | Prénom, pseudo unique, sexe, âge 18-60, pays/ville, apparence (peau, visage, coiffure, tenue, couleur, chaussures, accessoire) avec avatar SVG en direct |
| 4 | Ville | ✅ Fait | Cotonou : 8 quartiers, 18 lieux, carte SVG, trajets à pied / zémidjan / taxi-ville / bus |
| 5 | Besoins | ✅ Fait | 6 jauges, baisse horaire, activités qui les rechargent, plafond d'absence |
| 6 | Temps | ✅ Fait | Horloge partagée (1 min réelle = 15 min de jeu), horaires des lieux, actions qui durent |
| 7 | Métiers | ✅ Fait | 10 métiers débutants, 5 niveaux, salaire progressif, conditions physiques pour travailler |
| 8 | Économie | 🟡 Base posée | Grand livre `transactions` ; à faire : taxes virtuelles, tableau de bord des flux |
| 9 | Logement | ✅ Fait | 9 logements (chambre → penthouse), location et achat à l'agence, loyer prélevé chaque semaine de jeu, arriérés + 10 %, perte de confort, expulsion au 3e impayé, revente à 80 %, 9 activités à domicile, notifications |
| 10 | Inventaire | ⏳ | Objets, nourriture achetée, vêtements |
| 11 | Multijoueur | ⏳ | Présence par lieu (Supabase Realtime), scène Phaser |
| 12 | Chat | ⏳ | Privé, groupe, public par lieu ; signalement, blocage, filtre |
| 13 | Missions | ⏳ | « Trouve un travail » (10 000), « Travaille 5 jours » (25 000)… |
| 14 | Monétisation | ⏳ | VIP, objets premium, Mobile Money |
| 15 | Admin | ⏳ | Joueurs, sanctions, économie, catalogue, statistiques |
| 16 | Tests | 🔁 Continu | Tests base + unitaires à chaque module |
| 17 | Déploiement | ⏳ | Vercel + Supabase, domaine, supervision |

## Prochaine étape proposée

**Étape 10 — Inventaire et mobilier** (§14, §18, §19) : acheter de la
nourriture au marché pour cuisiner chez soi, des vêtements qui changent
l'avatar, et des meubles (lit, climatiseur, télévision…) qui augmentent le
confort du logement.
