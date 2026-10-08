# PROJECT WA LIFE — Architecture technique (étape 1)

Document de référence du projet. Il traduit le cahier des charges v1.0 en
choix techniques, en modèle de données et en règles de jeu chiffrées.
Toute nouvelle fonctionnalité doit respecter les décisions ci-dessous ou
les modifier explicitement ici (section « Journal des décisions »).

---

## 1. Principes directeurs

| # | Principe | Conséquence concrète |
|---|----------|----------------------|
| P1 | **Le serveur est la seule source de vérité** (CdC §43) | Le navigateur n'écrit jamais directement dans une table de jeu. Toute action passe par une fonction SQL (`rpc`) qui vérifie l'identité, les règles et l'argent dans **une seule transaction**. |
| P2 | **Évaluation paresseuse du temps** | Aucun processus ne « fait tourner » le monde chaque seconde. L'état d'un personnage (besoins, action terminée, salaire) est recalculé à partir des horodatages à chaque appel (`_settle`). Coût serveur quasi nul au repos, aucune triche possible par l'horloge du téléphone. |
| P3 | **Contenu du jeu = données, pas code** | Pays, villes, quartiers, bâtiments, activités, métiers, transports et réglages économiques sont des tables. L'administrateur (étape 15) pourra modifier les prix sans redéploiement. |
| P4 | **Chaque franc virtuel est tracé** | Tout mouvement d'argent passe par `_money()` qui écrit une ligne dans `transactions` (montant, solde après, motif). C'est la base de l'anti-triche (§44) et des analyses économiques (§26, §40). |
| P5 | **Modules indépendants, testés, versionnés** (§57) | Une migration SQL par module, des tests SQL (`tests/db`) et TypeScript (`tests/unit`) exécutés en CI à chaque push. Une fonctionnalité n'est terminée que si `npm run check` passe. |
| P6 | **Mobile-first, français d'abord, multilingue prévu** | Interface conçue pour un écran de 360 px. Les textes affichés passent par `src/i18n/fr.ts` ; les libellés du contenu sont en base (colonne `name`, traduction future par table `*_translations`). |

---

## 2. Pile technique

| Couche | Choix V1 | Pourquoi | Évolution prévue |
|--------|----------|----------|------------------|
| Application web | **Next.js 16** (App Router, React 19, TypeScript strict) | Même pile que NeoScool : savoir-faire réutilisé, déploiement Vercel, mobile + ordinateur sans installation (§4). | PWA installable (V1.5), applications Android/iOS via Capacitor (V2). |
| Style | **Tailwind CSS 4** | Rapide à « vibe-coder », responsive natif. | Thème graphique par ville. |
| Rendu du monde | **SVG** (carte schématique des quartiers, avatar en couches) | Léger, net sur tous les écrans, aucun moteur à charger pour la boucle de jeu V1. | **Phaser** pour les scènes 2D/isométriques où l'on voit les autres joueurs se déplacer (étape 11) ; Three.js / Godot seulement en V3. |
| Base de données | **PostgreSQL (Supabase)** | Transactions ACID pour l'argent, RLS pour la sécurité, fonctions SQL pour les règles. | Réplicas de lecture pour les classements. |
| Authentification | **Supabase Auth** | E-mail + mot de passe, Google, Apple, téléphone (§37) sans code d'authentification maison. | Téléphone (SMS) quand le budget SMS est validé. |
| Temps réel | **Supabase Realtime** (WebSocket) | Présence dans un lieu, chat, déplacements (§22). | Serveur WebSocket dédié (Colyseus / Node) si > ~5 000 joueurs simultanés par ville. |
| Hébergement | **Vercel** (application) + **Supabase** (données) | Zéro serveur à administrer au lancement. | Région de données la plus proche de l'Afrique de l'Ouest disponible. |
| Paiements réels | Prestataire Mobile Money (ex. FeexPay, déjà utilisé par NeoScool) | Étape 14 — jamais avant que l'économie virtuelle soit stable. | Cartes, Apple/Google In-App. |

### Pourquoi la logique de jeu est en SQL et pas dans Next.js

Un achat = vérifier le solde, débiter, écrire le journal, appliquer l'effet.
Fait depuis Next.js avec `supabase-js`, ce sont plusieurs requêtes **non
atomiques** : un double clic ou deux onglets peuvent dépenser deux fois le
même argent. Dans une fonction PostgreSQL, la ligne du personnage est
verrouillée (`for update`) et tout réussit ou tout échoue. Next.js ne fait
qu'afficher et appeler ces fonctions.

