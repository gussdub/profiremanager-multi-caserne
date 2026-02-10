# ProFireManager - Product Requirements Document

## Application Overview
ProFireManager est une application de gestion complète pour les services d'incendie, comprenant la gestion du personnel, des interventions, des EPI, de la prévention, et de la paie.

## Architecture
- **Frontend**: React avec Shadcn/UI (Radix UI), déployé sur Vercel
- **Backend**: FastAPI avec MongoDB, déployé sur Render
- **Base de données**: MongoDB Atlas

## Modules Principaux
1. **Planning** - Gestion des gardes et assignations
2. **Interventions** - Rapports DSI complets
3. **EPI** - Gestion des équipements de protection
4. **Prévention** - Inspections et non-conformités
5. **Paie** - Gestion des jours fériés et majorations
6. **Remplacements** - Système automatisé de demandes

---

## Changelog - Session 2026-02-10

### Corrections de bugs

1. **Bug dropdowns DSI** (P0) ✅
   - Problème: Listes déroulantes ne s'ouvraient plus dans le modal DSI
   - Solution: z-index augmenté à 100001, valeurs vides changées de `''` à `undefined`
   - Fichiers: `SectionDSI.jsx`, `select.jsx`

2. **Bug saisie majorations jours fériés** ✅
   - Problème: Impossible de saisir point ou virgule
   - Solution: `type="text"` avec `inputMode="decimal"`, conversion automatique virgule→point
   - Fichier: `TabJoursFeries.jsx`

3. **Affichage remplacement dans Planning** ✅
   - Badge "🔄 Remplacement" au lieu de "👤 Manuel"
   - Fichier: `Planning.jsx`

4. **Création manuelle NC (Prévention)** ✅
   - `inspection_id` rendu optionnel pour créations manuelles
   - Fichier: `prevention.py`

5. **Bug route /prevention/inspections-visuelles/a-valider** ✅
   - Route déplacée avant la route avec paramètre `{inspection_id}`
   - Fichier: `prevention.py`

6. **Import SecteurForm manquant** ✅
   - Import ajouté dans `GestionPreventionnistes.jsx`

7. **Liste préventionnistes incorrecte dans secteurs** ✅
   - Utilise maintenant la liste `preventionnistes` au lieu de `users` filtrés
   - Fichier: `GestionPreventionnistes.jsx`

8. **Demande remplacement EPI - message d'erreur** ✅
   - Gestion d'erreur robuste ajoutée autour des notifications
   - Fichier: `epi.py`

9. **Secteurs géographiques - format geometry** ✅
   - Ajout support format GeoJSON en plus de `coordonnees`
   - Fichier: `prevention.py`

10. **Changement mot de passe profil** ✅
    - Import `verify_password` manquant ajouté
    - Utilisation de `apiPut` au lieu de `axios.put`
    - Fichiers: `users.py`, `MonProfil.jsx`

### Améliorations Non-Conformités

1. **Dates UTC corrigées** ✅
   - Dates affichées en fuseau local, pas UTC
   - `date_identification` utilisé au lieu de `created_at`

2. **Modal détails NC** ✅
   - Clic sur NC affiche les détails complets au lieu du bâtiment

3. **Historique NC dans bâtiment** ✅
   - Section NC ajoutée dans le modal bâtiment

4. **Sélection article de violation** ✅
   - Formulaire création NC permet de sélectionner un article du référentiel
   - Calcul automatique du délai de correction

5. **Système de relance NC** ✅
   - Endpoint `/prevention/non-conformites-en-retard`
   - Endpoint `/prevention/relancer-non-conformites`
   - Notifications aux créateurs, préventionnistes et responsables

### Nettoyage Architecture

1. **Connexion DB centralisée** ✅
   - `DB_NAME` obligatoire (pas de défaut)
   - `dsi.py` et `dsi_transmissions.py` utilisent `dependencies.py`

2. **Fonctions hash centralisées** ✅
   - `verify_password` et `get_password_hash` uniquement dans `dependencies.py`
   - Suppression des duplications dans `personnel.py` et `auth.py`

3. **Logs de debug supprimés** ✅
   - Code de production nettoyé

---

## État Actuel

### Fonctionnel ✅
- Tous les modules principaux
- Authentification unifiée avec bcrypt
- Système de remplacements automatisé
- Module prévention complet avec NC manuelles et relances
- Changement de mot de passe via profil
- **Signature numérique dessinée** - Upload fonctionnel (corrigé 2026-02-10)
- **Page Mon Profil** - Design uniformisé avec cartes à en-tête rouge

### Corrections Session 2026-02-10 (Suite)
11. **Sauvegarde signature dessinée** ✅
    - Problème: Variable `API` non définie, axios ne gérait pas correctement FormData
    - Solution: Utilisation de `fetch` natif + `process.env.REACT_APP_BACKEND_URL` + préfixe `/api/`
    - Fichier: `MonProfil.jsx`

12. **Balise JSX manquante** ✅
    - Problème: `</Card>` manquant après section "Préférences de notification"
    - Fichier: `MonProfil.jsx`

13. **Design section Sécurité** ✅
    - Uniformisé avec le style Card + en-tête rouge dégradé
    - Fichier: `MonProfil.jsx`

### Problèmes Connus
- Erreur "Save to GitHub" (problème de plateforme Emergent)

---

## Prochaines Étapes Potentielles
- Intégration email pour relances NC automatiques
- Dashboard récapitulatif NC en retard
- Améliorations UX selon retours utilisateur
