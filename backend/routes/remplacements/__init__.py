"""
Module Remplacements
====================

Structure modulaire pour la gestion des remplacements.

Organisation:
- models.py: Modèles Pydantic (DemandeRemplacement, ParametresRemplacements, etc.)
- utils.py: Fonctions utilitaires (calcul priorité, heures silencieuses, etc.)
- notifications.py: Envoi d'emails, SMS (Resend, Twilio)
- search.py: Logique de recherche de remplaçants (TODO: migration en cours)
- workflow.py: Logique métier (accepter, refuser, relancer) - TODO
- crud.py: Opérations CRUD de base - TODO
- exports.py: Export PDF/Excel - TODO

Le router principal est dans remplacements_routes.py
Ce module est progressivement migré vers cette structure modulaire.
"""

# Import des modèles
from .models import (
    DemandeRemplacement,
    DemandeRemplacementCreate,
    NotificationRemplacement,
    ParametresRemplacements,
    TentativeRemplacement
)

# Import des utilitaires
from .utils import (
    calculer_priorite_demande,
    est_dans_heures_silencieuses,
    calculer_prochaine_heure_active,
    formater_numero_telephone
)

# Import des fonctions de notification
from .notifications import (
    generer_token_remplacement,
    envoyer_email_remplacement,
    envoyer_sms_remplacement
)
