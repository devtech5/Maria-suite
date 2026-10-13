# Déployer Maria Suite sur un VPS

Une seule machine porte tout : l'application (Node, image Docker), PostgreSQL,
Caddy pour le HTTPS automatique, et un service de sauvegarde. Rien d'autre à
louer.

## Ce qu'il faut

- Un VPS Linux (Ubuntu 24.04 ou Debian 12), **2 Go de RAM minimum**, 4 Go
  conseillés, 40 Go de disque. La construction de l'image est le moment le
  plus gourmand.
- Un nom de domaine dont l'enregistrement **A** pointe vers l'IP du VPS
  (ex. `app.exemple.ci`). Caddy obtient le certificat tout seul, à condition
  que le DNS réponde déjà.
- Les ports **80 et 443** ouverts. Le port 22 pour SSH. Rien d'autre :
  PostgreSQL n'est publié sur aucun port.

## Première installation

```bash
# 1. Docker (script officiel)
curl -fsSL https://get.docker.com | sh

# 2. Le code
git clone https://github.com/devtech5/Maria-suite.git maria-suite
cd maria-suite

# 3. La configuration
cp deploiement/env.production.exemple .env.production
nano .env.production        # DOMAINE, POSTGRES_PASSWORD, AUTH_SECRET au minimum

# 4. Démarrage
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Au démarrage, l'application applique elle-même les migrations et recopie le
catalogue des droits (`MIGRATIONS_AU_DEMARRAGE=1`). Un déploiement ne peut donc
plus tourner sur un schéma en retard.

Vérifier :

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app
curl https://app.exemple.ci/api/health
```

Puis créer MARIA GROUP SARL et son premier administrateur :

```bash
docker compose -f docker-compose.prod.yml exec -e MARIA_ADMIN_EMAIL=admin@exemple.ci app \n  node scripts/installer.cjs
```

Le mot de passe provisoire s'affiche **une fois** ; il se change à la première
connexion. Les autres comptes s'invitent ensuite depuis « Membres ».

## Avec Dokploy

C'est la voie recommandée. Dokploy apporte déjà son proxy
(Traefik) et le HTTPS : `docker-compose.prod.yml` n'y sert pas, son Caddy se
disputerait les ports 80 et 443 avec Traefik. On déploie l'application seule,
à côté d'une base gérée par Dokploy.

### Base

Dans le projet Dokploy, créer une base **PostgreSQL**, la démarrer, et copier
son **Internal Connection URL**. Laisser **External Port** vide : la base ne
se joint que par le réseau interne, comme dans la pile compose. Elle doit être
dans le **même projet** que l'application, sinon son nom d'hôte ne se résout
pas.

