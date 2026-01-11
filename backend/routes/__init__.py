"""
Routes API ProFireManager
=========================

Structure des routes (à extraire progressivement de server.py):

/api/admin/...           - Routes Super Admin (gestion multi-tenant)
/api/{tenant}/auth/...   - Authentification tenant
/api/{tenant}/users/...  - Gestion des utilisateurs
/api/{tenant}/planning/... - Planning et assignations
/api/{tenant}/formations/... - Formations et compétences
/api/{tenant}/disponibilites/... - Disponibilités
/api/{tenant}/actifs/...  - Gestion des actifs (véhicules, EPI, etc.)
/api/{tenant}/notifications/... - Notifications

MIGRATION PROGRESSIVE
---------------------
Les routes restent dans server.py pour l'instant.
Ce fichier sert de documentation et de point d'entrée futur.

Pour créer une nouvelle route de manière modulaire:
1. Créer le fichier dans routes/ (ex: routes/nouvelle_feature.py)
2. Utiliser APIRouter avec le bon préfixe
3. Importer et inclure dans server.py

Exemple:
```python
# routes/ma_feature.py
from fastapi import APIRouter, Depends, HTTPException
from models import MonModel
from services import db

router = APIRouter(prefix="/{tenant_slug}/ma-feature", tags=["Ma Feature"])

@router.get("/")
async def list_items(tenant_slug: str):
    # Implementation
    pass
```

```python
# Dans server.py, ajouter:
from routes.ma_feature import router as ma_feature_router
api_router.include_router(ma_feature_router)
```
"""

# Future imports quand les routes seront extraites
# from .admin import router as admin_router
# from .auth import router as auth_router
# from .users import router as users_router
# from .planning import router as planning_router
# from .formations import router as formations_router
