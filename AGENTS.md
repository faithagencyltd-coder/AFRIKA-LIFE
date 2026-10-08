<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PROJECT WA LIFE — règles du projet

Lire `docs/ARCHITECTURE.md` (décisions, règles chiffrées) et `docs/ROADMAP.md` (étapes) avant toute modification.

1. **Ne jamais casser une fonctionnalité existante.** `npm run check` doit passer avant chaque commit.
2. **Le serveur est la seule source de vérité.** Aucune écriture directe dans une table depuis le client :
   toute règle de jeu est une fonction SQL `security definer` qui verrouille le personnage (`_lock_my_character`),
   appelle `_settle`, puis vérifie avant d'agir. L'argent ne bouge que par `_money()`.
3. **Une migration publiée n'est jamais modifiée** : ajouter un nouveau fichier dans `supabase/migrations/`.
   Chaque migration se termine par `revoke execute on all functions in schema public from public, anon, authenticated`
   puis une liste blanche explicite ; mettre à jour `PUBLIC_RPC` dans `tests/db/securite.test.mjs`.
4. **Chaque module est testé** : règles serveur dans `tests/db/*.test.mjs`, logique TypeScript dans `tests/unit/*.test.ts`.
5. **Le contenu est en base** (villes, lieux, prix, métiers) : pas de valeur de jeu codée en dur dans l'interface.
6. Interface en français, mobile-first (360 px), textes communs dans `src/i18n/fr.ts`.
