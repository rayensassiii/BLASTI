# 🚐 BLASTI — Smart Louage Platform

> **BLASTI (بلاصتك، ورحلتك)** — Une plateforme intelligente qui modernise le transport collectif tunisien (Louage).

Notre objectif : simplifier la recherche de trajets, la réservation des places et le suivi des louages en temps réel.

🔗 **Repository:** [GitHub – BLASTI](https://github.com/rayensassiii/BLASTI)

---

# ⚡ JURY QUICK NAVIGATION

**Use these shortcuts during the presentation to find technical answers quickly.**

| Si le jury demande... | Aller directement à... |
|---|---|
| Comment fonctionne toute l'application ? | [🏗️ Architecture](#1-architecture-générale) |
| Comment sont stockées les données ? | [🗄️ Database](#2-modèle-de-données--schéma-relationnel) |
| Comment fonctionne une réservation ? | [🎫 Booking System](#3-réservation-atomique--prévention-du-surbooking) |
| Que se passe-t-il lorsqu'un passager descend ? | [🔄 Seat Release](#4-gestion-passager-descendu--cycle-de-vie) |
| Comment fonctionne le QR Code ? | [📱 QR Ticket](#5-billetterie--embarquement-par-qr-code) |
| Comment localisez-vous les louages ? | [📍 GPS & Geolocation](#6-géolocalisation--recherche-haversine) |
| Comment protégez-vous les données ? | [🔐 Security](#7-sécurité--politiques-row-level-security-rls) |
| Comment le frontend communique avec le backend ? | [⚙️ Supabase Configuration](#8-configuration-supabase--variables-denvironnement) |
| Comment avez-vous créé la base de données ? | [🛠️ SQL Migrations](#9-migrations--seed) |
| Où se trouve la logique backend ? | [☁️ Edge Functions](#10-edge-functions) |
| Comment avez-vous testé l'application ? | [🧪 Automated Tests](#11-tests-automatisés) |
| Quelles sont les limites du projet ? | [🚀 Future Improvements](#12-limites-actuelles--améliorations-futures) |

---

# 🧭 CODE NAVIGATION

| Partie | Dossier / Fichier |
|---|---|
| Frontend (React + TypeScript) | [src/](src/) |
| Interface publique et ressources | [public/](public/) |
| Backend & database (Supabase) | [supabase/](supabase/) |
| SQL migrations | [supabase/migrations/](supabase/migrations/) |
| Edge Functions | [supabase/functions/](supabase/functions/) |
| Automated tests | [tests/](tests/) |
| Dependencies & scripts | [package.json](package.json) |
| Application entry point | [index.html](index.html) |

---

# 💻 TECHNOLOGY STACK

| Technology | Purpose |
|---|---|
| React 19 | User interface |
| TypeScript | Application logic and type safety |
| Vite | Development server and build tool |
| Tailwind CSS 4 | Responsive styling |
| Leaflet | Interactive maps |
| Supabase | Backend platform |
| PostgreSQL | Relational database |
| Supabase Auth | User authentication |
| Supabase Realtime | Live updates |
| Edge Functions | Server-side operations |
| Vitest | Automated testing |

---

# 🏗️ APPLICATION ARCHITECTURE

```text
             USER
               |
               v
     REACT + TYPESCRIPT
          FRONTEND
               |
        Supabase Client
               |
       +-------+-------+
       |               |
       v               v
   REST / RPC       REALTIME
       |               |
       +-------+-------+
               |
               v
          SUPABASE
               |
       +-------+-------+
       |               |
       v               v
   PostgreSQL       Storage
   Database         Files
       |
       v
  SQL Functions
  & Edge Functions
```

---

# ⭐ MAIN FEATURES

- User registration and authentication.
- Passenger, driver and administrator roles.
- Search for available louages and journeys.
- Interactive maps and GPS tracking.
- Online seat reservation.
- QR Code ticket generation and validation.
- Real-time seat availability.
- Release of seats when passengers get off before the final destination.
- Waiting list and notifications.
- Driver and vehicle management.

---

# 📚 DETAILED TECHNICAL DOCUMENTATION

Continue below for the complete technical explanations, SQL logic, security policies, implementation details and testing scenarios.

1. [Architecture](#1-architecture-générale)
2. [Database Schema](#2-modèle-de-données--schéma-relationnel)
3. [Reservation & Overbooking Prevention](#3-réservation-atomique--prévention-du-surbooking)
4. [Passenger Exit & Seat Release](#4-gestion-passager-descendu--cycle-de-vie)
5. [QR Code Ticketing](#5-billetterie--embarquement-par-qr-code)
6. [GPS & Geolocation](#6-géolocalisation--recherche-haversine)
7. [Security & RLS](#7-sécurité--politiques-row-level-security-rls)
8. [Supabase Configuration](#8-configuration-supabase--variables-denvironnement)
9. [Database Migrations](#9-migrations--seed)
10. [Edge Functions](#10-edge-functions)
11. [Automated Tests](#11-tests-automatisés)
12. [Future Improvements](#12-limites-actuelles--améliorations-futures)

---

**Built with ❤️ in Tunisia 🇹🇳**
