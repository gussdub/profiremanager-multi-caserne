import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { apiGet, apiPut } from '../utils/api';

const ConfigurationEmailsEquipements = ({ tenantSlug }) => {
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
      const config = await apiGet(tenantSlug, '/equipements/parametres');
      setSelectedUsers(config.emails_notifications_equipements || []);
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
      await apiPut(tenantSlug, '/equipements/parametres', {
        emails_notifications_equipements: selectedUsers
      });
      alert('✅ Configuration sauvegardée avec succès');
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('❌ Erreur lors de la sauvegarde: ' + (error.data?.detail || error.message));
    } finally {
      setSaving(false);
    }
  };

  const getSelectedUsersDetails = () => {
    return allUsers.filter(u => selectedUsers.includes(u.id));
  };

  if (loading) {
    return <div style={{ padding: '1rem', color: '#6b7280' }}>Chargement...</div>;
  }

  const selectedUsersDetails = getSelectedUsersDetails();

  return (
    <div>
      {/* Liste des destinataires sélectionnés */}
      <div style={{ marginBottom: '1rem' }}>
        <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
          Destinataires actuels ({selectedUsersDetails.length})
        </h4>
        {selectedUsersDetails.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: '14px', fontStyle: 'italic' }}>
            Aucun destinataire sélectionné
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {selectedUsersDetails.map(user => (
              <span
                key={user.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.25rem 0.75rem',
                  background: '#dbeafe',
                  color: '#1e40af',
                  borderRadius: '9999px',
                  fontSize: '13px'
                }}
              >
                {user.prenom} {user.nom}
                <button
                  onClick={() => handleToggleUser(user.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0 2px',
                    color: '#3b82f6',
                    fontWeight: 'bold'
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sélection des utilisateurs */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
            Sélectionner les destinataires
          </h4>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleSelectAll}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '12px',
                background: '#e5e7eb',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: 'pointer'
              }}
            >
              Tout sélectionner
            </button>
            <button
              onClick={handleDeselectAll}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '12px',
                background: '#e5e7eb',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: 'pointer'
              }}
            >
              Tout désélectionner
            </button>
          </div>
        </div>
        
        <div style={{
          maxHeight: '200px',
          overflowY: 'auto',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          background: 'white'
        }}>
          {allUsers.length === 0 ? (
            <p style={{ padding: '1rem', color: '#9ca3af', textAlign: 'center' }}>
              Aucun admin ou superviseur trouvé
            </p>
          ) : (
            allUsers.map(user => (
              <label
                key={user.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f3f4f6',
                  background: selectedUsers.includes(user.id) ? '#f0f9ff' : 'transparent'
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(user.id)}
                  onChange={() => handleToggleUser(user.id)}
                  style={{ marginRight: '0.75rem' }}
                />
                <div>
                  <span style={{ fontWeight: '500', color: '#1f2937' }}>
                    {user.prenom} {user.nom}
                  </span>
                  <span style={{ 
                    marginLeft: '0.5rem',
                    padding: '0.125rem 0.5rem',
                    background: user.role === 'admin' ? '#fef3c7' : '#e0e7ff',
                    color: user.role === 'admin' ? '#92400e' : '#3730a3',
                    borderRadius: '9999px',
                    fontSize: '11px',
                    fontWeight: '500'
                  }}>
                    {user.role === 'admin' ? 'Admin' : 'Superviseur'}
                  </span>
                  {user.email && (
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: '0.25rem 0 0 0' }}>
                      {user.email}
                    </p>
                  )}
                </div>
              </label>
            ))
          )}
        </div>
      </div>

      {/* Bouton sauvegarder */}
      <Button
        onClick={handleSave}
        disabled={saving}
        style={{ width: '100%' }}
      >
        {saving ? 'Sauvegarde en cours...' : '💾 Sauvegarder les destinataires'}
      </Button>
    </div>
  );
};

export default ConfigurationEmailsEquipements;