Un mot de passe contenant `@`, `:`, `/` ou `#` coupe l'URL : le choisir
alphanumérique, ou encoder ces caractères (`@` s'écrit `%40`).

### Application

| Onglet | Réglage |
|---|---|
| General | Dépôt GitHub, branche `main`, **Build Type : Dockerfile** |
| Environment | Les variables ci-dessous, dans **Environment Settings** |
| Advanced → Volumes | **Volume Mount** `maria-fichiers` sur `/donnees/fichiers` |
| Domains | Le domaine, **port 3000**, HTTPS Let's Encrypt |

**Dockerfile, pas Nixpacks.** Nixpacks devine la version de Node et a pris
Node 18 : pnpm 11 (`packageManager`) y plante dès l'installation, sur
`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`. Le Dockerfile fixe Node 22, construit
argon2 sur Debian, tourne sans privilège et prépare `/donnees/fichiers`.

**Volume Mount, pas Bind Mount.** Un dossier de l'hôte appartient à `root`, et
l'application tourne sous l'utilisateur `maria` : le dépôt d'une pièce
échouerait en « permission denied ». Un volume nommé reprend les droits que
l'image pose sur le dossier.

Variables minimales :

```
DATABASE_URL=<Internal Connection URL de la base>
AUTH_SECRET=<48 caractères aléatoires, 32 au moins>
MIGRATIONS_AU_DEMARRAGE=1
STOCKAGE_LOCAL=/donnees/fichiers
URL_PUBLIQUE=https://app.exemple.ci
DEFAULT_COUNTRY=CI
INSTANCE_DEMO=0
```

`DATABASE_URL_MIGRATION` est inutile : la connexion est directe, sans pooler.
Une variable présente mais vide qui attend une URL (`URL_PUBLIQUE=`) fait
échouer le démarrage : la remplir ou la retirer.

**Toute modification des variables exige un Redeploy.** Dokploy les injecte à
la création du conteneur ; les enregistrer ne suffit pas. Un conteneur qui
journalise « Configuration invalide … received undefined » en boucle les a
reçues vides, et Traefik répond alors « Bad Gateway » tant que la sonde de
santé échoue.

### Sauvegardes

Déclarer une destination S3 dans **Settings → S3 Destinations** (Backblaze B2,
Wasabi…), puis programmer :

- la base : onglet **Backups** de la base, par exemple `0 3 * * *`, 14 gardées ;
- les pièces jointes : onglet **Volume Backups** de l'application, volume
  `maria-fichiers`, `30 3 * * *`, 14 gardées.

Les deux vont ensemble : une pièce sans sa ligne en base, ou l'inverse, ne sert
à rien. La restauration se teste une fois, ailleurs, avant d'en avoir besoin.

### Installation de l'entreprise

L'image embarque le script de `pnpm installer`. Dans Dokploy, onglet
**Terminal** de l'application (shell `sh`) :

```bash
MARIA_ADMIN_EMAIL=admin@exemple.ci node scripts/installer.cjs
```

Il crée MARIA GROUP SARL, ses rôles préréglés et son premier administrateur.
Le mot de passe provisoire s'affiche **une fois** dans le terminal, et se
change à la première connexion. Relancer la commande ne duplique rien et ne
touche pas au mot de passe ; `--reinitialiser` en tire un nouveau. Le script
refuse une base qui porte déjà une autre entreprise.

### Mettre à jour

Pousser sur `main`, puis **Deploy** dans Dokploy — ou activer l'Auto Deploy.
Les migrations s'appliquent au démarrage du nouveau conteneur.

## Vidéosurveillance (module Sécurité)

Les images ne passent ni par l'application ni par la base. Trois pièces :

```
enregistreur du site ──RTSP──▶ relais du site (go2rtc)
                                   │ RTSPS, sortant : rien à ouvrir sur la box
                                   ▼
                     serveur vidéo (MediaMTX, sur le VPS) ──WebRTC──▶ navigateur
                                   │
                                   └── demande à Maria Suite : /api/video/autorisation
```

### Serveur vidéo, une fois

Dans le projet Dokploy, un service **Docker** `bluenviron/mediamtx` (version
fixée, pas `latest`), avec `deploiement/mediamtx.yml` monté sur
`/mediamtx.yml` et les certificats TLS du domaine monté sur `/certificats`.

| Réglage | Valeur |
|---|---|
| Domaine | `video.exemple.ci` → **port 8889** (WHEP, HTTPS par Traefik) |
| Ports publiés | **8322/tcp** (publication RTSPS des relais), **8189/udp et 8189/tcp** (média WebRTC) |
| Pare-feu du VPS | ouvrir 8322/tcp et 8189 (udp + tcp) |

Le RTSPS ne passe pas par Traefik : MediaMTX présente lui-même le certificat
de `video.exemple.ci` (Let's Encrypt, renouvelé par certbot sur l'hôte).

Côté application, deux variables puis **Redeploy** :

```
VIDEO_URL_PUBLIQUE=https://video.exemple.ci
VIDEO_PUBLICATION=video.exemple.ci:8322
```

### Relais, un par site

Un petit ordinateur toujours allumé sur le réseau de l'enregistreur (mini-PC,
Raspberry Pi 4, ou le PC de la caisse), avec [go2rtc](https://github.com/AlexxIT/go2rtc).

1. Dans Maria Suite : **Sécurité → Sites et caméras → le site**, déclarer les
   caméras (canal de l'enregistreur), puis **Émettre la clé du relais** —
   elle ne s'affiche qu'une fois — et **Télécharger la configuration**.
2. Sur le boîtier, définir trois variables d'environnement :
   `NVR_UTILISATEUR`, `NVR_MOT_DE_PASSE` (un compte de **lecture seule** créé
   sur l'enregistreur) et `RELAIS_CLE`.
3. Lancer go2rtc avec le fichier téléchargé, en service qui redémarre seul.

Le relais passe « En ligne » dans Maria Suite à sa première publication. Après
l'ajout ou le retrait d'une caméra, retélécharger la configuration et
relancer go2rtc.

**Débit.** Chaque caméra au mur publie son flux secondaire en continu (environ
512 kbit/s), plus le principal si la haute définition est cochée (environ
2 Mbit/s). L'écran du site affiche le total à tenir sur la liaison montante.

## Variables de `.env.production`

| Variable | Rôle |
|---|---|
| `DOMAINE` | Domaine servi en HTTPS |
| `POSTGRES_PASSWORD` | Mot de passe de la base (`openssl rand -base64 32 \| tr -d '/+='`) |
| `AUTH_SECRET` | Signature des sessions, 48 octets aléatoires au moins |
| `URL_PUBLIQUE` | `https://` + domaine, pour les liens envoyés par e-mail |
| `COURRIEL_FOURNISSEUR`, `COURRIEL_CLE`, `COURRIEL_EXPEDITEUR` | Envoi des e-mails : `brevo` ou `resend` |
| `INSTANCE_DEMO` / `MODULES_APERCU` | `0` et vide sur une vraie instance |

### E-mails

Sans fournisseur, le mot de passe oublié ne peut pas fonctionner : rien ne
part. Brevo (ex-Sendinblue) a une offre gratuite de 300 e-mails par jour ;
Resend, 3 000 par mois. Dans les deux cas, il faut **vérifier le domaine
d'envoi** (enregistrements SPF et DKIM fournis par le service), sinon les
messages partent en indésirables.

## Sauvegardes

Le service `sauvegarde` fait, toutes les 24 h, un `pg_dump` de la base et une
archive des pièces jointes dans `./sauvegardes` sur le VPS, et garde 14 jours.

**Une sauvegarde qui reste sur le VPS ne protège pas d'une panne du VPS.**
Copier le dossier ailleurs chaque nuit, par exemple avec rclone vers un
stockage objet (Backblaze B2, Wasabi, ou un autre serveur) :

```bash
# crontab -e
30 3 * * * rclone sync /root/maria-suite/sauvegardes distant:maria-sauvegardes
```

### Restaurer

```bash
# Base : remplace le contenu actuel par celui de la sauvegarde
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U maria -d maria --clean --if-exists --no-owner \
  < sauvegardes/base-AAAAMMJJ-HHMM.dump

# Pièces jointes
docker compose -f docker-compose.prod.yml run --rm -v "$PWD/sauvegardes:/s" app \
  sh -c "tar -xzf /s/fichiers-AAAAMMJJ-HHMM.tar.gz -C /donnees"
```

Tester une restauration une fois, sur une autre machine, avant d'en avoir
besoin.

## Mettre à jour

```bash
cd maria-suite
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build app
```

Les migrations s'appliquent au redémarrage. L'interruption dure le temps du
redémarrage du conteneur, quelques secondes.

## Base PostgreSQL externe

La pile embarque PostgreSQL. Pour une base managée ailleurs (n'importe quel
PostgreSQL 15+), retirer les services `postgres` et `sauvegarde` du fichier
compose, et renseigner `DATABASE_URL` dans `app`.

Derrière un pooler en mode transaction (PgBouncer), les requêtes préparées
sont désactivées d'elles-mêmes (`pgbouncer=true` dans l'URL), et les
migrations ont besoin d'une connexion directe dans `DATABASE_URL_MIGRATION`.

Les sauvegardes relèvent alors de l'hébergeur de la base ; celles des pièces
jointes restent à programmer sur le volume.
