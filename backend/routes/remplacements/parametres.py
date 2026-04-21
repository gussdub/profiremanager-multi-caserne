"""
Routes pour les paramètres du module Remplacements.
Inclut les routes de configuration et de diagnostic.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List
import uuid
import logging
from datetime import datetime, timezone

from models.user import User
from routes.auth import get_current_user, get_tenant_from_slug

# Import tardif pour RBAC
async def check_permission(tenant_id, user, module, action, tab=None):
    from routes.dependencies import require_permission
    await require_permission(tenant_id, user, module, action, tab)

router = APIRouter(tags=["Remplacements - Paramètres"])
logger = logging.getLogger(__name__)

# Import tardif pour éviter les imports circulaires
def get_db():
    from server import db
    return db

def get_clean_mongo_doc():
    from server import clean_mongo_doc
    return clean_mongo_doc


@router.get("/{tenant_slug}/parametres/remplacements")
async def get_parametres_remplacements(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère les paramètres de remplacements"""
    from routes.remplacements.models import ParametresRemplacements
    
    db = get_db()
    clean_mongo_doc = get_clean_mongo_doc()
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de voir sur le module parametres/remplacements
    await check_permission(tenant.id, current_user, "parametres", "voir", "remplacements")
    
    parametres = await db.parametres_remplacements.find_one({"tenant_id": tenant.id})
    
    if not parametres:
        logger.info(f"📋 Création des paramètres de remplacement par défaut pour tenant {tenant.slug}")
        default_params = ParametresRemplacements(tenant_id=tenant.id)
        await db.parametres_remplacements.insert_one(default_params.dict())
        return default_params
    
    cleaned_params = clean_mongo_doc(parametres)
    logger.info(f"📋 Paramètres remplacements chargés pour {tenant.slug}: delai={cleaned_params.get('delai_attente_minutes')}min, max_contacts={cleaned_params.get('max_contacts')}")
    return cleaned_params


