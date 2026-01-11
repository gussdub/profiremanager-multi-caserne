"""
Services d'authentification pour ProFireManager
Centralise la logique JWT, hashing et vérification des mots de passe
"""

import os
import jwt
import bcrypt
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Configuration JWT
SECRET_KEY = os.environ.get("JWT_SECRET", "your-secret-key-here")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 24 * 60  # 24 heures pour utilisateurs normaux
SUPER_ADMIN_TOKEN_EXPIRE_MINUTES = 2 * 60  # 2 heures pour super-admins (sécurité)

# Security bearer
security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Crée un token JWT avec les données fournies
    
    Args:
        data: Données à encoder dans le token
        expires_delta: Durée de validité du token (optionnel)
    
    Returns:
        Token JWT encodé
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Vérifie un mot de passe contre son hash bcrypt.
    Système simplifié: UNIQUEMENT bcrypt pour stabilité maximale.
    
    Args:
        plain_password: Mot de passe en clair
        hashed_password: Hash bcrypt stocké
    
    Returns:
        True si le mot de passe correspond, False sinon
    """
    try:
        password_bytes = plain_password.encode('utf-8')
        
        # Vérifier si c'est un hash bcrypt valide
        if not hashed_password or not hashed_password.startswith('$2'):
            logging.error(f"❌ Hash invalide ou non-bcrypt détecté")
            return False
        
        if isinstance(hashed_password, str):
            hash_bytes = hashed_password.encode('utf-8')
        else:
            hash_bytes = hashed_password
        
        result = bcrypt.checkpw(password_bytes, hash_bytes)
        logging.info(f"✅ Vérification bcrypt: {result}")
        return result
        
    except Exception as e:
        logging.error(f"❌ Erreur vérification mot de passe: {e}")
        return False


def hash_password(plain_password: str) -> str:
    """
    Hash un mot de passe avec bcrypt
    
    Args:
        plain_password: Mot de passe en clair
    
    Returns:
        Hash bcrypt du mot de passe
    """
    password_bytes = plain_password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def decode_token(token: str) -> dict:
    """
    Décode et valide un token JWT
    
    Args:
        token: Token JWT à décoder
    
    Returns:
        Payload du token décodé
    
    Raises:
        HTTPException: Si le token est invalide
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token invalide")
