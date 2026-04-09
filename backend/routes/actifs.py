"""
Routes API pour le module Actifs (Véhicules, Bornes d'incendie, Inventaires)
============================================================================

STATUT: ACTIF
Ce module gère les actifs de la caserne : véhicules, bornes d'incendie, inventaires,
rondes de sécurité SAAQ, et QR codes.

Routes:
Véhicules:
- GET    /{tenant_slug}/actifs/vehicules                        - Liste des véhicules
- GET    /{tenant_slug}/actifs/vehicules/{vehicule_id}          - Détail véhicule
- GET    /{tenant_slug}/actifs/vehicules/{vehicule_id}/public   - Info publique (QR)
- POST   /{tenant_slug}/actifs/vehicules                        - Créer véhicule
- PUT    /{tenant_slug}/actifs/vehicules/{vehicule_id}          - Modifier véhicule
- DELETE /{tenant_slug}/actifs/vehicules/{vehicule_id}          - Supprimer véhicule
- POST   /{tenant_slug}/actifs/vehicules/{vehicle_id}/qr-code   - Générer QR code
- POST   /{tenant_slug}/actifs/vehicules/{vehicle_id}/inspection-saaq - Inspection SAAQ
- GET    /{tenant_slug}/actifs/vehicules/{vehicle_id}/inspections     - Historique inspections
- GET    /{tenant_slug}/actifs/vehicules/{vehicle_id}/fiche-vie       - Fiche de vie

Bornes d'incendie:
- GET    /{tenant_slug}/actifs/bornes                           - Liste des bornes
- GET    /{tenant_slug}/actifs/bornes/{borne_id}                - Détail borne
- POST   /{tenant_slug}/actifs/bornes                           - Créer borne
- PUT    /{tenant_slug}/actifs/bornes/{borne_id}                - Modifier borne
- DELETE /{tenant_slug}/actifs/bornes/{borne_id}                - Supprimer borne
- POST   /{tenant_slug}/actifs/bornes/{borne_id}/qr-code        - Générer QR code
- POST   /{tenant_slug}/actifs/bornes/import-inspections        - Importer inspections CSV

Inventaires:
- GET/POST/PUT/DELETE /{tenant_slug}/actifs/inventaires/modeles/*    - Modèles d'inventaire
- GET/POST/PUT/DELETE /{tenant_slug}/actifs/inventaires/inspections/* - Inspections

Rondes de sécurité:
- GET/POST /{tenant_slug}/actifs/rondes-securite/*              - Rondes SAAQ
- POST /{tenant_slug}/actifs/rondes-securite/{id}/contre-signer - Contre-signature

Matériels:
- GET    /{tenant_slug}/actifs/materiels                        - Liste matériels pour interventions

Paramètres:
- GET/PUT /{tenant_slug}/actifs/parametres                      - Paramètres du module
- GET/PUT /{tenant_slug}/actifs/configuration-emails-rondes     - Config emails rondes
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import logging
import os
import qrcode
import base64
import csv
import asyncio
from io import BytesIO, StringIO

# Import des dépendances partagées
from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User,
    creer_notification,
    require_permission,
    user_has_module_action
)

# Import pour les notifications push
from routes.notifications import send_push_notification_to_users, send_web_push_to_users

# Import WebSocket pour synchronisation temps réel
from routes.websocket import broadcast_actif_update

router = APIRouter(tags=["Actifs"])
logger = logging.getLogger(__name__)


# ==================== FONCTION NOTIFICATION HORS SERVICE ====================

async def notifier_vehicule_ou_materiel_hors_service(
    tenant_id: str,
    type_actif: str,  # "vehicule" ou "materiel"
    nom_actif: str,
    statut: str,
    raison: str = None,
    modifie_par: str = None
):
    """
    Notifie tous les utilisateurs qu'un véhicule ou matériel est hors service.
    Envoie notification push, web push et email à tout le monde.
    """
    try:
        # Récupérer tous les utilisateurs actifs du tenant
        all_users = await db.users.find({
            "tenant_id": tenant_id,
            "statut": "Actif"
        }).to_list(500)
        
        if not all_users:
            return
        
        # Préparer le message
        type_label = "🚒 Véhicule" if type_actif == "vehicule" else "🛠️ Matériel"
        statut_label = "HORS SERVICE" if "hors" in statut.lower() else "EN MAINTENANCE"
        
        titre = f"{type_label} {statut_label}"
        message = f"{nom_actif} est maintenant {statut_label.lower()}."
        if raison:
            message += f" Raison: {raison}"
        if modifie_par:
            message += f" (Signalé par {modifie_par})"
        
        user_ids = [u.get("id") for u in all_users if u.get("id")]
        
        # 1. Créer les notifications internes pour chaque utilisateur
        for user_id in user_ids:
            await creer_notification(
                tenant_id=tenant_id,
                user_id=user_id,
                type_notification="actif_hors_service",
                titre=titre,
                message=message,
                lien="/actifs",
                data={
                    "type_actif": type_actif,
                    "nom_actif": nom_actif,
                    "statut": statut
                },
                envoyer_email=True  # Envoyer email aussi
            )
        
        # 2. Envoyer notifications push FCM
        try:
            await send_push_notification_to_users(
                user_ids=user_ids,
                title=titre,
                body=message,
                data={
                    "type": "actif_hors_service",
                    "sound": "urgent"
                }
            )
        except Exception as e:
            logger.warning(f"Erreur push FCM: {e}")
        
        # 3. Envoyer notifications Web Push
        try:
            await send_web_push_to_users(
                tenant_id=tenant_id,
                user_ids=user_ids,
                title=titre,
                body=message,
                data={"type": "actif_hors_service"}
            )
        except Exception as e:
            logger.warning(f"Erreur Web Push: {e}")
        
        logger.info(f"🚨 Notification hors service envoyée: {nom_actif} ({statut}) à {len(user_ids)} utilisateurs")
        
    except Exception as e:
        logger.error(f"Erreur notification hors service: {e}")


async def notifier_vehicule_retour_en_service(
    tenant_id: str,
    nom_vehicule: str,
    modifie_par: str = None
):
    """
    Notifie tous les utilisateurs qu'un véhicule est de retour en service.
    """
    try:
        import resend
        import os
        
        # Récupérer tous les utilisateurs actifs du tenant
        all_users = await db.users.find({
            "tenant_id": tenant_id,
            "statut": "Actif"
        }).to_list(500)
        
        if not all_users:
            return
        
        titre = f"✅ Véhicule DE RETOUR EN SERVICE"
        message = f"🚒 {nom_vehicule} est de nouveau EN SERVICE."
        if modifie_par:
            message += f" (Modifié par {modifie_par})"
        
        user_ids = [u.get("id") for u in all_users if u.get("id")]
        
        # 1. Créer les notifications internes
        for user_id in user_ids:
            await creer_notification(
                tenant_id=tenant_id,
                user_id=user_id,
                type_notification="vehicule_en_service",
                titre=titre,
                message=message,
                lien="/actifs",
                data={
                    "type_actif": "vehicule",
                    "nom_actif": nom_vehicule,
                    "statut": "en_service"
                },
                envoyer_email=True
            )
        
        # 2. Envoyer notifications push FCM
        try:
            await send_push_notification_to_users(
                user_ids=user_ids,
                title=titre,
                body=message,
                data={"type": "vehicule_en_service"}
            )
        except Exception as e:
            logger.warning(f"Erreur push FCM: {e}")
        
        # 3. Envoyer email groupé
        try:
            resend_api_key = os.environ.get("RESEND_API_KEY")
            sender_email = os.environ.get("SENDER_EMAIL", "noreply@profiremanager.ca")
            
            if resend_api_key:
                resend.api_key = resend_api_key
                
                tenant_data = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
                tenant_nom = tenant_data.get("nom", "ProFireManager") if tenant_data else "ProFireManager"
                
                emails = [u.get("email") for u in all_users if u.get("email")]
                
                if emails:
                    email_html = f"""
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background-color: #10B981; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                            <h1 style="margin: 0; font-size: 24px;">✅ Véhicule</h1>
                            <h2 style="margin: 10px 0 0 0; font-size: 20px;">DE RETOUR EN SERVICE</h2>
                        </div>
                        <div style="padding: 20px; background-color: #f9fafb; border-radius: 0 0 8px 8px;">
                            <p style="font-size: 16px; margin-bottom: 15px;">
                                <strong>🚒 {nom_vehicule}</strong> est de nouveau <strong style="color: #10B981;">EN SERVICE</strong>.
                            </p>
                            {f'<p style="color: #6b7280; font-size: 14px;">Modifié par: {modifie_par}</p>' if modifie_par else ''}
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                            <p style="font-size: 12px; color: #9ca3af; text-align: center;">
                                {tenant_nom} - ProFireManager
                            </p>
                        </div>
                    </div>
                    """
                    
                    resend.Emails.send({
                        "from": f"ProFireManager <{sender_email}>",
                        "to": emails,
                        "subject": f"✅ Véhicule EN SERVICE: {nom_vehicule}",
                        "html": email_html
                    })
                    logger.info(f"📧 Email retour en service envoyé à {len(emails)} utilisateurs")
        except Exception as e:
            logger.error(f"Erreur envoi email retour en service: {e}")
        
        logger.info(f"✅ Notification retour en service envoyée: {nom_vehicule} à {len(user_ids)} utilisateurs")
        
    except Exception as e:
        logger.error(f"Erreur notification retour en service: {e}")


# ==================== MODÈLES - VÉHICULES ====================

class LocalisationGPS(BaseModel):
    lat: float
    lng: float


class Vehicule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    type_vehicule: Optional[str] = None
    marque: Optional[str] = None
    modele: Optional[str] = None
    annee: Optional[int] = None
    kilometrage: Optional[float] = None
    vin: Optional[str] = None
    statut: str = "actif"
    date_mise_service: Optional[str] = None
    modele_inventaire_id: Optional[str] = None
    photos: List[str] = []
    documents: List[Dict[str, str]] = []
    notes: Optional[str] = None
    derniere_inspection_id: Optional[str] = None
    derniere_inspection_date: Optional[str] = None
    qr_code: Optional[str] = None
    qr_code_url: Optional[str] = None
    logs: List[Dict[str, Any]] = []
    
    # Nouveaux champs SAAQ/PEP
    poids_pnbv: Optional[float] = None  # Poids Nominal Brut du Véhicule (kg)
    classification_saaq: Optional[str] = None  # "urgence" ou "soutien"
    
    # Type de système de freinage pour conformité SAAQ (Loi 430)
    # HYDRAULIC = Freins hydrauliques uniquement (point 18)
    # PNEUMATIC = Freins pneumatiques uniquement (point 19)
    # BOTH = Les deux systèmes (points 18 et 19)
    brake_system_type: Optional[str] = "BOTH"  # HYDRAULIC, PNEUMATIC, BOTH
    
    # Statut de disponibilité SAAQ (mis à jour après ronde de sécurité)
    # disponible = Véhicule opérationnel
    # reparation_requise = Défaut mineur détecté, réparation sous 48h
    # hors_service = Défaut majeur détecté, véhicule inutilisable
    disponibilite_saaq: Optional[str] = "disponible"  # disponible, reparation_requise, hors_service
    date_derniere_ronde: Optional[str] = None
    defauts_actifs: List[Dict[str, Any]] = []  # Liste des défauts non résolus
    
    # Vignette / Inspection mécanique (PEP)
    vignette_numero: Optional[str] = None
    vignette_date_inspection: Optional[str] = None  # Date d'apposition
    vignette_date_expiration: Optional[str] = None  # YYYY-MM (fin du mois)
    vignette_statut: Optional[str] = "conforme"  # conforme, remise, rancart
    
    # Périodicité d'entretien (configurable par véhicule)
    entretien_intervalle_mois: Optional[int] = None  # Ex: 6 mois
    entretien_intervalle_km: Optional[int] = None  # Ex: 10000 km
    derniere_vidange_date: Optional[str] = None
    derniere_vidange_km: Optional[float] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VehiculeCreate(BaseModel):
    nom: str
    type_vehicule: Optional[str] = None
    marque: Optional[str] = None
    modele: Optional[str] = None
    annee: Optional[int] = None
    kilometrage: Optional[float] = None
    vin: Optional[str] = None
    statut: str = "actif"
    date_mise_service: Optional[str] = None
    photos: List[str] = []
    documents: List[Dict[str, str]] = []
    notes: Optional[str] = None
    # Type de système de freinage SAAQ
    brake_system_type: Optional[str] = "BOTH"  # HYDRAULIC, PNEUMATIC, BOTH
    # Nouveaux champs SAAQ/PEP
    poids_pnbv: Optional[float] = None
    classification_saaq: Optional[str] = None
    vignette_numero: Optional[str] = None
    vignette_date_inspection: Optional[str] = None
    vignette_date_expiration: Optional[str] = None
    vignette_statut: Optional[str] = "conforme"
    entretien_intervalle_mois: Optional[int] = None
    entretien_intervalle_km: Optional[int] = None
    derniere_vidange_date: Optional[str] = None
    derniere_vidange_km: Optional[float] = None


class VehiculeUpdate(BaseModel):
    nom: Optional[str] = None
    type_vehicule: Optional[str] = None
    marque: Optional[str] = None
    modele: Optional[str] = None
    annee: Optional[int] = None
    kilometrage: Optional[float] = None
    vin: Optional[str] = None
    statut: Optional[str] = None
    date_mise_service: Optional[str] = None
    modele_inventaire_id: Optional[str] = None
    photos: Optional[List[str]] = None
    documents: Optional[List[Dict[str, str]]] = None
    notes: Optional[str] = None
    # Type de système de freinage SAAQ
    brake_system_type: Optional[str] = None  # HYDRAULIC, PNEUMATIC, BOTH
    disponibilite_saaq: Optional[str] = None  # disponible, reparation_requise, hors_service
    defauts_actifs: Optional[List[Dict[str, Any]]] = None
    # Nouveaux champs SAAQ/PEP
    poids_pnbv: Optional[float] = None
    classification_saaq: Optional[str] = None
    vignette_numero: Optional[str] = None
    vignette_date_inspection: Optional[str] = None
    vignette_date_expiration: Optional[str] = None
    vignette_statut: Optional[str] = None
    entretien_intervalle_mois: Optional[int] = None
    entretien_intervalle_km: Optional[int] = None
    derniere_vidange_date: Optional[str] = None
    derniere_vidange_km: Optional[float] = None


# ==================== MODÈLES - RÉPARATIONS/ENTRETIENS VÉHICULES ====================

class ReparationVehicule(BaseModel):
    """Suivi des réparations et entretiens pour traçabilité et budget"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    vehicule_id: str
    date_reparation: str  # YYYY-MM-DD
    type_intervention: str  # entretien_preventif, reparation_mineure, reparation_majeure, inspection_mecanique, autre
    description: str
    cout: Optional[float] = None
    fournisseur: Optional[str] = None  # Garage, mécanicien
    kilometrage_actuel: Optional[float] = None
    pieces_remplacees: Optional[str] = None
    numero_facture: Optional[str] = None
    statut: str = "complete"  # complete, en_cours, planifie
    date_signalement: Optional[str] = None  # Pour les défectuosités (délai 48h)
    priorite: str = "normale"  # normale, urgente (48h), critique (immédiat)
    notes: Optional[str] = None
    cree_par: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ReparationCreate(BaseModel):
    date_reparation: str
    type_intervention: str
    description: str
    cout: Optional[float] = None
    fournisseur: Optional[str] = None
    kilometrage_actuel: Optional[float] = None
    pieces_remplacees: Optional[str] = None
    numero_facture: Optional[str] = None
    statut: str = "complete"
    date_signalement: Optional[str] = None
    priorite: str = "normale"
    notes: Optional[str] = None


