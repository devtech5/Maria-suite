# Feuille de route — nouveaux modules

Décisions de la direction de MARIA GROUP SARL (questionnaire du 10 novembre
2026). Elles cadrent le développement ; une décision qui change se corrige
ici avant de toucher le code.

## Ordre de développement

1. **Règlement intérieur** et **Guide d'utilisation** — rapides, utiles à tous.
2. **Visiteurs**
3. **Courrier et colis**
4. **Immobilier et lotissement**
5. **BTP et suivi-contrôle** — le plus gros.

## Règlement intérieur

**Livré** (`src/modules/reglement/`).

- Publié par les RH, versionné (date d'effet, articles en sommaire).
- **Lecture bloquante** : « J'ai lu et j'accepte » à la première connexion et à
  chaque nouvelle version, avant d'accéder au logiciel. Horodaté par version.
- Les RH voient qui a lu, et relancent.
- Lisible à tout moment dans l'application.

## Guide d'utilisation

**Livré** (`src/modules/guide/`). Captures annotées pour les écrans
principaux ; les autres chapitres en recevront à mesure que la base de
démonstration se remplit (`pnpm guide:captures`).

- Guide **de l'application** uniquement : un chapitre par module, avec captures
  annotées. Pas de pages libres rédigées par l'entreprise.
- Ne montre que les modules ouverts à la personne (même filtre que le menu).
- Parcours du nouveau venu avec progression, **et un quiz** de validation ;
  les RH voient qui a terminé.
- Aide contextuelle : un « ? » sur chaque écran ouvre la section du guide.

## Visiteurs

**Livré** (`src/modules/visiteurs/`). Le QR envoyé par WhatsApp est un lien
vers une page qui l'affiche : l'API WhatsApp n'envoie une image qu'avec un
modèle approuvé par Meta.

- **Plusieurs points d'accueil** : siège, chantiers, sites miniers ; chaque
  accueil a son registre, la direction voit tout.
- Photo de la pièce d'identité (recto/verso) prise par la caméra de l'appareil ;
  photo du visiteur facultative.
- Photos des pièces **effacées automatiquement après 3 mois** (données
  personnelles, loi 2013-450, ARTCI). Le registre (nom, heure, motif) reste.
- Badge : pas de préférence exprimée — par défaut, badge imprimé avec QR à
  l'accueil, et QR envoyé par WhatsApp pour un rendez-vous enregistré à l'avance.
- La personne visitée est prévenue dans la cloche ; liste des présents à
  l'instant (évacuation).

## Courrier et colis

**Livré** (`src/modules/courrier/`).

- **Registre unique** pour l'entreprise : arrivée `CA-AAAA-NNNNN`, départ
  `CD-AAAA-NNNNN` (`document_sequences`).
- **Imputation par la direction** : le secrétariat enregistre, la DG attribue à
  un service ou une personne, avec instructions et délai de réponse.
- Pièce scannée jointe, accusé de réception du destinataire, transporteur et
  numéro de suivi au départ, décharge, relance des courriers sans réponse.
- Étiquette colis avec QR (`entity_codes`).

## Immobilier et lotissement

- Biens **propres et confiés par des tiers** (mandat de gestion) : honoraires,
  reversement au propriétaire, relevé de gérance.
- Location : baux, quittances numérotées, caution, relances, état des lieux
  avec photos.
- Lotissement : **plan cliquable** (image du plan, chaque lot coloré selon son
  statut libre / réservé / vendu) **et liste** ; souscripteurs, échéancier,
  lettre d'attribution, pièces foncières.

## BTP et suivi-contrôle

- Contrôle **interne et externe** : missions de contrôle facturées à des maîtres
  d'ouvrage tiers, en plus de nos propres chantiers.
- Situations de travaux : **retenue de garantie de 5 %** par défaut, modifiable
  par marché ; avance de démarrage, TVA 18 %.
- Bureau d'études (DQE, BPU, métrés), journal de chantier, PV, non-conformités,
  essais, réceptions avec réserves, cautions bancaires.

### Preuves de livraison et de paiement (proposition, à confirmer)

Chaque franc et chaque sac de ciment se rattachent à un chantier, avec sa
preuve, sur le modèle des projets (dépense + pièce) et des achats (commande,
réception) déjà en place :

- **Livraison sur chantier** : bon de commande (Achats) rattaché au chantier ;
  à l'arrivée, le chef de chantier saisit la réception depuis son téléphone —
  quantités reçues, écart avec la commande, **photo du bon de livraison signé
  et du matériel déchargé**, position GPS et heure prises par l'appareil,
  nom du livreur. Le stock du chantier (dépôt) monte, le reste à livrer se lit.
- **Consommation** : sortie du dépôt chantier vers un lot de travaux, pour
  comparer le consommé au métré du DQE.
- **Paiement fournisseur** : rapproché de la commande et de la réception —
  jamais payé plus que reçu sans dérogation ; preuve jointe (reçu, capture
  mobile money, avis de virement), passage en trésorerie et en comptabilité.
- **Main-d'œuvre** : pointage des intervenants sur le chantier, bon de
  paiement signé ou payé par mobile money avec sa référence.
- **Côté client** : situation de travaux validée (avancement, retenue 5 %,
  avance), facture, encaissement avec sa preuve.
- **Tableau du chantier** : budget, engagé, livré, payé, encaissé ; alertes
  sur une livraison sans preuve ou un paiement sans réception.

## Nettoyage de la plateforme

- **Supprimés définitivement** : Commerce, Restaurant, Maquis, Hôtel,
  Réservations, Billetterie, Point de vente mobile money, écran Caisse. Leurs
  tables sont supprimées **seulement si elles sont vides** ; une table qui
  contient des données est gardée et signalée.
- **Gardés** : Stock, catalogue d'articles et tables de ventes — Achats et
  Devis/factures en dépendent.
- **Enquêtes reste actif.**
