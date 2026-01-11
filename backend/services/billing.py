"""
Service de facturation Stripe pour ProFireManager
Gestion des abonnements par tenant avec tarification par palier
"""

import stripe
import os
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field
import uuid

# Configuration Stripe
stripe.api_key = os.environ.get('STRIPE_API_KEY', 'sk_test_emergent')

# ==================== CONFIGURATION TARIFICATION ====================

# Tarification par palier (prix par utilisateur/mois en CAD)
PRICING_TIERS = [
    {"min": 1, "max": 30, "price_per_user": 12.00},
    {"min": 31, "max": 50, "price_per_user": 10.00},
    {"min": 51, "max": 999, "price_per_user": 9.00},
]

# Module Prévention (supplément par utilisateur/mois)
PREVENTION_MODULE_PRICE = 3.00

# Rabais annuel
ANNUAL_DISCOUNT_PERCENT = 10

# Offre de lancement (valide jusqu'au 31 mars 2026)
LAUNCH_OFFER = {
    "active": True,
    "discount_percent": 30,
    "discount_months": 3,
    "valid_until": "2026-03-31",
    "training_value": 400.00
}

# Devise
CURRENCY = "cad"


# ==================== MODELS ====================

class SubscriptionPlan(BaseModel):
    """Plan d'abonnement calculé pour un tenant"""
    tenant_id: str
    tenant_name: str
    user_count: int
    tier_price_per_user: float
    base_monthly_cost: float
    prevention_module: bool = False
    prevention_monthly_cost: float = 0.0
    total_monthly_cost: float
    annual_cost: float  # Avec rabais 10%
    billing_cycle: str = "monthly"  # monthly ou annual


class BillingRecord(BaseModel):
    """Enregistrement de facturation"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    stripe_price_id: Optional[str] = None
    status: str = "inactive"  # inactive, active, past_due, cancelled, trial
    billing_cycle: str = "monthly"
    user_count: int = 0
    prevention_module: bool = False
    monthly_amount: float = 0.0
    next_billing_date: Optional[str] = None
    last_payment_date: Optional[str] = None
    last_payment_amount: Optional[float] = None
    launch_offer_applied: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PaymentTransaction(BaseModel):
    """Transaction de paiement"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    stripe_session_id: Optional[str] = None
    stripe_invoice_id: Optional[str] = None
    stripe_payment_intent_id: Optional[str] = None
    amount: float
    currency: str = "cad"
    status: str = "pending"  # pending, paid, failed, refunded
    description: str = ""
    invoice_url: Optional[str] = None
    invoice_pdf_url: Optional[str] = None
    metadata: Dict[str, Any] = {}
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== FONCTIONS UTILITAIRES ====================

def get_tier_price(user_count: int) -> float:
    """Obtient le prix par utilisateur selon le palier"""
    for tier in PRICING_TIERS:
        if tier["min"] <= user_count <= tier["max"]:
            return tier["price_per_user"]
    # Si plus de 999 utilisateurs, utiliser le dernier palier
    return PRICING_TIERS[-1]["price_per_user"]


def calculate_subscription_cost(
    user_count: int,
    prevention_module: bool = False,
    billing_cycle: str = "monthly"
) -> Dict[str, Any]:
    """
    Calcule le coût d'abonnement pour un nombre d'utilisateurs donné
    
    Returns:
        Dict avec tous les détails de tarification
    """
    tier_price = get_tier_price(user_count)
    base_monthly = user_count * tier_price
    
    prevention_cost = 0.0
    if prevention_module:
        prevention_cost = user_count * PREVENTION_MODULE_PRICE
    
    total_monthly = base_monthly + prevention_cost
    
    # Calcul annuel avec rabais
    annual_cost = total_monthly * 12 * (1 - ANNUAL_DISCOUNT_PERCENT / 100)
    
    # Si facturation annuelle
    if billing_cycle == "annual":
        effective_monthly = annual_cost / 12
    else:
        effective_monthly = total_monthly
    
    return {
        "user_count": user_count,
        "tier_price_per_user": tier_price,
        "base_monthly_cost": base_monthly,
        "prevention_module": prevention_module,
        "prevention_monthly_cost": prevention_cost,
        "total_monthly_cost": total_monthly,
        "annual_cost": annual_cost,
        "billing_cycle": billing_cycle,
        "effective_monthly_cost": effective_monthly,
        "annual_savings": (total_monthly * 12) - annual_cost if billing_cycle == "annual" else 0
    }


