# 🐛 Rapport de Bugs - ProFireManager

**Dernière mise à jour:** 25 janvier 2025

---

## 📝 Template pour Ajouter un Bug

```markdown
### #XXX - [Titre Court du Bug]

**Module:** [Planning / Mes Disponibilités / Personnel / Paramètres / Authentification / Dashboard]
**Priorité:** 🔴 Critique / 🟠 Haute / 🟡 Moyenne / 🟢 Basse
**Statut:** 🆕 Ouvert / 🔄 En cours / ✅ Résolu / ⛔ Won't Fix
**Date:** AAAA-MM-JJ
**Assigné à:** [Nom]

**Description:**
[Description détaillée du problème]

**Étapes de reproduction:**
1. [Étape 1]
2. [Étape 2]
3. [Étape 3]

**Résultat attendu:**
[Ce qui devrait se passer]

**Résultat observé:**
[Ce qui se passe réellement]

**Environnement:**
- Navigateur: [Chrome/Firefox/Safari] version X
- OS: [Windows/Mac/Linux]
- Rôle utilisateur: [Admin/Superviseur/Employé]

**Captures d'écran / Logs:**
[Liens ou descriptions]

**Notes supplémentaires:**
[Informations additionnelles]
```

---

## 🆕 BUGS OUVERTS

### #001 - Page d'accueil ne fonctionne pas (intermittent)

**Module:** Authentification / Dashboard
**Priorité:** 🔴 Critique
**Statut:** 🆕 Ouvert
**Date:** 2025-01-25
**Assigné à:** À assigner

**Description:**
La page d'accueil ne fonctionne pas de manière intermittente. Le comportement est aléatoire et n'est pas systématiquement reproductible.

**Étapes de reproduction:**
1. Se connecter avec un compte utilisateur valide
2. Accéder à la page d'accueil/dashboard
3. Observer le comportement

**Résultat attendu:**
La page d'accueil devrait toujours s'afficher correctement avec les informations du dashboard.

**Résultat observé:**
De manière intermittente, la page d'accueil ne s'affiche pas correctement ou ne charge pas.

**Environnement:**
- Navigateur: À préciser
- OS: À préciser
- Rôle utilisateur: Tous les rôles concernés

**Investigations nécessaires:**
- [ ] Vérifier les logs backend au moment de l'erreur
- [ ] Vérifier les erreurs console frontend (F12)
- [ ] Identifier les conditions qui déclenchent le bug
- [ ] Vérifier les appels API (onglet Network)
- [ ] Tester avec différents navigateurs
- [ ] Vérifier si lié à la charge ou au cache

**Notes supplémentaires:**
Bug intermittent - nécessite logs et captures d'écran pour diagnostic précis.

---

### #002 - Traduction incorrecte dans Paramètres > Onglet Grade

**Module:** Paramètres
**Priorité:** 🟡 Moyenne
**Statut:** 🆕 Ouvert
**Date:** 2025-01-25
**Assigné à:** À assigner

**Description:**
Dans le module Paramètres, l'onglet "Grade" contient des éléments mal traduits (probablement encore en anglais ou traduction incorrecte).

**Étapes de reproduction:**
1. Se connecter en tant qu'admin
2. Aller dans le module "Paramètres"
3. Cliquer sur l'onglet "Grade"
4. Observer les textes/labels affichés

**Résultat attendu:**
Tous les textes de l'interface devraient être en français correct et cohérent.

**Résultat observé:**
Certains textes sont en anglais ou mal traduits.

**Fichiers concernés:**
- `/app/frontend/src/components/Parametres.js` (lignes à identifier)

**Actions requises:**
- [ ] Identifier tous les textes en anglais ou mal traduits
- [ ] Corriger les traductions dans le code
- [ ] Vérifier la cohérence avec les autres modules
- [ ] Tester l'affichage après correction

**Environnement:**
- Navigateur: Tous
- OS: Tous
- Rôle utilisateur: Admin/Superviseur

**Notes supplémentaires:**
Bug cosmétique mais impacte l'expérience utilisateur. Facile à corriger.

---

### #003 - Bouton "Audit" ne fonctionne pas (assignations anciennes)

**Module:** Planning
**Priorité:** 🟠 Haute
**Statut:** 🔄 En cours
**Date:** 2025-01-25
**Assigné à:** En investigation

**Description:**
Le bouton "🔍 Audit" dans le modal de détails de garde est présent mais ne fait rien au clic. Le problème concerne les assignations créées AVANT l'ajout de la fonctionnalité d'audit (pas de champ `justification` dans la base de données).

**Étapes de reproduction:**
1. Se connecter en tant qu'admin
2. Aller dans le module Planning
3. Cliquer sur une garde avec assignation automatique (🤖 Auto)
4. Cliquer sur le bouton "🔍 Audit"
5. Observer le résultat

**Résultat attendu:**
Le modal d'audit devrait s'ouvrir avec tous les détails de l'assignation (scores, candidats, justification).

**Résultat observé:**
- Pour les anciennes assignations: Toast d'erreur "Justification indisponible"
- Pour les nouvelles assignations: Devrait fonctionner correctement

**Solution temporaire:**
1. Supprimer les anciennes assignations
2. Faire une NOUVELLE attribution automatique
3. Le bouton Audit fonctionnera sur les nouvelles assignations

**Console Logs ajoutés:**
- "Bouton Audit cliqué" + données assignation
- "openAuditModal appelé" + détails
- "Modal audit ouvert" si succès
- Message d'erreur si justification manquante

**Fichiers modifiés:**
- `/app/backend/server.py` - Modèle Assignation enrichi avec `justification`
- `/app/frontend/src/App.js` - Modal audit + gestion erreurs

