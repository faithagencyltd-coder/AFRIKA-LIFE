# WEST AFRICA LIFE — Analyse du projet existant face au cahier des charges V2

Rapport demandé par l'« instruction finale » du CdC V2. Aucune modification
majeure n'est faite avant validation de l'ordre d'implémentation (§7).
Référence du code analysé : commit `04291df` (étapes 1 à 7 et 9 du CdC V1).

---

## 1. Architecture actuelle

| Couche | Choix | Détail |
|--------|-------|--------|
| Application | Next.js 16 (App Router, React 19, TypeScript strict), Tailwind 4 | Mobile-first, en français, textes communs dans `src/i18n/fr.ts` |
| Données | Supabase PostgreSQL | 17 tables, 39 fonctions SQL, RLS sur toutes les tables |
| Logique de jeu | **Fonctions PostgreSQL** (`security definer`) | Le navigateur n'écrit jamais dans une table : il appelle `create_character`, `start_activity`, `travel_to`, `start_work`, `rent_home`… Chaque fonction verrouille le personnage et s'exécute en une transaction |
| Temps | Horloge partagée, évaluation paresseuse | 1 min réelle = 15 min de jeu ; l'état est recalculé à chaque appel (`_settle`), aucun processus en tâche de fond |
| Argent | Grand livre `transactions` | Seul point d'écriture : `_money()` (solde jamais négatif, motif obligatoire) |
| Contenu | Données en base | Pays, villes, quartiers, lieux, activités, métiers, transports, logements, prix, réglages économiques |
| Rendu | SVG | Carte schématique par ville, avatar en couches |
| Authentification | Supabase Auth | E-mail + mot de passe, Google ; proxy de session Next.js |
| Qualité | `npm run check` + CI GitHub Actions | 13 tests unitaires, 39 tests SQL, 1 parcours navigateur complet |

Organisation du code :

```
supabase/migrations/   1 fichier par module : catalogue, personnages, moteur, logement
src/app/               pages : accueil, connexion, personnage, jeu (onglets Ici, Carte, Travail, Logement, Moi)
src/game/              règles TypeScript pures (horloge, formats, besoins, apparence)
src/server/            Server Actions = appels aux fonctions SQL
tests/db, tests/unit, tests/e2e
```

**Constat** : l'architecture correspond déjà aux principes du CdC V2
(§43-44 V1, §54 V2) : serveur source de vérité, modules, tests, contenu
modifiable sans redéploiement. Elle n'a pas besoin d'être refaite.

---

## 2. Fonctionnalités déjà présentes

| Domaine | Ce qui fonctionne |
|---------|------------------|
| Compte | Inscription / connexion e-mail, Google (à activer côté Supabase), confirmation d'e-mail, 18+ déclaré |
| Personnage | Prénom, pseudo unique, sexe, âge 18-60, pays/ville, 7 catégories d'apparence (peau, visage, coiffure, tenue, couleur, chaussures, accessoire), avatar SVG |
| Monde | 3 pays, 7 villes au catalogue (seule Cotonou ouverte), 8 quartiers, 19 lieux avec horaires, carte interactive |
| Besoins | Faim, énergie, hygiène, divertissement, social, besoin sanitaire ; baisse horaire ; plafond d'absence |
| Temps | Horloge partagée jour/nuit, actions qui durent, lieux qui ferment la nuit |
| Transport | À pied, zémidjan, taxi-ville, bus : prix et durée selon la distance |
| Travail | 10 métiers, 5 niveaux par métier, salaire progressif, horaires, conditions physiques |
| Argent | 500 000 FCFA virtuels de départ, chaque mouvement tracé, aucun moyen de créer de l'argent côté client |
| Logement | 9 logements (chambre → penthouse), location et achat à l'agence, loyer hebdomadaire automatique, arriérés + 10 %, perte de confort, expulsion, revente à 80 %, activités à domicile |
| Notifications | Loyer payé / impayé, expulsion, nouveau logement |
| Sécurité | RLS, liste blanche des fonctions appelables, tests anti-triche |

