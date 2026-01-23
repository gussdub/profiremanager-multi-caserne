# Plan de Refactorisation - ProFireManager

## État actuel

### Backend (`server.py`)
- **Taille**: ~41,000 lignes
- **Problème**: Fichier monolithique difficile à maintenir
- **Modèles déjà extraits**: 
  - `models/paie.py` ✅
  - `models/intervention.py` ✅  
  - `models/formation.py` ✅
  - `models/planning.py` ✅
  - `models/user.py` ✅
  - `models/tenant.py` ✅
- **Routes à extraire**:
  - Paie (~2,600 lignes, L38374-L41018)
  - Prévention (~2,000 lignes)
  - Personnel (~1,500 lignes)
  - Planning (~2,000 lignes)
  - Formations (~1,000 lignes)

### Frontend (`GestionInterventions.jsx`)
- **Taille**: ~6,354 lignes
- **Problème**: Composant monolithique avec 12+ sous-composants internes
- **Structure créée**: `/components/interventions/` (vide)
- **Composants à extraire**:
  - `SectionIdentification.jsx` (~300 lignes)
  - `SectionBatiment.jsx` (~530 lignes)
  - `SectionRessources.jsx` (~780 lignes)
  - `SectionDSI.jsx` (~130 lignes)
  - `SectionProtection.jsx` (~140 lignes)
  - `SectionMateriel.jsx` (~270 lignes)
  - `SectionPertes.jsx` (~190 lignes)
  - `SectionNarratif.jsx` (~230 lignes)
  - `SectionRemisePropriete.jsx` (~360 lignes)
  - `SectionFacturation.jsx` (~730 lignes)
  - `TabHistorique.jsx` (~200 lignes)
  - `TabParametres.jsx` (~350 lignes)
  - `InterventionDetailModal.jsx` (~700 lignes)
  - `ImportXMLModal.jsx` (~200 lignes)

## Stratégie de refactorisation

### Phase 1 - Extraction sécurisée (Recommandé)
1. **Ne pas modifier** `server.py` directement
2. Créer nouveaux fichiers dans `routes/`
3. Tester chaque route individuellement
4. Migrer progressivement avec tests de régression

### Phase 2 - Migration frontend
1. Extraire un composant à la fois
2. Importer dans `GestionInterventions.jsx`
3. Supprimer le code dupliqué
4. Tester après chaque extraction

## Risques identifiés
- Interdépendances complexes dans `server.py`
- Imports circulaires potentiels
- Variables globales partagées (db, get_current_user)
- Pas de tests unitaires existants

## Recommandation
Effectuer la refactorisation lors d'une session dédiée avec:
1. Création de tests unitaires préalables
2. Sauvegarde/commit avant chaque étape
3. Tests de régression complets
4. Rollback possible si problème

## Fichiers nettoyés
- ✅ `RemiseProprieteModal.jsx` supprimé (code déplacé dans GestionInterventions.jsx)
