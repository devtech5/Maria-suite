@AGENTS.md

# Maria Suite — conventions

ERP de **MARIA GROUP SARL**, en Côte d'Ivoire. Une seule entreprise : pas
d'inscription publique, pas d'abonnement, pas de choix d'entreprise. Elle
naît avec `pnpm installer`, les comptes s'ajoutent par invitation.
Next.js (App Router) · TypeScript · PostgreSQL · Drizzle. La caisse fonctionne
hors connexion.

## Règles non négociables

### L'argent est un entier

Un montant est un entier, dans la plus petite unité de sa devise. Le franc CFA
n'a pas de subdivision : 2 900 XOF se stocke `2900`.

Jamais de flottant, y compris pour un total intermédiaire ou une moyenne.
Toute division passe par `divideMoney`, toute ventilation par `allocate` ou
`allocateByWeights` (`src/lib/money.ts`), qui garantissent que la somme des
parts retombe exactement sur le total.

### Rien n'existe hors d'une entreprise

Toute table métier porte `organization_id`. Aucune requête ne s'écrit sans
filtrer dessus. Maria Suite ne sert qu'une entreprise, mais la colonne et le
filtre restent : retirer l'un ou l'autre demanderait une migration
destructive, et la session sélectionne d'elle-même l'unique entreprise.

### Un utilisateur n'est pas une personne

Trois natures distinctes, jamais fusionnées :

| Table | Qui | Ce qu'elle porte |
|---|---|---|
| `users` | Celui qui ouvre le logiciel | Compte, rôle, permissions |
| `employees` | Salarié déclaré | Contrat, bulletin, CNPS, ITS |
| `workers` | Intervenant | Pointage, taux, bon de paiement |

Un maçon, un manœuvre, un tâcheron, un chauffeur occasionnel, un serveur extra
ou un coach n'ouvre jamais l'application et n'a pas de bulletin de paie. Il est
payé à la journée, à la tâche ou à l'unité d'œuvre. Le régime intervenant sert
au BTP, à la livraison, au maquis, au garage, au salon et à l'agriculture.

### Le hors-ligne se décide maintenant

Les identifiants sont produits par le client (`newId()`, UUID v7). Une vente
encaissée sans réseau porte déjà son identifiant définitif au moment où le
ticket s'imprime.

