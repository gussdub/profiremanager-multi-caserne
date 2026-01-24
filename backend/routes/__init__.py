"""
Routes API ProFireManager
=========================

Structure des routes modulaire:

MODULES ACTIFS (importés dans server.py):
- routes/dsi.py               - Données de référence DSI (MSP)
- routes/dsi_transmissions.py - Tableau de bord conformité DSI

MODULES PRÊTS POUR ACTIVATION:
- routes/personnel.py         - Gestion des utilisateurs (users)
- routes/disponibilites.py    - Gestion des disponibilités
- routes/planning.py          - Planning et assignations
- routes/formations.py        - Formations et compétences
- routes/paie.py              - Module Paie (feuilles de temps, export)

ROUTES RESTANTES DANS server.py (à extraire progressivement):
- /api/admin/...              - Routes Super Admin (gestion multi-tenant)
- /api/{tenant}/auth/...      - Authentification tenant
- /api/{tenant}/actifs/...    - Gestion des actifs (véhicules, EPI)
- /api/{tenant}/interventions/... - Gestion des interventions
- /api/{tenant}/notifications/... - Notifications
- /api/{tenant}/prevention/...    - Module Prévention (bâtiments)
- /api/{tenant}/rapports/...      - Génération de rapports

MIGRATION PROGRESSIVE
---------------------
Pour activer un module préparé:
1. Dans server.py, ajouter l'import:
   from routes.{module} import router as {module}_router
2. Inclure le router:
   api_router.include_router({module}_router)
3. Supprimer les routes correspondantes de server.py
4. Tester exhaustivement avant mise en production

MODÈLES EXTRAITS
----------------
- models/paie.py : ParametresPaie, FeuilleTemps, TenantPayrollConfig, etc.
- models/formation.py : Formation, InscriptionFormation, Competence, Grade, etc.
- models/planning.py : TypeGarde, Planning, Assignation, Disponibilite, etc.
- models/user.py : User, UserCreate, UserUpdate, etc.
- models/tenant.py : Tenant, SuperAdmin, AuditLog

STATISTIQUES server.py
----------------------
Taille actuelle: ~41,000 lignes
Objectif après refactorisation: ~20,000 lignes (core + auth + helpers)

Prochains modules à extraire (par priorité):
1. prevention (84 routes) - Plus gros module
2. actifs (37 routes) - Véhicules, EPI
3. rapports (23 routes) - Export PDF/Excel
4. interventions (21 routes)
5. notifications (10 routes)
"""

# Imports actifs
from .dsi import router as dsi_router
from .dsi_transmissions import router as dsi_transmissions_router

# Imports prêts pour activation (décommenter quand prêt)
# from .personnel import router as personnel_router
# from .disponibilites import router as disponibilites_router
# from .planning import router as planning_router
# from .formations import router as formations_router
# from .paie import router as paie_router

__all__ = [
    'dsi_router',
    'dsi_transmissions_router',
    # 'personnel_router',
    # 'disponibilites_router',
    # 'planning_router',
    # 'formations_router',
    # 'paie_router',
]
