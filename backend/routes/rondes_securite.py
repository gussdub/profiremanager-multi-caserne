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
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import logging
import os
import base64
import asyncio
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

# Points de vérification SAAQ avec défauts prédéfinis (Loi 430)
POINTS_VERIFICATION_SAAQ = {
    "1": {
        "id": "1",
        "label": "Attelage",
        "key": "attelage",
        "defects": [
            {"id": "1.1", "desc": "Jeu excessif dans la sellette ou le crochet d'attelage", "severity": "MAJEUR"},
            {"id": "1.2", "desc": "Fissure visible dans la sellette ou le crochet", "severity": "MAJEUR"},
            {"id": "1.3", "desc": "Mécanisme de verrouillage défectueux", "severity": "MAJEUR"},
            {"id": "1.4", "desc": "Usure anormale des composants", "severity": "MINEUR"}
        ]
    },
    "2": {
        "id": "2",
        "label": "Habitacle (siège conducteur)",
        "key": "habitacle",
        "defects": [
            {"id": "2.1", "desc": "Siège du conducteur mal fixé ou instable", "severity": "MAJEUR"},
            {"id": "2.2", "desc": "Ceinture de sécurité défectueuse ou manquante", "severity": "MAJEUR"},
            {"id": "2.3", "desc": "Mécanisme de réglage du siège défaillant", "severity": "MINEUR"},
            {"id": "2.4", "desc": "Appuie-tête manquant ou mal fixé", "severity": "MINEUR"}
        ]
    },
    "3": {
        "id": "3",
        "label": "Carrosserie",
        "key": "carrosserie",
        "defects": [
            {"id": "3.1", "desc": "Panneau de carrosserie mal fixé", "severity": "MINEUR"},
            {"id": "3.2", "desc": "Porte d'équipement mal fixée ou difficile à ouvrir", "severity": "MINEUR"},
            {"id": "3.3", "desc": "Corrosion importante affectant la structure", "severity": "MAJEUR"},
            {"id": "3.4", "desc": "Élément de carrosserie présentant un risque pour les piétons", "severity": "MAJEUR"}
        ]
    },
    "4": {
        "id": "4",
        "label": "Direction",
        "key": "direction",
        "defects": [
            {"id": "4.1", "desc": "Jeu excessif dans le volant de direction", "severity": "MAJEUR"},
            {"id": "4.2", "desc": "Fuite de liquide de direction assistée", "severity": "MAJEUR"},
            {"id": "4.3", "desc": "Difficulté anormale à tourner le volant", "severity": "MAJEUR"},
            {"id": "4.4", "desc": "Bruit anormal dans la colonne de direction", "severity": "MINEUR"}
        ]
    },
    "5": {
        "id": "5",
        "label": "Éclairage (Phares)",
        "key": "eclairage_phares",
        "defects": [
            {"id": "5.1", "desc": "Un phare brûlé (circulation de jour)", "severity": "MINEUR"},
            {"id": "5.2", "desc": "Aucun phare fonctionnel (circulation de nuit)", "severity": "MAJEUR"},
            {"id": "5.3", "desc": "Phares mal alignés", "severity": "MINEUR"},
            {"id": "5.4", "desc": "Verre de phare brisé ou opaque", "severity": "MINEUR"}
        ]
    },
    "6": {
        "id": "6",
        "label": "Essuie-glaces et lave-glace",
        "key": "essuie_glaces",
        "defects": [
            {"id": "6.1", "desc": "Balai d'essuie-glace manquant ou défectueux", "severity": "MINEUR"},
            {"id": "6.2", "desc": "Système d'essuie-glace ne fonctionne pas", "severity": "MAJEUR"},
            {"id": "6.3", "desc": "Réservoir de lave-glace vide", "severity": "MINEUR"},
            {"id": "6.4", "desc": "Gicleurs de lave-glace bouchés", "severity": "MINEUR"}
        ]
    },
    "7": {
        "id": "7",
        "label": "Matériel d'urgence",
        "key": "materiel_urgence",
        "defects": [
            {"id": "7.1", "desc": "Extincteur vide ou manquant", "severity": "MINEUR"},
            {"id": "7.2", "desc": "Trousse de premiers soins incomplète ou manquante", "severity": "MINEUR"},
            {"id": "7.3", "desc": "Triangles de signalisation manquants", "severity": "MINEUR"},
            {"id": "7.4", "desc": "Lampe de poche non fonctionnelle", "severity": "MINEUR"}
        ]
    },
    "8": {
        "id": "8",
        "label": "Phares et feux",
        "key": "phares_feux",
        "defects": [
            {"id": "8.1", "desc": "Feu de position brûlé", "severity": "MINEUR"},
            {"id": "8.2", "desc": "Aucun feu de freinage (stop) ne fonctionne", "severity": "MAJEUR"},
            {"id": "8.3", "desc": "Feu de recul non fonctionnel", "severity": "MINEUR"},
            {"id": "8.4", "desc": "Clignotant défectueux", "severity": "MINEUR"},
            {"id": "8.5", "desc": "Gyrophare ou feu d'urgence non fonctionnel", "severity": "MINEUR"}
        ]
    },
    "9": {
        "id": "9",
        "label": "Pneus",
        "key": "pneus",
        "defects": [
            {"id": "9.1", "desc": "Coupure profonde ou structure apparente", "severity": "MAJEUR"},
            {"id": "9.2", "desc": "Usure excessive de la bande de roulement", "severity": "MAJEUR"},
            {"id": "9.3", "desc": "Pression inadéquate", "severity": "MINEUR"},
            {"id": "9.4", "desc": "Pneu dépareillé ou non conforme", "severity": "MINEUR"},
            {"id": "9.5", "desc": "Renflement ou déformation du pneu", "severity": "MAJEUR"}
        ]
    },
    "10": {
        "id": "10",
        "label": "Portes et issues",
        "key": "portes_issues",
        "defects": [
            {"id": "10.1", "desc": "Porte ne ferme pas correctement", "severity": "MAJEUR"},
            {"id": "10.2", "desc": "Porte ne s'ouvre pas de l'intérieur", "severity": "MAJEUR"},
            {"id": "10.3", "desc": "Serrure de porte défectueuse", "severity": "MINEUR"},
            {"id": "10.4", "desc": "Issue de secours bloquée ou inaccessible", "severity": "MAJEUR"}
        ]
    },
    "11": {
        "id": "11",
        "label": "Rétroviseurs",
        "key": "retroviseurs",
        "defects": [
            {"id": "11.1", "desc": "Miroir cassé ou fêlé", "severity": "MINEUR"},
            {"id": "11.2", "desc": "Rétroviseur mal fixé ou instable", "severity": "MINEUR"},
            {"id": "11.3", "desc": "Rétroviseur manquant", "severity": "MAJEUR"},
            {"id": "11.4", "desc": "Visibilité insuffisante par les rétroviseurs", "severity": "MINEUR"}
        ]
    },
    "12": {
        "id": "12",
        "label": "Châssis",
        "key": "chassis",
        "defects": [
            {"id": "12.1", "desc": "Élément de structure fissuré", "severity": "MAJEUR"},
            {"id": "12.2", "desc": "Châssis affaissé ou déformé", "severity": "MAJEUR"},
            {"id": "12.3", "desc": "Corrosion importante affectant la structure", "severity": "MAJEUR"},
            {"id": "12.4", "desc": "Boulon ou rivet de châssis manquant", "severity": "MAJEUR"}
        ]
    },
    "13": {
        "id": "13",
        "label": "Suspension",
        "key": "suspension",
        "defects": [
            {"id": "13.1", "desc": "Lame de ressort brisée", "severity": "MAJEUR"},
            {"id": "13.2", "desc": "Fuite d'amortisseur", "severity": "MINEUR"},
            {"id": "13.3", "desc": "Amortisseur inefficace", "severity": "MINEUR"},
            {"id": "13.4", "desc": "Silentbloc usé ou endommagé", "severity": "MINEUR"},
            {"id": "13.5", "desc": "Barre stabilisatrice défectueuse", "severity": "MINEUR"}
        ]
    },
    "14": {
        "id": "14",
        "label": "Système d'échappement",
        "key": "systeme_echappement",
        "defects": [
            {"id": "14.1", "desc": "Fuite de gaz d'échappement vers l'habitacle", "severity": "MAJEUR"},
            {"id": "14.2", "desc": "Silencieux percé ou bruyant", "severity": "MINEUR"},
            {"id": "14.3", "desc": "Tuyau d'échappement mal fixé", "severity": "MINEUR"},
            {"id": "14.4", "desc": "Émissions excessives de fumée", "severity": "MINEUR"}
        ]
    },
    "15": {
        "id": "15",
        "label": "Système d'alimentation en carburant",
        "key": "systeme_alimentation",
        "defects": [
            {"id": "15.1", "desc": "Fuite de carburant (goutte à goutte)", "severity": "MAJEUR"},
            {"id": "15.2", "desc": "Bouchon de réservoir manquant ou défectueux", "severity": "MINEUR"},
            {"id": "15.3", "desc": "Odeur de carburant dans l'habitacle", "severity": "MAJEUR"},
            {"id": "15.4", "desc": "Conduite de carburant endommagée", "severity": "MAJEUR"}
        ]
    },
    "16": {
        "id": "16",
        "label": "Roues et moyeux",
        "key": "roues_moyeux",
        "defects": [
            {"id": "16.1", "desc": "Écrou de roue manquant", "severity": "MAJEUR"},
            {"id": "16.2", "desc": "Jante fissurée ou déformée", "severity": "MAJEUR"},
            {"id": "16.3", "desc": "Écrou de roue desserré", "severity": "MAJEUR"},
            {"id": "16.4", "desc": "Roulement de roue bruyant ou usé", "severity": "MINEUR"}
        ]
    },
    "17": {
        "id": "17",
        "label": "Système de freins (général)",
        "key": "systeme_freins",
        "defects": [
            {"id": "17.1", "desc": "Efficacité de freinage insuffisante", "severity": "MAJEUR"},
            {"id": "17.2", "desc": "Frein de stationnement inefficace", "severity": "MAJEUR"},
            {"id": "17.3", "desc": "Témoin de frein allumé au tableau de bord", "severity": "MAJEUR"},
            {"id": "17.4", "desc": "Bruit anormal lors du freinage", "severity": "MINEUR"}
        ]
    },
    "18": {
        "id": "18",
        "label": "Freins hydrauliques",
        "key": "freins_hydrauliques",
        "requires_brake_type": ["HYDRAULIC", "BOTH"],
        "defects": [
            {"id": "18.1", "desc": "Fuite de liquide de frein", "severity": "MAJEUR"},
            {"id": "18.2", "desc": "Pédale de frein spongieuse", "severity": "MAJEUR"},
            {"id": "18.3", "desc": "Niveau de liquide de frein bas", "severity": "MAJEUR"},
            {"id": "18.4", "desc": "Maître-cylindre défectueux", "severity": "MAJEUR"},
            {"id": "18.5", "desc": "Flexible de frein endommagé ou usé", "severity": "MAJEUR"}
        ]
    },
    "19": {
        "id": "19",
        "label": "Freins pneumatiques",
        "key": "freins_pneumatiques",
        "requires_brake_type": ["PNEUMATIC", "BOTH"],
        "defects": [
            {"id": "19.1", "desc": "Fuite d'air audible", "severity": "MAJEUR"},
            {"id": "19.2", "desc": "Chute de pression rapide dans le système", "severity": "MAJEUR"},
            {"id": "19.3", "desc": "Compresseur d'air défaillant", "severity": "MAJEUR"},
            {"id": "19.4", "desc": "Réservoir d'air corrodé ou endommagé", "severity": "MAJEUR"},
            {"id": "19.5", "desc": "Valve de purge automatique défectueuse", "severity": "MINEUR"}
        ]
    }
}


