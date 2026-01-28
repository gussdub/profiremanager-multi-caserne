"""
Routes API pour le module Paie
==============================

Ce module gère toute la fonctionnalité de paie :
- Paramètres de paie par tenant
- Feuilles de temps
- Génération et export (PDF, Excel, Employeur D, Nethris)
- Intégrations avec les systèmes de paie externes
"""

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import logging
import io
import json
import csv
import httpx

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Paie"])
logger = logging.getLogger(__name__)


class ParametresPaie(BaseModel):
    """Paramètres de paie basés sur la convention collective du tenant"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    
    # Période de paie
    periode_paie_jours: int = 14  # 7, 14, 30 jours
    jour_debut_periode: str = "lundi"  # lundi, dimanche, etc.
    
    # Configuration par type de présence
    # Garde interne: déjà payé via salaire, stats seulement
    garde_interne_taux: float = 0.0  # Multiplicateur (0 = pas de paiement supplémentaire)
    garde_interne_minimum_heures: float = 0.0
    
    # Garde externe (astreinte à domicile)
    garde_externe_taux: float = 1.0  # Multiplicateur du taux horaire
    garde_externe_minimum_heures: float = 3.0  # Minimum payé même si intervention plus courte
    garde_externe_montant_fixe: float = 0.0  # Montant fixe par garde (alternative au taux)
    
    # Rappel (hors garde planifiée)
    rappel_taux: float = 1.0  # Multiplicateur du taux horaire
    rappel_minimum_heures: float = 3.0  # Minimum payé
    
    # Formations
    formation_taux: float = 1.0  # Multiplicateur pour les formations
    formation_taux_specifique: bool = False  # Si True, utiliser un taux différent
    formation_taux_horaire: float = 0.0  # Taux horaire spécifique pour formations
    
    # Heures supplémentaires (lié au paramètre Planning)
    heures_sup_seuil_hebdo: int = 40  # Seuil pour heures supplémentaires
    heures_sup_taux: float = 1.5  # Multiplicateur pour heures sup
    
    # Primes de repas (lié aux paramètres interventions)
    inclure_primes_repas: bool = True
    
    # Formats d'export
    formats_export_actifs: List[str] = ["pdf", "excel"]  # pdf, excel, employeur_d, nethris, mypeopledoc
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FeuilleTemps(BaseModel):
    """Feuille de temps générée pour un employé sur une période"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    
    # Période
    annee: int
    periode_debut: str  # Format YYYY-MM-DD
    periode_fin: str  # Format YYYY-MM-DD
    numero_periode: int  # Numéro de la période dans l'année
    
    # Informations employé (snapshot au moment de la génération)
    employe_nom: str
    employe_prenom: str
    employe_numero: str
    employe_grade: str
    employe_type_emploi: str  # temps_plein, temps_partiel
    employe_taux_horaire: float
    
    # Détails des heures
    lignes: List[dict] = []  # Liste des entrées détaillées
    # Chaque ligne: {date, type, description, heures_brutes, heures_payees, taux, montant, source_id, source_type}
    
    # Totaux calculés
    total_heures_gardes_internes: float = 0.0
    total_heures_gardes_externes: float = 0.0
    total_heures_rappels: float = 0.0
    total_heures_formations: float = 0.0
    total_heures_interventions: float = 0.0
    total_heures_supplementaires: float = 0.0
    
    total_heures_payees: float = 0.0
    total_montant_brut: float = 0.0
    total_primes_repas: float = 0.0
    total_montant_final: float = 0.0
    
    # Workflow
    statut: str = "brouillon"  # brouillon, valide, exporte
    
    # Audit
    genere_par: str
    genere_le: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    valide_par: Optional[str] = None
    valide_le: Optional[datetime] = None
    exporte_le: Optional[datetime] = None
    format_export: Optional[str] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== ENDPOINTS PARAMÈTRES PAIE ====================

@api_router.get("/{tenant_slug}/paie/parametres")
async def get_parametres_paie(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère les paramètres de paie du tenant"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs et superviseurs")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    params = await db.parametres_paie.find_one({"tenant_id": tenant["id"]}, {"_id": 0})
    
    if not params:
        # Créer les paramètres par défaut
        default_params = ParametresPaie(tenant_id=tenant["id"])
        await db.parametres_paie.insert_one(default_params.dict())
        params = default_params.dict()
        params.pop("_id", None)
    
    return params


