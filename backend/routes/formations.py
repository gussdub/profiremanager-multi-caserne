"""
Routes API pour le module Formations NFPA 1500
==============================================

STATUT: ACTIF
Ce module gère les formations et les inscriptions des pompiers.

Routes CRUD Formations:
- POST   /{tenant_slug}/formations                              - Créer formation
- GET    /{tenant_slug}/formations                              - Liste formations
- PUT    /{tenant_slug}/formations/{formation_id}               - Modifier formation
- DELETE /{tenant_slug}/formations/{formation_id}               - Supprimer formation
- POST   /{tenant_slug}/formations/corriger-durees              - Corriger durées

Routes Inscriptions:
- POST   /{tenant_slug}/formations/{formation_id}/inscription   - S'inscrire
- DELETE /{tenant_slug}/formations/{formation_id}/inscription   - Se désinscrire
- GET    /{tenant_slug}/formations/{formation_id}/inscriptions  - Liste inscrits
- PUT    /{tenant_slug}/formations/{formation_id}/presence/{user_id} - Valider présence

Routes Mon Profil:
- GET    /{tenant_slug}/formations/mon-taux-presence            - Taux présence utilisateur

Note: Les rapports et exports PDF/Excel restent dans server.py pour l'instant.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging

# Import des dépendances partagées
from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Formations"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

class Formation(BaseModel):
    """Formation planifiée avec gestion inscriptions NFPA 1500"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    competence_id: str = ""
    description: str = ""
    date_debut: str = ""
    date_fin: str = ""
    heure_debut: str = ""
    heure_fin: str = ""
    duree_heures: float = 0
    lieu: str = ""
    instructeur: str = ""
    places_max: int = 20
    places_restantes: int = 20
    statut: str = "planifiee"
    obligatoire: bool = False
    annee: int = 0
    validite_mois: int = 12
    user_inscrit: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FormationCreate(BaseModel):
    tenant_id: Optional[str] = None
    nom: str
    competence_id: str
    description: str = ""
    date_debut: str
    date_fin: str
    heure_debut: str
    heure_fin: str
    duree_heures: float
    lieu: str = ""
    instructeur: str = ""
    places_max: int
    obligatoire: bool = False
    annee: int


class FormationUpdate(BaseModel):
    nom: Optional[str] = None
    competence_id: Optional[str] = None
    description: Optional[str] = None
    date_debut: Optional[str] = None
    date_fin: Optional[str] = None
    heure_debut: Optional[str] = None
    heure_fin: Optional[str] = None
    duree_heures: Optional[float] = None
    lieu: Optional[str] = None
    instructeur: Optional[str] = None
    places_max: Optional[int] = None
    obligatoire: Optional[bool] = None
    statut: Optional[str] = None


# Alias pour compatibilité avec les sessions de formation
SessionFormation = Formation
SessionFormationCreate = FormationCreate