def is_launch_offer_valid() -> bool:
    """Vérifie si l'offre de lancement est encore valide"""
    if not LAUNCH_OFFER["active"]:
        return False
    valid_until = datetime.strptime(LAUNCH_OFFER["valid_until"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) <= valid_until


# ==================== FONCTIONS STRIPE ====================

async def create_stripe_customer(
    tenant_id: str,
    tenant_name: str,
    email: str,
    metadata: Dict[str, Any] = None
) -> Dict[str, Any]:
    """Crée un client Stripe pour un tenant"""
    try:
        customer = stripe.Customer.create(
            name=tenant_name,
            email=email,
            metadata={
                "tenant_id": tenant_id,
                "tenant_name": tenant_name,
                **(metadata or {})
            }
        )
        logging.info(f"✅ Client Stripe créé: {customer.id} pour tenant {tenant_id}")
        return {"success": True, "customer_id": customer.id, "customer": customer}
    except stripe.error.StripeError as e:
        logging.error(f"❌ Erreur création client Stripe: {e}")
        return {"success": False, "error": str(e)}


async def create_subscription(
    customer_id: str,
    tenant_id: str,
    user_count: int,
    prevention_module: bool = False,
    billing_cycle: str = "monthly",
    apply_launch_offer: bool = False
) -> Dict[str, Any]:
    """
    Crée un abonnement Stripe pour un tenant
    
    Utilise la tarification "metered" pour permettre les changements de quantité
    """
    try:
        # Calculer le coût
        pricing = calculate_subscription_cost(user_count, prevention_module, billing_cycle)
        
        # Créer un prix dynamique (ou utiliser un prix existant)
        # Note: En production, vous créeriez des Products/Prices dans Stripe Dashboard
        unit_amount = int(pricing["tier_price_per_user"] * 100)  # En centimes
        
        if prevention_module:
            unit_amount += int(PREVENTION_MODULE_PRICE * 100)
        
        # Créer le prix
        interval = "month" if billing_cycle == "monthly" else "year"
        
        price = stripe.Price.create(
            unit_amount=unit_amount,
            currency=CURRENCY,
            recurring={"interval": interval},
            product_data={
                "name": f"ProFireManager - {billing_cycle.capitalize()}",
                "metadata": {"tenant_id": tenant_id}
            }
        )
        
        # Paramètres de l'abonnement
        subscription_params = {
            "customer": customer_id,
            "items": [{"price": price.id, "quantity": user_count}],
            "metadata": {
                "tenant_id": tenant_id,
                "user_count": str(user_count),
                "prevention_module": str(prevention_module),
                "billing_cycle": billing_cycle
            },
            "payment_behavior": "default_incomplete",
            "expand": ["latest_invoice.payment_intent"]
        }
        
        # Appliquer l'offre de lancement si valide
        if apply_launch_offer and is_launch_offer_valid():
            # Créer un coupon pour les 3 premiers mois
            coupon = stripe.Coupon.create(
                percent_off=LAUNCH_OFFER["discount_percent"],
                duration="repeating",
                duration_in_months=LAUNCH_OFFER["discount_months"],
                metadata={"type": "launch_offer", "tenant_id": tenant_id}
            )
            subscription_params["coupon"] = coupon.id
        
        subscription = stripe.Subscription.create(**subscription_params)
        
        logging.info(f"✅ Abonnement Stripe créé: {subscription.id} pour tenant {tenant_id}")
        
        return {
            "success": True,
            "subscription_id": subscription.id,
            "subscription": subscription,
            "client_secret": subscription.latest_invoice.payment_intent.client_secret if subscription.latest_invoice else None,
            "pricing": pricing
        }
        
    except stripe.error.StripeError as e:
        logging.error(f"❌ Erreur création abonnement Stripe: {e}")
        return {"success": False, "error": str(e)}


async def update_subscription_quantity(
    subscription_id: str,
    new_user_count: int
) -> Dict[str, Any]:
    """Met à jour le nombre d'utilisateurs d'un abonnement"""
    try:
        subscription = stripe.Subscription.retrieve(subscription_id)
        
        # Mettre à jour la quantité du premier item
        stripe.Subscription.modify(
            subscription_id,
            items=[{
                "id": subscription["items"]["data"][0].id,
                "quantity": new_user_count
            }],
            proration_behavior="create_prorations",
            metadata={"user_count": str(new_user_count)}
        )
        
        logging.info(f"✅ Quantité mise à jour: {subscription_id} -> {new_user_count} utilisateurs")
        return {"success": True, "new_quantity": new_user_count}
        
    except stripe.error.StripeError as e:
        logging.error(f"❌ Erreur mise à jour quantité: {e}")
        return {"success": False, "error": str(e)}


async def cancel_subscription(subscription_id: str, immediate: bool = False) -> Dict[str, Any]:
    """Annule un abonnement"""
    try:
        if immediate:
            subscription = stripe.Subscription.cancel(subscription_id)
        else:
            subscription = stripe.Subscription.modify(
                subscription_id,
                cancel_at_period_end=True
            )
        
        logging.info(f"✅ Abonnement annulé: {subscription_id}")
        return {"success": True, "subscription": subscription}
        
    except stripe.error.StripeError as e:
        logging.error(f"❌ Erreur annulation abonnement: {e}")
        return {"success": False, "error": str(e)}


async def create_billing_portal_session(
    customer_id: str,
    return_url: str
) -> Dict[str, Any]:
    """Crée une session du portail de facturation client"""
    try:
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url
        )
        
        return {"success": True, "url": session.url}
        
    except stripe.error.StripeError as e:
        logging.error(f"❌ Erreur création portail: {e}")
        return {"success": False, "error": str(e)}