@api_router.put("/{tenant_slug}/paie/parametres")
async def update_parametres_paie(
    tenant_slug: str,
    parametres: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Met à jour les paramètres de paie du tenant"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    parametres["updated_at"] = datetime.now(timezone.utc)
    parametres["tenant_id"] = tenant["id"]
    
    existing = await db.parametres_paie.find_one({"tenant_id": tenant["id"]})
    
    if existing:
        await db.parametres_paie.update_one(
            {"tenant_id": tenant["id"]},
            {"$set": parametres}
        )
    else:
        parametres["id"] = str(uuid.uuid4())
        parametres["created_at"] = datetime.now(timezone.utc)
        await db.parametres_paie.insert_one(parametres)
    
    return {"success": True}


# ==================== GÉNÉRATION FEUILLES DE TEMPS ====================

async def calculer_feuille_temps(
    tenant_id: str,
    user_id: str,
    periode_debut: str,
    periode_fin: str,
    params_paie: dict,
    params_planning: dict,
    current_user_id: str
) -> dict:
    """
    Calcule la feuille de temps pour un employé sur une période donnée.
    Agrège: gardes planifiées, interventions, formations.
    """
    # Récupérer l'employé
    employe = await db.users.find_one({"id": user_id}, {"_id": 0, "mot_de_passe_hash": 0})
    if not employe:
        raise HTTPException(status_code=404, detail="Employé non trouvé")
    
    lignes = []
    totaux = {
        "gardes_internes": 0.0,
        "gardes_externes": 0.0,
        "rappels": 0.0,
        "formations": 0.0,
        "interventions": 0.0,
        "heures_sup": 0.0,
        "heures_payees": 0.0,
        "montant_brut": 0.0,
        "primes_repas": 0.0
    }
    
    # Taux horaire: utiliser celui de l'employé ou le taux par défaut des paramètres
    taux_horaire = employe.get("taux_horaire", 0.0) or 0.0
    if taux_horaire == 0:
        taux_horaire = params_paie.get("taux_horaire_defaut", 25.0)
    
    type_emploi = employe.get("type_emploi", "temps_plein")
    est_temps_plein = type_emploi == "temps_plein"
    
    # Prime fonction supérieure: vérifier si l'employé peut occuper un poste supérieur
    a_fonction_superieur = employe.get("fonction_superieur", False)
    prime_fonction_superieure_pct = params_paie.get("prime_fonction_superieure_pct", 10) / 100  # Convertir % en décimal
    grade_employe = (employe.get("grade", "") or "").lower()
    
    # Hiérarchie des grades (du plus bas au plus haut)
    grades_hierarchie = {
        "pompier": 1,
        "lieutenant": 2,
        "capitaine": 3,
        "chef": 4,
        "directeur": 5,
        "eligible": 2,
        "éligible": 2
    }
    niveau_grade_employe = grades_hierarchie.get(grade_employe, 1)
    
    # Autorisation heures supplémentaires (depuis paramètres planning)
    heures_sup_autorisees = params_planning.get("activer_gestion_heures_sup", False)
    
    # 1. GARDES PLANIFIÉES (du module Planning)
    assignations = await db.assignations.find({
        "tenant_id": tenant_id,
        "user_id": user_id,
        "date": {"$gte": periode_debut, "$lte": periode_fin}
    }).to_list(1000)
    
    types_garde_map = {}
    types_garde = await db.types_garde.find({"tenant_id": tenant_id}).to_list(100)
    for tg in types_garde:
        types_garde_map[tg["id"]] = tg
    
    for assignation in assignations:
        type_garde = types_garde_map.get(assignation.get("type_garde_id"))
        if not type_garde:
            continue
        
        duree_heures = type_garde.get("duree_heures", 0)
        est_garde_externe = type_garde.get("est_garde_externe", False)
        
        # Vérifier si fonction supérieure s'applique
        # La position assignée (poste) peut avoir un grade_requis ou on utilise la logique existante
        position_id = assignation.get("position_id")
        applique_fonction_superieure = False
        taux_horaire_effectif = taux_horaire
        
        if a_fonction_superieur and position_id:
            # Récupérer la configuration de position pour voir le grade requis
            position = await db.positions.find_one({"id": position_id, "tenant_id": tenant_id})
            if position:
                grade_requis = (position.get("grade_requis", "") or "").lower()
                niveau_grade_requis = grades_hierarchie.get(grade_requis, 1)
                
                # Si le grade requis est supérieur au grade de l'employé, appliquer la prime
                if niveau_grade_requis > niveau_grade_employe:
                    applique_fonction_superieure = True
                    taux_horaire_effectif = taux_horaire * (1 + prime_fonction_superieure_pct)
        
        if est_garde_externe:
            # Garde externe: rémunérée
            taux = params_paie.get("garde_externe_taux", 1.0)
            minimum = params_paie.get("garde_externe_minimum_heures", 0)
            heures_payees = max(duree_heures, minimum) if duree_heures > 0 else 0
            montant = heures_payees * taux_horaire_effectif * taux
            
            # Ajouter le montant fixe de garde si configuré
            montant_fixe = type_garde.get("montant_garde", 0) or params_paie.get("garde_externe_montant_fixe", 0)
            montant += montant_fixe
            
            totaux["gardes_externes"] += duree_heures
            totaux["heures_payees"] += heures_payees
            totaux["montant_brut"] += montant
            
            description = f"Garde externe - {type_garde.get('nom')}"
            if applique_fonction_superieure:
                description += f" (Fonction supérieure +{int(prime_fonction_superieure_pct*100)}%)"
            
            lignes.append({
                "date": assignation.get("date"),
                "type": "garde_externe",
                "description": description,
                "heures_brutes": duree_heures,
                "heures_payees": heures_payees,
                "taux": taux,
                "montant": montant,
                "source_id": assignation.get("id"),
                "source_type": "assignation",
                "fonction_superieure": applique_fonction_superieure
            })
        else:
            # Garde interne: comptabilisée mais pas forcément payée en plus
            # Pour temps plein: déjà inclus dans le salaire
            # Pour temps partiel: payé
            if est_temps_plein:
                taux = params_paie.get("garde_interne_taux", 0.0)
            else:
                taux = 1.0  # Temps partiel payé normalement
            
            heures_payees = duree_heures
            montant = heures_payees * taux_horaire_effectif * taux
            
            totaux["gardes_internes"] += duree_heures
            if taux > 0:
                totaux["heures_payees"] += heures_payees
                totaux["montant_brut"] += montant
            
            description = f"Garde interne - {type_garde.get('nom')}"
            if applique_fonction_superieure and taux > 0:
                description += f" (Fonction supérieure +{int(prime_fonction_superieure_pct*100)}%)"
            
            lignes.append({
                "date": assignation.get("date"),
                "type": "garde_interne",
                "description": description,
                "heures_brutes": duree_heures,
                "heures_payees": heures_payees if taux > 0 else 0,
                "taux": taux,
                "montant": montant,
                "source_id": assignation.get("id"),
                "source_type": "assignation",
                "note": "Inclus dans salaire" if taux == 0 else None
            })
    
    # 2. INTERVENTIONS (présence aux interventions)
    interventions = await db.interventions.find({
        "tenant_id": tenant_id,
        "status": "signed",
        "xml_time_call_received": {"$gte": periode_debut, "$lte": periode_fin + "T23:59:59"}
    }).to_list(1000)
    
    for intervention in interventions:
        personnel_present = intervention.get("personnel_present", [])
        for p in personnel_present:
            if p.get("user_id") != user_id:
                continue
            
            # Calculer la durée de présence
            time_start = intervention.get("xml_time_call_received")
            time_end = intervention.get("xml_time_terminated") or intervention.get("xml_time_call_closed")
            
            if not time_start or not time_end:
                continue
            
            try:
                if isinstance(time_start, str):
                    start_dt = datetime.fromisoformat(time_start.replace('Z', '+00:00'))
                else:
                    start_dt = time_start
                if isinstance(time_end, str):
                    end_dt = datetime.fromisoformat(time_end.replace('Z', '+00:00'))
                else:
                    end_dt = time_end
                
                duree_heures = (end_dt - start_dt).total_seconds() / 3600
            except:
                continue
            
            # Vérifier si l'employé était en garde interne ce jour-là
            date_intervention = start_dt.strftime("%Y-%m-%d")
            assignation_jour = next(
                (a for a in assignations 
                 if a.get("date") == date_intervention 
                 and not types_garde_map.get(a.get("type_garde_id"), {}).get("est_garde_externe", False)),
                None
            )
            
            statut_presence = p.get("statut", "present")
            
            # Vérifier si l'employé a été utilisé en fonction supérieure pour cette intervention
            utilise_fonction_superieure = p.get("utilise_fonction_superieure", False)
            taux_horaire_intervention = taux_horaire
            
            if utilise_fonction_superieure and a_fonction_superieur:
                # Appliquer la prime de fonction supérieure
                taux_horaire_intervention = taux_horaire * (1 + prime_fonction_superieure_pct)
            
            if assignation_jour and statut_presence == "present":
                # Était en garde interne - intervention comptée dans stats mais pas payée en plus
                totaux["interventions"] += duree_heures
                description = f"Intervention #{intervention.get('external_call_id')} - {intervention.get('type_intervention', 'N/A')}"
                if utilise_fonction_superieure:
                    description += f" (Fonction supérieure +{int(prime_fonction_superieure_pct*100)}%)"
                
                lignes.append({
                    "date": date_intervention,
                    "type": "intervention_garde_interne",
                    "description": description,
                    "heures_brutes": round(duree_heures, 2),
                    "heures_payees": 0,
                    "taux": 0,
                    "montant": 0,
                    "source_id": intervention.get("id"),
                    "source_type": "intervention",
                    "fonction_superieure": utilise_fonction_superieure,
                    "note": "Déjà en garde interne - comptabilisé dans statistiques"
                })
            elif statut_presence in ["rappele", "present"]:
                # Rappel ou garde externe - payé
                taux = params_paie.get("rappel_taux", 1.0)
                minimum = params_paie.get("rappel_minimum_heures", 3.0)
                heures_payees = max(duree_heures, minimum)
                montant = heures_payees * taux_horaire_intervention * taux
                
                totaux["rappels"] += duree_heures
                totaux["heures_payees"] += heures_payees
                totaux["montant_brut"] += montant
                
                description = f"Intervention #{intervention.get('external_call_id')} - {intervention.get('type_intervention', 'N/A')}"
                if utilise_fonction_superieure:
                    description += f" (Fonction supérieure +{int(prime_fonction_superieure_pct*100)}%)"
                
                lignes.append({
                    "date": date_intervention,
                    "type": "rappel" if statut_presence == "rappele" else "intervention",
                    "description": description,
                    "heures_brutes": round(duree_heures, 2),
                    "heures_payees": round(heures_payees, 2),
                    "taux": taux,
                    "montant": round(montant, 2),
                    "source_id": intervention.get("id"),
                    "source_type": "intervention",
                    "fonction_superieure": utilise_fonction_superieure
                })
            
            # Primes de repas
            if params_paie.get("inclure_primes_repas", True):
                primes_repas_montant = 0
                params_interventions = await db.intervention_settings.find_one({"tenant_id": tenant_id})
                if params_interventions:
                    if p.get("prime_dejeuner"):
                        primes_repas_montant += params_interventions.get("repas_dejeuner", {}).get("montant", 0)
                    if p.get("prime_diner"):
                        primes_repas_montant += params_interventions.get("repas_diner", {}).get("montant", 0)
                    if p.get("prime_souper"):
                        primes_repas_montant += params_interventions.get("repas_souper", {}).get("montant", 0)
                
                if primes_repas_montant > 0:
                    totaux["primes_repas"] += primes_repas_montant
                    lignes.append({
                        "date": date_intervention,
                        "type": "prime_repas",
                        "description": f"Primes repas - Intervention #{intervention.get('external_call_id')}",
                        "heures_brutes": 0,
                        "heures_payees": 0,
                        "taux": 0,
                        "montant": primes_repas_montant,
                        "source_id": intervention.get("id"),
                        "source_type": "intervention"
                    })
    
    # 3. FORMATIONS
    inscriptions = await db.inscriptions_formations.find({
        "tenant_id": tenant_id,
        "user_id": user_id,
        "statut": {"$in": ["present", "complete"]}
    }).to_list(500)
    
    for inscription in inscriptions:
        formation = await db.formations.find_one({"id": inscription.get("formation_id")})
        if not formation:
            continue
        
        # Vérifier si la formation est dans la période
        date_formation = formation.get("date_debut", "")
        if not (periode_debut <= date_formation <= periode_fin):
            continue
        
        duree_heures = inscription.get("heures_creditees", 0) or formation.get("duree_heures", 0)
        
        # Taux pour formations
        if params_paie.get("formation_taux_specifique", False):
            taux_formation = params_paie.get("formation_taux_horaire", taux_horaire)
            montant = duree_heures * taux_formation
        else:
            taux = params_paie.get("formation_taux", 1.0)
            montant = duree_heures * taux_horaire * taux
        
        totaux["formations"] += duree_heures
        totaux["heures_payees"] += duree_heures
        totaux["montant_brut"] += montant
        
        lignes.append({
            "date": date_formation,
            "type": "formation",
            "description": f"Formation - {formation.get('nom')}",
            "heures_brutes": duree_heures,
            "heures_payees": duree_heures,
            "taux": params_paie.get("formation_taux", 1.0),
            "montant": round(montant, 2),
            "source_id": formation.get("id"),
            "source_type": "formation"
        })
    
    # 4. CALCUL HEURES SUPPLÉMENTAIRES (si autorisées)
    if heures_sup_autorisees:
        seuil = params_paie.get("heures_sup_seuil_hebdo", 40)
        taux_sup = params_paie.get("heures_sup_taux", 1.5)
        
        # Regrouper par semaine pour calculer les heures sup
        heures_par_semaine = {}
        for ligne in lignes:
            if ligne.get("heures_payees", 0) > 0:
                date_str = ligne.get("date", "")
                if date_str:
                    try:
                        dt = datetime.strptime(date_str, "%Y-%m-%d")
                        # Trouver le lundi de la semaine
                        lundi = dt - timedelta(days=dt.weekday())
                        semaine_key = lundi.strftime("%Y-%m-%d")
                        heures_par_semaine[semaine_key] = heures_par_semaine.get(semaine_key, 0) + ligne.get("heures_payees", 0)
                    except:
                        pass
        
        for semaine, heures in heures_par_semaine.items():
            if heures > seuil:
                heures_sup = heures - seuil
                montant_sup = heures_sup * taux_horaire * (taux_sup - 1)  # Différentiel seulement
                totaux["heures_sup"] += heures_sup
                totaux["montant_brut"] += montant_sup
                
                lignes.append({
                    "date": semaine,
                    "type": "heures_supplementaires",
                    "description": f"Heures supplémentaires semaine du {semaine}",
                    "heures_brutes": heures_sup,
                    "heures_payees": heures_sup,
                    "taux": taux_sup - 1,  # Différentiel
                    "montant": round(montant_sup, 2),
                    "source_id": None,
                    "source_type": "calcul"
                })
    
    # Trier les lignes par date
    lignes.sort(key=lambda x: x.get("date", ""))
    
    # Calculer le numéro de période
    try:
        debut_dt = datetime.strptime(periode_debut, "%Y-%m-%d")
        debut_annee = datetime(debut_dt.year, 1, 1)
        jours_depuis_debut = (debut_dt - debut_annee).days
        numero_periode = (jours_depuis_debut // params_paie.get("periode_paie_jours", 14)) + 1
    except:
        numero_periode = 1
    
    # Construire la feuille de temps
    feuille = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "user_id": user_id,
        "annee": datetime.strptime(periode_debut, "%Y-%m-%d").year,
        "periode_debut": periode_debut,
        "periode_fin": periode_fin,
        "numero_periode": numero_periode,
        
        "employe_nom": employe.get("nom", ""),
        "employe_prenom": employe.get("prenom", ""),
        "employe_numero": employe.get("numero_employe", ""),
        "employe_grade": employe.get("grade", ""),
        "employe_type_emploi": type_emploi,
        "employe_taux_horaire": taux_horaire,
        
        "lignes": lignes,
        
        "total_heures_gardes_internes": round(totaux["gardes_internes"], 2),
        "total_heures_gardes_externes": round(totaux["gardes_externes"], 2),
        "total_heures_rappels": round(totaux["rappels"], 2),
        "total_heures_formations": round(totaux["formations"], 2),
        "total_heures_interventions": round(totaux["interventions"], 2),
        "total_heures_supplementaires": round(totaux["heures_sup"], 2),
        
        "total_heures_payees": round(totaux["heures_payees"], 2),
        "total_montant_brut": round(totaux["montant_brut"], 2),
        "total_primes_repas": round(totaux["primes_repas"], 2),
        "total_montant_final": round(totaux["montant_brut"] + totaux["primes_repas"], 2),
        
        "statut": "brouillon",
        "genere_par": current_user_id,
        "genere_le": datetime.now(timezone.utc),
        
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    return feuille


@api_router.post("/{tenant_slug}/paie/feuilles-temps/generer")
async def generer_feuille_temps(
    tenant_slug: str,
    params: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Génère une feuille de temps pour un employé sur une période"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs et superviseurs")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    user_id = params.get("user_id")
    periode_debut = params.get("periode_debut")
    periode_fin = params.get("periode_fin")
    
    if not user_id or not periode_debut or not periode_fin:
        raise HTTPException(status_code=400, detail="user_id, periode_debut et periode_fin sont requis")
    
    # Récupérer les paramètres
    params_paie = await db.parametres_paie.find_one({"tenant_id": tenant["id"]}) or {}
    params_planning = await db.parametres_attribution.find_one({"tenant_id": tenant["id"]}) or {}
    
    # Vérifier si une feuille existe déjà pour cette période
    existing = await db.feuilles_temps.find_one({
        "tenant_id": tenant["id"],
        "user_id": user_id,
        "periode_debut": periode_debut,
        "periode_fin": periode_fin
    })
    
    if existing and existing.get("statut") != "brouillon":
        raise HTTPException(
            status_code=400, 
            detail="Une feuille de temps validée existe déjà pour cette période. Utilisez la regénération."
        )
    
    # Calculer la feuille
    feuille = await calculer_feuille_temps(
        tenant_id=tenant["id"],
        user_id=user_id,
        periode_debut=periode_debut,
        periode_fin=periode_fin,
        params_paie=params_paie,
        params_planning=params_planning,
        current_user_id=current_user.id
    )
    
    # Supprimer l'ancienne feuille brouillon si elle existe
    if existing:
        await db.feuilles_temps.delete_one({"id": existing["id"]})
    
    # Enregistrer la nouvelle feuille
    await db.feuilles_temps.insert_one(feuille)
    
    # Retourner sans _id
    feuille.pop("_id", None)
    
    return {"success": True, "feuille": feuille}


@api_router.get("/{tenant_slug}/paie/feuilles-temps")
async def lister_feuilles_temps(
    tenant_slug: str,
    annee: Optional[int] = None,
    mois: Optional[str] = None,
    user_id: Optional[str] = None,
    statut: Optional[str] = None,
    limit: int = 100,
    current_user: User = Depends(get_current_user)
):
    """Liste les feuilles de temps du tenant"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs et superviseurs")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    query = {"tenant_id": tenant["id"]}
    
    if annee:
        query["annee"] = annee
    if mois:
        # Filtrer par mois en utilisant periode_debut
        query["periode_debut"] = {"$regex": f"^{annee}-{mois}"}
    if user_id:
        query["user_id"] = user_id
    if statut:
        query["statut"] = statut
    
    feuilles = await db.feuilles_temps.find(
        query, {"_id": 0}
    ).sort([("annee", -1), ("periode_debut", -1)]).limit(limit).to_list(limit)
    
    return {"feuilles": feuilles}


@api_router.get("/{tenant_slug}/paie/feuilles-temps/{feuille_id}")
async def get_feuille_temps(
    tenant_slug: str,
    feuille_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère une feuille de temps spécifique"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs et superviseurs")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    feuille = await db.feuilles_temps.find_one(
        {"id": feuille_id, "tenant_id": tenant["id"]},
        {"_id": 0}
    )
    
    if not feuille:
        raise HTTPException(status_code=404, detail="Feuille de temps non trouvée")
    
    return feuille


@api_router.post("/{tenant_slug}/paie/feuilles-temps/{feuille_id}/valider")
async def valider_feuille_temps(
    tenant_slug: str,
    feuille_id: str,
    current_user: User = Depends(get_current_user)
):
    """Valide une feuille de temps (passage brouillon -> validé)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent valider les feuilles de temps")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    feuille = await db.feuilles_temps.find_one({
        "id": feuille_id,
        "tenant_id": tenant["id"]
    })
    
    if not feuille:
        raise HTTPException(status_code=404, detail="Feuille de temps non trouvée")
    
    if feuille.get("statut") != "brouillon":
        raise HTTPException(status_code=400, detail="Seules les feuilles en brouillon peuvent être validées")
    
    await db.feuilles_temps.update_one(
        {"id": feuille_id},
        {"$set": {
            "statut": "valide",
            "valide_par": current_user.id,
            "valide_le": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"success": True}


@api_router.put("/{tenant_slug}/paie/feuilles-temps/{feuille_id}")
async def modifier_feuille_temps(
    tenant_slug: str,
    feuille_id: str,
    data: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Modifie une feuille de temps (uniquement si en brouillon)"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs et superviseurs")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    feuille = await db.feuilles_temps.find_one({
        "id": feuille_id,
        "tenant_id": tenant["id"]
    })
    
    if not feuille:
        raise HTTPException(status_code=404, detail="Feuille de temps non trouvée")
    
    if feuille.get("statut") != "brouillon":
        raise HTTPException(status_code=400, detail="Seules les feuilles en brouillon peuvent être modifiées")
    
    # Récupérer les types d'heures personnalisés du tenant pour catégoriser correctement
    event_types = await db.tenant_payroll_event_types.find({"tenant_id": tenant["id"]}).to_list(100)
    event_type_categories = {et.get("code"): et.get("category", "heures") for et in event_types}
    
    # Mettre à jour les lignes si fournies
    update_data = {"updated_at": datetime.now(timezone.utc)}
    
    if "lignes" in data:
        lignes = data["lignes"]
        update_data["lignes"] = lignes
        
        # Recalculer les totaux
        totaux = {
            "gardes_internes": 0.0,
            "gardes_externes": 0.0,
            "rappels": 0.0,
            "formations": 0.0,
            "interventions": 0.0,
            "heures_sup": 0.0,
            "heures_payees": 0.0,
            "montant_brut": 0.0,
            "primes_repas": 0.0
        }
        
        for ligne in lignes:
            type_ligne = (ligne.get("type", "") or "").lower()
            code_ligne = ligne.get("type", "")
            heures = float(ligne.get("heures_payees", 0) or 0)
            montant = float(ligne.get("montant", 0) or 0)
            
            # Catégoriser selon le type (codes personnalisés ou standards)
            if "garde_interne" in type_ligne or "H_GARDE_INTERNE" in code_ligne:
                totaux["gardes_internes"] += heures
            elif "garde_externe" in type_ligne or "H_GARDE_EXTERNE" in code_ligne:
                totaux["gardes_externes"] += heures
            elif "rappel" in type_ligne or "H_RAPPEL" in code_ligne:
                totaux["rappels"] += heures
            elif "formation" in type_ligne or "pratique" in type_ligne or "H_FORMATION" in code_ligne or "H_PRATIQUE" in code_ligne:
                totaux["formations"] += heures
            elif "intervention" in type_ligne or "H_INTERVENTION" in code_ligne:
                totaux["interventions"] += heures
            elif "heures_supplementaires" in type_ligne or "H_SUPPLEMENTAIRE" in code_ligne:
                totaux["heures_sup"] += heures
            elif "prime_repas" in type_ligne or "REPAS" in code_ligne:
                totaux["primes_repas"] += montant
            else:
                # Type personnalisé: utiliser la catégorie
                category = event_type_categories.get(code_ligne, "heures")
                if category == "prime":
                    totaux["primes_repas"] += montant
                # Autres types comptent dans heures_payees générales
            
            totaux["heures_payees"] += heures
            totaux["montant_brut"] += montant
        
        update_data["total_heures_gardes_internes"] = round(totaux["gardes_internes"], 2)
        update_data["total_heures_gardes_externes"] = round(totaux["gardes_externes"], 2)
        update_data["total_heures_rappels"] = round(totaux["rappels"], 2)
        update_data["total_heures_formations"] = round(totaux["formations"], 2)
        update_data["total_heures_interventions"] = round(totaux.get("interventions", 0), 2)
        update_data["total_heures_supplementaires"] = round(totaux["heures_sup"], 2)
        update_data["total_heures_payees"] = round(totaux["heures_payees"], 2)
        update_data["total_montant_brut"] = round(totaux["montant_brut"], 2)
        update_data["total_primes_repas"] = round(totaux["primes_repas"], 2)
        update_data["total_montant_final"] = round(totaux["montant_brut"], 2)  # primes déjà incluses dans montant_brut
    
    update_data["modifie_par"] = current_user.id
    update_data["modifie_le"] = datetime.now(timezone.utc)
    
    await db.feuilles_temps.update_one(
        {"id": feuille_id},
        {"$set": update_data}
    )
    
    # Récupérer la feuille mise à jour
    feuille_updated = await db.feuilles_temps.find_one(
        {"id": feuille_id},
        {"_id": 0}
    )
    
    return {"success": True, "feuille": feuille_updated}


@api_router.post("/{tenant_slug}/paie/feuilles-temps/{feuille_id}/lignes")
async def ajouter_ligne_feuille_temps(
    tenant_slug: str,
    feuille_id: str,
    ligne: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Ajoute une ligne manuelle à une feuille de temps"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs et superviseurs")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    feuille = await db.feuilles_temps.find_one({
        "id": feuille_id,
        "tenant_id": tenant["id"]
    })
    
    if not feuille:
        raise HTTPException(status_code=404, detail="Feuille de temps non trouvée")
    
    if feuille.get("statut") != "brouillon":
        raise HTTPException(status_code=400, detail="Seules les feuilles en brouillon peuvent être modifiées")
    
    # Préparer la nouvelle ligne
    nouvelle_ligne = {
        "id": str(uuid.uuid4()),
        "date": ligne.get("date", ""),
        "type": ligne.get("type", "autre"),
        "description": ligne.get("description", "Ajout manuel"),
        "heures_brutes": float(ligne.get("heures_brutes", 0) or 0),
        "heures_payees": float(ligne.get("heures_payees", 0) or 0),
        "taux": float(ligne.get("taux", 1) or 1),
        "montant": float(ligne.get("montant", 0) or 0),
        "source_type": "manuel",
        "ajoute_par": current_user.id,
        "ajoute_le": datetime.now(timezone.utc).isoformat()
    }
    
    # Ajouter la ligne
    lignes = feuille.get("lignes", []) or []
    lignes.append(nouvelle_ligne)
    lignes.sort(key=lambda x: x.get("date", ""))
    
    # Recalculer les totaux
    await db.feuilles_temps.update_one(
        {"id": feuille_id},
        {"$set": {"lignes": lignes, "updated_at": datetime.now(timezone.utc)}}
    )
    
    # Utiliser l'endpoint de modification pour recalculer les totaux
    return await modifier_feuille_temps(tenant_slug, feuille_id, {"lignes": lignes}, current_user)


@api_router.delete("/{tenant_slug}/paie/feuilles-temps/{feuille_id}")
async def supprimer_feuille_temps(
    tenant_slug: str,
    feuille_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime une feuille de temps (brouillon uniquement)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent supprimer les feuilles de temps")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    feuille = await db.feuilles_temps.find_one({
        "id": feuille_id,
        "tenant_id": tenant["id"]
    })
    
    if not feuille:
        raise HTTPException(status_code=404, detail="Feuille de temps non trouvée")
    
    if feuille.get("statut") != "brouillon":
        raise HTTPException(status_code=400, detail="Seules les feuilles en brouillon peuvent être supprimées")
    
    await db.feuilles_temps.delete_one({"id": feuille_id})
    
    return {"success": True}


# ==================== EXPORT FICHIER PAIE (FORMAT NETHRIS/EXCEL) ====================

@api_router.post("/{tenant_slug}/paie/export")
async def export_feuilles_temps(
    tenant_slug: str,
    params: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Exporte les feuilles de temps au format Excel"""
    from fastapi.responses import StreamingResponse
    import pandas as pd
    from io import BytesIO
    
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs et superviseurs")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    feuille_ids = params.get("feuille_ids", [])
    
    # Récupérer les feuilles à exporter (validées OU déjà exportées)
    if feuille_ids:
        feuilles = await db.feuilles_temps.find({
            "id": {"$in": feuille_ids},
            "tenant_id": tenant["id"],
            "statut": {"$in": ["valide", "exporte"]}  # Inclure validées ET exportées
        }, {"_id": 0}).to_list(500)
    else:
        # Exporter toutes les feuilles validées ou exportées si aucun ID spécifié
        feuilles = await db.feuilles_temps.find({
            "tenant_id": tenant["id"],
            "statut": {"$in": ["valide", "exporte"]}  # Inclure validées ET exportées
        }, {"_id": 0}).to_list(500)
    
    if not feuilles:
        raise HTTPException(status_code=400, detail="Aucune feuille validée ou exportée à exporter")
    
    # Récupérer la config du tenant (optionnelle)
    config = await db.tenant_payroll_config.find_one({"tenant_id": tenant["id"]})
    company_number = config.get("company_number", "") if config else ""
    
    # Récupérer le fournisseur de paie sélectionné pour le nom du fichier
    provider_name = "paie"
    if config and config.get("provider_id"):
        provider = await db.payroll_providers.find_one({"id": config["provider_id"]}, {"_id": 0})
        if provider:
            provider_name = provider.get("name", "paie").lower().replace(" ", "_")
    
    code_mappings = await db.client_pay_code_mappings.find(
        {"tenant_id": tenant["id"]},
        {"_id": 0}
    ).to_list(100)
    
    # Créer un mapping interne -> code externe
    type_to_code = {m["internal_event_type"]: m["external_pay_code"] for m in code_mappings}
    
    # Préparer les données pour le format Nethris
    export_rows = []
    
    for feuille in feuilles:
        employe = await db.users.find_one({"id": feuille.get("user_id")}, {"_id": 0})
        if not employe:
            continue
        
        matricule = employe.get("matricule_paie") or employe.get("numero_employe") or ""
        
        # Grouper les lignes par semaine (Nethris importe par semaine)
        lignes = feuille.get("lignes", []) or []
        
        for ligne in lignes:
            # Déterminer le code de gain
            type_ligne = ligne.get("type", "").upper()
            # Convertir le type interne vers le code Nethris
            type_mapping = {
                "GARDE_INTERNE": "H_GARDE_INTERNE",
                "GARDE_EXTERNE": "H_GARDE_EXTERNE",
                "RAPPEL": "H_INTERVENTION",
                "FORMATION": "H_PRATIQUE",
                "INTERVENTION": "H_INTERVENTION",
                "PRIME_REPAS": "PR_REPAS",
                "AUTRE": "H_AUTRE"
            }
            internal_type = type_mapping.get(type_ligne, type_ligne)
            code_gain = type_to_code.get(internal_type, "")
            
            heures = ligne.get("heures_payees", 0) or 0
            montant = ligne.get("montant", 0) or 0
            
            if heures > 0 or montant > 0:
                row = {
                    "Matricule": matricule,
                    "Code de gain": code_gain,
                    "Heures": round(heures, 2) if heures > 0 else "",
                    "Montant": round(montant, 2) if montant > 0 else "",
                    "Date": ligne.get("date", ""),
                    "Description": ligne.get("description", ""),
                    "Division": "",  # À remplir si mapping configuré
                    "Département": ""
                }
                export_rows.append(row)
    
    if not export_rows:
        raise HTTPException(status_code=400, detail="Aucune donnée à exporter")
    
    # Créer le fichier Excel
    df = pd.DataFrame(export_rows)
    
    # Réordonner les colonnes pour Nethris
    column_order = ["Matricule", "Code de gain", "Heures", "Montant", "Date", "Description", "Division", "Département"]
    df = df[[col for col in column_order if col in df.columns]]
    
    file_buffer = BytesIO()
    with pd.ExcelWriter(file_buffer, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Import Paie')
    
    file_buffer.seek(0)
    
    # Marquer les feuilles comme exportées
    for feuille in feuilles:
        await db.feuilles_temps.update_one(
            {"id": feuille["id"]},
            {"$set": {
                "statut": "exporte",
                "exporte_le": datetime.now(timezone.utc),
                "format_export": f"Excel {provider_name.title()}",
                "exporte_par": current_user.id
            }}
        )
    
    # Générer le nom du fichier avec l'heure locale (UTC-5 pour Québec approximatif)
    from datetime import timedelta
    local_time = datetime.now(timezone.utc) - timedelta(hours=5)
    filename = f"export_paie_{provider_name}_{tenant_slug}_{local_time.strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return StreamingResponse(
        file_buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ==================== GÉNÉRATION EN LOT DES FEUILLES DE TEMPS ====================

@api_router.post("/{tenant_slug}/paie/feuilles-temps/generer-lot")
async def generer_feuilles_temps_lot(
    tenant_slug: str,
    params: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Génère les feuilles de temps pour TOUS les employés actifs sur une période"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs et superviseurs")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    periode_debut = params.get("periode_debut")
    periode_fin = params.get("periode_fin")
    
    if not periode_debut or not periode_fin:
        raise HTTPException(status_code=400, detail="periode_debut et periode_fin sont requis")
    
    # Récupérer les paramètres de paie (dans collection parametres avec type=paie ou parametres_paie)
    params_paie = await db.parametres.find_one({"tenant_id": tenant["id"], "type": "paie"})
    if not params_paie:
        params_paie = await db.parametres_paie.find_one({"tenant_id": tenant["id"]})
    params_paie = params_paie or {}
    
    params_planning = await db.parametres_attribution.find_one({"tenant_id": tenant["id"]}) or {}
    
    # Récupérer tous les employés actifs
    employes = await db.users.find({
        "tenant_id": tenant["id"],
        "statut": "Actif"
    }, {"_id": 0, "mot_de_passe_hash": 0}).to_list(1000)
    
    results = {
        "generees": 0,
        "mises_a_jour": 0,
        "erreurs": [],
        "feuilles_ids": []
    }
    
    for employe in employes:
        try:
            # Vérifier si une feuille existe déjà
            existing = await db.feuilles_temps.find_one({
                "tenant_id": tenant["id"],
                "user_id": employe["id"],
                "periode_debut": periode_debut,
                "periode_fin": periode_fin
            })
            
            if existing and existing.get("statut") != "brouillon":
                continue  # Ne pas écraser les feuilles validées
            
            # Calculer la feuille
            feuille = await calculer_feuille_temps(
                tenant_id=tenant["id"],
                user_id=employe["id"],
                periode_debut=periode_debut,
                periode_fin=periode_fin,
                params_paie=params_paie,
                params_planning=params_planning,
                current_user_id=current_user.id
            )
            
            if existing:
                await db.feuilles_temps.delete_one({"id": existing["id"]})
                results["mises_a_jour"] += 1
            else:
                results["generees"] += 1
            
            await db.feuilles_temps.insert_one(feuille)
            results["feuilles_ids"].append(feuille["id"])
            
        except Exception as e:
            results["erreurs"].append({
                "employe": f"{employe.get('prenom')} {employe.get('nom')}",
                "erreur": str(e)
            })
    
    return {
        "success": True,
        "message": f"{results['generees']} feuilles générées, {results['mises_a_jour']} mises à jour",
        **results
    }


# ==================== SYSTÈME D'EXPORTATION DE PAIE CONFIGURABLE ====================

class PayrollProvider(BaseModel):
    """Fournisseur de paie (géré par Super Admin)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # Nethris, Employeur D, Ceridian, My People Doc
    description: str = ""
    export_format: str = "xlsx"  # csv, xlsx, xml, txt
    delimiter: str = ";"  # Pour CSV
    encoding: str = "utf-8"
    date_format: str = "%Y-%m-%d"
    decimal_separator: str = "."
    include_header: bool = True
    is_active: bool = True
    
    # Configuration API (si disponible)
    api_available: bool = False  # True si ce fournisseur supporte l'envoi direct via API
    api_base_url: str = ""  # URL de base de l'API (ex: https://api.nethris.com)
    api_auth_type: str = "oauth2"  # oauth2, api_key, basic
    api_token_url: str = ""  # URL pour obtenir le token OAuth2
    api_upload_endpoint: str = ""  # Endpoint pour uploader les fichiers
    api_config_endpoint: str = ""  # Endpoint pour récupérer la configuration (codes gains/déductions)
    api_scopes: List[str] = []  # Scopes OAuth2 requis
    api_documentation_url: str = ""  # Lien vers la documentation
    
    # Champs requis pour la configuration du tenant
    api_required_fields: List[dict] = []  # [{name, label, type, required, help_text}]
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProviderColumnDefinition(BaseModel):
    """Définition des colonnes pour un fournisseur (géré par Super Admin)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    provider_id: str
    position: int  # Ordre de la colonne (1, 2, 3...)
    header_name: str  # Nom de l'en-tête dans le fichier
    data_source_type: str  # fixed_value, employee_attribute, mapped_code, calculated_value
    static_value: Optional[str] = None  # Valeur fixe si type = fixed_value
    internal_field_reference: Optional[str] = None  # Champ interne (employee_matricule, hours_regular, etc.)
    default_value: Optional[str] = None  # Valeur par défaut si mapping non trouvé
    format_pattern: Optional[str] = None  # Format spécifique (ex: pour les dates)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ClientPayCodeMapping(BaseModel):
    """Mapping des codes internes vers codes du logiciel de paie (par Tenant)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    internal_event_type: str  # INTERVENTION, TRAINING, STATION_DUTY, EXTERNAL_DUTY, CALLBACK, MEAL_PRIME, MILEAGE
    external_pay_code: str  # Code attendu par le logiciel de paie (ex: '105', 'REG', 'T-FEU')
    description: str = ""
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TenantPayrollConfig(BaseModel):
    """Configuration de paie spécifique au tenant"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    provider_id: Optional[str] = None  # Fournisseur de paie sélectionné
    
    # Configuration Nethris spécifique
    company_number: Optional[str] = None  # Numéro de compagnie Nethris (sans lettres)
    company_number_mode: str = "single"  # "single" ou "per_branch" (par succursale)
    branch_company_numbers: dict = {}  # {succursale_id: numero_compagnie}
    
    # Codes de gains standards Nethris (comme Agendrix)
    code_gain_regulier: str = "1"  # Code pour temps régulier
    code_gain_supplementaire: str = "43"  # Code pour temps supplémentaire
    code_gain_formation_regulier: str = ""  # Code pour formation régulière
    code_gain_formation_sup: str = ""  # Code pour formation supplémentaire
    
    # Correspondances organisationnelles (Nethris)
    division_mapping: dict = {}  # {position_id: division_nethris}
    service_mapping: dict = {}  # {succursale_id: service_nethris}
    departement_mapping: dict = {}  # {grade_id: departement_nethris}
    
    # Credentials API du tenant (chiffrés/sécurisés)
    api_credentials: dict = {}  # {client_id, client_secret, business_id, company_number, etc.}
    api_connection_tested: bool = False
    api_last_test_date: Optional[datetime] = None
    api_last_test_result: Optional[str] = None
    
    # Champs personnalisables
    champs_supplementaires: List[dict] = []  # [{nom, type, valeur_defaut}]
    # Options d'export
    inclure_employes_sans_heures: bool = False
    grouper_par_code: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== ENDPOINTS SUPER ADMIN - FOURNISSEURS DE PAIE ====================

@api_router.get("/super-admin/payroll-providers")
async def list_payroll_providers(
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Liste tous les fournisseurs de paie (Super Admin)"""
    providers = await db.payroll_providers.find({}, {"_id": 0}).to_list(100)
    return {"providers": providers}


@api_router.post("/super-admin/payroll-providers")
async def create_payroll_provider(
    provider_data: dict = Body(...),
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Crée un nouveau fournisseur de paie (Super Admin)"""
    provider = PayrollProvider(**provider_data)
    await db.payroll_providers.insert_one(provider.dict())
    
    return {"success": True, "provider": provider.dict()}


@api_router.put("/super-admin/payroll-providers/{provider_id}")
async def update_payroll_provider(
    provider_id: str,
    provider_data: dict = Body(...),
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Met à jour un fournisseur de paie (Super Admin)"""
    provider_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.payroll_providers.update_one(
        {"id": provider_id},
        {"$set": provider_data}
    )
    
    return {"success": True}


@api_router.delete("/super-admin/payroll-providers/{provider_id}")
async def delete_payroll_provider(
    provider_id: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Supprime un fournisseur de paie (Super Admin)"""
    # Supprimer aussi les colonnes associées
    await db.provider_column_definitions.delete_many({"provider_id": provider_id})
    await db.payroll_providers.delete_one({"id": provider_id})
    
    return {"success": True}


# ==================== ENDPOINTS SUPER ADMIN - COLONNES DES FOURNISSEURS ====================

@api_router.get("/super-admin/payroll-providers/{provider_id}/columns")
async def get_provider_columns(
    provider_id: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    
    columns = await db.provider_column_definitions.find(
        {"provider_id": provider_id},
        {"_id": 0}
    ).sort("position", 1).to_list(100)
    
    return {"columns": columns}


@api_router.post("/super-admin/payroll-providers/{provider_id}/columns")
async def create_provider_column(
    provider_id: str,
    column_data: dict = Body(...),
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Ajoute une colonne à un fournisseur (Super Admin)"""
    column_data["provider_id"] = provider_id
    column = ProviderColumnDefinition(**column_data)
    await db.provider_column_definitions.insert_one(column.dict())
    
    return {"success": True, "column": column.dict()}


@api_router.put("/super-admin/payroll-providers/{provider_id}/columns/{column_id}")
async def update_provider_column(
    provider_id: str,
    column_id: str,
    column_data: dict = Body(...),
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Met à jour une colonne (Super Admin)"""
    await db.provider_column_definitions.update_one(
        {"id": column_id, "provider_id": provider_id},
        {"$set": column_data}
    )
    
    return {"success": True}


@api_router.delete("/super-admin/payroll-providers/{provider_id}/columns/{column_id}")
async def delete_provider_column(
    provider_id: str,
    column_id: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Supprime une colonne (Super Admin)"""
    await db.provider_column_definitions.delete_one({"id": column_id, "provider_id": provider_id})
    
    return {"success": True}


@api_router.post("/super-admin/payroll-providers/{provider_id}/columns/reorder")
async def reorder_provider_columns(
    provider_id: str,
    order_data: dict = Body(...),
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Réordonne les colonnes d'un fournisseur (Super Admin)"""
    column_ids = order_data.get("column_ids", [])
    
    for i, col_id in enumerate(column_ids, start=1):
        await db.provider_column_definitions.update_one(
            {"id": col_id, "provider_id": provider_id},
            {"$set": {"position": i}}
        )
    
    return {"success": True}


# ==================== ENDPOINTS TENANT - CONFIGURATION PAIE ====================

@api_router.get("/{tenant_slug}/paie/config")
async def get_tenant_payroll_config(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère la configuration de paie du tenant"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    config = await db.tenant_payroll_config.find_one({"tenant_id": tenant["id"]}, {"_id": 0})
    
    if not config:
        config = TenantPayrollConfig(tenant_id=tenant["id"]).dict()
        await db.tenant_payroll_config.insert_one(config)
    
    # Récupérer les fournisseurs actifs pour le dropdown
    providers = await db.payroll_providers.find({"is_active": True}, {"_id": 0}).to_list(50)
    
    return {"config": config, "providers_disponibles": providers}


@api_router.put("/{tenant_slug}/paie/config")
async def update_tenant_payroll_config(
    tenant_slug: str,
    config_data: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Met à jour la configuration de paie du tenant"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    config_data["updated_at"] = datetime.now(timezone.utc)
    config_data["tenant_id"] = tenant["id"]
    
    existing = await db.tenant_payroll_config.find_one({"tenant_id": tenant["id"]})
    
    if existing:
        await db.tenant_payroll_config.update_one(
            {"tenant_id": tenant["id"]},
            {"$set": config_data}
        )
    else:
        config_data["id"] = str(uuid.uuid4())
        config_data["created_at"] = datetime.now(timezone.utc)
        await db.tenant_payroll_config.insert_one(config_data)
    
    return {"success": True}


# ==================== ENDPOINTS TENANT - MAPPING DES CODES ====================

@api_router.get("/{tenant_slug}/paie/code-mappings")
async def get_pay_code_mappings(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère les mappings de codes de paie du tenant"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs et superviseurs")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    mappings = await db.client_pay_code_mappings.find(
        {"tenant_id": tenant["id"]},
        {"_id": 0}
    ).to_list(100)
    
    # Récupérer les types d'heures personnalisés du tenant
    custom_event_types = await db.tenant_payroll_event_types.find(
        {"tenant_id": tenant["id"]},
        {"_id": 0}
    ).to_list(100)
    
    # Si pas de types personnalisés, utiliser les types par défaut
    if not custom_event_types:
        # Types par défaut (exemples génériques)
        default_event_types = [
            {"code": "HEURES_REGULIERES", "label": "Heures régulières", "category": "heures"},
            {"code": "HEURES_SUP", "label": "Heures supplémentaires", "category": "heures"},
            {"code": "FORMATION", "label": "Formation", "category": "heures"},
            {"code": "PRIME_REPAS", "label": "Prime repas", "category": "prime"},
            {"code": "KILOMETRAGE", "label": "Kilométrage", "category": "frais"},
        ]
        internal_event_types = default_event_types
    else:
        internal_event_types = custom_event_types
    
    return {"mappings": mappings, "event_types": internal_event_types}


@api_router.post("/{tenant_slug}/paie/code-mappings")
async def create_pay_code_mapping(
    tenant_slug: str,
    mapping_data: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Crée un mapping de code de paie"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    mapping_data["tenant_id"] = tenant["id"]
    mapping = ClientPayCodeMapping(**mapping_data)
    
    # Vérifier si un mapping existe déjà pour ce type
    existing = await db.client_pay_code_mappings.find_one({
        "tenant_id": tenant["id"],
        "internal_event_type": mapping.internal_event_type
    })
    
    if existing:
        await db.client_pay_code_mappings.update_one(
            {"id": existing["id"]},
            {"$set": mapping.dict()}
        )
    else:
        await db.client_pay_code_mappings.insert_one(mapping.dict())
    
    return {"success": True, "mapping": mapping.dict()}


@api_router.delete("/{tenant_slug}/paie/code-mappings/{mapping_id}")
async def delete_pay_code_mapping(
    tenant_slug: str,
    mapping_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime un mapping de code de paie"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    await db.client_pay_code_mappings.delete_one({
        "id": mapping_id,
        "tenant_id": tenant["id"]
    })
    
    return {"success": True}


@api_router.put("/{tenant_slug}/paie/matricules")
async def update_employee_matricules(
    tenant_slug: str,
    data: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Met à jour les matricules de paie pour tous les employés (Nethris)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    matricules = data.get("matricules", {})
    updated_count = 0
    
    for user_id, matricule in matricules.items():
        result = await db.users.update_one(
            {"id": user_id, "tenant_id": tenant["id"]},
            {"$set": {"matricule_paie": matricule}}
        )
        if result.modified_count > 0:
            updated_count += 1
    
    return {"success": True, "updated_count": updated_count}


@api_router.put("/{tenant_slug}/users/{user_id}/matricule-paie")
async def update_single_employee_matricule(
    tenant_slug: str,
    user_id: str,
    data: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Met à jour le matricule de paie pour un seul employé"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    matricule_paie = data.get("matricule_paie", "")
    
    result = await db.users.update_one(
        {"id": user_id, "tenant_id": tenant["id"]},
        {"$set": {"matricule_paie": matricule_paie}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    return {"success": True}


# ==================== TYPES D'HEURES PERSONNALISÉS PAR TENANT ====================

@api_router.get("/{tenant_slug}/paie/event-types")
async def get_tenant_event_types(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère les types d'heures personnalisés du tenant"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    event_types = await db.tenant_payroll_event_types.find(
        {"tenant_id": tenant["id"]},
        {"_id": 0}
    ).to_list(100)
    
    return {"event_types": event_types}


@api_router.post("/{tenant_slug}/paie/event-types")
async def create_tenant_event_type(
    tenant_slug: str,
    data: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Crée un nouveau type d'heures pour le tenant"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Vérifier que le code n'existe pas déjà
    existing = await db.tenant_payroll_event_types.find_one({
        "tenant_id": tenant["id"],
        "code": data.get("code")
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Ce code existe déjà")
    
    event_type = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant["id"],
        "code": data.get("code", "").upper().replace(" ", "_"),
        "label": data.get("label", ""),
        "category": data.get("category", "heures"),  # heures, prime, frais
        "unit": data.get("unit", "heures"),  # heures, km, montant, quantite
        "default_rate": float(data.get("default_rate", 0)),  # Taux par défaut
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.tenant_payroll_event_types.insert_one(event_type)
    
    return {"success": True, "event_type": {k: v for k, v in event_type.items() if k != "_id"}}


@api_router.put("/{tenant_slug}/paie/event-types/{event_type_id}")
async def update_tenant_event_type(
    tenant_slug: str,
    event_type_id: str,
    data: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Met à jour un type d'heures du tenant"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    update_data = {}
    if "label" in data:
        update_data["label"] = data["label"]
    if "category" in data:
        update_data["category"] = data["category"]
    if "unit" in data:
        update_data["unit"] = data["unit"]
    if "default_rate" in data:
        update_data["default_rate"] = float(data["default_rate"])
    
    if update_data:
        await db.tenant_payroll_event_types.update_one(
            {"id": event_type_id, "tenant_id": tenant["id"]},
            {"$set": update_data}
        )
    
    return {"success": True}


@api_router.delete("/{tenant_slug}/paie/event-types/{event_type_id}")
async def delete_tenant_event_type(
    tenant_slug: str,
    event_type_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime un type d'heures du tenant"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Supprimer aussi les mappings associés
    await db.client_pay_code_mappings.delete_many({
        "tenant_id": tenant["id"],
        "internal_event_type": event_type_id
    })
    
    await db.tenant_payroll_event_types.delete_one({
        "id": event_type_id,
        "tenant_id": tenant["id"]
    })
    
    return {"success": True}


# ==================== SERVICE D'EXPORTATION DE PAIE ====================

async def build_payroll_export_data(
    tenant_id: str,
    feuilles: List[dict],
    provider: dict,
    columns: List[dict],
    code_mappings: List[dict]
) -> List[dict]:
    """
    Construit les données d'export selon la configuration du fournisseur.
    Retourne une liste de lignes à exporter.
    """
    # Créer un dictionnaire de mapping pour accès rapide
    mapping_dict = {m["internal_event_type"]: m["external_pay_code"] for m in code_mappings}
    
    export_rows = []
    
    for feuille in feuilles:
        # Récupérer les infos employé
        employe = await db.users.find_one({"id": feuille["user_id"]}, {"_id": 0, "mot_de_passe_hash": 0})
        if not employe:
            continue
        
        # Pour chaque ligne de la feuille de temps
        for ligne in feuille.get("lignes", []):
            if ligne.get("montant", 0) == 0 and ligne.get("heures_payees", 0) == 0:
                continue  # Ignorer les lignes sans valeur
            
            row = {}
            
            # Construire la ligne selon les colonnes définies
            for col in columns:
                col_name = col["header_name"]
                source_type = col["data_source_type"]
                
                if source_type == "fixed_value":
                    row[col_name] = col.get("static_value", "")
                    
                elif source_type == "employee_attribute":
                    field_ref = col.get("internal_field_reference", "")
                    if field_ref == "employee_matricule":
                        row[col_name] = employe.get("numero_employe", "")
                    elif field_ref == "employee_nom":
                        row[col_name] = employe.get("nom", "")
                    elif field_ref == "employee_prenom":
                        row[col_name] = employe.get("prenom", "")
                    elif field_ref == "employee_email":
                        row[col_name] = employe.get("email", "")
                    elif field_ref == "employee_grade":
                        row[col_name] = employe.get("grade", "")
                    elif field_ref == "employee_type_emploi":
                        row[col_name] = employe.get("type_emploi", "")
                    else:
                        row[col_name] = employe.get(field_ref, col.get("default_value", ""))
                        
                elif source_type == "mapped_code":
                    # Déterminer le type d'événement interne
                    ligne_type = ligne.get("type", "")
                    internal_code = None
                    
                    if ligne_type == "garde_interne":
                        internal_code = "GARDE_INTERNE"
                    elif ligne_type == "garde_externe":
                        internal_code = "GARDE_EXTERNE"
                    elif ligne_type == "rappel":
                        internal_code = "INTERVENTION_RAPPEL"
                    elif ligne_type == "intervention":
                        internal_code = "INTERVENTION_GARDE"
                    elif ligne_type == "formation":
                        internal_code = "FORMATION"
                    elif ligne_type == "heures_supplementaires":
                        internal_code = "HEURES_SUP"
                    elif ligne_type == "prime_repas":
                        if "déjeuner" in ligne.get("description", "").lower():
                            internal_code = "PRIME_DEJEUNER"
                        elif "dîner" in ligne.get("description", "").lower():
                            internal_code = "PRIME_DINER"
                        elif "souper" in ligne.get("description", "").lower():
                            internal_code = "PRIME_SOUPER"
                    
                    # Chercher le code externe
                    if internal_code and internal_code in mapping_dict:
                        row[col_name] = mapping_dict[internal_code]
                    else:
                        row[col_name] = col.get("default_value", "")
                        
                elif source_type == "calculated_value":
                    field_ref = col.get("internal_field_reference", "")
                    if field_ref == "hours":
                        row[col_name] = ligne.get("heures_payees", 0)
                    elif field_ref == "amount":
                        row[col_name] = ligne.get("montant", 0)
                    elif field_ref == "rate":
                        row[col_name] = ligne.get("taux", 1)
                    elif field_ref == "date":
                        date_val = ligne.get("date", "")
                        if col.get("format_pattern"):
                            try:
                                dt = datetime.strptime(date_val, "%Y-%m-%d")
                                row[col_name] = dt.strftime(col["format_pattern"])
                            except:
                                row[col_name] = date_val
                        else:
                            row[col_name] = date_val
                    elif field_ref == "description":
                        row[col_name] = ligne.get("description", "")
                    elif field_ref == "periode_debut":
                        row[col_name] = feuille.get("periode_debut", "")
                    elif field_ref == "periode_fin":
                        row[col_name] = feuille.get("periode_fin", "")
                    else:
                        row[col_name] = col.get("default_value", "")
            
            export_rows.append(row)
    
    return export_rows


@api_router.post("/{tenant_slug}/paie/export")
async def export_payroll(
    tenant_slug: str,
    export_params: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """
    Exporte les données de paie selon le format du fournisseur configuré.
    Retourne un fichier Excel, CSV ou autre selon la configuration.
    """
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs et superviseurs")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Récupérer la configuration du tenant
    config = await db.tenant_payroll_config.find_one({"tenant_id": tenant["id"]})
    if not config or not config.get("provider_id"):
        raise HTTPException(status_code=400, detail="Aucun fournisseur de paie configuré. Allez dans Paramètres > Paie.")
    
    # Récupérer le fournisseur
    provider = await db.payroll_providers.find_one({"id": config["provider_id"]})
    if not provider:
        raise HTTPException(status_code=404, detail="Fournisseur de paie non trouvé")
    
    # Récupérer les colonnes du fournisseur
    columns = await db.provider_column_definitions.find(
        {"provider_id": provider["id"]}
    ).sort("position", 1).to_list(100)
    
    if not columns:
        raise HTTPException(status_code=400, detail="Le fournisseur n'a pas de colonnes configurées")
    
    # Récupérer les mappings de codes
    code_mappings = await db.client_pay_code_mappings.find(
        {"tenant_id": tenant["id"], "is_active": True}
    ).to_list(100)
    
    # Récupérer les feuilles de temps à exporter
    feuille_ids = export_params.get("feuille_ids", [])
    periode_debut = export_params.get("periode_debut")
    periode_fin = export_params.get("periode_fin")
    
    query = {"tenant_id": tenant["id"], "statut": {"$in": ["valide", "brouillon"]}}
    
    if feuille_ids:
        query["id"] = {"$in": feuille_ids}
    elif periode_debut and periode_fin:
        query["periode_debut"] = periode_debut
        query["periode_fin"] = periode_fin
    else:
        raise HTTPException(status_code=400, detail="Spécifiez feuille_ids ou periode_debut/periode_fin")
    
    feuilles = await db.feuilles_temps.find(query, {"_id": 0}).to_list(1000)
    
    if not feuilles:
        raise HTTPException(status_code=404, detail="Aucune feuille de temps trouvée")
    
    # Construire les données d'export
    export_rows = await build_payroll_export_data(
        tenant_id=tenant["id"],
        feuilles=feuilles,
        provider=provider,
        columns=columns,
        code_mappings=code_mappings
    )
    
    if not export_rows:
        raise HTTPException(status_code=404, detail="Aucune donnée à exporter")
    
    # Générer le fichier selon le format
    export_format = provider.get("export_format", "xlsx")
    
    if export_format == "xlsx":
        import pandas as pd
        from io import BytesIO
        
        df = pd.DataFrame(export_rows)
        # Réordonner les colonnes selon l'ordre défini
        ordered_cols = [c["header_name"] for c in columns if c["header_name"] in df.columns]
        df = df[ordered_cols]
        
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Paie')
        output.seek(0)
        
        filename = f"export_paie_{tenant_slug}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        
        # Marquer les feuilles comme exportées
        for feuille in feuilles:
            await db.feuilles_temps.update_one(
                {"id": feuille["id"]},
                {"$set": {
                    "statut": "exporte",
                    "exporte_le": datetime.now(timezone.utc),
                    "format_export": provider["name"]
                }}
            )
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    elif export_format == "csv":
        import csv
        from io import StringIO
        
        output = StringIO()
        delimiter = provider.get("delimiter", ";")
        
        if export_rows:
            fieldnames = [c["header_name"] for c in columns]
            writer = csv.DictWriter(output, fieldnames=fieldnames, delimiter=delimiter)
            
            if provider.get("include_header", True):
                writer.writeheader()
            
            for row in export_rows:
                writer.writerow({k: row.get(k, "") for k in fieldnames})
        
        output.seek(0)
        filename = f"export_paie_{tenant_slug}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        
        # Marquer les feuilles comme exportées
        for feuille in feuilles:
            await db.feuilles_temps.update_one(
                {"id": feuille["id"]},
                {"$set": {
                    "statut": "exporte",
                    "exporte_le": datetime.now(timezone.utc),
                    "format_export": provider["name"]
                }}
            )
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    
    else:
        raise HTTPException(status_code=400, detail=f"Format d'export non supporté: {export_format}")


# ==================== CHAMPS SUPPLÉMENTAIRES PARAMÉTRABLES ====================

@api_router.get("/{tenant_slug}/paie/champs-supplementaires")
async def get_champs_supplementaires(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère les champs supplémentaires configurés (kilométrage, frais, etc.)"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs et superviseurs")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    config = await db.tenant_payroll_config.find_one({"tenant_id": tenant["id"]})
    
    champs = config.get("champs_supplementaires", []) if config else []
    
    # Champs par défaut suggérés
    champs_suggeres = [
        {"nom": "kilometrage", "label": "Kilométrage", "type": "number", "unite": "km", "taux_par_unite": 0.58},
        {"nom": "frais_repas", "label": "Frais de repas", "type": "number", "unite": "$"},
        {"nom": "frais_equipement", "label": "Frais d'équipement", "type": "number", "unite": "$"},
        {"nom": "prime_specialite", "label": "Prime de spécialité", "type": "number", "unite": "$"}
    ]
    
    return {"champs": champs, "champs_suggeres": champs_suggeres}


@api_router.put("/{tenant_slug}/paie/champs-supplementaires")
async def update_champs_supplementaires(
    tenant_slug: str,
    champs_data: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Met à jour les champs supplémentaires"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    champs = champs_data.get("champs", [])
    
    await db.tenant_payroll_config.update_one(
        {"tenant_id": tenant["id"]},
        {"$set": {"champs_supplementaires": champs, "updated_at": datetime.now(timezone.utc)}},
        upsert=True
    )
    
    return {"success": True}


# ==================== INTÉGRATION API FOURNISSEURS DE PAIE ====================

@api_router.post("/{tenant_slug}/paie/api/save-credentials")
async def save_api_credentials(
    tenant_slug: str,
    credentials: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Enregistre les credentials API du fournisseur de paie pour ce tenant"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    await db.tenant_payroll_config.update_one(
        {"tenant_id": tenant["id"]},
        {"$set": {
            "api_credentials": credentials,
            "api_connection_tested": False,
            "updated_at": datetime.now(timezone.utc)
        }},
        upsert=True
    )
    
    return {"success": True}


@api_router.post("/{tenant_slug}/paie/api/test-connection")
async def test_api_connection(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Teste la connexion API avec le fournisseur de paie"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Récupérer la config du tenant
    config = await db.tenant_payroll_config.find_one({"tenant_id": tenant["id"]})
    if not config or not config.get("provider_id"):
        raise HTTPException(status_code=400, detail="Aucun fournisseur de paie configuré")
    
    # Récupérer le fournisseur
    provider = await db.payroll_providers.find_one({"id": config["provider_id"]})
    if not provider:
        raise HTTPException(status_code=404, detail="Fournisseur non trouvé")
    
    if not provider.get("api_available"):
        raise HTTPException(status_code=400, detail="Ce fournisseur ne supporte pas l'intégration API")
    
    credentials = config.get("api_credentials", {})
    if not credentials:
        raise HTTPException(status_code=400, detail="Credentials API non configurés")
    
    # Tester la connexion selon le fournisseur
    import httpx
    
    try:
        provider_name = provider.get("name", "").lower()
        
        if "nethris" in provider_name:
            # Test connexion Nethris
            # Nethris utilise Basic Auth avec un utilisateur service
            # Format: user_code:password encodé en Base64
            user_code = credentials.get("user_code", "")
            company_code = credentials.get("company_code", "")
            password = credentials.get("password", "")
            
            if not user_code or not company_code or not password:
                raise HTTPException(status_code=400, detail="Credentials incomplets. Requis: user_code, company_code, password")
            
            # Nethris API utilise OAuth2 avec les credentials de l'utilisateur service
            token_url = provider.get("api_token_url", "https://api.nethris.com/OAuth/Token")
            
            async with httpx.AsyncClient() as client:
                # Essayer d'obtenir un token OAuth2
                response = await client.post(
                    token_url,
                    data={
                        "grant_type": "password",
                        "username": f"{company_code}/{user_code}",
                        "password": password,
                        "scope": "api"
                    },
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded"
                    },
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    token_data = response.json()
                    result = "success"
                    message = f"Connexion réussie à Nethris. Token valide pour {token_data.get('expires_in', 'N/A')} secondes."
                elif response.status_code == 401:
                    result = "error"
                    message = "Authentification échouée. Vérifiez vos credentials (user_code, company_code, password)."
                elif response.status_code == 400:
                    result = "error"
                    message = f"Requête invalide: {response.text[:200]}"
                else:
                    result = "error"
                    message = f"Erreur Nethris: {response.status_code} - {response.text[:200]}"
        
        elif "employeur" in provider_name:
            # Test connexion Employeur D (OAuth2)
            token_url = provider.get("api_token_url", "https://api.employeurd.com/oauth/token")
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    token_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": credentials.get("client_id"),
                        "client_secret": credentials.get("client_secret")
                    },
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    result = "success"
                    message = "Connexion réussie à Employeur D"
                else:
                    result = "error"
                    message = f"Erreur Employeur D: {response.status_code} - {response.text[:200]}"
        
        elif "ceridian" in provider_name:
            # Test connexion SFTP pour Ceridian
            import paramiko
            
            sftp_host = credentials.get("sftp_host", "")
            sftp_port = int(credentials.get("sftp_port", 22) or 22)
            sftp_username = credentials.get("sftp_username", "")
            sftp_password = credentials.get("sftp_password", "")
            
            if not sftp_host or not sftp_username or not sftp_password:
                raise HTTPException(status_code=400, detail="Credentials SFTP incomplets (host, username, password requis)")
            
            try:
                transport = paramiko.Transport((sftp_host, sftp_port))
                transport.connect(username=sftp_username, password=sftp_password)
                sftp = paramiko.SFTPClient.from_transport(transport)
                
                # Lister le dossier racine pour vérifier la connexion
                files = sftp.listdir('.')
                
                sftp.close()
                transport.close()
                
                result = "success"
                message = f"Connexion SFTP réussie à {sftp_host}. {len(files)} éléments trouvés dans le dossier racine."
            except paramiko.AuthenticationException:
                result = "error"
                message = "Authentification SFTP échouée. Vérifiez le nom d'utilisateur et mot de passe."
            except paramiko.SSHException as e:
                result = "error"
                message = f"Erreur SSH: {str(e)}"
            except Exception as e:
                result = "error"
                message = f"Erreur connexion SFTP: {str(e)}"
        
        else:
            # Fournisseur générique - test basique
            result = "unknown"
            message = "Test non implémenté pour ce fournisseur. Les credentials ont été sauvegardés."
        
        # Enregistrer le résultat du test
        await db.tenant_payroll_config.update_one(
            {"tenant_id": tenant["id"]},
            {"$set": {
                "api_connection_tested": result == "success",
                "api_last_test_date": datetime.now(timezone.utc),
                "api_last_test_result": message
            }}
        )
        
        return {
            "success": result == "success",
            "result": result,
            "message": message
        }
        
    except httpx.TimeoutException:
        message = "Timeout lors de la connexion à l'API"
        await db.tenant_payroll_config.update_one(
            {"tenant_id": tenant["id"]},
            {"$set": {
                "api_connection_tested": False,
                "api_last_test_date": datetime.now(timezone.utc),
                "api_last_test_result": message
            }}
        )
        return {"success": False, "result": "error", "message": message}
        
    except Exception as e:
        message = f"Erreur de connexion: {str(e)}"
        await db.tenant_payroll_config.update_one(
            {"tenant_id": tenant["id"]},
            {"$set": {
                "api_connection_tested": False,
                "api_last_test_date": datetime.now(timezone.utc),
                "api_last_test_result": message
            }}
        )
        return {"success": False, "result": "error", "message": message}


@api_router.post("/{tenant_slug}/paie/api/send")
async def send_payroll_to_api(
    tenant_slug: str,
    export_params: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Envoie les données de paie directement au fournisseur via API"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs et superviseurs")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Récupérer la config du tenant
    config = await db.tenant_payroll_config.find_one({"tenant_id": tenant["id"]})
    if not config or not config.get("provider_id"):
        raise HTTPException(status_code=400, detail="Aucun fournisseur de paie configuré")
    
    # Récupérer le fournisseur
    provider = await db.payroll_providers.find_one({"id": config["provider_id"]})
    if not provider:
        raise HTTPException(status_code=404, detail="Fournisseur non trouvé")
    
    if not provider.get("api_available"):
        raise HTTPException(status_code=400, detail="Ce fournisseur ne supporte pas l'envoi via API. Utilisez l'export fichier.")
    
    credentials = config.get("api_credentials", {})
    if not credentials:
        raise HTTPException(status_code=400, detail="Credentials API non configurés")
    
    if not config.get("api_connection_tested"):
        raise HTTPException(status_code=400, detail="Veuillez d'abord tester la connexion API")
    
    # Récupérer les feuilles de temps à envoyer
    feuille_ids = export_params.get("feuille_ids", [])
    if not feuille_ids:
        raise HTTPException(status_code=400, detail="Aucune feuille de temps sélectionnée")
    
    feuilles = await db.feuilles_temps.find({
        "id": {"$in": feuille_ids},
        "tenant_id": tenant["id"],
        "statut": "valide"
    }, {"_id": 0}).to_list(1000)
    
    if not feuilles:
        raise HTTPException(status_code=404, detail="Aucune feuille de temps validée trouvée")
    
    # Récupérer les colonnes et mappings
    columns = await db.provider_column_definitions.find(
        {"provider_id": provider["id"]}
    ).sort("position", 1).to_list(100)
    
    code_mappings = await db.client_pay_code_mappings.find(
        {"tenant_id": tenant["id"], "is_active": True}
    ).to_list(100)
    
    # Construire les données d'export
    export_rows = await build_payroll_export_data(
        tenant_id=tenant["id"],
        feuilles=feuilles,
        provider=provider,
        columns=columns,
        code_mappings=code_mappings
    )
    
    if not export_rows:
        raise HTTPException(status_code=404, detail="Aucune donnée à exporter")
    
    # Générer le fichier temporaire
    import pandas as pd
    from io import BytesIO
    
    df = pd.DataFrame(export_rows)
    ordered_cols = [c["header_name"] for c in columns if c["header_name"] in df.columns]
    df = df[ordered_cols]
    
    file_buffer = BytesIO()
    
    export_format = provider.get("export_format", "csv")
    if export_format == "xlsx":
        with pd.ExcelWriter(file_buffer, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Paie')
        file_extension = "xlsx"
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        delimiter = provider.get("delimiter", ";")
        df.to_csv(file_buffer, index=False, sep=delimiter)
        file_extension = "csv"
        content_type = "text/csv"
    
    file_buffer.seek(0)
    file_content = file_buffer.read()
    
    # Envoyer à l'API du fournisseur
    import httpx
    
    try:
        provider_name = provider.get("name", "").lower()
        
        if "nethris" in provider_name:
            # Envoi vers Nethris avec authentification utilisateur service
            user_code = credentials.get("user_code", "")
            company_code = credentials.get("company_code", "")
            password = credentials.get("password", "")
            
            if not user_code or not company_code or not password:
                raise HTTPException(status_code=400, detail="Credentials Nethris incomplets")
            
            token_url = provider.get("api_token_url", "https://api.nethris.com/OAuth/Token")
            upload_url = provider.get("api_upload_endpoint", "https://api.nethris.com/V2.00/CCC/ImportFileUpload")
            
            async with httpx.AsyncClient() as client:
                # 1. Obtenir le token avec les credentials service user
                token_response = await client.post(
                    token_url,
                    data={
                        "grant_type": "password",
                        "username": f"{company_code}/{user_code}",
                        "password": password,
                        "scope": "api"
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=30.0
                )
                
                if token_response.status_code != 200:
                    raise HTTPException(status_code=400, detail=f"Erreur d'authentification Nethris: {token_response.text[:200]}")
                
                token_data = token_response.json()
                access_token = token_data.get("access_token")
                
                # 2. Envoyer le fichier d'import
                filename = f"paie_{tenant_slug}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{file_extension}"
                
                files = {"file": (filename, file_content, content_type)}
                
                upload_response = await client.post(
                    f"{upload_url}/{company_code}",
                    headers={"Authorization": f"Bearer {access_token}"},
                    files=files,
                    timeout=60.0
                )
                
                if upload_response.status_code in [200, 201]:
                    # Succès - marquer les feuilles comme exportées
                    for feuille in feuilles:
                        await db.feuilles_temps.update_one(
                            {"id": feuille["id"]},
                            {"$set": {
                                "statut": "exporte",
                                "exporte_le": datetime.now(timezone.utc),
                                "format_export": f"API {provider['name']}"
                            }}
                        )
                    
                    return {
                        "success": True,
                        "message": f"Données envoyées avec succès à {provider['name']}",
                        "feuilles_exportees": len(feuilles)
                    }
                else:
                    return {
                        "success": False,
                        "message": f"Erreur lors de l'envoi: {upload_response.status_code} - {upload_response.text[:300]}"
                    }
        
        elif "employeur" in provider_name:
            # Envoi vers Employeur D (OAuth2 client_credentials)
            client_id = credentials.get("client_id", "")
            client_secret = credentials.get("client_secret", "")
            company_id = credentials.get("company_id", "")
            
            if not client_id or not client_secret or not company_id:
                raise HTTPException(status_code=400, detail="Credentials Employeur D incomplets")
            
            token_url = provider.get("api_token_url", "https://api.employeurd.com/connect/token")
            upload_url = provider.get("api_upload_endpoint", "https://api.employeurd.com/api/v1/timesheets/import")
            
            async with httpx.AsyncClient() as client:
                # 1. Obtenir le token OAuth2
                token_response = await client.post(
                    token_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "scope": "payroll.write"
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=30.0
                )
                
                if token_response.status_code != 200:
                    raise HTTPException(status_code=400, detail=f"Erreur d'authentification Employeur D: {token_response.text[:200]}")
                
                token_data = token_response.json()
                access_token = token_data.get("access_token")
                
                # 2. Envoyer le fichier d'import
                filename = f"paie_{tenant_slug}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{file_extension}"
                
                files = {"file": (filename, file_content, content_type)}
                
                upload_response = await client.post(
                    f"{upload_url}",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "X-Company-Id": company_id
                    },
                    files=files,
                    timeout=60.0
                )
                
                if upload_response.status_code in [200, 201, 202]:
                    # Succès - marquer les feuilles comme exportées
                    for feuille in feuilles:
                        await db.feuilles_temps.update_one(
                            {"id": feuille["id"]},
                            {"$set": {
                                "statut": "exporte",
                                "exporte_le": datetime.now(timezone.utc),
                                "format_export": f"API {provider['name']}"
                            }}
                        )
                    
                    return {
                        "success": True,
                        "message": f"{len(feuilles)} feuilles envoyées vers Employeur D",
                        "details": upload_response.json() if upload_response.text else {}
                    }
                else:
                    return {
                        "success": False,
                        "message": f"Erreur Employeur D: {upload_response.status_code} - {upload_response.text[:300]}"
                    }
        
        elif "ceridian" in provider_name:
            # Envoi via SFTP pour Ceridian
            import paramiko
            
            sftp_host = credentials.get("sftp_host", "")
            sftp_port = int(credentials.get("sftp_port", 22) or 22)
            sftp_username = credentials.get("sftp_username", "")
            sftp_password = credentials.get("sftp_password", "")
            sftp_upload_path = credentials.get("sftp_upload_path", "/upload")
            
            if not sftp_host or not sftp_username or not sftp_password:
                raise HTTPException(status_code=400, detail="Credentials SFTP incomplets")
            
            try:
                transport = paramiko.Transport((sftp_host, sftp_port))
                transport.connect(username=sftp_username, password=sftp_password)
                sftp = paramiko.SFTPClient.from_transport(transport)
                
                # Créer le nom de fichier
                filename = f"paie_{tenant_slug}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{file_extension}"
                remote_path = f"{sftp_upload_path.rstrip('/')}/{filename}"
                
                # Écrire le fichier sur le serveur SFTP
                from io import BytesIO
                file_obj = BytesIO(file_content)
                sftp.putfo(file_obj, remote_path)
                
                sftp.close()
                transport.close()
                
                # Marquer les feuilles comme exportées
                for feuille in feuilles:
                    await db.feuilles_temps.update_one(
                        {"id": feuille["id"]},
                        {"$set": {
                            "statut": "exporte",
                            "exporte_le": datetime.now(timezone.utc),
                            "format_export": f"SFTP {provider['name']}"
                        }}
                    )
                
                return {
                    "success": True,
                    "message": f"{len(feuilles)} feuilles envoyées via SFTP vers {sftp_host}",
                    "details": {"filename": filename, "remote_path": remote_path}
                }
            except paramiko.AuthenticationException:
                return {"success": False, "message": "Authentification SFTP échouée"}
            except Exception as e:
                return {"success": False, "message": f"Erreur SFTP: {str(e)}"}
        
        else:
            return {
                "success": False,
                "message": "Envoi API non supporté pour ce fournisseur. Utilisez l'export fichier."
            }
            
    except httpx.TimeoutException:
        return {"success": False, "message": "Timeout lors de l'envoi vers l'API"}
    except Exception as e:
        logging.error(f"Erreur envoi API paie: {e}")
        return {"success": False, "message": f"Erreur: {str(e)}"}


@api_router.get("/{tenant_slug}/paie/api/fetch-codes")
async def fetch_pay_codes_from_api(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère les codes de gains/déductions depuis l'API du fournisseur"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_by_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Récupérer la config du tenant
    config = await db.tenant_payroll_config.find_one({"tenant_id": tenant["id"]})
    if not config or not config.get("provider_id"):
        raise HTTPException(status_code=400, detail="Aucun fournisseur de paie configuré")
    
    # Récupérer le fournisseur
    provider = await db.payroll_providers.find_one({"id": config["provider_id"]})
    if not provider or not provider.get("api_available"):
        raise HTTPException(status_code=400, detail="Ce fournisseur ne supporte pas la récupération des codes via API")
    
    credentials = config.get("api_credentials", {})
    if not credentials:
        raise HTTPException(status_code=400, detail="Credentials API non configurés")
    
    import httpx
    
    try:
        provider_name = provider.get("name", "").lower()
        
        if "nethris" in provider_name:
            user_code = credentials.get("user_code", "")
            company_code = credentials.get("company_code", "")
            password = credentials.get("password", "")
            
            if not user_code or not company_code or not password:
                raise HTTPException(status_code=400, detail="Credentials Nethris incomplets")
            
            token_url = provider.get("api_token_url", "https://api.nethris.com/OAuth/Token")
            config_url = provider.get("api_config_endpoint", "https://api.nethris.com/V2.00/Configuration/EarnDeduction")
            
            async with httpx.AsyncClient() as client:
                # Obtenir le token avec les credentials service user
                token_response = await client.post(
                    token_url,
                    data={
                        "grant_type": "password",
                        "username": f"{company_code}/{user_code}",
                        "password": password,
                        "scope": "api"
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=30.0
                )
                
                if token_response.status_code != 200:
                    raise HTTPException(status_code=400, detail="Erreur d'authentification Nethris")
                
                token_data = token_response.json()
                access_token = token_data.get("access_token")
                
                # Récupérer les codes de gains/déductions
                company_number = company_code
                
                codes_response = await client.get(
                    f"{config_url}/{business_id}/{company_number}",
                    headers={"Authorization": f"Bearer {access_token}"},
                    timeout=30.0
                )
                
                if codes_response.status_code == 200:
                    codes_data = codes_response.json()
                    return {
                        "success": True,
                        "codes": codes_data,
                        "message": "Codes récupérés avec succès"
                    }
                else:
                    return {
                        "success": False,
                        "message": f"Erreur lors de la récupération: {codes_response.status_code}"
                    }
        
        else:
            return {
                "success": False,
                "message": "Récupération des codes non supportée pour ce fournisseur"
            }
            
    except Exception as e:
        return {"success": False, "message": f"Erreur: {str(e)}"}


