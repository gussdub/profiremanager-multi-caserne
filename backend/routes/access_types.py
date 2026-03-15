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

# Import tardif pour éviter l'import circulaire
async def check_parametres_permission(tenant_id: str, user, action: str):
    """Vérifie la permission sur le module parametres (import tardif)"""
    from routes.dependencies import user_has_module_action
    return await user_has_module_action(tenant_id, user, "parametres", action)

async def require_parametres_permission(tenant_id: str, user, action: str):
    """Exige la permission sur le module parametres (import tardif)"""
    from routes.dependencies import require_permission
    await require_permission(tenant_id, user, "parametres", action)

# Limite maximale de types d'accès personnalisés par tenant
MAX_ACCESS_TYPES = 15

# ==================== DÉFINITION DES PERMISSIONS ====================

# Descriptions générales des actions (affichées en tooltip au survol)
ACTION_DESCRIPTIONS = {
    "voir": "Permet de consulter et visualiser les données",
    "creer": "Permet de créer de nouvelles entrées",
    "modifier": "Permet de modifier les données existantes",
    "supprimer": "Permet de supprimer définitivement des données",
    "exporter": "Permet d'exporter les données (PDF, Excel, etc.)",
    "signer": "Permet de signer numériquement des documents",
    "valider": "Permet de valider ou approuver des éléments",
    "approuver": "Permet d'approuver ou refuser des demandes",
    "accepter": "Permet d'accepter des propositions",
    "refuser": "Permet de refuser des propositions",
    "annuler": "Permet d'annuler des demandes en cours",
    "voir_anciens": "Permet de consulter les données archivées"
}

# Descriptions spécifiques par module (surcharge les descriptions générales)
MODULE_ACTION_DESCRIPTIONS = {
    "disponibilites": {
        "modifier": "Permet de modifier les disponibilités des autres employés et d'ignorer la date limite de blocage"
    },
    "planning": {
        "creer": "Permet de créer des assignations, lancer l'attribution automatique et publier les plannings",
        "modifier": "Permet de modifier les assignations existantes"
    },
    "remplacements": {
        "approuver": "Permet d'approuver ou refuser les demandes de congés et absences"
    },
    "paie": {
        "valider": "Permet de valider les feuilles de temps pour la paie",
        "modifier": "Permet de modifier les données salariales et feuilles de temps"
    },
    "interventions": {
        "signer": "Permet de signer électroniquement les rapports d'intervention"
    },
    "personnel": {
        "modifier": "Permet de modifier les fiches employés, y compris l'échelon salarial d'embauche",
        "voir_anciens": "Permet de consulter les fiches des employés inactifs/partis"
    },
    "parametres": {
        "modifier": "Permet de modifier les paramètres système et la configuration"
    }
}

