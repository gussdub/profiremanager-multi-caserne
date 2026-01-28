"""
Routes API pour le module Billing / Stripe
==========================================

Ce module gère toute la facturation et l'intégration Stripe:
- Tarification et calcul des coûts
- Gestion des clients Stripe
- Abonnements et factures
- Webhooks Stripe
- Portail de facturation
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import os
import logging
import json
import stripe
import resend

from routes.dependencies import (
    db,
    get_current_user,
    get_super_admin,
    User,
    SuperAdmin
)

router = APIRouter(tags=["Billing"])
logger = logging.getLogger(__name__)

# Initialiser Stripe
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")


# ==================== CONFIGURATION TARIFICATION ====================

PRICING_TIERS = [
    {"min": 1, "max": 30, "price_per_user": 12.00},
    {"min": 31, "max": 50, "price_per_user": 20.00},
    {"min": 51, "max": 999, "price_per_user": 27.00},
]
PREVENTION_MODULE_PRICE = 3.00
ANNUAL_DISCOUNT_PERCENT = 10
CURRENCY = "cad"
LAUNCH_OFFER = {
    "active": True,
    "discount_percent": 30,
    "discount_months": 3,
    "valid_until": "2026-03-31",
}


# ==================== MODÈLES ====================

class BillingRequest(BaseModel):
    return_url: str


# ==================== FONCTIONS UTILITAIRES ====================

def get_tier_price(user_count: int) -> float:
    """Obtient le prix par utilisateur selon le palier"""
    for tier in PRICING_TIERS:
        if tier["min"] <= user_count <= tier["max"]:
            return tier["price_per_user"]
    return PRICING_TIERS[-1]["price_per_user"]


def calculate_billing(user_count: int, prevention_module: bool = False, billing_cycle: str = "monthly") -> Dict[str, Any]:
    """Calcule le coût d'abonnement"""
    tier_price = get_tier_price(user_count)
    base_monthly = user_count * tier_price
    
    prevention_cost = user_count * PREVENTION_MODULE_PRICE if prevention_module else 0.0
    total_monthly = base_monthly + prevention_cost
    
    annual_cost = total_monthly * 12 * (1 - ANNUAL_DISCOUNT_PERCENT / 100)
    
    return {
        "user_count": user_count,
        "tier_name": f"{PRICING_TIERS[0]['min']}-{PRICING_TIERS[0]['max']}" if user_count <= 30 else (f"{PRICING_TIERS[1]['min']}-{PRICING_TIERS[1]['max']}" if user_count <= 50 else "51+"),
        "tier_price_per_user": tier_price,
        "base_monthly_cost": base_monthly,
        "prevention_module": prevention_module,
        "prevention_monthly_cost": prevention_cost,
        "price_per_user_total": tier_price + (PREVENTION_MODULE_PRICE if prevention_module else 0),
        "total_monthly_cost": total_monthly,
        "annual_cost": annual_cost,
        "annual_savings": (total_monthly * 12) - annual_cost,
        "billing_cycle": billing_cycle
    }


