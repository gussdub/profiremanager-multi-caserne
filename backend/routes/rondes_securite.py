"""
Routes API pour le module Rondes de Sécurité
============================================

STATUT: ACTIF
Ce module gère les rondes de sécurité SAAQ des véhicules.

Routes principales:
- POST   /{tenant_slug}/actifs/rondes-securite                          - Créer une ronde
- GET    /{tenant_slug}/actifs/rondes-securite                          - Liste des rondes
- GET    /{tenant_slug}/actifs/rondes-securite/{vehicule_id}            - Rondes d'un véhicule
- GET    /{tenant_slug}/actifs/rondes-securite/{id}/pdf                 - Export PDF d'une ronde
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
import uuid
import logging
import os
import base64
from io import BytesIO

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Rondes de Sécurité"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES PYDANTIC ====================

class ContreSignature(BaseModel):
    """Contre-signature d'une ronde par un 2e conducteur"""
    nom_conducteur: str
    prenom_conducteur: str
    signature: str  # Base64 data URL
    date_contre_signature: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: Optional[str] = None


class RondeSecuriteCreate(BaseModel):
    vehicule_id: str
    date: str
    heure: str
    lieu: str
    position_gps: Optional[List[float]] = None  # [latitude, longitude]
    km: int
    personne_mandatee: str  # Nom complet de la personne qui effectue la ronde
    defectuosites: Optional[str] = ""
    points_verification: Dict[str, str]  # { "attelage": "conforme", "chassis_carrosserie": "defectueux", ... }
    signature_mandatee: str  # Base64 data URL


class RondeSecurite(BaseModel):
    id: str = Field(default_factory=lambda: f"ronde_{str(uuid.uuid4())[:12]}")
    tenant_id: str
    vehicule_id: str
    date: str
    heure: str
    lieu: str
    position_gps: Optional[List[float]] = None
    km: int
    personne_mandatee: str
    defectuosites: Optional[str] = ""
    points_verification: Dict[str, str]
    signature_mandatee: str
    contre_signatures: List[ContreSignature] = []
    created_by: str  # User ID
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ContreSignatureCreate(BaseModel):
    nom_conducteur: str
    prenom_conducteur: str
    signature: str
    raison_refus: Optional[str] = None


# ==================== FONCTIONS HELPER ====================

