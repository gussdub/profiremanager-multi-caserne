"""
Routes API pour les rapports d'interventions
=============================================

Statistiques détaillées sur les interventions :
- Par période (année, trimestre, mois)
- Par type/nature d'incident
- Par pompier (taux de présence, participations)
- Temps de réponse et durée moyenne
- Comparaison année par année
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone, timedelta
from collections import defaultdict
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Rapports Interventions"])
logger = logging.getLogger(__name__)


@router.get("/{tenant_slug}/rapports/interventions/statistiques")
async def get_statistiques_interventions(
    tenant_slug: str,
    annee: int = Query(default=None, description="Année pour les statistiques"),
    date_debut: str = Query(default=None, description="Date de début (YYYY-MM-DD)"),
    date_fin: str = Query(default=None, description="Date de fin (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user)
):
    """
    Récupère les statistiques globales des interventions pour une période donnée.
    """
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Définir la période
    if annee:
        start_date = f"{annee}-01-01"
        end_date = f"{annee}-12-31"
    elif date_debut and date_fin:
        start_date = date_debut
        end_date = date_fin
    else:
        # Par défaut: année en cours
        current_year = datetime.now().year
        start_date = f"{current_year}-01-01"
        end_date = f"{current_year}-12-31"
    
    # Récupérer les interventions de la période
    interventions = await db.interventions.find({
        "tenant_id": tenant.id,
        "date_intervention": {"$gte": start_date, "$lte": end_date}
    }).to_list(10000)
    
    # Aussi récupérer les cartes d'appel si elles existent séparément
    cartes_appel = await db.cartes_appel.find({
        "tenant_id": tenant.id,
        "date": {"$gte": start_date, "$lte": end_date}
    }).to_list(10000)
    
    # Statistiques globales
    total_interventions = len(interventions) + len(cartes_appel)
    
    # Répartition par nature d'incident
    nature_counts = defaultdict(int)
    for inter in interventions:
        nature = inter.get("nature_incident") or inter.get("type_incident") or "Non spécifié"
        nature_counts[nature] += 1
    for carte in cartes_appel:
        nature = carte.get("nature_appel") or carte.get("type_appel") or "Non spécifié"
        nature_counts[nature] += 1
    
    # Répartition par mois
    mois_counts = defaultdict(int)
    for inter in interventions:
        date_str = inter.get("date_intervention", "")
        if date_str:
            try:
                mois = date_str[:7]  # YYYY-MM
                mois_counts[mois] += 1
            except:
                pass
    for carte in cartes_appel:
        date_str = carte.get("date", "")
        if date_str:
            try:
                mois = date_str[:7]
                mois_counts[mois] += 1
            except:
                pass
    
    # Trier par mois
    mois_sorted = sorted(mois_counts.items())
    
    # Temps de réponse moyen (si disponible)
    temps_reponse_list = []
    for inter in interventions:
        temps = inter.get("temps_reponse_minutes") or inter.get("delai_reponse")
        if temps and isinstance(temps, (int, float)) and temps > 0:
            temps_reponse_list.append(temps)
    
    temps_reponse_moyen = sum(temps_reponse_list) / len(temps_reponse_list) if temps_reponse_list else None
    
    # Durée moyenne des interventions
    durees_list = []
    for inter in interventions:
        duree = inter.get("duree_minutes") or inter.get("duree_intervention")
        if duree and isinstance(duree, (int, float)) and duree > 0:
            durees_list.append(duree)
    
    duree_moyenne = sum(durees_list) / len(durees_list) if durees_list else None
    
    # Répartition par secteur/zone
    secteur_counts = defaultdict(int)
    for inter in interventions:
        secteur = inter.get("secteur") or inter.get("zone") or inter.get("district") or "Non spécifié"
        secteur_counts[secteur] += 1
    for carte in cartes_appel:
        secteur = carte.get("secteur") or carte.get("zone") or "Non spécifié"
        secteur_counts[secteur] += 1
    
    return {
        "periode": {
            "date_debut": start_date,
            "date_fin": end_date,
            "annee": annee
        },
        "total_interventions": total_interventions,
        "par_nature": dict(nature_counts),
        "par_mois": [{"mois": m, "count": c} for m, c in mois_sorted],
        "par_secteur": dict(secteur_counts),
        "temps_reponse_moyen_minutes": round(temps_reponse_moyen, 1) if temps_reponse_moyen else None,
        "duree_moyenne_minutes": round(duree_moyenne, 1) if duree_moyenne else None,
        "nb_avec_temps_reponse": len(temps_reponse_list),
        "nb_avec_duree": len(durees_list)
    }


@router.get("/{tenant_slug}/rapports/interventions/par-pompier")
async def get_statistiques_par_pompier(
    tenant_slug: str,
    annee: int = Query(default=None, description="Année pour les statistiques"),
    date_debut: str = Query(default=None, description="Date de début (YYYY-MM-DD)"),
    date_fin: str = Query(default=None, description="Date de fin (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user)
):
    """
    Récupère les statistiques d'interventions par pompier.
    Inclut le taux de présence basé sur les gardes assignées et global.
    """
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Définir la période
    if annee:
        start_date = f"{annee}-01-01"
        end_date = f"{annee}-12-31"
    elif date_debut and date_fin:
        start_date = date_debut
        end_date = date_fin
    else:
        current_year = datetime.now().year
        start_date = f"{current_year}-01-01"
        end_date = f"{current_year}-12-31"
    
    # Récupérer tous les utilisateurs actifs
    users = await db.users.find({
        "tenant_id": tenant.id,
        "is_active": {"$ne": False}
    }).to_list(500)
    
    # Créer un dictionnaire user_id -> user info
    users_dict = {}
    for u in users:
        user_id = str(u.get("_id", "")) or u.get("id", "")
        users_dict[user_id] = {
            "id": user_id,
            "nom": u.get("nom", ""),
            "prenom": u.get("prenom", ""),
            "nom_complet": f"{u.get('prenom', '')} {u.get('nom', '')}".strip(),
            "matricule": u.get("matricule", ""),
            "grade": u.get("grade", ""),
            "statut_emploi": u.get("statut_emploi", "temps_plein")
        }
    
    # Récupérer les interventions de la période
    interventions = await db.interventions.find({
        "tenant_id": tenant.id,
        "date_intervention": {"$gte": start_date, "$lte": end_date}
    }).to_list(10000)
    
    # Récupérer les cartes d'appel
    cartes_appel = await db.cartes_appel.find({
        "tenant_id": tenant.id,
        "date": {"$gte": start_date, "$lte": end_date}
    }).to_list(10000)
    
    total_interventions = len(interventions) + len(cartes_appel)
    
    # Récupérer les gardes de la période
    gardes = await db.gardes.find({
        "tenant_id": tenant.id,
        "date": {"$gte": start_date, "$lte": end_date}
    }).to_list(50000)
    
    # Récupérer les disponibilités/présences
    disponibilites = await db.disponibilites.find({
        "tenant_id": tenant.id,
        "date": {"$gte": start_date, "$lte": end_date}
    }).to_list(50000)
    
    # Compter les participations par pompier
    participations = defaultdict(lambda: {
        "interventions": 0,
        "interventions_pendant_garde": 0,
        "heures_garde_interne": 0,
        "heures_garde_externe": 0,
        "nb_gardes_internes": 0,
        "nb_gardes_externes": 0,
        "dates_interventions": set(),
        "dates_gardes": set()
    })
    
    # Analyser les interventions
    for inter in interventions:
        # Participants peut être une liste d'IDs ou d'objets
        participants = inter.get("participants", []) or inter.get("pompiers_presents", []) or []
        date_inter = inter.get("date_intervention", "")
        
        for p in participants:
            if isinstance(p, dict):
                user_id = p.get("user_id") or p.get("id") or str(p.get("_id", ""))
            else:
                user_id = str(p)
            
            if user_id and user_id in users_dict:
                participations[user_id]["interventions"] += 1
                if date_inter:
                    participations[user_id]["dates_interventions"].add(date_inter)
    
    # Analyser les cartes d'appel
    for carte in cartes_appel:
        participants = carte.get("effectifs", []) or carte.get("pompiers", []) or []
        date_carte = carte.get("date", "")
        
        for p in participants:
            if isinstance(p, dict):
                user_id = p.get("user_id") or p.get("id") or str(p.get("_id", ""))
            else:
                user_id = str(p)
            
            if user_id and user_id in users_dict:
                participations[user_id]["interventions"] += 1
                if date_carte:
                    participations[user_id]["dates_interventions"].add(date_carte)
    
    # Analyser les gardes
    for garde in gardes:
        user_id = garde.get("user_id") or str(garde.get("pompier_id", ""))
        type_garde = garde.get("type_garde", "") or garde.get("type", "")
        duree = garde.get("duree_heures", 12) or 12
        date_garde = garde.get("date", "")
        
        if user_id and user_id in users_dict:
            if "interne" in type_garde.lower():
                participations[user_id]["heures_garde_interne"] += duree
                participations[user_id]["nb_gardes_internes"] += 1
            elif "externe" in type_garde.lower():
                participations[user_id]["heures_garde_externe"] += duree
                participations[user_id]["nb_gardes_externes"] += 1
            else:
                # Type non spécifié, compter comme interne par défaut
                participations[user_id]["heures_garde_interne"] += duree
                participations[user_id]["nb_gardes_internes"] += 1
            
            if date_garde:
                participations[user_id]["dates_gardes"].add(date_garde)
    
    # Vérifier les interventions pendant les gardes assignées
    for user_id, stats in participations.items():
        dates_gardes = stats["dates_gardes"]
        dates_interventions = stats["dates_interventions"]
        interventions_pendant_garde = len(dates_gardes.intersection(dates_interventions))
        stats["interventions_pendant_garde"] = interventions_pendant_garde
    
    # Construire le résultat final
    resultats = []
    for user_id, user_info in users_dict.items():
        stats = participations.get(user_id, {
            "interventions": 0,
            "interventions_pendant_garde": 0,
            "heures_garde_interne": 0,
            "heures_garde_externe": 0,
            "nb_gardes_internes": 0,
            "nb_gardes_externes": 0
        })
        
        # Calculer les taux
        # Taux global = interventions participées / total interventions
        taux_presence_global = (stats["interventions"] / total_interventions * 100) if total_interventions > 0 else 0
        
        # Taux pendant gardes = interventions pendant ses gardes / nb de ses gardes
        nb_gardes_total = stats.get("nb_gardes_internes", 0) + stats.get("nb_gardes_externes", 0)
        taux_presence_garde = (stats.get("interventions_pendant_garde", 0) / nb_gardes_total * 100) if nb_gardes_total > 0 else 0
        
        resultats.append({
            "user_id": user_id,
            "nom_complet": user_info["nom_complet"],
            "matricule": user_info["matricule"],
            "grade": user_info["grade"],
            "statut_emploi": user_info["statut_emploi"],
            "nb_interventions": stats["interventions"],
            "interventions_pendant_garde": stats.get("interventions_pendant_garde", 0),
            "taux_presence_global": round(taux_presence_global, 1),
            "taux_presence_garde": round(taux_presence_garde, 1),
            "heures_garde_interne": stats["heures_garde_interne"],
            "heures_garde_externe": stats["heures_garde_externe"],
            "nb_gardes_internes": stats["nb_gardes_internes"],
            "nb_gardes_externes": stats["nb_gardes_externes"],
            "total_heures_garde": stats["heures_garde_interne"] + stats["heures_garde_externe"]
        })
    
    # Trier par nombre d'interventions décroissant
    resultats.sort(key=lambda x: x["nb_interventions"], reverse=True)
    
    return {
        "periode": {
            "date_debut": start_date,
            "date_fin": end_date,
            "annee": annee
        },
        "total_interventions": total_interventions,
        "nb_pompiers": len(users_dict),
        "pompiers": resultats
    }


@router.get("/{tenant_slug}/rapports/interventions/comparaison-annees")
async def get_comparaison_annees(
    tenant_slug: str,
    annees: str = Query(..., description="Années à comparer, séparées par des virgules (ex: 2024,2025,2026)"),
    current_user: User = Depends(get_current_user)
):
    """
    Compare les statistiques d'interventions entre plusieurs années.
    """
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Parser les années
    try:
        liste_annees = [int(a.strip()) for a in annees.split(",")]
    except:
        raise HTTPException(status_code=400, detail="Format d'années invalide. Utilisez: 2024,2025,2026")
    
    resultats = []
    
    for annee in liste_annees:
        start_date = f"{annee}-01-01"
        end_date = f"{annee}-12-31"
        
        # Compter les interventions
        nb_interventions = await db.interventions.count_documents({
            "tenant_id": tenant.id,
            "date_intervention": {"$gte": start_date, "$lte": end_date}
        })
        
        nb_cartes = await db.cartes_appel.count_documents({
            "tenant_id": tenant.id,
            "date": {"$gte": start_date, "$lte": end_date}
        })
        
        total = nb_interventions + nb_cartes
        
        # Récupérer les interventions pour plus de détails
        interventions = await db.interventions.find({
            "tenant_id": tenant.id,
            "date_intervention": {"$gte": start_date, "$lte": end_date}
        }).to_list(10000)
        
        cartes = await db.cartes_appel.find({
            "tenant_id": tenant.id,
            "date": {"$gte": start_date, "$lte": end_date}
        }).to_list(10000)
        
        # Répartition par nature
        nature_counts = defaultdict(int)
        for inter in interventions:
            nature = inter.get("nature_incident") or inter.get("type_incident") or "Non spécifié"
            nature_counts[nature] += 1
        for carte in cartes:
            nature = carte.get("nature_appel") or carte.get("type_appel") or "Non spécifié"
            nature_counts[nature] += 1
        
        # Temps de réponse moyen
        temps_list = []
        for inter in interventions:
            temps = inter.get("temps_reponse_minutes") or inter.get("delai_reponse")
            if temps and isinstance(temps, (int, float)) and temps > 0:
                temps_list.append(temps)
        temps_moyen = sum(temps_list) / len(temps_list) if temps_list else None
        
        # Répartition par mois
        mois_counts = [0] * 12
        for inter in interventions:
            date_str = inter.get("date_intervention", "")
            if date_str and len(date_str) >= 7:
                try:
                    mois = int(date_str[5:7]) - 1
                    mois_counts[mois] += 1
                except:
                    pass
        for carte in cartes:
            date_str = carte.get("date", "")
            if date_str and len(date_str) >= 7:
                try:
                    mois = int(date_str[5:7]) - 1
                    mois_counts[mois] += 1
                except:
                    pass
        
        resultats.append({
            "annee": annee,
            "total_interventions": total,
            "par_nature": dict(nature_counts),
            "par_mois": mois_counts,
            "temps_reponse_moyen": round(temps_moyen, 1) if temps_moyen else None,
            "moyenne_mensuelle": round(total / 12, 1) if total > 0 else 0
        })
    
    # Calculer les variations
    for i, res in enumerate(resultats):
        if i > 0:
            prev = resultats[i - 1]["total_interventions"]
            curr = res["total_interventions"]
            if prev > 0:
                res["variation_pct"] = round((curr - prev) / prev * 100, 1)
            else:
                res["variation_pct"] = None
        else:
            res["variation_pct"] = None
    
    return {
        "annees_comparees": liste_annees,
        "resultats": resultats
    }


@router.post("/{tenant_slug}/rapports/interventions/import-historique")
async def import_historique_interventions(
    tenant_slug: str,
    data: Dict[str, Any],
    current_user: User = Depends(get_current_user)
):
    """
    Permet d'importer des données historiques d'interventions pour les années précédentes.
    """
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    annee = data.get("annee")
    total_interventions = data.get("total_interventions", 0)
    par_nature = data.get("par_nature", {})
    par_mois = data.get("par_mois", [])
    temps_reponse_moyen = data.get("temps_reponse_moyen")
    notes = data.get("notes", "")
    
    if not annee:
        raise HTTPException(status_code=400, detail="L'année est requise")
    
    # Créer ou mettre à jour l'enregistrement historique
    historique_doc = {
        "tenant_id": tenant.id,
        "annee": annee,
        "total_interventions": total_interventions,
        "par_nature": par_nature,
        "par_mois": par_mois,
        "temps_reponse_moyen": temps_reponse_moyen,
        "notes": notes,
        "type": "historique_manuel",
        "created_by": current_user.email,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Upsert basé sur tenant_id et annee
    await db.historique_interventions.update_one(
        {"tenant_id": tenant.id, "annee": annee},
        {"$set": historique_doc},
        upsert=True
    )
    
    logger.info(f"[HISTORIQUE] Import pour {annee}: {total_interventions} interventions par {current_user.email}")
    
    return {
        "success": True,
        "message": f"Données historiques pour {annee} enregistrées",
        "annee": annee,
        "total_interventions": total_interventions
    }


@router.get("/{tenant_slug}/rapports/interventions/historique")
async def get_historique_interventions(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère les données historiques importées manuellement.
    """
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    historiques = await db.historique_interventions.find({
        "tenant_id": tenant.id
    }).sort("annee", -1).to_list(100)
    
    return [clean_mongo_doc(h) for h in historiques]
