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
        emails_rondes_securite: emails
      });
      alert('✅ Configuration sauvegardée avec succès');
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('❌ Erreur lors de la sauvegarde: ' + (error.data?.detail || error.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem' }}>Chargement...</div>;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem' }}>
        📧 Configuration des emails automatiques
      </h2>
      
      <p style={{ color: '#6B7280', marginBottom: '1.5rem' }}>
        Les rapports de rondes de sécurité seront automatiquement envoyés par email aux destinataires configurés ci-dessous.
      </p>

      <div style={{ 
        backgroundColor: 'white', 
        padding: '1.5rem', 
        borderRadius: '8px', 
        border: '1px solid #E5E7EB',
        marginBottom: '1.5rem'
      }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem' }}>
          Destinataires des rapports
        </h3>

        {/* Liste des emails */}
        {emails.length > 0 ? (
          <div style={{ marginBottom: '1rem' }}>
            {emails.map((email, index) => (
              <div 
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.75rem',
                  backgroundColor: '#F9FAFB',
                  borderRadius: '6px',
                  marginBottom: '0.5rem'
                }}
              >
                <span style={{ color: '#374151' }}>✉️ {email}</span>
                <button
                  onClick={() => handleRemoveEmail(email)}
                  style={{
                    padding: '0.25rem 0.75rem',
                    backgroundColor: '#FEE2E2',
                    color: '#DC2626',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#9CA3AF', fontStyle: 'italic', marginBottom: '1rem' }}>
            Aucun destinataire configuré. Les rapports ne seront pas envoyés automatiquement.
          </p>
        )}

        {/* Formulaire d'ajout */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddEmail()}
            placeholder="exemple@email.com"
            style={{
              flex: 1,
              padding: '0.5rem',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              fontSize: '0.875rem'
            }}
          />
          <Button
            onClick={handleAddEmail}
            style={{
              backgroundColor: '#DC2626',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            + Ajouter
          </Button>
        </div>
      </div>

      {/* Bouton de sauvegarde */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          onClick={handleSave}
          disabled={saving}
          style={{
            backgroundColor: '#DC2626',
            color: 'white',
            padding: '0.75rem 1.5rem',
            borderRadius: '6px',
            border: 'none',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
            fontWeight: '600',
            opacity: saving ? 0.5 : 1
          }}
        >
          {saving ? 'Enregistrement...' : '💾 Enregistrer la configuration'}
        </Button>
      </div>

      {/* Informations supplémentaires */}
      <div style={{ 
        marginTop: '2rem', 
        padding: '1rem', 
        backgroundColor: '#EFF6FF', 
        borderRadius: '6px',
        border: '1px solid #DBEAFE'
      }}>
        <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1E40AF', marginBottom: '0.5rem' }}>
          ℹ️ Information
        </h4>
        <p style={{ fontSize: '0.875rem', color: '#1E40AF', margin: 0 }}>
          Les emails seront envoyés automatiquement lors de la création d'une nouvelle ronde de sécurité. 
          Le rapport PDF sera joint à l'email.
        </p>
      </div>
    </div>
  );
};

export default ConfigurationEmailsRondes;