**Actions requises:**
- [x] Ajouter console.logs pour debugging
- [x] Améliorer message d'erreur
- [ ] Tester avec nouvelles assignations automatiques
- [ ] Documenter le comportement pour l'utilisateur

**Notes supplémentaires:**
La fonctionnalité fonctionne correctement pour les nouvelles assignations. Les anciennes assignations n'ont pas le champ `justification` en base de données.

---

## 🔄 BUGS EN COURS

### #004 - Cases à cocher jours de la semaine (récurrence) - CORRIGÉ ✅

**Module:** Mes Disponibilités
**Priorité:** 🟠 Haute
**Statut:** ✅ Résolu
**Date:** 2025-01-25
**Assigné à:** Corrigé

**Description:**
Dans les modaux de récurrence (disponibilités ET indisponibilités), les cases à cocher pour sélectionner les jours de la semaine n'étaient pas visibles/accessibles.

**Solution appliquée:**
- Ajout des cases à cocher visuelles pour Lun, Mar, Mer, Jeu, Ven, Sam, Dim
- Affichage conditionnel pour récurrence Hebdomadaire/Bihebdomadaire
- Ajout du champ `jours_semaine: []` dans les états
- Logique backend pour filtrer les dates selon les jours sélectionnés
- Style visuel: vert pour disponibilités, rouge pour indisponibilités

**Fichiers modifiés:**
- `/app/frontend/src/App.js` - Ajout interface checkboxes + logique
- Backend: Génération des dates filtrées par jour de la semaine

**Date de résolution:** 2025-01-25

---

### #005 - Déconnexion module "Mes disponibilités" (employés temps partiel) - CORRIGÉ ✅

**Module:** Mes Disponibilités
**Priorité:** 🔴 Critique
**Statut:** ✅ Résolu
**Date:** 2025-01-25
**Assigné à:** Corrigé

**Description:**
Les employés temps partiel étaient déconnectés immédiatement en cliquant sur le module "Mes disponibilités".

**Cause:**
L'endpoint `/users` refusait l'accès aux employés (erreur 403 Forbidden). Le composant tentait de charger les users, ce qui causait une erreur et une déconnexion.

**Solution appliquée:**
- Backend modifié: Tous les utilisateurs authentifiés peuvent accéder à `/users` en lecture seule
- Frontend: Chargement conditionnel des users selon le rôle
- Gestion d'erreur améliorée avec toast informatif

**Fichiers modifiés:**
- `/app/backend/server.py` - Suppression restriction sur `/users`
- `/app/frontend/src/App.js` - Logique chargement users

**Date de résolution:** 2025-01-25

---

### #006 - Planning module déconnexion (employés) - CORRIGÉ ✅

**Module:** Planning
**Priorité:** 🔴 Critique
**Statut:** ✅ Résolu
**Date:** 2025-01-25
**Assigné à:** Corrigé

**Description:**
Les employés étaient déconnectés en cliquant sur le module Planning.

**Cause:**
Même problème que #005 - restriction d'accès à `/users` pour les employés.

**Solution appliquée:**
Identique à #005 - Backend autorise maintenant tous les utilisateurs à accéder à `/users`.

**Date de résolution:** 2025-01-25

---

## ✅ BUGS RÉSOLUS

### #007 - Autocomplete Face ID/Touch ID non fonctionnel - CORRIGÉ ✅

**Module:** Authentification
**Priorité:** 🟡 Moyenne
**Statut:** ✅ Résolu
**Date:** 2025-01-25

**Description:**
Les gestionnaires de mots de passe (Face ID, Touch ID, etc.) ne fonctionnaient pas sur la page de connexion.

**Solution:**
- Ajout `autoComplete="username email"` sur champ email
- Ajout `autoComplete="current-password"` sur champ mot de passe
- Ajout attributs `name="email"` et `name="password"`

**Fichier modifié:**
- `/app/frontend/src/App.js` - Composant Login

**Date de résolution:** 2025-01-25

---

## 📊 Statistiques

- **Total de bugs:** 7
- **Ouverts:** 3 (🆕)
- **Résolus:** 4 (✅)
- **Taux de résolution:** 57%

---

## 🔧 Bugs à Investiguer (Backlog)

*Aucun bug en backlog pour le moment*

---

## 📝 Notes de Collaboration

### Comment utiliser ce fichier ?

1. **Ajouter un bug:**
   - Copier le template en haut
   - Remplir toutes les sections
   - Assigner un numéro (#XXX)
   - Placer dans la section "BUGS OUVERTS"

2. **Mettre à jour un bug:**
   - Changer le statut (🆕 → 🔄 → ✅)
   - Ajouter des notes dans "Actions requises"
   - Déplacer vers la bonne section si résolu

3. **Résoudre un bug:**
   - Déplacer vers "BUGS RÉSOLUS"
   - Ajouter date de résolution
   - Lister les fichiers modifiés

4. **Priorités:**
   - 🔴 Critique: Bloquant, empêche l'utilisation
   - 🟠 Haute: Important, impacte fortement l'UX
   - 🟡 Moyenne: Gênant mais contournable
   - 🟢 Basse: Cosmétique, optimisation

---

## 🔗 Ressources Utiles

- **Console logs backend:** `/var/log/supervisor/backend.err.log`
- **Console logs frontend:** Navigateur F12 → Console
- **Network logs:** Navigateur F12 → Network
- **Tester API:** `curl -X GET "http://localhost:8001/api/..."`

---

**Maintenu par:** Équipe ProFireManager
**Contact:** [Vos coordonnées]