---

## 3. Base de données actuelle

| Groupe | Tables |
|--------|--------|
| Réglages | `game_config` |
| Géographie | `countries`, `cities`, `districts`, `buildings` |
| Contenu | `activities`, `transport_modes`, `jobs`, `appearance_options`, `homes`, `home_activities` |
| Joueur | `characters` (identité, apparence, argent, XP, besoins, action en cours), `character_jobs`, `character_homes` |
| Journaux | `transactions` (grand livre), `activity_log`, `notifications` |

Points d'extension déjà prévus : `countries.is_open` / `cities.is_open`
(ouvrir un pays = insérer des lignes), types de transactions contraints
mais extensibles, instantané figé de chaque action (un changement de prix
n'affecte pas une action payée).

---

## 4. Correspondance CdC V2 → existant

Légende : ✅ présent · 🟡 base présente, à étendre · 🔧 à modifier · ⏳ absent · 💤 optionnel / long terme

| § V2 | Fonctionnalité | État | Commentaire |
|-----:|----------------|:----:|-------------|
| 2, 5, 61 | Vie virtuelle à trajectoires multiples | 🟡 | Boucle employé + locataire en place ; les chemins entrepreneur, investisseur, commerçant et influenceur sont à construire |
| 3 | Pays extensibles | ✅ | Ajouter un pays = des lignes en base |
| 4 | Villes modulaires | 🟡 | Modèle prêt ; contenu uniquement pour Cotonou |
| 6 | Formations, diplômes | ⏳ | |
| 7 | Compétences | ⏳ | À brancher sur le travail existant |
| 8 | Réputation (pro, sociale, commerciale) | ⏳ | |
| 9-10 | Entreprises, employés, PNJ | ⏳ | |
| 11-12 | Commerce entre joueurs, marché | ⏳ | Dépend de l'inventaire |
| 13 | Banque, épargne, prêts | ⏳ | Le grand livre facilite l'ajout |
| 14 | Investissement | ⏳ | |
| 15 | Immobilier avancé | 🔧 | Location et achat présents, mais **un seul logement par joueur** (D-09) |
| 16 | Construction | ⏳ | |
| 17 | Voyage entre pays | 🔧 | `travel_to` limité à la ville du joueur |
| 18 | Identité culturelle | 🟡 | Lieux, plats, tenues (wax, boubou, gèlè), zémidjan ; à poursuivre dans chaque module |
| 19 | Transport local par pays | 🔧 | Les modes de transport sont communs à toutes les villes |
| 20-21 | Véhicules, carburant, stations | ⏳ | |
| 22-24 | Amis, groupes, couple, famille | ⏳ | Famille : long terme |
| 25-27 | WA Social, influence, médias | ⏳ | |
| 28-29 | Événements, sport | ⏳ | |
| 30 | Clubs | ⏳ | |
| 31-32 | Politique, justice | 💤 | Optionnels ; fictifs et abstraits si un jour intégrés |
| 33 | Ville évolutive | 🟡 | Le contenu en base le permet ; aucun outil admin encore |
| 34 | Saisons | ⏳ | |
| 35-36, 40 | Monétisation, WA Coin, VIP | ⏳ | Monnaie premium à concevoir **séparée** du FCFA virtuel |
| 37-39 | Publicité, dashboard annonceur | ⏳ | |
| 41 | Anti-inflation | 🟡 | Puits existants : loyer, charges, nourriture, transport ; taxes et frais à ajouter |
| 42-43 | Admin, tableau de bord économique | ⏳ | Argent créé / détruit calculable dès maintenant depuis `transactions` |
| 44-45 | IA, PNJ | ⏳ | Les PNJ existent seulement dans les textes (Maman Bella, Tantie Rose) |
| 46-48 | Monde vivant, météo, jour/nuit | 🟡 | Jour/nuit et horaires présents ; météo absente |
| 49 | Personnalisation | 🟡 | Avatar complet ; logement et véhicule à faire |
| 52 P1 | MVP : inventaire, missions | ⏳ | **Les deux seuls manques de la priorité 1** |
| 53 | Architecture modulaire | 🟡 | Modules en SQL ; côté interface à réorganiser par domaine (voir §5) |
| 57 | Tests par fonctionnalité | ✅ | Règle déjà appliquée |

---

## 5. Ce qui doit être modifié (sans casser l'existant)

Chaque point se fait par une **nouvelle migration** : les migrations publiées ne sont jamais réécrites.

1. **Nom du jeu** : « WA Life / PROJECT WA LIFE » devient **WEST AFRICA LIFE**
   (`src/i18n/fr.ts`, métadonnées, README, docs). Changement mineur.
2. **Navigation** : 5 onglets suffisent aujourd'hui mais pas pour 15 modules
   (banque, marché, formations, social…). Je propose un **téléphone du
   personnage** : un écran d'« applications » (Banque, WA Social, Emplois,
   Formations, Marché, Immobilier…). Ce menu est extensible, il parle aux
   joueurs et il prépare la publicité (§37). Les onglets Ici, Carte et Moi
   restent.
