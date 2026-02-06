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
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'https://profiremanager.ca')


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
        
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">🔥 ProFireManager</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
                <h2 style="color: #1f2937;">Réinitialisation de mot de passe</h2>
                <p style="color: #4b5563;">
                    {f"Bonjour {user_name}," if user_name else "Bonjour,"}
                </p>
                <p style="color: #4b5563;">
                    Vous avez demandé la réinitialisation de votre mot de passe.
                    Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_link}" 
                       style="background: #dc2626; color: white; padding: 12px 30px; 
                              text-decoration: none; border-radius: 6px; font-weight: bold;">
                        Réinitialiser mon mot de passe
                    </a>
                </div>
                <p style="color: #6b7280; font-size: 14px;">
                    Ce lien expire dans 1 heure. Si vous n'avez pas demandé cette réinitialisation,
                    ignorez cet email.
                </p>
            </div>
            <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
                © {datetime.now().year} ProFireManager - Gestion des services d'incendie
            </div>
        </div>
        """
        
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
                          text-decoration: none; border-radius: 6px; font-weight: bold;">
                    {action_text}
                </a>
            </div>
            """
        
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">🔥 ProFireManager</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
                <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin-bottom: 20px;">
                    <strong style="color: #dc2626;">⚠️ {alert_type}</strong>
                </div>
                <h2 style="color: #1f2937;">{alert_title}</h2>
                <p style="color: #4b5563;">{alert_message}</p>
                {action_button}
            </div>
            <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
                © {datetime.now().year} ProFireManager
            </div>
        </div>
        """
        
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
        
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">🔥 ProFireManager</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
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
                              text-decoration: none; border-radius: 6px; font-weight: bold;">
                        Voir dans l'application
                    </a>
                </div>
            </div>
            <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
                © {datetime.now().year} ProFireManager
            </div>
        </div>
        """
        
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
        
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">🔥 ProFireManager</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
                <h2 style="color: {color};">{title}</h2>
                <p style="color: #4b5563;"><strong>Service:</strong> {tenant_name}</p>
                {amount_text}
                {f"<p style='color: #4b5563;'>{details}</p>" if details else ""}
            </div>
            <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
                © {datetime.now().year} ProFireManager
            </div>
        </div>
        """
        
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
        
        html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">🔥 ProFireManager</h1>
            </div>
            <div style="padding: 30px; background: #f9fafb;">
                <h2 style="color: #1f2937;">Rapport de ronde de sécurité</h2>
                <p style="color: #4b5563;">
                    <strong>Date:</strong> {ronde_info.get('date', '')}<br>
                    <strong>Agent:</strong> {agent_nom}<br>
                    <strong>Durée:</strong> {ronde_info.get('duree', 'N/A')}
                </p>
                {anomalies_html}
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{self.frontend_url}/{tenant_slug}/rondes" 
                       style="background: #dc2626; color: white; padding: 12px 30px; 
                              text-decoration: none; border-radius: 6px; font-weight: bold;">
                        Voir le rapport complet
                    </a>
                </div>
            </div>
            <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
                © {datetime.now().year} ProFireManager
            </div>
        </div>
        """
        
        subject = f"Rapport ronde - {len(anomalies)} anomalie(s)" if anomalies else "Rapport ronde - RAS"
        
        return await self.send_email(
            to=to_emails,
            subject=f"{subject} - ProFireManager",
            html=html,
            tags=[{"name": "type", "value": "ronde_securite"}, {"name": "tenant", "value": tenant_slug}]
        )


# Instance singleton
email_service = EmailService()
