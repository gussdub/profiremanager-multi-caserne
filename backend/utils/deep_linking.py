"""
Deep Linking Utility pour ProFireManager

Ce module gère la génération de liens intelligents qui:
- Sur ordinateur: ouvrent le site web
- Sur mobile avec l'app: ouvrent directement l'app
- Sur mobile sans l'app: ouvrent le site web en fallback

Les liens utilisent le format Universal Links (iOS) / App Links (Android)
"""

import os
from typing import Optional

# URL de base
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')

# Mapping des modules vers les routes frontend
MODULE_ROUTES = {
    'remplacements': '/remplacements',
    'planning': '/planning',
    'personnel': '/personnel',
    'disponibilites': '/disponibilites',
    'epi': '/epi',
    'actifs': '/actifs',
    'interventions': '/interventions',
    'formations': '/formations',
    'notifications': '/notifications',
    'parametres': '/parametres',
    'dashboard': '/dashboard',
}


def generer_lien_app(
    tenant_slug: str,
    module: str,
    action: Optional[str] = None,
    item_id: Optional[str] = None,
    params: Optional[dict] = None
) -> str:
    """
    Génère un lien intelligent qui fonctionne sur web et mobile.
    
    Sur mobile, ce lien sera intercepté par l'app si installée grâce aux 
    Universal Links (iOS) et App Links (Android).
    
    Args:
        tenant_slug: Le slug du tenant (ex: "caserne-123")
        module: Le module cible (ex: "remplacements", "planning", "epi")
        action: Action optionnelle (ex: "voir", "accepter", "refuser")
        item_id: ID optionnel de l'élément (ex: ID de demande de remplacement)
        params: Paramètres additionnels en query string
    
    Returns:
        URL complète qui fonctionne sur web et sera interceptée sur mobile
    
    Examples:
        >>> generer_lien_app("caserne-123", "remplacements")
        'https://www.profiremanager.ca/caserne-123/remplacements'
        
        >>> generer_lien_app("caserne-123", "remplacements", item_id="abc-123")
        'https://www.profiremanager.ca/caserne-123/remplacements?id=abc-123'
        
        >>> generer_lien_app("caserne-123", "planning", params={"date": "2026-03-01"})
        'https://www.profiremanager.ca/caserne-123/planning?date=2026-03-01'
    """
    base_url = os.environ.get('FRONTEND_URL', FRONTEND_URL)
    
    # Construire le chemin
    route = MODULE_ROUTES.get(module, f'/{module}')
    path = f"/{tenant_slug}{route}"
    
    # Ajouter l'action si présente
    if action:
        path = f"{path}/{action}"
    
    # Construire les query params
    query_parts = []
    
    if item_id:
        query_parts.append(f"id={item_id}")
    
    if params:
        for key, value in params.items():
            if value is not None:
                query_parts.append(f"{key}={value}")
    
    # Assembler l'URL finale
    url = f"{base_url}{path}"
    if query_parts:
        url = f"{url}?{'&'.join(query_parts)}"
    
    return url


def generer_lien_remplacement(
    tenant_slug: str,
    demande_id: str,
    tab: str = "mes-demandes"
) -> str:
    """
    Génère un lien vers une demande de remplacement spécifique.
    
    Args:
        tenant_slug: Le slug du tenant
        demande_id: L'ID de la demande de remplacement
        tab: L'onglet à ouvrir ("mes-demandes" ou "demandes-recues")
    
    Returns:
        URL vers la demande de remplacement
    """
    return generer_lien_app(
        tenant_slug=tenant_slug,
        module="remplacements",
        item_id=demande_id,
        params={"tab": tab, "highlight": demande_id}
    )


def generer_lien_planning(
    tenant_slug: str,
    date: Optional[str] = None,
    user_id: Optional[str] = None
) -> str:
    """
    Génère un lien vers le planning.
    
    Args:
        tenant_slug: Le slug du tenant
        date: Date à afficher (format YYYY-MM-DD)
        user_id: ID utilisateur pour filtrer
    
    Returns:
        URL vers le planning
    """
    params = {}
    if date:
        params["date"] = date
    if user_id:
        params["user"] = user_id
    
    return generer_lien_app(
        tenant_slug=tenant_slug,
        module="planning",
        params=params if params else None
    )


def generer_lien_epi(
    tenant_slug: str,
    epi_id: Optional[str] = None,
    user_id: Optional[str] = None
) -> str:
    """
    Génère un lien vers le module EPI.
    """
    params = {}
    if user_id:
        params["user"] = user_id
    
    return generer_lien_app(
        tenant_slug=tenant_slug,
        module="epi",
        item_id=epi_id,
        params=params if params else None
    )


def generer_lien_intervention(
    tenant_slug: str,
    intervention_id: str
) -> str:
    """
    Génère un lien vers une intervention spécifique.
    """
    return generer_lien_app(
        tenant_slug=tenant_slug,
        module="interventions",
        item_id=intervention_id
    )


def generer_lien_notification(
    tenant_slug: str,
    notification_id: Optional[str] = None
) -> str:
    """
    Génère un lien vers les notifications.
    """
    return generer_lien_app(
        tenant_slug=tenant_slug,
        module="notifications",
        item_id=notification_id
    )


def generer_bouton_email(
    url: str,
    texte: str,
    couleur: str = "#dc2626",
    couleur_texte: str = "white"
) -> str:
    """
    Génère le HTML d'un bouton stylé pour les emails.
    
    Args:
        url: L'URL du lien
        texte: Le texte du bouton
        couleur: Couleur de fond du bouton (hex)
        couleur_texte: Couleur du texte (hex ou nom)
    
    Returns:
        HTML du bouton
    """
    return f'''
    <a href="{url}" 
       style="display: inline-block; background-color: {couleur}; color: {couleur_texte}; 
              padding: 15px 30px; text-decoration: none; border-radius: 8px; 
              font-weight: bold; font-size: 16px; text-align: center;
              box-shadow: 0 2px 5px rgba(0,0,0,0.15);">
        {texte}
    </a>
    '''