3. **Code d'interface par domaine** (§53) : déplacer progressivement
   `src/app/jeu/*-tab.tsx` et `src/server/game-actions.ts` vers
   `src/features/<module>/` (`homes`, `jobs`, `bank`…), au fil des modules et
   jamais en une seule fois.
4. **Transports par pays** (§19) : table de liaison ville ↔ mode de transport
   (gbaka et wôrô-wôrô seulement à Abidjan, zémidjan au Bénin…). Les quatre
   modes actuels sont rattachés à Cotonou.
5. **Immobilier** (§15) : séparer la **résidence** (où je dors,
   `character_homes`) des **biens possédés** (nouvelle table `properties` :
   plusieurs biens, mise en location à d'autres joueurs, rénovation,
   mobilier). La résidence actuelle reste compatible.
6. **Argent** (§13, §40) : `_money()` gagne une notion de **compte** (espèces
   ou banque). Le WA Coin aura **son propre grand livre**, sans conversion
   libre avec le FCFA virtuel.
7. **Voyage** (§17) : nouvelle fonction de voyage interurbain et
   international (gare routière, aéroport) qui change `city_code`. La fonction
   `travel_to` reste pour les trajets dans la ville.
8. **Métiers** (§6) : colonnes de prérequis (diplôme, compétences) et métiers
   intermédiaires accessibles après formation.

---

## 6. Fonctionnalités encore absentes

Inventaire, boutiques, missions, multijoueur (présence), chat et modération,
relations, banque (épargne, prêts), véhicules et carburant, compétences,
réputation, formations, commerce entre joueurs, marché, entreprises et
employés, PNJ, immobilier multi-biens, construction, autres villes et
voyage, événements, saisons, sport, clubs, WA Social, influence, médias,
météo, publicité et portail annonceur, WA Coin, VIP, paiements réels,
administration, tableau de bord économique, analytics, IA. Optionnels :
politique, justice, famille.

---

## 7. Ordre d'implémentation recommandé

Il suit les priorités du §52 et tient compte de trois contraintes :

* Ce qui **déplace de l'argent entre joueurs** (banque, commerce, marché,
  employés) attire les multi-comptes et la revente contre de l'argent réel.
  Ces fonctions ne doivent arriver qu'avec des plafonds, des frais, un niveau
  minimum, et après l'admin.
* Le §59 prévoit de lancer le Bénin avec **3 villes** : Porto-Novo et
  Abomey-Calavi passent donc avant la bêta publique.
* **Pas de chat sans signalement, blocage et modération** (V1 §46).

