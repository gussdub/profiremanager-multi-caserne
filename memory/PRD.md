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

### 29 Janvier 2026 - Session 2 - Corrections et Refactorisation
**Statut**: ✅ Terminé

**Travail effectué**:
1. **Bug accès module Interventions** - Corrigé
   - Les employés ne voient plus le menu "Interventions" sauf s'ils sont dans la liste des "Personnes ressources"
   - Modification de `frontend/src/components/Sidebar.jsx` pour charger et vérifier `interventionSettings.personnes_ressources`

2. **Logo dans les e-mails** - Corrigé
   - Logo maintenant hébergé sur CDN public (catbox.moe)
   - Taille ajustée à 250px avec espacement réduit
   - Modification de `backend/routes/auth.py`

3. **Refactorisation backend - Module Utils** - Terminé
   - Extraction des routes utilitaires vers `routes/utils.py`
   - Routes extraites: `repair-demo-passwords`, `fix-all-passwords`, `fix-admin-password`, `cleanup-duplicates`, `init-demo-data`, `init-demo-data-realiste`
   - `server.py` réduit de 6632 → 5909 lignes (-723 lignes, -11%)

**Fichiers modifiés/créés**:
- `frontend/src/components/Sidebar.jsx` (vérification personnes ressources)
- `backend/routes/auth.py` (logo email)
- `backend/routes/utils.py` (nouveau - routes utilitaires)
- `backend/server.py` (allégé)

### 29 Janvier 2026 - Session 1 - Refactorisation Module Rapports
**Statut**: ✅ Terminé et validé

**Travail effectué**:
- Extraction du module Rapports de `server.py` vers `routes/rapports.py`
- Réduction de `server.py` de 9346 → 7122 lignes (-24%)
- Correction des APIs pour correspondre au format attendu par le frontend

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
1. Finaliser transmission DSI réelle (actuellement MOCK)
2. Module de gestion des jours fériés
3. Module de facturation pour l'entraide

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