# Structure des modules et leurs onglets avec actions disponibles
# ENRICHI pour permettre une configuration granulaire via l'interface "Comptes et accès"
MODULES_STRUCTURE = {
    "dashboard": {
        "label": "Tableau de bord",
        "icon": "📊",
        "tabs": {
            "personnel": {"label": "Section personnelle (mes gardes, mes heures)", "actions": ["voir"]},
            "general": {"label": "Section générale (couverture planning, stats équipe)", "actions": ["voir"]},
            "activites": {"label": "Fil d'activités système", "actions": ["voir"]},
            "alertes": {"label": "Alertes équipements et EPI", "actions": ["voir"]},
            "couverture": {"label": "Taux de couverture mensuel", "actions": ["voir"]}
        },
        "actions": ["voir"]
    },
    "personnel": {
        "label": "Personnel",
        "icon": "👥",
        "tabs": {
            "liste": {"label": "Liste des employés", "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
            "fiches": {"label": "Fiches individuelles", "actions": ["voir", "modifier", "exporter"]},
            "photos": {"label": "Photos de profil", "actions": ["voir", "modifier"]},
            "signatures": {"label": "Signatures numériques", "actions": ["voir", "modifier"]},
            "anciens": {"label": "Anciens employés", "actions": ["voir", "voir_anciens"]},
            "import": {"label": "Import CSV personnel", "actions": ["creer"]},
            "stats": {"label": "Statistiques mensuelles", "actions": ["voir"]}
        },
        "actions": ["voir", "creer", "modifier", "supprimer", "exporter", "voir_anciens"]
    },
    "interventions": {
        "label": "Interventions",
        "icon": "🚨",
        "tabs": {
            "rapports": {"label": "Cartes d'appel", "actions": ["voir", "creer", "modifier", "supprimer", "exporter", "signer"]},
            "fausses-alarmes": {"label": "Fausses alarmes", "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
            "conformite-dsi": {"label": "Conformité DSI", "actions": ["voir", "valider", "exporter"]},
            "historique": {"label": "Historique", "actions": ["voir", "exporter"]},
            "statistiques": {"label": "Statistiques interventions", "actions": ["voir", "exporter"]},
            "comparaison": {"label": "Comparaison annuelle", "actions": ["voir"]},
            "parametres": {"label": "Paramètres", "actions": ["voir", "modifier"]}
        },
        "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]
    },
    "paie": {
        "label": "Paie",
        "icon": "💰",
        "tabs": {
            "feuilles": {"label": "Feuilles de temps", "actions": ["voir", "creer", "modifier", "supprimer", "valider", "exporter"]},
            "rapports": {"label": "Rapports salariaux", "actions": ["voir", "exporter"]},
            "couts": {"label": "Coûts salariaux", "actions": ["voir", "exporter"]},
            "jours-feries": {"label": "Jours fériés", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "parametres": {"label": "Paramètres paie", "actions": ["voir", "modifier"]}
        },
        "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]
    },
    "planning": {
        "label": "Horaire",
        "icon": "📅",
        "tabs": {
            "calendrier": {"label": "Calendrier des gardes", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "assignations": {"label": "Assignations", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "equipe-jour": {"label": "Équipe du jour", "actions": ["voir"]},
            "rapport-heures": {"label": "Rapport d'heures", "actions": ["voir", "exporter"]},
            "export": {"label": "Export planning", "actions": ["exporter"]}
        },
        "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]
    },
    "remplacements": {
        "label": "Remplacements",
        "icon": "🔄",
        "tabs": {
            "propositions": {"label": "Propositions reçues", "actions": ["voir", "accepter", "refuser"]},
            "demandes": {"label": "Demandes de remplacement", "actions": ["voir", "creer", "modifier", "supprimer", "annuler"]},
            "conges": {"label": "Congés et absences", "actions": ["voir", "creer", "modifier", "supprimer", "approuver"]},
            "toutes-demandes": {"label": "Toutes les demandes (admin)", "actions": ["voir", "modifier", "supprimer"]},
            "parametres": {"label": "Paramètres remplacements", "actions": ["voir", "modifier"]}
        },
        "actions": ["voir", "creer", "modifier", "supprimer", "approuver", "annuler"]
    },
    "formations": {
        "label": "Formations",
        "icon": "📚",
        "tabs": {
            "catalogue": {"label": "Catalogue formations", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "inscriptions": {"label": "Inscriptions", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "suivi": {"label": "Suivi compétences", "actions": ["voir", "exporter"]},
            "competences": {"label": "Gestion compétences", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "conformite": {"label": "Rapport conformité NFPA", "actions": ["voir", "exporter"]},
            "dashboard": {"label": "Tableau de bord formations", "actions": ["voir"]}
        },
        "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]
    },
    "actifs": {
        "label": "Gestion des Actifs",
        "icon": "🚒",
        "tabs": {
            "vehicules": {"label": "Véhicules", "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
            "inventaires": {"label": "Inventaires véhicules", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "eau": {"label": "Approvisionnement Eau", "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
            "bornes": {"label": "Bornes sèches", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "points-eau": {"label": "Points d'eau", "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
            "materiel": {"label": "Matériel & Équipements", "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
            "categories": {"label": "Catégories équipements", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "apria": {"label": "Inspections APRIA", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "formulaires": {"label": "Formulaires inspection", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "epi": {"label": "Gestion EPI", "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
            "alertes": {"label": "Alertes maintenance/expiration", "actions": ["voir"]},
            "parametres": {"label": "Paramètres actifs", "actions": ["voir", "modifier"]}
        },
        "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]
    },
    "prevention": {
        "label": "Prévention",
        "icon": "🔥",
        "tabs": {
            "batiments": {"label": "Bâtiments", "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
            "inspections": {"label": "Inspections préventives", "actions": ["voir", "creer", "modifier", "supprimer", "valider", "exporter"]},
            "avis": {"label": "Avis de non-conformité", "actions": ["voir", "creer", "modifier", "supprimer", "signer"]},
            "calendrier": {"label": "Calendrier inspections", "actions": ["voir"]},
            "rapports": {"label": "Rapports prévention", "actions": ["voir", "exporter"]}
        },
        "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]
    },
    "disponibilites": {
        "label": "Disponibilités",
        "icon": "📋",
        "tabs": {
            "mes-dispos": {"label": "Mes disponibilités", "actions": ["voir"]},
            "equipe": {"label": "Disponibilités de l'équipe", "actions": ["voir", "modifier"]},
            "import": {"label": "Import en masse", "actions": ["creer"]},
            "rapport": {"label": "Rapport disponibilités", "actions": ["voir", "exporter"]}
        },
        "actions": ["voir", "modifier", "exporter"]
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
        "tabs": {
            "informations": {"label": "Informations personnelles", "actions": ["voir", "modifier"]},
            "photo": {"label": "Photo de profil", "actions": ["voir", "modifier"]},
            "signature": {"label": "Signature numérique", "actions": ["voir", "modifier"]},
            "mot-de-passe": {"label": "Mot de passe", "actions": ["modifier"]}
        },
        "actions": ["voir", "modifier"]
    },
    "rapports": {
        "label": "Rapports",
        "icon": "📈",
        "tabs": {
            "dashboard-interne": {"label": "Dashboard interne", "actions": ["voir"]},
            "couts-salariaux": {"label": "Coûts salariaux", "actions": ["voir", "exporter"]},
            "budget": {"label": "Tableau de bord budgétaire", "actions": ["voir"]},
            "immobilisations": {"label": "Rapport immobilisations", "actions": ["voir", "exporter"]},
            "interventions": {"label": "Statistiques interventions", "actions": ["voir", "exporter"]},
            "personnel-pdf": {"label": "Export personnel PDF", "actions": ["exporter"]},
            "personnel-excel": {"label": "Export personnel Excel", "actions": ["exporter"]},
            "salaires-pdf": {"label": "Export salaires PDF", "actions": ["exporter"]},
            "salaires-excel": {"label": "Export salaires Excel", "actions": ["exporter"]}
        },
        "actions": ["voir", "exporter"]
    },
    "parametres": {
        "label": "Paramètres",
        "icon": "⚙️",
        "tabs": {
            "types-garde": {"label": "Types de gardes", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "competences": {"label": "Compétences", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "grades": {"label": "Grades", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "horaires": {"label": "Horaires personnalisés", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "rotation-equipes": {"label": "Rotation équipes", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "comptes": {"label": "Comptes & Accès", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "remplacements": {"label": "Paramètres remplacements", "actions": ["voir", "modifier"]},
            "disponibilites": {"label": "Paramètres disponibilités", "actions": ["voir", "modifier"]},
            "formations": {"label": "Paramètres formations", "actions": ["voir", "modifier"]},
            "personnalisation": {"label": "Personnalisation caserne", "actions": ["voir", "modifier"]},
            "secteurs": {"label": "Secteurs d'intervention", "actions": ["voir", "creer", "modifier", "supprimer"]},
            "imports": {"label": "Imports CSV", "actions": ["voir", "creer"]},
            "facturation": {"label": "Facturation", "actions": ["voir", "modifier"]},
            "emails-history": {"label": "Historique E-mails", "actions": ["voir"]}
        },
        "actions": ["voir", "creer", "modifier", "supprimer"]
    }
}

# Permissions par défaut pour les rôles de base
DEFAULT_PERMISSIONS = {
    "admin": {
        # Admin a accès à TOUT - cette permission ne peut pas être modifiée
        "is_full_access": True,
        "modules": {
            "dashboard": {
                "access": True, 
                "actions": ["voir"],
                "tabs": {
                    "personnel": {"access": True, "actions": ["voir"]},
                    "general": {"access": True, "actions": ["voir"]},
                    "activites": {"access": True, "actions": ["voir"]},
                    "alertes": {"access": True, "actions": ["voir"]},
                    "couverture": {"access": True, "actions": ["voir"]}
                }
            },
            "personnel": {
                "access": True, 
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter", "voir_anciens"],
                "tabs": {
                    "liste": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "fiches": {"access": True, "actions": ["voir", "modifier", "exporter"]},
                    "photos": {"access": True, "actions": ["voir", "modifier"]},
                    "signatures": {"access": True, "actions": ["voir", "modifier"]},
                    "anciens": {"access": True, "actions": ["voir", "voir_anciens"]},
                    "import": {"access": True, "actions": ["creer"]},
                    "stats": {"access": True, "actions": ["voir"]}
                }
            },
            "interventions": {
                "access": True, 
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "rapports": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter", "signer"]},
                    "fausses-alarmes": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "conformite-dsi": {"access": True, "actions": ["voir", "valider", "exporter"]},
                    "historique": {"access": True, "actions": ["voir", "exporter"]},
                    "statistiques": {"access": True, "actions": ["voir", "exporter"]},
                    "comparaison": {"access": True, "actions": ["voir"]},
                    "parametres": {"access": True, "actions": ["voir", "modifier"]}
                }
            },
            "paie": {
                "access": True,
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "feuilles": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "valider", "exporter"]},
                    "rapports": {"access": True, "actions": ["voir", "exporter"]},
                    "couts": {"access": True, "actions": ["voir", "exporter"]},
                    "jours-feries": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "parametres": {"access": True, "actions": ["voir", "modifier"]}
                }
            },
            "planning": {
                "access": True, 
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "calendrier": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "assignations": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "equipe-jour": {"access": True, "actions": ["voir"]},
                    "rapport-heures": {"access": True, "actions": ["voir", "exporter"]},
                    "export": {"access": True, "actions": ["exporter"]}
                }
            },
            "remplacements": {
                "access": True,
                "actions": ["voir", "creer", "modifier", "supprimer", "approuver", "annuler"],
                "tabs": {
                    "propositions": {"access": True, "actions": ["voir", "accepter", "refuser"]},
                    "demandes": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "annuler"]},
                    "conges": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "approuver"]},
                    "toutes-demandes": {"access": True, "actions": ["voir", "modifier", "supprimer"]},
                    "parametres": {"access": True, "actions": ["voir", "modifier"]}
                }
            },
            "formations": {
                "access": True,
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "catalogue": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "inscriptions": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "suivi": {"access": True, "actions": ["voir", "exporter"]},
                    "competences": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "conformite": {"access": True, "actions": ["voir", "exporter"]},
                    "dashboard": {"access": True, "actions": ["voir"]}
                }
            },
            "actifs": {
                "access": True,
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "vehicules": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "inventaires": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "eau": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "bornes": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "points-eau": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "materiel": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "categories": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "apria": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "formulaires": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "epi": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "alertes": {"access": True, "actions": ["voir"]},
                    "parametres": {"access": True, "actions": ["voir", "modifier"]}
                }
            },
            "prevention": {
                "access": True,
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "batiments": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "inspections": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "valider", "exporter"]},
                    "avis": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "signer"]},
                    "calendrier": {"access": True, "actions": ["voir"]},
                    "rapports": {"access": True, "actions": ["voir", "exporter"]}
                }
            },
            "disponibilites": {
                "access": True, 
                "actions": ["voir", "modifier", "exporter"],
                "tabs": {
                    "mes-dispos": {"access": True, "actions": ["voir", "modifier"]},
                    "equipe": {"access": True, "actions": ["voir"]},
                    "import": {"access": True, "actions": ["creer"]},
                    "rapport": {"access": True, "actions": ["voir", "exporter"]}
                }
            },
            "mesepi": {"access": True, "actions": ["voir"]},
            "monprofil": {
                "access": True, 
                "actions": ["voir", "modifier"],
                "tabs": {
                    "informations": {"access": True, "actions": ["voir", "modifier"]},
                    "photo": {"access": True, "actions": ["voir", "modifier"]},
                    "signature": {"access": True, "actions": ["voir", "modifier"]},
                    "mot-de-passe": {"access": True, "actions": ["modifier"]}
                }
            },
            "rapports": {
                "access": True, 
                "actions": ["voir", "exporter"],
                "tabs": {
                    "dashboard-interne": {"access": True, "actions": ["voir"]},
                    "couts-salariaux": {"access": True, "actions": ["voir", "exporter"]},
                    "budget": {"access": True, "actions": ["voir"]},
                    "immobilisations": {"access": True, "actions": ["voir", "exporter"]},
                    "interventions": {"access": True, "actions": ["voir", "exporter"]},
                    "personnel-pdf": {"access": True, "actions": ["exporter"]},
                    "personnel-excel": {"access": True, "actions": ["exporter"]},
                    "salaires-pdf": {"access": True, "actions": ["exporter"]},
                    "salaires-excel": {"access": True, "actions": ["exporter"]}
                }
            },
            "parametres": {
                "access": True,
                "actions": ["voir", "creer", "modifier", "supprimer"],
                "tabs": {
                    "types-garde": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "competences": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "grades": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "horaires": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "rotation-equipes": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "comptes": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "remplacements": {"access": True, "actions": ["voir", "modifier"]},
                    "disponibilites": {"access": True, "actions": ["voir", "modifier"]},
                    "formations": {"access": True, "actions": ["voir", "modifier"]},
                    "personnalisation": {"access": True, "actions": ["voir", "modifier"]},
                    "secteurs": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "imports": {"access": True, "actions": ["voir", "creer"]},
                    "facturation": {"access": True, "actions": ["voir", "modifier"]},
                    "emails-history": {"access": True, "actions": ["voir"]}
                }
            }
        }
    },
    "superviseur": {
        "modules": {
            "dashboard": {
                "access": True, 
                "actions": ["voir"],
                "tabs": {
                    "personnel": {"access": True, "actions": ["voir"]},
                    "general": {"access": True, "actions": ["voir"]},
                    "activites": {"access": False, "actions": []},
                    "alertes": {"access": True, "actions": ["voir"]},
                    "couverture": {"access": True, "actions": ["voir"]}
                }
            },
            "personnel": {
                "access": True, 
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter", "voir_anciens"],
                "tabs": {
                    "liste": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "fiches": {"access": True, "actions": ["voir", "modifier", "exporter"]},
                    "photos": {"access": True, "actions": ["voir", "modifier"]},
                    "signatures": {"access": True, "actions": ["voir", "modifier"]},
                    "anciens": {"access": True, "actions": ["voir", "voir_anciens"]},
                    "import": {"access": True, "actions": ["creer"]},
                    "stats": {"access": True, "actions": ["voir"]}
                }
            },
            "interventions": {
                "access": True, 
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "rapports": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter", "signer"]},
                    "fausses-alarmes": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "conformite-dsi": {"access": True, "actions": ["voir", "valider", "exporter"]},
                    "historique": {"access": True, "actions": ["voir", "exporter"]},
                    "statistiques": {"access": True, "actions": ["voir", "exporter"]},
                    "comparaison": {"access": True, "actions": ["voir"]},
                    "parametres": {"access": False, "actions": []}
                }
            },
            "paie": {
                "access": True,
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "feuilles": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "valider", "exporter"]},
                    "rapports": {"access": True, "actions": ["voir", "exporter"]},
                    "couts": {"access": False, "actions": []},
                    "jours-feries": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "parametres": {"access": False, "actions": []}
                }
            },
            "planning": {
                "access": True, 
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "calendrier": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "assignations": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "equipe-jour": {"access": True, "actions": ["voir"]},
                    "rapport-heures": {"access": True, "actions": ["voir", "exporter"]},
                    "export": {"access": True, "actions": ["exporter"]}
                }
            },
            "remplacements": {
                "access": True,
                "actions": ["voir", "creer", "modifier", "supprimer", "approuver"],
                "tabs": {
                    "propositions": {"access": True, "actions": ["voir", "accepter", "refuser"]},
                    "demandes": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "conges": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "approuver"]},
                    "toutes-demandes": {"access": True, "actions": ["voir", "modifier", "supprimer"]},
                    "parametres": {"access": False, "actions": []}
                }
            },
            "formations": {
                "access": True,
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "catalogue": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "inscriptions": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "suivi": {"access": True, "actions": ["voir", "exporter"]},
                    "competences": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "conformite": {"access": True, "actions": ["voir", "exporter"]},
                    "dashboard": {"access": True, "actions": ["voir"]}
                }
            },
            "actifs": {
                "access": True,
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "vehicules": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "inventaires": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "eau": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "bornes": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "points-eau": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "materiel": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "categories": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "apria": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "formulaires": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer"]},
                    "epi": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "alertes": {"access": True, "actions": ["voir"]},
                    "parametres": {"access": False, "actions": []}
                }
            },
            "prevention": {
                "access": True,
                "actions": ["voir", "creer", "modifier", "supprimer", "exporter"],
                "tabs": {
                    "batiments": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "exporter"]},
                    "inspections": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "valider", "exporter"]},
                    "avis": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "signer"]},
                    "calendrier": {"access": True, "actions": ["voir"]},
                    "rapports": {"access": True, "actions": ["voir", "exporter"]}
                }
            },
            "disponibilites": {
                "access": True, 
                "actions": ["voir", "modifier"],
                "tabs": {
                    "mes-dispos": {"access": True, "actions": ["voir", "modifier"]},
                    "equipe": {"access": True, "actions": ["voir"]},
                    "import": {"access": True, "actions": ["creer"]},
                    "rapport": {"access": False, "actions": []}
                }
            },
            "mesepi": {"access": True, "actions": ["voir"]},
            "monprofil": {
                "access": True, 
                "actions": ["voir", "modifier"],
                "tabs": {
                    "informations": {"access": True, "actions": ["voir", "modifier"]},
                    "photo": {"access": True, "actions": ["voir", "modifier"]},
                    "signature": {"access": True, "actions": ["voir", "modifier"]},
                    "mot-de-passe": {"access": True, "actions": ["modifier"]}
                }
            },
            "rapports": {"access": False, "actions": [], "tabs": {}},
            "parametres": {"access": False, "actions": [], "tabs": {}}
        }
    },
    "employe": {
        "modules": {
            "dashboard": {
                "access": True, 
                "actions": ["voir"],
                "tabs": {
                    "personnel": {"access": True, "actions": ["voir"]},
                    "general": {"access": False, "actions": []},
                    "activites": {"access": False, "actions": []},
                    "alertes": {"access": False, "actions": []},
                    "couverture": {"access": False, "actions": []}
                }
            },
            "personnel": {"access": False, "actions": [], "tabs": {}},
            "interventions": {"access": False, "actions": [], "tabs": {}},
            "paie": {"access": False, "actions": [], "tabs": {}},
            "planning": {
                "access": True, 
                "actions": ["voir"],
                "tabs": {
                    "calendrier": {"access": True, "actions": ["voir"]},
                    "assignations": {"access": False, "actions": []},
                    "equipe-jour": {"access": True, "actions": ["voir"]},
                    "rapport-heures": {"access": False, "actions": []},
                    "export": {"access": False, "actions": []}
                }
            },
            "remplacements": {
                "access": True,
                "actions": ["voir", "creer", "annuler"],
                "tabs": {
                    "propositions": {"access": True, "actions": ["voir", "accepter", "refuser"]},
                    "demandes": {"access": True, "actions": ["voir", "creer", "modifier", "supprimer", "annuler"]},
                    "conges": {"access": True, "actions": ["voir", "creer"]},
                    "toutes-demandes": {"access": False, "actions": []},
                    "parametres": {"access": False, "actions": []}
                }
            },
            "formations": {
                "access": True,
                "actions": ["voir"],
                "tabs": {
                    "catalogue": {"access": True, "actions": ["voir"]},
                    "inscriptions": {"access": True, "actions": ["voir"]},
                    "suivi": {"access": True, "actions": ["voir"]},
                    "competences": {"access": False, "actions": []},
                    "conformite": {"access": False, "actions": []},
                    "dashboard": {"access": False, "actions": []}
                }
            },
            "actifs": {
                "access": True,
                "actions": ["voir"],
                "tabs": {
                    "vehicules": {"access": True, "actions": ["voir"]},
                    "inventaires": {"access": True, "actions": ["voir"]},
                    "eau": {"access": True, "actions": ["voir"]},
                    "bornes": {"access": True, "actions": ["voir"]},
                    "points-eau": {"access": True, "actions": ["voir"]},
                    "materiel": {"access": True, "actions": ["voir"]},
                    "categories": {"access": False, "actions": []},
                    "apria": {"access": True, "actions": ["voir"]},
                    "formulaires": {"access": False, "actions": []},
                    "epi": {"access": False, "actions": []},
                    "alertes": {"access": False, "actions": []},
                    "parametres": {"access": False, "actions": []}
                }
            },
            "prevention": {
                "access": True,
                "actions": ["voir", "creer", "modifier"],
                "tabs": {
                    "batiments": {"access": True, "actions": ["voir"]},
                    "inspections": {"access": True, "actions": ["voir", "creer", "modifier"]},
                    "avis": {"access": False, "actions": []},
                    "calendrier": {"access": True, "actions": ["voir"]},
                    "rapports": {"access": False, "actions": []}
                }
            },
            "disponibilites": {
                "access": True, 
                "actions": ["voir", "modifier"],
                "tabs": {
                    "mes-dispos": {"access": True, "actions": ["voir", "modifier"]},
                    "equipe": {"access": False, "actions": []},
                    "import": {"access": False, "actions": []},
                    "rapport": {"access": False, "actions": []}
                }
            },
            "mesepi": {"access": True, "actions": ["voir"]},
            "monprofil": {
                "access": True, 
                "actions": ["voir", "modifier"],
                "tabs": {
                    "informations": {"access": True, "actions": ["voir", "modifier"]},
                    "photo": {"access": True, "actions": ["voir", "modifier"]},
                    "signature": {"access": True, "actions": ["voir", "modifier"]},
                    "mot-de-passe": {"access": True, "actions": ["modifier"]}
                }
            },
            "rapports": {"access": False, "actions": [], "tabs": {}},
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

def get_active_modules_for_tenant(tenant) -> dict:
    """
    Filtre les modules selon ce qui est activé pour le tenant.
    Retourne uniquement les modules actifs.
    """
    parametres = tenant.parametres if hasattr(tenant, 'parametres') else tenant.get('parametres', {}) or {}
    
    # Modules toujours disponibles (core)
    always_active = ['dashboard', 'personnel', 'planning', 'disponibilites', 'mesepi', 'monprofil', 'parametres']
    
    # Mapping des flags de paramètres vers les modules
    module_flags = {
        'interventions': parametres.get('module_interventions_active', True),  # Par défaut actif
        'paie': parametres.get('module_paie_active', True),  # Par défaut actif
        'remplacements': parametres.get('module_remplacements_active', True),  # Par défaut actif
        'formations': parametres.get('module_formations_active', True),  # Par défaut actif
        'actifs': parametres.get('module_actifs_active', True),  # Par défaut actif
        'prevention': parametres.get('module_prevention_active', False),  # Par défaut inactif
        'rapports': parametres.get('module_rapports_active', True),  # Par défaut actif
    }
    
    # Construire la liste des modules actifs
    active_modules = {}
    for module_id, module_config in MODULES_STRUCTURE.items():
        if module_id in always_active:
            active_modules[module_id] = module_config
        elif module_id in module_flags and module_flags[module_id]:
            active_modules[module_id] = module_config
    
    return active_modules


def filter_permissions_for_tenant(permissions: dict, active_modules: dict) -> dict:
    """
    Filtre les permissions pour ne garder que les modules actifs du tenant.
    """
    if permissions.get("is_full_access"):
        return permissions
    
    filtered = {"modules": {}}
    for module_id, module_perms in permissions.get("modules", {}).items():
        if module_id in active_modules:
            filtered["modules"][module_id] = module_perms
    
    return filtered


@router.get("/{tenant_slug}/access-types/modules-structure")
async def get_modules_structure(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Retourne la structure des modules actifs pour ce tenant et leurs permissions possibles.
    Utilisé par le frontend pour construire l'interface de configuration.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # RBAC: Vérifier permission de voir sur le module parametres
    await require_parametres_permission(tenant.id, current_user, "voir")
    
    # Filtrer les modules selon ce qui est activé pour le tenant
    active_modules = get_active_modules_for_tenant(tenant)
    
    # Filtrer les permissions par défaut aussi
    filtered_default_permissions = {}
    for role_id, role_perms in DEFAULT_PERMISSIONS.items():
        filtered_default_permissions[role_id] = filter_permissions_for_tenant(role_perms, active_modules)
    
    return {
        "modules": active_modules,
        "default_permissions": filtered_default_permissions,
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
            "refuser": "❌ Refuser",
            "voir_anciens": "📜 Voir anciens employés"
        },
        "actions_descriptions": ACTION_DESCRIPTIONS,
        "module_action_descriptions": MODULE_ACTION_DESCRIPTIONS
    }


@router.get("/{tenant_slug}/access-types")
async def list_access_types(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Liste tous les types d'accès du tenant (de base + personnalisés)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # RBAC: Vérifier permission de voir sur le module parametres
    await require_parametres_permission(tenant.id, current_user, "voir")
    
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
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # RBAC: Vérifier permission de voir sur le module parametres
    await require_parametres_permission(tenant.id, current_user, "voir")
    
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
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # RBAC: Vérifier permission de création sur le module parametres
    await require_parametres_permission(tenant.id, current_user, "creer")
    
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
    if data.role_base not in ["employe", "superviseur", "admin"]:
        raise HTTPException(status_code=400, detail="Le rôle de base doit être 'employe', 'superviseur' ou 'admin'")
    
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
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # RBAC: Vérifier permission de modification sur le module parametres
    await require_parametres_permission(tenant.id, current_user, "modifier")
    
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
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # RBAC: Vérifier permission de suppression sur le module parametres
    await require_parametres_permission(tenant.id, current_user, "supprimer")
    
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
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # RBAC: Vérifier permission de voir sur le module parametres
    await require_parametres_permission(tenant.id, current_user, "voir")
    
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


@router.get("/{tenant_slug}/users/{user_id}/permissions")
async def get_user_permissions(
    tenant_slug: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère les permissions effectives d'un utilisateur.
    L'utilisateur peut récupérer ses propres permissions, ou un admin peut voir celles de n'importe qui.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Vérifier l'accès via RBAC : soit c'est ses propres permissions, soit il a la permission de voir les paramètres
    can_view_others = await check_parametres_permission(tenant.id, current_user, "voir")
    if current_user.id != user_id and not can_view_others:
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    
    # Récupérer l'utilisateur
    target_user = await db.users.find_one(
        {"id": user_id, "tenant_id": tenant.id},
        {"_id": 0, "mot_de_passe_hash": 0}
    )
    
    if not target_user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Admin a accès complet
    if target_user.get("role") == "admin":
        return {
            "user_id": user_id,
            "role": "admin",
            "access_type_id": None,
            "permissions": {"is_full_access": True}
        }
    
    # Vérifier si l'utilisateur a un type d'accès personnalisé
    access_type_id = target_user.get("access_type_id")
    
    if access_type_id:
        # Récupérer le type d'accès personnalisé
        access_type = await db.access_types.find_one(
            {"id": access_type_id, "tenant_id": tenant.id},
            {"_id": 0}
        )
        if access_type:
            # Filtrer les permissions selon les modules actifs du tenant
            active_modules = get_active_modules_for_tenant(tenant)
            filtered_perms = filter_permissions_for_tenant(access_type.get("permissions", {}), active_modules)
            
            return {
                "user_id": user_id,
                "role": target_user.get("role"),
                "access_type_id": access_type_id,
                "access_type_name": access_type.get("nom"),
                "permissions": filtered_perms
            }
    
    # Sinon, utiliser les permissions par défaut du rôle
    role = target_user.get("role", "employe")
    default_perms = DEFAULT_PERMISSIONS.get(role, DEFAULT_PERMISSIONS["employe"])
    
    # Filtrer selon les modules actifs du tenant
    active_modules = get_active_modules_for_tenant(tenant)
    filtered_perms = filter_permissions_for_tenant(default_perms, active_modules)
    
    return {
        "user_id": user_id,
        "role": role,
        "access_type_id": None,
        "permissions": filtered_perms
    }


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
