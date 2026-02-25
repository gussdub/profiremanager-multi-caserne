"""
Service centralisé d'envoi d'emails
===================================

Ce service centralise toute la logique d'envoi d'emails via Resend API.
Utilisé par tous les modules : auth, notifications, alertes, facturation, etc.
"""
import os
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Configuration
RESEND_API_KEY = os.environ.get('RESEND_API_KEY')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca')
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')

# Logo officiel ProFireManager
LOGO_URL = "https://customer-assets.emergentagent.com/job_fireshift-manager/artifacts/6vh2i9cz_05_Icone_Flamme_Rouge_Bordure_D9072B_VISIBLE.png"


def generer_lien_app(
    tenant_slug: str,
    module: str,
    item_id: str = None,
    params: dict = None
) -> str:
    """
    Génère un lien intelligent vers l'application.
    
    Ces liens fonctionnent avec les Universal Links (iOS) et App Links (Android):
    - Sur ordinateur: ouvre le site web dans le module correspondant
    - Sur mobile avec l'app: ouvre directement l'app dans le bon module
    - Sur mobile sans l'app: ouvre le site web en fallback
    
    Args:
        tenant_slug: Slug du tenant
        module: Module cible (remplacements, planning, epi, etc.)
        item_id: ID optionnel d'un élément spécifique
        params: Paramètres additionnels en query string
    
    Returns:
        URL complète
    """
    base_url = os.environ.get('FRONTEND_URL', FRONTEND_URL)
    url = f"{base_url}/{tenant_slug}/{module}"
    
    query_parts = []
    if item_id:
        query_parts.append(f"id={item_id}")
    if params:
        for key, value in params.items():
            if value is not None:
                query_parts.append(f"{key}={value}")
    
    if query_parts:
        url += "?" + "&".join(query_parts)
    
    return url


def generer_bouton_email(
    url: str,
    texte: str,
    couleur: str = "#dc2626"
) -> str:
    """
    Génère un bouton HTML stylé pour les emails.
    
    Args:
        url: URL du lien (sera ouvert dans l'app si installée sur mobile)
        texte: Texte du bouton
        couleur: Couleur de fond (hex)
    
    Returns:
        HTML du bouton
    """
    return f'''
    <a href="{url}" 
       style="display: inline-block; background-color: {couleur}; color: white; 
              padding: 15px 30px; text-decoration: none; border-radius: 8px; 
              font-weight: bold; font-size: 16px; text-align: center;
              box-shadow: 0 2px 5px rgba(0,0,0,0.15);">
        {texte}
    </a>
    '''


