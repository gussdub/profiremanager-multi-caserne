"""
Fonctions de notification pour le module Remplacements
- Emails (Resend)
- SMS (Twilio)
- Push notifications

Ce module centralise toutes les fonctions d'envoi de notifications
pour les demandes de remplacement.
"""

from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
import uuid
import logging
import os
import re

logger = logging.getLogger(__name__)


def formater_numero_telephone(numero: str) -> Optional[str]:
    """
    Formate un numéro de téléphone au format E.164 (ex: +14185551234)
    Accepte plusieurs formats d'entrée.
    """
    if not numero:
        return None
    
    # Retirer tous les caractères non numériques sauf le +
    numero_clean = re.sub(r'[^\d+]', '', numero)
    
    # Si le numéro commence déjà par +, le retourner tel quel
    if numero_clean.startswith('+'):
        return numero_clean if len(numero_clean) >= 11 else None
    
    # Ajouter le préfixe +1 pour les numéros nord-américains (10 chiffres)
    if len(numero_clean) == 10:
        return f"+1{numero_clean}"
    
    # Si 11 chiffres commençant par 1, ajouter juste le +
    if len(numero_clean) == 11 and numero_clean.startswith('1'):
        return f"+{numero_clean}"
    
    return None


async def generer_token_remplacement(db, demande_id: str, remplacant_id: str, tenant_id: str) -> str:
    """Génère un token unique et temporaire pour accepter/refuser un remplacement par email"""
    token = str(uuid.uuid4())
    expiration = datetime.now(timezone.utc) + timedelta(hours=48)
    
    await db.tokens_remplacement.insert_one({
        "token": token,
        "demande_id": demande_id,
        "remplacant_id": remplacant_id,
        "tenant_id": tenant_id,
        "expiration": expiration.isoformat(),
        "utilise": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return token


async def envoyer_email_remplacement(
    db,
    demande_data: dict,
    remplacant: dict,
    demandeur: dict,
    type_garde: dict,
    tenant_id: str,
    token: str
) -> bool:
    """Envoie un email au remplaçant potentiel avec les boutons Accepter/Refuser"""
    try:
        import resend
        from routes.emails_history import log_email_sent
        
        resend_api_key = os.environ.get('RESEND_API_KEY')
        if not resend_api_key:
            logger.warning(f"RESEND_API_KEY non configurée - Email non envoyé")
            return False
        
        resend.api_key = resend_api_key
        
        remplacant_user = await db.users.find_one({"id": remplacant["user_id"]})
        if not remplacant_user or not remplacant_user.get("email"):
            logger.warning(f"Email non trouvé pour remplaçant {remplacant['user_id']}")
            return False
        
        # Vérifier les préférences de notification
        preferences = remplacant_user.get("preferences_notifications", {})
        if not preferences.get("email_actif", True):
            logger.info(f"📧 Email désactivé pour {remplacant_user.get('prenom')} - préférences utilisateur")
            return False
        
        # Récupérer le tenant pour le nom
        tenant = await db.tenants.find_one({"id": tenant_id})
        tenant_nom = tenant.get("nom", "ProFireManager") if tenant else "ProFireManager"
        
        remplacant_prenom = remplacant_user.get("prenom", "")
        demandeur_nom = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}"
        type_garde_nom = type_garde.get("nom", "Garde") if type_garde else "Garde"
        date_garde = demande_data.get("date", "")
        heure_debut = type_garde.get("heure_debut", "") if type_garde else ""
        heure_fin = type_garde.get("heure_fin", "") if type_garde else ""
        raison = demande_data.get("raison", "Non spécifiée")
        
        sender_email = os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca')
        backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://www.profiremanager.ca')
        
        lien_accepter = f"{backend_url}/api/remplacement-action/{token}/accepter"
        lien_refuser = f"{backend_url}/api/remplacement-action/{token}/refuser"
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
                .header h1 {{ margin: 0; font-size: 24px; }}
                .content {{ background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }}
                .details {{ background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; }}
                .details-row {{ display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }}
                .details-row:last-child {{ border-bottom: none; }}
                .details-label {{ color: #6B7280; }}
                .details-value {{ font-weight: 600; color: #111827; }}
                .buttons {{ text-align: center; margin: 30px 0; }}
                .btn {{ display: inline-block; padding: 14px 30px; text-decoration: none; border-radius: 8px; margin: 0 10px; font-weight: 600; }}
                .btn-accept {{ background-color: #10B981; color: white; }}
                .btn-refuse {{ background-color: #EF4444; color: white; }}
                .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🚒 Demande de remplacement</h1>
                </div>
                <div class="content">
                    <p>Bonjour {remplacant_prenom},</p>
                    <p><strong>{demandeur_nom}</strong> vous sollicite pour un remplacement.</p>
                    
                    <div class="details">
                        <div class="details-row">
                            <span class="details-label">📅 Date:</span>
                            <span class="details-value">{date_garde}</span>
                        </div>
                        <div class="details-row">
                            <span class="details-label">⏰ Horaire:</span>
                            <span class="details-value">{heure_debut} - {heure_fin}</span>
                        </div>
                        <div class="details-row">
                            <span class="details-label">🚒 Type:</span>
                            <span class="details-value">{type_garde_nom}</span>
                        </div>
                        <div class="details-row">
                            <span class="details-label">📝 Raison:</span>
                            <span class="details-value">{raison}</span>
                        </div>
                    </div>
                    
                    <div class="buttons">
                        <a href="{lien_accepter}" class="btn btn-accept">✅ Accepter</a>
                        <a href="{lien_refuser}" class="btn btn-refuse">❌ Refuser</a>
                    </div>
                    
                    <p style="color: #6B7280; font-size: 0.9rem;">Ce lien expire dans 48 heures.</p>
                    
                    <p>Cordialement,<br>L'équipe {tenant_nom}</p>
                </div>
                <div class="footer">
                    <p>Ceci est un message automatique. Merci de ne pas y répondre.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        params = {
            "from": f"{tenant_nom} <{sender_email}>",
            "to": [remplacant_user["email"]],
            "subject": f"🚒 Demande de remplacement le {date_garde}",
            "html": html_content
        }
        
        response = resend.Emails.send(params)
        logger.info(f"✅ Email remplacement envoyé à {remplacant_user['email']} (ID: {response.get('id', 'N/A')})")
        
        # Logger l'email
        try:
            await log_email_sent(
                tenant_id=tenant_id,
                destinataire=remplacant_user["email"],
                sujet=f"🚒 Demande de remplacement le {date_garde}",
                type_email="demande_remplacement",
                statut="sent",
                metadata={
                    "demande_id": demande_data.get("id"),
                    "remplacant_id": remplacant.get("user_id"),
                    "token": token
                }
            )
        except Exception as log_error:
            logger.warning(f"⚠️ Erreur log email: {log_error}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur envoi email remplacement: {e}", exc_info=True)
        return False


async def envoyer_email_remplacement_trouve(
    db,
    demande_data: dict,
    remplacant: dict,
    demandeur: dict,
    type_garde: dict,
    tenant: dict
) -> bool:
    """Envoie un email au demandeur pour l'informer qu'un remplaçant a été trouvé"""
    try:
        import resend
        from routes.emails_history import log_email_sent
        
        resend_api_key = os.environ.get('RESEND_API_KEY')
        if not resend_api_key:
            logger.warning(f"RESEND_API_KEY non configurée - Email non envoyé")
            return False
        
        resend.api_key = resend_api_key
        
        demandeur_email = demandeur.get("email")
        if not demandeur_email:
            logger.warning(f"Email non trouvé pour demandeur {demandeur.get('id')}")
            return False
        
        # Vérifier les préférences de notification
        preferences = demandeur.get("preferences_notifications", {})
        if not preferences.get("email_actif", True):
            logger.info(f"📧 Email désactivé pour {demandeur.get('prenom')} - préférences utilisateur")
            return False
        
        demandeur_prenom = demandeur.get("prenom", "")
        remplacant_nom = f"{remplacant.get('prenom', '')} {remplacant.get('nom', '')}"
        type_garde_nom = type_garde.get("nom", "Garde") if type_garde else "Garde"
        date_garde = demande_data.get("date", "")
        tenant_nom = tenant.get("nom", "ProFireManager")
        
        sender_email = os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca')
        frontend_url = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
                .header h1 {{ margin: 0; font-size: 24px; }}
                .content {{ background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }}
                .success-box {{ background-color: #D1FAE5; border: 1px solid #10B981; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }}
                .success-box .icon {{ font-size: 48px; margin-bottom: 10px; }}
                .details {{ background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; }}
                .details-row {{ display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }}
                .details-row:last-child {{ border-bottom: none; }}
                .details-label {{ color: #6B7280; }}
                .details-value {{ font-weight: 600; color: #111827; }}
                .btn {{ display: inline-block; background-color: #10B981; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; margin-top: 20px; font-weight: 600; }}
                .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✅ Remplaçant trouvé!</h1>
                </div>
                <div class="content">
                    <p>Bonjour {demandeur_prenom},</p>
                    
                    <div class="success-box">
                        <div class="icon">🎉</div>
                        <strong style="font-size: 18px; color: #059669;">Bonne nouvelle!</strong>
                        <p style="margin: 10px 0 0 0; color: #065F46;">
                            <strong>{remplacant_nom}</strong> a accepté de vous remplacer.
                        </p>
                    </div>
                    
                    <div class="details">
                        <div class="details-row">
                            <span class="details-label">📅 Date:</span>
                            <span class="details-value">{date_garde}</span>
                        </div>
                        <div class="details-row">
                            <span class="details-label">🚒 Type de garde:</span>
                            <span class="details-value">{type_garde_nom}</span>
                        </div>
                        <div class="details-row">
                            <span class="details-label">👤 Remplaçant:</span>
                            <span class="details-value">{remplacant_nom}</span>
                        </div>
                    </div>
                    
                    <p>Votre demande de remplacement a été traitée avec succès. Le planning a été mis à jour automatiquement.</p>
                    
                    <center>
                        <a href="{frontend_url}/remplacements" class="btn">Voir mes remplacements</a>
                    </center>
                    
                    <p style="margin-top: 30px;">Cordialement,<br>L'équipe {tenant_nom}</p>
                </div>
                <div class="footer">
                    <p>Ceci est un message automatique. Merci de ne pas y répondre.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        params = {
            "from": f"{tenant_nom} <{sender_email}>",
            "to": [demandeur_email],
            "subject": f"✅ Remplaçant trouvé pour le {date_garde}",
            "html": html_content
        }
        
        response = resend.Emails.send(params)
        logger.info(f"✅ Email 'remplacement trouvé' envoyé à {demandeur_email} (ID: {response.get('id', 'N/A')})")
        
        # Logger l'email
        try:
            await log_email_sent(
                tenant_id=tenant.get("id"),
                destinataire=demandeur_email,
                sujet=f"✅ Remplaçant trouvé pour le {date_garde}",
                type_email="remplacement_trouve",
                statut="sent",
                metadata={
                    "demande_id": demande_data.get("id"),
                    "remplacant_id": remplacant.get("id"),
                    "demandeur_id": demandeur.get("id"),
                    "date_garde": date_garde
                }
            )
        except Exception as log_error:
            logger.warning(f"⚠️ Erreur log email: {log_error}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur envoi email 'remplacement trouvé': {e}", exc_info=True)
        return False


async def envoyer_email_remplacement_non_trouve(
    db,
    demande_data: dict,
    demandeur: dict,
    type_garde: dict,
    tenant: dict
) -> bool:
    """Envoie un email au demandeur pour l'informer qu'aucun remplaçant n'a été trouvé"""
    try:
        import resend
        from routes.emails_history import log_email_sent
        
        resend_api_key = os.environ.get('RESEND_API_KEY')
        if not resend_api_key:
            logger.warning(f"RESEND_API_KEY non configurée - Email non envoyé")
            return False
        
        resend.api_key = resend_api_key
        
        demandeur_email = demandeur.get("email")
        if not demandeur_email:
            logger.warning(f"Email non trouvé pour demandeur {demandeur.get('id')}")
            return False
        
        # Vérifier les préférences de notification
        preferences = demandeur.get("preferences_notifications", {})
        if not preferences.get("email_actif", True):
            logger.info(f"📧 Email désactivé pour {demandeur.get('prenom')} - préférences utilisateur")
            return False
        
        demandeur_prenom = demandeur.get("prenom", "")
        type_garde_nom = type_garde.get("nom", "Garde") if type_garde else "Garde"
        date_garde = demande_data.get("date", "")
        tenant_nom = tenant.get("nom", "ProFireManager")
        
        sender_email = os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca')
        frontend_url = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
                .header h1 {{ margin: 0; font-size: 24px; }}
                .content {{ background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }}
                .alert-box {{ background-color: #FEE2E2; border: 1px solid #EF4444; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }}
                .alert-box .icon {{ font-size: 48px; margin-bottom: 10px; }}
                .details {{ background-color: white; border-radius: 8px; padding: 20px; margin: 20px 0; }}
                .details-row {{ display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }}
                .details-row:last-child {{ border-bottom: none; }}
                .details-label {{ color: #6B7280; }}
                .details-value {{ font-weight: 600; color: #111827; }}
                .action-box {{ background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 15px; margin: 20px 0; }}
                .btn {{ display: inline-block; background-color: #DC2626; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; margin-top: 20px; font-weight: 600; }}
                .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>❌ Aucun remplaçant trouvé</h1>
                </div>
                <div class="content">
                    <p>Bonjour {demandeur_prenom},</p>
                    
                    <div class="alert-box">
                        <div class="icon">😔</div>
                        <strong style="font-size: 18px; color: #DC2626;">Demande expirée</strong>
                        <p style="margin: 10px 0 0 0; color: #991B1B;">
                            Malheureusement, aucun remplaçant n'a pu être trouvé pour votre demande.
                        </p>
                    </div>
                    
                    <div class="details">
                        <div class="details-row">
                            <span class="details-label">📅 Date:</span>
                            <span class="details-value">{date_garde}</span>
                        </div>
                        <div class="details-row">
                            <span class="details-label">🚒 Type de garde:</span>
                            <span class="details-value">{type_garde_nom}</span>
                        </div>
                        <div class="details-row">
                            <span class="details-label">📊 Statut:</span>
                            <span class="details-value" style="color: #DC2626;">Expirée - Aucun remplaçant</span>
                        </div>
                    </div>
                    
                    <div class="action-box">
                        <strong>⚠️ Action requise</strong>
                        <p style="margin: 10px 0 0 0;">
                            Veuillez contacter votre superviseur pour trouver une solution alternative.
                        </p>
                    </div>
                    
                    <center>
                        <a href="{frontend_url}/remplacements" class="btn">Voir mes demandes</a>
                    </center>
                    
                    <p style="margin-top: 30px;">Cordialement,<br>L'équipe {tenant_nom}</p>
                </div>
                <div class="footer">
                    <p>Ceci est un message automatique. Merci de ne pas y répondre.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        params = {
            "from": f"{tenant_nom} <{sender_email}>",
            "to": [demandeur_email],
            "subject": f"❌ Aucun remplaçant trouvé pour le {date_garde}",
            "html": html_content
        }
        
        response = resend.Emails.send(params)
        logger.info(f"✅ Email 'remplacement non trouvé' envoyé à {demandeur_email} (ID: {response.get('id', 'N/A')})")
        
        # Logger l'email
        try:
            await log_email_sent(
                tenant_id=tenant.get("id"),
                destinataire=demandeur_email,
                sujet=f"❌ Aucun remplaçant trouvé pour le {date_garde}",
                type_email="remplacement_non_trouve",
                statut="sent",
                metadata={
                    "demande_id": demande_data.get("id"),
                    "demandeur_id": demandeur.get("id"),
                    "date_garde": date_garde
                }
            )
        except Exception as log_error:
            logger.warning(f"⚠️ Erreur log email: {log_error}")
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur envoi email 'remplacement non trouvé': {e}", exc_info=True)
        return False


async def envoyer_sms_remplacement(
    db,
    remplacant: Dict[str, Any],
    demande_data: Dict[str, Any],
    demandeur: Dict[str, Any],
    type_garde: Dict[str, Any],
    tenant_id: str,
    token: str
) -> bool:
    """Envoie un SMS au remplaçant potentiel avec un lien pour accepter/refuser"""
    try:
        from twilio.rest import Client
        
        # Récupérer les credentials Twilio depuis les variables d'environnement
        account_sid = os.environ.get('TWILIO_ACCOUNT_SID')
        auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
        twilio_phone = os.environ.get('TWILIO_PHONE_NUMBER')
        
        if not all([account_sid, auth_token, twilio_phone]):
            logger.warning("⚠️ Configuration Twilio incomplète - SMS non envoyé")
            return False
        
        # Récupérer les infos du remplaçant
        remplacant_user = await db.users.find_one({"id": remplacant["user_id"]})
        if not remplacant_user:
            logger.warning(f"Utilisateur non trouvé: {remplacant['user_id']}")
            return False
        
        # Vérifier les préférences de notification
        preferences = remplacant_user.get("preferences_notifications", {})
        if not preferences.get("sms_actif", True):
            logger.info(f"📵 SMS désactivé pour {remplacant_user.get('prenom')} - préférences utilisateur")
            return False
        
        # Récupérer et formater le numéro de téléphone
        telephone = remplacant_user.get("telephone", "")
        if not telephone:
            logger.warning(f"Pas de téléphone pour {remplacant_user.get('prenom')} {remplacant_user.get('nom')}")
            return False
        
        # Formater le numéro au format E.164 si nécessaire
        telephone_formate = formater_numero_telephone(telephone)
        if not telephone_formate:
            logger.warning(f"Numéro de téléphone invalide: {telephone}")
            return False
        
        # Préparer le message
        demandeur_nom = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}"
        type_garde_nom = type_garde.get("nom", "Garde")
        date_garde = demande_data.get("date", "")
        heure_debut = type_garde.get("heure_debut", "")
        heure_fin = type_garde.get("heure_fin", "")
        
        backend_url = os.environ.get('REACT_APP_BACKEND_URL', 'https://www.profiremanager.ca')
        lien_reponse = f"{backend_url}/api/remplacement-action/{token}/choix"
        
        message = (
            f"🚨 ProFireManager: {demandeur_nom} cherche un remplaçant le {date_garde} "
            f"({type_garde_nom} {heure_debut}-{heure_fin}). "
            f"Répondez ici: {lien_reponse}"
        )
        
        # Envoyer le SMS via Twilio
        client = Client(account_sid, auth_token)
        
        sms = client.messages.create(
            body=message,
            from_=twilio_phone,
            to=telephone_formate
        )
        
        logger.info(f"✅ SMS envoyé à {telephone_formate} (SID: {sms.sid})")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur envoi SMS remplacement: {e}", exc_info=True)
        return False