@router.put("/{tenant_slug}/parametres/remplacements")
async def update_parametres_remplacements(
    tenant_slug: str,
    parametres_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Met à jour les paramètres de remplacements"""
    db = get_db()
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modifier sur le module parametres/remplacements
    await check_permission(tenant.id, current_user, "parametres", "modifier", "remplacements")
    
    logger.info(f"💾 Sauvegarde paramètres remplacements pour {tenant.slug}: {parametres_data}")
    
    existing = await db.parametres_remplacements.find_one({"tenant_id": tenant.id})
    
    parametres_data["tenant_id"] = tenant.id
    
    if existing:
        await db.parametres_remplacements.update_one(
            {"tenant_id": tenant.id},
            {"$set": parametres_data}
        )
        logger.info(f"✅ Paramètres remplacements MIS À JOUR pour {tenant.slug}")
    else:
        if "id" not in parametres_data:
            parametres_data["id"] = str(uuid.uuid4())
        await db.parametres_remplacements.insert_one(parametres_data)
        logger.info(f"✅ Paramètres remplacements CRÉÉS pour {tenant.slug}")
    
    return {"message": "Paramètres mis à jour avec succès"}


@router.get("/{tenant_slug}/remplacements/debug/{demande_id}")
async def debug_recherche_remplacant(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint de diagnostic pour comprendre pourquoi aucun remplaçant n'est trouvé.
    Retourne des détails sur chaque utilisateur et pourquoi il est éligible ou non.
    """
    db = get_db()
    clean_mongo_doc = get_clean_mongo_doc()
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de voir sur le module remplacements/toutes-demandes
    await check_permission(tenant.id, current_user, "remplacements", "voir", "toutes-demandes")
    
    # Récupérer la demande
    demande = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    date_garde = demande.get("date")
    type_garde_id = demande.get("type_garde_id")
    demandeur_id = demande.get("demandeur_id")
    exclus_ids = demande.get("remplacants_contactes_ids", [])
    
    # Type de garde
    type_garde = await db.types_garde.find_one({"id": type_garde_id, "tenant_id": tenant.id})
    competences_requises = type_garde.get("competences_requises", []) if type_garde else []
    officier_obligatoire = type_garde.get("officier_obligatoire", False) if type_garde else False
    heure_debut_garde = type_garde.get("heure_debut", "00:00") if type_garde else "00:00"
    heure_fin_garde = type_garde.get("heure_fin", "23:59") if type_garde else "23:59"
    
    # Fonction pour vérifier si deux plages horaires se chevauchent
    def plages_se_chevauchent(debut1: str, fin1: str, debut2: str, fin2: str) -> bool:
        def heure_to_minutes(h: str) -> int:
            try:
                parts = h.split(":")
                return int(parts[0]) * 60 + int(parts[1])
            except:
                return 0
        
        d1, f1 = heure_to_minutes(debut1), heure_to_minutes(fin1)
        d2, f2 = heure_to_minutes(debut2), heure_to_minutes(fin2)
        
        # Gérer les gardes de nuit (fin < début)
        if f1 < d1:
            f1 += 24 * 60
        if f2 < d2:
            f2 += 24 * 60
        
        return d1 < f2 and d2 < f1
    
    # Tous les utilisateurs actifs
    all_users = await db.users.find({
        "tenant_id": tenant.id,
        "actif": True
    }).to_list(1000)
    
    # Assignations pour la date demandée
    assignations_date = await db.assignations.find({
        "tenant_id": tenant.id,
        "date": date_garde
    }).to_list(1000)
    
    # Congés pour la date demandée
    conges_date = await db.demandes_conge.find({
        "tenant_id": tenant.id,
        "statut": "approuve",
        "date_debut": {"$lte": date_garde},
        "date_fin": {"$gte": date_garde}
    }).to_list(1000)
    
    conges_user_ids = [c["demandeur_id"] for c in conges_date]
    
    debug_info = {
        "demande": clean_mongo_doc(demande),
        "type_garde": clean_mongo_doc(type_garde) if type_garde else None,
        "competences_requises": competences_requises,
        "officier_obligatoire": officier_obligatoire,
        "date_garde": date_garde,
        "heure_garde": f"{heure_debut_garde} - {heure_fin_garde}",
        "total_utilisateurs": len(all_users),
        "utilisateurs_en_conge": len(conges_user_ids),
        "details_utilisateurs": []
    }
    
    for user in all_users:
        user_info = {
            "id": user["id"],
            "nom": f"{user.get('prenom', '')} {user.get('nom', '')}",
            "role": user.get("role", ""),
            "grade": user.get("grade", ""),
            "competences": user.get("competences", []),
            "eligible": True,
            "raisons_exclusion": []
        }
        
        # Vérifications
        if user["id"] == demandeur_id:
            user_info["eligible"] = False
            user_info["raisons_exclusion"].append("Est le demandeur")
        
        if user["id"] in exclus_ids:
            user_info["eligible"] = False
            user_info["raisons_exclusion"].append("Déjà contacté")
        
        if user["id"] in conges_user_ids:
            user_info["eligible"] = False
            user_info["raisons_exclusion"].append("En congé approuvé")
        
        # Vérifier les assignations
        for assignation in assignations_date:
            if assignation.get("user_id") == user["id"]:
                type_garde_assign = await db.types_garde.find_one({"id": assignation.get("type_garde_id"), "tenant_id": tenant.id})
                if type_garde_assign:
                    h_debut = type_garde_assign.get("heure_debut", "00:00")
                    h_fin = type_garde_assign.get("heure_fin", "23:59")
                    if plages_se_chevauchent(heure_debut_garde, heure_fin_garde, h_debut, h_fin):
                        user_info["eligible"] = False
                        user_info["raisons_exclusion"].append(f"Déjà assigné: {type_garde_assign.get('nom', 'N/A')} ({h_debut}-{h_fin})")
        
        # Vérifier les compétences
        user_competences = user.get("competences", [])
        if competences_requises:
            manquantes = [c for c in competences_requises if c not in user_competences]
            if manquantes:
                user_info["eligible"] = False
                user_info["raisons_exclusion"].append(f"Compétences manquantes: {', '.join(manquantes)}")
        
        # Vérifier si officier requis (avec fallback fonction supérieure)
        if officier_obligatoire:
            grades_officier = ["lieutenant", "capitaine", "chef", "directeur"]
            user_grade = user.get("grade", "").lower()
            user_fonction_superieure = user.get("fonction_superieur", False) or user.get("fonction_superieure", False)
            
            # Un utilisateur est éligible s'il est officier OU s'il peut agir en fonction supérieure
            if user_grade not in grades_officier and not user_fonction_superieure:
                user_info["eligible"] = False
                user_info["raisons_exclusion"].append(f"Officier requis, grade actuel: {user_grade or 'non défini'}")
            elif user_fonction_superieure and user_grade not in grades_officier:
                # Éligible via fonction supérieure (fallback)
                user_info["raisons_exclusion"].append(f"✅ Éligible fonction supérieure (grade: {user_grade})")
        
        debug_info["details_utilisateurs"].append(user_info)
    
    # Résumé - Format attendu par le frontend
    eligibles = [u for u in debug_info["details_utilisateurs"] if u["eligible"]]
    non_eligibles = [u for u in debug_info["details_utilisateurs"] if not u["eligible"]]
    
    # Structurer la réponse selon ce que le frontend attend
    debug_info["resume"] = {
        "total_utilisateurs": len(all_users),
        "eligibles": len(eligibles),
        "non_eligibles": len(non_eligibles)
    }
    
    # Liste détaillée des éligibles et non-éligibles
    debug_info["eligibles"] = eligibles
    debug_info["non_eligibles"] = non_eligibles
    
    # Informations sur la demande formatées pour l'affichage
    debug_info["demande"] = {
        "type_garde": type_garde.get("nom", "N/A") if type_garde else "N/A",
        "horaires": f"{heure_debut_garde} - {heure_fin_garde}",
        "date": date_garde
    }
    
    # Règle officier (si applicable)
    demandeur = await db.users.find_one({"id": demandeur_id, "tenant_id": tenant.id})
    demandeur_grade = demandeur.get("grade", "").lower() if demandeur else ""
    demandeur_est_officier = demandeur_grade in ["lieutenant", "capitaine", "chef", "directeur"]
    
    # Vérifier s'il y a un autre officier sur la garde
    autre_officier_present = False
    for assignation in assignations_date:
        if assignation.get("type_garde_id") == type_garde_id and assignation.get("user_id") != demandeur_id:
            user_assign = await db.users.find_one({"id": assignation.get("user_id"), "tenant_id": tenant.id})
            if user_assign:
                grade_assign = user_assign.get("grade", "").lower()
                if grade_assign in ["lieutenant", "capitaine", "chef", "directeur"]:
                    autre_officier_present = True
                    break
    
    debug_info["regle_officier"] = {
        "regle_active": officier_obligatoire and not autre_officier_present,
        "officier_obligatoire": officier_obligatoire,
        "demandeur_est_officier": demandeur_est_officier,
        "autre_officier_present_sur_garde": autre_officier_present,
        "explication": "Un officier doit être présent sur cette garde. Si aucun officier n'est disponible, un pompier avec fonction supérieure peut remplacer." if officier_obligatoire else "Aucune restriction d'officier pour cette garde"
    }
    
    return debug_info
