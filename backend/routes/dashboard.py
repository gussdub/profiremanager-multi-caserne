"""
Routes API pour le module Dashboard
===================================

STATUT: ACTIF
Ce module fournit les données complètes pour le dashboard principal.

Routes:
- GET /{tenant_slug}/dashboard/donnees-completes - Données complètes dashboard
"""

from fastapi import APIRouter, Depends
from datetime import datetime, timezone, timedelta
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Dashboard"])
logger = logging.getLogger(__name__)


@router.get("/{tenant_slug}/dashboard/donnees-completes")
async def get_dashboard_donnees_completes(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Endpoint central pour toutes les données du dashboard"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Date du mois en cours
    today = datetime.now(timezone.utc)
    debut_mois = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    fin_mois = (debut_mois + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    
    # Récupérer uniquement les données nécessaires avec filtres
    types_garde = await db.types_garde.find({"tenant_id": tenant.id}).to_list(1000)
    
    # Assignations du mois en cours UNIQUEMENT pour l'utilisateur
    mes_assignations_mois = await db.assignations.find({
        "tenant_id": tenant.id,
        "user_id": current_user.id,
        "date": {
            "$gte": debut_mois.isoformat(),
            "$lte": fin_mois.isoformat()
        }
    }).to_list(1000)
    
    # Inscriptions de l'utilisateur uniquement
    mes_inscriptions = await db.inscriptions_formations.find({
        "tenant_id": tenant.id,
        "user_id": current_user.id
    }).to_list(1000)
    
    # Formations pour les inscriptions + futures
    formation_ids = [i["formation_id"] for i in mes_inscriptions]
    formations = await db.formations.find({
        "tenant_id": tenant.id,
        "$or": [
            {"id": {"$in": formation_ids}},
            {"date_debut": {"$gte": today.isoformat()}}
        ]
    }).to_list(1000)
    
    # Pour section admin : charger données agrégées uniquement si nécessaire
    if current_user.role in ["admin", "superviseur"]:
        assignations = await db.assignations.find({
            "tenant_id": tenant.id,
            "date": {
                "$gte": debut_mois.isoformat(),
                "$lte": fin_mois.isoformat()
            }
        }).to_list(5000)
        demandes_remplacement = await db.demandes_remplacement.find({"tenant_id": tenant.id}).to_list(1000)
    else:
        assignations = mes_assignations_mois
        demandes_remplacement = []
    
    # Créer un mapping des types de garde pour accès rapide
    type_garde_map = {t["id"]: t for t in types_garde}
    
    # Vérifier si le tenant a au moins une garde externe
    has_garde_externe = any(t.get("est_garde_externe", False) for t in types_garde)
    
    # ===== SECTION PERSONNELLE =====
    heures_mois_internes = 0
    heures_mois_externes = 0
    heures_mois_total = 0
    nombre_gardes_mois = 0
    
    for assignation in mes_assignations_mois:
        try:
            date_str = assignation["date"]
            
            # Gérer les différents formats de date
            if isinstance(date_str, str):
                date_str = date_str.replace('Z', '+00:00')
                if 'T' in date_str:
                    date_assign = datetime.fromisoformat(date_str)
                else:
                    date_assign = datetime.fromisoformat(date_str + "T00:00:00").replace(tzinfo=timezone.utc)
            else:
                date_assign = date_str
            
            if debut_mois <= date_assign <= fin_mois:
                type_garde = type_garde_map.get(assignation.get("type_garde_id"))
                if type_garde:
                    duree = type_garde.get("duree_heures", 8)
                    if type_garde.get("est_garde_externe", False):
                        heures_mois_externes += duree
                    else:
                        heures_mois_internes += duree
                    heures_mois_total += duree
                else:
                    heures_mois_internes += 8
                    heures_mois_total += 8
                nombre_gardes_mois += 1
        except Exception as e:
            logger.error(f"Erreur traitement assignation: {e}")
            pass
    
    # Présence aux formations
    formations_passees = 0
    presences = 0
    for insc in mes_inscriptions:
        formation = next((f for f in formations if f["id"] == insc["formation_id"]), None)
        if formation:
            try:
                date_fin_formation = datetime.fromisoformat(formation["date_fin"]).date()
                if date_fin_formation < today.date():
                    formations_passees += 1
                    if insc.get("statut") == "present":
                        presences += 1
            except:
                pass
    
    pourcentage_presence_formations = round((presences / formations_passees * 100) if formations_passees > 0 else 0, 1)
    
    # Formations à venir
    formations_a_venir = []
    for formation in formations:
        try:
            if "date_debut" in formation and formation["date_debut"]:
                date_debut_formation = datetime.fromisoformat(formation["date_debut"].replace('Z', '+00:00'))
                if date_debut_formation.date() >= today.date():
                    est_inscrit = any(i for i in mes_inscriptions if i["formation_id"] == formation["id"])
                    formations_a_venir.append({
                        "id": formation["id"],
                        "nom": formation["nom"],
                        "date_debut": formation["date_debut"],
                        "date_fin": formation["date_fin"],
                        "est_inscrit": est_inscrit
                    })
        except (ValueError, TypeError, AttributeError):
            pass
    
    formations_a_venir.sort(key=lambda x: x["date_debut"])
    
    section_personnelle = {
        "heures_travaillees_mois": heures_mois_total,
        "heures_internes_mois": heures_mois_internes,
        "heures_externes_mois": heures_mois_externes,
        "has_garde_externe": has_garde_externe,
        "nombre_gardes_mois": nombre_gardes_mois,
        "pourcentage_presence_formations": pourcentage_presence_formations,
        "formations_a_venir": formations_a_venir
    }
    
    # ===== SECTION GÉNÉRALE (Admin/Superviseur uniquement) =====
    section_generale = None
    if current_user.role in ["admin", "superviseur"]:
        nb_assignations_mois = len(assignations)
        
        jours_mois = (fin_mois - debut_mois).days + 1
        personnel_moyen_par_garde = sum(t.get("personnel_requis", 1) for t in types_garde) / len(types_garde) if types_garde else 1
        total_personnel_requis_estime = len(types_garde) * jours_mois * personnel_moyen_par_garde * 0.7
        
        couverture_planning = round((nb_assignations_mois / total_personnel_requis_estime * 100), 1) if total_personnel_requis_estime > 0 else 0
        couverture_planning = min(couverture_planning, 100.0)
        
        postes_a_pourvoir = max(0, int(total_personnel_requis_estime - nb_assignations_mois))
        demandes_en_attente = len([d for d in demandes_remplacement if d.get("statut") == "en_attente"])
        
        nb_formations_mois = await db.formations.count_documents({
            "tenant_id": tenant.id,
            "date_debut": {
                "$gte": debut_mois.isoformat(),
                "$lte": fin_mois.isoformat()
            }
        })
        
        nb_personnel_actif = await db.users.count_documents({
            "tenant_id": tenant.id,
            "statut": "Actif"
        })
        
        stats_mois = {
            "total_assignations": nb_assignations_mois,
            "total_personnel_actif": nb_personnel_actif,
            "formations_ce_mois": nb_formations_mois
        }
        
        section_generale = {
            "couverture_planning": couverture_planning,
            "postes_a_pourvoir": postes_a_pourvoir,
            "demandes_conges_en_attente": demandes_en_attente,
            "statistiques_mois": stats_mois
        }
    
    # ===== ACTIVITÉS RÉCENTES =====
    activites_recentes = []
    
    if current_user.role == "admin":
        activites = await db.activites.find({
            "tenant_id": tenant.id,
            "type_activite": {"$nin": ["parametres"]}
        }).sort("created_at", -1).limit(50).to_list(50)
        activites_recentes = [clean_mongo_doc(a) for a in activites]
    
    elif current_user.role in ["superviseur", "employe"]:
        activites = await db.activites.find({
            "tenant_id": tenant.id,
            "$or": [
                {"type_activite": {"$in": ["formation_creation", "planning_publication", "message_important"]}},
                {"user_id": current_user.id},
                {"data.concerne_user_id": current_user.id}
            ]
        }).sort("created_at", -1).limit(30).to_list(30)
        activites_recentes = [clean_mongo_doc(a) for a in activites]
    
    return {
        "section_personnelle": section_personnelle,
        "section_generale": section_generale,
        "activites_recentes": activites_recentes
    }
