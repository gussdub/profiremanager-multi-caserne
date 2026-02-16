"""
Routes API pour l'export de cartes statiques
=============================================

Ce module génère des images de carte statique avec les points d'eau
pour l'export PDF.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from typing import List, Optional, Dict
from pydantic import BaseModel
import io
import base64
import logging
import httpx
from PIL import Image

from staticmap import StaticMap, CircleMarker, IconMarker

from routes.dependencies import (
    get_current_user,
    get_tenant_from_slug,
    User
)

router = APIRouter(tags=["Export Map"])
logger = logging.getLogger(__name__)

# URLs des icônes pour chaque type de point d'eau
ICON_URLS = {
    'borne_fontaine': 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/opwhu1ma_Borne%20fontaine.png',
    'borne_seche': 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/wkhxcmid_Borne%20seche.png',
    'point_eau_statique': 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/1nhnxx97_eau.png'
}

# Cache pour les icônes téléchargées (chemins de fichiers temporaires)
_icon_cache: Dict[str, str] = {}


class PointEauMarker(BaseModel):
    """Point d'eau à afficher sur la carte"""
    latitude: float
    longitude: float
    etat: Optional[str] = None
    numero_identification: Optional[str] = None
    type: Optional[str] = None


class MapGenerationRequest(BaseModel):
    """Requête pour générer une carte"""
    points: List[PointEauMarker]
    width: int = 800
    height: int = 600


def get_marker_color(etat: Optional[str]) -> str:
    """Retourne la couleur du marqueur selon l'état"""
    if etat == 'fonctionnelle':
        return '#10b981'  # Vert
    elif etat == 'en_reparation' or etat == 'attention':
        return '#f59e0b'  # Orange
    elif etat == 'hors_service':
        return '#ef4444'  # Rouge
    return '#6b7280'  # Gris par défaut


async def get_icon_image(point_type: str) -> Optional[str]:
    """Télécharge et met en cache l'icône pour un type de point d'eau. Retourne le chemin du fichier temporaire."""
    global _icon_cache
    
    if point_type in _icon_cache:
        return _icon_cache[point_type]
    
    url = ICON_URLS.get(point_type, ICON_URLS['point_eau_statique'])
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10)
            if response.status_code == 200:
                # Sauvegarder dans un fichier temporaire
                import tempfile
                import os
                
                # Créer un fichier temporaire persistant
                fd, temp_path = tempfile.mkstemp(suffix='.png')
                
                # Redimensionner l'icône
                img = Image.open(io.BytesIO(response.content))
                img = img.resize((32, 32), Image.Resampling.LANCZOS)
                if img.mode != 'RGBA':
                    img = img.convert('RGBA')
                
                # Sauvegarder dans le fichier temporaire
                img.save(temp_path, format='PNG')
                os.close(fd)
                
                _icon_cache[point_type] = temp_path
                return temp_path
    except Exception as e:
        logger.warning(f"[EXPORT MAP] Impossible de télécharger l'icône {point_type}: {e}")
    
    return None


@router.post("/{tenant_slug}/export/map-image")
async def generate_map_image(
    tenant_slug: str,
    request: MapGenerationRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Génère une image PNG de carte statique avec les points d'eau.
    Retourne l'image encodée en base64.
    """
    await get_tenant_from_slug(tenant_slug)
    
    if not request.points:
        raise HTTPException(status_code=400, detail="Aucun point à afficher")
    
    try:
        # Créer la carte statique
        m = StaticMap(request.width, request.height, url_template='https://a.tile.openstreetmap.org/{z}/{x}/{y}.png')
        
        # Pré-télécharger toutes les icônes uniques
        unique_types = set(p.type or 'point_eau_statique' for p in request.points if p.latitude and p.longitude)
        icons = {}
        for point_type in unique_types:
            icon = await get_icon_image(point_type)
            if icon:
                icons[point_type] = icon
        
        # Ajouter tous les marqueurs
        for point in request.points:
            if point.latitude and point.longitude:
                point_type = point.type or 'point_eau_statique'
                color = get_marker_color(point.etat)
                
                # Essayer d'utiliser l'icône personnalisée
                if point_type in icons:
                    # D'abord ajouter l'icône
                    icon_marker = IconMarker(
                        (point.longitude, point.latitude),
                        icons[point_type],
                        16, 16  # offset x, y (centre de l'icône)
                    )
                    m.add_marker(icon_marker)
                    
                    # Ensuite ajouter le badge coloré (directement sous l'icône)
                    outer_badge = CircleMarker(
                        (point.longitude + 0.00004, point.latitude - 0.00018),
                        'white',
                        10
                    )
                    m.add_marker(outer_badge)
                    inner_badge = CircleMarker(
                        (point.longitude + 0.00004, point.latitude - 0.00018),
                        color,
                        7
                    )
                    m.add_marker(inner_badge)
                else:
                    # Fallback: marqueur circulaire coloré
                    outer_marker = CircleMarker(
                        (point.longitude, point.latitude),
                        'white',
                        18
                    )
                    m.add_marker(outer_marker)
                    inner_marker = CircleMarker(
                        (point.longitude, point.latitude),
                        color,
                        14
                    )
                    m.add_marker(inner_marker)
        
        # Rendre la carte avec zoom automatique
        image = m.render()
        
        # Convertir en bytes PNG
        img_buffer = io.BytesIO()
        image.save(img_buffer, format='PNG', quality=90)
        img_buffer.seek(0)
        
        # Encoder en base64
        img_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
        
        logger.info(f"[EXPORT MAP] Carte générée avec {len(request.points)} points et icônes pour {tenant_slug}")
        
        return {
            "success": True,
            "image_base64": img_base64,
            "content_type": "image/png",
            "points_count": len(request.points)
        }
        
    except Exception as e:
        logger.error(f"[EXPORT MAP] Erreur génération carte: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération de la carte: {str(e)}")
