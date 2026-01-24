"""
Routes API pour le suivi des transmissions DSI au MSP
- Gestion des statuts de transmission
- Historique des envois
- Statistiques de conformité
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
import os

from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/dsi/transmissions", tags=["DSI Transmissions"])

# Connexion MongoDB
MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME', 'profiremanager-dev')
client = MongoClient(MONGO_URL)
db = client[DB_NAME]


# ============== MODÈLES ==============

class TransmissionStatus:
    BROUILLON = "brouillon"        # 🔵 En brouillon
    PRET_ENVOI = "pret_envoi"      # 🟡 Prêt pour envoi (signé)
    ENVOYE = "envoye"              # 🟡 Envoyé, en attente de confirmation
    ACCEPTE = "accepte"            # 🟢 Accepté par le MSP
    ERREUR = "erreur"              # 🔴 Erreur de validation


class TransmissionRecord(BaseModel):
    intervention_id: str
    tenant_id: str
    statut: str
    numero_confirmation_msp: Optional[str] = None
    date_signature: Optional[datetime] = None
    date_envoi: Optional[datetime] = None
    date_reponse_msp: Optional[datetime] = None
    erreurs: Optional[List[dict]] = None
    xml_content: Optional[str] = None
    tentatives: int = 0


class TransmissionStats(BaseModel):
    total: int
    brouillon: int
    pret_envoi: int
    accepte: int
    erreur: int
    taux_conformite: float
    retards_48h: int


# ============== ENDPOINTS ==============

@router.get("/stats/{tenant_id}")
async def get_transmission_stats(tenant_id: str):
    """Récupérer les statistiques de conformité DSI pour un tenant"""
    
    # Compter par statut
    pipeline = [
        {"$match": {"tenant_id": tenant_id}},
        {"$group": {"_id": "$statut_dsi", "count": {"$sum": 1}}}
    ]
    
    stats_cursor = db.interventions.aggregate(pipeline)
    stats_by_status = {doc["_id"]: doc["count"] for doc in stats_cursor}
    
    total = sum(stats_by_status.values())
    brouillon = stats_by_status.get(TransmissionStatus.BROUILLON, 0) + stats_by_status.get(None, 0)
    pret_envoi = stats_by_status.get(TransmissionStatus.PRET_ENVOI, 0) + stats_by_status.get(TransmissionStatus.ENVOYE, 0)
    accepte = stats_by_status.get(TransmissionStatus.ACCEPTE, 0)
    erreur = stats_by_status.get(TransmissionStatus.ERREUR, 0)
    
    # Taux de conformité = acceptés / (acceptés + erreurs) * 100
    envois_total = accepte + erreur
    taux_conformite = (accepte / envois_total * 100) if envois_total > 0 else 100.0
    
    # Compter les retards > 48h (interventions non transmises depuis plus de 48h)
    date_limite = datetime.now(timezone.utc) - timedelta(hours=48)
    retards_48h = db.interventions.count_documents({
        "tenant_id": tenant_id,
        "statut_dsi": {"$in": [TransmissionStatus.BROUILLON, TransmissionStatus.PRET_ENVOI, None]},
        "created_at": {"$lt": date_limite},
        # Seulement les incendies qui nécessitent un DSI
        "nature_code": {"$regex": "^1"}  # Codes commençant par 1 = incendies
    })
    
    return TransmissionStats(
        total=total,
        brouillon=brouillon,
        pret_envoi=pret_envoi,
        accepte=accepte,
        erreur=erreur,
        taux_conformite=round(taux_conformite, 1),
        retards_48h=retards_48h
    )


@router.get("/list/{tenant_id}")
async def get_transmissions_list(
    tenant_id: str,
    statut: Optional[str] = None,
    limit: int = 50,
    skip: int = 0
):
    """Récupérer la liste des transmissions DSI"""
    
    query = {"tenant_id": tenant_id}
    
    if statut:
        if statut == "en_attente":
            query["statut_dsi"] = {"$in": [TransmissionStatus.PRET_ENVOI, TransmissionStatus.ENVOYE]}
        else:
            query["statut_dsi"] = statut
    
    interventions = list(db.interventions.find(
        query,
        {
            "_id": 0,
            "id": 1,
            "xml_incident_number": 1,
            "xml_address": 1,
            "xml_city": 1,
            "xml_time_call_received": 1,
            "statut_dsi": 1,
            "numero_confirmation_msp": 1,
            "date_signature_dsi": 1,
            "date_envoi_msp": 1,
            "erreurs_msp": 1,
            "nature_code": 1,
            "created_at": 1
        }
    ).sort("xml_time_call_received", -1).skip(skip).limit(limit))
    
    # Formater les données pour le frontend
    result = []
    for inter in interventions:
        statut_dsi = inter.get("statut_dsi") or TransmissionStatus.BROUILLON
        
        # Déterminer si c'est un incendie nécessitant DSI
        nature = db.dsi_natures_sinistre.find_one({"code": inter.get("nature_code")})
        requiert_dsi = nature.get("requiert_dsi", False) if nature else False
        
        result.append({
            "id": inter.get("id"),
            "numero_rapport": inter.get("xml_incident_number", "N/A"),
            "adresse": f"{inter.get('xml_address', '')} {inter.get('xml_city', '')}".strip(),
            "date": inter.get("xml_time_call_received", inter.get("created_at", "")),
            "statut": statut_dsi,
            "numero_confirmation_msp": inter.get("numero_confirmation_msp"),
            "date_signature": inter.get("date_signature_dsi"),
            "date_envoi": inter.get("date_envoi_msp"),
            "erreurs": inter.get("erreurs_msp", []),
            "requiert_dsi": requiert_dsi
        })
    
    return result


@router.post("/signer/{intervention_id}")
async def signer_rapport_dsi(intervention_id: str, tenant_id: str, signataire_id: str, signataire_nom: str):
    """Signer un rapport DSI (le rendre prêt pour envoi)"""
    
    intervention = db.interventions.find_one({"id": intervention_id, "tenant_id": tenant_id})
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    
    # Mettre à jour le statut
    db.interventions.update_one(
        {"id": intervention_id},
        {
            "$set": {
                "statut_dsi": TransmissionStatus.PRET_ENVOI,
                "date_signature_dsi": datetime.now(timezone.utc),
                "signataire_dsi_id": signataire_id,
                "signataire_dsi_nom": signataire_nom
            }
        }
    )
    
    return {"success": True, "message": "Rapport signé et prêt pour envoi"}


@router.post("/envoyer/{intervention_id}")
async def envoyer_rapport_msp(intervention_id: str, tenant_id: str):
    """
    Envoyer un rapport au MSP (MOCK - en attendant les accès réels)
    En production, cette fonction:
    1. Génère le XML
    2. L'envoie via SOAP au serveur MSP
    3. Enregistre la réponse
    """
    
    intervention = db.interventions.find_one({"id": intervention_id, "tenant_id": tenant_id})
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    
    if intervention.get("statut_dsi") not in [TransmissionStatus.PRET_ENVOI, TransmissionStatus.ERREUR]:
        raise HTTPException(status_code=400, detail="Le rapport doit être signé avant envoi")
    
    # MOCK: Simuler l'envoi au MSP
    # En production, remplacer par l'appel réel au Web Service MSP
    
    import random
    import string
    
    # Simuler une réponse (90% succès, 10% erreur pour les tests)
    success = random.random() > 0.1
    
    if success:
        # Générer un numéro de confirmation fictif
        numero_confirmation = f"TX-{random.randint(100000, 999999)}"
        
        db.interventions.update_one(
            {"id": intervention_id},
            {
                "$set": {
                    "statut_dsi": TransmissionStatus.ACCEPTE,
                    "date_envoi_msp": datetime.now(timezone.utc),
                    "date_reponse_msp": datetime.now(timezone.utc),
                    "numero_confirmation_msp": numero_confirmation,
                    "erreurs_msp": []
                },
                "$inc": {"tentatives_envoi_msp": 1}
            }
        )
        
        return {
            "success": True,
            "numero_confirmation": numero_confirmation,
            "message": "Rapport accepté par le MSP"
        }
    else:
        # Simuler une erreur
        erreurs_possibles = [
            {"code": "E001", "message": "Le code postal fourni ne correspond pas à la municipalité"},
            {"code": "E002", "message": "Le champ 'Estimation des pertes bâtiment' ne peut pas être vide pour un incendie"},
            {"code": "E003", "message": "Le code de cause est invalide ou manquant"},
            {"code": "E004", "message": "L'heure de maîtrise doit être postérieure à l'heure d'arrivée"},
        ]
        erreur = random.choice(erreurs_possibles)
        
        db.interventions.update_one(
            {"id": intervention_id},
            {
                "$set": {
                    "statut_dsi": TransmissionStatus.ERREUR,
                    "date_envoi_msp": datetime.now(timezone.utc),
                    "date_reponse_msp": datetime.now(timezone.utc),
                    "erreurs_msp": [erreur]
                },
                "$inc": {"tentatives_envoi_msp": 1}
            }
        )
        
        return {
            "success": False,
            "erreurs": [erreur],
            "message": "Le rapport a été rejeté par le MSP"
        }


@router.get("/erreurs/{intervention_id}")
async def get_erreurs_transmission(intervention_id: str, tenant_id: str):
    """Récupérer les détails des erreurs de transmission pour une intervention"""
    
    intervention = db.interventions.find_one(
        {"id": intervention_id, "tenant_id": tenant_id},
        {"_id": 0, "erreurs_msp": 1, "statut_dsi": 1, "tentatives_envoi_msp": 1}
    )
    
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    
    erreurs = intervention.get("erreurs_msp", [])
    
    # Traduire les codes d'erreur en messages utilisateur
    erreurs_traduites = []
    for err in erreurs:
        erreurs_traduites.append({
            "code": err.get("code", "UNKNOWN"),
            "message_technique": err.get("message", "Erreur inconnue"),
            "message_utilisateur": traduire_erreur_msp(err.get("code", ""), err.get("message", "")),
            "suggestion": suggestion_correction(err.get("code", ""))
        })
    
    return {
        "statut": intervention.get("statut_dsi"),
        "tentatives": intervention.get("tentatives_envoi_msp", 0),
        "erreurs": erreurs_traduites
    }


def traduire_erreur_msp(code: str, message: str) -> str:
    """Traduire les erreurs MSP en langage simple"""
    traductions = {
        "E001": "Le code postal de l'intervention ne correspond pas à la municipalité sélectionnée. Vérifiez l'adresse.",
        "E002": "Pour un incendie de bâtiment, vous devez indiquer une estimation des dommages (même 0$).",
        "E003": "La cause probable de l'incendie n'a pas été sélectionnée dans la section DSI.",
        "E004": "L'heure de maîtrise (10-10) doit être après l'heure d'arrivée sur les lieux.",
    }
    return traductions.get(code, message)


def suggestion_correction(code: str) -> str:
    """Suggérer une correction pour chaque type d'erreur"""
    suggestions = {
        "E001": "Ouvrez la section 'Identification' et vérifiez que le code postal correspond à la municipalité MAMH sélectionnée.",
        "E002": "Ouvrez la section 'Pertes' et entrez une valeur numérique pour les dommages au bâtiment.",
        "E003": "Ouvrez la section 'DSI' et sélectionnez une cause probable dans le menu déroulant.",
        "E004": "Ouvrez la section 'Chronologie' et corrigez l'heure de maîtrise.",
    }
    return suggestions.get(code, "Consultez le rapport d'intervention et corrigez les champs signalés.")


