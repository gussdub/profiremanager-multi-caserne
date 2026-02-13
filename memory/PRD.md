# PRD - Application de Gestion des Services d'Incendie

## Problème Original
Application multi-tenant de gestion pour les services d'incendie du Québec, incluant la gestion du personnel, des formations, des équipements, des interventions, de la prévention et de la paie.

## Architecture
- **Frontend:** React avec Shadcn/UI
- **Backend:** FastAPI (Python)
- **Base de données:** MongoDB
- **Multi-tenant:** Isolation par tenant_slug

## Tâches Complétées

### Session Actuelle (Février 2026)
- ✅ **Correction du bug de double refresh du module Prévention** - COMPLÉTÉ
  - Problème: Le module Prévention nécessitait 2 rafraîchissements pour s'afficher après connexion
  - Cause: Le tenant était chargé de manière asynchrone après la vérification du token
  - Solution: Restauration immédiate du tenant depuis localStorage + chargement parallèle avec vérification token
  - Fichier modifié: `frontend/src/contexts/AuthContext.js`

- ✅ **Ajout du nom de l'inspecteur aux formulaires d'inspection à faible risque** - COMPLÉTÉ
  - Nouveau champ `inspecteur_nom` et `inspection_realisee_par` dans le modèle d'inspection
  - Le nom complet de l'utilisateur connecté est automatiquement capturé lors de la soumission
  - Permet la traçabilité des inspections pour les préventionnistes en charge
  - Fichiers modifiés:
    - `frontend/src/components/InspectionTerrain.jsx` - Capture du nom utilisateur
    - `frontend/src/components/Prevention.jsx` - Passage du currentUser au composant
    - `backend/routes/prevention.py` - Nouveaux champs dans les modèles Inspection/InspectionCreate

### Sessions Précédentes (Décembre 2025-Février 2026)
- ✅ **Migration window.confirm/alert vers useConfirmDialog** - COMPLÉTÉ
  - Migré 8 fichiers restants identifiés par le testing agent
  - Fichiers corrigés: ParametresActifs.jsx, ParametresInventairesVehicules.jsx, SuperAdminDashboard.js, ConfigurationSFTP.jsx, GrillesInspectionComponents.jsx, CarteApprovisionnementEau.jsx, ApprovisionnementEau.jsx
  - Tests automatisés passés à 100%

- ✅ **Uniformisation des emails** - COMPLÉTÉ
  - Tous les templates d'emails utilisent maintenant le même design avec le logo ProFireManager officiel
  - Fonction helper `get_email_template()` créée pour standardiser le header/footer
  - Fichiers modifiés: `server.py`, `services/email_service.py`, `utils/emails.py`, `routes/dependencies.py`
  - Lien "Voir dans l'application" corrigé pour inclure le tenant_slug

### Sessions Précédentes
- ✅ Correction des exports PDF/Excel corrompus
- ✅ Mise à jour de l'algorithme CNPI vers TF-IDF/Cosine Similarity
- ✅ Correction du bug de planning (Internal Server Error)
- ✅ Système de dialogue personnalisé (ConfirmDialog, ConfirmDialogProvider, useConfirmDialog)

## Fichiers Clés du Système de Dialogue
- `frontend/src/components/ui/ConfirmDialog.jsx` - Composant et Provider
- `frontend/src/App.js` - Provider monté globalement

## Fichiers Clés des Templates d'Email
- `backend/server.py` - Constante LOGO_URL et helpers get_email_header()/get_email_footer()
- `backend/services/email_service.py` - Fonction get_email_template() et templates standardisés
- `backend/utils/emails.py` - Templates pour alertes bornes et inventaires véhicules
- `backend/routes/dependencies.py` - Passage du tenant_slug dans les notifications email

## Tâches en Attente

### P1 - En attente de clarification
- Audit des notifications pour le module "Prévention" (besoin de précisions sur le workflow)

### P2 - Futur
- Uniformiser les exports PDF/Excel dans tous les modules
- Bouton "Vérifier maintenant" pour SFTP
- Corriger le bouton "Télécharger" non-fonctionnel dans certains modules d'export

## Intégrations Tierces
- SFTP Server pour le polling de fichiers
- Scikit-learn pour les fonctionnalités ML
- Resend API pour l'envoi d'emails

## Notes Techniques
- Toujours utiliser `useConfirmDialog` au lieu de `window.confirm` (environnement iframe)
- data-testid pour les tests: confirm-dialog, confirm-dialog-cancel, confirm-dialog-confirm
- Logo officiel ProFireManager: https://customer-assets.emergentagent.com/job_fireshift-manager/artifacts/6vh2i9cz_05_Icone_Flamme_Rouge_Bordure_D9072B_VISIBLE.png
