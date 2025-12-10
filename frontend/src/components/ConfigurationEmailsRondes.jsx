import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { apiGet, apiPut } from '../utils/api';

const ConfigurationEmailsRondes = ({ tenantSlug }) => {
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfiguration();
    loadUsers();
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
      const config = await apiGet(tenantSlug, '/actifs/configuration-emails-rondes');
      setSelectedUsers(config.user_ids_rondes_securite || []);
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
      await apiPut(tenantSlug, '/actifs/configuration-emails-rondes', {
        user_ids_rondes_securite: selectedUsers
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
    return <div style={{ padding: '2rem' }}>Chargement...</div>;
  }

  const selectedUsersDetails = getSelectedUsersDetails();

  return (
    <div>
      {/* Section Rondes de Sécurité */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '25px', 
        borderRadius: '10px', 
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        border: '1px solid #e0e0e0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '2rem' }}>🔧</span>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', margin: 0, color: '#111827' }}>
              Rondes de Sécurité (Véhicules)
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6B7280', margin: 0 }}>
              Notifications automatiques des rapports de rondes de sécurité SAAQ
            </p>
          </div>
        </div>

        <div style={{ 
          backgroundColor: '#F9FAFB', 
          padding: '1.25rem', 
          borderRadius: '8px',
          marginBottom: '1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: '600', margin: 0, color: '#374151' }}>
              👥 Destinataires ({selectedUsersDetails.length})
            </h4>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleSelectAll}
                style={{
                  padding: '0.4rem 0.75rem',
                  backgroundColor: 'white',
                  color: '#DC2626',
                  border: '1px solid #DC2626',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.813rem',
                  fontWeight: '500'
                }}
              >
                Tout sélectionner
              </button>
              <button
                onClick={handleDeselectAll}
                style={{
                  padding: '0.4rem 0.75rem',
                  backgroundColor: 'white',
                  color: '#6B7280',
                  border: '1px solid #D1D5DB',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.813rem',
                  fontWeight: '500'
                }}
              >
                Tout désélectionner
              </button>
            </div>
          </div>

          {/* Liste des utilisateurs sélectionnables */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
            {allUsers.map(user => {
              const isSelected = selectedUsers.includes(user.id);
              return (
                <div
                  key={user.id}
                  onClick={() => handleToggleUser(user.id)}
                  style={{
                    padding: '0.875rem',
                    backgroundColor: isSelected ? '#FEE2E2' : 'white',
                    border: isSelected ? '2px solid #DC2626' : '1px solid #E5E7EB',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', fontSize: '0.875rem', color: '#111827', marginBottom: '0.25rem' }}>
                      {user.prenom} {user.nom}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6B7280', marginBottom: '0.15rem' }}>
                      ✉️ {user.email}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: '500' }}>
                      {user.role === 'admin' ? '👑 Administrateur' : '👔 Superviseur'}
                    </div>
                  </div>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: isSelected ? '#DC2626' : 'white',
                    border: isSelected ? 'none' : '2px solid #D1D5DB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: '700'
                  }}>
                    {isSelected && '✓'}
                  </div>
                </div>
              );
            })}
          </div>

          {allUsers.length === 0 && (
            <p style={{ color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>
              Aucun administrateur ou superviseur trouvé
            </p>
          )}
        </div>

        {/* Résumé des destinataires sélectionnés */}
        {selectedUsersDetails.length > 0 && (
          <div style={{ 
            backgroundColor: '#ECFDF5', 
            padding: '1rem', 
            borderRadius: '6px',
            border: '1px solid #A7F3D0',
            marginBottom: '1rem'
          }}>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#065F46', marginBottom: '0.5rem' }}>
              ✅ Destinataires configurés:
            </div>
            <div style={{ fontSize: '0.813rem', color: '#047857' }}>
              {selectedUsersDetails.map((u, i) => (
                <span key={u.id}>
                  {u.prenom} {u.nom} ({u.email})
                  {i < selectedUsersDetails.length - 1 && ' • '}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Bouton de sauvegarde */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{
              backgroundColor: '#DC2626',
              color: 'white',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '0.938rem',
              fontWeight: '600',
              opacity: saving ? 0.5 : 1
            }}
          >
            {saving ? 'Enregistrement...' : '💾 Enregistrer la configuration'}
          </Button>
        </div>
      </div>

      {/* Section EPI (Future) */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '2rem', 
        borderRadius: '12px', 
        border: '1px solid #E5E7EB',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: '1.5rem',
        opacity: 0.6
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '2rem' }}>🛡️</span>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', margin: 0, color: '#111827' }}>
              Équipements de Protection Individuelle (EPI)
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6B7280', margin: 0 }}>
              Notifications des demandes de remplacement d'EPI
            </p>
          </div>
        </div>
        <div style={{ 
          padding: '1.5rem', 
          backgroundColor: '#F9FAFB', 
          borderRadius: '8px',
          textAlign: 'center',
          border: '2px dashed #D1D5DB'
        }}>
          <p style={{ color: '#6B7280', fontSize: '0.938rem', margin: 0 }}>
            🚧 Configuration à venir
          </p>
        </div>
      </div>

      {/* Section Future */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '2rem', 
        borderRadius: '12px', 
        border: '1px solid #E5E7EB',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        opacity: 0.6
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '2rem' }}>➕</span>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', margin: 0, color: '#111827' }}>
              Autres modules
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6B7280', margin: 0 }}>
              Configurations supplémentaires à venir
            </p>
          </div>
        </div>
        <div style={{ 
          padding: '1.5rem', 
          backgroundColor: '#F9FAFB', 
          borderRadius: '8px',
          textAlign: 'center',
          border: '2px dashed #D1D5DB'
        }}>
          <p style={{ color: '#6B7280', fontSize: '0.938rem', margin: 0 }}>
            🚧 Prochainement disponible
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConfigurationEmailsRondes;
