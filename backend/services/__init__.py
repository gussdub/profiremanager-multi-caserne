"""
Services ProFireManager
Modules utilitaires partagés entre les routes
"""

from .auth import (
    create_access_token,
    verify_password,
    hash_password,
    decode_token,
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    SUPER_ADMIN_TOKEN_EXPIRE_MINUTES,
    security,
    security_optional
)

from .database import (
    client,
    db,
    is_temps_partiel,
    is_temps_plein
)

__all__ = [
    # Auth
    'create_access_token',
    'verify_password', 
    'hash_password',
    'decode_token',
    'SECRET_KEY',
    'ALGORITHM',
    'ACCESS_TOKEN_EXPIRE_MINUTES',
    'SUPER_ADMIN_TOKEN_EXPIRE_MINUTES',
    'security',
    'security_optional',
    # Database
    'client',
    'db',
    'is_temps_partiel',
    'is_temps_plein'
]