# ==================== MODÈLES - BORNES D'INCENDIE ====================

class BorneIncendie(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    type_borne: str
    localisation_gps: Optional[LocalisationGPS] = None
    adresse: Optional[str] = None
    transversale: Optional[str] = None
    municipalite: Optional[str] = None
    debit: Optional[str] = None
    statut: str = "operationnelle"
    date_derniere_inspection: Optional[str] = None
    lien_maps: Optional[str] = None
    photos: List[str] = []
    schemas: List[str] = []
    notes_importantes: Optional[str] = None
    qr_code: Optional[str] = None
    qr_code_url: Optional[str] = None
    logs: List[Dict[str, Any]] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BorneIncendieCreate(BaseModel):
    nom: str
    type_borne: str
    localisation_gps: Optional[LocalisationGPS] = None
    adresse: Optional[str] = None
    transversale: Optional[str] = None
    municipalite: Optional[str] = None
    debit: Optional[str] = None
    statut: str = "operationnelle"
    date_derniere_inspection: Optional[str] = None
    lien_maps: Optional[str] = None
    photos: List[str] = []
    schemas: List[str] = []
    notes_importantes: Optional[str] = None


class BorneIncendieUpdate(BaseModel):
    nom: Optional[str] = None
    type_borne: Optional[str] = None
    localisation_gps: Optional[LocalisationGPS] = None
    adresse: Optional[str] = None
    transversale: Optional[str] = None
    municipalite: Optional[str] = None
    debit: Optional[str] = None
    statut: Optional[str] = None
    date_derniere_inspection: Optional[str] = None
    lien_maps: Optional[str] = None
    photos: Optional[List[str]] = None
    schemas: Optional[List[str]] = None
    notes_importantes: Optional[str] = None


# ==================== MODÈLES - INVENTAIRES ====================

class ItemInventaire(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str
    type_item: str = "checkbox"
    obligatoire: bool = False
    ordre: int = 0


class SectionInventaire(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str
    description: Optional[str] = None
    photos_reference: List[str] = []
    items: List[ItemInventaire] = []
    ordre: int = 0


class ModeleInventaire(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    description: Optional[str] = None
    type_vehicule: Optional[str] = None
    sections: List[SectionInventaire] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ModeleInventaireCreate(BaseModel):
    nom: str
    description: Optional[str] = None
    type_vehicule: Optional[str] = None
    sections: List[SectionInventaire] = []


class ModeleInventaireUpdate(BaseModel):
    nom: Optional[str] = None
    description: Optional[str] = None
    type_vehicule: Optional[str] = None
    sections: Optional[List[SectionInventaire]] = None


class ResultatItemInspection(BaseModel):
    item_id: str
    section_id: str
    statut: str
    notes: Optional[str] = None
    photo_url: Optional[str] = None


class InspectionInventaire(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    vehicule_id: str
    modele_inventaire_id: str
    inspecteur_id: str
    inspecteur_nom: Optional[str] = None
    date_inspection: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    statut: str = "en_cours"
    resultats: List[ResultatItemInspection] = []
    notes_generales: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None


class InspectionInventaireCreate(BaseModel):
    vehicule_id: str
    modele_inventaire_id: str
    inspecteur_id: str


class InspectionInventaireUpdate(BaseModel):
    statut: Optional[str] = None
    resultats: Optional[List[ResultatItemInspection]] = None
    notes_generales: Optional[str] = None


# ==================== MODÈLES - INSPECTION SAAQ ====================

class DefectDetail(BaseModel):
    item: str
    severity: str
    description: str
    photo_url: Optional[str] = None
    reported_by: str
    reported_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved: bool = False
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None


class InspectionSAAQ(BaseModel):
    id: str = Field(default_factory=lambda: f"insp_{str(uuid.uuid4())[:8]}")
    tenant_id: str
    vehicle_id: str
    inspector_id: str
    inspector_name: str
    inspector_matricule: Optional[str] = None
    signature_certify: bool = False
    signature_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    signature_gps: Optional[List[float]] = None
    inspection_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    checklist: Dict[str, Any] = Field(default_factory=dict)
    defects: List[DefectDetail] = []
    has_major_defect: bool = False
    photo_urls: List[str] = []
    passed: bool = True
    comments: Optional[str] = None
    synced: bool = False
    created_offline: bool = False
    device_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InspectionSAAQCreate(BaseModel):
    vehicle_id: str
    inspector_id: str
    inspector_name: str
    inspector_matricule: Optional[str] = None
    signature_certify: bool
    signature_gps: Optional[List[float]] = None
    checklist: Dict[str, Any]
    defects: List[DefectDetail] = []
    photo_urls: List[str] = []
    comments: Optional[str] = None
    device_id: Optional[str] = None


class AuditLogEntry(BaseModel):
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: str
    user_name: str
    action: str
    details: Optional[str] = None
    gps: Optional[List[float]] = None


# ==================== MODÈLES - RONDES DE SÉCURITÉ ====================

class ContreSignature(BaseModel):
    nom_conducteur: str
    prenom_conducteur: str
    signature: str
    date_contre_signature: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: Optional[str] = None


class RondeSecuriteCreate(BaseModel):
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
    # Nouveaux champs SAAQ
    defauts_selectionnes: List[Dict[str, Any]] = []  # Liste des défauts SAAQ sélectionnés
    severite_globale: Optional[str] = None  # Calculé automatiquement


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
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Nouveaux champs SAAQ
    defauts_selectionnes: List[Dict[str, Any]] = []
    severite_globale: str = "CONFORME"  # CONFORME, MINEUR, MAJEUR
    rappel_48h_envoye: bool = False
    date_rappel_48h: Optional[datetime] = None


class ContreSignatureCreate(BaseModel):
    nom_conducteur: str
    prenom_conducteur: str
    signature: str
    raison_refus: Optional[str] = None


# ==================== ROUTES - VÉHICULES ====================

@router.get("/{tenant_slug}/actifs/vehicules", response_model=List[Vehicule])
async def get_vehicules(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère la liste de tous les véhicules du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    vehicules = await db.vehicules.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(length=None)
    
    return vehicules


# IMPORTANT: Cette route DOIT être avant les routes avec {vehicule_id} pour éviter les conflits
@router.get("/{tenant_slug}/actifs/vehicules/alertes-maintenance")
async def get_alertes_maintenance_vehicules(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Retourne les alertes de maintenance pour les véhicules :
    - Vignettes expirant dans 30 jours
    - Entretiens dus selon la périodicité configurée
    - Défectuosités signalées non réparées (délai 48h)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    alertes = []
    today = datetime.now(timezone.utc).date()
    
    # Récupérer tous les véhicules actifs
    vehicules = await db.vehicules.find({
        "tenant_id": tenant.id,
        "statut": {"$in": ["actif", "maintenance"]}
    }, {"_id": 0}).to_list(500)
    
    for v in vehicules:
        vehicule_nom = v.get("nom", "Véhicule inconnu")
        vehicule_id = v.get("id")
        
        # 1. Vérifier la vignette (expiration dans 30 jours)
        vignette_exp = v.get("vignette_date_expiration")
        if vignette_exp:
            try:
                exp_year, exp_month = map(int, vignette_exp.split("-")[:2])
                if exp_month == 12:
                    exp_date = datetime(exp_year + 1, 1, 1).date() - timedelta(days=1)
                else:
                    exp_date = datetime(exp_year, exp_month + 1, 1).date() - timedelta(days=1)
                
                jours_restants = (exp_date - today).days
                
                if jours_restants < 0:
                    alertes.append({
                        "type": "vignette_expiree",
                        "niveau": "critique",
                        "vehicule_id": vehicule_id,
                        "vehicule_nom": vehicule_nom,
                        "message": f"Vignette EXPIRÉE depuis {abs(jours_restants)} jour(s)",
                        "date_echeance": vignette_exp,
                        "jours_restants": jours_restants
                    })
                elif jours_restants <= 30:
                    alertes.append({
                        "type": "vignette_a_renouveler",
                        "niveau": "urgent" if jours_restants <= 7 else "attention",
                        "vehicule_id": vehicule_id,
                        "vehicule_nom": vehicule_nom,
                        "message": f"Vignette expire dans {jours_restants} jour(s)",
                        "date_echeance": vignette_exp,
                        "jours_restants": jours_restants
                    })
            except Exception as e:
                logger.warning(f"Erreur parsing date vignette {vignette_exp}: {e}")
        
        # 2. Vérifier l'entretien périodique
        intervalle_mois = v.get("entretien_intervalle_mois")
        derniere_vidange = v.get("derniere_vidange_date")
        
        if intervalle_mois and derniere_vidange:
            try:
                derniere_date = datetime.strptime(derniere_vidange, "%Y-%m-%d").date()
                prochaine_date = derniere_date + timedelta(days=intervalle_mois * 30)
                jours_restants = (prochaine_date - today).days
                
                if jours_restants < 0:
                    alertes.append({
                        "type": "entretien_du",
                        "niveau": "urgent",
                        "vehicule_id": vehicule_id,
                        "vehicule_nom": vehicule_nom,
                        "message": f"Entretien en retard de {abs(jours_restants)} jour(s)",
                        "date_echeance": prochaine_date.strftime("%Y-%m-%d"),
                        "jours_restants": jours_restants
                    })
                elif jours_restants <= 30:
                    alertes.append({
                        "type": "entretien_a_planifier",
                        "niveau": "attention",
                        "vehicule_id": vehicule_id,
                        "vehicule_nom": vehicule_nom,
                        "message": f"Entretien à planifier dans {jours_restants} jour(s)",
                        "date_echeance": prochaine_date.strftime("%Y-%m-%d"),
                        "jours_restants": jours_restants
                    })
            except Exception as e:
                logger.warning(f"Erreur calcul entretien: {e}")
        
        # 3. Vérifier l'entretien par kilométrage
        intervalle_km = v.get("entretien_intervalle_km")
        derniere_vidange_km = v.get("derniere_vidange_km")
        km_actuel = v.get("kilometrage")
        
        if intervalle_km and derniere_vidange_km and km_actuel:
            km_depuis_vidange = km_actuel - derniere_vidange_km
            km_restants = intervalle_km - km_depuis_vidange
            
            if km_restants <= 0:
                alertes.append({
                    "type": "entretien_km_depasse",
                    "niveau": "urgent",
                    "vehicule_id": vehicule_id,
                    "vehicule_nom": vehicule_nom,
                    "message": f"Entretien dépassé de {abs(int(km_restants))} km",
                    "km_restants": int(km_restants)
                })
            elif km_restants <= 1000:
                alertes.append({
                    "type": "entretien_km_proche",
                    "niveau": "attention",
                    "vehicule_id": vehicule_id,
                    "vehicule_nom": vehicule_nom,
                    "message": f"Entretien dans {int(km_restants)} km",
                    "km_restants": int(km_restants)
                })
    
    # 4. Vérifier les défectuosités non réparées
    reparations_en_cours = await db.reparations_vehicules.find({
        "tenant_id": tenant.id,
        "statut": {"$in": ["en_cours", "planifie"]},
        "priorite": {"$in": ["urgente", "critique"]}
    }, {"_id": 0}).to_list(100)
    
    for rep in reparations_en_cours:
        date_signalement = rep.get("date_signalement")
        if date_signalement:
            try:
                signale_date = datetime.strptime(date_signalement, "%Y-%m-%d")
                heures_depuis = (datetime.now(timezone.utc) - signale_date.replace(tzinfo=timezone.utc)).total_seconds() / 3600
                
                if rep.get("priorite") == "critique":
                    alertes.append({
                        "type": "defectuosite_majeure",
                        "niveau": "critique",
                        "vehicule_id": rep.get("vehicule_id"),
                        "vehicule_nom": rep.get("vehicule_nom", ""),
                        "message": f"Défectuosité MAJEURE: {rep.get('description', '')[:50]}",
                        "reparation_id": rep.get("id")
                    })
                elif heures_depuis > 48:
                    alertes.append({
                        "type": "defectuosite_48h_depassee",
                        "niveau": "urgent",
                        "vehicule_id": rep.get("vehicule_id"),
                        "vehicule_nom": rep.get("vehicule_nom", ""),
                        "message": f"Délai 48h dépassé: {rep.get('description', '')[:50]}",
                        "reparation_id": rep.get("id"),
                        "heures_depuis_signalement": int(heures_depuis)
                    })
            except Exception as e:
                logger.warning(f"Erreur calcul délai réparation: {e}")
    
    # Trier par niveau de criticité
    niveau_ordre = {"critique": 0, "urgent": 1, "attention": 2}
    alertes.sort(key=lambda x: niveau_ordre.get(x.get("niveau"), 3))
    
    return {
        "alertes": alertes,
        "count": len(alertes),
        "critiques": len([a for a in alertes if a.get("niveau") == "critique"]),
        "urgentes": len([a for a in alertes if a.get("niveau") == "urgent"]),
        "attention": len([a for a in alertes if a.get("niveau") == "attention"])
    }


@router.get("/{tenant_slug}/actifs/vehicules/{vehicule_id}/public")
async def get_vehicule_public(tenant_slug: str, vehicule_id: str):
    """Récupère les informations publiques d'un véhicule (pour QR code) - Sans authentification"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    vehicule = await db.vehicules.find_one(
        {"id": vehicule_id, "tenant_id": tenant.id},
        {"_id": 0, "nom": 1, "type_vehicule": 1, "marque": 1, "modele": 1, "numero_plaque": 1, "id": 1, "modele_inventaire_id": 1}
    )
    
    if not vehicule:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    return vehicule


@router.get("/{tenant_slug}/actifs/vehicules/{vehicule_id}", response_model=Vehicule)
async def get_vehicule(
    tenant_slug: str,
    vehicule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère un véhicule spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    vehicule = await db.vehicules.find_one(
        {"id": vehicule_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not vehicule:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    return vehicule


@router.post("/{tenant_slug}/actifs/vehicules", response_model=Vehicule)
async def create_vehicule(
    tenant_slug: str,
    vehicule_data: VehiculeCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée un nouveau véhicule"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    await require_permission(tenant.id, current_user, "actifs", "creer", "vehicules")
    
    vehicule = Vehicule(
        tenant_id=tenant.id,
        **vehicule_data.dict()
    )
    
    log_entry = {
        "date": datetime.now(timezone.utc).isoformat(),
        "user_id": current_user.id,
        "user_name": f"{current_user.prenom} {current_user.nom}",
        "action": "created",
        "details": f"Véhicule {vehicule.nom} créé",
        "gps": None
    }
    vehicule.logs = [log_entry]
    
    await db.vehicules.insert_one(vehicule.dict())
    
    # Broadcast WebSocket pour mise à jour temps réel
    asyncio.create_task(broadcast_actif_update(tenant_slug, "create", {
        "type": "vehicule",
        "id": vehicule.id,
        "nom": vehicule.nom
    }))
    
    return vehicule


@router.put("/{tenant_slug}/actifs/vehicules/{vehicule_id}", response_model=Vehicule)
async def update_vehicule(
    tenant_slug: str,
    vehicule_id: str,
    vehicule_data: VehiculeUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour un véhicule"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    await require_permission(tenant.id, current_user, "actifs", "modifier", "vehicules")
    
    vehicule = await db.vehicules.find_one(
        {"id": vehicule_id, "tenant_id": tenant.id}
    )
    if not vehicule:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    ancien_statut = vehicule.get("statut")
    update_data = {k: v for k, v in vehicule_data.dict(exclude_unset=True).items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.vehicules.update_one(
        {"id": vehicule_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    # Notifier tout le monde si véhicule mis hors service OU de retour en service
    nouveau_statut = update_data.get("statut")
    statuts_hors_service = ["hors_service", "maintenance", "hors service"]
    statuts_en_service = ["en_service", "en service", "actif", "disponible"]
    
    if nouveau_statut and ancien_statut != nouveau_statut:
        vehicule_nom = vehicule.get("nom", "Véhicule")
        
        if nouveau_statut.lower() in statuts_hors_service:
            # Véhicule passe HORS SERVICE
            await notifier_vehicule_ou_materiel_hors_service(
                tenant_id=tenant.id,
                type_actif="vehicule",
                nom_actif=vehicule_nom,
                statut=nouveau_statut,
                raison=vehicule_data.notes if vehicule_data.notes else None,
                modifie_par=f"{current_user.prenom} {current_user.nom}"
            )
        elif nouveau_statut.lower() in statuts_en_service and ancien_statut and ancien_statut.lower() in statuts_hors_service:
            # Véhicule REVIENT en service (était hors service avant)
            await notifier_vehicule_retour_en_service(
                tenant_id=tenant.id,
                nom_vehicule=vehicule_nom,
                modifie_par=f"{current_user.prenom} {current_user.nom}"
            )
    
    updated_vehicule = await db.vehicules.find_one(
        {"id": vehicule_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    # Broadcast WebSocket pour mise à jour temps réel
    asyncio.create_task(broadcast_actif_update(tenant_slug, "update", {
        "type": "vehicule",
        "id": vehicule_id,
        "nom": updated_vehicule.get("nom")
    }))
    
    return updated_vehicule


@router.delete("/{tenant_slug}/actifs/vehicules/{vehicule_id}")
async def delete_vehicule(
    tenant_slug: str,
    vehicule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime un véhicule"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    await require_permission(tenant.id, current_user, "actifs", "supprimer", "vehicules")
    
    vehicule = await db.vehicules.find_one(
        {"id": vehicule_id, "tenant_id": tenant.id}
    )
    if not vehicule:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    await db.vehicules.delete_one({"id": vehicule_id, "tenant_id": tenant.id})
    
    # Broadcast WebSocket pour mise à jour temps réel
    asyncio.create_task(broadcast_actif_update(tenant_slug, "delete", {
        "type": "vehicule",
        "id": vehicule_id
    }))
    
    return {"message": "Véhicule supprimé avec succès"}


@router.post("/{tenant_slug}/actifs/vehicules/{vehicle_id}/qr-code")
async def generate_vehicle_qr_code(
    tenant_slug: str,
    vehicle_id: str,
    current_user: User = Depends(get_current_user)
):
    """Génère un QR code pour un véhicule"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    vehicle = await db.vehicules.find_one(
        {"id": vehicle_id, "tenant_id": tenant.id}
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    frontend_url = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')
    vehicle_url = f"{frontend_url}/qr/{tenant_slug}/vehicule/{vehicle_id}"
    
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(vehicle_url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    
    img_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    # Upload QR code vers Azure Blob Storage
    from services.azure_storage import put_object, generate_sas_url, generate_storage_path
    blob_path = generate_storage_path(tenant.id, "qr-codes", f"vehicule_{vehicle_id}.png")
    put_object(blob_path, buffer.getvalue(), "image/png")
    qr_sas_url = generate_sas_url(blob_path)
    
    await db.vehicules.update_one(
        {"id": vehicle_id},
        {"$set": {
            "qr_code": qr_sas_url,
            "qr_code_blob_name": blob_path,
            "qr_code_url": vehicle_url,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {
        "qr_code": qr_sas_url,
        "qr_code_url": vehicle_url,
        "message": "QR code généré avec succès"
    }


@router.post("/{tenant_slug}/actifs/vehicules/{vehicle_id}/inspection-saaq")
async def create_inspection_saaq(
    tenant_slug: str,
    vehicle_id: str,
    inspection_data: InspectionSAAQCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle inspection SAAQ (Ronde de sécurité)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    vehicle = await db.vehicules.find_one(
        {"id": vehicle_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    # Upload des photos vers Azure Blob Storage
    azure_photo_urls = []
    if inspection_data.photo_urls:
        from services.azure_storage import upload_base64_to_azure, generate_sas_url
        for i, photo_url in enumerate(inspection_data.photo_urls):
            if photo_url.startswith('data:'):
                try:
                    result = upload_base64_to_azure(
                        photo_url, tenant.id, "inspections-saaq", f"inspection_{i}.jpg"
                    )
                    azure_photo_urls.append({
                        "url": result["url"],
                        "blob_name": result["blob_name"],
                        "storage": "azure"
                    })
                except Exception as e:
                    logger.warning(f"Erreur upload photo inspection vers Azure: {e}")
                    azure_photo_urls.append({"url": photo_url, "storage": "legacy"})
            else:
                azure_photo_urls.append({"url": photo_url, "storage": "legacy"})
    
    inspection = InspectionSAAQ(
        tenant_id=tenant.id,
        vehicle_id=vehicle_id,
        inspector_id=inspection_data.inspector_id,
        inspector_name=inspection_data.inspector_name,
        inspector_matricule=inspection_data.inspector_matricule,
        signature_certify=inspection_data.signature_certify,
        signature_gps=inspection_data.signature_gps,
        checklist=inspection_data.checklist,
        defects=inspection_data.defects,
        photo_urls=[p["url"] for p in azure_photo_urls],
        comments=inspection_data.comments,
        device_id=inspection_data.device_id
    )
    
    # Stocker les métadonnées Azure dans le document
    inspection_dict = inspection.dict()
    inspection_dict["photo_metadata"] = azure_photo_urls
    
    has_major = any(defect.severity == "majeure" for defect in inspection.defects)
    
    inspection.has_major_defect = has_major
    inspection.passed = not has_major
    
    await db.inspections_saaq.insert_one(inspection_dict)
    
    if has_major:
        await db.vehicules.update_one(
            {"id": vehicle_id},
            {"$set": {
                "statut": "maintenance",
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        log_entry = AuditLogEntry(
            user_id=current_user.id,
            user_name=f"{current_user.prenom} {current_user.nom}",
            action="inspection_defaut_majeur",
            details="Inspection SAAQ - Défaut majeur détecté. Véhicule mis hors service.",
            gps=inspection_data.signature_gps
        )
        
        await db.vehicules.update_one(
            {"id": vehicle_id},
            {"$push": {"logs": log_entry.dict()}}
        )
    else:
        log_entry = AuditLogEntry(
            user_id=current_user.id,
            user_name=f"{current_user.prenom} {current_user.nom}",
            action="inspection_passed",
            details="Inspection SAAQ réussie - Aucun défaut majeur",
            gps=inspection_data.signature_gps
        )
        
        await db.vehicules.update_one(
            {"id": vehicle_id},
            {"$push": {"logs": log_entry.dict()}}
        )
    
    await db.vehicules.update_one(
        {"id": vehicle_id},
        {"$set": {
            "derniere_inspection_id": inspection.id,
            "derniere_inspection_date": inspection.inspection_date.isoformat()
        }}
    )
    
    return {
        "message": "Inspection créée avec succès",
        "inspection_id": inspection.id,
        "vehicle_status": "maintenance" if has_major else "actif",
        "passed": inspection.passed
    }


@router.get("/{tenant_slug}/actifs/vehicules/{vehicle_id}/inspections")
async def get_vehicle_inspections(
    tenant_slug: str,
    vehicle_id: str,
    limit: int = 50,
    current_user: User = Depends(get_current_user)
):
    """Récupère l'historique des inspections d'un véhicule"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    vehicle = await db.vehicules.find_one(
        {"id": vehicle_id, "tenant_id": tenant.id}
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    inspections = await db.inspections_saaq.find(
        {"vehicle_id": vehicle_id, "tenant_id": tenant.id},
        {"_id": 0}
    ).sort("inspection_date", -1).limit(limit).to_list(limit)
    
    return inspections


@router.get("/{tenant_slug}/actifs/vehicules/{vehicle_id}/fiche-vie")
async def get_vehicle_lifecycle(
    tenant_slug: str,
    vehicle_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère la fiche de vie complète d'un véhicule (audit trail + réparations)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    vehicle = await db.vehicules.find_one(
        {"id": vehicle_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    # Récupérer les réparations/entretiens (2 dernières années par défaut)
    two_years_ago = (datetime.now(timezone.utc) - timedelta(days=730)).strftime("%Y-%m-%d")
    reparations = await db.reparations_vehicules.find({
        "tenant_id": tenant.id,
        "vehicule_id": vehicle_id,
        "date_reparation": {"$gte": two_years_ago}
    }, {"_id": 0}).sort("date_reparation", -1).to_list(500)
    
    # Calculer les statistiques de coûts
    cout_total = sum(r.get("cout", 0) or 0 for r in reparations)
    cout_par_type = {}
    for r in reparations:
        t = r.get("type_intervention", "autre")
        cout_par_type[t] = cout_par_type.get(t, 0) + (r.get("cout", 0) or 0)
    
    # Récupérer les rondes de sécurité récentes
    rondes = await db.rondes_securite.find({
        "tenant_id": tenant.id,
        "vehicule_id": vehicle_id
    }, {"_id": 0}).sort("date_ronde", -1).limit(20).to_list(20)
    
    # Récupérer les inventaires récents
    inventaires = await db.inventaires_vehicules.find({
        "tenant_id": tenant.id,
        "vehicule_id": vehicle_id
    }, {"_id": 0}).sort("date_inventaire", -1).limit(20).to_list(20)
    
    return {
        "vehicle_id": vehicle_id,
        "vehicle_name": vehicle.get("nom", ""),
        "vehicle_type": vehicle.get("type_vehicule", ""),
        "marque": vehicle.get("marque", ""),
        "modele": vehicle.get("modele", ""),
        "annee": vehicle.get("annee"),
        "vin": vehicle.get("vin", ""),
        "kilometrage": vehicle.get("kilometrage"),
        "statut": vehicle.get("statut", ""),
        "created_at": vehicle.get("created_at"),
        
        # Infos SAAQ/PEP
        "poids_pnbv": vehicle.get("poids_pnbv"),
        "classification_saaq": vehicle.get("classification_saaq"),
        "vignette_numero": vehicle.get("vignette_numero"),
        "vignette_date_inspection": vehicle.get("vignette_date_inspection"),
        "vignette_date_expiration": vehicle.get("vignette_date_expiration"),
        "vignette_statut": vehicle.get("vignette_statut"),
        
        # Entretien périodique
        "entretien_intervalle_mois": vehicle.get("entretien_intervalle_mois"),
        "entretien_intervalle_km": vehicle.get("entretien_intervalle_km"),
        "derniere_vidange_date": vehicle.get("derniere_vidange_date"),
        "derniere_vidange_km": vehicle.get("derniere_vidange_km"),
        
        # Historique
        "logs": vehicle.get("logs", []),
        "reparations": reparations,
        "rondes_securite": rondes,
        "inventaires": inventaires,
        
        # Statistiques budget
        "stats_budget": {
            "cout_total_2ans": round(cout_total, 2),
            "cout_par_type": {k: round(v, 2) for k, v in cout_par_type.items()},
            "nb_reparations": len(reparations)
        }
    }


# ==================== ROUTES - MATÉRIELS POUR INTERVENTIONS ====================

@router.get("/{tenant_slug}/actifs/materiels")
async def get_materiels_pour_interventions(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère la liste des équipements/matériels pour utilisation dans les interventions."""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    equipements = await db.equipements.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).sort("nom", 1).to_list(10000)
    
    materiels = []
    for eq in equipements:
        materiel = {
            "id": eq.get("id"),
            "nom": eq.get("nom", ""),
            "designation": eq.get("nom", ""),
            "type": eq.get("categorie_nom", ""),
            "categorie": eq.get("categorie_nom", ""),
            "numero_serie": eq.get("code_unique", ""),
            "code_unique": eq.get("code_unique", ""),
            "etat": eq.get("etat", "bon"),
            "quantite": eq.get("quantite", 1),
            "quantite_disponible": eq.get("quantite", 1),
            "gerer_quantite": eq.get("gerer_quantite", False),
            "est_consommable": eq.get("gerer_quantite", False),
            "emplacement_nom": eq.get("emplacement_nom", ""),
            "vehicule_nom": eq.get("vehicule_nom", ""),
            "description": eq.get("description", ""),
        }
        materiels.append(materiel)
    
    return materiels


# ==================== ROUTES - BORNES D'INCENDIE ====================

@router.get("/{tenant_slug}/actifs/bornes", response_model=List[BorneIncendie])
async def get_bornes(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère la liste de toutes les bornes d'incendie du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    bornes = await db.bornes_incendie.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(length=None)
    
    return bornes


@router.get("/{tenant_slug}/actifs/bornes/{borne_id}", response_model=BorneIncendie)
async def get_borne(
    tenant_slug: str,
    borne_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère une borne d'incendie spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    borne = await db.bornes_incendie.find_one(
        {"id": borne_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not borne:
        raise HTTPException(status_code=404, detail="Borne d'incendie non trouvée")
    
    return borne


@router.post("/{tenant_slug}/actifs/bornes", response_model=BorneIncendie)
async def create_borne(
    tenant_slug: str,
    borne_data: BorneIncendieCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée une nouvelle borne d'incendie"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    await require_permission(tenant.id, current_user, "actifs", "creer", "eau")
    
    borne = BorneIncendie(
        tenant_id=tenant.id,
        **borne_data.dict()
    )
    
    log_entry = {
        "date": datetime.now(timezone.utc).isoformat(),
        "user_id": current_user.id,
        "user_name": f"{current_user.prenom} {current_user.nom}",
        "action": "created",
        "details": f"Borne {borne.nom} créée",
        "gps": borne.localisation_gps.dict() if borne.localisation_gps else None
    }
    borne.logs = [log_entry]
    
    await db.bornes_incendie.insert_one(borne.dict())
    
    return borne


@router.put("/{tenant_slug}/actifs/bornes/{borne_id}", response_model=BorneIncendie)
async def update_borne(
    tenant_slug: str,
    borne_id: str,
    borne_data: BorneIncendieUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour une borne d'incendie"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    await require_permission(tenant.id, current_user, "actifs", "modifier", "eau")
    
    borne = await db.bornes_incendie.find_one(
        {"id": borne_id, "tenant_id": tenant.id}
    )
    if not borne:
        raise HTTPException(status_code=404, detail="Borne d'incendie non trouvée")
    
    update_data = {k: v for k, v in borne_data.dict(exclude_unset=True).items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.bornes_incendie.update_one(
        {"id": borne_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated_borne = await db.bornes_incendie.find_one(
        {"id": borne_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    return updated_borne


@router.delete("/{tenant_slug}/actifs/bornes/{borne_id}")
async def delete_borne(
    tenant_slug: str,
    borne_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime une borne d'incendie"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    await require_permission(tenant.id, current_user, "actifs", "supprimer", "eau")
    
    borne = await db.bornes_incendie.find_one(
        {"id": borne_id, "tenant_id": tenant.id}
    )
    if not borne:
        raise HTTPException(status_code=404, detail="Borne d'incendie non trouvée")
    
    await db.bornes_incendie.delete_one({"id": borne_id, "tenant_id": tenant.id})
    
    return {"message": "Borne d'incendie supprimée avec succès"}


@router.post("/{tenant_slug}/actifs/bornes/{borne_id}/qr-code")
async def generate_borne_qr_code(
    tenant_slug: str,
    borne_id: str,
    current_user: User = Depends(get_current_user)
):
    """Génère un QR code pour une borne d'incendie"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    borne = await db.bornes_incendie.find_one(
        {"id": borne_id, "tenant_id": tenant.id}
    )
    if not borne:
        raise HTTPException(status_code=404, detail="Borne non trouvée")
    
    frontend_url = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')
    borne_url = f"{frontend_url}/{tenant_slug}/actifs/bornes/{borne_id}"
    
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(borne_url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    
    img_base64 = base64.b64encode(buffer.getvalue()).decode()
    qr_code_data_url = f"data:image/png;base64,{img_base64}"
    
    await db.bornes_incendie.update_one(
        {"id": borne_id},
        {"$set": {
            "qr_code": qr_code_data_url,
            "qr_code_url": borne_url,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {
        "qr_code": qr_code_data_url,
        "qr_code_url": borne_url,
        "message": "QR code généré avec succès"
    }


@router.post("/{tenant_slug}/actifs/bornes/import-inspections")
async def import_inspections_bornes(
    tenant_slug: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Importer des inspections de bornes fontaines depuis un fichier CSV"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "actifs", "creer", "eau")
    
    contents = await file.read()
    try:
        csv_text = contents.decode('utf-8')
    except UnicodeDecodeError:
        csv_text = contents.decode('latin-1')
    
    csv_reader = csv.DictReader(StringIO(csv_text))
    
    imported = 0
    errors = 0
    error_details = []
    
    for row in csv_reader:
        try:
            numero_borne = row.get('numero_borne', '').strip()
            date_inspection = row.get('date_inspection', '').strip()
            debit_gpm = row.get('debit_gpm', '').strip()
            etat = row.get('etat', 'conforme').strip()
            observations = row.get('observations', '').strip()
            
            if not numero_borne or not date_inspection:
                errors += 1
                error_details.append("Ligne ignorée: numero_borne ou date_inspection manquant")
                continue
            
            borne = await db.bornes_incendie.find_one({
                "tenant_id": tenant.id,
                "nom": numero_borne
            })
            
            if not borne:
                errors += 1
                error_details.append(f"Borne {numero_borne} non trouvée")
                continue
            
            inspection = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant.id,
                "borne_id": borne['id'],
                "numero_borne": numero_borne,
                "date_inspection": date_inspection,
                "debit_mesure_gpm": float(debit_gpm) if debit_gpm else None,
                "etat_general": etat,
                "observations": observations,
                "inspecteur_id": current_user.id,
                "inspecteur_nom": f"{current_user.prenom} {current_user.nom}",
                "source": "import_csv",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.inspections_bornes.insert_one(inspection)
            
            await db.bornes_incendie.update_one(
                {"id": borne['id']},
                {"$set": {
                    "date_derniere_inspection": date_inspection,
                    "dernier_etat_inspection": etat,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            imported += 1
            
        except Exception as e:
            errors += 1
            error_details.append(f"Erreur ligne {csv_reader.line_num}: {str(e)}")
            continue
    
    return {
        "imported": imported,
        "errors": errors,
        "error_details": error_details[:10],
        "message": f"{imported} inspection(s) importée(s), {errors} erreur(s)"
    }


class ImportBornesFontainesRequest(BaseModel):
    inspections: List[dict]

@router.post("/{tenant_slug}/actifs/bornes-fontaines/import-csv")
async def import_inspections_bornes_fontaines_mapped(
    tenant_slug: str,
    request: ImportBornesFontainesRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Import des inspections de bornes fontaines avec mapping pré-défini par le frontend.
    Les données arrivent déjà mappées aux bons champs.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "actifs", "creer", "eau")
    
    created = 0
    updated = 0
    erreurs = []
    
    for idx, insp_data in enumerate(request.inspections):
        try:
            # Trouver la borne
            numero_borne = str(insp_data.get('numero_borne', '')).strip()
            if not numero_borne:
                erreurs.append({"ligne": idx + 1, "erreur": "Numéro de borne manquant"})
                continue
            
            # Chercher dans bornes_incendie ou points_eau
            borne = await db.bornes_incendie.find_one({
                "tenant_id": tenant.id,
                "$or": [
                    {"nom": {"$regex": f"^{numero_borne}$", "$options": "i"}},
                    {"numero_identification": {"$regex": f"^{numero_borne}$", "$options": "i"}}
                ]
            })
            
            if not borne:
                # Essayer dans points_eau
                borne = await db.points_eau.find_one({
                    "tenant_id": tenant.id,
                    "type": "borne_fontaine",
                    "$or": [
                        {"nom": {"$regex": f"^{numero_borne}$", "$options": "i"}},
                        {"numero_identification": {"$regex": f"^{numero_borne}$", "$options": "i"}}
                    ]
                })
            
            if not borne:
                erreurs.append({"ligne": idx + 1, "erreur": f"Borne '{numero_borne}' non trouvée"})
                continue
            
            # Parser la date
            date_str = str(insp_data.get('date_inspection', '')).strip()
            date_inspection = None
            if date_str:
                for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d']:
                    try:
                        date_inspection = datetime.strptime(date_str, fmt).strftime('%Y-%m-%d')
                        break
                    except:
                        continue
            
            if not date_inspection:
                date_inspection = datetime.now(timezone.utc).strftime('%Y-%m-%d')
            
            # Parser les valeurs numériques
            debit_gpm = None
            debit_str = str(insp_data.get('debit_gpm', '')).strip()
            if debit_str:
                try:
                    debit_gpm = float(debit_str.replace(',', '.'))
                except:
                    pass
            
            pression_statique = None
            ps_str = str(insp_data.get('pression_statique', '')).strip()
            if ps_str:
                try:
                    pression_statique = float(ps_str.replace(',', '.'))
                except:
                    pass
            
            pression_residuelle = None
            pr_str = str(insp_data.get('pression_residuelle', '')).strip()
            if pr_str:
                try:
                    pression_residuelle = float(pr_str.replace(',', '.'))
                except:
                    pass
            
            etat = str(insp_data.get('etat', 'conforme')).strip().lower()
            if etat not in ['conforme', 'non_conforme', 'defectueux']:
                etat = 'conforme'
            
            inspection = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant.id,
                "borne_id": borne['id'],
                "numero_borne": borne.get('nom') or borne.get('numero_identification'),
                "date_inspection": date_inspection,
                "debit_mesure_gpm": debit_gpm,
                "pression_statique_psi": pression_statique,
                "pression_residuelle_psi": pression_residuelle,
                "etat_general": etat,
                "observations": str(insp_data.get('observations', '')).strip(),
                "inspecteur_nom": str(insp_data.get('inspecteur', '')).strip() or f"{current_user.prenom} {current_user.nom}",
                "inspecteur_id": current_user.id,
                "source": "import_csv_mapping",
                "imported_by": current_user.id,
                "imported_at": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.inspections_bornes.insert_one(inspection)
            created += 1
            
            # Mettre à jour la borne
            update_collection = "bornes_incendie" if await db.bornes_incendie.find_one({"id": borne['id']}) else "points_eau"
            await db[update_collection].update_one(
                {"id": borne['id']},
                {"$set": {
                    "date_derniere_inspection": date_inspection,
                    "dernier_etat_inspection": etat,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
        except Exception as e:
            logger.error(f"Erreur import ligne {idx + 1}: {e}")
            erreurs.append({"ligne": idx + 1, "erreur": str(e)})
    
    logger.info(f"Import bornes fontaines terminé: {created} créées, {len(erreurs)} erreurs")
    
    return {
        "success": True,
        "created": created,
        "updated": updated,
        "errors": erreurs
    }



# ==================== ROUTES - INVENTAIRES ====================

@router.get("/{tenant_slug}/actifs/inventaires/modeles", response_model=List[ModeleInventaire])
async def get_modeles_inventaire(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère la liste des modèles d'inventaire du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    modeles = await db.modeles_inventaire.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(length=None)
    
    return modeles


@router.get("/{tenant_slug}/actifs/inventaires/modeles/{modele_id}", response_model=ModeleInventaire)
async def get_modele_inventaire(
    tenant_slug: str,
    modele_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère un modèle d'inventaire spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    modele = await db.modeles_inventaire.find_one(
        {"id": modele_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not modele:
        raise HTTPException(status_code=404, detail="Modèle d'inventaire non trouvé")
    
    return modele


@router.post("/{tenant_slug}/actifs/inventaires/modeles", response_model=ModeleInventaire)
async def create_modele_inventaire(
    tenant_slug: str,
    modele_data: ModeleInventaireCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée un nouveau modèle d'inventaire"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    await require_permission(tenant.id, current_user, "actifs", "creer", "materiel")
    
    modele = ModeleInventaire(
        tenant_id=tenant.id,
        **modele_data.dict()
    )
    
    await db.modeles_inventaire.insert_one(modele.dict())
    
    return modele


@router.put("/{tenant_slug}/actifs/inventaires/modeles/{modele_id}", response_model=ModeleInventaire)
async def update_modele_inventaire(
    tenant_slug: str,
    modele_id: str,
    modele_data: ModeleInventaireUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour un modèle d'inventaire"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    await require_permission(tenant.id, current_user, "actifs", "modifier", "materiel")
    
    modele = await db.modeles_inventaire.find_one(
        {"id": modele_id, "tenant_id": tenant.id}
    )
    if not modele:
        raise HTTPException(status_code=404, detail="Modèle d'inventaire non trouvé")
    
    update_data = {k: v for k, v in modele_data.dict(exclude_unset=True).items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.modeles_inventaire.update_one(
        {"id": modele_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated_modele = await db.modeles_inventaire.find_one(
        {"id": modele_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    return updated_modele


@router.delete("/{tenant_slug}/actifs/inventaires/modeles/{modele_id}")
async def delete_modele_inventaire(
    tenant_slug: str,
    modele_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime un modèle d'inventaire"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    await require_permission(tenant.id, current_user, "actifs", "supprimer", "materiel")
    
    modele = await db.modeles_inventaire.find_one(
        {"id": modele_id, "tenant_id": tenant.id}
    )
    if not modele:
        raise HTTPException(status_code=404, detail="Modèle d'inventaire non trouvé")
    
    vehicules_utilisant = await db.vehicules.count_documents({
        "tenant_id": tenant.id,
        "modele_inventaire_id": modele_id
    })
    
    if vehicules_utilisant > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Ce modèle est utilisé par {vehicules_utilisant} véhicule(s) et ne peut pas être supprimé"
        )
    
    await db.modeles_inventaire.delete_one({"id": modele_id, "tenant_id": tenant.id})
    
    return {"message": "Modèle d'inventaire supprimé avec succès"}


# ==================== ROUTES - INSPECTIONS INVENTAIRE ====================

@router.get("/{tenant_slug}/actifs/inventaires/inspections", response_model=List[InspectionInventaire])
async def get_inspections_inventaire(
    tenant_slug: str,
    vehicule_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupère la liste des inspections d'inventaire"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    query = {"tenant_id": tenant.id}
    
    if vehicule_id:
        query["vehicule_id"] = vehicule_id
    
    # Les employés ne voient que leurs propres inspections sauf s'ils ont la permission "voir" sur le module
    can_view_all = await user_has_module_action(tenant.id, current_user, "actifs", "voir", "materiel")
    if not can_view_all:
        query["inspecteur_id"] = current_user.id
    
    inspections = await db.inspections_inventaire.find(
        query,
        {"_id": 0}
    ).sort("date_inspection", -1).to_list(length=None)
    
    return inspections


@router.get("/{tenant_slug}/actifs/inventaires/inspections/{inspection_id}", response_model=InspectionInventaire)
async def get_inspection_inventaire(
    tenant_slug: str,
    inspection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère une inspection d'inventaire spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    inspection = await db.inspections_inventaire.find_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    # Vérifier si l'utilisateur peut voir cette inspection
    can_view_all = await user_has_module_action(tenant.id, current_user, "actifs", "voir", "materiel")
    if not can_view_all and inspection["inspecteur_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    return inspection


@router.post("/{tenant_slug}/actifs/inventaires/inspections", response_model=InspectionInventaire)
async def create_inspection_inventaire(
    tenant_slug: str,
    inspection_data: InspectionInventaireCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée une nouvelle inspection d'inventaire"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    vehicule = await db.vehicules.find_one({
        "id": inspection_data.vehicule_id,
        "tenant_id": tenant.id
    })
    if not vehicule:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    modele = await db.modeles_inventaire.find_one({
        "id": inspection_data.modele_inventaire_id,
        "tenant_id": tenant.id
    })
    if not modele:
        raise HTTPException(status_code=404, detail="Modèle d'inventaire non trouvé")
    
    inspecteur = await db.users.find_one({"id": inspection_data.inspecteur_id})
    inspecteur_nom = f"{inspecteur.get('prenom', '')} {inspecteur.get('nom', '')}".strip() if inspecteur else None
    
    inspection = InspectionInventaire(
        tenant_id=tenant.id,
        inspecteur_nom=inspecteur_nom,
        **inspection_data.dict()
    )
    
    await db.inspections_inventaire.insert_one(inspection.dict())
    
    return inspection


@router.put("/{tenant_slug}/actifs/inventaires/inspections/{inspection_id}", response_model=InspectionInventaire)
async def update_inspection_inventaire(
    tenant_slug: str,
    inspection_id: str,
    inspection_data: InspectionInventaireUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour une inspection d'inventaire"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    inspection = await db.inspections_inventaire.find_one(
        {"id": inspection_id, "tenant_id": tenant.id}
    )
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    # Vérifier si l'utilisateur peut modifier cette inspection
    can_modify_all = await user_has_module_action(tenant.id, current_user, "actifs", "modifier", "materiel")
    if not can_modify_all and inspection["inspecteur_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    update_data = {k: v for k, v in inspection_data.dict(exclude_unset=True).items() if v is not None}
    
    if inspection_data.statut == "complete" and inspection.get("statut") != "complete":
        update_data["completed_at"] = datetime.now(timezone.utc)
    
    await db.inspections_inventaire.update_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated_inspection = await db.inspections_inventaire.find_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    return updated_inspection


@router.delete("/{tenant_slug}/actifs/inventaires/inspections/{inspection_id}")
async def delete_inspection_inventaire(
    tenant_slug: str,
    inspection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime une inspection d'inventaire"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    await require_permission(tenant.id, current_user, "actifs", "supprimer", "materiel")
    
    inspection = await db.inspections_inventaire.find_one(
        {"id": inspection_id, "tenant_id": tenant.id}
    )
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    await db.inspections_inventaire.delete_one({"id": inspection_id, "tenant_id": tenant.id})
    
    return {"message": "Inspection supprimée avec succès"}


# ==================== ROUTES - RONDES DE SÉCURITÉ (SAAQ - Loi 430) ====================

# Points de vérification SAAQ avec défauts prédéfinis
POINTS_VERIFICATION_SAAQ = {
    "1": {"id": "1", "label": "Attelage", "key": "attelage", "defects": [
        {"id": "1.1", "desc": "Jeu excessif dans la sellette ou le crochet d'attelage", "severity": "MAJEUR"},
        {"id": "1.2", "desc": "Fissure visible dans la sellette ou le crochet", "severity": "MAJEUR"},
        {"id": "1.3", "desc": "Mécanisme de verrouillage défectueux", "severity": "MAJEUR"},
        {"id": "1.4", "desc": "Usure anormale des composants", "severity": "MINEUR"}
    ]},
    "2": {"id": "2", "label": "Habitacle (siège conducteur)", "key": "habitacle", "defects": [
        {"id": "2.1", "desc": "Siège du conducteur mal fixé ou instable", "severity": "MAJEUR"},
        {"id": "2.2", "desc": "Ceinture de sécurité défectueuse ou manquante", "severity": "MAJEUR"},
        {"id": "2.3", "desc": "Mécanisme de réglage du siège défaillant", "severity": "MINEUR"},
        {"id": "2.4", "desc": "Appuie-tête manquant ou mal fixé", "severity": "MINEUR"}
    ]},
    "3": {"id": "3", "label": "Carrosserie", "key": "carrosserie", "defects": [
        {"id": "3.1", "desc": "Panneau de carrosserie mal fixé", "severity": "MINEUR"},
        {"id": "3.2", "desc": "Porte d'équipement mal fixée ou difficile à ouvrir", "severity": "MINEUR"},
        {"id": "3.3", "desc": "Corrosion importante affectant la structure", "severity": "MAJEUR"},
        {"id": "3.4", "desc": "Élément de carrosserie présentant un risque", "severity": "MAJEUR"}
    ]},
    "4": {"id": "4", "label": "Direction", "key": "direction", "defects": [
        {"id": "4.1", "desc": "Jeu excessif dans le volant de direction", "severity": "MAJEUR"},
        {"id": "4.2", "desc": "Fuite de liquide de direction assistée", "severity": "MAJEUR"},
        {"id": "4.3", "desc": "Difficulté anormale à tourner le volant", "severity": "MAJEUR"},
        {"id": "4.4", "desc": "Bruit anormal dans la colonne de direction", "severity": "MINEUR"}
    ]},
    "5": {"id": "5", "label": "Éclairage (Phares)", "key": "eclairage_phares", "defects": [
        {"id": "5.1", "desc": "Un phare brûlé (circulation de jour)", "severity": "MINEUR"},
        {"id": "5.2", "desc": "Aucun phare fonctionnel (circulation de nuit)", "severity": "MAJEUR"},
        {"id": "5.3", "desc": "Phares mal alignés", "severity": "MINEUR"},
        {"id": "5.4", "desc": "Verre de phare brisé ou opaque", "severity": "MINEUR"}
    ]},
    "6": {"id": "6", "label": "Essuie-glaces et lave-glace", "key": "essuie_glaces", "defects": [
        {"id": "6.1", "desc": "Balai d'essuie-glace manquant ou défectueux", "severity": "MINEUR"},
        {"id": "6.2", "desc": "Système d'essuie-glace ne fonctionne pas", "severity": "MAJEUR"},
        {"id": "6.3", "desc": "Réservoir de lave-glace vide", "severity": "MINEUR"},
        {"id": "6.4", "desc": "Gicleurs de lave-glace bouchés", "severity": "MINEUR"}
    ]},
    "7": {"id": "7", "label": "Matériel d'urgence", "key": "materiel_urgence", "defects": [
        {"id": "7.1", "desc": "Extincteur vide ou manquant", "severity": "MINEUR"},
        {"id": "7.2", "desc": "Trousse de premiers soins incomplète ou manquante", "severity": "MINEUR"},
        {"id": "7.3", "desc": "Triangles de signalisation manquants", "severity": "MINEUR"},
        {"id": "7.4", "desc": "Lampe de poche non fonctionnelle", "severity": "MINEUR"}
    ]},
    "8": {"id": "8", "label": "Phares et feux", "key": "phares_feux", "defects": [
        {"id": "8.1", "desc": "Feu de position brûlé", "severity": "MINEUR"},
        {"id": "8.2", "desc": "Aucun feu de freinage (stop) ne fonctionne", "severity": "MAJEUR"},
        {"id": "8.3", "desc": "Feu de recul non fonctionnel", "severity": "MINEUR"},
        {"id": "8.4", "desc": "Clignotant défectueux", "severity": "MINEUR"},
        {"id": "8.5", "desc": "Gyrophare ou feu d'urgence non fonctionnel", "severity": "MINEUR"}
    ]},
    "9": {"id": "9", "label": "Pneus", "key": "pneus", "defects": [
        {"id": "9.1", "desc": "Coupure profonde ou structure apparente", "severity": "MAJEUR"},
        {"id": "9.2", "desc": "Usure excessive de la bande de roulement", "severity": "MAJEUR"},
        {"id": "9.3", "desc": "Pression inadéquate", "severity": "MINEUR"},
        {"id": "9.4", "desc": "Pneu dépareillé ou non conforme", "severity": "MINEUR"},
        {"id": "9.5", "desc": "Renflement ou déformation du pneu", "severity": "MAJEUR"}
    ]},
    "10": {"id": "10", "label": "Portes et issues", "key": "portes_issues", "defects": [
        {"id": "10.1", "desc": "Porte ne ferme pas correctement", "severity": "MAJEUR"},
        {"id": "10.2", "desc": "Porte ne s'ouvre pas de l'intérieur", "severity": "MAJEUR"},
        {"id": "10.3", "desc": "Serrure de porte défectueuse", "severity": "MINEUR"},
        {"id": "10.4", "desc": "Issue de secours bloquée ou inaccessible", "severity": "MAJEUR"}
    ]},
    "11": {"id": "11", "label": "Rétroviseurs", "key": "retroviseurs", "defects": [
        {"id": "11.1", "desc": "Miroir cassé ou fêlé", "severity": "MINEUR"},
        {"id": "11.2", "desc": "Rétroviseur mal fixé ou instable", "severity": "MINEUR"},
        {"id": "11.3", "desc": "Rétroviseur manquant", "severity": "MAJEUR"},
        {"id": "11.4", "desc": "Visibilité insuffisante par les rétroviseurs", "severity": "MINEUR"}
    ]},
    "12": {"id": "12", "label": "Châssis", "key": "chassis", "defects": [
        {"id": "12.1", "desc": "Élément de structure fissuré", "severity": "MAJEUR"},
        {"id": "12.2", "desc": "Châssis affaissé ou déformé", "severity": "MAJEUR"},
        {"id": "12.3", "desc": "Corrosion importante affectant la structure", "severity": "MAJEUR"},
        {"id": "12.4", "desc": "Boulon ou rivet de châssis manquant", "severity": "MAJEUR"}
    ]},
    "13": {"id": "13", "label": "Suspension", "key": "suspension", "defects": [
        {"id": "13.1", "desc": "Lame de ressort brisée", "severity": "MAJEUR"},
        {"id": "13.2", "desc": "Fuite d'amortisseur", "severity": "MINEUR"},
        {"id": "13.3", "desc": "Amortisseur inefficace", "severity": "MINEUR"},
        {"id": "13.4", "desc": "Silentbloc usé ou endommagé", "severity": "MINEUR"},
        {"id": "13.5", "desc": "Barre stabilisatrice défectueuse", "severity": "MINEUR"}
    ]},
    "14": {"id": "14", "label": "Système d'échappement", "key": "systeme_echappement", "defects": [
        {"id": "14.1", "desc": "Fuite de gaz d'échappement vers l'habitacle", "severity": "MAJEUR"},
        {"id": "14.2", "desc": "Silencieux percé ou bruyant", "severity": "MINEUR"},
        {"id": "14.3", "desc": "Tuyau d'échappement mal fixé", "severity": "MINEUR"},
        {"id": "14.4", "desc": "Émissions excessives de fumée", "severity": "MINEUR"}
    ]},
    "15": {"id": "15", "label": "Système d'alimentation en carburant", "key": "systeme_alimentation", "defects": [
        {"id": "15.1", "desc": "Fuite de carburant (goutte à goutte)", "severity": "MAJEUR"},
        {"id": "15.2", "desc": "Bouchon de réservoir manquant ou défectueux", "severity": "MINEUR"},
        {"id": "15.3", "desc": "Odeur de carburant dans l'habitacle", "severity": "MAJEUR"},
        {"id": "15.4", "desc": "Conduite de carburant endommagée", "severity": "MAJEUR"}
    ]},
    "16": {"id": "16", "label": "Roues et moyeux", "key": "roues_moyeux", "defects": [
        {"id": "16.1", "desc": "Écrou de roue manquant", "severity": "MAJEUR"},
        {"id": "16.2", "desc": "Jante fissurée ou déformée", "severity": "MAJEUR"},
        {"id": "16.3", "desc": "Écrou de roue desserré", "severity": "MAJEUR"},
        {"id": "16.4", "desc": "Roulement de roue bruyant ou usé", "severity": "MINEUR"}
    ]},
    "17": {"id": "17", "label": "Système de freins (général)", "key": "systeme_freins", "defects": [
        {"id": "17.1", "desc": "Efficacité de freinage insuffisante", "severity": "MAJEUR"},
        {"id": "17.2", "desc": "Frein de stationnement inefficace", "severity": "MAJEUR"},
        {"id": "17.3", "desc": "Témoin de frein allumé au tableau de bord", "severity": "MAJEUR"},
        {"id": "17.4", "desc": "Bruit anormal lors du freinage", "severity": "MINEUR"}
    ]},
    "18": {"id": "18", "label": "Freins hydrauliques", "key": "freins_hydrauliques", "requires_brake_type": ["HYDRAULIC", "BOTH"], "defects": [
        {"id": "18.1", "desc": "Fuite de liquide de frein", "severity": "MAJEUR"},
        {"id": "18.2", "desc": "Pédale de frein spongieuse", "severity": "MAJEUR"},
        {"id": "18.3", "desc": "Niveau de liquide de frein bas", "severity": "MAJEUR"},
        {"id": "18.4", "desc": "Maître-cylindre défectueux", "severity": "MAJEUR"},
        {"id": "18.5", "desc": "Flexible de frein endommagé ou usé", "severity": "MAJEUR"}
    ]},
    "19": {"id": "19", "label": "Freins pneumatiques", "key": "freins_pneumatiques", "requires_brake_type": ["PNEUMATIC", "BOTH"], "defects": [
        {"id": "19.1", "desc": "Fuite d'air audible", "severity": "MAJEUR"},
        {"id": "19.2", "desc": "Chute de pression rapide dans le système", "severity": "MAJEUR"},
        {"id": "19.3", "desc": "Compresseur d'air défaillant", "severity": "MAJEUR"},
        {"id": "19.4", "desc": "Réservoir d'air corrodé ou endommagé", "severity": "MAJEUR"},
        {"id": "19.5", "desc": "Valve de purge automatique défectueuse", "severity": "MINEUR"}
    ]}
}


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
        
        if requires_brake_type:
            if brake_system_type in requires_brake_type:
                points_filtres[point_id] = point_data
        else:
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
    Créer une nouvelle ronde de sécurité SAAQ (Loi 430).
    
    Logique de sévérité:
    - MAJEUR: Véhicule HORS SERVICE immédiatement, notification urgente
    - MINEUR: Véhicule DISPONIBLE mais réparation requise sous 48h
    - CONFORME: Véhicule opérationnel
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    vehicle = await db.vehicules.find_one(
        {"id": ronde_data.vehicule_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    # Calculer la sévérité globale à partir des défauts sélectionnés
    defauts = getattr(ronde_data, 'defauts_selectionnes', []) or []
    severite_globale = "CONFORME"
    defauts_majeurs = [d for d in defauts if d.get("severity") == "MAJEUR"]
    defauts_mineurs = [d for d in defauts if d.get("severity") == "MINEUR"]
    
    if defauts_majeurs:
        severite_globale = "MAJEUR"
    elif defauts_mineurs:
        severite_globale = "MINEUR"
    
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
        contre_signatures=[],
        created_by=current_user.id,
        defauts_selectionnes=defauts,
        severite_globale=severite_globale
    )
    
    # Planifier rappel 48h si défaut MINEUR
    if severite_globale == "MINEUR":
        ronde.date_rappel_48h = datetime.now(timezone.utc) + timedelta(hours=48)
    
    ronde_dict = ronde.dict()
    await db.rondes_securite.insert_one(ronde_dict)
    
    # Préparer la réponse AVANT les opérations post-save (pour garantir le retour)
    # Convertir les datetimes en ISO strings pour éviter les erreurs de sérialisation
    ronde_response = {k: v for k, v in ronde_dict.items() if k != '_id'}
    for key in ('created_at', 'date_rappel_48h'):
        if key in ronde_response and isinstance(ronde_response[key], datetime):
            ronde_response[key] = ronde_response[key].isoformat()
    
    # Mettre à jour le véhicule
    try:
        update_vehicule = {
            "kilometrage": ronde_data.km if ronde_data.km > vehicle.get('kilometrage', 0) else vehicle.get('kilometrage', 0),
            "derniere_inspection_date": ronde_data.date,
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
            update_vehicule["defauts_actifs"] = []
        
        await db.vehicules.update_one(
            {"id": ronde_data.vehicule_id},
            {"$set": update_vehicule}
        )
    except Exception as veh_err:
        logger.error(f"Erreur mise à jour véhicule après ronde: {veh_err}")
    
    # Envoyer les notifications selon la sévérité (en arrière-plan, ne bloque jamais la réponse)
    try:
        parametres = tenant.parametres if hasattr(tenant, 'parametres') and tenant.parametres else {}
        actifs_params = parametres.get('actifs', {})
        destinataires_ids = actifs_params.get('emails_rondes', [])
        
        # Récupérer les IDs utilisateurs pour les notifications
        recipient_user_ids = []
        for item in destinataires_ids:
            if '@' not in str(item):
                user = await db.users.find_one({"id": item, "tenant_id": tenant.id}, {"_id": 0, "id": 1})
                if user:
                    recipient_user_ids.append(user['id'])
        
        if severite_globale == "MAJEUR" and recipient_user_ids:
            defauts_text = "\n".join([f"- {d.get('defect_id')}: {d.get('description')}" for d in defauts_majeurs])
            from routes.notifications import send_push_notification_to_users
            
            for user_id in recipient_user_ids:
                await creer_notification(
                    tenant_id=tenant.id,
                    destinataire_id=user_id,
                    type="vehicule_hors_service",
                    titre=f"VEHICULE HORS SERVICE: {vehicle.get('nom')}",
                    message=f"Defaut(s) MAJEUR(S) detecte(s):\n{defauts_text}",
                    lien="/actifs",
                    data={"vehicule_id": vehicle.get('id'), "severite": "MAJEUR"},
                    envoyer_email=True
                )
            
            try:
                await send_push_notification_to_users(
                    user_ids=recipient_user_ids,
                    title=f"{vehicle.get('nom')} HORS SERVICE",
                    body=f"Defaut MAJEUR: {defauts_majeurs[0].get('description', 'Voir details')}",
                    data={"type": "vehicule_hors_service", "vehicule_id": vehicle.get('id')}
                )
            except Exception as push_err:
                logger.warning(f"Erreur push notification: {push_err}")
        
        elif severite_globale == "MINEUR" and recipient_user_ids:
            defauts_text = "\n".join([f"- {d.get('defect_id')}: {d.get('description')}" for d in defauts_mineurs])
            from routes.notifications import send_push_notification_to_users
            
            for user_id in recipient_user_ids:
                await creer_notification(
                    tenant_id=tenant.id,
                    destinataire_id=user_id,
                    type="vehicule_reparation_requise",
                    titre=f"Reparation requise: {vehicle.get('nom')}",
                    message=f"Defaut(s) mineur(s). Delai: 48h\n{defauts_text}",
                    lien="/actifs",
                    data={"vehicule_id": vehicle.get('id'), "severite": "MINEUR"},
                    envoyer_email=True
                )
            
            try:
                await send_push_notification_to_users(
                    user_ids=recipient_user_ids,
                    title=f"{vehicle.get('nom')} - Reparation requise",
                    body="Defaut mineur detecte. Delai: 48h",
                    data={"type": "vehicule_reparation_requise", "vehicule_id": vehicle.get('id')}
                )
            except Exception as push_err:
                logger.warning(f"Erreur push notification: {push_err}")
    except Exception as notif_err:
        logger.error(f"Erreur notifications ronde securite: {notif_err}")
    
    return ronde_response


@router.get("/{tenant_slug}/actifs/rondes-securite", response_model=List[RondeSecurite])
async def get_rondes_securite(
    tenant_slug: str,
    vehicule_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer l'historique des rondes de sécurité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    query = {"tenant_id": tenant.id}
    if vehicule_id:
        query["vehicule_id"] = vehicule_id
    
    rondes = await db.rondes_securite.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rondes


@router.get("/{tenant_slug}/actifs/rondes-securite/{ronde_id}", response_model=RondeSecurite)
async def get_ronde_securite_by_id(
    tenant_slug: str,
    ronde_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer une ronde de sécurité spécifique par son ID"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    ronde = await db.rondes_securite.find_one(
        {"id": ronde_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not ronde:
        raise HTTPException(status_code=404, detail="Ronde de sécurité non trouvée")
    
    return ronde


@router.post("/{tenant_slug}/actifs/rondes-securite/{ronde_id}/contre-signer")
async def contre_signer_ronde(
    tenant_slug: str,
    ronde_id: str,
    contre_signature_data: ContreSignatureCreate,
    current_user: User = Depends(get_current_user)
):
    """Contre-signer une ronde de sécurité existante (dans les 24h)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    ronde = await db.rondes_securite.find_one(
        {"id": ronde_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not ronde:
        raise HTTPException(status_code=404, detail="Ronde de sécurité non trouvée")
    
    ronde_datetime = datetime.fromisoformat(f"{ronde['date']}T{ronde['heure']}")
    now = datetime.now()
    time_elapsed = now - ronde_datetime
    
    if time_elapsed > timedelta(hours=24):
        raise HTTPException(
            status_code=400, 
            detail=f"Cette ronde a expiré (effectuée il y a {int(time_elapsed.total_seconds() / 3600)}h). Vous devez créer une nouvelle ronde."
        )
    
    nom_complet_actuel = f"{contre_signature_data.prenom_conducteur} {contre_signature_data.nom_conducteur}"
    if nom_complet_actuel.lower().strip() == ronde['personne_mandatee'].lower().strip():
        raise HTTPException(
            status_code=400,
            detail="Vous êtes la personne qui a effectué cette ronde. Pas besoin de contre-signer."
        )
    
    contre_signature = ContreSignature(
        nom_conducteur=contre_signature_data.nom_conducteur,
        prenom_conducteur=contre_signature_data.prenom_conducteur,
        signature=contre_signature_data.signature,
        user_id=current_user.id
    )
    
    await db.rondes_securite.update_one(
        {"id": ronde_id},
        {"$push": {"contre_signatures": contre_signature.dict()}}
    )
    
    return {
        "message": "Contre-signature ajoutée avec succès",
        "ronde_id": ronde_id,
        "temps_restant_heures": int((timedelta(hours=24) - time_elapsed).total_seconds() / 3600)
    }


# ==================== ROUTES - PARAMÈTRES ====================

@router.get("/{tenant_slug}/actifs/parametres")
async def get_parametres_actifs(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les paramètres du module actifs"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    parametres = tenant.parametres.get('actifs', {}) if tenant.parametres else {}
    
    if not parametres:
        parametres = {
            "dates_tests_bornes_seches": []
        }
    
    return parametres


@router.put("/{tenant_slug}/actifs/parametres")
async def update_parametres_actifs(
    tenant_slug: str,
    parametres: dict,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour les paramètres du module actifs"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "actifs", "modifier", "parametres")
    
    current_params = tenant.parametres or {}
    current_params['actifs'] = parametres
    
    await db.tenants.update_one(
        {"id": tenant.id},
        {"$set": {
            "parametres": current_params,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Paramètres mis à jour avec succès", "parametres": parametres}


@router.get("/{tenant_slug}/actifs/configuration-emails-rondes")
async def get_configuration_emails_rondes(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer la configuration des emails automatiques pour les rondes de sécurité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    user_ids_config = tenant.parametres.get('user_ids_rondes_securite', [])
    
    return {"user_ids_rondes_securite": user_ids_config}


@router.put("/{tenant_slug}/actifs/configuration-emails-rondes")
async def update_configuration_emails_rondes(
    tenant_slug: str,
    config: dict,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour la configuration des emails automatiques pour les rondes de sécurité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "actifs", "modifier", "parametres")
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    user_ids = config.get('user_ids_rondes_securite', [])
    if not isinstance(user_ids, list):
        raise HTTPException(status_code=400, detail="Le format des IDs utilisateurs est invalide")
    
    tenant_doc = await db.tenants.find_one({"id": tenant.id})
    if not tenant_doc:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    current_parametres = tenant_doc.get('parametres', {})
    current_parametres['user_ids_rondes_securite'] = user_ids
    
    await db.tenants.update_one(
        {"id": tenant.id},
        {"$set": {"parametres": current_parametres}}
    )
    
    return {"message": "Configuration mise à jour", "user_ids_rondes_securite": user_ids}



# ==================== RÉPARATIONS / ENTRETIENS VÉHICULES ====================

@router.get("/{tenant_slug}/actifs/vehicules/{vehicule_id}/reparations")
async def lister_reparations_vehicule(
    tenant_slug: str,
    vehicule_id: str,
    date_debut: Optional[str] = None,
    date_fin: Optional[str] = None,
    type_intervention: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Liste les réparations/entretiens d'un véhicule avec filtres optionnels"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    query = {"tenant_id": tenant.id, "vehicule_id": vehicule_id}
    
    if date_debut:
        query["date_reparation"] = {"$gte": date_debut}
    if date_fin:
        if "date_reparation" in query:
            query["date_reparation"]["$lte"] = date_fin
        else:
            query["date_reparation"] = {"$lte": date_fin}
    if type_intervention:
        query["type_intervention"] = type_intervention
    
    reparations = await db.reparations_vehicules.find(
        query, {"_id": 0}
    ).sort("date_reparation", -1).to_list(500)
    
    # Calculer le coût total
    cout_total = sum(r.get("cout", 0) or 0 for r in reparations)
    
    return {
        "reparations": reparations,
        "count": len(reparations),
        "cout_total": round(cout_total, 2)
    }


@router.post("/{tenant_slug}/actifs/vehicules/{vehicule_id}/reparations")
async def creer_reparation_vehicule(
    tenant_slug: str,
    vehicule_id: str,
    reparation: ReparationCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle entrée de réparation/entretien"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "actifs", "creer", "vehicules")
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier que le véhicule existe
    vehicule = await db.vehicules.find_one({"id": vehicule_id, "tenant_id": tenant.id})
    if not vehicule:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    nouvelle_reparation = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "vehicule_id": vehicule_id,
        "date_reparation": reparation.date_reparation,
        "type_intervention": reparation.type_intervention,
        "description": reparation.description,
        "cout": reparation.cout,
        "fournisseur": reparation.fournisseur,
        "kilometrage_actuel": reparation.kilometrage_actuel,
        "pieces_remplacees": reparation.pieces_remplacees,
        "numero_facture": reparation.numero_facture,
        "statut": reparation.statut,
        "date_signalement": reparation.date_signalement,
        "priorite": reparation.priorite,
        "notes": reparation.notes,
        "cree_par": current_user.id,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    await db.reparations_vehicules.insert_one(nouvelle_reparation)
    
    # Si c'est un entretien préventif (vidange), mettre à jour le véhicule
    if reparation.type_intervention == "entretien_preventif":
        update_data = {"updated_at": datetime.now(timezone.utc)}
        if reparation.date_reparation:
            update_data["derniere_vidange_date"] = reparation.date_reparation
        if reparation.kilometrage_actuel:
            update_data["derniere_vidange_km"] = reparation.kilometrage_actuel
            update_data["kilometrage"] = reparation.kilometrage_actuel
        await db.vehicules.update_one({"id": vehicule_id}, {"$set": update_data})
    
    # Mettre à jour le kilométrage si fourni
    elif reparation.kilometrage_actuel:
        await db.vehicules.update_one(
            {"id": vehicule_id},
            {"$set": {"kilometrage": reparation.kilometrage_actuel, "updated_at": datetime.now(timezone.utc)}}
        )
    
    # Ajouter au log du véhicule
    log_entry = {
        "date": datetime.now(timezone.utc).isoformat(),
        "action": f"Réparation ajoutée: {reparation.type_intervention}",
        "user_id": current_user.id,
        "user_nom": f"{current_user.prenom} {current_user.nom}",
        "details": reparation.description[:100]
    }
    await db.vehicules.update_one(
        {"id": vehicule_id},
        {"$push": {"logs": {"$each": [log_entry], "$slice": -100}}}
    )
    
    nouvelle_reparation.pop("_id", None)
    return {"success": True, "reparation": nouvelle_reparation}


@router.put("/{tenant_slug}/actifs/reparations/{reparation_id}")
async def modifier_reparation_vehicule(
    tenant_slug: str,
    reparation_id: str,
    data: dict,
    current_user: User = Depends(get_current_user)
):
    """Modifier une réparation/entretien existant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "actifs", "modifier", "vehicules")
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    reparation = await db.reparations_vehicules.find_one({"id": reparation_id, "tenant_id": tenant.id})
    if not reparation:
        raise HTTPException(status_code=404, detail="Réparation non trouvée")
    
    # Champs modifiables
    allowed_fields = [
        "date_reparation", "type_intervention", "description", "cout", "fournisseur",
        "kilometrage_actuel", "pieces_remplacees", "numero_facture", "statut",
        "date_signalement", "priorite", "notes"
    ]
    
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.reparations_vehicules.update_one({"id": reparation_id}, {"$set": update_data})
    
    updated = await db.reparations_vehicules.find_one({"id": reparation_id}, {"_id": 0})
    return {"success": True, "reparation": updated}


@router.delete("/{tenant_slug}/actifs/reparations/{reparation_id}")
async def supprimer_reparation_vehicule(
    tenant_slug: str,
    reparation_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une réparation/entretien"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "actifs", "supprimer", "vehicules")
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    result = await db.reparations_vehicules.delete_one({"id": reparation_id, "tenant_id": tenant.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Réparation non trouvée")
    
    return {"success": True}