@router.get("/retards/{tenant_id}")
async def get_interventions_en_retard(tenant_id: str):
    """Récupérer les interventions non transmises depuis plus de 48h"""
    
    date_limite = datetime.now(timezone.utc) - timedelta(hours=48)
    
    interventions = list(db.interventions.find(
        {
            "tenant_id": tenant_id,
            "statut_dsi": {"$in": [TransmissionStatus.BROUILLON, TransmissionStatus.PRET_ENVOI, None]},
            "created_at": {"$lt": date_limite},
            "nature_code": {"$regex": "^1"}  # Incendies
        },
        {
            "_id": 0,
            "id": 1,
            "xml_incident_number": 1,
            "xml_address": 1,
            "xml_time_call_received": 1,
            "created_at": 1
        }
    ).sort("created_at", 1).limit(10))
    
    result = []
    for inter in interventions:
        created = inter.get("created_at")
        if isinstance(created, datetime):
            heures_retard = int((datetime.now(timezone.utc) - created).total_seconds() / 3600)
        else:
            heures_retard = 0
            
        result.append({
            "id": inter.get("id"),
            "numero_rapport": inter.get("xml_incident_number", "N/A"),
            "adresse": inter.get("xml_address", ""),
            "date": inter.get("xml_time_call_received", ""),
            "heures_retard": heures_retard
        })
    
    return result