def get_email_template(content: str, title: str = None) -> str:
    """
    Génère un template d'email uniforme avec le design ProFireManager.
    
    Args:
        content: Le contenu HTML du corps de l'email
        title: Titre optionnel affiché sous le logo
    
    Returns:
        Template HTML complet avec header et footer
    """
    title_html = f'<h2 style="color: #1f2937; margin-top: 10px;">{title}</h2>' if title else ''
    
    return f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
                <img src="{LOGO_URL}" 
                     alt="ProFireManager" 
                     width="60" 
                     height="60"
                     style="width: 60px; height: 60px; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;">
                <h1 style="color: #dc2626; margin: 0;">ProFireManager v2.0</h1>
                <p style="color: #666; margin: 5px 0;">Système de gestion des services d'incendie</p>
            </div>
            
            {title_html}
            {content}
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
            
            <div style="text-align: center; color: #9ca3af; font-size: 12px;">
                © {datetime.now().year} ProFireManager - Gestion des services d'incendie<br>
                <small>Cet email a été envoyé automatiquement par ProFireManager v2.0</small>
            </div>
        </div>
    </body>
    </html>
    """


class EmailService:
    """Service centralisé pour l'envoi d'emails"""
    
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not self._initialized:
            self.api_key = RESEND_API_KEY
            self.sender_email = SENDER_EMAIL
            self.frontend_url = FRONTEND_URL
            self._resend = None
            
            if self.api_key:
                try:
                    import resend
                    resend.api_key = self.api_key
                    self._resend = resend
                    logger.info("✅ EmailService initialisé avec Resend")
                except ImportError:
                    logger.error("❌ Module resend non installé")
            else:
                logger.warning("⚠️ RESEND_API_KEY non configurée - emails désactivés")
            
            self._initialized = True
    
    @property
    def is_configured(self) -> bool:
        """Vérifie si le service est correctement configuré"""
        return self._resend is not None and self.api_key is not None
    
    async def send_email(
        self,
        to: List[str],
        subject: str,
        html: str,
        from_email: Optional[str] = None,
        reply_to: Optional[str] = None,
        tags: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Envoie un email via Resend
        
        Args:
            to: Liste des destinataires
            subject: Sujet de l'email
            html: Contenu HTML de l'email
            from_email: Email expéditeur (optionnel, utilise SENDER_EMAIL par défaut)
            reply_to: Email de réponse (optionnel)
            tags: Tags pour le tracking (optionnel)
        
        Returns:
            Dict avec success, email_id ou error
        """
        if not self.is_configured:
            logger.error("EmailService non configuré - email non envoyé")
            return {"success": False, "error": "Service non configuré"}
        
        if not to:
            return {"success": False, "error": "Aucun destinataire"}
        
        try:
            params = {
                "from": from_email or f"ProFireManager <{self.sender_email}>",
                "to": to if isinstance(to, list) else [to],
                "subject": subject,
                "html": html
            }
            
            if reply_to:
                params["reply_to"] = reply_to
            
            if tags:
                params["tags"] = tags
            
            response = self._resend.Emails.send(params)
            
            email_id = response.get('id') if isinstance(response, dict) else getattr(response, 'id', None)
            
            logger.info(f"✅ Email envoyé: {subject} -> {to}")
            
            # Log email pour chaque destinataire
            try:
                from routes.emails_history import log_email_sent
                import asyncio
                for recipient in to:
                    asyncio.create_task(log_email_sent(
                        type_email="email_service",
                        destinataire_email=recipient,
                        sujet=subject
                    ))
            except Exception as log_err:
                logger.warning(f"Erreur log email: {log_err}")
            
            return {"success": True, "email_id": email_id}
            
        except Exception as e:
            logger.error(f"❌ Erreur envoi email: {str(e)}")
            return {"success": False, "error": str(e)}
    
    # ==================== TEMPLATES D'EMAILS ====================
    
    async def send_password_reset(
        self,
        to_email: str,
        reset_link: str,
        user_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Envoie un email de réinitialisation de mot de passe"""
        
        salutation = f"Bonjour {user_name}," if user_name else "Bonjour,"
        
        content = f"""
            <p style="color: #4b5563;">{salutation}</p>
            <p style="color: #4b5563;">
                Vous avez demandé la réinitialisation de votre mot de passe.
                Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe.
            </p>
            <div style="background: #fef3c7; border: 2px solid #fcd34d; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #92400e; margin-top: 0;">⚠️ IMPORTANT - Sécurité</h3>
                <p style="color: #92400e; margin: 10px 0;">
                    Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
                </p>
                <p style="color: #78350f; margin: 10px 0;">
                    Ce lien est valide pendant <strong>1 heure</strong> seulement.
                </p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
                <a href="{reset_link}" 
                   style="background: #dc2626; color: white; padding: 14px 28px; 
                          text-decoration: none; border-radius: 8px; font-weight: bold;">
                    🔐 Réinitialiser mon mot de passe
                </a>
            </div>
        """
        
        html = get_email_template(content, "Réinitialisation de mot de passe")
        
        return await self.send_email(
            to=[to_email],
            subject="Réinitialisation de votre mot de passe - ProFireManager",
            html=html,
            tags=[{"name": "type", "value": "password_reset"}]
        )
    
    async def send_alert_notification(
        self,
        to_emails: List[str],
        alert_type: str,
        alert_title: str,
        alert_message: str,
        action_url: Optional[str] = None,
        action_text: str = "Voir les détails"
    ) -> Dict[str, Any]:
        """Envoie une notification d'alerte générique"""
        
        action_button = ""
        if action_url:
            action_button = f"""
            <div style="text-align: center; margin: 30px 0;">
                <a href="{action_url}" 
                   style="background: #dc2626; color: white; padding: 12px 30px; 
                          text-decoration: none; border-radius: 8px; font-weight: bold;">
                    {action_text}
                </a>
            </div>
            """
        
        content = f"""
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin-bottom: 20px;">
                <strong style="color: #dc2626;">⚠️ {alert_type}</strong>
            </div>
            <p style="color: #4b5563;">{alert_message}</p>
            {action_button}
        """
        
        html = get_email_template(content, alert_title)
        
        return await self.send_email(
            to=to_emails,
            subject=f"[Alerte] {alert_title} - ProFireManager",
            html=html,
            tags=[{"name": "type", "value": "alert"}, {"name": "alert_type", "value": alert_type}]
        )
    
    async def send_inspection_defaut(
        self,
        to_emails: List[str],
        tenant_slug: str,
        borne_info: Dict[str, Any],
        inspection_info: Dict[str, Any],
        inspecteur_nom: str
    ) -> Dict[str, Any]:
        """Envoie une notification de défaut détecté lors d'une inspection"""
        
        defauts_list = ""
        defauts = inspection_info.get('defauts', [])
        if defauts:
            defauts_list = "<ul>" + "".join([f"<li style='color: #dc2626;'>{d}</li>" for d in defauts]) + "</ul>"
        
        content = f"""
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin-bottom: 20px;">
                <strong style="color: #dc2626;">⚠️ Défaut détecté lors d'une inspection</strong>
            </div>
            
            <h3 style="color: #1f2937;">Point d'eau: {borne_info.get('numero', 'N/A')}</h3>
            <p style="color: #4b5563;">
                <strong>Adresse:</strong> {borne_info.get('adresse', 'Non spécifiée')}<br>
                <strong>Type:</strong> {borne_info.get('type', 'Non spécifié')}<br>
                <strong>Inspecteur:</strong> {inspecteur_nom}<br>
                <strong>Date:</strong> {inspection_info.get('date', datetime.now().strftime('%Y-%m-%d %H:%M'))}
            </p>
            
            <h4 style="color: #dc2626;">Défauts constatés:</h4>
            {defauts_list or "<p>Voir les détails dans l'application</p>"}
            
            {f"<p><strong>Commentaires:</strong> {inspection_info.get('commentaires', '')}</p>" if inspection_info.get('commentaires') else ""}
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="{self.frontend_url}/{tenant_slug}/prevention" 
                       style="background: #dc2626; color: white; padding: 12px 30px; 
                              text-decoration: none; border-radius: 8px; font-weight: bold;">
                        Voir dans l'application
                    </a>
                </div>
        """
        
        html = get_email_template(content, f"Défaut - Point d'eau {borne_info.get('numero', 'N/A')}")
        
        return await self.send_email(
            to=to_emails,
            subject=f"[Défaut] Point d'eau {borne_info.get('numero', '')} - Inspection",
            html=html,
            tags=[{"name": "type", "value": "inspection_defaut"}, {"name": "tenant", "value": tenant_slug}]
        )
    
    async def send_billing_notification(
        self,
        to_email: str,
        notification_type: str,  # 'payment_success', 'payment_failed', 'subscription_cancelled'
        tenant_name: str,
        amount: Optional[float] = None,
        details: Optional[str] = None
    ) -> Dict[str, Any]:
        """Envoie une notification liée à la facturation"""
        
        titles = {
            'payment_success': 'Paiement reçu',
            'payment_failed': 'Échec de paiement',
            'subscription_cancelled': 'Abonnement annulé'
        }
        
        colors = {
            'payment_success': '#22c55e',
            'payment_failed': '#dc2626',
            'subscription_cancelled': '#f59e0b'
        }
        
        title = titles.get(notification_type, 'Notification')
        color = colors.get(notification_type, '#6b7280')
        
        amount_text = f"<p style='font-size: 24px; color: {color}; font-weight: bold;'>{amount:.2f} $</p>" if amount else ""
        
        content = f"""
            <p style="color: #4b5563;"><strong>Service:</strong> {tenant_name}</p>
            {amount_text}
            {f"<p style='color: #4b5563;'>{details}</p>" if details else ""}
        """
        
        html = get_email_template(content, title)
        
        return await self.send_email(
            to=[to_email],
            subject=f"{title} - {tenant_name} - ProFireManager",
            html=html,
            tags=[{"name": "type", "value": "billing"}, {"name": "billing_type", "value": notification_type}]
        )
    
    async def send_ronde_securite_rapport(
        self,
        to_emails: List[str],
        tenant_slug: str,
        ronde_info: Dict[str, Any],
        agent_nom: str,
        anomalies: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Envoie le rapport d'une ronde de sécurité"""
        
        anomalies_html = ""
        if anomalies:
            anomalies_items = ""
            for a in anomalies:
                anomalies_items += f"""
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{a.get('zone', 'N/A')}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{a.get('description', '')}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">{a.get('gravite', 'Moyenne')}</td>
                </tr>
                """
            anomalies_html = f"""
            <h3 style="color: #dc2626;">⚠️ Anomalies détectées ({len(anomalies)})</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <thead>
                    <tr style="background: #f3f4f6;">
                        <th style="padding: 8px; text-align: left;">Zone</th>
                        <th style="padding: 8px; text-align: left;">Description</th>
                        <th style="padding: 8px; text-align: left;">Gravité</th>
                    </tr>
                </thead>
                <tbody>{anomalies_items}</tbody>
            </table>
            """
        else:
            anomalies_html = "<p style='color: #22c55e;'>✅ Aucune anomalie détectée</p>"
        
        content = f"""
            <p style="color: #4b5563;">
                <strong>Date:</strong> {ronde_info.get('date', '')}<br>
                <strong>Agent:</strong> {agent_nom}<br>
                <strong>Durée:</strong> {ronde_info.get('duree', 'N/A')}
            </p>
            {anomalies_html}
            <div style="text-align: center; margin: 30px 0;">
                <a href="{self.frontend_url}/{tenant_slug}/rondes" 
                   style="background: #dc2626; color: white; padding: 12px 30px; 
                          text-decoration: none; border-radius: 8px; font-weight: bold;">
                    Voir le rapport complet
                </a>
            </div>
        """
        
        html = get_email_template(content, "Rapport de ronde de sécurité")
        
        subject = f"Rapport ronde - {len(anomalies)} anomalie(s)" if anomalies else "Rapport ronde - RAS"
        
        return await self.send_email(
            to=to_emails,
            subject=f"{subject} - ProFireManager",
            html=html,
            tags=[{"name": "type", "value": "ronde_securite"}, {"name": "tenant", "value": tenant_slug}]
        )


# Instance singleton
email_service = EmailService()


# ==================== FONCTIONS HELPER ====================

async def send_notification_email(
    to_email: str,
    subject: str,
    notification_titre: str,
    notification_message: str,
    notification_lien: Optional[str] = None,
    user_prenom: Optional[str] = None,
    tenant_slug: Optional[str] = None
) -> Dict[str, Any]:
    """
    Fonction helper pour envoyer un email de notification générique.
    Utilisée par creer_notification dans dependencies.py
    """
    service = EmailService()
    
    action_button = ""
    if notification_lien:
        # Construire l'URL complète si c'est un chemin relatif
        full_url = notification_lien
        if notification_lien.startswith('/'):
            # Ajouter le tenant_slug si disponible
            if tenant_slug:
                full_url = f"{service.frontend_url}/{tenant_slug}{notification_lien}"
            else:
                full_url = f"{service.frontend_url}{notification_lien}"
        
        action_button = f"""
        <div style="text-align: center; margin: 30px 0;">
            <a href="{full_url}" 
               style="background: #dc2626; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 6px; font-weight: bold;">
                Voir dans l'application
            </a>
        </div>
        """
    
    salutation = f"Bonjour {user_prenom}," if user_prenom else "Bonjour,"
    
    # Logo URL identique à celui de l'email de réinitialisation de mot de passe
    logo_url = "https://customer-assets.emergentagent.com/job_fireshift-manager/artifacts/6vh2i9cz_05_Icone_Flamme_Rouge_Bordure_D9072B_VISIBLE.png"
    
    html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
                <img src="{logo_url}" 
                     alt="ProFireManager" 
                     width="60" 
                     height="60"
                     style="width: 60px; height: 60px; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;">
                <h1 style="color: #dc2626; margin: 0;">ProFireManager v2.0</h1>
                <p style="color: #666; margin: 5px 0;">Système de gestion des services d'incendie</p>
            </div>
            
            <p style="color: #4b5563;">{salutation}</p>
            <h2 style="color: #1f2937; margin-top: 10px;">{notification_titre}</h2>
            <p style="color: #4b5563; line-height: 1.6;">{notification_message}</p>
            {action_button}
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
            
            <div style="text-align: center; color: #9ca3af; font-size: 12px;">
                © {datetime.now().year} ProFireManager - Gestion des services d'incendie<br>
                <small>Vous recevez cet email car vous avez activé les notifications par email.</small>
            </div>
        </div>
    </body>
    </html>
    """
    
    return await service.send_email(
        to=[to_email],
        subject=subject,
        html=html,
        tags=[{"name": "type", "value": "notification"}]
    )