Toute table réplicable porte `version`, `updated_at` et `deleted_at` — une
suppression se réplique, donc elle est logique. Les écritures passent par
`sync_mutations` (idempotent, l'identifiant vient du client) et alimentent
`change_log` (ordonné, sert au rattrapage et à l'historique).

### Aucun référentiel étranger en dur

Le concurrent vend en Côte d'Ivoire des écrans calibrés pour le Sénégal :
NINEA, DGID, IPRES, CSS, TRIMF. Chez nous, l'identifiant fiscal, les organismes
sociaux, les taux et les déclarations viennent du pays de l'entreprise.
En Côte d'Ivoire : NCC, DGI, CNPS, ITS, IGR, TVA 18 %.

### Toute pièce est numérotée

Ticket, facture, devis, bon de transfert, contrat : numéro séquentiel, sans
trou ni doublon, via `document_sequences`. L'attribution se fait dans la
transaction qui crée la pièce, par `UPDATE ... RETURNING` — jamais un `SELECT`
suivi d'un `UPDATE`, sinon deux caisses simultanées produisent le même numéro.

Format issu du terrain (ticket SOCOCE, Yopougon) : `05-00066854/G` —
préfixe, compteur sur 8 chiffres, suffixe. D'où `prefix` / `padding` / `suffix`
plutôt qu'un format figé.

## Règles de modélisation

### Une ligne de vente peut en porter d'autres

Cas type : un magasin de pièces détachées vend une pièce, et le client demande
qu'elle soit montée. Le montage est facturé en plus.

Ce n'est pas un module. Une ligne de vente porte `parent_line_id` et un
`line_kind` parmi `article`, `prestation`, `frais`. La prestation est une ligne
fille rattachée à la pièce vendue.

Conséquences à respecter :

- La prestation pointe vers un article de **type service**, avec son propre prix
  et son propre compte comptable. Vente de marchandise et vente de service ne se
  ventilent pas sur le même compte SYSCOHADA, et leur régime de TVA peut différer.
- La prestation peut porter un exécutant (`worker_id`) et un coût de
  main-d'œuvre, sans quoi la marge réelle de l'opération est fausse.
- Supprimer la ligne mère supprime ses filles. Un montage sans pièce n'a pas de sens.
- Le ticket imprime la prestation sous sa pièce, en retrait.

Le même mécanisme sert au-delà des pièces détachées : meuble et assemblage,
climatiseur et installation, pneu et équilibrage, tissu et couture, matériaux
et transport sur chantier, bouteille de gaz et consigne.

### Tout objet créé peut porter un code scannable

Article, engin, ordinateur du parc, plat de la carte, modèle d'atelier,
employé, ticket, contrat, chambre, colis : chacun peut recevoir un ou plusieurs
codes via `entity_codes`.

- Plusieurs codes par entité, jamais une colonne unique. Un article porte l'EAN
  du fabricant **et** notre code interne ; les deux doivent répondre au scan.
- Le type suit l'usage : QR pour un badge ou un ticket, EAN-13 pour un produit
  du commerce, Code 128 pour une étiquette de rayon, NFC pour un accès.
- `token` est la clé de résolution universelle : un scan retrouve l'entité sans
  savoir d'avance de quel type d'objet il s'agit.
- La résolution doit marcher **sans réseau** quand l'appareil détient la donnée.
  `target_url` ne sert qu'au scan par un téléphone tiers — un client qui vérifie
  un reçu, un agent qui contrôle un badge.
- Un code se remplace sans toucher l'entité : étiquette abîmée, badge perdu.

C'est ce qui alimente les étiquettes de rayon, le code-barres en pied de ticket
et les cartes professionnelles personnalisées des employés.

## Structure

```
src/
  app/                 routes Next
  db/
    index.ts           connexion, pool mis en cache en développement
    schema/            socle transverse uniquement
  lib/                 money, ids — utilitaires sans dépendance métier
  modules/
    registry.ts        les 28 modules en 3 couches : socle, moteur, métier
```

Le schéma sous `db/schema` ne contient que le socle : entreprises, comptes,
droits, numérotation, audit, synchronisation. Les tables métier vivent dans
leur module et sont réexportées depuis `db/schema/index.ts`.

## Avant chaque commit

`pnpm lint`, `pnpm typecheck` **et** `pnpm test` doivent passer. Les trois, pas
l'un ou l'autre : le build Next réussit malgré des erreurs ESLint, et une
erreur est ainsi restée plusieurs jours dans le dépôt — `registry.ts`
assignait la variable réservée `module`.

Attention en vérifiant à la main : `pnpm verify | tail` renvoie le code de
`tail`, pas celui de pnpm. Un échec de lint y passe pour un succès. Rediriger
vers un fichier et lire `$?`.

`lint` tourne avec `--max-warnings 0` : un avertissement fait échouer le
commit. Sans cela le hook ne bloquait rien, puisque ESLint sort en code 0 tant
qu'il n'y a que des avertissements. L'arbre est à zéro aujourd'hui, il y reste.

C'est automatisé, pas laissé à la discipline. Le hook `.githooks/pre-commit`
lance les trois ; `pnpm install` configure `core.hooksPath` tout seul via le
script `prepare`. En cas d'urgence, `git commit --no-verify` passe outre.

Pour lancer les trois à la main : `pnpm verify`.

### Ce que les tests couvrent

Le **calcul**, et lui seul : l'argent, les quantités, la numérotation, le
réapprovisionnement. Une erreur d'affichage se voit ; un franc perdu par ligne,
non — il se découvre à la déclaration de TVA, six mois plus tard.

Les tests unitaires vivent dans `tests/`, tournent sous Vitest et ne touchent
jamais la base. Ce qui passe par PostgreSQL se vérifie contre une vraie base,
avec ses contraintes et sa numérotation : un test à double simulerait
justement la partie qui casse. C'est `tests/integration/` (`pnpm test:base`) :
PGlite en mémoire, toutes migrations appliquées, `globalThis.mariaDb`
installé pour que `@/db` le retrouve. `pnpm verify`, le hook et la CI lancent
les deux.

`vitest.config.mts` neutralise `server-only` — le paquet lève une exception
hors d'un bundler React, ce qui rendrait intestable un module serveur, y
compris ses fonctions purement arithmétiques. Même piège en ligne de commande :
un script `tsx` qui importe un tel module se lance avec
`npx tsx --conditions=react-server`.

## Commandes

```bash
pnpm dev                      # serveur de développement
pnpm dev:local                # idem, sur une base locale PGlite (.pglite/), sans PostgreSQL installé
pnpm verify                   # analyse statique + types + tests
pnpm test                     # tests unitaires seuls
pnpm test:watch               # les mêmes, en continu
pnpm db:generate              # génère la migration depuis le schéma
pnpm db:migrate               # applique les migrations
pnpm db:check                 # connexion, tables, RLS
pnpm db:studio                # inspecteur de base
```

Copier `.env.example` vers `.env.local` avant le premier démarrage.

## Les fichiers vivent dans un dépôt, pas dans la base

Le module Documents joint des pièces aux entités métier. Le fichier ne va pas
en base : il part dans le dossier `STOCKAGE_LOCAL` (un volume persistant et
sauvegardé), et seule sa clé est stockée.

Tout passe par `src/lib/stockage/` — une interface, un adaptateur derrière
(`local.ts`, le disque), comme `src/lib/auth/canaux/` pour l'envoi des codes.
Le reste de l'application ne connaît que l'interface : passer un jour à un
stockage objet (S3) revient à écrire un adaptateur. **Aucun SDK d'hébergeur** :
la plateforme ne dépend que de PostgreSQL et du système de fichiers.

**Aucun lien direct ne fonctionne.** Chaque ouverture passe par `/fichiers/…`
avec une URL signée HMAC (`AUTH_SECRET`) valable cinq minutes, demandée au clic
et jamais rendue dans le HTML — une adresse posée dans une page en cache
resterait valable pour qui la retrouve.

Le chemin d'un fichier commence par l'identifiant de l'entreprise
(`<org>/<document>.<ext>`), pour isoler sur le préfixe comme `organization_id`
isole les lignes.

Sans `STOCKAGE_LOCAL`, le module reste utilisable : les fiches se créent, les
échéances se suivent, et seul l'ajout de pièce refuse en disant pourquoi.

## Base locale sans serveur : PGlite

`pnpm dev:local` démarre l'application sur PGlite, un vrai PostgreSQL compilé
en WebAssembly qui tourne dans le processus Node. Les données vivent dans
`.pglite/` (ignoré par git). Au démarrage, `instrumentation.ts` ouvre la base,
applique les migrations et recopie le catalogue des droits.

Deux limites à connaître : un seul processus ouvre le dossier (les scripts
`db:*` ne peuvent pas y accéder pendant que le serveur tourne), et
`db.execute` y rend `{ rows }` — `src/db/pglite.ts` le ramène au tableau que
rend postgres-js. Jamais en production.

Les pièces jointes (photos de projet, preuves de paiement, documents) vont
alors dans `.pglite/fichiers/`, par le même adaptateur disque qu'en
production, où le dossier vit sur un volume sauvegardé ; jamais sur un disque
éphémère.

Après un arrêt brutal pendant une installation, Turbopack peut servir des
404 sur toutes les routes : supprimer `.next/dev` et relancer.

## Déploiement sur VPS

`DEPLOIEMENT.md` décrit la pile : `Dockerfile` (Next `output: "standalone"`),
`docker-compose.prod.yml` (application, PostgreSQL 18, Caddy, sauvegarde
quotidienne). `MIGRATIONS_AU_DEMARRAGE=1` fait appliquer migrations et droits
par `instrumentation.ts` au démarrage (`src/db/demarrage.ts`).

La production tourne sur Dokploy : build **Dockerfile**
(Nixpacks prend Node 18, où pnpm 11 plante), base PostgreSQL gérée par Dokploy
sur le réseau interne, volume nommé sur `/donnees/fichiers`. Section « Avec
Dokploy » de `DEPLOIEMENT.md`.

## Entreprise unique

`pnpm installer` (ou `node scripts/installer.cjs` dans l'image) crée
MARIA GROUP SARL, ses rôles préréglés et son propriétaire —
`michael.kadio05@gmail.com`, super administrateur du logiciel, sauf
`MARIA_ADMIN_EMAIL` — avec un mot de passe provisoire. Idempotent ; refuse une base qui porte une autre
entreprise. Logique commune dans `src/db/installation.ts` : avec
`MIGRATIONS_AU_DEMARRAGE=1`, `MARIA_ADMIN_MOT_DE_PASSE` renseignée la lance
aussi au démarrage, sans jamais toucher un compte existant.
Un compte sans rattachement actif aboutit sur `/sans-acces`.

Les colonnes d'abonnement d'`organizations` et la table
`paiements_abonnement` sont des vestiges : plus rien ne les lit.

## Verrouillage après inactivité

Sans souris, clavier ni toucher pendant `organizations.delai_verrouillage_minutes`
(10 par défaut, réglable sur `/entreprise`), l'écran se voile et ne s'ouvre
qu'avec le mot de passe ; la page reste montée, la saisie est conservée.
`exigerSession` refuse toute page et toute action à une session verrouillée
(`sessions.verrouillee_le`, ou `last_seen_at` plus vieux que délai + marge) :
recharger ne contourne pas le voile. Règles pures : `src/lib/auth/verrou.ts`.

**La caisse est exemptée** : elle passe `exigerEntreprise({ malgreVerrou: true })`
— page, encaissement, ouverture et clôture de tiroir. Toute nouvelle action
appelée depuis l'écran de caisse doit en faire autant, sinon un onglet de
gestion voisin qui se voile bloque l'encaissement. Nulle part ailleurs.

## Présences : pointage automatique

Tout compte qui ouvre un écran est pointé présent : `pointerApresReponse`
(`src/modules/presences/pointage.ts`) dans les coques gestion et accueil, la
caisse et le signal de présence du verrou. La première activité du jour pose
l'arrivée, les suivantes la dernière activité ; au plus une écriture toutes
les cinq minutes par compte, APRÈS la réponse (`after`), jamais bloquante.
Pas seulement à la connexion : une session dure trente jours.

Jours de congé en CENTIÈMES entiers (2,2 j = 220), jamais en flottant. Le jour
se calcule dans le fuseau de l'entreprise (`organizations.timezone`). La règle
d'acquisition vient du pays (`regleConges`) et reste « à vérifier » tant que
personne ne l'a attestée, comme le barème de paie.

## Interrogations de fond et liens publics

Tout ce qui interroge le serveur en tâche de fond — la cloche, la
messagerie — lit la session par `session()` et rend un résultat VIDE si elle
est verrouillée, sans rediriger : une redirection ferait perdre la page
conservée sous le voile. Le navigateur suspend d'ailleurs ces interrogations
onglet caché ou écran verrouillé (`localStorage` `maria-verrou`).

Ce qu'un client ouvre sans compte (sa facture, sa désinscription) passe par
`src/lib/liens-publics.ts` : jeton signé HMAC, objet et expiration dedans,
rien en base. Les routes publiques sont listées dans `ROUTES_LIBRES` du proxy.

Un secret qu'il faut RELIRE (mot de passe d'application d'une boîte mail) se
chiffre avec `src/lib/chiffrement.ts` (AES-256-GCM, clé dérivée
d'`AUTH_SECRET` par usage) ; un mot de passe de connexion, lui, se hache.

## Reprise de l'existant

`/demarrage` (`src/modules/reprise/`) importe des CSV (articles, tiers avec
soldes, stock initial) et reprend les soldes de trésorerie. Une créance
reprise est une facture émise, une dette une facture fournisseur : elles se
règlent et se lettrent comme les autres. Contrepartie : le compte d'attente
4711, à reclasser par le comptable. Un fichier passe en entier ou pas du tout.

## La base est un PostgreSQL, n'importe lequel

Aucun hébergeur imposé. En production, le PostgreSQL géré par Dokploy, joint
par le réseau interne (`DATABASE_URL` seule). En développement, PGlite
(`pnpm dev:local`) ou le `docker-compose.yml`.

**Derrière un pooler en mode transaction** (PgBouncer, `pgbouncer=true` dans
l'URL), `src/db/index.ts` désactive les requêtes préparées, et les migrations
passent par `DATABASE_URL_MIGRATION`, une connexion directe : drizzle-kit exige
une session stable. Sans pooler, `DATABASE_URL_MIGRATION` reste vide.

**RLS est actif sur toutes les tables** et doit le rester : toute nouvelle
table l'active dans la migration qui la crée. Aucune policy n'est définie :
Maria Suite se connecte avec un rôle propriétaire, qui contourne RLS, et
l'isolation entre entreprises est assurée par le filtre `organization_id`.
RLS est la défense en profondeur — si un outil expose un jour le schéma
`public` (API REST automatique, rôle de lecture), rien n'y fuit.
`pnpm db:check` le vérifie.