class InscriptionFormation(BaseModel):
    """Inscription d'un pompier à une formation"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    formation_id: str
    user_id: str
    date_inscription: str
    statut: str = "inscrit"  # inscrit, en_attente, present, absent, complete
    heures_creditees: float = 0.0
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== HELPERS ====================

async def creer_activite_formation(
    tenant_id: str,
    type_activite: str,
    description: str,
    user_id: str = None,
    user_nom: str = None
):
    """Helper pour créer une activité liée aux formations"""
    from datetime import timedelta
    
    activite = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "type_activite": type_activite,
        "description": description,
        "user_id": user_id,
        "user_nom": user_nom,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.activites.insert_one(activite)
    
    # Nettoyage automatique des activités > 30 jours
    date_limite = datetime.now(timezone.utc) - timedelta(days=30)
    await db.activites.delete_many({
        "tenant_id": tenant_id,
        "created_at": {"$lt": date_limite}
    })


async def creer_notification_formation(
    tenant_id: str,
    destinataire_id: str,
    type_notif: str,
    titre: str,
    message: str,
    lien: str = None
):
    """Helper pour créer une notification liée aux formations"""
    notification = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "destinataire_id": destinataire_id,
        "type": type_notif,
        "titre": titre,
        "message": message,
        "lien": lien,
        "lu": False,
        "created_at": datetime.now(timezone.utc)
    }
    await db.notifications.insert_one(notification)
    return notification


# ==================== ROUTES CRUD FORMATIONS ====================

@router.post("/{tenant_slug}/formations", response_model=Formation)
async def create_formation(
    tenant_slug: str,
    formation: FormationCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée une formation"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Validation: Vérifier que la compétence existe
    if not formation.competence_id or not formation.competence_id.strip():
        raise HTTPException(status_code=400, detail="La compétence associée est obligatoire")
    
    competence = await db.competences.find_one({
        "id": formation.competence_id,
        "tenant_id": tenant.id
    })
    
    if not competence:
        raise HTTPException(
            status_code=404, 
            detail="Compétence non trouvée. Veuillez créer la compétence dans Paramètres > Compétences avant de créer la formation."
        )
    
    formation_dict = formation.dict()
    formation_dict["tenant_id"] = tenant.id
    formation_dict["places_restantes"] = formation.places_max
    
    # Si date_fin est vide, utiliser date_debut
    if not formation_dict.get("date_fin"):
        formation_dict["date_fin"] = formation_dict.get("date_debut", "")
    
    # CALCUL AUTOMATIQUE de duree_heures depuis heure_debut et heure_fin
    if formation.heure_debut and formation.heure_fin:
        try:
            debut = datetime.strptime(formation.heure_debut, "%H:%M")
            fin = datetime.strptime(formation.heure_fin, "%H:%M")
            duree_calculee = (fin - debut).total_seconds() / 3600
            formation_dict["duree_heures"] = round(duree_calculee, 2)
        except (ValueError, AttributeError):
            pass
    
    formation_obj = Formation(**formation_dict)
    
    form_data = formation_obj.dict()
    form_data["created_at"] = formation_obj.created_at.isoformat()
    form_data["updated_at"] = formation_obj.updated_at.isoformat()
    
    await db.formations.insert_one(form_data)
    
    # Créer une activité
    await creer_activite_formation(
        tenant_id=tenant.id,
        type_activite="formation_creation",
        description=f"🎓 {current_user.prenom} {current_user.nom} a créé la formation '{formation.nom}' du {formation.date_debut} au {formation.date_fin}",
        user_id=current_user.id,
        user_nom=f"{current_user.prenom} {current_user.nom}"
    )
    
    return formation_obj


@router.get("/{tenant_slug}/formations", response_model=List[Formation])
async def get_formations(
    tenant_slug: str,
    annee: Optional[int] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupère formations (filtre annee)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {"tenant_id": tenant.id}
    if annee:
        query["annee"] = annee
    
    # OPTIMISATION: Charger formations et inscriptions en parallèle
    formations = await db.formations.find(query, {"_id": 0}).sort("date_debut", 1).to_list(1000)
    
    # Charger toutes les inscriptions de l'utilisateur en UNE SEULE requête
    formation_ids = [f["id"] for f in formations if "id" in f]
    inscriptions_cursor = db.inscriptions_formations.find({
        "formation_id": {"$in": formation_ids},
        "user_id": current_user.id,
        "tenant_id": tenant.id
    }, {"formation_id": 1, "_id": 0})
    inscriptions = await inscriptions_cursor.to_list(1000)
    inscriptions_set = {i["formation_id"] for i in inscriptions}
    
    cleaned = [clean_mongo_doc(f) for f in formations]
    
    for f in cleaned:
        if isinstance(f.get("created_at"), str):
            f["created_at"] = datetime.fromisoformat(f["created_at"].replace('Z', '+00:00'))
        if isinstance(f.get("updated_at"), str):
            f["updated_at"] = datetime.fromisoformat(f["updated_at"].replace('Z', '+00:00'))
        
        # Vérifier inscription via le set (O(1) au lieu de requête DB)
        f["user_inscrit"] = f["id"] in inscriptions_set
    
    return [Formation(**f) for f in cleaned]


@router.put("/{tenant_slug}/formations/{formation_id}", response_model=Formation)
async def update_formation(
    tenant_slug: str,
    formation_id: str,
    formation_update: FormationUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour une formation"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    update_data = {k: v for k, v in formation_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # CALCUL AUTOMATIQUE de duree_heures si heure_debut ou heure_fin est modifié
    if "heure_debut" in update_data or "heure_fin" in update_data:
        formation_actuelle = await db.formations.find_one({"id": formation_id, "tenant_id": tenant.id})
        if formation_actuelle:
            heure_debut = update_data.get("heure_debut", formation_actuelle.get("heure_debut"))
            heure_fin = update_data.get("heure_fin", formation_actuelle.get("heure_fin"))
            
            if heure_debut and heure_fin:
                try:
                    debut = datetime.strptime(heure_debut, "%H:%M")
                    fin = datetime.strptime(heure_fin, "%H:%M")
                    duree_calculee = (fin - debut).total_seconds() / 3600
                    update_data["duree_heures"] = round(duree_calculee, 2)
                except (ValueError, AttributeError):
                    pass
    
    result = await db.formations.update_one(
        {"id": formation_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Formation non trouvée")
    
    updated = await db.formations.find_one({"id": formation_id, "tenant_id": tenant.id})
    cleaned = clean_mongo_doc(updated)
    
    if isinstance(cleaned.get("created_at"), str):
        cleaned["created_at"] = datetime.fromisoformat(cleaned["created_at"].replace('Z', '+00:00'))
    if isinstance(cleaned.get("updated_at"), str):
        cleaned["updated_at"] = datetime.fromisoformat(cleaned["updated_at"].replace('Z', '+00:00'))
    
    return Formation(**cleaned)


@router.delete("/{tenant_slug}/formations/{formation_id}")
async def delete_formation(
    tenant_slug: str,
    formation_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime une formation"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Supprimer inscriptions
    await db.inscriptions_formations.delete_many({
        "formation_id": formation_id,
        "tenant_id": tenant.id
    })
    
    result = await db.formations.delete_one({"id": formation_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Formation non trouvée")
    
    return {"message": "Formation supprimée"}


@router.post("/{tenant_slug}/formations/corriger-durees")
async def corriger_durees_formations(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Corrige les durées incohérentes dans toutes les formations"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    formations = await db.formations.find({"tenant_id": tenant.id}).to_list(10000)
    
    corrections_effectuees = 0
    formations_corrigees = []
    
    for f in formations:
        heure_debut = f.get("heure_debut")
        heure_fin = f.get("heure_fin")
        duree_actuelle = f.get("duree_heures", 0)
        
        if heure_debut and heure_fin:
            try:
                debut = datetime.strptime(heure_debut, "%H:%M")
                fin = datetime.strptime(heure_fin, "%H:%M")
                duree_calculee = round((fin - debut).total_seconds() / 3600, 2)
                
                if duree_calculee != duree_actuelle:
                    await db.formations.update_one(
                        {"id": f["id"]},
                        {"$set": {
                            "duree_heures": duree_calculee,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                    corrections_effectuees += 1
                    formations_corrigees.append({
                        "id": f["id"],
                        "nom": f["nom"],
                        "ancienne_duree": duree_actuelle,
                        "nouvelle_duree": duree_calculee
                    })
            except (ValueError, AttributeError):
                continue
    
    return {
        "message": f"{corrections_effectuees} formation(s) corrigée(s)",
        "corrections_effectuees": corrections_effectuees,
        "formations_corrigees": formations_corrigees
    }


# ==================== ROUTES INSCRIPTIONS ====================

@router.post("/{tenant_slug}/formations/{formation_id}/inscription")
async def inscrire_formation(
    tenant_slug: str,
    formation_id: str,
    current_user: User = Depends(get_current_user)
):
    """Inscription à formation avec gestion liste d'attente"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    formation = await db.formations.find_one({"id": formation_id, "tenant_id": tenant.id})
    if not formation:
        raise HTTPException(status_code=404, detail="Formation non trouvée")
    
    # Vérifier déjà inscrit
    existing = await db.inscriptions_formations.find_one({
        "formation_id": formation_id,
        "user_id": current_user.id,
        "tenant_id": tenant.id
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Déjà inscrit")
    
    # Compter inscrits
    nb_inscrits = await db.inscriptions_formations.count_documents({
        "formation_id": formation_id,
        "tenant_id": tenant.id,
        "statut": "inscrit"
    })
    
    statut = "inscrit" if nb_inscrits < formation["places_max"] else "en_attente"
    
    inscription = InscriptionFormation(
        tenant_id=tenant.id,
        formation_id=formation_id,
        user_id=current_user.id,
        date_inscription=datetime.now(timezone.utc).date().isoformat(),
        statut=statut
    )
    
    insc_data = inscription.dict()
    insc_data["created_at"] = inscription.created_at.isoformat()
    insc_data["updated_at"] = inscription.updated_at.isoformat()
    
    await db.inscriptions_formations.insert_one(insc_data)
    
    # MAJ places
    if statut == "inscrit":
        await db.formations.update_one(
            {"id": formation_id, "tenant_id": tenant.id},
            {"$set": {"places_restantes": formation["places_max"] - nb_inscrits - 1}}
        )
    
    # Notifier si liste attente
    if statut == "en_attente":
        superviseurs = await db.users.find({
            "tenant_id": tenant.id,
            "role": {"$in": ["admin", "superviseur"]}
        }).to_list(100)
        
        for sup in superviseurs:
            await creer_notification_formation(
                tenant_id=tenant.id,
                destinataire_id=sup["id"],
                type_notif="formation_liste_attente",
                titre="Liste d'attente formation",
                message=f"{formation['nom']}: {current_user.prenom} {current_user.nom} en liste d'attente",
                lien="/formations"
            )
    
    return {"message": "Inscription réussie", "statut": statut}


@router.delete("/{tenant_slug}/formations/{formation_id}/inscription")
async def desinscrire_formation(
    tenant_slug: str,
    formation_id: str,
    current_user: User = Depends(get_current_user)
):
    """Désinscription d'une formation"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    formation = await db.formations.find_one({"id": formation_id, "tenant_id": tenant.id})
    if not formation:
        raise HTTPException(status_code=404, detail="Formation non trouvée")
    
    # Vérifier si inscrit
    existing = await db.inscriptions_formations.find_one({
        "formation_id": formation_id,
        "user_id": current_user.id,
        "tenant_id": tenant.id
    })
    
    if not existing:
        raise HTTPException(status_code=400, detail="Vous n'êtes pas inscrit à cette formation")
    
    # Empêcher la désinscription si présence déjà validée
    if existing.get("statut") in ["present", "absent"]:
        raise HTTPException(status_code=400, detail="Impossible de se désinscrire, la présence a déjà été validée")
    
    # Supprimer l'inscription
    await db.inscriptions_formations.delete_one({
        "formation_id": formation_id,
        "user_id": current_user.id,
        "tenant_id": tenant.id
    })
    
    # Recalculer les places restantes
    nb_inscrits = await db.inscriptions_formations.count_documents({
        "formation_id": formation_id,
        "tenant_id": tenant.id,
        "statut": "inscrit"
    })
    
    await db.formations.update_one(
        {"id": formation_id, "tenant_id": tenant.id},
        {"$set": {"places_restantes": formation["places_max"] - nb_inscrits}}
    )
    
    return {"message": "Désinscription réussie"}


@router.get("/{tenant_slug}/formations/{formation_id}/inscriptions")
async def get_inscriptions(
    tenant_slug: str,
    formation_id: str,
    current_user: User = Depends(get_current_user)
):
    """Liste inscriptions formation"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    inscriptions = await db.inscriptions_formations.find({
        "formation_id": formation_id,
        "tenant_id": tenant.id
    }).to_list(1000)
    
    result = []
    for insc in inscriptions:
        user = await db.users.find_one({"id": insc["user_id"], "tenant_id": tenant.id})
        if user:
            cleaned = clean_mongo_doc(insc)
            cleaned["user_nom"] = f"{user['prenom']} {user['nom']}"
            cleaned["user_grade"] = user.get("grade", "")
            result.append(cleaned)
    
    return result