### Phase A — Terminer le MVP (priorité 1) et préparer l'alpha

| # | Module | Contenu | Dépend de |
|---|--------|---------|-----------|
| A1 | Nom + navigation « téléphone » | WEST AFRICA LIFE, écran d'applications | — |
| A2 | **Inventaire + boutiques** | Objets (nourriture, vêtements, téléphone, meubles), achat en boutique, inventaire, cuisiner avec ses ingrédients, vêtements achetés qui changent l'avatar, meubles qui augmentent le confort | — |
| A3 | **Missions** | Parcours « Nouvelle vie » (trouver un emploi → 10 000 FCFA, travailler 5 jours → 25 000 FCFA, louer une chambre…) et objectifs que le joueur se fixe (§50) | A2 |
| A4 | **Admin minimal + tableau de bord économique** | Joueurs, sanctions, prix, argent créé / détruit, revenus moyens, métiers rentables (§42-43) | — |
| A5 | **Compétences + réputation professionnelle** | Gagnées en travaillant ; elles préparent les formations | — |
| — | **Alpha fermée** | Déploiement Vercel + Supabase, petit groupe de testeurs (§59) | A1-A4 |

### Phase B — Monde partagé (priorité 2) et lancement Bénin

| # | Module |
|---|--------|
| B1 | Multijoueur : présence par lieu (Supabase Realtime), profils publics |
| B2 | Chat (lieu, privé) **avec** signalement, blocage, filtre, modération admin |
| B3 | Amis et relations (connaissance → ami → meilleur ami) |
| B4 | Banque : compte, dépôt / retrait, salaire versé en banque, transferts plafonnés avec frais |
| B5 | Véhicules (moto, voiture), carburant, stations-service, entretien, état |
| B6 | Porto-Novo + Abomey-Calavi + voyage interurbain → **bêta Bénin** |

### Phase C — Économie profonde (priorité 3)

C1 Formations et diplômes, métiers intermédiaires · C2 Marché et commerce
entre joueurs (séquestre côté serveur, frais, historique, limites) ·
C3 Entreprises niveaux 1-2 (micro-activité, boutique), employés PNJ puis
joueurs · C4 Immobilier multi-biens, location à d'autres joueurs, rénovation ·
C5 Épargne et prêts bancaires · C6 Taxes virtuelles.

### Phase D — Expansion (priorité 4)

D1 Lomé (Togo) et voyage international en bus · D2 Abidjan (transports
locaux : gbaka, wôrô-wôrô), Yamoussoukro, Bouaké · D3 Avion.

### Phase E — Revenus B2B (priorité 5)

Panneaux publicitaires sur la carte, campagnes, portail annonceur
(impressions, interactions), événements sponsorisés, saisons.

### Phase F — Social et monde vivant (priorité 6)

WA Social (publications, likes, abonnés), influence, médias, clubs, sport et
compétitions, météo, ville évolutive, construction, entreprises niveaux 3-5.

### Phase G — Monétisation et avancé (priorité 7)

WA Coin, cosmétiques, VIP (sans pay-to-win, §36), paiements Mobile Money,
applications mobiles, PNJ animés par IA (validation serveur obligatoire,
§44), 3D. Optionnels : famille, politique, justice.

---

## 8. Décisions à valider

1. **Ordre** : commencer par la phase A, dans l'ordre A1 → A5 ?
2. **Navigation « téléphone »** (§5.2) : d'accord sur le principe ?
3. **Bénin à 3 villes avant la bêta publique** (§59) : Porto-Novo et
   Abomey-Calavi en B6, avant Lomé ?
4. **Compétences en phase A** (avancées par rapport au §52, priorité 3), car
   elles enrichissent tout de suite le travail existant et sont peu coûteuses ?
5. **Dépôt GitHub** : créer `wa-life` (ou un autre nom, par exemple
   `west-africa-life`) pour sauvegarder le code et activer la CI.
