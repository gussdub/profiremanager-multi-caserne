import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card.jsx";
import { Button } from "./ui/button.jsx";
import { useToast } from "../hooks/use-toast";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const ParametresFacturation = ({ user, tenantSlug }) => {
  const API = `${BACKEND_URL}/api/${tenantSlug}`;
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [billingInfo, setBillingInfo] = useState(null);
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    // Vérifier si retour de Stripe Checkout
    const urlParams = new URLSearchParams(window.location.search);
    const checkoutStatus = urlParams.get('checkout');
    
    if (checkoutStatus === 'success') {
      toast({
        title: "✅ Paiement configuré",
        description: "Votre méthode de paiement a été configurée avec succès!",
      });
      // Nettoyer l'URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (checkoutStatus === 'cancelled') {
      toast({
        title: "Configuration annulée",
        description: "Vous pouvez configurer votre paiement à tout moment.",
        variant: "destructive"
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    fetchBillingInfo();
    fetchInvoices();
  }, []);

  const fetchBillingInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/billing/info`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setBillingInfo(data);
      }
    } catch (error) {
      console.error('Erreur chargement facturation:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoices = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/billing/invoices`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setInvoices(data.invoices || []);
      }
    } catch (error) {
      console.error('Erreur chargement factures:', error);
    }
  };

  const openBillingPortal = async () => {
    try {
      const token = localStorage.getItem('token');
      const returnUrl = window.location.href;
      
      const response = await fetch(`${API}/billing/portal`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ return_url: returnUrl })
      });
      
      if (response.ok) {
        const data = await response.json();
        window.open(data.url, '_blank');
      } else {
        toast({
          title: "Erreur",
          description: "Impossible d'ouvrir le portail de facturation",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Erreur portail:', error);
      toast({
        title: "Erreur",
        description: "Une erreur est survenue",
        variant: "destructive"
      });
    }
  };

  const openCheckout = async () => {
    try {
      const token = localStorage.getItem('token');
      const returnUrl = window.location.href.split('?')[0]; // URL sans paramètres
      
      const response = await fetch(`${API}/billing/checkout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ return_url: returnUrl })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Rediriger vers Stripe Checkout
        window.location.href = data.url;
      } else {
        const errorData = await response.json();
        toast({
          title: "Erreur",
          description: errorData.detail || "Impossible de configurer le paiement",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Erreur checkout:', error);
      toast({
        title: "Erreur",
        description: "Une erreur est survenue",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      active: { bg: '#d1fae5', color: '#065f46', text: '✅ Actif' },
      past_due: { bg: '#fef2f2', color: '#991b1b', text: '⚠️ Paiement en retard' },
      cancelled: { bg: '#fef2f2', color: '#991b1b', text: '❌ Annulé' },
      inactive: { bg: '#f3f4f6', color: '#4b5563', text: '⏳ En attente' },
      trial: { bg: '#dbeafe', color: '#1e40af', text: '🎁 Essai' }
    };
    
    const style = styles[status] || styles.inactive;
    
    return (
      <span style={{
        padding: '4px 12px',
        borderRadius: '20px',
        fontSize: '14px',
        fontWeight: '600',
        background: style.bg,
        color: style.color
      }}>
        {style.text}
      </span>
    );
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
        Chargement...
      </div>
    );
  }

  // Si compte gratuit
  if (billingInfo?.is_gratuit) {
    return (
      <div style={{ padding: '20px' }}>
        <Card>
          <CardHeader>
            <CardTitle>💳 Facturation</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{
              textAlign: 'center',
              padding: '40px',
              background: '#d1fae5',
              borderRadius: '12px'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🆓</div>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#065f46', marginBottom: '8px' }}>
                Compte Gratuit
              </h2>
              <p style={{ color: '#047857' }}>
                Votre compte est actuellement gratuit. Aucune facturation n'est requise.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Résumé de l'abonnement */}
      <Card>
        <CardHeader>
          <CardTitle style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>💳 Mon Abonnement</span>
            {getStatusBadge(billingInfo?.billing_status)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>Utilisateurs actifs</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e293b' }}>
                {billingInfo?.user_count || 0}
              </div>
            </div>
            
            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>Prix par utilisateur</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e293b' }}>
                {billingInfo?.billing_info?.price_per_user_total || '-'}$/mois
              </div>
              {billingInfo?.prevention_module && (
                <div style={{ fontSize: '12px', color: '#f59e0b' }}>Inclut +3$ module Prévention</div>
              )}
            </div>
            
            <div style={{ padding: '16px', background: billingInfo?.billing_status === 'active' ? '#d1fae5' : '#fef3c7', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>Total mensuel</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: billingInfo?.billing_status === 'active' ? '#065f46' : '#92400e' }}>
                {billingInfo?.billing_info?.total_monthly_cost?.toFixed(2) || '-'}$
              </div>
            </div>
            
            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '4px' }}>Cycle de facturation</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b' }}>
                {billingInfo?.billing_cycle === 'annual' ? '📅 Annuel (-10%)' : '📆 Mensuel'}
              </div>
            </div>
          </div>

          {billingInfo?.next_billing_date && (
            <div style={{ marginTop: '20px', padding: '12px', background: '#f0f9ff', borderRadius: '8px', textAlign: 'center' }}>
              <span style={{ color: '#0369a1' }}>
                📅 Prochaine facturation: <strong>{billingInfo.next_billing_date}</strong>
              </span>
            </div>
          )}

          {billingInfo?.launch_offer_applied && (
            <div style={{ marginTop: '12px', padding: '12px', background: '#fef3c7', borderRadius: '8px', textAlign: 'center' }}>
              <span style={{ color: '#92400e' }}>
                🎉 Offre de lancement appliquée: -30% sur les 3 premiers mois
              </span>
            </div>
          )}

          {/* Bouton Payer / Configurer paiement - Si pas encore de customer Stripe */}
          {!billingInfo?.stripe_customer_id && billingInfo?.billing_status !== 'active' && (
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <div style={{
                padding: '20px',
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                borderRadius: '12px',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>💳</div>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#92400e', marginBottom: '8px' }}>
                  Configurer votre abonnement
                </h3>
                <p style={{ color: '#78350f', marginBottom: '16px', fontSize: '14px' }}>
                  Pour activer votre compte, veuillez configurer votre méthode de paiement.
                </p>
                <Button 
                  onClick={openCheckout} 
                  style={{ 
                    padding: '14px 32px', 
                    fontSize: '16px',
                    background: '#16a34a',
                    border: 'none'
                  }}
                  data-testid="setup-payment-btn"
                >
                  💳 Configurer le paiement
                </Button>
              </div>
            </div>
          )}

          {/* Bouton portail Stripe - Si déjà client */}
          {billingInfo?.stripe_customer_id && (
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <Button onClick={openBillingPortal} style={{ padding: '12px 24px' }} data-testid="manage-subscription-btn">
                ⚙️ Gérer mon abonnement
              </Button>
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                Modifier votre méthode de paiement, changer de plan, ou annuler
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historique des factures */}
      <Card>
        <CardHeader>
          <CardTitle>📄 Historique des factures</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              Aucune facture disponible
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Date</th>
                    <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Numéro</th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '600', color: '#374151' }}>Montant</th>
                    <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Statut</th>
                    <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: '600', color: '#374151' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 8px', color: '#374151' }}>
                        {invoice.created}
                      </td>
                      <td style={{ padding: '12px 8px', color: '#64748b' }}>
                        {invoice.number || '-'}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '600', color: '#1e293b' }}>
                        {invoice.amount_paid?.toFixed(2) || invoice.amount_due?.toFixed(2)} {invoice.currency}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '600',
                          background: invoice.status === 'paid' ? '#d1fae5' : (invoice.status === 'open' ? '#fef3c7' : '#f3f4f6'),
                          color: invoice.status === 'paid' ? '#065f46' : (invoice.status === 'open' ? '#92400e' : '#4b5563')
                        }}>
                          {invoice.status === 'paid' ? '✅ Payée' : (invoice.status === 'open' ? '⏳ En attente' : invoice.status)}
                        </span>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                        {invoice.invoice_pdf && (
                          <a 
                            href={invoice.invoice_pdf} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{
                              padding: '4px 12px',
                              background: '#3b82f6',
                              color: 'white',
                              borderRadius: '4px',
                              fontSize: '12px',
                              textDecoration: 'none',
                              display: 'inline-block'
                            }}
                          >
                            📥 PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info économie annuelle */}
      {billingInfo?.billing_cycle === 'monthly' && billingInfo?.billing_info && (
        <Card style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', border: 'none' }}>
          <CardContent style={{ padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#92400e', marginBottom: '8px' }}>
              💡 Économisez avec l'abonnement annuel !
            </div>
            <p style={{ color: '#78350f', marginBottom: '12px' }}>
              Passez à l'annuel et économisez <strong>{billingInfo.billing_info.annual_savings?.toFixed(0) || 0}$</strong> par an (10% de rabais)
            </p>
            <Button onClick={openBillingPortal} variant="outline" style={{ borderColor: '#92400e', color: '#92400e' }}>
              Passer à l'annuel
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ParametresFacturation;
