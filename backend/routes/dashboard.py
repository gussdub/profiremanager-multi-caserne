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
    User,
    require_permission,
    user_has_module_action
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
    can_view_all_data = await user_has_module_action(tenant.id, current_user, "planning", "voir")
    if can_view_all_data:
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
    
    # ===== SECTION GÉNÉRALE (Utilisateurs avec permission de voir le planning) =====
    section_generale = None
    if can_view_all_data:
        nb_assignations_mois = len(assignations)
        
        # Calculer précisément le taux de couverture
        # Pour chaque type de garde, compter combien de créneaux sont requis vs couverts
        jours_mois = (fin_mois - debut_mois).days + 1
        
        # Obtenir les jours du mois où chaque type de garde s'applique
        total_creneaux_requis = 0
        total_creneaux_couverts = 0
        
        for tg in types_garde:
            type_garde_id = tg.get("id")
            personnel_requis = tg.get("personnel_requis", 1)
            jours_semaine_actifs = tg.get("jours_semaine", [0, 1, 2, 3, 4, 5, 6])  # Tous les jours par défaut
            
            # Compter les jours actifs pour ce type de garde dans le mois
            current_date = debut_mois
            while current_date <= fin_mois:
                jour_semaine = current_date.weekday()
                if jour_semaine in jours_semaine_actifs or not jours_semaine_actifs:
                    # Ce jour nécessite ce type de garde
                    total_creneaux_requis += personnel_requis
                    
                    # Compter combien d'assignations couvrent ce créneau
                    date_str = current_date.strftime("%Y-%m-%d")
                    nb_assignes = sum(1 for a in assignations if a.get("type_garde_id") == type_garde_id and a.get("date") == date_str)
                    total_creneaux_couverts += min(nb_assignes, personnel_requis)
                
                current_date += timedelta(days=1)
        
        # Calculer le taux de couverture réel
        if total_creneaux_requis > 0:
            couverture_planning = round((total_creneaux_couverts / total_creneaux_requis) * 100, 1)
        else:
            couverture_planning = 100.0
        
        postes_a_pourvoir = max(0, total_creneaux_requis - total_creneaux_couverts)
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
            "formations_ce_mois": nb_formations_mois,
            "total_creneaux_requis": total_creneaux_requis,
            "total_creneaux_couverts": total_creneaux_couverts
        }
        
        section_generale = {
            "couverture_planning": couverture_planning,
            "postes_a_pourvoir": postes_a_pourvoir,
            "demandes_conges_en_attente": demandes_en_attente,
            "statistiques_mois": stats_mois
        }
    
    # ===== ACTIVITÉS RÉCENTES =====
    activites_recentes = []
    
    # Vérifier si l'utilisateur a permission de voir toutes les activités
    can_view_all_activities = await user_has_module_action(tenant.id, current_user, "rapports", "voir")
    
    if can_view_all_activities:
        activites = await db.activites.find({
            "tenant_id": tenant.id,
            "type_activite": {"$nin": ["parametres"]}
        }).sort("created_at", -1).limit(50).to_list(50)
        activites_recentes = [clean_mongo_doc(a) for a in activites]
    
    else:
        # Employé standard : seulement les activités le concernant
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


# ==================== ACTIVITÉS SYSTÈME (FLUX D'AUDIT) ====================