---

## 3. Vue d'ensemble

```
 Téléphone / ordinateur (navigateur)
 ┌──────────────────────────────────────────────┐
 │ Next.js — pages React (client)               │
 │  • HUD : horloge, argent, 6 besoins          │
 │  • Carte SVG des quartiers, lieux, métiers   │
 │  • Avatar SVG                                │
 └───────────────┬──────────────────────────────┘
                 │ Server Actions (cookies de session)
 ┌───────────────▼──────────────────────────────┐
 │ Next.js — serveur (Vercel)                   │
 │  • proxy.ts : session, redirections          │
 │  • src/server/*-actions.ts : rpc()         │
 └───────────────┬──────────────────────────────┘
                 │ PostgREST (JWT de l'utilisateur)
 ┌───────────────▼──────────────────────────────┐
 │ Supabase PostgreSQL                          │
 │  Catalogue (lecture publique) │ RLS          │
 │  Personnages (lecture : soi)  │ aucune       │
 │  Journal d'argent / actions   │ écriture     │
 │  Fonctions rpc : create_character,           │
 │  game_state, start_activity, travel_to,      │
 │  apply_for_job, quit_job, start_work,        │
 │  rent_home, buy_home, leave_home, …          │
 └──────────────────────────────────────────────┘
```

---

## 4. Modèle de données

Conventions : `snake_case`, clés `uuid` pour les données de joueurs,
`code text` lisible pour le catalogue (`cotonou`, `vendeur_marche`), montants
en **FCFA entiers (`bigint`)**, horodatages `timestamptz`.

### 4.1 Catalogue (modifiable par l'admin, lisible par tous)

| Table | Rôle | Colonnes clés |
|-------|------|---------------|
| `game_config` | Réglages globaux (1 ligne) | `world_epoch`, `time_scale`, `start_game_minute`, `starting_cash`, `need_decay` (jsonb), `idle_cap_minutes`, `job_level_xp` |
| `countries` | Pays (§1) | `code` (BJ, TG, CI), `name`, `currency`, `is_open` |
| `cities` | Villes | `code`, `country_code`, `name`, `is_open`, `spawn_district_code` |
| `districts` | Quartiers (§16) | `code`, `city_code`, `name`, `kind` (centre, marché, premium, populaire, plage…), `x_km`, `y_km` |
| `buildings` | Lieux interactifs (§17) | `code`, `district_code`, `name`, `kind`, `open_hour`, `close_hour` |
| `activities` | Ce qu'on peut faire dans un lieu | `code`, `building_code` (null = partout), `name`, `duration_minutes`, `price`, `effects` (jsonb des besoins), `xp` |
| `transport_modes` | Marche, zémidjan, taxi, bus (§15) | `base_fare`, `fare_per_km`, `minutes_per_km` |
| `jobs` | Métiers (§10) | `code`, `building_code`, `tier`, `base_pay`, `shift_minutes`, `shift_start_hour`, `shift_end_hour`, `required_level`, `xp_per_shift`, `effects` |
| `appearance_options` | Options de personnalisation autorisées (§6) | `category`, `code` |
| `homes` | Logements à louer / acheter (§12) | `code`, `district_code`, `category`, `comfort` 1-5, `required_level`, `rent_per_week`, `price`, `upkeep_per_week` |
| `home_activities` | Ce qu'on fait chez soi | `code`, `min_comfort`, `duration_minutes`, `price`, `effects` |

### 4.2 Données des joueurs (lecture : le propriétaire ; écriture : fonctions uniquement)

