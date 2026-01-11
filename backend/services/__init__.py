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

from .helpers import (
    get_password_hash,
    clean_mongo_doc,
    validate_complex_password,
    normalize_string_for_matching,
    create_user_matching_index,
    calculate_name_similarity
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
    'is_temps_plein',
    # Helpers
    'get_password_hash',
    'clean_mongo_doc',
    'validate_complex_password',
    'normalize_string_for_matching',
    'create_user_matching_index',
    'calculate_name_similarity'
]