def is_launch_offer_valid() -> bool:
    """Vérifie si l'offre de lancement est encore valide"""
    if not LAUNCH_OFFER["active"]:
        return False
    valid_until = datetime.strptime(LAUNCH_OFFER["valid_until"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) <= valid_until


# ==================== ROUTES SUPER-ADMIN ====================

@router.get("/admin/billing/pricing")
async def get_pricing_info(admin: SuperAdmin = Depends(get_super_admin)):
    """Récupère les informations de tarification"""
    return {
        "tiers": PRICING_TIERS,
        "prevention_module_price": PREVENTION_MODULE_PRICE,
        "annual_discount_percent": ANNUAL_DISCOUNT_PERCENT,
        "currency": CURRENCY,
        "launch_offer": {
            **LAUNCH_OFFER,
            "is_valid": is_launch_offer_valid()
        }
    }


@router.get("/admin/billing/calculate")
async def calculate_billing_preview(
    user_count: int,
    prevention_module: bool = False,
    billing_cycle: str = "monthly",
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Calcule un aperçu de facturation"""
    return calculate_billing(user_count, prevention_module, billing_cycle)


@router.get("/admin/billing/overview")
async def get_billing_overview(admin: SuperAdmin = Depends(get_super_admin)):
    """Vue d'ensemble de la facturation de tous les tenants"""
    tenants = await db.tenants.find({}, {"_id": 0}).to_list(1000)
    
    total_mrr = 0.0  # Monthly Recurring Revenue
    paying_tenants = 0
    free_tenants = 0
    past_due_tenants = 0
    
    billing_details = []
    
    for tenant in tenants:
        # Compter les utilisateurs actifs
        user_count = await db.users.count_documents({
            "tenant_id": tenant.id,
            "statut": "Actif"
        })
        
        is_gratuit = tenant.get("is_gratuit", False)
        prevention_active = tenant.get("parametres", {}).get("module_prevention_active", False)
        billing_status = tenant.get("billing_status", "inactive")
        
        if is_gratuit:
            free_tenants += 1
            monthly_cost = 0.0
        else:
            billing_info = calculate_billing(user_count, prevention_active)
            monthly_cost = billing_info["total_monthly_cost"]
            
            if billing_status == "active":
                paying_tenants += 1
                total_mrr += monthly_cost
            elif billing_status == "past_due":
                past_due_tenants += 1
        
        billing_details.append({
            "tenant_id": tenant.id,
            "tenant_slug": tenant.get("slug"),
            "tenant_nom": tenant.get("nom"),
            "user_count": user_count,
            "is_gratuit": is_gratuit,
            "prevention_module": prevention_active,
            "billing_status": billing_status,
            "monthly_cost": monthly_cost,
            "billing_cycle": tenant.get("billing_cycle", "monthly"),
            "last_payment_date": tenant.get("last_payment_date"),
            "next_billing_date": tenant.get("next_billing_date"),
            "payment_failed_date": tenant.get("payment_failed_date"),
            "stripe_customer_id": tenant.get("stripe_customer_id")
        })
    
    return {
        "summary": {
            "total_mrr": total_mrr,
            "paying_tenants": paying_tenants,
            "free_tenants": free_tenants,
            "past_due_tenants": past_due_tenants,
            "total_tenants": len(tenants)
        },
        "tenants": billing_details
    }


@router.post("/admin/billing/tenant/{tenant_id}/create-customer")
async def create_stripe_customer_for_tenant(
    tenant_id: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Crée un client Stripe pour un tenant"""
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    if tenant.get("is_gratuit"):
        raise HTTPException(status_code=400, detail="Ce tenant est marqué comme gratuit")
    
    if tenant.get("stripe_customer_id"):
        return {"message": "Client Stripe existe déjà", "customer_id": tenant["stripe_customer_id"]}
    
    try:
        customer = stripe.Customer.create(
            name=tenant.get("nom"),
            email=tenant.get("email_contact"),
            metadata={
                "tenant_id": tenant_id,
                "tenant_slug": tenant.get("slug"),
                "tenant_nom": tenant.get("nom")
            }
        )
        
        await db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {"stripe_customer_id": customer.id}}
        )
        
        logger.info(f"✅ Client Stripe créé: {customer.id} pour tenant {tenant_id}")
        return {"success": True, "customer_id": customer.id}
        
    except stripe.error.StripeError as e:
        logger.error(f"❌ Erreur Stripe: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/billing/tenant/{tenant_id}/create-subscription")
async def create_subscription_for_tenant(
    tenant_id: str,
    billing_cycle: str = "monthly",
    apply_launch_offer: bool = False,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Crée un abonnement Stripe pour un tenant"""
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    if tenant.get("is_gratuit"):
        raise HTTPException(status_code=400, detail="Ce tenant est marqué comme gratuit")
    
    if not tenant.get("stripe_customer_id"):
        raise HTTPException(status_code=400, detail="Créez d'abord un client Stripe")
    
    # Compter les utilisateurs actifs
    user_count = await db.users.count_documents({
        "tenant_id": tenant_id,
        "statut": "Actif"
    })
    
    if user_count == 0:
        raise HTTPException(status_code=400, detail="Aucun utilisateur actif")
    
    prevention_active = tenant.get("parametres", {}).get("module_prevention_active", False)
    billing_info = calculate_billing(user_count, prevention_active, billing_cycle)
    
    try:
        # Créer le prix
        unit_amount = int(billing_info["price_per_user_total"] * 100)
        interval = "month" if billing_cycle == "monthly" else "year"
        
        price = stripe.Price.create(
            unit_amount=unit_amount,
            currency=CURRENCY,
            recurring={"interval": interval},
            product_data={
                "name": f"ProFireManager - {tenant.get('nom')}",
                "metadata": {"tenant_id": tenant_id}
            }
        )
        
        # Paramètres de l'abonnement
        sub_params = {
            "customer": tenant["stripe_customer_id"],
            "items": [{"price": price.id, "quantity": user_count}],
            "metadata": {
                "tenant_id": tenant_id,
                "tenant_slug": tenant.get("slug"),
                "user_count": str(user_count),
                "prevention_module": str(prevention_active)
            }
        }
        
        # Appliquer l'offre de lancement
        if apply_launch_offer and is_launch_offer_valid():
            coupon = stripe.Coupon.create(
                percent_off=LAUNCH_OFFER["discount_percent"],
                duration="repeating",
                duration_in_months=LAUNCH_OFFER["discount_months"],
                metadata={"type": "launch_offer", "tenant_id": tenant_id}
            )
            sub_params["coupon"] = coupon.id
        
        subscription = stripe.Subscription.create(**sub_params)
        
        # Mettre à jour le tenant
        await db.tenants.update_one(
            {"id": tenant_id},
            {"$set": {
                "stripe_subscription_id": subscription.id,
                "billing_status": subscription.status,
                "billing_cycle": billing_cycle,
                "launch_offer_applied": apply_launch_offer and is_launch_offer_valid(),
                "next_billing_date": datetime.fromtimestamp(subscription.current_period_end).strftime("%Y-%m-%d")
            }}
        )
        
        return {
            "success": True,
            "subscription_id": subscription.id,
            "status": subscription.status,
            "billing_info": billing_info
        }
        
    except stripe.error.StripeError as e:
        logger.error(f"❌ Erreur Stripe: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/billing/tenant/{tenant_id}/invoices")
async def get_tenant_invoices(
    tenant_id: str,
    limit: int = 10,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Récupère les factures d'un tenant"""
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    if not tenant.get("stripe_customer_id"):
        return {"invoices": [], "message": "Pas de client Stripe"}
    
    try:
        invoices = stripe.Invoice.list(
            customer=tenant["stripe_customer_id"],
            limit=limit
        )
        
        return {
            "invoices": [{
                "id": inv.id,
                "number": inv.number,
                "amount_due": inv.amount_due / 100,
                "amount_paid": inv.amount_paid / 100,
                "currency": inv.currency.upper(),
                "status": inv.status,
                "created": datetime.fromtimestamp(inv.created).strftime("%Y-%m-%d %H:%M"),
                "due_date": datetime.fromtimestamp(inv.due_date).strftime("%Y-%m-%d") if inv.due_date else None,
                "invoice_pdf": inv.invoice_pdf,
                "hosted_invoice_url": inv.hosted_invoice_url
            } for inv in invoices.data]
        }
        
    except stripe.error.StripeError as e:
        logger.error(f"❌ Erreur Stripe: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/billing/tenant/{tenant_id}/send-reminder")
async def send_payment_reminder(
    tenant_id: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Envoie un rappel de paiement par email"""
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    if not tenant.get("email_contact"):
        raise HTTPException(status_code=400, detail="Pas d'email de contact")
    
    # Envoyer via Resend
    try:
        resend.api_key = os.environ.get("RESEND_API_KEY")
        if resend.api_key:
            resend.Emails.send({
                "from": "ProFireManager <noreply@profiremanager.com>",
                "to": [tenant.email_contact],
                "subject": "Rappel de paiement - ProFireManager",
                "html": f"""
                <h2>Rappel de paiement</h2>
                <p>Bonjour,</p>
                <p>Nous vous rappelons qu'un paiement est en attente pour votre abonnement ProFireManager pour <strong>{tenant.get('nom')}</strong>.</p>
                <p>Veuillez régulariser votre situation dans les plus brefs délais pour éviter toute interruption de service.</p>
                <p>Cordialement,<br>L'équipe ProFireManager</p>
                """
            })
            
            logger.info(f"📧 Rappel envoyé à {tenant['email_contact']} pour tenant {tenant_id}")
            return {"success": True, "message": f"Rappel envoyé à {tenant['email_contact']}"}
        else:
            return {"success": False, "message": "Clé Resend non configurée"}
            
    except Exception as e:
        logger.error(f"❌ Erreur envoi email: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== WEBHOOK STRIPE ====================

@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Webhook Stripe pour gérer les événements de paiement"""
    payload = await request.body()
    sig_header = request.headers.get("Stripe-Signature")
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    
    try:
        if webhook_secret:
            event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
        else:
            # Mode test sans signature
            event = json.loads(payload)
        
        event_type = event.get("type", "")
        data = event.get("data", {}).get("object", {})
        
        logger.info(f"📥 Webhook Stripe: {event_type}")
        
        tenant_id = data.get("metadata", {}).get("tenant_id")
        
        # Gérer la fin d'une session Checkout
        if event_type == "checkout.session.completed":
            tenant_id = data.get("metadata", {}).get("tenant_id")
            customer_id = data.get("customer")
            subscription_id = data.get("subscription")
            
            if tenant_id and customer_id:
                update_data = {
                    "stripe_customer_id": customer_id,
                    "billing_status": "active",
                    "actif": True
                }
                if subscription_id:
                    update_data["stripe_subscription_id"] = subscription_id
                    # Récupérer les infos de l'abonnement
                    try:
                        sub = stripe.Subscription.retrieve(subscription_id)
                        update_data["next_billing_date"] = datetime.fromtimestamp(sub.current_period_end).strftime("%Y-%m-%d")
                    except:
                        pass
                
                await db.tenants.update_one(
                    {"id": tenant_id},
                    {"$set": update_data}
                )
                logger.info(f"✅ Checkout complété pour tenant {tenant_id}, customer: {customer_id}")
        
        elif event_type == "invoice.paid":
            # Récupérer le tenant_id depuis la subscription si pas dans metadata
            if not tenant_id:
                sub_id = data.get("subscription")
                if sub_id:
                    tenant = await db.tenants.find_one({"stripe_subscription_id": sub_id})
                    if tenant:
                        tenant_id = tenant.get("id")
            
            if tenant_id:
                await db.tenants.update_one(
                    {"id": tenant_id},
                    {"$set": {
                        "billing_status": "active",
                        "last_payment_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                        "last_payment_amount": data.get("amount_paid", 0) / 100,
                        "payment_failed_date": None,
                        "actif": True  # Réactiver si était suspendu
                    }}
                )
                logger.info(f"✅ Paiement reçu pour tenant {tenant_id}")
                
        elif event_type == "invoice.payment_failed":
            # Récupérer le tenant_id depuis la subscription si pas dans metadata
            if not tenant_id:
                sub_id = data.get("subscription")
                if sub_id:
                    tenant = await db.tenants.find_one({"stripe_subscription_id": sub_id})
                    if tenant:
                        tenant_id = tenant.get("id")
            
            if tenant_id:
                tenant = await db.tenants.find_one({"id": tenant_id})
                payment_failed_date = tenant.get("payment_failed_date") if tenant else None
                
                if not payment_failed_date:
                    # Premier échec
                    await db.tenants.update_one(
                        {"id": tenant_id},
                        {"$set": {
                            "billing_status": "past_due",
                            "payment_failed_date": datetime.now(timezone.utc).strftime("%Y-%m-%d")
                        }}
                    )
                logger.warning(f"⚠️ Échec paiement pour tenant {tenant_id}")
                
        elif event_type == "customer.subscription.deleted":
            # Récupérer le tenant_id depuis le customer si pas dans metadata
            if not tenant_id:
                customer_id = data.get("customer")
                if customer_id:
                    tenant = await db.tenants.find_one({"stripe_customer_id": customer_id})
                    if tenant:
                        tenant_id = tenant.get("id")
            
            if tenant_id:
                await db.tenants.update_one(
                    {"id": tenant_id},
                    {"$set": {
                        "billing_status": "cancelled",
                        "stripe_subscription_id": None
                    }}
                )
                logger.info(f"❌ Abonnement annulé pour tenant {tenant_id}")
        
        return {"received": True}
        
    except Exception as e:
        logger.error(f"❌ Erreur webhook Stripe: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# ==================== ROUTES TENANT (pour admins de tenant) ====================

@router.get("/{tenant_slug}/tenant-info")
async def get_tenant_info(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère les informations publiques du tenant pour l'utilisateur connecté"""
    tenant = await db.tenants.find_one({"slug": tenant_slug})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Retourner uniquement les infos nécessaires (pas de données sensibles)
    return {
        "id": tenant.get("id"),
        "nom": tenant.get("nom"),
        "slug": tenant.get("slug"),
        "parametres": {
            "module_prevention_active": tenant.get("parametres", {}).get("module_prevention_active", False),
            "modules_actifs": tenant.get("parametres", {}).get("modules_actifs", [])
        }
    }


@router.get("/{tenant_slug}/billing/info")
async def get_tenant_billing_info(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère les informations de facturation pour un tenant (admin seulement)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await db.tenants.find_one({"slug": tenant_slug})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Compter les utilisateurs actifs
    user_count = await db.users.count_documents({
        "tenant_id": tenant.id,
        "statut": "Actif"
    })
    
    prevention_active = tenant.get("parametres", {}).get("module_prevention_active", False)
    is_gratuit = tenant.get("is_gratuit", False)
    
    billing_info = calculate_billing(
        user_count,
        prevention_active,
        tenant.get("billing_cycle", "monthly")
    ) if not is_gratuit else None
    
    return {
        "is_gratuit": is_gratuit,
        "user_count": user_count,
        "prevention_module": prevention_active,
        "billing_status": tenant.get("billing_status", "inactive"),
        "billing_cycle": tenant.get("billing_cycle", "monthly"),
        "billing_info": billing_info,
        "last_payment_date": tenant.get("last_payment_date"),
        "last_payment_amount": tenant.get("last_payment_amount"),
        "next_billing_date": tenant.get("next_billing_date"),
        "launch_offer_applied": tenant.get("launch_offer_applied", False),
        "stripe_customer_id": tenant.get("stripe_customer_id")
    }


@router.get("/{tenant_slug}/billing/invoices")
async def get_my_invoices(
    tenant_slug: str,
    limit: int = 10,
    current_user: User = Depends(get_current_user)
):
    """Récupère les factures du tenant pour un admin"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await db.tenants.find_one({"slug": tenant_slug})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    if not tenant.get("stripe_customer_id"):
        return {"invoices": []}
    
    try:
        invoices = stripe.Invoice.list(
            customer=tenant["stripe_customer_id"],
            limit=limit
        )
        
        return {
            "invoices": [{
                "id": inv.id,
                "number": inv.number,
                "amount_due": inv.amount_due / 100,
                "amount_paid": inv.amount_paid / 100,
                "currency": inv.currency.upper(),
                "status": inv.status,
                "created": datetime.fromtimestamp(inv.created).strftime("%Y-%m-%d"),
                "invoice_pdf": inv.invoice_pdf,
                "hosted_invoice_url": inv.hosted_invoice_url
            } for inv in invoices.data]
        }
        
    except stripe.error.StripeError as e:
        return {"invoices": [], "error": str(e)}


@router.post("/{tenant_slug}/billing/portal")
async def get_billing_portal(
    tenant_slug: str,
    request_data: BillingRequest,
    current_user: User = Depends(get_current_user)
):
    """Crée une session du portail de facturation Stripe"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    return_url = request_data.return_url
    
    tenant = await db.tenants.find_one({"slug": tenant_slug})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    if not tenant.get("stripe_customer_id"):
        raise HTTPException(status_code=400, detail="Pas de compte de facturation")
    
    try:
        session = stripe.billing_portal.Session.create(
            customer=tenant["stripe_customer_id"],
            return_url=return_url
        )
        
        return {"url": session.url}
        
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{tenant_slug}/billing/checkout")
async def create_checkout_session(
    tenant_slug: str,
    request_data: BillingRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Crée une session Stripe Checkout pour configurer le paiement.
    Utilisé quand le tenant n'a pas encore de stripe_customer_id.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    return_url = request_data.return_url
    
    tenant = await db.tenants.find_one({"slug": tenant_slug})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Si gratuit, pas besoin de checkout
    if tenant.get("is_gratuit", False):
        raise HTTPException(status_code=400, detail="Compte gratuit - pas de paiement requis")
    
    try:
        # Compter les utilisateurs actifs
        user_count = await db.users.count_documents({
            "tenant_id": tenant.id,
            "statut": "Actif"
        })
        if user_count == 0:
            user_count = 1  # Minimum 1 utilisateur
        
        prevention_active = tenant.get("parametres", {}).get("module_prevention_active", False)
        billing_cycle = tenant.get("billing_cycle", "monthly")
        
        # Calculer le prix
        billing_info = calculate_billing(user_count, prevention_active, billing_cycle)
        unit_amount = int(billing_info["price_per_user_total"] * 100)  # En cents
        interval = "month" if billing_cycle == "monthly" else "year"
        
        # Créer le prix dynamique
        price = stripe.Price.create(
            unit_amount=unit_amount,
            currency="cad",
            recurring={"interval": interval},
            product_data={
                "name": f"ProFireManager - {tenant.get('nom', tenant_slug)}",
                "metadata": {"tenant_id": tenant.id}
            }
        )
        
        # Si le tenant a déjà un customer_id, l'utiliser, sinon créer un nouveau client Stripe
        customer_id = tenant.get("stripe_customer_id")
        
        if not customer_id:
            # Créer le client Stripe maintenant
            customer_email = tenant.get("email_contact") or tenant.get("contact_email") or ""
            customer = stripe.Customer.create(
                email=customer_email,
                name=tenant.get("nom", tenant_slug),
                metadata={
                    "tenant_id": tenant.id,
                    "tenant_slug": tenant_slug
                }
            )
            customer_id = customer.id
            
            # Sauvegarder le customer_id dans la base de données
            await db.tenants.update_one(
                {"id": tenant.id},
                {"$set": {"stripe_customer_id": customer_id}}
            )
        
        checkout_params = {
            "mode": "subscription",
            "customer": customer_id,
            "line_items": [{
                "price": price.id,
                "quantity": user_count
            }],
            "success_url": return_url + "?checkout=success",
            "cancel_url": return_url + "?checkout=cancelled",
            "metadata": {
                "tenant_id": tenant.id,
                "tenant_slug": tenant_slug
            },
            "subscription_data": {
                "metadata": {
                    "tenant_id": tenant.id,
                    "tenant_slug": tenant_slug
                }
            }
        }
        
        session = stripe.checkout.Session.create(**checkout_params)
        
        return {"url": session.url, "session_id": session.id}
        
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=500, detail=str(e))
