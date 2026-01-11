# Architecture Backend ProFireManager

## Structure des dossiers

```
/app/backend/
├── server.py              # Fichier principal (en cours de refactoring)
├── routes/                # Routes API (à venir)
│   └── __init__.py
├── models/                # Modèles Pydantic (à venir)
│   ├── __init__.py
│   └── base.py
└── services/              # Services partagés ✅
    ├── __init__.py
    ├── auth.py            # Authentification JWT, hashing
    └── database.py        # Connexion MongoDB, helpers
```

## Services disponibles

### services/auth.py
- `create_access_token(data, expires_delta)` - Crée un token JWT
- `verify_password(plain, hashed)` - Vérifie un mot de passe bcrypt
- `hash_password(plain)` - Hash un mot de passe avec bcrypt
- `decode_token(token)` - Décode et valide un token JWT
- Constantes: `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `SUPER_ADMIN_TOKEN_EXPIRE_MINUTES`

### services/database.py
- `db` - Instance de la base MongoDB
- `client` - Client MongoDB
- `is_temps_partiel(user)` - Vérifie si utilisateur temps partiel/temporaire
- `is_temps_plein(user)` - Vérifie si utilisateur temps plein

## Migration progressive

Le refactoring se fait de manière progressive pour garantir la stabilité:

1. ✅ Phase 1: Créer les services partagés (auth, database)
2. 🔄 Phase 2: Extraire les modèles Pydantic
3. ⏳ Phase 3: Extraire les routes par module
4. ⏳ Phase 4: Nettoyer server.py

## Utilisation

```python
# Depuis un nouveau module
from services import db, create_access_token, verify_password

# Ou import spécifique
from services.auth import hash_password
from services.database import is_temps_partiel
```

## Notes importantes

- `server.py` reste le point d'entrée principal
- Les nouveaux modules peuvent importer depuis `services/`
- Ne pas modifier les exports existants de `server.py` pendant la transition