@router.put("/{tenant_slug}/formations/{formation_id}/presence/{user_id}")
async def valider_presence(
    tenant_slug: str,
    formation_id: str,
    user_id: str,
    presence_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Valider la présence d'un inscrit"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier formation existe
    formation = await db.formations.find_one({"id": formation_id, "tenant_id": tenant.id})
    if not formation:
        raise HTTPException(status_code=404, detail="Formation non trouvée")
    
    # Trouver inscription
    inscription = await db.inscriptions_formations.find_one({
        "formation_id": formation_id,
        "user_id": user_id,
        "tenant_id": tenant.id
    })
    
    if not inscription:
        raise HTTPException(status_code=404, detail="Inscription non trouvée")
    
    # Mettre à jour
    new_statut = presence_data.get("statut", "present")
    heures = presence_data.get("heures_creditees", formation.get("duree_heures", 0))
    notes = presence_data.get("notes", "")
    
    await db.inscriptions_formations.update_one(
        {
            "formation_id": formation_id,
            "user_id": user_id,
            "tenant_id": tenant.id
        },
        {"$set": {
            "statut": new_statut,
            "heures_creditees": heures if new_statut == "present" else 0,
            "notes": notes,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Présence validée", "statut": new_statut, "heures_creditees": heures}


# ==================== ROUTES MON PROFIL ====================

@router.get("/{tenant_slug}/formations/mon-taux-presence")
async def get_mon_taux_presence(
    tenant_slug: str,
    annee: Optional[int] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupère le taux de présence aux formations de l'utilisateur connecté"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not annee:
        annee = datetime.now().year
    
    # Récupérer toutes les formations de l'année (passées uniquement)
    today = datetime.now().strftime("%Y-%m-%d")
    formations = await db.formations.find({
        "tenant_id": tenant.id,
        "annee": annee,
        "date_fin": {"$lt": today}  # Formations passées
    }, {"_id": 0}).to_list(1000)
    
    if not formations:
        return {
            "taux_presence": 100.0,
            "formations_suivies": 0,
            "formations_totales": 0,
            "heures_creditees": 0,
            "message": "Aucune formation passée cette année"
        }
    
    formation_ids = [f["id"] for f in formations]
    
    # Compter inscriptions avec présence validée
    inscriptions = await db.inscriptions_formations.find({
        "tenant_id": tenant.id,
        "user_id": current_user.id,
        "formation_id": {"$in": formation_ids}
    }, {"_id": 0}).to_list(1000)
    
    total_formations = len(formations)
    formations_suivies = 0
    heures_totales = 0
    
    for insc in inscriptions:
        if insc.get("statut") == "present":
            formations_suivies += 1
            heures_totales += insc.get("heures_creditees", 0)
    
    taux = round((formations_suivies / total_formations) * 100, 1) if total_formations > 0 else 100.0
    
    return {
        "taux_presence": taux,
        "formations_suivies": formations_suivies,
        "formations_totales": total_formations,
        "heures_creditees": heures_totales,
        "annee": annee
    }


# ==================== ROUTES MIGRÉES DE SERVER.PY ====================

# GET formations/rapports/debug/{user_id}
@router.get("/{tenant_slug}/formations/rapports/debug/{user_id}")
async def debug_conformite_user(
    tenant_slug: str,
    user_id: str,
    annee: int,
    current_user: User = Depends(get_current_user)
):
    """Debug : voir les données brutes d'un employé"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer l'utilisateur
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    
    # Récupérer toutes ses inscriptions
    inscriptions = await db.inscriptions_formations.find({
        "user_id": user_id,
        "tenant_id": tenant.id
    }).to_list(1000)
    
    # Pour chaque inscription, récupérer la formation
    details = []
    for insc in inscriptions:
        formation = await db.formations.find_one({
            "id": insc["formation_id"],
            "tenant_id": tenant.id
        })
        if formation:
            details.append({
                "formation_nom": formation.get("nom"),
                "formation_date_fin": formation.get("date_fin"),
                "formation_annee_champ": formation.get("annee"),
                "inscription_statut": insc.get("statut"),
                "inscription_heures_creditees": insc.get("heures_creditees"),
                "heure_debut": formation.get("heure_debut"),
                "heure_fin": formation.get("heure_fin")
            })
    
    return {
        "user": user.get("prenom") + " " + user.get("nom"),
        "total_inscriptions": len(inscriptions),
        "details": details,
        "annee_recherchee": annee
    }


# GET formations/rapports/conformite
@router.get("/{tenant_slug}/formations/rapports/conformite")
async def rapport_conformite(tenant_slug: str, annee: int, current_user: User = Depends(get_current_user)):
    """Rapport conformité NFPA 1500 amélioré avec formations obligatoires et validations manuelles"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    pompiers = await db.users.find({"tenant_id": tenant.id}, {"_id": 0}).to_list(1000)
    
    # Lire les paramètres depuis tenant.parametres.formations (cohérent avec PUT /parametres/formations)
    params = tenant.parametres.get('formations', {}) if tenant.parametres else {}
    heures_min = params.get("heures_minimales_annuelles", 100)
    pourcentage_min = params.get("pourcentage_presence_minimum", 80)
    
    aujourd_hui = datetime.now(timezone.utc).date()
    
    # OPTIMISATION: Charger TOUTES les formations une seule fois (au lieu de 1 requête par inscription)
    toutes_formations = await db.formations.find({
        "tenant_id": tenant.id
    }, {"_id": 0}).to_list(1000)
    formations_map = {f["id"]: f for f in toutes_formations if "id" in f}
    
    # Récupérer toutes les formations obligatoires de l'année
    formations_obligatoires = await db.formations.find({
        "tenant_id": tenant.id,
        "annee": annee,
        "obligatoire": True
    }, {"_id": 0}).to_list(1000)
    
    # OPTIMISATION: Charger toutes les inscriptions et validations en UNE FOIS
    toutes_inscriptions_db = await db.inscriptions_formations.find({
        "tenant_id": tenant.id
    }, {"_id": 0}).to_list(10000)
    
    toutes_validations_db = await db.validations_competences.find({
        "tenant_id": tenant.id
    }, {"_id": 0}).to_list(10000)
    
    # Grouper par user_id pour accès rapide
    inscriptions_par_user = {}
    for insc in toutes_inscriptions_db:
        user_id = insc.get("user_id")
        if user_id not in inscriptions_par_user:
            inscriptions_par_user[user_id] = []
        inscriptions_par_user[user_id].append(insc)
    
    validations_par_user = {}
    for val in toutes_validations_db:
        user_id = val.get("user_id")
        if user_id not in validations_par_user:
            validations_par_user[user_id] = []
        validations_par_user[user_id].append(val)
    
    rapport = []
    for pompier in pompiers:
        # Récupérer les inscriptions et validations depuis les dictionnaires
        toutes_inscriptions = inscriptions_par_user.get(pompier["id"], [])
        validations = validations_par_user.get(pompier["id"], [])
        competences_validees = {v["competence_id"] for v in validations}
        
        total_heures = 0
        formations_passees = 0
        formations_futures = 0
        presences = 0
        formations_obligatoires_ratees = []
        
        for insc in toutes_inscriptions:
            # OPTIMISATION: Lookup dans le dictionnaire au lieu de requête DB
            formation = formations_map.get(insc["formation_id"])
            
            if formation:
                try:
                    # Parser la date de fin avec gestion d'erreur
                    if "date_fin" in formation and formation["date_fin"]:
                        date_fin_str = formation["date_fin"]
                        date_fin = datetime.fromisoformat(date_fin_str.replace('Z', '+00:00')).date()
                    else:
                        continue
                    
                    # Vérifier que la formation est de l'année demandée (depuis date_fin)
                    if date_fin.year != annee:
                        continue
                    
                    # Heures créditées
                    if insc.get("statut") == "present":
                        total_heures += insc.get("heures_creditees", 0)
                    
                    # Calcul taux de présence
                    if date_fin < aujourd_hui:
                        formations_passees += 1
                        if insc.get("statut") == "present":
                            presences += 1
                        # Vérifier si formation obligatoire ratée
                        elif formation.get("obligatoire") and insc.get("statut") == "absent":
                            # Vérifier si compétence n'est pas validée manuellement
                            if formation.get("competence_id") not in competences_validees:
                                formations_obligatoires_ratees.append(formation["nom"])
                    else:
                        formations_futures += 1
                except (ValueError, TypeError, AttributeError):
                    continue
        
        # Taux de présence = formations présentes / formations passées (pas futures)
        taux_presence = round((presences / formations_passees * 100) if formations_passees > 0 else 100, 1)
        conforme_presence = taux_presence >= pourcentage_min
        conforme_heures = total_heures >= heures_min
        a_formation_obligatoire_ratee = len(formations_obligatoires_ratees) > 0
        
        # LOGIQUE SIMPLIFIÉE : 2 niveaux (Conforme / Non conforme)
        # CONFORME par défaut, sauf si :
        # 1. Formation obligatoire ratée (non régularisée)
        # 2. Taux de présence < seuil (sur formations passées)
        # Note: Les heures peuvent être en cours d'accumulation, donc on ne pénalise pas
        
        if a_formation_obligatoire_ratee:
            # Formation obligatoire ratée → Non conforme (régularisable via Personnel)
            conforme = False
        elif not conforme_presence:
            # Taux de présence insuffisant sur formations passées → Non conforme
            conforme = False
        else:
            # Par défaut : Conforme (peut encore atteindre les heures requises)
            conforme = True
        
        pompier_data = clean_mongo_doc(pompier)
        pompier_data["total_heures"] = total_heures
        pompier_data["heures_requises"] = heures_min
        pompier_data["conforme"] = conforme
        pompier_data["pourcentage"] = round((total_heures / heures_min * 100) if heures_min > 0 else 0, 1)
        pompier_data["taux_presence"] = taux_presence
        pompier_data["formations_passees"] = formations_passees
        pompier_data["formations_futures"] = formations_futures
        pompier_data["presences"] = presences
        pompier_data["formations_obligatoires_ratees"] = formations_obligatoires_ratees
        pompier_data["validations_manuelles"] = len(validations)
        rapport.append(pompier_data)
    
    rapport.sort(key=lambda x: (
        0 if x["conforme"] else 1,  # Conformes en premier
        -x["total_heures"]  # Puis par heures décroissantes
    ))
    
    return {
        "annee": annee,
        "heures_minimales": heures_min,
        "pourcentage_presence_minimum": pourcentage_min,
        "total_pompiers": len(rapport),
        "conformes": len([p for p in rapport if p["conforme"]]),
        "non_conformes": len([p for p in rapport if not p["conforme"]]),
        "pourcentage_conformite": round(len([p for p in rapport if p["conforme"]]) / len(rapport) * 100, 1) if len(rapport) > 0 else 0,
        "pompiers": rapport
    }


# GET formations/rapports/dashboard
@router.get("/{tenant_slug}/formations/rapports/dashboard")
async def dashboard_formations(tenant_slug: str, annee: int, current_user: User = Depends(get_current_user)):
    """Dashboard KPIs formations"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    formations = await db.formations.find({"tenant_id": tenant.id, "annee": annee}).to_list(1000)
    heures_planifiees = sum([f.get("duree_heures", 0) for f in formations])
    
    inscriptions = await db.inscriptions_formations.find({
        "tenant_id": tenant.id,
        "statut": "present"
    }).to_list(10000)
    
    heures_effectuees = sum([i.get("heures_creditees", 0) for i in inscriptions])
    
    total_pompiers = await db.users.count_documents({"tenant_id": tenant.id})
    users_formes = len(set([i["user_id"] for i in inscriptions]))
    
    return {
        "annee": annee,
        "heures_planifiees": heures_planifiees,
        "heures_effectuees": heures_effectuees,
        "pourcentage_realisation": round((heures_effectuees / heures_planifiees * 100) if heures_planifiees > 0 else 0, 1),
        "total_pompiers": total_pompiers,
        "pompiers_formes": users_formes,
        "pourcentage_pompiers": round((users_formes / total_pompiers * 100) if total_pompiers > 0 else 0, 1)
    }


# Route mon-taux-presence migrée vers routes/formations.py


# GET formations/rapports/export-presence
@router.get("/{tenant_slug}/formations/rapports/export-presence")
async def export_rapport_presence(
    tenant_slug: str,
    format: str,
    type_formation: str,  # "obligatoires" ou "toutes"
    annee: int,
    current_user: User = Depends(get_current_user)
):
    """
    Export des taux de présence en PDF ou Excel
    - format: "pdf" ou "excel"
    - type_formation: "obligatoires" ou "toutes"
    - annee: année concernée
    """
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les données
    pompiers = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
    params = await db.parametres_formations.find_one({"tenant_id": tenant.id})
    pourcentage_min = params.get("pourcentage_presence_minimum", 80) if params else 80
    
    aujourd_hui = datetime.now(timezone.utc).date()
    
    rapport_data = []
    for pompier in pompiers:
        # Toutes les inscriptions
        mes_inscriptions = await db.inscriptions_formations.find({
            "user_id": pompier["id"],
            "tenant_id": tenant.id
        }).to_list(1000)
        
        formations_passees = 0
        presences = 0
        
        for insc in mes_inscriptions:
            formation = await db.formations.find_one({
                "id": insc["formation_id"],
                "annee": annee,
                "tenant_id": tenant.id
            })
            
            if formation:
                # Filtre selon type_formation
                if type_formation == "obligatoires" and not formation.get("obligatoire", False):
                    continue
                
                # Vérifier que date_fin n'est pas vide
                date_fin_str = formation.get("date_fin", "")
                if not date_fin_str:
                    continue
                
                try:
                    date_fin = datetime.fromisoformat(date_fin_str).date()
                except ValueError:
                    # Ignorer les formations avec des dates invalides
                    continue
                
                if date_fin < aujourd_hui:
                    formations_passees += 1
                    if insc.get("statut") == "present":
                        presences += 1
        
        taux_presence = round((presences / formations_passees * 100) if formations_passees > 0 else 0, 1)
        conforme = taux_presence >= pourcentage_min
        
        rapport_data.append({
            "nom": f"{pompier.get('prenom', '')} {pompier.get('nom', '')}",
            "grade": pompier.get("grade", "N/A"),
            "formations_passees": formations_passees,
            "presences": presences,
            "absences": formations_passees - presences,
            "taux_presence": taux_presence,
            "conforme": conforme
        })
    
    # Tri par taux de présence décroissant
    rapport_data.sort(key=lambda x: -x["taux_presence"])
    
    # Statistiques globales
    total_pompiers = len(rapport_data)
    pompiers_conformes = len([p for p in rapport_data if p["conforme"]])
    taux_conformite = round((pompiers_conformes / total_pompiers * 100) if total_pompiers > 0 else 0, 1)
    
    # Génération selon le format
    if format == "pdf":
        return await generer_pdf_presence(rapport_data, annee, type_formation, total_pompiers, pompiers_conformes, taux_conformite, pourcentage_min, tenant)
    elif format == "excel":
        return await generer_excel_presence(rapport_data, annee, type_formation, total_pompiers, pompiers_conformes, taux_conformite, pourcentage_min)
    else:
        raise HTTPException(status_code=400, detail="Format non supporté")


async def generer_pdf_presence(rapport_data, annee, type_formation, total_pompiers, pompiers_conformes, taux_conformite, pourcentage_min, tenant):
    """Génère un PDF professionnel avec graphiques"""
    
    # Utiliser la fonction helper pour créer un PDF brandé
    buffer, doc, story = create_branded_pdf(tenant, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch)
    styles = getSampleStyleSheet()
    modern_styles = get_modern_pdf_styles(styles)
    
    # Titre
    type_texte = "Formations Obligatoires" if type_formation == "obligatoires" else "Toutes les Formations"
    story.append(Paragraph(f"Rapport de Présence - {type_texte}", modern_styles['title']))
    story.append(Paragraph(f"ProFireManager - Année {annee}", modern_styles['subheading']))
    story.append(Spacer(1, 0.2*inch))
    
    # Statistiques globales
    stats_data = [
        ["Statistiques Globales", ""],
        ["Total pompiers", str(total_pompiers)],
        ["Pompiers conformes", f"{pompiers_conformes} ({taux_conformite}%)"],
        ["Taux minimum requis", f"{pourcentage_min}%"]
    ]
    
    stats_table = Table(stats_data, colWidths=[3*inch, 2*inch])
    stats_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), modern_styles['primary_color']),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, modern_styles['grid']),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, modern_styles['bg_light']])
    ]))
    
    story.append(stats_table)
    story.append(Spacer(1, 0.4*inch))
    
    # Tableau des données
    story.append(Paragraph("Détail par Pompier", styles['Heading2']))
    story.append(Spacer(1, 0.2*inch))
    
    table_data = [["Nom", "Grade", "Formations", "Présences", "Absences", "Taux %", "Conforme"]]
    
    for p in rapport_data:
        table_data.append([
            p.get("nom", ""),
            p.get("grade", "N/A"),
            str(p.get("formations_passees", 0)),
            str(p.get("presences", 0)),
            str(p.get("absences", 0)),
            f"{p.get('taux_presence', 0)}%",
            "✓" if p.get("conforme", False) else "✗"
        ])
    
    detail_table = Table(table_data, colWidths=[1.5*inch, 1*inch, 0.8*inch, 0.8*inch, 0.8*inch, 0.7*inch, 0.7*inch])
    detail_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), modern_styles['primary_color']),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, modern_styles['grid']),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, modern_styles['bg_light']])
    ]))
    
    story.append(detail_table)
    
    # Construction du PDF
    doc.build(story)
    buffer.seek(0)
    
    filename = f"rapport_presence_{type_formation}_{annee}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


async def generer_excel_presence(rapport_data, annee, type_formation, total_pompiers, pompiers_conformes, taux_conformite, pourcentage_min):
    """Génère un fichier Excel avec données et graphiques"""
    wb = Workbook()
    ws = wb.active
    ws.title = "Rapport Présence"
    
    # En-tête
    type_texte = "Formations Obligatoires" if type_formation == "obligatoires" else "Toutes les Formations"
    ws['A1'] = f"Rapport de Présence - {type_texte} - Année {annee}"
    ws['A1'].font = Font(size=16, bold=True, color="DC2626")
    ws.merge_cells('A1:G1')
    ws['A1'].alignment = Alignment(horizontal='center')
    
    # Statistiques
    ws['A3'] = "Statistiques Globales"
    ws['A3'].font = Font(bold=True, size=12)
    ws['A4'] = "Total pompiers"
    ws['B4'] = total_pompiers
    ws['A5'] = "Pompiers conformes"
    ws['B5'] = f"{pompiers_conformes} ({taux_conformite}%)"
    ws['A6'] = "Taux minimum requis"
    ws['B6'] = f"{pourcentage_min}%"
    
    # Tableau des données
    headers = ["Nom", "Grade", "Formations", "Présences", "Absences", "Taux %", "Conforme"]
    row = 8
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=row, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="FCA5A5", end_color="FCA5A5", fill_type="solid")
        cell.alignment = Alignment(horizontal='center')
    
    # Données
    for p in rapport_data:
        row += 1
        ws.cell(row=row, column=1, value=p.get("nom", ""))
        ws.cell(row=row, column=2, value=p.get("grade", "N/A"))
        ws.cell(row=row, column=3, value=p.get("formations_passees", 0))
        ws.cell(row=row, column=4, value=p.get("presences", 0))
        ws.cell(row=row, column=5, value=p.get("absences", 0))
        ws.cell(row=row, column=6, value=p.get("taux_presence", 0))
        ws.cell(row=row, column=7, value="Oui" if p.get("conforme", False) else "Non")
    
    # Ajuster les largeurs de colonnes
    for col in ['A', 'B', 'C', 'D', 'E', 'F', 'G']:
        ws.column_dimensions[col].width = 15
    
    # Sauvegarder dans un buffer
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    filename = f"rapport_presence_{type_formation}_{annee}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# GET formations/rapports/competences
@router.get("/{tenant_slug}/formations/rapports/competences")
async def rapport_par_competences(
    tenant_slug: str,
    annee: int,
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Rapport par compétences
    - Si user_id fourni: rapport pour cette personne uniquement
    - Sinon: rapport général pour toute l'organisation
    """
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer toutes les compétences
    competences = await db.competences.find({"tenant_id": tenant.id}).to_list(1000)
    
    rapport = []
    
    for comp in competences:
        # Récupérer toutes les formations pour cette compétence et cette année
        # Filtrer par date_debut qui commence par l'année
        formations = await db.formations.find({
            "tenant_id": tenant.id,
            "competence_id": comp["id"],
            "$or": [
                {"annee": annee},
                {"date_debut": {"$regex": f"^{annee}"}}
            ]
        }).to_list(1000)
        
        total_formations = len(formations)
        total_heures_planifiees = sum([f.get("duree_heures", 0) for f in formations])
        
        # Récupérer les inscriptions
        formation_ids = [f["id"] for f in formations]
        
        query_inscriptions = {
            "tenant_id": tenant.id,
            "formation_id": {"$in": formation_ids}
        }
        
        # Filtre par user si demandé
        if user_id:
            query_inscriptions["user_id"] = user_id
        
        inscriptions = await db.inscriptions_formations.find(query_inscriptions).to_list(10000)
        
        total_inscrits = len(set([i["user_id"] for i in inscriptions]))
        presences = len([i for i in inscriptions if i.get("statut") == "present"])
        absences = len([i for i in inscriptions if i.get("statut") == "absent"])
        total_inscriptions = len(inscriptions)
        
        taux_presence = round((presences / total_inscriptions * 100) if total_inscriptions > 0 else 0, 1)
        
        heures_effectuees = sum([i.get("heures_creditees", 0) for i in inscriptions if i.get("statut") == "present"])
        
        rapport.append({
            "competence_id": comp["id"],
            "competence_nom": comp["nom"],
            "total_formations": total_formations,
            "total_heures_planifiees": total_heures_planifiees,
            "total_inscrits": total_inscrits,
            "total_inscriptions": total_inscriptions,
            "presences": presences,
            "absences": absences,
            "taux_presence": taux_presence,
            "heures_effectuees": heures_effectuees,
            "taux_realisation": round((heures_effectuees / total_heures_planifiees * 100) if total_heures_planifiees > 0 else 0, 1)
        })
    
    # Tri par nombre de formations décroissant
    rapport.sort(key=lambda x: -x["total_formations"])
    
    return {
        "annee": annee,
        "user_id": user_id,
        "competences": rapport
    }


# GET formations/rapports/export-competences
@router.get("/{tenant_slug}/formations/rapports/export-competences")
async def export_rapport_competences(
    tenant_slug: str,
    format: str,
    annee: int,
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Export du rapport par compétences en PDF ou Excel
    """
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Récupérer le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les données
    rapport_response = await rapport_par_competences(tenant_slug, annee, user_id, current_user)
    rapport_data = rapport_response["competences"]
    
    # Récupérer le nom de l'utilisateur si filtré
    user_nom = None
    if user_id:
        user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
        if user:
            user_nom = f"{user.get('prenom', '')} {user.get('nom', '')}"
    
    # Génération selon le format
    if format == "pdf":
        return await generer_pdf_competences(rapport_data, annee, user_nom, tenant)
    elif format == "excel":
        return await generer_excel_competences(rapport_data, annee, user_nom)
    else:
        raise HTTPException(status_code=400, detail="Format non supporté")


async def generer_pdf_competences(rapport_data, annee, user_nom, tenant):
    """Génère un PDF pour le rapport par compétences"""
    
    # Utiliser la fonction helper pour créer un PDF brandé
    buffer, doc, story = create_branded_pdf(tenant, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch)
    styles = getSampleStyleSheet()
    modern_styles = get_modern_pdf_styles(styles)
    
    # Titre
    titre = f"Rapport par Compétences - {user_nom}" if user_nom else "Rapport par Compétences"
    story.append(Paragraph(titre, modern_styles['title']))
    story.append(Paragraph(f"ProFireManager - Année {annee}", modern_styles['subheading']))
    story.append(Spacer(1, 0.2*inch))
    
    # Statistiques globales
    total_formations = sum([c["total_formations"] for c in rapport_data])
    total_heures = sum([c["total_heures_planifiees"] for c in rapport_data])
    total_presences = sum([c["presences"] for c in rapport_data])
    total_inscriptions = sum([c["total_inscriptions"] for c in rapport_data])
    taux_presence_global = round((total_presences / total_inscriptions * 100) if total_inscriptions > 0 else 0, 1)
    
    stats_data = [
        ["Statistiques Globales", ""],
        ["Total compétences", str(len(rapport_data))],
        ["Total formations", str(total_formations)],
        ["Total heures planifiées", f"{total_heures}h"],
        ["Taux de présence moyen", f"{taux_presence_global}%"]
    ]
    
    stats_table = Table(stats_data, colWidths=[3*inch, 2*inch])
    stats_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), modern_styles['primary_color']),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, modern_styles['grid']),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, modern_styles['bg_light']])
    ]))
    
    story.append(stats_table)
    story.append(Spacer(1, 0.4*inch))
    
    # Tableau des compétences
    story.append(Paragraph("Détail par Compétence", styles['Heading2']))
    story.append(Spacer(1, 0.2*inch))
    
    table_data = [["Compétence", "Formations", "Heures", "Inscrits", "Présences", "Taux %"]]
    
    for c in rapport_data:
        table_data.append([
            c["competence_nom"],
            str(c["total_formations"]),
            f"{c['total_heures_planifiees']}h",
            str(c["total_inscrits"]),
            f"{c['presences']}/{c['total_inscriptions']}",
            f"{c['taux_presence']}%"
        ])
    
    detail_table = Table(table_data, colWidths=[2*inch, 1*inch, 1*inch, 1*inch, 1.2*inch, 0.8*inch])
    detail_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#FCA5A5')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, modern_styles['bg_light']])
    ]))
    
    story.append(detail_table)
    
    doc.build(story)
    buffer.seek(0)
    
    filename = f"rapport_competences_{annee}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


async def generer_excel_competences(rapport_data, annee, user_nom):
    """Génère un fichier Excel pour le rapport par compétences"""
    wb = Workbook()
    ws = wb.active
    ws.title = "Rapport Compétences"
    
    # En-tête
    titre = f"Rapport par Compétences - {user_nom}" if user_nom else "Rapport par Compétences"
    ws['A1'] = f"{titre} - Année {annee}"
    ws['A1'].font = Font(size=16, bold=True, color="DC2626")
    ws.merge_cells('A1:F1')
    ws['A1'].alignment = Alignment(horizontal='center')
    
    # Statistiques globales
    total_formations = sum([c["total_formations"] for c in rapport_data])
    total_heures = sum([c["total_heures_planifiees"] for c in rapport_data])
    total_presences = sum([c["presences"] for c in rapport_data])
    total_inscriptions = sum([c["total_inscriptions"] for c in rapport_data])
    taux_presence_global = round((total_presences / total_inscriptions * 100) if total_inscriptions > 0 else 0, 1)
    
    ws['A3'] = "Statistiques Globales"
    ws['A3'].font = Font(bold=True, size=12)
    ws['A4'] = "Total compétences"
    ws['B4'] = len(rapport_data)
    ws['A5'] = "Total formations"
    ws['B5'] = total_formations
    ws['A6'] = "Total heures planifiées"
    ws['B6'] = f"{total_heures}h"
    ws['A7'] = "Taux de présence moyen"
    ws['B7'] = f"{taux_presence_global}%"
    
    # Tableau des données
    headers = ["Compétence", "Formations", "Heures", "Inscrits", "Présences", "Taux %"]
    row = 9
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=row, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="FCA5A5", end_color="FCA5A5", fill_type="solid")
        cell.alignment = Alignment(horizontal='center')
    
    # Données
    for c in rapport_data:
        row += 1
        ws.cell(row=row, column=1, value=c["competence_nom"])
        ws.cell(row=row, column=2, value=c["total_formations"])
        ws.cell(row=row, column=3, value=f"{c['total_heures_planifiees']}h")
        ws.cell(row=row, column=4, value=c["total_inscrits"])
        ws.cell(row=row, column=5, value=f"{c['presences']}/{c['total_inscriptions']}")
        ws.cell(row=row, column=6, value=c["taux_presence"])
    
    # Ajuster les largeurs
    for col in ['A', 'B', 'C', 'D', 'E', 'F']:
        ws.column_dimensions[col].width = 18
    
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    filename = f"rapport_competences_{annee}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# GET rapports/couts-formations
@router.get("/{tenant_slug}/rapports/couts-formations")
async def get_rapport_couts_formations(
    tenant_slug: str,
    annee: int,
    current_user: User = Depends(get_current_user)
):
    """Rapport détaillé des coûts de formation"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les données
    formations = await db.formations.find({"tenant_id": tenant.id, "annee": annee}).to_list(1000)
    inscriptions = await db.inscriptions_formations.find({"tenant_id": tenant.id}).to_list(10000)
    users = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
    
    rapport = []
    cout_total = 0
    
    for formation in formations:
        # Récupérer inscriptions pour cette formation
        formation_inscriptions = [i for i in inscriptions if i["formation_id"] == formation["id"]]
        
        # Coût de la formation (formateur, matériel, etc.)
        cout_formation = formation.get("cout_formation", 0)
        
        # Coût salarial des participants
        cout_salarial = 0
        for inscription in formation_inscriptions:
            user = next((u for u in users if u["id"] == inscription["user_id"]), None)
            if user:
                taux_horaire = user.get("taux_horaire", 0)
                heures_formation = formation.get("duree_heures", 0)
                cout_salarial += taux_horaire * heures_formation
        
        cout_total_formation = cout_formation + cout_salarial
        cout_total += cout_total_formation
        
        rapport.append({
            "nom_formation": formation.get("nom", "N/A"),
            "date": formation.get("date_debut", "N/A"),
            "duree_heures": formation.get("duree_heures", 0),
            "nombre_participants": len(formation_inscriptions),
            "cout_formation": cout_formation,
            "cout_salarial": round(cout_salarial, 2),
            "cout_total": round(cout_total_formation, 2)
        })
    
    return {
        "annee": annee,
        "formations": rapport,
        "cout_total": round(cout_total, 2),
        "nombre_formations": len(rapport),
        "nombre_total_participants": sum([f["nombre_participants"] for f in rapport]),
        "heures_totales": sum([f["duree_heures"] for f in rapport])
    }


# POST sessions-formation
@router.post("/{tenant_slug}/sessions-formation", response_model=SessionFormation)
async def create_session_formation(tenant_slug: str, session: SessionFormationCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    session_dict = session.dict()
    session_dict["tenant_id"] = tenant.id
    session_obj = SessionFormation(**session_dict)
    await db.sessions_formation.insert_one(session_obj.dict())
    return session_obj


# GET sessions-formation
@router.get("/{tenant_slug}/sessions-formation", response_model=List[SessionFormation])
async def get_sessions_formation(tenant_slug: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    sessions = await db.sessions_formation.find({"tenant_id": tenant.id}).to_list(1000)
    cleaned_sessions = [clean_mongo_doc(session) for session in sessions]
    return [SessionFormation(**session) for session in cleaned_sessions]


# POST sessions-formation/{session_id}/inscription
@router.post("/{tenant_slug}/sessions-formation/{session_id}/inscription")
async def inscrire_formation(tenant_slug: str, session_id: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que la session existe dans ce tenant
    session = await db.sessions_formation.find_one({"id": session_id, "tenant_id": tenant.id})
    if not session:
        raise HTTPException(status_code=404, detail="Session de formation non trouvée")
    
    # Vérifier si déjà inscrit
    if current_user.id in session.get("participants", []):
        raise HTTPException(status_code=400, detail="Vous êtes déjà inscrit à cette formation")
    
    # Vérifier les places disponibles
    if len(session.get("participants", [])) >= session.get("places_max", 20):
        raise HTTPException(status_code=400, detail="Formation complète - Plus de places disponibles")
    
    # Ajouter l'utilisateur aux participants
    await db.sessions_formation.update_one(
        {"id": session_id, "tenant_id": tenant.id},
        {"$push": {"participants": current_user.id}}
    )
    
    # Créer l'inscription
    inscription_dict = {
        "tenant_id": tenant.id,
        "session_id": session_id,
        "user_id": current_user.id
    }
    inscription_obj = InscriptionFormation(**inscription_dict)
    await db.inscriptions_formation.insert_one(inscription_obj.dict())
    
    return {"message": "Inscription réussie", "session_id": session_id}


# DELETE sessions-formation/{session_id}/desinscription
@router.delete("/{tenant_slug}/sessions-formation/{session_id}/desinscription")
async def desinscrire_session_formation(tenant_slug: str, session_id: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que la session existe dans ce tenant
    session = await db.sessions_formation.find_one({"id": session_id, "tenant_id": tenant.id})
    if not session:
        raise HTTPException(status_code=404, detail="Session de formation non trouvée")
    
    # Vérifier si inscrit
    if current_user.id not in session.get("participants", []):
        raise HTTPException(status_code=400, detail="Vous n'êtes pas inscrit à cette formation")
    
    # Retirer l'utilisateur des participants
    await db.sessions_formation.update_one(
        {"id": session_id, "tenant_id": tenant.id},
        {"$pull": {"participants": current_user.id}}
    )
    
    # Supprimer l'inscription
    await db.inscriptions_formation.delete_one({
        "session_id": session_id,
        "user_id": current_user.id,
        "tenant_id": tenant.id
    })
    
    return {"message": "Désinscription réussie", "session_id": session_id}


# GET parametres/formations
@router.get("/{tenant_slug}/parametres/formations")
async def get_parametres_formations(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """
    Récupérer les paramètres de formations pour le tenant
    """
    try:
        tenant = await get_tenant_from_slug(tenant_slug)
        
        # Récupérer les paramètres de formations ou retourner valeurs par défaut
        formation_params = tenant.parametres.get('formations', {
            'heures_minimales_annuelles': 100,
            'pourcentage_presence_minimum': 80,
            'delai_notification_liste_attente': 7,
            'email_notifications_actif': True
        }) if tenant.parametres else {
            'heures_minimales_annuelles': 100,
            'pourcentage_presence_minimum': 80,
            'delai_notification_liste_attente': 7,
            'email_notifications_actif': True
        }
        
        return formation_params
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur récupération paramètres formations: {str(e)}")


# PUT parametres/formations
@router.put("/{tenant_slug}/parametres/formations")
async def update_parametres_formations(tenant_slug: str, parametres: dict, current_user: User = Depends(get_current_user)):
    """
    Mettre à jour les paramètres de formations
    """
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        tenant = await get_tenant_from_slug(tenant_slug)
        tenant_doc = await db.tenants.find_one({"id": tenant.id})
        
        if not tenant_doc:
            raise HTTPException(status_code=404, detail="Tenant non trouvé")
        
        # Mettre à jour les paramètres
        current_parametres = tenant_doc.get('parametres', {})
        current_parametres['formations'] = parametres
        
        await db.tenants.update_one(
            {"id": tenant.id},
            {"$set": {"parametres": current_parametres}}
        )
        
        return {"message": "Paramètres mis à jour", "parametres": parametres}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur mise à jour paramètres formations: {str(e)}")

