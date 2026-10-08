# PROJECT WA LIFE

Jeu de simulation de vie en Afrique de l'Ouest : web, mobile-first, multijoueur à terme.
Lancement à **Cotonou** 🇧🇯, puis Lomé 🇹🇬 et Abidjan 🇨🇮.

> Nom de code de développement. Le nom de marque sera choisi avant le lancement.

## Ce qui est jouable aujourd'hui (MVP, étapes 1 à 7)

- Compte : e-mail + mot de passe, Google (à activer dans Supabase).
- Création du personnage : prénom, pseudo unique, sexe, âge, pays/ville, apparence complète avec avatar en direct.
- Cotonou : 8 quartiers, 18 lieux, carte interactive, trajets à pied, en zémidjan, en taxi-ville ou en bus.
- 6 besoins (faim, énergie, hygiène, divertissement, social, besoin sanitaire) et 28 activités pour les satisfaire.
- Horloge partagée : 1 minute réelle = 15 minutes de jeu ; actions qui durent ; lieux avec horaires.
- 10 métiers, 5 niveaux par métier, salaire progressif ; il faut être en forme pour travailler.
- Économie serveur : 500 000 FCFA virtuels au départ, chaque franc est tracé.

## Documentation

- [Architecture technique](docs/ARCHITECTURE.md) — choix, modèle de données, sécurité, règles chiffrées.
- [Feuille de route](docs/ROADMAP.md) — les 17 étapes du cahier des charges et leur état.

## Démarrer en local

Prérequis : Node.js 22.18+, Docker.

```bash
npm install
npm run supabase -- start          # base, authentification, API (migrations appliquées)
cp .env.example .env.local         # puis coller l'API URL et l'anon key affichées
npm run dev                        # http://localhost:3000
```

## Tests

```bash
npm run db:reset    # base de test PostgreSQL locale (émulation Supabase), PG* standard
npm run check       # typage + lint + tests unitaires + tests base + build (comme la CI)
npm run test:e2e    # parcours complet dans Chromium (Supabase local et npm run dev lancés)
```

## Mise en production

1. Créer un projet Supabase, puis appliquer les migrations : `npm run supabase -- link` puis `npm run supabase -- db push`
   (ou coller les fichiers de `supabase/migrations/` dans l'éditeur SQL, dans l'ordre).
2. Supabase › Authentication : URL du site, URL de redirection `https://<domaine>/auth/callback` et `/auth/confirm`,
   fournisseur Google (identifiants OAuth Google Cloud).
3. Vercel : importer le dépôt, définir `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.