@router.get("/{tenant_slug}/dashboard/activites-systeme")
async def get_activites_systeme(
    tenant_slug: str,
    limit: int = 20,
    skip: int = 0,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère les activités système (audit log) pour les administrateurs.
    Affiche TOUT ce qui se passe dans le système :
    - Assignations créées/supprimées
    - Disponibilités modifiées
    - Modifications de personnel
    - Etc.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de voir les rapports
    can_view_activities = await user_has_module_action(tenant.id, current_user, "rapports", "voir")
    if not can_view_activities:
        return {"activites": [], "total": 0, "message": "Accès réservé aux administrateurs"}
    
    # Compter le total
    total = await db.activites.count_documents({"tenant_id": tenant.id})
    
    # Récupérer les activités avec pagination
    activites = await db.activites.find({
        "tenant_id": tenant.id
    }).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrichir avec les informations utilisateur
    activites_enrichies = []
    for act in activites:
        activite = clean_mongo_doc(act)
        # Ajouter le nom de l'utilisateur qui a fait l'action si disponible
        if activite.get("user_id"):
            user = await db.users.find_one({"id": activite["user_id"]}, {"prenom": 1, "nom": 1})
            if user:
                activite["user_nom"] = f"{user.get('prenom', '')} {user.get('nom', '')}".strip()
        activites_enrichies.append(activite)
    
    return {
        "activites": activites_enrichies,
        "total": total,
        "limit": limit,
        "skip": skip
    }


# ==================== ALERTES ÉQUIPEMENTS POUR DASHBOARD ====================

@router.get("/{tenant_slug}/dashboard/alertes-equipements")
async def get_alertes_equipements_dashboard(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère les alertes équipements et EPI pour le dashboard.
    
    Filtrage selon le rôle:
    - Admin/Superviseur: Voit TOUTES les alertes
    - Personne ressource: Voit les alertes des catégories qui lui sont assignées
    - Autres: Voit uniquement ses propres EPI
    
    Types d'alertes:
    - Inspections dues (fréquence dépassée)
    - Fin de vie proche (date_mise_en_service + duree_vie)
    - Péremptions (dates spécifiques)
    - Maintenances à planifier
    - EPI: inspection mensuelle, expiration, fin de vie
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier si les alertes dashboard sont activées
    params_equipements = tenant.parametres.get('equipements', {}) if tenant.parametres else {}
    params_epi = tenant.parametres if tenant.parametres else {}
    
    if not params_equipements.get('activer_alertes_dashboard', True):
        return {
            "actif": False,
            "message": "Alertes dashboard désactivées",
            "alertes": []
        }
    
    # Récupérer les délais configurés
    delai_maintenance = params_equipements.get('jours_alerte_maintenance', 30)
    delai_expiration = params_equipements.get('jours_alerte_expiration', 30)
    delai_fin_vie = params_equipements.get('jours_alerte_fin_vie', 90)
    delai_epi = params_epi.get('epi_jours_avance_expiration', 30)
    
    aujourdhui = datetime.now(timezone.utc)
    aujourdhui_date = aujourdhui.date()
    
    # Calculer les dates limites
    date_limite_maintenance = (aujourdhui + timedelta(days=delai_maintenance)).isoformat()[:10]
    date_limite_expiration = (aujourdhui + timedelta(days=delai_expiration)).isoformat()[:10]
    date_limite_fin_vie = (aujourdhui + timedelta(days=delai_fin_vie)).isoformat()[:10]
    date_limite_epi = (aujourdhui + timedelta(days=delai_epi)).isoformat()[:10]
    
    alertes = []
    
    # Déterminer les catégories visibles pour l'utilisateur
    categories_visibles = []
    is_admin = await user_has_module_action(tenant.id, current_user, "actifs", "voir")
    is_personne_ressource = False
    
    if not is_admin:
        # Vérifier si l'utilisateur est personne ressource d'une catégorie
        categories = await db.categories_equipements.find({"tenant_id": tenant.id}).to_list(1000)
        for cat in categories:
            personnes_ressources = cat.get("personnes_ressources", [])
            for pr in personnes_ressources:
                if pr.get("id") == current_user.id or pr.get("user_id") == current_user.id:
                    categories_visibles.append(cat.get("id"))
                    is_personne_ressource = True
                    break
    
    # ==================== ALERTES ÉQUIPEMENTS ====================
    
    # Construire le filtre pour les équipements
    equipements_filter = {"tenant_id": tenant.id}
    if not is_admin and is_personne_ressource:
        equipements_filter["categorie_id"] = {"$in": categories_visibles}
    elif not is_admin and not is_personne_ressource:
        # Utilisateur normal: ne voit pas les alertes équipements (seulement ses EPI)
        equipements_filter["_impossible_"] = True  # Filtre qui ne retourne rien
    
    equipements = await db.equipements.find(equipements_filter).to_list(10000)
    categories_map = {}
    if is_admin or is_personne_ressource:
        cats = await db.categories_equipements.find({"tenant_id": tenant.id}).to_list(1000)
        categories_map = {c["id"]: c for c in cats}
    
    for eq in equipements:
        cat_id = eq.get("categorie_id")
        categorie = categories_map.get(cat_id, {})
        cat_nom = categorie.get("nom", "Sans catégorie")
        eq_nom = eq.get("nom", eq.get("numero_serie", "Équipement"))
        
        # 1. Alerte maintenance due
        date_prochaine_maint = eq.get("date_prochaine_maintenance")
        if date_prochaine_maint:
            if date_prochaine_maint <= date_limite_maintenance:
                est_en_retard = date_prochaine_maint < aujourdhui.isoformat()[:10]
                alertes.append({
                    "type": "maintenance",
                    "priorite": "haute" if est_en_retard else "moyenne",
                    "icone": "🔧",
                    "titre": "Maintenance due",
                    "description": f"{eq_nom}",
                    "categorie": cat_nom,
                    "date_echeance": date_prochaine_maint,
                    "en_retard": est_en_retard,
                    "equipement_id": eq.get("id"),
                    "lien": f"/actifs/equipements/{eq.get('id')}"
                })
        
        # 2. Alerte fin de vie
        date_fin_vie = eq.get("date_fin_vie")
        if date_fin_vie:
            if date_fin_vie <= date_limite_fin_vie:
                est_en_retard = date_fin_vie < aujourdhui.isoformat()[:10]
                alertes.append({
                    "type": "fin_vie",
                    "priorite": "haute" if est_en_retard else "moyenne",
                    "icone": "⏰",
                    "titre": "Fin de vie proche",
                    "description": f"{eq_nom}",
                    "categorie": cat_nom,
                    "date_echeance": date_fin_vie,
                    "en_retard": est_en_retard,
                    "equipement_id": eq.get("id"),
                    "lien": f"/actifs/equipements/{eq.get('id')}"
                })
        
        # 3. Alerte inspection due (basée sur fréquence de l'équipement uniquement)
        frequence_inspection = eq.get("frequence_inspection")  # Utiliser uniquement la fréquence de l'équipement
        derniere_inspection = eq.get("date_derniere_inspection") or eq.get("derniere_inspection")
        if frequence_inspection and frequence_inspection not in ["aucune", "", "apres_usage"]:
            prochaine_inspection = eq.get("date_prochaine_inspection") or calculer_prochaine_date(derniere_inspection, frequence_inspection)
            if prochaine_inspection and prochaine_inspection <= date_limite_maintenance:
                est_en_retard = prochaine_inspection < aujourdhui.isoformat()[:10]
                
                # Libellé de la fréquence pour l'affichage
                frequences_labels = {
                    "journaliere": "Journalière",
                    "hebdomadaire": "Hebdomadaire",
                    "mensuelle": "Mensuelle",
                    "bi_annuelle": "Bi-annuelle",
                    "annuelle": "Annuelle",
                    "2ans": "2 ans",
                    "2_ans": "2 ans"
                }
                freq_label = frequences_labels.get(frequence_inspection.lower().replace("-", "_"), frequence_inspection)
                
                # Récupérer les personnes ressources de la catégorie pour les notifications
                personnes_ressources = categorie.get("personnes_ressources", [])
                
                alertes.append({
                    "type": "inspection",
                    "priorite": "haute" if est_en_retard else "moyenne",
                    "icone": "🔍",
                    "titre": "Inspection due",
                    "description": f"{eq_nom} ({freq_label})",
                    "categorie": cat_nom,
                    "date_echeance": prochaine_inspection,
                    "en_retard": est_en_retard,
                    "equipement_id": eq.get("id"),
                    "lien": f"/actifs/equipements/{eq.get('id')}",
                    "personnes_ressources": personnes_ressources  # Pour les notifications
                })
        
        # 4. Champs spécifiques avec dates (péremptions)
        champs_specifiques = eq.get("champs_specifiques", {})
        for champ_key, champ_value in champs_specifiques.items():
            if isinstance(champ_value, str) and len(champ_value) == 10:
                try:
                    # Vérifier si c'est une date au format YYYY-MM-DD
                    datetime.strptime(champ_value, "%Y-%m-%d")
                    if champ_value <= date_limite_expiration:
                        est_en_retard = champ_value < aujourdhui.isoformat()[:10]
                        # Nom convivial du champ
                        champ_nom = champ_key.replace("_", " ").replace("date ", "").title()
                        alertes.append({
                            "type": "peremption",
                            "priorite": "haute" if est_en_retard else "moyenne",
                            "icone": "📅",
                            "titre": f"Péremption: {champ_nom}",
                            "description": f"{eq_nom}",
                            "categorie": cat_nom,
                            "date_echeance": champ_value,
                            "en_retard": est_en_retard,
                            "equipement_id": eq.get("id"),
                            "lien": f"/actifs/equipements/{eq.get('id')}"
                        })
                except ValueError:
                    pass
    
    # ==================== ALERTES EPI ====================
    
    # Filtrer les EPI selon le rôle
    if is_admin:
        epis = await db.epis.find({"tenant_id": tenant.id}).to_list(10000)
    else:
        # Utilisateur normal ou personne ressource: voit ses propres EPI
        epis = await db.epis.find({
            "tenant_id": tenant.id,
            "user_id": current_user.id
        }).to_list(1000)
    
    # Récupérer les types d'EPI pour la durée de vie
    types_epi = await db.types_epi.find({"tenant_id": tenant.id}).to_list(1000)
    types_epi_map = {t["id"]: t for t in types_epi}
    
    # Récupérer les users pour les noms
    users_map = {}
    if is_admin:
        users = await db.users.find({"tenant_id": tenant.id}, {"_id": 0, "id": 1, "prenom": 1, "nom": 1}).to_list(1000)
        users_map = {u["id"]: f"{u.get('prenom', '')} {u.get('nom', '')}" for u in users}
    
    # Récupérer les inspections du mois en cours pour vérifier les inspections manquées
    debut_mois = aujourdhui.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    inspections_mois = await db.inspections_epi.find({
        "tenant_id": tenant.id,
        "date_inspection": {"$gte": debut_mois.isoformat()}
    }).to_list(10000)
    
    # Créer un set des user_ids qui ont fait une inspection ce mois
    users_avec_inspection = set()
    for insp in inspections_mois:
        users_avec_inspection.add(insp.get("inspecteur_id"))
    
    for epi in epis:
        type_epi = types_epi_map.get(epi.get("type_epi_id"), {})
        epi_nom = f"{type_epi.get('nom', 'EPI')} - {epi.get('numero_serie', '')}"
        user_id = epi.get("user_id")
        user_nom = users_map.get(user_id, "Non assigné") if is_admin else "Mon EPI"
        
        # 1. Date d'expiration EPI
        date_expiration = epi.get("date_expiration")
        if date_expiration:
            if date_expiration <= date_limite_epi:
                est_en_retard = date_expiration < aujourdhui.isoformat()[:10]
                alertes.append({
                    "type": "epi_expiration",
                    "priorite": "haute" if est_en_retard else "moyenne",
                    "icone": "🦺",
                    "titre": "EPI - Expiration",
                    "description": f"{epi_nom}" + (f" ({user_nom})" if is_admin else ""),
                    "categorie": "EPI",
                    "date_echeance": date_expiration,
                    "en_retard": est_en_retard,
                    "epi_id": epi.get("id"),
                    "lien": "/mes-epi" if not is_admin else "/actifs?tab=epi"
                })
        
        # 2. Fin de vie EPI (date_mise_en_service + duree_vie_annees)
        date_mise_en_service = epi.get("date_mise_en_service")
        duree_vie = type_epi.get("duree_vie_annees", 10)
        if date_mise_en_service and duree_vie:
            try:
                date_service = datetime.strptime(date_mise_en_service[:10], "%Y-%m-%d")
                date_fin_vie_epi = date_service.replace(year=date_service.year + duree_vie)
                date_fin_vie_str = date_fin_vie_epi.strftime("%Y-%m-%d")
                
                if date_fin_vie_str <= date_limite_fin_vie:
                    est_en_retard = date_fin_vie_str < aujourdhui.isoformat()[:10]
                    alertes.append({
                        "type": "epi_fin_vie",
                        "priorite": "haute" if est_en_retard else "moyenne",
                        "icone": "⚠️",
                        "titre": "EPI - Fin de vie",
                        "description": f"{epi_nom}" + (f" ({user_nom})" if is_admin else ""),
                        "categorie": "EPI",
                        "date_echeance": date_fin_vie_str,
                        "en_retard": est_en_retard,
                        "epi_id": epi.get("id"),
                        "lien": "/mes-epi" if not is_admin else "/actifs?tab=epi"
                    })
            except Exception:
                pass
    
    # 3. Inspection mensuelle EPI non faite (pour utilisateurs avec EPI assignés)
    if params_epi.get("epi_alerte_inspection_mensuelle", False):
        jour_alerte = params_epi.get("epi_jour_alerte_inspection_mensuelle", 20)
        jour_actuel = aujourdhui.day
        
        if jour_actuel >= jour_alerte:
            # Grouper les EPI par utilisateur
            epis_par_user = {}
            for epi in epis:
                uid = epi.get("user_id")
                if uid:
                    if uid not in epis_par_user:
                        epis_par_user[uid] = 0
                    epis_par_user[uid] += 1
            
            # Vérifier qui n'a pas fait d'inspection
            for uid, nb_epi in epis_par_user.items():
                if uid not in users_avec_inspection:
                    if is_admin or uid == current_user.id:
                        user_nom = users_map.get(uid, "Utilisateur") if is_admin else "Vous"
                        alertes.append({
                            "type": "epi_inspection_mensuelle",
                            "priorite": "moyenne",
                            "icone": "🔔",
                            "titre": "Inspection EPI mensuelle",
                            "description": f"{user_nom}: {nb_epi} EPI à inspecter",
                            "categorie": "EPI",
                            "date_echeance": None,
                            "en_retard": True,
                            "user_id": uid,
                            "lien": "/mes-epi" if uid == current_user.id else "/actifs?tab=epi"
                        })
    
    # Trier les alertes: en retard d'abord, puis par date d'échéance
    alertes.sort(key=lambda x: (
        0 if x.get("en_retard") else 1,
        x.get("date_echeance") or "9999-99-99"
    ))
    
    # Compter par type
    compteurs = {}
    for alerte in alertes:
        t = alerte["type"]
        compteurs[t] = compteurs.get(t, 0) + 1
    
    return {
        "actif": True,
        "total": len(alertes),
        "compteurs": compteurs,
        "en_retard": sum(1 for a in alertes if a.get("en_retard")),
        "alertes": alertes[:50],  # Limiter à 50 alertes
        "parametres": {
            "delai_maintenance": delai_maintenance,
            "delai_expiration": delai_expiration,
            "delai_fin_vie": delai_fin_vie,
            "delai_epi": delai_epi
        }
    }


@router.get("/{tenant_slug}/dashboard/couverture-precise")
async def get_couverture_precise(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Calcule le taux de couverture précis du planning pour le mois en cours et le mois suivant.
    
    Logique (alignée avec Planning.jsx):
    - Pour chaque type de garde, on vérifie s'il s'applique au jour via jours_application
    - On compte: personnel_requis × jours applicables = créneaux requis
    - On compte les assignations effectives
    - Le taux = créneaux couverts / créneaux requis × 100
    
    Statuts:
    - Vert (complete): assignations >= personnel_requis
    - Orange (partielle): 0 < assignations < personnel_requis  
    - Rouge (vacante): assignations = 0
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de voir le planning
    can_view_planning = await user_has_module_action(tenant.id, current_user, "planning", "voir")
    if not can_view_planning:
        return {"taux_couverture": 0, "message": "Accès réservé aux administrateurs"}
    
    # Mapping des jours: Python weekday() -> nom anglais utilisé dans jours_application
    JOURS_MAPPING = {
        0: "monday",
        1: "tuesday", 
        2: "wednesday",
        3: "thursday",
        4: "friday",
        5: "saturday",
        6: "sunday"
    }
    
    # Noms des mois en français
    MOIS_FR = {
        1: "Janvier", 2: "Février", 3: "Mars", 4: "Avril",
        5: "Mai", 6: "Juin", 7: "Juillet", 8: "Août",
        9: "Septembre", 10: "Octobre", 11: "Novembre", 12: "Décembre"
    }
    
    def get_mois_label_fr(date_obj):
        """Retourne le label du mois en français (ex: 'Avril 2026')"""
        return f"{MOIS_FR[date_obj.month]} {date_obj.year}"
    
    def calculer_couverture_mois(debut_mois, fin_mois, types_garde, assignations):
        """Calcule la couverture pour une période donnée"""
        total_creneaux_requis = 0
        total_creneaux_couverts = 0
        
        for tg in types_garde:
            type_garde_id = tg.get("id")
            personnel_requis = tg.get("personnel_requis", 1)
            jours_application = tg.get("jours_application", [])  # Ex: ["monday", "tuesday", ...]
            
            # Compter les jours actifs pour ce type de garde dans le mois
            current_date = debut_mois
            while current_date <= fin_mois:
                jour_semaine = current_date.weekday()
                jour_nom = JOURS_MAPPING.get(jour_semaine)
                
                # Si pas de jours_application définis, la garde s'applique tous les jours
                is_applicable = (not jours_application) or (jour_nom in jours_application)
                
                if is_applicable:
                    # Ce jour nécessite ce type de garde
                    total_creneaux_requis += personnel_requis
                    
                    # Compter combien d'assignations couvrent ce créneau
                    date_str = current_date.strftime("%Y-%m-%d")
                    nb_assignes = sum(1 for a in assignations 
                                     if a.get("type_garde_id") == type_garde_id 
                                     and a.get("date", "").startswith(date_str))
                    total_creneaux_couverts += min(nb_assignes, personnel_requis)
                
                current_date += timedelta(days=1)
        
        # Calculer le taux
        if total_creneaux_requis > 0:
            taux = round((total_creneaux_couverts / total_creneaux_requis) * 100, 1)
        else:
            taux = 100.0
        
        postes_a_pourvoir = max(0, total_creneaux_requis - total_creneaux_couverts)
        
        return {
            "taux": taux,
            "creneaux_requis": total_creneaux_requis,
            "creneaux_couverts": total_creneaux_couverts,
            "postes_a_pourvoir": postes_a_pourvoir
        }
    
    # Dates du mois en cours
    today = datetime.now(timezone.utc)
    debut_mois_courant = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    fin_mois_courant = (debut_mois_courant + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    
    # Dates du mois suivant
    debut_mois_suivant = (fin_mois_courant + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    fin_mois_suivant = (debut_mois_suivant + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    
    # Récupérer les types de garde
    types_garde = await db.types_garde.find({"tenant_id": tenant.id}).to_list(1000)
    
    # Récupérer les assignations pour les 2 mois
    assignations = await db.assignations.find({
        "tenant_id": tenant.id,
        "date": {
            "$gte": debut_mois_courant.strftime("%Y-%m-%d"),
            "$lte": fin_mois_suivant.strftime("%Y-%m-%d")
        }
    }).to_list(20000)
    
    # Calculer pour le mois en cours
    mois_courant = calculer_couverture_mois(debut_mois_courant, fin_mois_courant, types_garde, assignations)
    
    # Calculer pour le mois suivant
    mois_suivant = calculer_couverture_mois(debut_mois_suivant, fin_mois_suivant, types_garde, assignations)
    
    return {
        "taux_couverture": mois_courant["taux"],
        "total_creneaux_requis": mois_courant["creneaux_requis"],
        "total_creneaux_couverts": mois_courant["creneaux_couverts"],
        "postes_a_pourvoir": mois_courant["postes_a_pourvoir"],
        "periode": {
            "debut": debut_mois_courant.strftime("%Y-%m-%d"),
            "fin": fin_mois_courant.strftime("%Y-%m-%d"),
            "label": get_mois_label_fr(debut_mois_courant)
        },
        "mois_suivant": {
            "taux_couverture": mois_suivant["taux"],
            "total_creneaux_requis": mois_suivant["creneaux_requis"],
            "total_creneaux_couverts": mois_suivant["creneaux_couverts"],
            "postes_a_pourvoir": mois_suivant["postes_a_pourvoir"],
            "periode": {
                "debut": debut_mois_suivant.strftime("%Y-%m-%d"),
                "fin": fin_mois_suivant.strftime("%Y-%m-%d"),
                "label": get_mois_label_fr(debut_mois_suivant)
            }
        }
    }


def calculer_prochaine_date(derniere_date: str, frequence: str) -> str:
    """Calcule la prochaine date d'inspection basée sur la fréquence"""
    if not derniere_date:
        return datetime.now(timezone.utc).isoformat()[:10]  # Due maintenant si jamais fait
    
    try:
        date_base = datetime.strptime(derniere_date[:10], "%Y-%m-%d")
        
        deltas = {
            # Fréquences standard
            "journaliere": timedelta(days=1),
            "quotidienne": timedelta(days=1),
            "hebdomadaire": timedelta(weeks=1),
            "mensuelle": timedelta(days=30),
            "bimestrielle": timedelta(days=60),  # Tous les 2 mois
            "trimestrielle": timedelta(days=90),
            "semestrielle": timedelta(days=180),
            "bi-annuelle": timedelta(days=180),  # Tous les 6 mois
            "bi_annuelle": timedelta(days=180),
            "annuelle": timedelta(days=365),
            "2ans": timedelta(days=730),
            "2_ans": timedelta(days=730),
            "5ans": timedelta(days=1825),  # 5 ans
            "5_ans": timedelta(days=1825),
            "apres_usage": None,  # Pas de calcul automatique
        }
        
        frequence_lower = frequence.lower().replace("-", "_").replace(" ", "_")
        delta = deltas.get(frequence_lower)
        
        if delta:
            prochaine = date_base + delta
            return prochaine.strftime("%Y-%m-%d")
        elif frequence_lower == "apres_usage":
            # Pour "après usage", on retourne None - pas d'alerte automatique
            return None
    except Exception:
        pass
    
    return None
