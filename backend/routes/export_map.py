"""
Routes API pour l'export de cartes statiques
=============================================

Ce module génère des images de carte statique avec les points d'eau
pour l'export PDF.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from typing import List, Optional
from pydantic import BaseModel
import io
import base64
import logging

from staticmap import StaticMap, CircleMarker

from routes.dependencies import (
    get_current_user,
    get_tenant_from_slug,
    User
)

router = APIRouter(tags=["Export Map"])
logger = logging.getLogger(__name__)


class PointEauMarker(BaseModel):
    """Point d'eau à afficher sur la carte"""
    latitude: float
    longitude: float
    etat: Optional[str] = None
    numero_identification: Optional[str] = None


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
        
        # Ajouter tous les marqueurs
        for point in request.points:
            if point.latitude and point.longitude:
                color = get_marker_color(point.etat)
                marker = CircleMarker(
                    (point.longitude, point.latitude),  # Note: lon, lat order for staticmap
                    color,
                    12  # Rayon du marqueur
                )
                m.add_marker(marker)
        
        # Rendre la carte avec zoom automatique
        image = m.render()
        
        # Convertir en bytes PNG
        img_buffer = io.BytesIO()
        image.save(img_buffer, format='PNG', quality=90)
        img_buffer.seek(0)
        
        # Encoder en base64
        img_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
        
        logger.info(f"[EXPORT MAP] Carte générée avec {len(request.points)} points pour {tenant_slug}")
        
        return {
            "success": True,
            "image_base64": img_base64,
            "content_type": "image/png",
            "points_count": len(request.points)
        }
        
    except Exception as e:
        logger.error(f"[EXPORT MAP] Erreur génération carte: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération de la carte: {str(e)}")


@router.post("/{tenant_slug}/export/map-image-raw")
async def generate_map_image_raw(
    tenant_slug: str,
    request: MapGenerationRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Génère une image PNG de carte statique et la retourne directement (sans base64).
    """
    await get_tenant_from_slug(tenant_slug)
    
    if not request.points:
        raise HTTPException(status_code=400, detail="Aucun point à afficher")
    
    try:
        # Créer la carte statique
        m = StaticMap(request.width, request.height, url_template='https://a.tile.openstreetmap.org/{z}/{x}/{y}.png')
        
        # Ajouter tous les marqueurs
        for point in request.points:
            if point.latitude and point.longitude:
                color = get_marker_color(point.etat)
                marker = CircleMarker(
                    (point.longitude, point.latitude),
                    color,
                    12
                )
                m.add_marker(marker)
        
        # Rendre la carte
        image = m.render()
        
        # Convertir en bytes PNG
        img_buffer = io.BytesIO()
        image.save(img_buffer, format='PNG', quality=90)
        img_buffer.seek(0)
        
        return Response(
            content=img_buffer.getvalue(),
            media_type="image/png"
        )
        
    except Exception as e:
        logger.error(f"[EXPORT MAP] Erreur génération carte: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération de la carte: {str(e)}")
