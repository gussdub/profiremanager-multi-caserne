import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { apiGet, apiPut } from '../utils/api';

const ConfigurationEmailsInventaires = ({ tenantSlug }) => {
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfiguration();
    loadUsers();
    // eslint-disable-next-line
  }, [tenantSlug]);

  const loadUsers = async () => {
    try {
      const users = await apiGet(tenantSlug, '/users');
      // Filtrer uniquement les admins et superviseurs
      const adminsSuperviseurs = users.filter(u => 
        u.role === 'admin' || u.role === 'superviseur'
      );
      setAllUsers(adminsSuperviseurs);
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
      setAllUsers([]);
    }
  };

  const loadConfiguration = async () => {
    try {
      setLoading(true);
      const config = await apiGet(tenantSlug, '/actifs/parametres');
      setSelectedUsers(config.emails_notifications_inventaires_vehicules || []);
    } catch (error) {
      console.error('Erreur chargement configuration:', error);
      setSelectedUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUser = (userId) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(selectedUsers.filter(id => id !== userId));
    } else {
      setSelectedUsers([...selectedUsers, userId]);
    }
  };

  const handleSelectAll = () => {
    setSelectedUsers(allUsers.map(u => u.id));
  };

  const handleDeselectAll = () => {
    setSelectedUsers([]);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await apiPut(tenantSlug, '/actifs/parametres', {
        emails_notifications_inventaires_vehicules: selectedUsers
      });
      alert('✅ Configuration enregistrée !');
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('❌ Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
        Chargement de la configuration...
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <span style={{ fontSize: '1.5rem' }}>📋</span>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0, color: '#34495e' }}>
            Notifications - Inventaires Véhicules
          </h3>
          <p style={{ fontSize: '12px', color: '#7f8c8d', margin: 0 }}>
            Alertes items manquants ou défectueux
          </p>
        </div>
      </div>

      {/* Boutons de sélection rapide */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        gap: '0.75rem',
        marginBottom: '1rem'
      }}>
        <h4 style={{ fontSize: '14px', fontWeight: '600', margin: 0, color: '#34495e' }}>
          👥 Destinataires ({selectedUsers.length})
        </h4>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleSelectAll}
            style={{
              padding: '0.4rem 0.6rem',
              backgroundColor: 'white',
              color: '#8B5CF6',
              border: '1px solid #8B5CF6',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500',
              whiteSpace: 'nowrap'
            }}
          >
            ✓ Tout
          </button>
          <button
            onClick={handleDeselectAll}
            style={{
              padding: '0.4rem 0.6rem',
              backgroundColor: 'white',
              color: '#6B7280',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500',
              whiteSpace: 'nowrap'
            }}
          >
            ✗ Aucun
          </button>
        </div>
      </div>

      {/* Liste des utilisateurs */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '8px',
        maxHeight: '300px',
        overflowY: 'auto',
        marginBottom: '1rem'
      }}>
        {allUsers.map(user => {
          const isSelected = selectedUsers.includes(user.id);
          return (
            <div
              key={user.id}
              onClick={() => handleToggleUser(user.id)}
              style={{
                padding: '12px',
                backgroundColor: isSelected ? '#EDE9FE' : 'white',
                border: isSelected ? '2px solid #8B5CF6' : '1px solid #E5E7EB',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'all 0.2s ease'
              }}
            >
              <div>
                <div style={{ fontWeight: '600', fontSize: '14px', color: '#1F2937' }}>
                  {user.prenom} {user.nom}
                </div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                  ✉️ {user.email}
                </div>
                <div style={{ 
                  fontSize: '11px', 
                  color: user.role === 'admin' ? '#DC2626' : '#2563EB',
                  fontWeight: '600',
                  marginTop: '2px'
                }}>
                  {user.role === 'admin' ? '👑 Admin' : '🛡️ Superviseur'}
                </div>
              </div>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: isSelected ? '#8B5CF6' : '#E5E7EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '14px'
              }}>
                {isSelected && '✓'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Résumé des sélections */}
      {selectedUsers.length > 0 && (
        <div style={{
          backgroundColor: '#F0FDF4',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '1rem',
          border: '1px solid #86EFAC'
        }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#166534', marginBottom: '4px' }}>
            ✅ Destinataires ({selectedUsers.length}):
          </div>
          <div style={{ fontSize: '12px', color: '#166534' }}>
            {allUsers
              .filter(u => selectedUsers.includes(u.id))
              .map((u, i) => (
                <span key={u.id}>
                  {u.prenom} {u.nom}
                  {i < selectedUsers.length - 1 && ', '}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Bouton Enregistrer */}
      <Button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%',
          backgroundColor: '#8B5CF6',
          color: 'white'
        }}
      >
        {saving ? '⏳ Enregistrement...' : '💾 Enregistrer'}
      </Button>
    </div>
  );
};

export default ConfigurationEmailsInventaires;
