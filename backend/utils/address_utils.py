"""
Utilitaires pour la normalisation et la correspondance d'adresses
"""
import re
from typing import Optional, Dict, List, Tuple
from difflib import SequenceMatcher

# Abréviations communes pour les types de rues
STREET_ABBREVIATIONS = {
    # Français
    'avenue': ['av', 'ave', 'aven'],
    'boulevard': ['boul', 'blvd', 'bd'],
    'chemin': ['ch', 'chem'],
    'rue': ['r'],
    'route': ['rte', 'rt'],
    'place': ['pl'],
    'allée': ['all'],
    'impasse': ['imp'],
    'passage': ['pass', 'psg'],
    'square': ['sq'],
    'terrasse': ['terr'],
    'montée': ['mtée', 'mte'],
    'rang': ['rg'],
    'côte': ['cte'],
    'croissant': ['crois', 'cr'],
    # Anglais (pour compatibilité)
    'street': ['st', 'str'],
    'road': ['rd'],
    'drive': ['dr'],
    'lane': ['ln'],
    'court': ['ct'],
    'circle': ['cir'],
    'way': ['wy'],
}

# Mots à ignorer dans la comparaison
IGNORED_WORDS = ['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'the', 'of', 'and']

# Points cardinaux
CARDINAL_DIRECTIONS = {
    'nord': ['n', 'north'],
    'sud': ['s', 'south'],
    'est': ['e', 'east'],
    'ouest': ['o', 'w', 'west'],
    'nord-est': ['ne', 'n-e', 'northeast'],
    'nord-ouest': ['no', 'n-o', 'northwest'],
    'sud-est': ['se', 's-e', 'southeast'],
    'sud-ouest': ['so', 's-o', 'southwest'],
}


def normalize_address(address: str) -> str:
    """
    Normalise une adresse pour faciliter la comparaison.
    - Convertit en minuscules
    - Supprime la ponctuation
    - Normalise les abréviations
    - Supprime les espaces multiples
    """
    if not address:
        return ""
    
    # Minuscules
    normalized = address.lower().strip()
    
    # Remplacer les caractères spéciaux
    normalized = normalized.replace("'", " ")
    normalized = normalized.replace("-", " ")
    normalized = normalized.replace(".", " ")
    normalized = normalized.replace(",", " ")
    normalized = normalized.replace("#", " ")
    
    # Supprimer les accents (optionnel, pour correspondance plus souple)
    accent_map = {
        'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
        'à': 'a', 'â': 'a', 'ä': 'a',
        'î': 'i', 'ï': 'i',
        'ô': 'o', 'ö': 'o',
        'ù': 'u', 'û': 'u', 'ü': 'u',
        'ç': 'c'
    }
    for accented, plain in accent_map.items():
        normalized = normalized.replace(accented, plain)
    
    # Séparer les mots
    words = normalized.split()
    
    # Normaliser chaque mot
    normalized_words = []
    for word in words:
        # Ignorer les mots vides
        if word in IGNORED_WORDS:
            continue
        
        # Normaliser les abréviations de rue
        found = False
        for full_form, abbrevs in STREET_ABBREVIATIONS.items():
            if word == full_form or word in abbrevs:
                normalized_words.append(full_form)
                found = True
                break
        
        if not found:
            # Normaliser les directions cardinales
            for full_form, abbrevs in CARDINAL_DIRECTIONS.items():
                if word == full_form or word in abbrevs:
                    normalized_words.append(full_form)
                    found = True
                    break
        
        if not found:
            normalized_words.append(word)
    
    # Rejoindre et nettoyer
    result = " ".join(normalized_words)
    # Supprimer les espaces multiples
    result = re.sub(r'\s+', ' ', result).strip()
    
    return result


def extract_civic_number(address: str) -> Optional[str]:
    """
    Extrait le numéro civique d'une adresse.
    Gère les formats: 123, 123A, 123-125, 123 1/2
    """
    if not address:
        return None
    
    # Pattern pour numéro civique au début
    match = re.match(r'^(\d+[\-\/]?\d*[a-zA-Z]?)', address.strip())
    if match:
        return match.group(1).upper()
    
    return None


def extract_postal_code(address: str) -> Optional[str]:
    """
    Extrait le code postal canadien d'une adresse.
    Format: A1A 1A1 ou A1A1A1
    """
    if not address:
        return None
    
    # Pattern pour code postal canadien
    match = re.search(r'([A-Za-z]\d[A-Za-z])\s*(\d[A-Za-z]\d)', address)
    if match:
        return f"{match.group(1).upper()} {match.group(2).upper()}"
    
    return None


def calculate_address_similarity(addr1: str, addr2: str) -> float:
    """
    Calcule un score de similarité entre deux adresses (0.0 à 1.0).
    Utilise la normalisation et SequenceMatcher.
    """
    if not addr1 or not addr2:
        return 0.0
    
    norm1 = normalize_address(addr1)
    norm2 = normalize_address(addr2)
    
    if norm1 == norm2:
        return 1.0
    
    # Utiliser SequenceMatcher pour la similarité
    ratio = SequenceMatcher(None, norm1, norm2).ratio()
    
    # Bonus si le numéro civique correspond
    civic1 = extract_civic_number(addr1)
    civic2 = extract_civic_number(addr2)
    
    if civic1 and civic2 and civic1 == civic2:
        ratio = min(1.0, ratio + 0.2)
    
    return ratio


def find_matching_address(
    address: str,
    existing_addresses: List[Dict],
    threshold: float = 0.85
) -> List[Tuple[Dict, float]]:
    """
    Trouve les adresses correspondantes dans une liste existante.
    
    Args:
        address: L'adresse à rechercher
        existing_addresses: Liste de dicts avec au moins une clé 'adresse' ou 'adresse_civique'
        threshold: Seuil minimum de similarité (0.0 à 1.0)
    
    Returns:
        Liste de tuples (batiment, score) triés par score décroissant
    """
    matches = []
    
    for existing in existing_addresses:
        # Essayer différents champs d'adresse
        existing_addr = (
            existing.get('adresse_civique') or 
            existing.get('adresse') or 
            existing.get('adresse_complete') or
            ""
        )
        
        if not existing_addr:
            continue
        
        score = calculate_address_similarity(address, existing_addr)
        
        if score >= threshold:
            matches.append((existing, score))
    
    # Trier par score décroissant
    matches.sort(key=lambda x: x[1], reverse=True)
    
    return matches


def compare_building_fields(
    new_data: Dict,
    existing_data: Dict,
    fields_to_compare: List[str] = None
) -> Dict[str, Dict]:
    """
    Compare les champs entre un nouveau bâtiment et un existant.
    
    Returns:
        Dict avec les différences: {field_name: {'old': value, 'new': value}}
    """
    if fields_to_compare is None:
        # Tous les champs importants
        fields_to_compare = [
            'adresse_civique', 'adresse', 'ville', 'code_postal',
            'proprietaire', 'nom_etablissement',
            'type_batiment', 'usage_principal', 'groupe_occupation',
            'nombre_etages', 'nombre_logements', 'superficie',
            'annee_construction', 'type_construction',
            'gicleurs', 'alarme_incendie', 'extincteurs',
            'niveau_risque', 'matricule', 'numero_lot',
            'latitude', 'longitude',
            'notes', 'description'
        ]
    
    differences = {}
    
    for field in fields_to_compare:
        new_value = new_data.get(field)
        existing_value = existing_data.get(field)
        
        # Normaliser les valeurs pour comparaison
        if isinstance(new_value, str):
            new_value = new_value.strip() if new_value else None
        if isinstance(existing_value, str):
            existing_value = existing_value.strip() if existing_value else None
        
        # Considérer None et "" comme équivalents
        new_empty = new_value is None or new_value == ""
        existing_empty = existing_value is None or existing_value == ""
        
        if new_empty and existing_empty:
            continue
        
        if new_value != existing_value:
            differences[field] = {
                'old': existing_value,
                'new': new_value
            }
    
    return differences


def generate_address_key(address: str, postal_code: str = None) -> str:
    """
    Génère une clé unique pour une adresse pour faciliter la déduplication.
    """
    normalized = normalize_address(address)
    civic = extract_civic_number(address) or ""
    
    if postal_code:
        postal = postal_code.upper().replace(" ", "")
    else:
        postal = extract_postal_code(address) or ""
        postal = postal.replace(" ", "")
    
    # Créer une clé basée sur les éléments essentiels
    key_parts = [civic, normalized]
    if postal:
        key_parts.append(postal)
    
    return "|".join(key_parts)