async def send_ronde_email_background(tenant, ronde_id: str, vehicle: dict, recipient_emails: list):
    """
    Fonction helper pour envoyer l'email de ronde en arrière-plan via Resend
    """
    try:
        import resend
        
        # Récupérer la ronde
        ronde = await db.rondes_securite.find_one(
            {"id": ronde_id, "tenant_id": tenant.id},
            {"_id": 0}
        )
        
        if not ronde:
            logger.error(f"❌ Ronde {ronde_id} non trouvée pour envoi email")
            return
        
        # Configurer Resend
        resend_api_key = os.environ.get('RESEND_API_KEY')
        if not resend_api_key:
            logger.error("❌ RESEND_API_KEY non configurée")
            return
        
        resend.api_key = resend_api_key
        
        nom_service = tenant.nom_service if hasattr(tenant, 'nom_service') and tenant.nom_service else tenant.nom
        
        # Formater la date en heure locale (Canada EST = UTC-5)
        date_ronde_raw = ronde["date"]
        try:
            # Parser la date ISO et convertir en heure locale Canada (UTC-5)
            dt = datetime.fromisoformat(date_ronde_raw.replace('Z', '+00:00'))
            # Convertir en heure locale du Canada (EST = UTC-5)
            dt_local = dt - timedelta(hours=5)
            date_ronde_str = dt_local.strftime('%Y-%m-%d')
        except Exception as e:
            # En cas d'erreur, utiliser la date brute
            date_ronde_str = date_ronde_raw[:10] if len(date_ronde_raw) >= 10 else date_ronde_raw
        
        # Si la ronde a une position GPS, récupérer l'adresse via reverse geocoding
        lieu_display = ronde.get('lieu', 'N/A')
        if ronde.get('position_gps') and len(ronde.get('position_gps', [])) == 2:
            try:
                import httpx
                latitude, longitude = ronde['position_gps']
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        f"https://nominatim.openstreetmap.org/reverse",
                        params={
                            "lat": latitude,
                            "lon": longitude,
                            "format": "json"
                        },
                        headers={"User-Agent": "ProFireManager/1.0"}
                    )
                    if response.status_code == 200:
                        data = response.json()
                        address = data.get('address', {})
                        road = address.get('road', '')
                        city = address.get('city', address.get('town', address.get('village', '')))
                        if road and city:
                            lieu_display = f"{road}, {city}"
                        elif road:
                            lieu_display = road
            except Exception as e:
                logger.warning(f"⚠️ Erreur geocoding pour ronde email: {e}")
        
        # Construire le contenu de l'email
        defectuosites_html = ""
        if ronde.get('defectuosites'):
            defectuosites_html = f"""
            <div style="background-color: #FEF2F2; border: 1px solid #EF4444; border-radius: 8px; padding: 15px; margin-top: 15px;">
                <h3 style="color: #DC2626; margin: 0 0 10px 0;">⚠️ Défectuosités signalées</h3>
                <p style="margin: 0; color: #374151;">{ronde['defectuosites']}</p>
            </div>
            """
        
        # Points de vérification
        points_html = ""
        if ronde.get('points_verification'):
            points_list = ""
            for point, status in ronde['points_verification'].items():
                color = "#10B981" if status == "conforme" else "#EF4444"
                icon = "✅" if status == "conforme" else "❌"
                point_label = point.replace("_", " ").title()
                points_list += f'<li style="color: {color};">{icon} {point_label}: {status}</li>'
            
            points_html = f"""
            <div style="margin-top: 15px;">
                <h3 style="color: #1F2937; margin-bottom: 10px;">Points de vérification</h3>
                <ul style="list-style: none; padding: 0; margin: 0;">{points_list}</ul>
            </div>
            """
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
            <div style="background-color: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="color: #1e3a5f; margin: 0;">🔧 Ronde de Sécurité SAAQ</h1>
                    <p style="color: #6B7280; margin: 5px 0 0 0;">{nom_service}</p>
                </div>
                
                <div style="background-color: #F3F4F6; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 5px 0; color: #6B7280;">Véhicule:</td>
                            <td style="padding: 5px 0; color: #1F2937; font-weight: bold;">{vehicle.get('nom', 'N/A')} ({vehicle.get('type_vehicule', 'N/A')})</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #6B7280;">Date:</td>
                            <td style="padding: 5px 0; color: #1F2937;">{date_ronde_str}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #6B7280;">Heure:</td>
                            <td style="padding: 5px 0; color: #1F2937;">{ronde.get('heure', 'N/A')}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #6B7280;">Lieu:</td>
                            <td style="padding: 5px 0; color: #1F2937;">{lieu_display}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #6B7280;">Kilométrage:</td>
                            <td style="padding: 5px 0; color: #1F2937;">{ronde.get('km', 'N/A')} km</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px 0; color: #6B7280;">Effectuée par:</td>
                            <td style="padding: 5px 0; color: #1F2937;">{ronde.get('personne_mandatee', 'N/A')}</td>
                        </tr>
                    </table>
                </div>
                
                {points_html}
                {defectuosites_html}
                
                <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;">
                
                <p style="font-size: 12px; color: #9CA3AF; text-align: center; margin: 0;">
                    Ce message a été envoyé automatiquement par ProFireManager.<br>
                    Ronde ID: {ronde_id}
                </p>
            </div>
        </body>
        </html>
        """
        
        # Envoyer l'email
        params = {
            "from": f"{nom_service} <rondes@profiremanager.ca>",
            "to": recipient_emails,
            "subject": f"🔧 Ronde de Sécurité - {vehicle.get('nom', 'Véhicule')} - {date_ronde_str}",
            "html": html_content
        }
        
        response = resend.Emails.send(params)
        logger.info(f"✅ Email ronde envoyé avec succès - ID: {response.get('id', 'N/A')}")
        
    except Exception as e:
        logger.error(f"❌ Erreur envoi email ronde: {e}", exc_info=True)


# ==================== ROUTES API ====================

@router.post("/{tenant_slug}/actifs/rondes-securite")
async def create_ronde_securite(
    tenant_slug: str,
    ronde_data: RondeSecuriteCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle ronde de sécurité SAAQ"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que le véhicule existe
    vehicule = await db.vehicules.find_one(
        {"id": ronde_data.vehicule_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not vehicule:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    # Créer la ronde
    ronde = RondeSecurite(
        tenant_id=tenant.id,
        vehicule_id=ronde_data.vehicule_id,
        date=ronde_data.date,
        heure=ronde_data.heure,
        lieu=ronde_data.lieu,
        position_gps=ronde_data.position_gps,
        km=ronde_data.km,
        personne_mandatee=ronde_data.personne_mandatee,
        defectuosites=ronde_data.defectuosites,
        points_verification=ronde_data.points_verification,
        signature_mandatee=ronde_data.signature_mandatee,
        created_by=current_user.id
    )
    
    await db.rondes_securite.insert_one(ronde.dict())
    
    # Mettre à jour le kilométrage du véhicule si supérieur
    if ronde_data.km > vehicule.get('kilometrage', 0):
        await db.vehicules.update_one(
            {"id": ronde_data.vehicule_id},
            {"$set": {"kilometrage": ronde_data.km}}
        )
    
    # Récupérer les emails de notification depuis les paramètres du tenant
    parametres = tenant.parametres if hasattr(tenant, 'parametres') and tenant.parametres else {}
    actifs_params = parametres.get('actifs', {})
    emails_rondes = actifs_params.get('emails_rondes', [])
    
    # Convertir les IDs utilisateurs en emails si nécessaire
    recipient_emails = []
    for item in emails_rondes:
        if '@' in str(item):
            recipient_emails.append(item)
        else:
            # C'est un user ID, récupérer l'email
            user = await db.users.find_one({"id": item, "tenant_id": tenant.id}, {"email": 1})
            if user and user.get('email'):
                recipient_emails.append(user['email'])
    
    if recipient_emails:
        # Envoyer l'email en background
        import asyncio
        asyncio.create_task(send_ronde_email_background(tenant, ronde.id, vehicule, recipient_emails))
    
    return {
        "message": "Ronde de sécurité enregistrée avec succès",
        "id": ronde.id,
        "vehicule": vehicule.get('nom', 'N/A')
    }


@router.get("/{tenant_slug}/actifs/rondes-securite")
async def get_rondes_securite(
    tenant_slug: str,
    vehicule_id: Optional[str] = None,
    date_debut: Optional[str] = None,
    date_fin: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer la liste des rondes de sécurité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {"tenant_id": tenant.id}
    
    if vehicule_id:
        query["vehicule_id"] = vehicule_id
    
    if date_debut and date_fin:
        query["date"] = {"$gte": date_debut, "$lte": date_fin}
    elif date_debut:
        query["date"] = {"$gte": date_debut}
    elif date_fin:
        query["date"] = {"$lte": date_fin}
    
    rondes = await db.rondes_securite.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    # Enrichir avec les infos véhicule
    vehicules_ids = list(set([r['vehicule_id'] for r in rondes]))
    vehicules = await db.vehicules.find(
        {"id": {"$in": vehicules_ids}, "tenant_id": tenant.id},
        {"_id": 0, "id": 1, "nom": 1, "type_vehicule": 1}
    ).to_list(1000)
    vehicules_map = {v['id']: v for v in vehicules}
    
    for ronde in rondes:
        v = vehicules_map.get(ronde['vehicule_id'], {})
        ronde['vehicule_nom'] = v.get('nom', 'N/A')
        ronde['vehicule_type'] = v.get('type_vehicule', 'N/A')
    
    return rondes


@router.get("/{tenant_slug}/actifs/rondes-securite/vehicule/{vehicule_id}")
async def get_rondes_vehicule(
    tenant_slug: str,
    vehicule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les rondes d'un véhicule spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    rondes = await db.rondes_securite.find(
        {"vehicule_id": vehicule_id, "tenant_id": tenant.id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return rondes


@router.get("/{tenant_slug}/actifs/rondes-securite/{ronde_id}/export-pdf")
async def get_ronde_pdf(
    tenant_slug: str,
    ronde_id: str,
    current_user: User = Depends(get_current_user)
):
    """Générer un PDF pour une ronde de sécurité"""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
        from reportlab.lib import colors
        from reportlab.lib.units import inch
        
        tenant = await get_tenant_from_slug(tenant_slug)
        
        # Récupérer la ronde
        ronde = await db.rondes_securite.find_one(
            {"id": ronde_id, "tenant_id": tenant.id},
            {"_id": 0}
        )
        
        if not ronde:
            raise HTTPException(status_code=404, detail="Ronde non trouvée")
        
        # Récupérer le véhicule
        vehicule = await db.vehicules.find_one(
            {"id": ronde['vehicule_id'], "tenant_id": tenant.id},
            {"_id": 0}
        )
        
        if not vehicule:
            raise HTTPException(status_code=404, detail="Véhicule non trouvé")
        
        # Import des helpers PDF depuis server
        import server
        get_modern_pdf_styles = server.get_modern_pdf_styles
        create_pdf_footer_text = server.create_pdf_footer_text
        
        # Créer le PDF
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch)
        elements = []
        
        # Header avec logo
        if hasattr(tenant, 'logo_url') and tenant.logo_url:
            try:
                if tenant.logo_url.startswith('data:image/'):
                    header_logo, encoded = tenant.logo_url.split(',', 1)
                    logo_data = base64.b64decode(encoded)
                    logo_buffer = BytesIO(logo_data)
                    
                    from PIL import Image as PILImage
                    pil_image = PILImage.open(logo_buffer)
                    img_width, img_height = pil_image.size
                    
                    target_width = 1 * inch
                    aspect_ratio = img_height / img_width
                    target_height = target_width * aspect_ratio
                    
                    logo_buffer.seek(0)
                    logo = RLImage(logo_buffer, width=target_width, height=target_height)
                    logo.hAlign = 'CENTER'
                    elements.append(logo)
                    elements.append(Spacer(1, 0.05*inch))
            except Exception as e:
                logger.error(f"Erreur chargement logo: {e}")
        
        # Nom du service
        nom_service = tenant.nom_service if hasattr(tenant, 'nom_service') and tenant.nom_service else tenant.nom
        header_style_compact = ParagraphStyle(
            'ServiceHeaderCompact',
            fontSize=10,
            textColor=colors.HexColor('#1f2937'),
            spaceAfter=6,
            alignment=TA_CENTER
        )
        elements.append(Paragraph(nom_service, header_style_compact))
        elements.append(Spacer(1, 0.05*inch))
        
        styles = getSampleStyleSheet()
        modern_styles = get_modern_pdf_styles(styles)
        
        # Styles personnalisés
        title_style = ParagraphStyle(
            'CustomTitle',
            fontSize=13,
            textColor=modern_styles['primary_color'],
            spaceAfter=4,
            alignment=TA_CENTER
        )
        
        subtitle_style = ParagraphStyle(
            'Subtitle',
            fontSize=8,
            textColor=modern_styles['secondary_color'],
            spaceAfter=6,
            alignment=TA_CENTER
        )
        
        section_style = ParagraphStyle(
            'Section',
            fontSize=9,
            textColor=modern_styles['primary_color'],
            spaceBefore=4,
            spaceAfter=3
        )
        
        # Titre
        elements.append(Paragraph("🔧 Ronde de Sécurité SAAQ", title_style))
        
        # Date et lieu
        date_ronde = datetime.strptime(ronde["date"], "%Y-%m-%d")
        info_text = f"Date: {date_ronde.strftime('%d/%m/%Y')} • Heure: {ronde['heure']} • Lieu: {ronde['lieu']}"
        elements.append(Paragraph(info_text, subtitle_style))
        
        # Informations du véhicule
        elements.append(Paragraph("📋 Informations du véhicule", section_style))
        vehicule_data = [
            ['Type', 'N° Plaque', 'Marque', 'Année', 'KM'],
            [
                vehicule.get('type_vehicule', 'N/A'),
                vehicule.get('nom', 'N/A'),
                vehicule.get('marque', 'N/A'),
                str(vehicule.get('annee', 'N/A')),
                f"{ronde['km']} km"
            ]
        ]
        
        vehicule_table = Table(vehicule_data, colWidths=[1.3*inch, 1.3*inch, 1.3*inch, 0.8*inch, 1*inch])
        vehicule_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), modern_styles['primary_color']),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
            ('TOPPADDING', (0, 0), (-1, 0), 4),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
        ]))
        elements.append(vehicule_table)
        elements.append(Spacer(1, 0.1*inch))
        
        # Points de vérification
        elements.append(Paragraph("🔍 Points de vérification", section_style))
        
        points_data = [['Point de vérification', 'État']]
        for point, status in ronde.get('points_verification', {}).items():
            point_label = point.replace('_', ' ').title()
            status_icon = "✅" if status == "conforme" else "❌"
            points_data.append([point_label, f"{status_icon} {status}"])
        
        points_table = Table(points_data, colWidths=[4*inch, 2*inch])
        points_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), modern_styles['primary_color']),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')])
        ]))
        elements.append(points_table)
        
        # Défectuosités
        if ronde.get('defectuosites'):
            elements.append(Spacer(1, 0.1*inch))
            elements.append(Paragraph("⚠️ Défectuosités signalées", section_style))
            defect_style = ParagraphStyle('Defect', fontSize=8, textColor=colors.HexColor('#DC2626'))
            elements.append(Paragraph(ronde['defectuosites'], defect_style))
        
        # Personne mandatée
        elements.append(Spacer(1, 0.1*inch))
        elements.append(Paragraph(f"👤 Personne mandatée: {ronde['personne_mandatee']}", section_style))
        
        # Signature
        elements.append(Spacer(1, 0.06*inch))
        elements.append(Paragraph("✍️ Signature de la personne mandatée", section_style))
        
        try:
            sig_data = ronde['signature_mandatee']
            if sig_data and sig_data.startswith('data:image'):
                sig_base64 = sig_data.split(',')[1]
                sig_bytes = base64.b64decode(sig_base64)
                sig_buffer = BytesIO(sig_bytes)
                sig_image = RLImage(sig_buffer, width=2*inch, height=0.65*inch)
                elements.append(sig_image)
        except Exception as e:
            sig_error = ParagraphStyle('SigError', parent=styles['Normal'], fontSize=7)
            elements.append(Paragraph("<i>Signature non disponible</i>", sig_error))
        
        # Footer
        elements.append(Spacer(1, 0.05*inch))
        footer_style = ParagraphStyle(
            'Footer',
            fontSize=5,
            textColor=colors.grey,
            alignment=TA_CENTER,
            spaceAfter=0
        )
        footer_text = create_pdf_footer_text(tenant)
        if footer_text:
            elements.append(Paragraph(footer_text, footer_style))
        
        # Générer le PDF
        doc.build(elements)
        buffer.seek(0)
        
        filename = f"ronde_securite_{vehicule.get('nom', 'vehicule')}_{ronde['date']}.pdf"
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur génération PDF: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération du PDF: {str(e)}")
