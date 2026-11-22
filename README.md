# BLASTI — Backend Complet & Plateforme Louage Tunisienne

> **BLASTI** (بلاصتك، ورحلتك) modernise le système traditionnel tunisien des taxis collectifs interurbains (**Louage**). Cette documentation détaille l'architecture backend, la base de données PostgreSQL / Supabase, la sécurité transactionnelle, les politiques RLS, le temps réel et l'intégration frontend.

---

## Sommaire
1. [Architecture Générale](#1-architecture-générale)
2. [Modèle de Données & Schéma Relationnel](#2-modèle-de-données--schéma-relationnel)
3. [Réservation Atomique & Prévention du Surbooking](#3-réservation-atomique--prévention-du-surbooking)
4. [Gestion "Passager Descendu" & Cycle de Vie](#4-gestion-passager-descendu--cycle-de-vie)
5. [Billetterie & Embarquement par QR Code](#5-billetterie--embarquement-par-qr-code)
6. [Géolocalisation & Recherche Haversine](#6-géolocalisation--recherche-haversine)
7. [Sécurité & Politiques Row Level Security (RLS)](#7-sécurité--politiques-row-level-security-rls)
8. [Configuration Supabase & Variables d'Environnement](#8-configuration-supabase--variables-denvironnement)
9. [Migrations & Seed](#9-migrations--seed)
10. [Edge Functions](#10-edge-functions)
11. [Tests Automatisés](#11-tests-automatisés)
12. [Limites Actuelles & Améliorations Futures](#12-limites-actuelles--améliorations-futures)

---

## 1. Architecture Générale

```
┌─────────────────────────────────────────────────────────────┐
│                 Client Mobile BLASTI                        │
│          (React 19 + TypeScript + Vite + Tailwind v4)       │
└──────────────┬──────────────────────────────┬───────────────┘
               │ HTTPS (REST / RPC)           │ WSS (WebSockets)
               ▼                              ▼
┌──────────────────────────────┐  ┌───────────────────────────┐
│     Supabase PostgREST &     │  │     Supabase Realtime     │
│       Edge Functions         │  │   (Trajets, Sièges, GPS)  │
└──────────────┬───────────────┘  └───────────┬───────────────┘
               │                              │
               ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  PostgreSQL 15+ (ACID)                      │
│   - Row Level Security (RLS) sur toutes les tables          │
│   - Fonctions transactionnelles (Verrous FOR UPDATE)        │
│   - Triggers automatiques (auth.users -> profiles, cleanup) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Supabase Storage                       │
│   - avatars (public)                                        │
│   - vehicles (public)                                       │
│   - driver_documents (privé - URLs signées de courte durée) │
└─────────────────────────────────────────────────────────────┘
```

- **Frontend sécurisé** : Ne contient aucune clé administrative (`service_role`). Uniquement la clé anonyme `anon` soumise au filtrage strict RLS.
- **Transactions ACID** : Aucune décrémentation de place ou modification de statut de paiement/embarquement n'est effectuée côté client. Tout calcul de prix et allocation de sièges s'opère via des fonctions stockées PostgreSQL.
- **Mode Démo intégré** : L'application fonctionne sans configuration initiale grâce à un moteur réactif in-memory reproduisant fidèlement les contraintes transactionnelles.

---

## 2. Modèle de Données & Schéma Relationnel

Les migrations SQL versionnées sont situées dans `supabase/migrations/` :

| Table | Rôle | Contraintes Clés |
| :--- | :--- | :--- |
| `profiles` | Utilisateurs (passagers, louagistes, admins) | Liée à `auth.users(id)`, validation regex téléphone tunisien `+216[0-9]{8}` |
| `driver_profiles` | Profils louagistes professionnels | Statuts: `pending`, `verified`, `suspended`, `rejected`. `license_number` unique |
| `vehicles` | Louages enregistrés | Plaque tunisienne unique (ex: `178 TUN 4521`), capacité de 4 à 12 places |
| `stations` | Gares de Louage tunisiennes | Coordonnées GPS, statuts actifs (Sousse, Monastir, M'saken, Tunis...) |
| `journeys` | Trajets planifiés ou en route | `departure <> destination`, statuts: `draft`, `published`, `boarding`, `in_progress`, `completed`, `cancelled` |
| `journey_locations` | Historique GPS du louage | Coordonnées, vitesse, cap. Limitation de fréquence & rétention 7 jours |
| `reservations` | Réservations passager | Référence `BL-YYMM-XXX`, empreinte SHA-256 du QR token, calcul prix serveur |
| `reservation_seats` | Suivi individuel des 8 places | Contrainte `UNIQUE(journey_id, seat_number)`. Statuts: `available`, `reserved`, `occupied`, `blocked` |
| `notifications` | Alertes passagers & conducteurs | JSONB data, statut lu/non-lu, Realtime |
| `ratings` | Avis et étoiles (1 à 5) | `UNIQUE(reservation_id, author_id)`. Seul un passager ayant embarqué peut noter |
| `saved_destinations`| Favoris des usagers | Lié à `stations`, label personnalisé |
| `waiting_list` | File d'attente sur trajet complet | Notification automatique dès qu'une place se libère |

---

## 3. Réservation Atomique & Prévention du Surbooking

La fonction PostgreSQL `create_reservation_atomic` garantit l'intégrité absolue face aux accès concurrents :

1. **Verrouillage de ligne (`FOR UPDATE`)** sur le trajet dans `journeys`.
2. Vérification que le statut est `published` ou `boarding` et que l'heure de départ n'est pas expirée.
3. Vérification stricte que `available_seats >= p_seat_count`.
4. Sélection et verrouillage des sièges physiques dans `reservation_seats`.
5. Calcul du montant total côté serveur : `total_price = journey.price_per_seat * p_seat_count`.
6. Génération d'une référence lisible unique (format : `BL-2408-73A`).
7. Génération d'un token aléatoire non prédictible et stockage exclusif de son empreinte SHA-256 :
   ```sql
   v_qr_hash := encode(digest(v_raw_qr_token, 'sha256'), 'hex');
   ```
8. Décrémentation atomique de `available_seats`.
9. Envoi d'une notification temps réel au conducteur et au passager.
10. **Retour unique du token QR brut au passager** à la création du ticket.

---

## 4. Gestion "Passager Descendu" & Cycle de Vie

### A. Libération d'un siège en cours de trajet (`release_journey_seat`)
Fonctionnalité clé du louagiste tunisien lorsqu'un passager descend avant le terminus :
- Appel : `release_journey_seat(p_journey_id, p_seat_number)`.
- Contrôle de sécurité : Seul le conducteur vérifié propriétaire du trajet actif peut l'exécuter.
- Siège verrouillé et basculé de `occupied` à `available`.
- Incrémentation atomique des places libres du trajet (`available_seats = available_seats + 1`).
- Notification immédiate envoyée à la première personne éligible sur la liste d'attente (`waiting_list`).

### B. Cycle de vie d'un trajet
- `publish_journey` : Réservé aux conducteurs avec statut `verified`. Initialise automatiquement les 8 sièges.
- `start_journey_boarding` : Ouvre les montées à bord à la station.
- `start_journey_in_progress` : Enclenche le suivi GPS direct.
- `complete_journey` : Arrivée à destination, clôture les réservations `boarded -> completed`, calcule les gains du conducteur côté serveur.

---

## 5. Billetterie & Embarquement par QR Code

1. **Génération du ticket** : Le passager dispose d'un QR code encodant son token sécurisé. Aucune donnée personnelle sensible (téléphone, nom complet) n'est injectée dans le QR code.
2. **Scan conducteur** : Via Edge Function `verify-boarding` ou RPC `scan_boarding_qr` :
   - Hachage SHA-256 du token reçu.
   - Contrôle d'unicité : Si déjà `boarded`, renvoie immédiatement `ALREADY_USED`.
   - Contrôle d'annulation : Si `cancelled`, renvoie `CANCELLED`.
   - Contrôle du trajet : Rejette le ticket s'il appartient à un autre trajet.
   - Validation : Transition immédiate de la réservation à `boarded` et des sièges à `occupied`.

---

## 6. Géolocalisation & Recherche Haversine

### A. Recherche des Louages proches (`search_nearby_louages`)
Calcule la distance géodésique en kilomètres entre la position du passager et les stations de départ des louages en partance :
```sql
distance_km = 6371.0 * acos(
    cos(radians(p_lat)) * cos(radians(s.latitude)) *
    cos(radians(s.longitude) - radians(p_lng)) +
    sin(radians(p_lat)) * sin(radians(s.latitude))
);
```

### B. Envoi de position GPS (`update_driver_location`)
- Le conducteur émet sa position uniquement s'il est en ligne ou sur un trajet actif.
- **Protection anti-spam / Throttling** : Limitation à 1 enregistrement toutes les 3 à 4 secondes.
- **Rétention** : Fonction planifiée `cleanup_old_journey_locations` qui archive/purge l'historique de plus de 7 jours.
- **Expiration** : Côté client, une position sans actualisation depuis plus de 5 minutes est marquée comme indisponible.

---

## 7. Sécurité & Politiques Row Level Security (RLS)

RLS est activé sur **100% des tables exposées**.

| Rôle | Permissions Clés |
| :--- | :--- |
| **Passager** | - Lecture/écriture de son propre profil.<br>- Recherche des trajets publiés.<br>- Réservation uniquement via RPC transactionnelle sécurisée.<br>- Lecture de ses réservations et notifications.<br>- Annulation autorisée uniquement pour ses réservations non consommées. |
| **Conducteur** | - Gestion de ses propres véhicules.<br>- Publication réservée au statut `verified`.<br>- Gestion exclusive de ses propres trajets.<br>- Scan et embarquement des passagers de son trajet.<br>- Libération des sièges de son trajet. |
| **Admin** | - Validation/suspension des profils conducteurs.<br>- Gestion des stations et audit des litiges. |

---

## 8. Configuration Supabase & Variables d'Environnement

Créez un fichier `.env.local` à la racine :

```env
# URL de votre projet Supabase
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co

# Clé anonyme publique (Anon Key)
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Activer le mode démo/mock si aucune instance n'est connectée
VITE_ENABLE_DEMO_MODE=false
```

---

## 9. Migrations & Seed

### A. Exécution avec Supabase CLI
```bash
# Lancement de Supabase en local (Docker requis)
supabase start

# Application des migrations SQL
supabase db reset

# Application du seed de test
supabase db seed
```

### B. Exécution manuelle dans Supabase Studio
Si vous utilisez le dashboard Supabase Cloud, exécutez les fichiers dans le **SQL Editor** dans l'ordre chronologique :
1. `supabase/migrations/20261122000001_initial_schema.sql`
2. `supabase/migrations/20261122000002_rls_policies.sql`
3. `supabase/migrations/20261122000003_transactional_functions.sql`
4. `supabase/migrations/20261122000004_storage_buckets.sql`
5. `supabase/seed.sql`

---

## 10. Edge Functions

La fonction `verify-boarding` permet de valider un ticket via une requête HTTP sécurisée :

```bash
# Déploiement de l'Edge Function sur Supabase
supabase functions deploy verify-boarding
```

Exemple d'appel :
```bash
curl -X POST https://<votre-projet>.functions.supabase.co/verify-boarding \
  -H "Authorization: Bearer <token_conducteur>" \
  -H "Content-Type: application/json" \
  -d '{
    "journey_id": "77777777-7777-7777-7777-777777777701",
    "qr_token": "BLASTI-DEMO-TOKEN-YASMINE-73A"
  }'
```

---

## 11. Tests Automatisés

Le projet inclut une suite de tests unitaires et d'intégration validant les scénarios critiques :

```bash
# Exécution des tests avec Vitest
npm test
```

### Scénarios testés :
- Validation stricte du numéro tunisien (`+216XXXXXXXX`).
- Calcul du prix total garanti côté serveur.
- Blocage absolu du surbooking lors de réservations concurrentes sur la dernière place.
- Libération automatique des sièges lors d'une annulation.
- Fonction "Passager descendu" libérant le siège en temps réel.
- Scan QR : validation du statut `boarded` et interdiction de réutilisation d'un ticket déjà scanné.

---

## 12. Limites Actuelles & Améliorations Futures

### Limites actuelles :
- **Passerelle de paiement en ligne** : Les tarifs actuels sont réglés en espèces à l'embarquement (pratique usuelle du Louage en Tunisie). Une intégration GPG ou Konnect pourra être ajoutée.
- **SMS Gateway** : En production réelle, connecter l'authentification téléphone de Supabase à un fournisseur SMS tunisien (ex: Ooredoo, Orange, Telecom ou Twilio).

### Améliorations futures :
- **Intégration PostGIS** : Indexation spatiale R-Tree (`ST_DWithin`, `ST_Distance`) pour des requêtes géographiques à très grande échelle.
- **Calcul d'itinéraire routier** : Estimation précise du temps de trajet en tenant compte du trafic entre Sousse, Tunis et Monastir.
- **Notifications Web Push** : Alertes passager quand le véhicule arrive à 500m de sa station de prise en charge.
