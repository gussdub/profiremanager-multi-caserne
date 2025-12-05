"""
PWA Manifest Generator - Génère un manifest.json dynamique par tenant
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

pwa_router = APIRouter()

@pwa_router.get("/{tenant_slug}/manifest.json")
async def get_pwa_manifest(tenant_slug: str):
    """
    Génère un manifest.json dynamique pour chaque tenant
    Permet à chaque caserne d'avoir sa propre PWA installable
    """
    from motor.motor_asyncio import AsyncIOMotorClient
    import os
    
    # Connexion MongoDB
    mongo_url = os.environ.get('MONGO_URL')
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'profiremanager-dev')]
    
    # Récupérer les infos du tenant
    tenant = await db.tenants.find_one({"slug": tenant_slug}, {"_id": 0})
    
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Générer le manifest avec les infos du tenant
    manifest = {
        "name": tenant.get('nom_service') or tenant.get('nom', 'ProFireManager'),
        "short_name": tenant.get('nom_service') or tenant.get('nom', 'ProFire'),
        "description": f"Application de gestion pour {tenant.get('nom', 'le service incendie')}",
        "start_url": f"/{tenant_slug}",
        "scope": "/",
        "display": "standalone",
        "background_color": "#ffffff",
        "theme_color": "#DC2626",
        "orientation": "portrait-primary",
        "icons": [
            {
                "src": f"/api/{tenant_slug}/pwa/icon-192.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any maskable"
            },
            {
                "src": f"/api/{tenant_slug}/pwa/icon-512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any maskable"
            }
        ],
        "screenshots": [],
        "categories": ["productivity", "utilities"],
        "shortcuts": [
            {
                "name": "Tableau de bord",
                "short_name": "Dashboard",
                "description": "Accéder au tableau de bord",
                "url": f"/{tenant_slug}",
                "icons": [{"src": f"/api/{tenant_slug}/pwa/icon-192.png", "sizes": "192x192"}]
            },
            {
                "name": "Prévention",
                "short_name": "Prévention",
                "description": "Module Prévention",
                "url": f"/{tenant_slug}#prevention",
                "icons": [{"src": f"/api/{tenant_slug}/pwa/icon-192.png", "sizes": "192x192"}]
            }
        ],
        "prefer_related_applications": False
    }
    
    client.close()
    
    return JSONResponse(content=manifest, headers={
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=3600"
    })


@pwa_router.get("/{tenant_slug}/pwa/icon-{size}.png")
async def get_pwa_icon(tenant_slug: str, size: int):
    """
    Génère les icônes PWA à partir du logo du tenant
    """
    from motor.motor_asyncio import AsyncIOMotorClient
    from PIL import Image
    import io
    import base64
    import os
    from fastapi.responses import Response
    
    # Connexion MongoDB
    mongo_url = os.environ.get('MONGO_URL')
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'profiremanager-dev')]
    
    # Récupérer le tenant
    tenant = await db.tenants.find_one({"slug": tenant_slug}, {"_id": 0})
    
    if not tenant:
        client.close()
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Récupérer le logo du tenant
    logo_url = tenant.get('logo_url', '')
    
    client.close()
    
    if logo_url and logo_url.startswith('data:image'):
        try:
            # Extraire les données base64
            header, encoded = logo_url.split(',', 1)
            logo_data = base64.b64decode(encoded)
            
            # Ouvrir l'image avec PIL
            img = Image.open(io.BytesIO(logo_data))
            
            # Convertir en RGBA si nécessaire
            if img.mode != 'RGBA':
                img = img.convert('RGBA')
            
            # Créer une image carrée avec fond blanc
            square_size = max(img.size)
            square_img = Image.new('RGBA', (square_size, square_size), (255, 255, 255, 255))
            
            # Centrer le logo
            offset = ((square_size - img.size[0]) // 2, (square_size - img.size[1]) // 2)
            square_img.paste(img, offset, img if img.mode == 'RGBA' else None)
            
            # Redimensionner à la taille demandée
            resized = square_img.resize((size, size), Image.LANCZOS)
            
            # Convertir en PNG
            output = io.BytesIO()
            resized.save(output, format='PNG')
            output.seek(0)
            
            return Response(content=output.read(), media_type="image/png", headers={
                "Cache-Control": "public, max-age=86400"
            })
            
        except Exception as e:
            print(f"Erreur génération icône: {e}")
    
    # Fallback: icône par défaut
    # Créer une icône simple avec les initiales du tenant
    img = Image.new('RGBA', (size, size), (220, 38, 38, 255))
    
    output = io.BytesIO()
    img.save(output, format='PNG')
    output.seek(0)
    
    return Response(content=output.read(), media_type="image/png", headers={
        "Cache-Control": "public, max-age=86400"
    })
