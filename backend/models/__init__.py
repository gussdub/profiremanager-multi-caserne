"""
Modèles Pydantic pour ProFireManager
Export centralisé de tous les modèles
"""

# Tenant & SuperAdmin
from .tenant import (
    Tenant,
    TenantCreate,
    SuperAdmin,
    SuperAdminLogin
)

# User
from .user import (
    User,
    UserCreate,
    UserUpdate,
    UserLogin,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    PasswordResetToken
)

# Planning
from .planning import (
    TypeGarde,
    TypeGardeCreate,
    Planning,
    PlanningCreate,
    Assignation,
    AssignationCreate,
    TentativeRemplacement,
    DemandeRemplacement,
    DemandeRemplacementCreate,
    Disponibilite,
    DisponibiliteCreate,
    IndisponibiliteGenerate,
    DisponibiliteReinitialiser,
    ConflictResolution,
    ConflictDetail
)

# Formation
from .formation import (
    Formation,
    FormationCreate,
    FormationUpdate,
    InscriptionFormation,
    InscriptionFormationCreate,
    InscriptionFormationUpdate,
    Competence,
    CompetenceCreate,
    CompetenceUpdate,
    Grade,
    GradeCreate,
    GradeUpdate,
    ParametresFormations,
    ValidationCompetence,
    ValidationCompetenceCreate
)

__all__ = [
    # Tenant
    'Tenant', 'TenantCreate', 'SuperAdmin', 'SuperAdminLogin',
    # User
    'User', 'UserCreate', 'UserUpdate', 'UserLogin',
    'ForgotPasswordRequest', 'ResetPasswordRequest', 'PasswordResetToken',
    # Planning
    'TypeGarde', 'TypeGardeCreate', 'Planning', 'PlanningCreate',
    'Assignation', 'AssignationCreate', 'TentativeRemplacement',
    'DemandeRemplacement', 'DemandeRemplacementCreate',
    'Disponibilite', 'DisponibiliteCreate', 'IndisponibiliteGenerate',
    'DisponibiliteReinitialiser', 'ConflictResolution', 'ConflictDetail',
    # Formation
    'Formation', 'FormationCreate', 'FormationUpdate',
    'InscriptionFormation', 'InscriptionFormationCreate', 'InscriptionFormationUpdate',
    'Competence', 'CompetenceCreate', 'CompetenceUpdate',
    'Grade', 'GradeCreate', 'GradeUpdate',
    'ParametresFormations', 'ValidationCompetence', 'ValidationCompetenceCreate'
]
