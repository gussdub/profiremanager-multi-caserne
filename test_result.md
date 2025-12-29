test_plan:
  current_focus: ["Validation post-correction imports API"]
  stuck_tasks: []
  test_all: true
  test_priority: "high_first"

# ============================================
# TEST SESSION: Bug Fix Validation - Missing API Imports
# Date: 2024-12-29
# ============================================

test_session_bug_fix:
  focus: "Validation que tous les modules affichent correctement les données après ajout des imports API manquants"
  
  bug_description: |
    Le bug était causé par des imports manquants dans plusieurs composants frontend.
    Les fonctions apiGet, apiPost, apiPut, apiDelete de '../utils/api' n'étaient pas
    importées dans les fichiers suivants après le refactoring :
    - Personnel.jsx
    - Formations.jsx
    - MesDisponibilites.jsx
    - ModuleEPI.jsx
    - MonProfil.jsx
    - Planning.jsx
    - Remplacements.jsx
    
    GestionActifs.jsx fonctionnait car il avait l'import correct.
  
  fix_applied: |
    Ajout de la ligne d'import suivante dans tous les fichiers concernés :
    import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';

  test_credentials:
    admin:
      tenant: "shefford"
      email: "gussdub@gmail.com"
      password: "230685Juin+"
    employee:
      tenant: "shefford"
      email: "employe@shefford.ca"
      password: "Employe123!"

  modules_to_test:
    - module: "Personnel"
      priority: "P0"
      expected: "Should display 33 users with statistics"
      test_steps:
        - Login as admin
        - Navigate to Personnel module
        - Verify statistics cards show data (33 Total, 32 Actif, etc.)
        - Verify table displays user list
    - module: "Mes Disponibilités"
      priority: "P0"
      expected: "Should display availability calendar and statistics"
      test_steps:
        - Navigate to Mes disponibilités
        - Verify statistics cards show data
        - Verify calendar displays
    - module: "Planning"
      priority: "P0"
      expected: "Should display planning statistics and calendar"
      test_steps:
        - Navigate to Planning
        - Verify statistics (122/59 couverts, 2076h, 72%)
        - Verify calendar displays
    - module: "Formations"
      priority: "P1"
      expected: "Should display formations list and statistics"
      test_steps:
        - Navigate to Formations
        - Verify formations are listed
    - module: "Remplacements"
      priority: "P1"
      expected: "Should display remplacements interface"
      test_steps:
        - Navigate to Remplacements
        - Verify interface loads correctly
    - module: "Gestion des Actifs"
      priority: "P1"
      expected: "Should continue working (was already working)"
      test_steps:
        - Navigate to Gestion des Actifs
        - Verify vehicles are displayed

# Incorporate User Feedback
user_feedback:
  - "Test that ALL modules display data correctly, not just Personnel"
  - "Verify no console errors related to undefined functions"
