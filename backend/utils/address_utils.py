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


def extract_street_name(address: str) -> str:
    """
    Extrait le nom de rue d'une adresse (sans le numéro civique).
    Ex: "123 Rue Principale" → "rue principale"
    """
    if not address:
        return ""
    
    # Normaliser d'abord
    normalized = normalize_address(address)
    
    # Enlever le numéro civique au début
    street = re.sub(r'^\d+[\-\/]?\d*[a-zA-Z]?\s*', '', normalized).strip()
    
    return street


def is_same_address(addr1: str, city1: str, addr2: str, city2: str) -> Tuple[bool, Dict]:
    """
    Vérifie si deux adresses sont identiques avec une logique stricte:
    1. Même rue ? → Si non, pas de doublon
    2. Même numéro civique ? → Si non, pas de doublon
    3. Même ville ? → Si non, pas de doublon
    
    Returns:
        Tuple (is_duplicate: bool, details: Dict avec les comparaisons)
    """
    details = {
        'civic_match': False,
        'street_match': False,
        'city_match': False,
        'civic1': None,
        'civic2': None,
        'street1': None,
        'street2': None,
        'city1': None,
        'city2': None
    }
    
    if not addr1 or not addr2:
        return False, details
    
    # Extraire les composants
    civic1 = extract_civic_number(addr1)
    civic2 = extract_civic_number(addr2)
    street1 = extract_street_name(addr1)
    street2 = extract_street_name(addr2)
    norm_city1 = normalize_address(city1) if city1 else ""
    norm_city2 = normalize_address(city2) if city2 else ""
    
    details['civic1'] = civic1
    details['civic2'] = civic2
    details['street1'] = street1
    details['street2'] = street2
    details['city1'] = norm_city1
    details['city2'] = norm_city2
    
    # 1. Même numéro civique ?
    if civic1 and civic2 and civic1 == civic2:
        details['civic_match'] = True
    else:
        return False, details
    
    # 2. Même rue ? (avec tolérance pour petites variations)
    if street1 and street2:
        street_ratio = SequenceMatcher(None, street1, street2).ratio()
        if street_ratio >= 0.85:  # 85% de similarité minimum pour les noms de rue
            details['street_match'] = True
        else:
            return False, details
    else:
        return False, details
    
    # 3. Même ville ?
    if norm_city1 and norm_city2:
        city_ratio = SequenceMatcher(None, norm_city1, norm_city2).ratio()
        if city_ratio >= 0.85:  # 85% de similarité pour les villes
            details['city_match'] = True
        else:
            return False, details
    elif not norm_city1 and not norm_city2:
        # Si aucune ville spécifiée, on considère comme match
        details['city_match'] = True
    else:
        # Une ville spécifiée, l'autre non - pas de match
        return False, details
    
    # Si on arrive ici, c'est un doublon !
    return True, details


def calculate_address_similarity(addr1: str, addr2: str, city1: str = "", city2: str = "") -> float:
    """
    Calcule un score de similarité entre deux adresses.
    
    Logique stricte:
    - Score 1.0 si même numéro + même rue + même ville
    - Score 0.0 si l'un des trois critères ne correspond pas
    """
    is_duplicate, details = is_same_address(addr1, city1, addr2, city2)
    
    if is_duplicate:
        return 1.0
    
    # Si pas de doublon, retourner un score bas basé sur ce qui matche
    score = 0.0
    if details['civic_match']:
        score += 0.2
    if details['street_match']:
        score += 0.3
    if details['city_match']:
        score += 0.2
    
    return score


def find_matching_address(
    address: str,
    city: str,
    existing_addresses: List[Dict],
    threshold: float = 0.92
) -> List[Tuple[Dict, float]]:
    """
    Trouve les adresses correspondantes dans une liste existante.
    
    Utilise la logique stricte:
    - Même numéro civique + Même rue + Même ville = doublon
    
    Args:
        address: L'adresse à rechercher
        city: La ville de l'adresse
        existing_addresses: Liste de dicts avec au moins 'adresse_civique' et 'ville'
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
        existing_city = existing.get('ville', '')
        
        if not existing_addr:
            continue
        
        # Utiliser la nouvelle fonction stricte
        is_duplicate, details = is_same_address(address, city, existing_addr, existing_city)
        
        if is_duplicate:
            matches.append((existing, 1.0))
    
    # Trier par score décroissant (tous les doublons ont score 1.0)
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
