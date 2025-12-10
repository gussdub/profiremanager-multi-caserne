import React, { useState, useEffect } from 'react';
import { apiGet, apiPut } from '../utils/api';

const ConfigurationEmailsBornesSeches = ({ tenantSlug }) => {
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);

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
      const config = await apiGet(tenantSlug, '/actifs/parametres');
      setSelectedUsers(config.emails_notifications_bornes_seches || []);
    } catch (error) {
      console.error('Erreur chargement configuration:', error);
      setSelectedUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleUser = async (userId) => {
    try {
      const newSelection = selectedUsers.includes(userId)
        ? selectedUsers.filter(id => id !== userId)
        : [...selectedUsers, userId];

      // Sauvegarder immédiatement
      const config = await apiGet(tenantSlug, '/actifs/parametres');
      await apiPut(tenantSlug, '/actifs/parametres', {
        ...config,
        emails_notifications_bornes_seches: newSelection
      });

      setSelectedUsers(newSelection);
    } catch (error) {
      console.error('Erreur mise à jour:', error);
      alert('❌ Erreur lors de la mise à jour');
    }
  };

  if (loading) {
    return <div style={{ padding: '1rem', color: '#6c757d' }}>Chargement...</div>;
  }

  if (allUsers.length === 0) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '40px', 
        background: '#f8f9fa', 
        borderRadius: '8px',
        color: '#7f8c8d'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '10px' }}>👥</div>
        <p>Aucun administrateur ou superviseur trouvé</p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ color: '#7f8c8d', marginBottom: '20px', fontSize: '14px' }}>
        Sélectionnez les administrateurs et superviseurs qui recevront un email lorsqu'un défaut est détecté lors d'une inspection
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {allUsers.map(utilisateur => {
          const isSelected = selectedUsers.includes(utilisateur.id);
          
          return (
            <div
              key={utilisateur.id}
              onClick={() => toggleUser(utilisateur.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '15px 20px',
                background: isSelected ? '#e8f5e9' : 'white',
                border: `2px solid ${isSelected ? '#4caf50' : '#dee2e6'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}}
                style={{
                  width: '20px',
                  height: '20px',
                  marginRight: '15px',
                  cursor: 'pointer',
                  accentColor: '#4caf50'
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '3px', color: '#2c3e50' }}>
                  {utilisateur.prenom} {utilisateur.nom}
                </div>
                <div style={{ fontSize: '14px', color: '#6c757d' }}>
                  {utilisateur.email}
                </div>
              </div>
              <span style={{
                padding: '4px 12px',
                background: utilisateur.role === 'admin' ? '#3498db' : '#9b59b6',
                color: 'white',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                {utilisateur.role === 'admin' ? 'Admin' : 'Superviseur'}
              </span>
            </div>
          );
        })}
      </div>

      {allUsers.length > 0 && (
        <div style={{ 
          marginTop: '20px', 
          padding: '15px', 
          background: '#e3f2fd', 
          borderRadius: '8px',
          border: '1px solid #90caf9'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#1565c0', fontSize: '14px' }}>
            <span style={{ fontSize: '20px' }}>ℹ️</span>
            <div>
              <strong>{selectedUsers.length} personne(s) sélectionnée(s)</strong> 
              <span style={{ marginLeft: '5px' }}>
                recevront un email automatiquement lorsqu'un défaut est détecté sur une borne sèche
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigurationEmailsBornesSeches;
