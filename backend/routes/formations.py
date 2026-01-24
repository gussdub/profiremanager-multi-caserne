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
