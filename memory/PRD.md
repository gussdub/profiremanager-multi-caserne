# PRD - Application de Gestion des Services d'Incendie

## Problème Original
Application multi-tenant de gestion pour les services d'incendie du Québec, incluant la gestion du personnel, des formations, des équipements, des interventions, de la prévention et de la paie.

## Architecture
- **Frontend:** React avec Shadcn/UI
- **Backend:** FastAPI (Python)
- **Base de données:** MongoDB
- **Multi-tenant:** Isolation par tenant_slug

## Tâches Complétées

### Session Actuelle (Décembre 2025)
- ✅ **Migration window.confirm/alert vers useConfirmDialog** - COMPLÉTÉ
  - Migré 8 fichiers restants identifiés par le testing agent
  - Fichiers corrigés: ParametresActifs.jsx, ParametresInventairesVehicules.jsx, SuperAdminDashboard.js, ConfigurationSFTP.jsx, GrillesInspectionComponents.jsx, CarteApprovisionnementEau.jsx, ApprovisionnementEau.jsx
  - Tests automatisés passés à 100%

### Sessions Précédentes
- ✅ Correction des exports PDF/Excel corrompus
- ✅ Mise à jour de l'algorithme CNPI vers TF-IDF/Cosine Similarity
- ✅ Correction du bug de planning (Internal Server Error)
- ✅ Système de dialogue personnalisé (ConfirmDialog, ConfirmDialogProvider, useConfirmDialog)

## Fichiers Clés du Système de Dialogue
- `frontend/src/components/ui/ConfirmDialog.jsx` - Composant et Provider
- `frontend/src/App.js` - Provider monté globalement

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

## Notes Techniques
- Toujours utiliser `useConfirmDialog` au lieu de `window.confirm` (environnement iframe)
- data-testid pour les tests: confirm-dialog, confirm-dialog-cancel, confirm-dialog-confirm
