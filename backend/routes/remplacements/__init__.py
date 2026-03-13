"""
Module Remplacements
====================

Structure modulaire pour la gestion des remplacements.

Organisation:
- models.py: Modèles Pydantic (DemandeRemplacement, ParametresRemplacements, etc.)
- utils.py: Fonctions utilitaires (calcul priorité, heures silencieuses, etc.)
- search.py: Logique de recherche de remplaçants
- notifications.py: Envoi d'emails, SMS, push
- workflow.py: Logique métier (accepter, refuser, relancer)
- crud.py: Opérations CRUD de base
- exports.py: Export PDF/Excel

Pour l'instant, le router principal est dans le fichier legacy remplacements.py
Ce module sera progressivement migré vers cette structure.
"""

# Les imports seront ajoutés au fur et à mesure de la migration
from .models import (
    DemandeRemplacement,
    DemandeRemplacementCreate,
    NotificationRemplacement,
    ParametresRemplacements,
    TentativeRemplacement
)

from .utils import (
    calculer_priorite_demande,
    est_dans_heures_silencieuses,
    calculer_prochaine_heure_active,
    formater_numero_telephone
)
