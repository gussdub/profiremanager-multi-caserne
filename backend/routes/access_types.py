"""
Routes API pour la gestion des types d'accès personnalisés
===========================================================

Ce module gère le système RBAC (Role-Based Access Control) personnalisable :
- Types d'accès personnalisés (ex: Superviseur Logistique, Secrétaire)
- Permissions par module et par onglet
- Héritage des permissions depuis un rôle de base
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Access Types"])
logger = logging.getLogger(__name__)

# Limite maximale de types d'accès personnalisés par tenant
MAX_ACCESS_TYPES = 15

# ==================== DÉFINITION DES PERMISSIONS ====================

# Structure des modules et leurs onglets avec actions disponibles
MODULES_STRUCTURE = {
    "dashboard": {
        "label": "Tableau de bord",
        "icon": "📊",
        "tabs": {},
        "actions": ["voir"]
    },
    "personnel": {
        "label": "Personnel",
        "icon": "👥",
        "tabs": {},
        "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]
    },
    "interventions": {
        "label": "Interventions",
        "icon": "🚨",
        "tabs": {
            "rapports": {"label": "Cartes d'appel", "actions": ["voir", "creer", "modifier", "supprimer", "exporter", "signer"]},
            "fausses-alarmes": {"label": "Fausses alarmes", "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
            "conformite-dsi": {"label": "Conformité DSI", "actions": ["voir", "valider", "exporter"]},
            "historique": {"label": "Historique", "actions": ["voir", "exporter"]},
            "parametres": {"label": "Paramètres", "actions": ["voir", "modifier"]}
        },
        "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]
    },
    "paie": {
        "label": "Paie",
        "icon": "💰",
        "tabs": {
            "feuilles": {"label": "Feuilles de temps", "actions": ["voir", "creer", "modifier", "supprimer", "valider", "exporter"]},
            "rapports": {"label": "Rapports", "actions": ["voir", "exporter"]},
            "jours-feries": {"label": "Jours fériés", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "parametres": {"label": "Paramètres", "actions": ["voir", "modifier"]}
        },
        "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]
    },
    "planning": {
        "label": "Horaire",
        "icon": "📅",
        "tabs": {},
        "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]
    },
    "remplacements": {
        "label": "Remplacements",
        "icon": "🔄",
        "tabs": {
            "propositions": {"label": "Propositions reçues", "actions": ["voir", "accepter", "refuser"]},
            "demandes": {"label": "Mes demandes", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "conges": {"label": "Congés", "actions": ["voir", "creer", "modifier", "supprimer", "approuver"]}
        },
        "actions": ["voir", "creer", "modifier", "supprimer", "approuver"]
    },
    "formations": {
        "label": "Formations",
        "icon": "📚",
        "tabs": {
            "catalogue": {"label": "Catalogue", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "inscriptions": {"label": "Inscriptions", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "suivi": {"label": "Suivi compétences", "actions": ["voir", "exporter"]}
        },
        "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]
    },
    "actifs": {
        "label": "Gestion des Actifs",
        "icon": "🚒",
        "tabs": {
            "vehicules": {"label": "Véhicules", "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
            "eau": {"label": "Approvisionnement Eau", "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
            "materiel": {"label": "Matériel & Équipements", "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
            "epi": {"label": "Gestion EPI", "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
            "parametres": {"label": "Paramètres", "actions": ["voir", "modifier"]}
        },
        "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]
    },
    "prevention": {
        "label": "Prévention",
        "icon": "🔥",
        "tabs": {
            "batiments": {"label": "Bâtiments", "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
            "inspections": {"label": "Inspections", "actions": ["voir", "creer", "modifier", "supprimer", "valider", "exporter"]},
            "calendrier": {"label": "Calendrier", "actions": ["voir"]}
        },
        "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]
    },
    "disponibilites": {
        "label": "Mes disponibilités",
        "icon": "📋",
        "tabs": {},
        "actions": ["voir", "modifier"]
    },
    "mesepi": {
        "label": "Mes EPI",
        "icon": "🛡️",
        "tabs": {},
        "actions": ["voir"]
    },
    "monprofil": {
        "label": "Mon profil",
        "icon": "👤",
        "tabs": {},
        "actions": ["voir", "modifier"]
    },
    "rapports": {
        "label": "Rapports",
        "icon": "📈",
        "tabs": {},
        "actions": ["voir", "exporter"]
    },
    "parametres": {
        "label": "Paramètres",
        "icon": "⚙️",
        "tabs": {
            "types-garde": {"label": "Gardes", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "competences": {"label": "Compétences", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "grades": {"label": "Grades", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "attribution": {"label": "Horaire", "actions": ["voir", "modifier"]},
            "rotation-equipes": {"label": "Rotation", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "comptes": {"label": "Comptes & Accès", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "remplacements": {"label": "Remplacements", "actions": ["voir", "modifier"]},
            "disponibilites": {"label": "Disponibilités", "actions": ["voir", "modifier"]},
            "formations": {"label": "Formations", "actions": ["voir", "modifier"]},
            "personnalisation": {"label": "Personnalisation", "actions": ["voir", "modifier"]},
            "secteurs": {"label": "Secteurs", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "imports": {"label": "Imports CSV", "actions": ["voir", "creer"]},
            "facturation": {"label": "Facturation", "actions": ["voir", "modifier"]},
            "emails-history": {"label": "E-mails", "actions": ["voir"]}
        },
        "actions": ["voir", "modifier"]
    }
}

# Permissions par défaut pour les rôles de base
DEFAULT_PERMISSIONS = {
    "admin": {
        # Admin a accès à TOUT - cette permission ne peut pas être modifiée
        "is_full_access": True
    },
    "superviseur": {
        "modules": {
            "dashboard": {"access": True, "actions": ["voir"]},
            "personnel": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
            "interventions": {
                "access": True, 
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "rapports": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter", "signer"]},
                    "fausses-alarmes": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "conformite-dsi": {"access": True, "actions": ["voir", "valider", "exporter"]},
                    "historique": {"access": True, "actions": ["voir", "exporter"]},
                    "parametres": {"access": False, "actions": []}
                }
            },
            "paie": {
                "access": True,
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "feuilles": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "valider", "exporter"]},
                    "rapports": {"access": True, "actions": ["voir", "exporter"]},
                    "jours-feries": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "parametres": {"access": False, "actions": []}
                }
            },
            "planning": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
            "remplacements": {
                "access": True,
                "actions": ["voir", "creer", "modifier", "supprimer", "approuver"],
                "tabs": {
                    "propositions": {"access": True, "actions": ["voir", "accepter", "refuser"]},
                    "demandes": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "conges": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "approuver"]}
                }
            },
            "formations": {
                "access": True,
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "catalogue": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "inscriptions": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "suivi": {"access": True, "actions": ["voir", "exporter"]}
                }
            },
            "actifs": {
                "access": True,
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "vehicules": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "eau": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "materiel": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "epi": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "parametres": {"access": False, "actions": []}
                }
            },
            "prevention": {
                "access": True,
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "batiments": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "inspections": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "valider", "exporter"]},
                    "calendrier": {"access": True, "actions": ["voir"]}
                }
            },
            "disponibilites": {"access": True, "actions": ["voir", "modifier"]},
            "mesepi": {"access": True, "actions": ["voir"]},
            "monprofil": {"access": True, "actions": ["voir", "modifier"]},
            "rapports": {"access": False, "actions": []},
            "parametres": {"access": False, "actions": [], "tabs": {}}
        }
    },
    "employe": {
        "modules": {
            "dashboard": {"access": True, "actions": ["voir"]},
            "personnel": {"access": False, "actions": []},
            "interventions": {"access": False, "actions": [], "tabs": {}},
            "paie": {"access": False, "actions": [], "tabs": {}},
            "planning": {"access": True, "actions": ["voir"]},
            "remplacements": {
                "access": True,
                "actions": ["voir", "creer"],
                "tabs": {
                    "propositions": {"access": True, "actions": ["voir", "accepter", "refuser"]},
                    "demandes": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "conges": {"access": True, "actions": ["voir", "creer"]}
                }
            },
            "formations": {
                "access": True,
                "actions": ["voir"],
                "tabs": {
                    "catalogue": {"access": True, "actions": ["voir"]},
                    "inscriptions": {"access": True, "actions": ["voir"]},
                    "suivi": {"access": True, "actions": ["voir"]}
                }
            },
            "actifs": {
                "access": True,
                "actions": ["voir"],
                "tabs": {
                    "vehicules": {"access": True, "actions": ["voir"]},
                    "eau": {"access": True, "actions": ["voir"]},
                    "materiel": {"access": True, "actions": ["voir"]},
                    "epi": {"access": False, "actions": []},
                    "parametres": {"access": False, "actions": []}
                }
            },
            "prevention": {
                "access": True,
                "actions": ["voir", "creer", "modifier"],
                "tabs": {
                    "batiments": {"access": True, "actions": ["voir"]},
                    "inspections": {"access": True, "actions": ["voir", "creer", "modifier"]},
                    "calendrier": {"access": True, "actions": ["voir"]}
                }
            },
            "disponibilites": {"access": True, "actions": ["voir", "modifier"]},
            "mesepi": {"access": True, "actions": ["voir"]},
            "monprofil": {"access": True, "actions": ["voir", "modifier"]},
            "rapports": {"access": False, "actions": []},
            "parametres": {"access": False, "actions": [], "tabs": {}}
        }
    }
}


class AccessTypeCreate(BaseModel):
    """Modèle pour créer un type d'accès"""
    nom: str
    description: Optional[str] = ""
    role_base: str = "employe"  # employe, superviseur
    permissions: Dict[str, Any] = {}


