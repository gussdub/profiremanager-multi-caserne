"""
Helpers et utilitaires pour ProFireManager
Fonctions communes utilisées par les routes
"""

import bcrypt
import re
import unicodedata
from typing import Dict, Any, Optional


def get_password_hash(password: str) -> str:
    """
    Crée un hash bcrypt du mot de passe (sécurisé et standard).
    """
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode('utf-8')


def clean_mongo_doc(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Supprime les champs MongoDB non sérialisables (_id ObjectId)
    
    Args:
        doc: Document MongoDB
    
    Returns:
        Document nettoyé sans _id
    """
    if doc and "_id" in doc:
        doc.pop("_id", None)
    return doc


def validate_complex_password(password: str) -> bool:
    """
    Valide qu'un mot de passe respecte les critères de complexité :
    - 8 caractères minimum
    - 1 majuscule
    - 1 chiffre  
    - 1 caractère spécial (!@#$%^&*+-?())
    """
    if len(password) < 8:
        return False
    
    has_uppercase = bool(re.search(r'[A-Z]', password))
    has_digit = bool(re.search(r'\d', password))
    has_special = bool(re.search(r'[!@#$%^&*+\-?()]', password))
    
    return has_uppercase and has_digit and has_special


def normalize_string_for_matching(s: str) -> str:
    """
    Normalise une chaîne pour le matching intelligent :
    - Enlève les accents (é → e, à → a, etc.)
    - Convertit en minuscules
    - Strip les espaces
    - Remplace les tirets par des espaces
    - Normalise les espaces multiples
    
    Exemple:
        "Sébastien BERNARD" → "sebastien bernard"
        "Dupont Jean-Pierre" → "dupont jean pierre"
    """
    # Enlever les accents
    s = ''.join(c for c in unicodedata.normalize('NFD', s) 
                if unicodedata.category(c) != 'Mn')
    
    # Minuscules
    s = s.lower()
    
    # Remplacer les tirets par des espaces
    s = s.replace('-', ' ')
    
    # Normaliser les espaces multiples
    s = re.sub(r'\s+', ' ', s)
    
    return s.strip()


def create_user_matching_index(users_list: list) -> dict:
    """
    Crée un index de matching pour recherche rapide d'utilisateurs.
    
    Gère automatiquement :
    - Ordre normal (Prénom Nom)
    - Ordre inversé (Nom Prénom)
    - Normalisation (accents, casse)
    
    Args:
        users_list: Liste d'utilisateurs avec 'prenom' et 'nom'
    
    Returns:
        dict: Index {nom_normalisé: user_object}
    """
    index = {}
    for user in users_list:
        prenom = user.get('prenom', '').strip()
        nom = user.get('nom', '').strip()
        
        if prenom and nom:
            # Index: Prénom Nom (ordre normal)
            key1 = normalize_string_for_matching(f"{prenom} {nom}")
            index[key1] = user
            
            # Index: Nom Prénom (ordre inversé)
            key2 = normalize_string_for_matching(f"{nom} {prenom}")
            index[key2] = user
    
    return index


def calculate_name_similarity(str1: str, str2: str) -> float:
    """
    Calcule un score de similarité entre deux chaînes normalisées.
    Retourne un score entre 0 (pas de correspondance) et 1 (match parfait).
    """
    words1 = set(str1.split())
    words2 = set(str2.split())
    
    if not words1 or not words2:
        return 0.0
    
    # Intersection: mots en commun
    common_words = words1.intersection(words2)
    
    if not common_words:
        return 0.0
    
    # Score basé sur le ratio de mots communs
    total_words = len(words1.union(words2))
    score = len(common_words) / total_words
    
    return score
