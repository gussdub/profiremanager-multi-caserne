# Architecture Backend ProFireManager

## Structure des dossiers

```
/app/backend/
├── server.py              # Fichier principal (en cours de refactoring)
├── routes/                # Routes API (à venir)
│   └── __init__.py
├── models/                # Modèles Pydantic ✅
│   ├── __init__.py        # Exports centralisés
│   ├── base.py            # Imports communs
│   ├── tenant.py          # Tenant, SuperAdmin
│   ├── user.py            # User, UserCreate, UserUpdate, etc.
│   ├── planning.py        # TypeGarde, Assignation, Disponibilite, etc.
│   └── formation.py       # Formation, Competence, Grade, etc.
└── services/              # Services partagés ✅
    ├── __init__.py
    ├── auth.py            # Authentification JWT, hashing
    └── database.py        # Connexion MongoDB, helpers
```

## Modèles disponibles (models/)

### models/tenant.py
- `Tenant`, `TenantCreate` - Gestion des casernes
- `SuperAdmin`, `SuperAdminLogin` - Super administrateurs

### models/user.py
- `User`, `UserCreate`, `UserUpdate` - Utilisateurs/pompiers
- `UserLogin`, `ForgotPasswordRequest`, `ResetPasswordRequest`
- `PasswordResetToken`

### models/planning.py
- `TypeGarde`, `TypeGardeCreate` - Types de gardes
- `Planning`, `PlanningCreate` - Plannings hebdomadaires
- `Assignation`, `AssignationCreate` - Assignations de gardes
- `DemandeRemplacement`, `DemandeRemplacementCreate` - Demandes de remplacement
- `Disponibilite`, `DisponibiliteCreate` - Disponibilités employés
- `ConflictResolution`, `ConflictDetail` - Gestion des conflits

### models/formation.py
- `Formation`, `FormationCreate`, `FormationUpdate` - Formations
- `InscriptionFormation`, `InscriptionFormationCreate` - Inscriptions
- `Competence`, `CompetenceCreate`, `CompetenceUpdate` - Compétences NFPA
- `Grade`, `GradeCreate`, `GradeUpdate` - Grades hiérarchiques
- `ValidationCompetence`, `ValidationCompetenceCreate` - Certifications

## Services disponibles (services/)

### services/auth.py
- `create_access_token(data, expires_delta)` - Crée un token JWT
- `verify_password(plain, hashed)` - Vérifie un mot de passe bcrypt
- `hash_password(plain)` - Hash un mot de passe avec bcrypt
- `decode_token(token)` - Décode et valide un token JWT
- Constantes: `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`

### services/database.py
- `db` - Instance de la base MongoDB
- `client` - Client MongoDB
- `is_temps_partiel(user)` - Vérifie si utilisateur temps partiel/temporaire
- `is_temps_plein(user)` - Vérifie si utilisateur temps plein

## Utilisation

```python
# Importer des modèles
from models import User, Tenant, TypeGarde, Formation

# Importer des services
from services import db, create_access_token, verify_password

# Ou imports spécifiques
from models.user import UserCreate
from services.auth import hash_password
```

## Migration progressive

Le refactoring se fait de manière progressive:

1. ✅ Phase 1: Services partagés (auth, database)
2. ✅ Phase 2: Modèles Pydantic extraits
3. ⏳ Phase 3: Extraire les routes par module
4. ⏳ Phase 4: Nettoyer server.py

## Notes importantes

- `server.py` reste le point d'entrée principal et contient toujours les définitions originales
- Les fichiers dans `models/` sont des COPIES pour permettre l'import modulaire
- Une fois la migration complète, server.py importera depuis models/
- Compatibilité totale maintenue pendant la transition