| Table | Rôle |
|-------|------|
| `characters` | Un personnage par compte (V1). Identité, apparence (jsonb validé), `cash`, `xp`, `city_code`, `district_code`, 6 besoins (`hunger`, `energy`, `hygiene`, `fun`, `social`, `bladder`), `needs_updated_at`, `activity` (jsonb : instantané de l'action en cours), `activity_ends_at`. |
| `character_jobs` | Carrière : métier, niveau 1-5, XP, services effectués, actif ou non (§11). |
| `transactions` | Grand livre de l'argent virtuel (P4). |
| `activity_log` | Historique de toutes les actions terminées (analytics §40, anti-triche §44). |
| `character_homes` | Logement occupé (un actif en V1) : location ou propriété, montant périodique figé, caution, prochaine échéance, arriérés, impayés. |
| `notifications` | Messages au joueur (§36) : loyer prélevé, impayé, expulsion, nouveau logement. |

### 4.3 Tables prévues aux étapes suivantes (non créées en V1)

`items` / `inventory` / `shops` (étape 10) ·
`presence` (étape 11, Realtime) · `messages` / `blocks` / `reports` (étape 12) ·
`missions` / `character_missions` (étape 13) · `products` / `payments` /
`subscriptions` (étape 14) · `admins` / `audit_log` (étape 15) ·
`vehicles`, `businesses`, `properties`, `advertisements`, `events`,
`leaderboards` (V2).

Ces tables suivront les mêmes règles : lecture contrôlée par RLS, écriture
uniquement par fonctions, argent uniquement par `_money()`.

---

## 5. Sécurité (§43, §44, §46)

1. **RLS activée sur toutes les tables.** Catalogue : `select` pour `anon` et
   `authenticated`. Données joueur : `select` seulement si
   `user_id = auth.uid()`. **Aucun** droit `insert/update/delete` pour les
   rôles clients.
2. **Fonctions `security definer`** avec `search_path` fixé ; chacune commence
   par identifier le personnage de `auth.uid()` et le verrouille
   (`select … for update`) : deux requêtes simultanées s'exécutent l'une après
   l'autre.
3. **Fonctions internes** (préfixe `_`) : `execute` retiré à `public`, `anon`,
   `authenticated`. Elles ne sont pas appelables depuis l'API.
4. **Entrées validées en base** : pseudo (3-20 caractères, unique, insensible à
   la casse), âge 18-60 (§3 : jeu 18+), apparence uniquement parmi
   `appearance_options`, ville ouverte.
5. **Limitation naturelle des requêtes** : un personnage occupé (travail,
   trajet, sommeil) ne peut rien lancer d'autre. Un limiteur par IP/compte
   (Vercel / Supabase) s'ajoutera avant l'ouverture publique.
6. **Détection d'anomalies** : `transactions` et `activity_log` permettent de
   repérer un gain horaire anormal (requête d'admin, étape 15).
7. **Monnaie virtuelle non convertible** (§9, §58) : aucune fonction ne permet
   de retirer des FCFA virtuels vers de l'argent réel.

---

## 6. Règles du jeu chiffrées (V1, modifiables dans `game_config` / catalogue)

### 6.1 Temps (§8)

* Horloge **partagée** par tous les joueurs (indispensable au multijoueur) :
  `minute_de_jeu = start_game_minute + (maintenant − world_epoch) × time_scale`.
* **`time_scale = 15`** : 1 minute réelle = 15 minutes de jeu ; une journée de
  jeu dure **1 h 36 réelle**.
* Durées (en temps de jeu → temps réel) : service de travail 2 h → 8 min ;
  trajet ~30 min → 2 min ; repas 30 min → 2 min ; nuit 8 h → 32 min.
* Lieux et métiers ont des horaires (marché 6 h-19 h, cinéma 14 h-24 h…).

### 6.2 Besoins (§7)

Six jauges de 0 à 100 (100 = parfaitement satisfait), qui baissent par heure de jeu :

| Besoin | Baisse / h de jeu | Se recharge avec |
|--------|------------------:|------------------|
| 🍔 Faim (`hunger`) | 5 | maquis, restaurant, marché, buvette |
| ⚡ Énergie (`energy`) | 4 | dormir (auberge), se reposer (plage) |
| 🧼 Hygiène (`hygiene`) | 3 | douche (auberge) |
| 🎉 Divertissement (`fun`) | 3 | cinéma, plage, lounge |
| 👥 Social (`social`) | 2 | maquis, lounge, plage, appeler la famille |
| 🚽 Besoin sanitaire (`bladder`) | 8 | WC publics, toilettes d'un lieu |

**Absence prolongée** : quand le joueur ne joue pas, la baisse est plafonnée
à `idle_cap_minutes = 30` minutes réelles par absence (≈ 7 h 30 de jeu). On
retrouve son personnage fatigué et affamé, jamais « mort » après un
week-end. Le temps passé dans une action lancée (sommeil, travail) compte
entièrement.

**Conséquences** : pour **travailler** il faut Énergie ≥ 20, Faim ≥ 15 et
Besoin sanitaire ≥ 10. Le travail lui-même coûte de l'énergie et de l'hygiène.

### 6.3 Argent (§9, §26)

* Capital de départ : **500 000 FCFA virtuels** (`starting_cash`).
* Sources V1 : salaires, revente de logement. Sorties V1 : repas, transport,
  auberge, douche, toilettes, loisirs, crédit téléphone, **loyer / charges**,
  achat de logement.
* Ordre de grandeur d'une journée de jeu pour un débutant : 3-4 services
  (≈ 12 000 à 18 000 FCFA) contre ≈ 10 000 FCFA de dépenses de base. Le
  joueur progresse lentement mais sûrement ; le logement (§6.6) est le
  premier gros puits d'argent.

### 6.4 Métiers et carrière (§10, §11)

* 10 métiers débutants rattachés à un lieu (vendeur au marché, serveur,
  chauffeur, livreur, agent de sécurité, caissier, assistant de bureau,
  mécanicien, maçon, électricien).
* Un seul emploi actif à la fois. Pour travailler il faut être **dans le
  quartier du lieu de travail, pendant ses horaires**.
* 5 niveaux par métier ; XP cumulée requise : 0 / 40 / 120 / 240 / 400
  (10 XP par service). Salaire = `base_pay × (1 + 0,25 × (niveau − 1))`
  → +100 % au niveau 5.
* Niveau global du joueur : `niveau = ⌊(1 + √(1 + 8·XP/100)) / 2⌋`
  (100 XP pour le niveau 2, 300 pour le 3, 600 pour le 4…). Les métiers
  intermédiaires exigeront un niveau global (colonne `required_level`).

### 6.5 Déplacements (§15)

* Distance à vol d'oiseau entre centres de quartiers (coordonnées en km).
* Prix = `base_fare + fare_per_km × distance` (arrondi à 50 FCFA) ;
  durée = `minutes_per_km × distance` (minimum 5 min de jeu).
* Marche (gratuit, lent), zémidjan (rapide, bon marché), taxi-ville
  (confort), bus (moins cher, plus lent).

---

### 6.6 Logement (§12, §13)

* Une **semaine de jeu** (`rent_period_game_days = 7`) dure **11 h 12 réelles**.
* Les contrats se signent à l'**agence immobilière** (Ganhi, 8 h-18 h). Location :
  1re semaine + caution d'une semaine. Achat : prix comptant, puis des charges
  hebdomadaires. Déménager rend d'abord l'ancien logement.
* À chaque échéance, le loyer (ou les charges) est **prélevé automatiquement**,
  même pendant une absence. Si le solde est insuffisant : arriéré + **10 %** de
  pénalité, notification, **confort −1 étoile** tant que les arriérés ne sont pas
  réglés. Au **3e impayé**, le locataire est **expulsé** et perd sa caution. Un
  propriétaire n'est jamais expulsé.
* Quitter : caution rendue (arriérés déduits ; refus si elle ne les couvre pas) ;
  un logement acheté est revendu à **80 %** du prix.
* Le confort (1 à 5 étoiles) débloque les activités à domicile : dormir, toilettes
  et seau (1), douche et cuisine (2), télévision (3), piscine et recevoir des
  amis (4). Dormir chez soi est gratuit, contre 5 000 FCFA à l'auberge.

| Logement | Quartier | Confort | Loyer / semaine | Prix | Niveau |
|----------|----------|:------:|----------------:|-----:|:-----:|
| Chambre « entrer-coucher » | Akpakpa | ★ | 12 000 | — | 1 |
| Chambre | Agla | ★ | 15 000 | — | 1 |
| Studio | Gbégamey | ★★ | 35 000 | 6 000 000 | 1 |
| Studio meublé | Cadjèhoun | ★★ | 40 000 | 7 500 000 | 2 |
| Appartement 2 chambres | Cadjèhoun | ★★★ | 90 000 | 18 000 000 | 3 |
| Appartement vue mer | Fidjrossè | ★★★ | 110 000 | 22 000 000 | 3 |
| Villa avec piscine | Haie Vive | ★★★★ | 300 000 | 75 000 000 | 5 |
| Maison de luxe | Haie Vive | ★★★★★ | 700 000 | 180 000 000 | 7 |
| Penthouse | Ganhi | ★★★★★ | 1 000 000 | 300 000 000 | 8 |

## 7. Cycle d'une action (exemple : « Manger un plat au maquis »)

1. Le client appelle la Server Action `doActivity('maquis_plat')`.
2. Next.js appelle `rpc('start_activity', { p_code })` avec le JWT du joueur.
3. La fonction :
   1. trouve et **verrouille** le personnage de `auth.uid()` ;
   2. `_settle()` : termine l'action précédente si elle est finie (effets,
      salaire, XP, journal), puis applique la baisse des besoins ;
   3. vérifie : pas occupé, bon quartier, lieu ouvert, argent suffisant ;
   4. `_money(-1500, 'activity', 'maquis_plat')` ;
   5. enregistre l'instantané de l'action (effets, gain, XP) et sa fin.
4. Next.js appelle `refresh()` : l'écran se met à jour en un aller-retour.
5. À la fin du minuteur, l'écran redemande `game_state` → `_settle()` applique
   les effets. Si le joueur a fermé l'application, ils s'appliqueront à son
   retour, à l'heure exacte où l'action s'est terminée.

L'instantané garantit qu'un changement de prix par l'admin n'affecte pas
une action déjà payée.

---

## 8. Arborescence du dépôt

```
wa-life/
├─ docs/                    ARCHITECTURE.md (ce document), ROADMAP.md
├─ supabase/
│  ├─ migrations/           un fichier SQL par module (ordre chronologique)
│  └─ seed.sql              comptes de test (jamais en production)
├─ scripts/db/              base de test locale (émulation Supabase)
├─ src/
│  ├─ app/                  pages : accueil, connexion, personnage, jeu
│  ├─ components/           avatar, carte, jauges, interface du jeu
│  ├─ game/                 règles partagées en TypeScript pur (horloge,
│  │                        formats, apparence) — testées sans navigateur
│  ├─ i18n/                 textes de l'interface (fr)
│  ├─ lib/supabase/         clients navigateur / serveur / proxy
│  └─ server/               appels aux fonctions de jeu (Server Actions)
└─ tests/
   ├─ db/                   règles serveur (PostgreSQL réel)
   └─ unit/                 logique TypeScript
```

---

## 9. Qualité et livraison (§57)

* `npm run check` = typecheck + lint + tests unitaires + tests base + build.
* GitHub Actions exécute `check` sur chaque push et pull request (PostgreSQL 16
  en service). Une branche rouge ne se fusionne pas.
* Une migration publiée n'est **jamais modifiée** : on en ajoute une nouvelle.
* Chaque module livré met à jour ce document et `docs/ROADMAP.md`.

---

## 10. Montée en charge (V2-V3)

* L'évaluation paresseuse (P2) rend le coût proportionnel aux **actions**,
  pas au nombre de joueurs inscrits.
* Le multijoueur sera découpé par **salle = lieu** (`city:district:building`) :
  un joueur ne reçoit que les messages du lieu où il se trouve.
* Les classements seront des vues matérialisées rafraîchies périodiquement,
  pas des requêtes en direct.
* Ajouter une ville = insérer des lignes (`cities`, `districts`, `buildings`,
  `activities`, `jobs`) puis passer `is_open` à vrai. Aucun code à modifier.

---

## 11. Journal des décisions

| Date | Décision |
|------|----------|
| 2026-10-08 | D-01 Logique de jeu en fonctions PostgreSQL (atomicité de l'argent). |
| 2026-10-08 | D-02 Horloge partagée, `time_scale = 15`, évaluation paresseuse. |
| 2026-10-08 | D-03 Baisse des besoins plafonnée à 30 min réelles par absence. |
| 2026-10-08 | D-04 Carte et avatar en SVG pour la V1 ; Phaser à l'étape 11. |
| 2026-10-08 | D-05 Un personnage par compte en V1. |
| 2026-10-08 | D-06 Lancement : Cotonou uniquement ouvert ; Lomé (V1.5) puis Abidjan (V2) déjà présents dans le catalogue, fermés. |
| 2026-10-09 | D-07 Loyer prélevé automatiquement, y compris pendant les absences (contrairement aux besoins) : c'est le principal puits d'argent. |
| 2026-10-09 | D-08 Expulsion au 3e impayé (locataire uniquement) ; arriérés = loyer + 10 %. |
| 2026-10-09 | D-09 Un seul logement occupé en V1 ; la possession de plusieurs biens viendra avec l'immobilier (V2). |