class DefautSAAQ(BaseModel):
    """Défaut SAAQ sélectionné lors d'une ronde"""
    point_id: str  # Ex: "8"
    defect_id: str  # Ex: "8.2"
    description: str  # Ex: "Aucun feu de freinage (stop) ne fonctionne"
    severity: str  # "MAJEUR" ou "MINEUR"
    notes: Optional[str] = None  # Notes additionnelles du conducteur


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
    defectuosites: Optional[str] = ""  # Description libre (legacy)
    points_verification: Dict[str, str]  # { "1": "conforme", "8": "defectueux", ... }
    signature_mandatee: str  # Base64 data URL
    # Nouveaux champs SAAQ
    defauts_selectionnes: List[Dict[str, Any]] = []  # Liste des défauts SAAQ sélectionnés
    severite_globale: Optional[str] = None  # "CONFORME", "MINEUR", "MAJEUR" (calculé automatiquement)


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
    defectuosites: Optional[str] = ""  # Description libre (legacy)
    points_verification: Dict[str, str]
    signature_mandatee: str
    contre_signatures: List[ContreSignature] = []
    created_by: str  # User ID
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Nouveaux champs SAAQ
    defauts_selectionnes: List[Dict[str, Any]] = []  # Liste des défauts SAAQ avec codes
    severite_globale: str = "CONFORME"  # "CONFORME", "MINEUR", "MAJEUR"
    rappel_48h_envoye: bool = False  # Pour les défauts MINEURS
    date_rappel_48h: Optional[datetime] = None


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
        except Exception:
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
                        "https://nominatim.openstreetmap.org/reverse",
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
        
        # Log email pour chaque destinataire
        try:
            from routes.emails_history import log_email_sent
            import asyncio
            for email in recipient_emails:
                asyncio.create_task(log_email_sent(
                    type_email="ronde_securite",
                    destinataire_email=email,
                    sujet=f"🔧 Ronde de Sécurité - {vehicle.get('nom', 'Véhicule')} - {date_ronde_str}",
                    tenant_id=tenant.id,
                    metadata={"vehicule": vehicle.get('nom'), "date": date_ronde_str}
                ))
        except Exception as log_err:
            logger.warning(f"Erreur log email: {log_err}")
        
    except Exception as e:
        logger.error(f"❌ Erreur envoi email ronde: {e}", exc_info=True)


