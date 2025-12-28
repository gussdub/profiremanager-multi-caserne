import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';

// ==================== PARAMÈTRES ALERTES ÉQUIPEMENTS ====================
const ParametresAlertesEquipements = ({ tenantSlug, user }) => {
  const [parametres, setParametres] = useState({
    jours_alerte_maintenance: 30,
    jours_alerte_expiration: 30,
    jours_alerte_fin_vie: 90,
    activer_alertes_email: true,
    activer_alertes_dashboard: true
  });
  const [alertes, setAlertes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadParametres();
    loadAlertes();
    // eslint-disable-next-line
  }, [tenantSlug]);

  const loadParametres = async () => {
    try {
      const data = await apiGet(tenantSlug, '/equipements/parametres');
      setParametres({
        jours_alerte_maintenance: data.jours_alerte_maintenance || 30,
        jours_alerte_expiration: data.jours_alerte_expiration || 30,
        jours_alerte_fin_vie: data.jours_alerte_fin_vie || 90,
        activer_alertes_email: data.activer_alertes_email !== false,
        activer_alertes_dashboard: data.activer_alertes_dashboard !== false
      });
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAlertes = async () => {
    try {
      const data = await apiGet(tenantSlug, '/equipements/alertes');
      setAlertes(data);
    } catch (error) {
      console.error('Erreur chargement alertes:', error);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await apiPut(tenantSlug, '/equipements/parametres', parametres);
      alert('✅ Paramètres sauvegardés avec succès');
      loadAlertes(); // Recharger les alertes avec les nouveaux paramètres
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('❌ Erreur: ' + (error.message || 'Erreur inconnue'));
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculer = async () => {
    try {
      setSaving(true);
      await apiPost(tenantSlug, '/equipements/alertes/recalculer');
      await loadAlertes();
      alert('✅ Alertes recalculées avec succès');
    } catch (error) {
      console.error('Erreur recalcul:', error);
      alert('❌ Erreur: ' + (error.message || 'Erreur inconnue'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '1rem', color: '#6b7280' }}>Chargement...</div>;
  }

  return (
    <div style={{ 
      background: 'white', 
      padding: '20px', 
      borderRadius: '10px', 
      boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
      border: '1px solid #e0e0e0'
    }}>
      <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '5px', color: '#34495e', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>🔔</span> Configuration des Alertes
      </h3>
      <p style={{ color: '#7f8c8d', marginBottom: '20px', fontSize: '13px' }}>
        Définissez les délais d'alerte pour les maintenances et expirations
      </p>

      {/* Résumé des alertes actives */}
      {alertes && alertes.totaux && (
        <div style={{
          background: alertes.totaux.total > 0 ? '#fef3c7' : '#d1fae5',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: alertes.totaux.total > 0 ? '1px solid #fbbf24' : '1px solid #10b981'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ fontSize: '24px' }}>{alertes.totaux.total > 0 ? '⚠️' : '✅'}</span>
            <span style={{ fontWeight: '600', color: alertes.totaux.total > 0 ? '#92400e' : '#065f46' }}>
              {alertes.totaux.total > 0 
                ? `${alertes.totaux.total} alerte(s) active(s)`
                : 'Aucune alerte active'
              }
            </span>
          </div>
          {alertes.totaux.total > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {alertes.totaux.maintenance > 0 && (
                <span style={{ padding: '0.25rem 0.75rem', background: '#fbbf24', color: '#78350f', borderRadius: '9999px', fontSize: '12px' }}>
                  🔧 {alertes.totaux.maintenance} maintenance(s)
                </span>
              )}
              {alertes.totaux.expiration > 0 && (
                <span style={{ padding: '0.25rem 0.75rem', background: '#ef4444', color: 'white', borderRadius: '9999px', fontSize: '12px' }}>
                  📅 {alertes.totaux.expiration} expiration(s)
                </span>
              )}
              {alertes.totaux.fin_vie > 0 && (
                <span style={{ padding: '0.25rem 0.75rem', background: '#dc2626', color: 'white', borderRadius: '9999px', fontSize: '12px' }}>
                  ⏰ {alertes.totaux.fin_vie} fin(s) de vie
                </span>
              )}
              {alertes.totaux.reparation > 0 && (
                <span style={{ padding: '0.25rem 0.75rem', background: '#f97316', color: 'white', borderRadius: '9999px', fontSize: '12px' }}>
                  🔧 {alertes.totaux.reparation} réparation(s)
                </span>
              )}
              {alertes.totaux.stock_bas > 0 && (
                <span style={{ padding: '0.25rem 0.75rem', background: '#8b5cf6', color: 'white', borderRadius: '9999px', fontSize: '12px' }}>
                  📦 {alertes.totaux.stock_bas} stock bas
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Paramètres des délais - Responsive */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '6px',
          padding: '10px',
          background: '#f9fafb',
          borderRadius: '8px'
        }}>
          <Label style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
            🔧 Alerte maintenance
          </Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Input
              type="number"
              min="1"
              max="365"
              value={parametres.jours_alerte_maintenance}
              onChange={(e) => setParametres({...parametres, jours_alerte_maintenance: parseInt(e.target.value) || 30})}
              style={{ width: '70px', padding: '6px 8px', fontSize: '14px' }}
            />
            <span style={{ fontSize: '12px', color: '#6b7280' }}>jours avant</span>
          </div>
        </div>

        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '6px',
          padding: '10px',
          background: '#f9fafb',
          borderRadius: '8px'
        }}>
          <Label style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
            📅 Alerte expiration
          </Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Input
              type="number"
              min="1"
              max="365"
              value={parametres.jours_alerte_expiration}
              onChange={(e) => setParametres({...parametres, jours_alerte_expiration: parseInt(e.target.value) || 30})}
              style={{ width: '70px', padding: '6px 8px', fontSize: '14px' }}
            />
            <span style={{ fontSize: '12px', color: '#6b7280' }}>jours avant</span>
          </div>
        </div>

        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '6px',
          padding: '10px',
          background: '#f9fafb',
          borderRadius: '8px'
        }}>
          <Label style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
            ⏰ Alerte fin de vie
          </Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Input
              type="number"
              min="1"
              max="365"
              value={parametres.jours_alerte_fin_vie}
              onChange={(e) => setParametres({...parametres, jours_alerte_fin_vie: parseInt(e.target.value) || 90})}
              style={{ width: '70px', padding: '6px 8px', fontSize: '14px' }}
            />
            <span style={{ fontSize: '12px', color: '#6b7280' }}>jours avant</span>
          </div>
        </div>
      </div>

      {/* Options d'activation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={parametres.activer_alertes_email}
            onChange={(e) => setParametres({...parametres, activer_alertes_email: e.target.checked})}
          />
          <span style={{ fontSize: '14px' }}>📧 Activer les alertes par email</span>
        </label>
        
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={parametres.activer_alertes_dashboard}
            onChange={(e) => setParametres({...parametres, activer_alertes_dashboard: e.target.checked})}
          />
          <span style={{ fontSize: '14px' }}>📊 Afficher les alertes sur le tableau de bord</span>
        </label>
      </div>

      {/* Boutons d'action */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            padding: '12px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            opacity: saving ? 0.6 : 1
          }}
        >
          {saving ? 'Enregistrement...' : '💾 Enregistrer'}
        </button>
        
        {user?.role === 'admin' && (
          <button
            onClick={handleRecalculer}
            disabled={saving}
            style={{
              padding: '12px 20px',
              background: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              opacity: saving ? 0.6 : 1
            }}
          >
            🔄 Recalculer
          </button>
        )}
      </div>
    </div>
  );
};



export default ParametresAlertesEquipements;