class AccessTypeUpdate(BaseModel):
    """Modèle pour mettre à jour un type d'accès"""
    nom: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[Dict[str, Any]] = None


# ==================== ENDPOINTS ====================

@router.get("/{tenant_slug}/access-types/modules-structure")
async def get_modules_structure(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Retourne la structure complète des modules et leurs permissions possibles.
    Utilisé par le frontend pour construire l'interface de configuration.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    return {
        "modules": MODULES_STRUCTURE,
        "default_permissions": DEFAULT_PERMISSIONS,
        "actions_labels": {
            "voir": "👁️ Voir",
            "creer": "➕ Créer",
            "modifier": "✏️ Modifier",
            "supprimer": "🗑️ Supprimer",
            "exporter": "📥 Exporter",
            "signer": "✍️ Signer",
            "valider": "✅ Valider",
            "approuver": "👍 Approuver",
            "accepter": "✔️ Accepter",
            "refuser": "❌ Refuser"
        }
    }


@router.get("/{tenant_slug}/access-types")
async def list_access_types(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Liste tous les types d'accès du tenant (de base + personnalisés)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Récupérer les types personnalisés
    custom_types = await db.access_types.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(MAX_ACCESS_TYPES)
    
    # Construire la réponse avec les rôles de base
    base_roles = [
        {
            "id": "admin",
            "nom": "Administrateur",
            "description": "Accès complet à tous les modules et fonctionnalités",
            "role_base": None,
            "is_system": True,
            "is_editable": False,
            "permissions": DEFAULT_PERMISSIONS["admin"]
        },
        {
            "id": "superviseur",
            "nom": "Superviseur",
            "description": "Gestion du personnel, planning et opérations quotidiennes",
            "role_base": None,
            "is_system": True,
            "is_editable": True,  # On peut voir/modifier les permissions détaillées
            "permissions": DEFAULT_PERMISSIONS["superviseur"]
        },
        {
            "id": "employe",
            "nom": "Employé",
            "description": "Accès de base : profil, disponibilités, planning en lecture",
            "role_base": None,
            "is_system": True,
            "is_editable": True,
            "permissions": DEFAULT_PERMISSIONS["employe"]
        }
    ]
    
    return {
        "base_roles": base_roles,
        "custom_types": custom_types,
        "max_custom_types": MAX_ACCESS_TYPES,
        "count_custom": len(custom_types)
    }


@router.get("/{tenant_slug}/access-types/{access_type_id}")
async def get_access_type(
    tenant_slug: str,
    access_type_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère un type d'accès spécifique"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Vérifier si c'est un rôle de base
    if access_type_id in DEFAULT_PERMISSIONS:
        return {
            "id": access_type_id,
            "nom": access_type_id.capitalize(),
            "is_system": True,
            "permissions": DEFAULT_PERMISSIONS[access_type_id]
        }
    
    # Sinon chercher dans les types personnalisés
    access_type = await db.access_types.find_one(
        {"id": access_type_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not access_type:
        raise HTTPException(status_code=404, detail="Type d'accès non trouvé")
    
    return access_type


@router.post("/{tenant_slug}/access-types")
async def create_access_type(
    tenant_slug: str,
    data: AccessTypeCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée un nouveau type d'accès personnalisé"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Vérifier la limite
    count = await db.access_types.count_documents({"tenant_id": tenant.id})
    if count >= MAX_ACCESS_TYPES:
        raise HTTPException(
            status_code=400, 
            detail=f"Limite de {MAX_ACCESS_TYPES} types d'accès personnalisés atteinte"
        )
    
    # Vérifier que le nom n'existe pas déjà
    existing = await db.access_types.find_one({
        "tenant_id": tenant.id,
        "nom": {"$regex": f"^{data.nom}$", "$options": "i"}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Un type d'accès avec ce nom existe déjà")
    
    # Vérifier le rôle de base
    if data.role_base not in ["employe", "superviseur"]:
        raise HTTPException(status_code=400, detail="Le rôle de base doit être 'employe' ou 'superviseur'")
    
    # Créer les permissions en héritant du rôle de base
    base_permissions = DEFAULT_PERMISSIONS.get(data.role_base, DEFAULT_PERMISSIONS["employe"])
    
    # Fusionner avec les permissions personnalisées
    if data.permissions:
        merged_permissions = merge_permissions(base_permissions, data.permissions)
    else:
        merged_permissions = base_permissions.copy()
    
    new_access_type = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "nom": data.nom,
        "description": data.description,
        "role_base": data.role_base,
        "is_system": False,
        "permissions": merged_permissions,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "created_by": current_user.id
    }
    
    await db.access_types.insert_one(new_access_type)
    
    # Retourner sans _id
    new_access_type.pop("_id", None)
    
    logger.info(f"Type d'accès créé: {data.nom} par {current_user.email}")
    
    return {"success": True, "access_type": new_access_type}


@router.put("/{tenant_slug}/access-types/{access_type_id}")
async def update_access_type(
    tenant_slug: str,
    access_type_id: str,
    data: AccessTypeUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour un type d'accès personnalisé"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Les rôles de base ne peuvent pas être modifiés directement
    if access_type_id in ["admin", "superviseur", "employe"]:
        raise HTTPException(
            status_code=400, 
            detail="Les rôles de base ne peuvent pas être modifiés. Créez un type personnalisé."
        )
    
    access_type = await db.access_types.find_one({
        "id": access_type_id,
        "tenant_id": tenant.id
    })
    
    if not access_type:
        raise HTTPException(status_code=404, detail="Type d'accès non trouvé")
    
    update_data = {"updated_at": datetime.now(timezone.utc)}
    
    if data.nom is not None:
        # Vérifier unicité du nom
        existing = await db.access_types.find_one({
            "tenant_id": tenant.id,
            "nom": {"$regex": f"^{data.nom}$", "$options": "i"},
            "id": {"$ne": access_type_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail="Un type d'accès avec ce nom existe déjà")
        update_data["nom"] = data.nom
    
    if data.description is not None:
        update_data["description"] = data.description
    
    if data.permissions is not None:
        # Valider que les permissions ne dépassent pas le rôle de base
        role_base = access_type.get("role_base", "employe")
        base_permissions = DEFAULT_PERMISSIONS.get(role_base, DEFAULT_PERMISSIONS["employe"])
        validated_permissions = validate_permissions(data.permissions, base_permissions)
        update_data["permissions"] = validated_permissions
    
    await db.access_types.update_one(
        {"id": access_type_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated = await db.access_types.find_one(
        {"id": access_type_id},
        {"_id": 0}
    )
    
    logger.info(f"Type d'accès mis à jour: {access_type_id} par {current_user.email}")
    
    return {"success": True, "access_type": updated}


@router.delete("/{tenant_slug}/access-types/{access_type_id}")
async def delete_access_type(
    tenant_slug: str,
    access_type_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime un type d'accès personnalisé"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Les rôles de base ne peuvent pas être supprimés
    if access_type_id in ["admin", "superviseur", "employe"]:
        raise HTTPException(status_code=400, detail="Les rôles de base ne peuvent pas être supprimés")
    
    # Vérifier si des utilisateurs utilisent ce type d'accès
    users_with_type = await db.users.count_documents({
        "tenant_id": tenant.id,
        "access_type_id": access_type_id
    })
    
    if users_with_type > 0:
        raise HTTPException(
            status_code=400,
            detail=f"{users_with_type} utilisateur(s) utilisent ce type d'accès. Réassignez-les d'abord."
        )
    
    result = await db.access_types.delete_one({
        "id": access_type_id,
        "tenant_id": tenant.id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Type d'accès non trouvé")
    
    logger.info(f"Type d'accès supprimé: {access_type_id} par {current_user.email}")
    
    return {"success": True, "message": "Type d'accès supprimé"}


@router.get("/{tenant_slug}/access-types/{access_type_id}/users")
async def get_users_with_access_type(
    tenant_slug: str,
    access_type_id: str,
    current_user: User = Depends(get_current_user)
):
    """Liste les utilisateurs ayant un type d'accès spécifique"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Pour les rôles de base, chercher par le champ 'role'
    if access_type_id in ["admin", "superviseur", "employe"]:
        users = await db.users.find(
            {"tenant_id": tenant.id, "role": access_type_id},
            {"_id": 0, "mot_de_passe_hash": 0}
        ).to_list(1000)
    else:
        # Pour les types personnalisés
        users = await db.users.find(
            {"tenant_id": tenant.id, "access_type_id": access_type_id},
            {"_id": 0, "mot_de_passe_hash": 0}
        ).to_list(1000)
    
    return {"users": users, "count": len(users)}


# ==================== HELPER FUNCTIONS ====================

def merge_permissions(base: Dict, custom: Dict) -> Dict:
    """Fusionne les permissions personnalisées avec les permissions de base"""
    if not custom:
        return base.copy()
    
    result = {}
    
    # Si le base a is_full_access, on ne peut pas le modifier
    if base.get("is_full_access"):
        return {"is_full_access": True}
    
    base_modules = base.get("modules", {})
    custom_modules = custom.get("modules", {})
    
    result["modules"] = {}
    
    for module_id, module_config in base_modules.items():
        if module_id in custom_modules:
            # Fusionner les configurations
            result["modules"][module_id] = {
                "access": custom_modules[module_id].get("access", module_config.get("access", False)),
                "actions": custom_modules[module_id].get("actions", module_config.get("actions", [])),
            }
            # Fusionner les tabs si présents
            if "tabs" in module_config or "tabs" in custom_modules[module_id]:
                result["modules"][module_id]["tabs"] = {}
                base_tabs = module_config.get("tabs", {})
                custom_tabs = custom_modules[module_id].get("tabs", {})
                
                for tab_id, tab_config in base_tabs.items():
                    if tab_id in custom_tabs:
                        result["modules"][module_id]["tabs"][tab_id] = custom_tabs[tab_id]
                    else:
                        result["modules"][module_id]["tabs"][tab_id] = tab_config
        else:
            result["modules"][module_id] = module_config.copy()
    
    return result


def validate_permissions(permissions: Dict, base_permissions: Dict) -> Dict:
    """
    Valide que les permissions ne dépassent pas celles du rôle de base.
    Les permissions du module sont le plafond pour les onglets.
    """
    if not permissions or not permissions.get("modules"):
        return base_permissions.copy()
    
    validated = {"modules": {}}
    base_modules = base_permissions.get("modules", {})
    input_modules = permissions.get("modules", {})
    
    for module_id, module_config in input_modules.items():
        base_module = base_modules.get(module_id, {"access": False, "actions": []})
        
        validated_module = {
            "access": module_config.get("access", False),
            "actions": []
        }
        
        # Valider les actions du module
        base_actions = set(base_module.get("actions", []))
        requested_actions = module_config.get("actions", [])
        
        for action in requested_actions:
            # L'action doit exister dans le base OU dans la structure du module
            module_struct = MODULES_STRUCTURE.get(module_id, {})
            allowed_actions = set(module_struct.get("actions", [])) | base_actions
            if action in allowed_actions:
                validated_module["actions"].append(action)
        
        # Valider les tabs
        if "tabs" in module_config:
            validated_module["tabs"] = {}
            base_tabs = base_module.get("tabs", {})
            
            for tab_id, tab_config in module_config.get("tabs", {}).items():
                base_tab = base_tabs.get(tab_id, {"access": False, "actions": []})
                
                validated_tab = {
                    "access": tab_config.get("access", False),
                    "actions": []
                }
                
                # Les actions du tab ne peuvent pas dépasser celles du module
                module_actions = set(validated_module["actions"])
                tab_struct = MODULES_STRUCTURE.get(module_id, {}).get("tabs", {}).get(tab_id, {})
                allowed_tab_actions = set(tab_struct.get("actions", []))
                
                for action in tab_config.get("actions", []):
                    # L'action doit être dans les actions autorisées du tab ET dans les actions du module
                    if action in allowed_tab_actions:
                        # Vérifier que le module autorise ce type d'action
                        if action in module_actions or action in ["voir"]:  # "voir" est toujours héritée si le module est accessible
                            validated_tab["actions"].append(action)
                
                validated_module["tabs"][tab_id] = validated_tab
        
        validated["modules"][module_id] = validated_module
    
    return validated