# ==================== ROUTES API ====================

@router.get("/{tenant_slug}/actifs/rondes-securite/points-verification")
async def get_points_verification_saaq(
    tenant_slug: str,
    vehicule_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Récupérer la liste des points de vérification SAAQ avec leurs défauts prédéfinis.
    Si vehicule_id est fourni, filtre les points 18/19 selon le type de freins du véhicule.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer le type de freins du véhicule si spécifié
    brake_system_type = "BOTH"  # Par défaut, afficher les deux
    if vehicule_id:
        vehicule = await db.vehicules.find_one(
            {"id": vehicule_id, "tenant_id": tenant.id},
            {"_id": 0, "brake_system_type": 1}
        )
        if vehicule:
            brake_system_type = vehicule.get("brake_system_type", "BOTH")
    
    # Filtrer les points selon le type de freins
    points_filtres = {}
    for point_id, point_data in POINTS_VERIFICATION_SAAQ.items():
        requires_brake_type = point_data.get("requires_brake_type")
        
        # Si le point nécessite un type de frein spécifique
        if requires_brake_type:
            if brake_system_type in requires_brake_type:
                points_filtres[point_id] = point_data
        else:
            # Point standard, toujours inclus
            points_filtres[point_id] = point_data
    
    return {
        "brake_system_type": brake_system_type,
        "points_verification": points_filtres
    }


@router.post("/{tenant_slug}/actifs/rondes-securite")
async def create_ronde_securite(
    tenant_slug: str,
    ronde_data: RondeSecuriteCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Créer une nouvelle ronde de sécurité SAAQ.
    
    Logique de sévérité:
    - MAJEUR: Véhicule HORS SERVICE immédiatement, notification urgente
    - MINEUR: Véhicule DISPONIBLE mais réparation requise sous 48h
    - CONFORME: Véhicule opérationnel
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que le véhicule existe
    vehicule = await db.vehicules.find_one(
        {"id": ronde_data.vehicule_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not vehicule:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    # Calculer la sévérité globale
    defauts = ronde_data.defauts_selectionnes or []
    severite_globale = "CONFORME"
    defauts_majeurs = [d for d in defauts if d.get("severity") == "MAJEUR"]
    defauts_mineurs = [d for d in defauts if d.get("severity") == "MINEUR"]
    
    if defauts_majeurs:
        severite_globale = "MAJEUR"
    elif defauts_mineurs:
        severite_globale = "MINEUR"
    
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
        created_by=current_user.id,
        defauts_selectionnes=defauts,
        severite_globale=severite_globale
    )
    
    # Si défauts MINEURS, planifier rappel 48h
    if severite_globale == "MINEUR":
        ronde.date_rappel_48h = datetime.now(timezone.utc) + timedelta(hours=48)
    
    await db.rondes_securite.insert_one(ronde.dict())
    
    # Mettre à jour le véhicule
    update_vehicule = {
        "kilometrage": ronde_data.km if ronde_data.km > vehicule.get('kilometrage', 0) else vehicule.get('kilometrage', 0),
        "date_derniere_ronde": ronde_data.date,
        "defauts_actifs": defauts,
        "updated_at": datetime.now(timezone.utc)
    }
    
    # Mettre à jour la disponibilité selon la sévérité
    if severite_globale == "MAJEUR":
        update_vehicule["disponibilite_saaq"] = "hors_service"
    elif severite_globale == "MINEUR":
        update_vehicule["disponibilite_saaq"] = "reparation_requise"
    else:
        update_vehicule["disponibilite_saaq"] = "disponible"
        update_vehicule["defauts_actifs"] = []  # Effacer les défauts si conforme
    
    await db.vehicules.update_one(
        {"id": ronde_data.vehicule_id},
        {"$set": update_vehicule}
    )
    
    # Récupérer les destinataires de notification depuis les paramètres
    parametres = tenant.parametres if hasattr(tenant, 'parametres') and tenant.parametres else {}
    actifs_params = parametres.get('actifs', {})
    destinataires_ids = actifs_params.get('emails_rondes', [])
    
    # Convertir les IDs utilisateurs en liste d'emails et d'IDs
    recipient_emails = []
    recipient_user_ids = []
    for item in destinataires_ids:
        if '@' in str(item):
            recipient_emails.append(item)
        else:
            user = await db.users.find_one({"id": item, "tenant_id": tenant.id}, {"_id": 0, "email": 1, "id": 1})
            if user:
                if user.get('email'):
                    recipient_emails.append(user['email'])
                recipient_user_ids.append(user['id'])
    
    # ==================== NOTIFICATIONS SELON SÉVÉRITÉ ====================
    
    if severite_globale == "MAJEUR":
        # 🚨 DÉFAUT MAJEUR - Notification urgente immédiate
        logger.warning(f"🚨 DÉFAUT MAJEUR détecté sur {vehicule.get('nom')} - Véhicule HORS SERVICE")
        
        # Construire la liste des défauts majeurs pour la notification
        defauts_majeurs_text = "\n".join([f"• {d.get('defect_id')}: {d.get('description')}" for d in defauts_majeurs])
        
        # Notification in-app + email pour tous les destinataires
        from routes.notifications import creer_notification
        for user_id in recipient_user_ids:
            await creer_notification(
                tenant_id=tenant.id,
                destinataire_id=user_id,
                type="vehicule_hors_service",
                titre=f"🚨 VÉHICULE HORS SERVICE: {vehicule.get('nom')}",
                message=f"Défaut(s) MAJEUR(S) détecté(s) lors de la ronde de sécurité:\n{defauts_majeurs_text}",
                lien="/actifs",
                data={
                    "vehicule_id": vehicule.get('id'),
                    "vehicule_nom": vehicule.get('nom'),
                    "severite": "MAJEUR",
                    "defauts": defauts_majeurs
                },
                envoyer_email=True
            )
        
        # Push notification urgente
        try:
            from routes.notifications import send_push_notification_to_users
            if recipient_user_ids:
                await send_push_notification_to_users(
                    user_ids=recipient_user_ids,
                    title=f"🚨 {vehicule.get('nom')} HORS SERVICE",
                    body=f"Défaut MAJEUR: {defauts_majeurs[0].get('description', 'Voir détails')}",
                    data={
                        "type": "vehicule_hors_service",
                        "vehicule_id": vehicule.get('id'),
                        "lien": "/actifs"
                    }
                )
        except Exception as push_err:
            logger.warning(f"Erreur push notification: {push_err}")
        
        # Email spécifique HORS SERVICE
        if recipient_emails:
            asyncio.create_task(send_ronde_email_hors_service(
                tenant, ronde.id, vehicule, recipient_emails, defauts_majeurs
            ))
    
    elif severite_globale == "MINEUR":
        # ⚠️ DÉFAUT MINEUR - Notification de réparation requise
        logger.info(f"⚠️ Défaut MINEUR détecté sur {vehicule.get('nom')} - Réparation requise sous 48h")
        
        defauts_mineurs_text = "\n".join([f"• {d.get('defect_id')}: {d.get('description')}" for d in defauts_mineurs])
        
        # Notification in-app
        from routes.notifications import creer_notification
        for user_id in recipient_user_ids:
            await creer_notification(
                tenant_id=tenant.id,
                destinataire_id=user_id,
                type="vehicule_reparation_requise",
                titre=f"⚠️ Réparation requise: {vehicule.get('nom')}",
                message=f"Défaut(s) mineur(s) détecté(s). Réparation requise sous 48h:\n{defauts_mineurs_text}",
                lien="/actifs",
                data={
                    "vehicule_id": vehicule.get('id'),
                    "vehicule_nom": vehicule.get('nom'),
                    "severite": "MINEUR",
                    "defauts": defauts_mineurs,
                    "date_limite_reparation": (datetime.now(timezone.utc) + timedelta(hours=48)).isoformat()
                },
                envoyer_email=True
            )
        
        # Push notification
        try:
            from routes.notifications import send_push_notification_to_users
            if recipient_user_ids:
                await send_push_notification_to_users(
                    user_ids=recipient_user_ids,
                    title=f"⚠️ {vehicule.get('nom')} - Réparation requise",
                    body="Défaut mineur détecté. Délai: 48h",
                    data={
                        "type": "vehicule_reparation_requise",
                        "vehicule_id": vehicule.get('id'),
                        "lien": "/actifs"
                    }
                )
        except Exception as push_err:
            logger.warning(f"Erreur push notification: {push_err}")
    
    else:
        # ✅ CONFORME - Email standard
        if recipient_emails:
            asyncio.create_task(send_ronde_email_background(tenant, ronde.id, vehicule, recipient_emails))
    
    return {
        "message": "Ronde de sécurité enregistrée avec succès",
        "id": ronde.id,
        "vehicule": vehicule.get('nom', 'N/A'),
        "severite_globale": severite_globale,
        "disponibilite_saaq": update_vehicule.get("disponibilite_saaq"),
        "defauts_majeurs": len(defauts_majeurs),
        "defauts_mineurs": len(defauts_mineurs)
    }


async def send_ronde_email_hors_service(tenant, ronde_id: str, vehicle: dict, recipient_emails: list, defauts_majeurs: list):
    """
    Envoyer un email urgent pour véhicule HORS SERVICE (défaut MAJEUR)
    """
    try:
        import resend
        
        resend_api_key = os.environ.get('RESEND_API_KEY')
        if not resend_api_key:
            logger.error("❌ RESEND_API_KEY non configurée")
            return
        
        resend.api_key = resend_api_key
        
        nom_service = tenant.nom_service if hasattr(tenant, 'nom_service') and tenant.nom_service else tenant.nom
        
        # Construire la liste des défauts
        defauts_html = ""
        for defaut in defauts_majeurs:
            defauts_html += f"""
            <tr>
                <td style="padding: 8px; border: 1px solid #FCA5A5; background: #FEF2F2;">
                    <strong style="color: #DC2626;">{defaut.get('defect_id', 'N/A')}</strong>
                </td>
                <td style="padding: 8px; border: 1px solid #FCA5A5; background: #FEF2F2;">
                    {defaut.get('description', 'N/A')}
                </td>
            </tr>
            """
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #FEF2F2;">
            <div style="background-color: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-left: 5px solid #DC2626;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="color: #DC2626; margin: 0;">🚨 VÉHICULE HORS SERVICE</h1>
                    <p style="color: #6B7280; margin: 5px 0 0 0;">{nom_service}</p>
                </div>
                
                <div style="background-color: #DC2626; color: white; padding: 15px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
                    <h2 style="margin: 0;">{vehicle.get('nom', 'N/A')}</h2>
                    <p style="margin: 5px 0 0 0; opacity: 0.9;">{vehicle.get('type_vehicule', '')} - {vehicle.get('marque', '')}</p>
                </div>
                
                <h3 style="color: #1F2937; margin-bottom: 10px;">⚠️ Défaut(s) MAJEUR(S) détecté(s):</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr>
                        <th style="padding: 8px; border: 1px solid #DC2626; background: #DC2626; color: white; text-align: left;">Code SAAQ</th>
                        <th style="padding: 8px; border: 1px solid #DC2626; background: #DC2626; color: white; text-align: left;">Description</th>
                    </tr>
                    {defauts_html}
                </table>
                
                <div style="background-color: #FEF2F2; border: 2px solid #DC2626; padding: 15px; border-radius: 8px; text-align: center;">
                    <p style="margin: 0; color: #DC2626; font-weight: bold; font-size: 16px;">
                        🚫 CE VÉHICULE NE DOIT PAS CIRCULER
                    </p>
                    <p style="margin: 10px 0 0 0; color: #374151;">
                        Conformément à la Loi 430 (SAAQ), ce véhicule est interdit de circulation jusqu'à réparation des défauts majeurs.
                    </p>
                </div>
                
                <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;">
                
                <p style="font-size: 12px; color: #9CA3AF; text-align: center; margin: 0;">
                    Ce message a été envoyé automatiquement par ProFireManager.<br>
                    Ronde ID: {ronde_id}
                </p>
            </div>
        </body>
        </html>
        """
        
        params = {
            "from": f"{nom_service} <alertes@profiremanager.ca>",
            "to": recipient_emails,
            "subject": f"🚨 URGENT - VÉHICULE HORS SERVICE: {vehicle.get('nom', 'Véhicule')}",
            "html": html_content
        }
        
        response = resend.Emails.send(params)
        logger.info(f"✅ Email HORS SERVICE envoyé - ID: {response.get('id', 'N/A')}")
        
    except Exception as e:
        logger.error(f"❌ Erreur envoi email hors service: {e}", exc_info=True)


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
        except Exception:
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