async def get_customer_invoices(customer_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Récupère les factures d'un client"""
    try:
        invoices = stripe.Invoice.list(customer=customer_id, limit=limit)
        
        return [{
            "id": inv.id,
            "number": inv.number,
            "amount_due": inv.amount_due / 100,
            "amount_paid": inv.amount_paid / 100,
            "currency": inv.currency,
            "status": inv.status,
            "created": datetime.fromtimestamp(inv.created).isoformat(),
            "due_date": datetime.fromtimestamp(inv.due_date).isoformat() if inv.due_date else None,
            "invoice_pdf": inv.invoice_pdf,
            "hosted_invoice_url": inv.hosted_invoice_url
        } for inv in invoices.data]
        
    except stripe.error.StripeError as e:
        logging.error(f"❌ Erreur récupération factures: {e}")
        return []


async def handle_webhook_event(payload: bytes, sig_header: str, webhook_secret: str) -> Dict[str, Any]:
    """
    Traite les événements webhook de Stripe
    
    Événements importants:
    - invoice.paid: Facture payée
    - invoice.payment_failed: Échec de paiement
    - customer.subscription.updated: Abonnement mis à jour
    - customer.subscription.deleted: Abonnement supprimé
    """
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
        
        event_type = event["type"]
        data = event["data"]["object"]
        
        logging.info(f"📥 Webhook Stripe reçu: {event_type}")
        
        result = {
            "event_type": event_type,
            "event_id": event["id"],
            "processed": True,
            "data": {}
        }
        
        if event_type == "invoice.paid":
            result["data"] = {
                "invoice_id": data["id"],
                "customer_id": data["customer"],
                "amount_paid": data["amount_paid"] / 100,
                "subscription_id": data.get("subscription"),
                "invoice_pdf": data.get("invoice_pdf"),
                "tenant_id": data.get("metadata", {}).get("tenant_id")
            }
            
        elif event_type == "invoice.payment_failed":
            result["data"] = {
                "invoice_id": data["id"],
                "customer_id": data["customer"],
                "amount_due": data["amount_due"] / 100,
                "attempt_count": data.get("attempt_count", 0),
                "next_payment_attempt": data.get("next_payment_attempt"),
                "tenant_id": data.get("metadata", {}).get("tenant_id")
            }
            
        elif event_type == "customer.subscription.updated":
            result["data"] = {
                "subscription_id": data["id"],
                "customer_id": data["customer"],
                "status": data["status"],
                "current_period_end": data["current_period_end"],
                "cancel_at_period_end": data["cancel_at_period_end"],
                "tenant_id": data.get("metadata", {}).get("tenant_id")
            }
            
        elif event_type == "customer.subscription.deleted":
            result["data"] = {
                "subscription_id": data["id"],
                "customer_id": data["customer"],
                "tenant_id": data.get("metadata", {}).get("tenant_id")
            }
        
        return result
        
    except stripe.error.SignatureVerificationError as e:
        logging.error(f"❌ Signature webhook invalide: {e}")
        return {"processed": False, "error": "Invalid signature"}
    except Exception as e:
        logging.error(f"❌ Erreur traitement webhook: {e}")
        return {"processed": False, "error": str(e)}
