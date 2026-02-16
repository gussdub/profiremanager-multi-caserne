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
from PIL import Image, ImageDraw

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
    type: Optional[str] = None  # borne_fontaine, borne_seche, point_eau_statique


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


def hex_to_rgb(hex_color: str) -> tuple:
    """Convertit une couleur hex en RGB"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def draw_water_marker(draw: ImageDraw, x: int, y: int, color: str, size: int = 24):
    """
    Dessine un marqueur de point d'eau personnalisé (goutte d'eau avec icône)
    """
    rgb = hex_to_rgb(color)
    
    # Dessiner le contour blanc (ombre)
    draw.ellipse([x - size//2 - 2, y - size//2 - 2, x + size//2 + 2, y + size//2 + 2], 
                 fill='white', outline='white')
    
    # Dessiner le cercle principal coloré
    draw.ellipse([x - size//2, y - size//2, x + size//2, y + size//2], 
                 fill=rgb, outline='white', width=2)
    
    # Dessiner une petite goutte d'eau au centre (symbole simplifié)
    drop_size = size // 3
    # Triangle du haut de la goutte
    draw.polygon([
        (x, y - drop_size),  # Pointe
        (x - drop_size//2, y),  # Bas gauche
        (x + drop_size//2, y)   # Bas droite
    ], fill='white')
    # Cercle du bas de la goutte
    draw.ellipse([x - drop_size//2, y - drop_size//4, x + drop_size//2, y + drop_size//2], 
                 fill='white')


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
        # Créer la carte statique (sans marqueurs pour l'instant)
        m = StaticMap(request.width, request.height, url_template='https://a.tile.openstreetmap.org/{z}/{x}/{y}.png')
        
        # Ajouter des marqueurs invisibles pour que la carte calcule le bon zoom et centre
        for point in request.points:
            if point.latitude and point.longitude:
                # Marqueur très petit juste pour le calcul de bounds
                marker = CircleMarker(
                    (point.longitude, point.latitude),
                    'transparent',
                    1
                )
                m.add_marker(marker)
        
        # Rendre la carte de base
        image = m.render()
        
        # Convertir en mode RGBA pour pouvoir dessiner dessus
        image = image.convert('RGBA')
        draw = ImageDraw.Draw(image)
        
        # Dessiner nos marqueurs personnalisés sur l'image
        for point in request.points:
            if point.latitude and point.longitude:
                # Calculer la position en pixels sur l'image
                # La méthode _x_to_px et _y_to_px de staticmap fait ça
                px_x = m._x_to_px(m._lon_to_x(point.longitude, m.zoom))
                px_y = m._y_to_px(m._lat_to_y(point.latitude, m.zoom))
                
                color = get_marker_color(point.etat)
                draw_water_marker(draw, int(px_x), int(px_y), color, size=28)
        
        # Convertir en RGB pour le PNG final
        image = image.convert('RGB')
        
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
