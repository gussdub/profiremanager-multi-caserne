# ProFireManager - Document de Référence Produit

## Description
Application de gestion des interventions et de la paie des pompiers. Solution multi-tenant complète pour les services d'incendie.

## Architecture
- **Frontend**: React 18 + TailwindCSS + Shadcn/UI
- **Backend**: FastAPI + Python 3.11
- **Base de données**: MongoDB Atlas
- **Intégrations**: SFTP, Stripe, Firebase FCM, Resend

## Modules Principaux
1. Planning & Attribution automatique des gardes
2. Gestion du personnel
3. Disponibilités & Indisponibilités
4. Rapports & Exports (PDF/Excel)
5. Équipements & EPI
6. Formations & Compétences
7. Remplacements
8. Facturation & Paie

---

## Historique des Modifications

### 29 Janvier 2026 - Refactorisation Module Rapports
**Statut**: ✅ Terminé et validé

**Travail effectué**:
- Extraction du module Rapports de `server.py` vers `routes/rapports.py`
- Réduction de `server.py` de 9346 → 7122 lignes (-24%)
- Correction des APIs pour correspondre au format attendu par le frontend:
  - `/rapports/dashboard-interne`: Ajout des champs `cout_salarial_mois`, `heures_travaillees_mois`, `pompiers_disponibles`, `total_pompiers`, `periode`
  - `/rapports/rapport-immobilisations`: Restructuration avec `statistiques`, `vehicules`, `equipements`
- Mise à jour des modèles Pydantic pour compatibilité

**Fichiers modifiés**:
- `backend/routes/rapports.py` (enrichi)
- `backend/server.py` (allégé de ~2200 lignes)

---

## Tâches Complétées (Sessions Précédentes)
- ✅ Réécriture complète de l'attribution automatique des gardes (5 niveaux de priorité)
- ✅ Gestion des compétences et officiers dans l'attribution
- ✅ Module d'audit pour l'attribution automatique
- ✅ Correction bugs module Disponibilités
- ✅ Amélioration UI modules Remplacements et EPI
- ✅ Service d'intégration SFTP
- ✅ Configuration par Tenant

---

## Backlog

### P2 - Priorité Moyenne
1. Extraire modules restants de `server.py`:
   - Routes Admin/Super-Admin (~500 lignes)
   - Routes utilitaires/demo (~600 lignes)
2. Finaliser transmission DSI réelle (actuellement MOCK)
3. Module de gestion des jours fériés
4. Module de facturation pour l'entraide

### P3 - Priorité Basse
1. Améliorer messages d'import CSV
2. Optimisations diverses UI

---

## APIs MOCK
- **Transmission DSI**: L'API de transmission vers les systèmes externes est simulée

## Intégrations Tierces
- SFTP (paramiko)
- Stripe (paiements)
- Firebase Cloud Messaging (notifications push)
- Resend (emails)
- Web Speech API, Open-Meteo, OpenStreetMap
