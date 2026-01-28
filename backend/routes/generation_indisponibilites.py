"""
Routes API pour le module Génération d'Indisponibilités
=======================================================

STATUT: ACTIF
Ce module gère la génération automatique des indisponibilités selon les différents
horaires de travail (Montréal 7/24, Québec 10/14, Longueuil 7/24).

Routes principales:
- POST   /{tenant_slug}/disponibilites/generer    - Générer les indisponibilités automatiques
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from datetime import datetime, timezone, timedelta
import uuid
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    User,
    creer_activite
)

router = APIRouter(tags=["Génération Indisponibilités"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES PYDANTIC ====================

class IndisponibiliteGenerate(BaseModel):
    user_id: str
    horaire_type: str  # "montreal", "quebec", "longueuil"
    equipe: str  # "Vert", "Bleu", "Jaune", "Rouge"
    date_debut: str  # Format YYYY-MM-DD
    date_fin: str  # Format YYYY-MM-DD
    conserver_manuelles: bool = True  # Si True, préserve les dispos manuelles


# ==================== FONCTIONS DE GÉNÉRATION ====================

def generer_indisponibilites_montreal(user_id: str, tenant_id: str, equipe: str, date_debut: str, date_fin: str) -> List[Dict]:
    """
    Génère les indisponibilités pour l'horaire Montreal 7/24
    Cycle de 28 jours commençant le 27 janvier 2025 (premier lundi rouge = jour 1)
    
    Pattern RÉEL Montreal 7/24 (vérifié avec calendrier 2025):
    Chaque équipe travaille exactement 7 jours spécifiques sur le cycle de 28 jours
    
    Équipes avec numéros et patterns:
    - Vert (Équipe #1) : jours 2, 8, 11, 19, 21, 24, 27 du cycle
    - Bleu (Équipe #2) : jours 3, 6, 9, 15, 18, 26, 28 du cycle
    - Jaune (Équipe #3) : jours 5, 7, 10, 13, 16, 22, 25 du cycle
    - Rouge (Équipe #4) : jours 1, 4, 12, 14, 17, 20, 23 du cycle
    
    Le jour 1 du cycle = 27 janvier 2025 (premier lundi rouge)
    
    On génère les INDISPONIBILITÉS pour les jours où l'équipe TRAVAILLE à son emploi principal
    """
    
    # Mapping équipe -> numéro -> jours de travail dans le cycle de 28 jours
    equipes_config = {
        "Vert": {
            "numero": 1,
            "jours_cycle": [2, 8, 11, 19, 21, 24, 27]
        },
        "Bleu": {
            "numero": 2,
            "jours_cycle": [3, 6, 9, 15, 18, 26, 28]
        },
        "Jaune": {
            "numero": 3,
            "jours_cycle": [5, 7, 10, 13, 16, 22, 25]
        },
        "Rouge": {
            "numero": 4,
            "jours_cycle": [1, 4, 12, 14, 17, 20, 23]
        }
    }
    
    if equipe not in equipes_config:
        raise ValueError(f"Équipe invalide: {equipe}. Doit être Vert, Bleu, Jaune ou Rouge")
    
    config = equipes_config[equipe]
    
    # Date de référence: 27 janvier 2025 = jour 1 du cycle (premier lundi rouge)
    jour_1_cycle = datetime(2025, 1, 27).date()
    
    # Parser les dates
    debut = datetime.strptime(date_debut, "%Y-%m-%d").date()
    fin = datetime.strptime(date_fin, "%Y-%m-%d").date()
    
    indisponibilites = []
    
    current_date = debut
    while current_date <= fin:
        # Calculer le jour dans le cycle (1 à 28)
        jours_depuis_jour1 = (current_date - jour_1_cycle).days
        jour_cycle = (jours_depuis_jour1 % 28) + 1  # +1 car les jours commencent à 1, pas 0
        
        # Pour les dates avant le jour 1 de référence
        if jours_depuis_jour1 < 0:
            jour_cycle = 28 - ((-jours_depuis_jour1 - 1) % 28)
        
        # Si c'est un jour de travail pour cette équipe → créer une indisponibilité
        if jour_cycle in config["jours_cycle"]:
            indispo = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "tenant_id": tenant_id,
                "date": current_date.strftime("%Y-%m-%d"),
                "statut": "indisponible",
                "motif": f"Horaire principal (Montréal 7/24 - {equipe} #{config['numero']})",
                "origine": "montreal_7_24",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            indisponibilites.append(indispo)
        
        current_date += timedelta(days=1)
    
    logging.info(f"✅ Montreal 7/24 - {equipe} (#{config['numero']}): {len(indisponibilites)} indisponibilités générées de {date_debut} à {date_fin}")
    return indisponibilites


def generer_indisponibilites_quebec(user_id: str, tenant_id: str, equipe: str, date_debut: str, date_fin: str) -> List[Dict]:
    """
    Génère les indisponibilités pour l'horaire Québec 10/14
    Cycle de 28 jours
    
    Pattern Québec 10/14:
    - Vert (Équipe #1) : jours 2,3,4,5, 12,13,14, 20,21,22,23,24,25 du cycle (13 jours)
    - Bleu (Équipe #2) : jours 6,7,8,9,10,11, 16,17,18,19, 26,27,28 du cycle (13 jours)
    - Jaune (Équipe #3) : jours 1,2,3,4, 9,10,11,12, 19,20,21, 27,28 du cycle (13 jours)
    - Rouge (Équipe #4) : jours 5,6,7, 13,14,15,16,17,18, 23,24,25,26 du cycle (13 jours)
    """
    
    equipes_config = {
        "Vert": {
            "numero": 1,
            "jours_cycle": [2, 3, 4, 5, 12, 13, 14, 20, 21, 22, 23, 24, 25]
        },
        "Bleu": {
            "numero": 2,
            "jours_cycle": [6, 7, 8, 9, 10, 11, 16, 17, 18, 19, 26, 27, 28]
        },
        "Jaune": {
            "numero": 3,
            "jours_cycle": [1, 2, 3, 4, 9, 10, 11, 12, 19, 20, 21, 27, 28]
        },
        "Rouge": {
            "numero": 4,
            "jours_cycle": [5, 6, 7, 13, 14, 15, 16, 17, 18, 23, 24, 25, 26]
        }
    }
    
    if equipe not in equipes_config:
        raise ValueError(f"Équipe invalide: {equipe}. Doit être Vert, Bleu, Jaune ou Rouge")
    
    config = equipes_config[equipe]
    
    # Date de référence: 1er février 2026 (à ajuster selon le calendrier réel)
    jour_1_cycle = datetime(2026, 2, 1).date()
    
    debut = datetime.strptime(date_debut, "%Y-%m-%d").date()
    fin = datetime.strptime(date_fin, "%Y-%m-%d").date()
    
    indisponibilites = []
    
    current_date = debut
    while current_date <= fin:
        jours_depuis_jour1 = (current_date - jour_1_cycle).days
        jour_cycle = (jours_depuis_jour1 % 28) + 1
        
        if jours_depuis_jour1 < 0:
            jour_cycle = 28 - ((-jours_depuis_jour1 - 1) % 28)
        
        if jour_cycle in config["jours_cycle"]:
            indispo = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "tenant_id": tenant_id,
                "date": current_date.strftime("%Y-%m-%d"),
                "statut": "indisponible",
                "motif": f"Horaire principal (Québec 10/14 - {equipe} #{config['numero']})",
                "origine": "quebec_10_14",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            indisponibilites.append(indispo)
        
        current_date += timedelta(days=1)
    
    logging.info(f"✅ Quebec 10/14 - {equipe} (#{config['numero']}): {len(indisponibilites)} indisponibilités générées de {date_debut} à {date_fin}")
    return indisponibilites


def generer_indisponibilites_longueuil(user_id: str, tenant_id: str, equipe: str, date_debut: str, date_fin: str) -> List[Dict]:
    """
    Génère les indisponibilités pour l'horaire Longueuil 7/24
    Cycle de 28 jours
    
    Pattern Longueuil 7/24 (similaire à Montréal mais avec des jours différents):
    - Vert (Équipe #1) : jours 2, 6, 8, 12, 18, 21, 24 du cycle
    - Bleu (Équipe #2) : jours 3, 9, 13, 15, 19, 25, 28 du cycle
    - Jaune (Équipe #3) : jours 4, 7, 10, 16, 20, 22, 26 du cycle
    - Rouge (Équipe #4) : jours 1, 5, 11, 14, 17, 23, 27 du cycle
    """
    
    equipes_config = {
        "Vert": {
            "numero": 1,
            "jours_cycle": [2, 6, 8, 12, 18, 21, 24]
        },
        "Bleu": {
            "numero": 2,
            "jours_cycle": [3, 9, 13, 15, 19, 25, 28]
        },
        "Jaune": {
            "numero": 3,
            "jours_cycle": [4, 7, 10, 16, 20, 22, 26]
        },
        "Rouge": {
            "numero": 4,
            "jours_cycle": [1, 5, 11, 14, 17, 23, 27]
        }
    }
    
    if equipe not in equipes_config:
        raise ValueError(f"Équipe invalide: {equipe}. Doit être Vert, Bleu, Jaune ou Rouge")
    
    config = equipes_config[equipe]
    
    # Date de référence: 25 janvier 2026 (premier dimanche rouge = jour 1)
    jour_1_cycle = datetime(2026, 1, 25).date()
    
    debut = datetime.strptime(date_debut, "%Y-%m-%d").date()
    fin = datetime.strptime(date_fin, "%Y-%m-%d").date()
    
    indisponibilites = []
    
    current_date = debut
    while current_date <= fin:
        jours_depuis_jour1 = (current_date - jour_1_cycle).days
        jour_cycle = (jours_depuis_jour1 % 28) + 1
        
        if jours_depuis_jour1 < 0:
            jour_cycle = 28 - ((-jours_depuis_jour1 - 1) % 28)
        
        if jour_cycle in config["jours_cycle"]:
            indispo = {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "tenant_id": tenant_id,
                "date": current_date.strftime("%Y-%m-%d"),
                "statut": "indisponible",
                "motif": f"Horaire principal (Longueuil 7/24 - {equipe} #{config['numero']})",
                "origine": "longueuil_7_24",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            indisponibilites.append(indispo)
        
        current_date += timedelta(days=1)
    
    logging.info(f"✅ Longueuil 7/24 - {equipe} (#{config['numero']}): {len(indisponibilites)} indisponibilités générées de {date_debut} à {date_fin}")
    return indisponibilites


# ==================== ROUTE API ====================

@router.post("/{tenant_slug}/disponibilites/generer")
async def generer_indisponibilites(
    tenant_slug: str,
    generation_data: IndisponibiliteGenerate,
    current_user: User = Depends(get_current_user)
):
    """
    Génère automatiquement les indisponibilités selon l'horaire sélectionné
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier les permissions
    if current_user.role not in ["admin", "superviseur"] and current_user.id != generation_data.user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        # Supprimer les anciennes disponibilités générées automatiquement si demandé
        if not generation_data.conserver_manuelles:
            # Supprimer toutes les disponibilités de cet utilisateur pour la période
            await db.disponibilites.delete_many({
                "user_id": generation_data.user_id,
                "tenant_id": tenant.id,
                "date": {
                    "$gte": generation_data.date_debut,
                    "$lte": generation_data.date_fin
                }
            })
        else:
            # Supprimer uniquement les disponibilités générées automatiquement (préserver manuelles)
            origine_map = {
                "montreal": "montreal_7_24",
                "quebec": "quebec_10_14",
                "longueuil": "longueuil_7_24"
            }
            origine_type = origine_map.get(generation_data.horaire_type, "montreal_7_24")
            await db.disponibilites.delete_many({
                "user_id": generation_data.user_id,
                "tenant_id": tenant.id,
                "origine": origine_type,
                "date": {
                    "$gte": generation_data.date_debut,
                    "$lte": generation_data.date_fin
                }
            })
        
        # Générer les nouvelles indisponibilités
        if generation_data.horaire_type == "montreal":
            indispos = generer_indisponibilites_montreal(
                user_id=generation_data.user_id,
                tenant_id=tenant.id,
                equipe=generation_data.equipe,
                date_debut=generation_data.date_debut,
                date_fin=generation_data.date_fin
            )
        elif generation_data.horaire_type == "quebec":
            indispos = generer_indisponibilites_quebec(
                user_id=generation_data.user_id,
                tenant_id=tenant.id,
                equipe=generation_data.equipe,
                date_debut=generation_data.date_debut,
                date_fin=generation_data.date_fin
            )
        elif generation_data.horaire_type == "longueuil":
            indispos = generer_indisponibilites_longueuil(
                user_id=generation_data.user_id,
                tenant_id=tenant.id,
                equipe=generation_data.equipe,
                date_debut=generation_data.date_debut,
                date_fin=generation_data.date_fin
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="horaire_type doit être 'montreal', 'quebec' ou 'longueuil'"
            )
        
        # Insérer les indisponibilités dans la base de données
        if indispos:
            await db.disponibilites.insert_many(indispos)
        
        # Créer une activité
        horaire_texts = {
            "montreal": "Montréal 7/24",
            "quebec": "Québec 10/14",
            "longueuil": "Longueuil 7/24"
        }
        horaire_text = horaire_texts.get(generation_data.horaire_type, generation_data.horaire_type)
        user = await db.users.find_one({"id": generation_data.user_id, "tenant_id": tenant.id})
        if user:
            await creer_activite(
                tenant_id=tenant.id,
                type_activite="disponibilite_generation_auto",
                description=f"🔄 {current_user.prenom} {current_user.nom} a généré {len(indispos)} indisponibilités automatiques ({horaire_text} - {generation_data.equipe}) pour {user['prenom']} {user['nom']}",
                user_id=current_user.id,
                user_nom=f"{current_user.prenom} {current_user.nom}"
            )
        
        return {
            "message": "Indisponibilités générées avec succès",
            "horaire_type": generation_data.horaire_type,
            "equipe": generation_data.equipe,
            "date_debut": generation_data.date_debut,
            "date_fin": generation_data.date_fin,
            "nombre_indisponibilites": len(indispos),
            "conserver_manuelles": generation_data.conserver_manuelles
        }
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logging.error(f"Erreur lors de la génération des indisponibilités: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération: {str(e)}")
