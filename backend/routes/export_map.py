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
import httpx

from staticmap import StaticMap, CircleMarker, IconMarker
from PIL import Image, ImageDraw

from routes.dependencies import (
    get_current_user,
    get_tenant_from_slug,
    User
)

router = APIRouter(tags=["Export Map"])
logger = logging.getLogger(__name__)

# URLs des icônes de points d'eau
ICON_URLS = {
    'borne_fontaine': 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/opwhu1ma_Borne%20fontaine.png',
    'borne_seche': 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/wkhxcmid_Borne%20seche.png',
    'point_eau_statique': 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/1nhnxx97_eau.png'
}

# Cache pour les icônes téléchargées
_icon_cache = {}


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


async def get_icon_image(icon_type: str) -> Image.Image:
    """Télécharge et met en cache l'icône du type de point d'eau"""
    if icon_type in _icon_cache:
        return _icon_cache[icon_type].copy()
    
    url = ICON_URLS.get(icon_type, ICON_URLS['point_eau_statique'])
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            if response.status_code == 200:
                icon_img = Image.open(io.BytesIO(response.content))
                # Redimensionner l'icône à 32x32
                icon_img = icon_img.resize((32, 32), Image.Resampling.LANCZOS)
                icon_img = icon_img.convert('RGBA')
                _icon_cache[icon_type] = icon_img
                return icon_img.copy()
    except Exception as e:
        logger.warning(f"Impossible de télécharger l'icône {icon_type}: {e}")
    
    return None


def draw_marker_with_badge(image: Image.Image, x: int, y: int, icon: Image.Image, color: str):
    """Dessine l'icône du point d'eau avec un badge coloré indiquant l'état"""
    if icon is None:
        return
    
    # Position de l'icône (centrée sur le point)
    icon_x = x - icon.width // 2
    icon_y = y - icon.height // 2
    
    # Dessiner un fond blanc circulaire derrière l'icône pour la visibilité
    draw = ImageDraw.Draw(image)
    padding = 4
    draw.ellipse([
        icon_x - padding, 
        icon_y - padding, 
        icon_x + icon.width + padding, 
        icon_y + icon.height + padding
    ], fill='white', outline='white')
    
    # Coller l'icône
    image.paste(icon, (icon_x, icon_y), icon)
    
    # Dessiner le badge d'état (petit cercle coloré en bas à droite)
    badge_size = 12
    badge_x = x + icon.width // 2 - badge_size // 2
    badge_y = y + icon.height // 2 - badge_size // 2
    
    rgb = hex_to_rgb(color)
    draw.ellipse([
        badge_x - 1, badge_y - 1,
        badge_x + badge_size + 1, badge_y + badge_size + 1
    ], fill='white')
    draw.ellipse([
        badge_x, badge_y,
        badge_x + badge_size, badge_y + badge_size
    ], fill=rgb, outline='white', width=1)


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
        # Pré-charger les icônes nécessaires
        icon_types = set(p.type or 'point_eau_statique' for p in request.points)
        icons = {}
        for icon_type in icon_types:
            icons[icon_type] = await get_icon_image(icon_type)
        
        # Créer la carte statique
        m = StaticMap(request.width, request.height, url_template='https://a.tile.openstreetmap.org/{z}/{x}/{y}.png')
        
        # Ajouter des marqueurs invisibles pour calculer le zoom et le centre
        for point in request.points:
            if point.latitude and point.longitude:
                marker = CircleMarker(
                    (point.longitude, point.latitude),
                    'transparent',
                    1
                )
                m.add_marker(marker)
        
        # Rendre la carte de base
        image = m.render()
        image = image.convert('RGBA')
        
        # Dessiner les marqueurs personnalisés avec les icônes
        for point in request.points:
            if point.latitude and point.longitude:
                px_x = m._x_to_px(m._lon_to_x(point.longitude, m.zoom))
                px_y = m._y_to_px(m._lat_to_y(point.latitude, m.zoom))
                
                icon_type = point.type or 'point_eau_statique'
                icon = icons.get(icon_type)
                color = get_marker_color(point.etat)
                
                draw_marker_with_badge(image, int(px_x), int(px_y), icon, color)
        
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
        
        # Ajouter des marqueurs pour le calcul de bounds
        for point in request.points:
            if point.latitude and point.longitude:
                marker = CircleMarker(
                    (point.longitude, point.latitude),
                    'transparent',
                    1
                )
                m.add_marker(marker)
        
        # Rendre la carte
        image = m.render()
        
        # Dessiner les marqueurs personnalisés
        image = image.convert('RGBA')
        draw = ImageDraw.Draw(image)
        
        for point in request.points:
            if point.latitude and point.longitude:
                px_x = m._x_to_px(m._lon_to_x(point.longitude, m.zoom))
                px_y = m._y_to_px(m._lat_to_y(point.latitude, m.zoom))
                color = get_marker_color(point.etat)
                draw_water_marker(draw, int(px_x), int(px_y), color, size=28)
        
        image = image.convert('RGB')
        
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
