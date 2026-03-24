"""
Fonctions utilitaires pour le module Remplacements
"""

from datetime import datetime, timezone, timedelta
import logging

logger = logging.getLogger(__name__)


async def calculer_priorite_demande(date_garde: str) -> str:
    """
    Calcule la priorité d'une demande de remplacement selon le délai avant la garde.
    - urgent: < 24h
    - haute: 24h à 48h
    - normal: 48h à 7 jours
    - faible: > 7 jours
    """
    try:
        date_garde_obj = datetime.strptime(date_garde, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        maintenant = datetime.now(timezone.utc)
        delta = date_garde_obj - maintenant
        heures = delta.total_seconds() / 3600
        
        if heures <= 24:
            return "urgent"
        elif heures <= 48:
            return "haute"
        elif heures <= 168:  # 7 jours
            return "normal"
        else:
            return "faible"
    except Exception as e:
        logger.error(f"Erreur calcul priorité: {e}")
        return "normal"


def est_dans_heures_silencieuses(heure_debut: str, heure_fin: str) -> bool:
    """
    Vérifie si l'heure actuelle (fuseau Montréal) est dans la plage des heures silencieuses.
    Gère les plages qui passent minuit (ex: 21:00 - 07:00)
    
    Args:
        heure_debut: Heure de début du silence (ex: "21:00")
        heure_fin: Heure de fin du silence (ex: "07:00")
    
    Returns:
        True si on est dans les heures silencieuses
    """
    try:
        import pytz
        
        # Obtenir l'heure actuelle à Montréal
        montreal_tz = pytz.timezone('America/Montreal')
        maintenant_montreal = datetime.now(montreal_tz)
        heure_actuelle = maintenant_montreal.hour * 60 + maintenant_montreal.minute
        
        # Parser les heures de début et fin
        debut_parts = heure_debut.split(":")
        fin_parts = heure_fin.split(":")
        debut_minutes = int(debut_parts[0]) * 60 + int(debut_parts[1])
        fin_minutes = int(fin_parts[0]) * 60 + int(fin_parts[1])
        
        # Cas où la plage passe minuit (ex: 21:00 - 07:00)
        if debut_minutes > fin_minutes:
            # On est en silence si: heure >= début OU heure < fin
            return heure_actuelle >= debut_minutes or heure_actuelle < fin_minutes
        else:
            # Cas normal (ex: 01:00 - 05:00)
            return debut_minutes <= heure_actuelle < fin_minutes
            
    except Exception as e:
        logger.error(f"Erreur vérification heures silencieuses: {e}")
        return False


def calculer_prochaine_heure_active(heure_fin_silence: str) -> datetime:
    """
    Calcule la prochaine heure où les contacts peuvent reprendre (fin des heures silencieuses).
    Retourne un datetime en UTC.
    """
    try:
        import pytz
        
        montreal_tz = pytz.timezone('America/Montreal')
        maintenant_montreal = datetime.now(montreal_tz)
        
        # Parser l'heure de fin
        fin_parts = heure_fin_silence.split(":")
        heure_fin = int(fin_parts[0])
        minute_fin = int(fin_parts[1])
        
        # Créer la prochaine occurrence de cette heure
        prochaine_reprise = maintenant_montreal.replace(
            hour=heure_fin, 
            minute=minute_fin, 
            second=0, 
            microsecond=0
        )
        
        # Si cette heure est déjà passée aujourd'hui, c'est demain
        if prochaine_reprise <= maintenant_montreal:
            prochaine_reprise += timedelta(days=1)
        
        # Convertir en UTC
        return prochaine_reprise.astimezone(timezone.utc)
        
    except Exception as e:
        logger.error(f"Erreur calcul prochaine heure active: {e}")
        # Fallback: demain à 7h UTC
        return datetime.now(timezone.utc).replace(hour=7, minute=0, second=0) + timedelta(days=1)


def formater_numero_telephone(numero: str) -> str:
    """
    Formate un numéro de téléphone au format E.164 pour Twilio (+1XXXXXXXXXX)
    Gère les formats canadiens/américains
    """
    if not numero:
        return None
        
    # Nettoyer le numéro (enlever espaces, tirets, parenthèses, etc.)
    numero_clean = ''.join(filter(str.isdigit, numero))
    
    # Si le numéro commence par 1 et a 11 chiffres, ajouter le +
    if len(numero_clean) == 11 and numero_clean.startswith('1'):
        return f"+{numero_clean}"
    
    # Si le numéro a 10 chiffres, ajouter +1
    if len(numero_clean) == 10:
        return f"+1{numero_clean}"
    
    # Sinon, retourner tel quel avec +
    if not numero_clean.startswith('+'):
        return f"+{numero_clean}"
    
    return numero_clean
