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
    tenant_name = tenant.get('nom_service') or tenant.get('nom', 'ProFireManager')
    # Utiliser l'URL courte /pwa/tenant pour une meilleure compatibilité iOS
    manifest = {
        "name": f"{tenant_name} - ProFireManager",
        "short_name": tenant_name[:12] if len(tenant_name) > 12 else tenant_name,
        "description": f"Application de gestion pour {tenant.get('nom', 'le service incendie')}",
        "start_url": f"/pwa/{tenant_slug}",
        "scope": "/",
        "id": f"profiremanager-{tenant_slug}",
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


@pwa_router.get("/{tenant_slug}/pwa-install")
async def get_pwa_install_page(tenant_slug: str):
    """
    Sert une page HTML complète pour l'installation PWA sur iOS.
    Cette page a son propre manifest intégré qui pointe vers le bon tenant.
    C'est la SEULE façon de faire fonctionner les raccourcis iOS correctement.
    """
    from motor.motor_asyncio import AsyncIOMotorClient
    from fastapi.responses import HTMLResponse
    import os
    
    # Connexion MongoDB
    mongo_url = os.environ.get('MONGO_URL')
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get('DB_NAME', 'profiremanager-dev')]
    
    # Récupérer les infos du tenant
    tenant = await db.tenants.find_one({"slug": tenant_slug}, {"_id": 0})
    client.close()
    
    if not tenant:
        return HTMLResponse(content="<h1>Tenant non trouvé</h1>", status_code=404)
    
    tenant_name = tenant.get('nom_service') or tenant.get('nom', tenant_slug.capitalize())
    
    # Générer une page HTML complète avec manifest inline
    html_content = f'''<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="theme-color" content="#DC2626">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="{tenant_name}">
    <link rel="apple-touch-icon" href="/api/{tenant_slug}/pwa/icon-192.png">
    <link rel="manifest" href="/api/{tenant_slug}/manifest.json">
    <title>{tenant_name} - Installation</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            min-height: 100vh;
            background: linear-gradient(135deg, #DC2626 0%, #991b1b 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }}
        .card {{
            background: white;
            border-radius: 20px;
            padding: 2rem;
            max-width: 380px;
            width: 100%;
            text-align: center;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        }}
        .icon {{ font-size: 3.5rem; margin-bottom: 0.5rem; }}
        h1 {{ color: #DC2626; font-size: 1.4rem; margin-bottom: 0.25rem; }}
        h2 {{ color: #374151; font-size: 1.2rem; margin-bottom: 1rem; font-weight: 600; }}
        .instructions {{
            background: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 12px;
            padding: 1rem;
            text-align: left;
            margin-bottom: 1rem;
        }}
        .instructions p {{ color: #92400e; font-size: 0.9rem; font-weight: 600; margin-bottom: 0.5rem; }}
        .instructions ol {{ color: #78350f; font-size: 0.85rem; padding-left: 1.2rem; line-height: 1.7; }}
        .instructions strong {{ color: #92400e; }}
        .btn {{
            width: 100%;
            padding: 1rem;
            background: #DC2626;
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: block;
        }}
        .note {{ color: #9ca3af; font-size: 0.8rem; margin-top: 0.75rem; }}
        .footer {{ color: rgba(255,255,255,0.8); font-size: 0.75rem; margin-top: 1rem; }}
        .footer code {{ background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px; }}
    </style>
</head>
<body>
    <div>
        <div class="card">
            <div class="icon">🚒</div>
            <h1>ProFireManager</h1>
            <h2>{tenant_name}</h2>
            
            <div class="instructions">
                <p>📱 Pour créer un raccourci :</p>
                <ol>
                    <li>Cliquez sur <strong>Partager</strong> (⬆️) en bas</li>
                    <li>Sélectionnez <strong>"Sur l'écran d'accueil"</strong></li>
                    <li>Gardez le nom <strong>"{tenant_name}"</strong></li>
                    <li>Cliquez <strong>Ajouter</strong></li>
                </ol>
            </div>
            
            <a href="/{tenant_slug}/dashboard" class="btn">
                Continuer vers {tenant_name} →
            </a>
            
            <p class="note">Créez d'abord le raccourci, puis cliquez sur "Continuer"</p>
        </div>
        
        <p class="footer">
            💡 Pour une autre caserne : <code>/api/NOM/pwa-install</code>
        </p>
    </div>
    
    <script>
        // Si ouvert depuis un raccourci (mode standalone), rediriger vers le dashboard
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {{
            window.location.href = '/{tenant_slug}/dashboard';
        }}
    </script>
</body>
</html>'''
    
    return HTMLResponse(content=html_content, headers={
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache"
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
