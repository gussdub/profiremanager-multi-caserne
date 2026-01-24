"""
Routes API pour le module Paie
Ce fichier est préparé pour l'extraction future du module Paie de server.py.

IMPORTANT: Ce fichier n'est PAS encore actif. Les routes sont toujours dans server.py.
Pour activer ce module:
1. Décommenter les imports dans server.py
2. Inclure ce router avec: app.include_router(paie_router, prefix="/api")
3. Supprimer les routes correspondantes de server.py
4. Tester exhaustivement avant mise en production

Lignes dans server.py: 38375-41039 (2665 lignes)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone
import uuid
import logging

router = APIRouter(tags=["Paie"])

# TODO: Importer les dépendances nécessaires depuis server.py:
# - db (connexion MongoDB)
# - get_current_user (dépendance d'authentification)
# - User, Tenant (modèles)
# - get_tenant (fonction helper)

# ==================== MODÈLES PAIE ====================

class ParametresPaie(BaseModel):
    """Paramètres de paie basés sur la convention collective du tenant"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    
    # Période de paie
    periode_paie_jours: int = 14
    jour_debut_periode: str = "lundi"
    
    # Configuration par type de présence
    garde_interne_taux: float = 0.0
    garde_interne_minimum_heures: float = 0.0
    garde_externe_taux: float = 1.0
    garde_externe_minimum_heures: float = 3.0
    garde_externe_montant_fixe: float = 0.0
    rappel_taux: float = 1.0
    rappel_minimum_heures: float = 3.0
    formation_taux: float = 1.0
    formation_taux_specifique: bool = False
    formation_taux_horaire: float = 0.0
    heures_sup_seuil_hebdo: int = 40
    heures_sup_taux: float = 1.5
    inclure_primes_repas: bool = True
    formats_export_actifs: List[str] = ["pdf", "excel"]
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LigneFeuilleTemps(BaseModel):
    """Une ligne de feuille de temps"""
    date: str
    type: str  # garde_interne, garde_externe, rappel, formation, intervention
    description: str
    heures_brutes: float
    heures_payees: float
    taux: float
    montant: float
    source_id: Optional[str] = None
    source_type: Optional[str] = None


class FeuilleTemps(BaseModel):
    """Feuille de temps générée pour un employé sur une période"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    
    annee: int
    periode_debut: str
    periode_fin: str
    numero_periode: int
    
    employe_nom: str
    employe_prenom: str
    employe_numero: str
    employe_grade: str
    employe_type_emploi: str
    employe_taux_horaire: float
    
    lignes: List[dict] = []
    
    total_heures_gardes_internes: float = 0.0
    total_heures_gardes_externes: float = 0.0
    total_heures_rappels: float = 0.0
    total_heures_formations: float = 0.0
    total_heures_interventions: float = 0.0
    total_heures_supplementaires: float = 0.0
    total_primes_repas: float = 0.0
    total_primes_autres: float = 0.0
    
    montant_total: float = 0.0
    statut: str = "brouillon"
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    validated_at: Optional[datetime] = None
    validated_by: Optional[str] = None


# ==================== ROUTES (À ACTIVER) ====================

# Les routes ci-dessous sont des templates. Pour les activer:
# 1. Décommenter le code
# 2. S'assurer que les dépendances sont correctement importées

"""
@router.get("/{tenant_slug}/paie/parametres")
async def get_parametres_paie(tenant_slug: str, current_user: User = Depends(get_current_user)):
    # ... implementation
    pass

@router.put("/{tenant_slug}/paie/parametres")
async def update_parametres_paie(tenant_slug: str, params: ParametresPaie, current_user: User = Depends(get_current_user)):
    # ... implementation
    pass

@router.get("/{tenant_slug}/paie/feuilles-temps")
async def get_feuilles_temps(tenant_slug: str, annee: int = None, mois: int = None, current_user: User = Depends(get_current_user)):
    # ... implementation
    pass

@router.post("/{tenant_slug}/paie/feuilles-temps/generer")
async def generer_feuilles_temps(tenant_slug: str, data: dict, current_user: User = Depends(get_current_user)):
    # ... implementation
    pass

# ... autres routes
"""

# Note: Le code complet est dans server.py lignes 38375-41039
