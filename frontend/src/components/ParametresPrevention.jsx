import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { apiGet, apiPut, getTenantToken } from '../utils/api';

const ParametresPrevention = ({ tenantSlug, currentUser }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [parametres, setParametres] = useState({
    recurrence_inspections: 1, // années
    nombre_visites_requises: 1,
    superviseur_prevention_id: ''
  });
  const [users, setUsers] = useState([]);
  const [preventionnistes, setPreventionnistes] = useState([]);

  useEffect(() => {
    fetchData();
  }, [tenantSlug]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Récupérer tous les utilisateurs pour le dropdown superviseur
      const usersData = await apiGet(tenantSlug, '/users');
      setUsers(usersData);
      
      // Filtrer les préventionnistes
      const prevData = usersData.filter(u => u.est_preventionniste === true);
      setPreventionnistes(prevData);
      
      // Les paramètres seront initialisés avec les valeurs par défaut
      // Ils seront sauvegardés lors du premier enregistrement
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
      alert('Erreur lors du chargement des paramètres');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      await apiPut(tenantSlug, '/prevention/parametres', parametres);
      
      alert('✅ Paramètres sauvegardés avec succès!');
    } catch (error) {
      console.error('Erreur sauvegarde paramètres:', error);
      alert('❌ Erreur lors de la sauvegarde des paramètres');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setParametres(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Chargement des paramètres...</p>
      </div>
    );
  }

  // Vérifier si l'utilisateur est admin
  if (currentUser.role !== 'admin') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>⚠️ Accès restreint</h2>
        <p>Seuls les administrateurs peuvent modifier les paramètres de prévention.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
        ⚙️ Paramètres de Prévention
      </h2>

      {/* Section 1: Récurrence des inspections */}
      <div style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1.5rem',
        marginBottom: '1.5rem'
      }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
          📅 Récurrence des Inspections
        </h3>
        
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            fontWeight: '500', 
            marginBottom: '0.5rem',
            color: '#374151'
          }}>
            Fréquence des inspections
          </label>
          <select
            value={parametres.recurrence_inspections}
            onChange={(e) => handleChange('recurrence_inspections', parseInt(e.target.value))}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem'
            }}
          >
            <option value={1}>1 an (annuelle)</option>
            <option value={2}>2 ans (bisannuelle)</option>
            <option value={3}>3 ans</option>
            <option value={4}>4 ans</option>
            <option value={5}>5 ans</option>
          </select>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
            Les bâtiments devront être inspectés tous les {parametres.recurrence_inspections} an(s)
          </p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            fontWeight: '500', 
            marginBottom: '0.5rem',
            color: '#374151'
          }}>
            Nombre de visites requises pour compléter l'inspection
          </label>
          <select
            value={parametres.nombre_visites_requises}
            onChange={(e) => handleChange('nombre_visites_requises', parseInt(e.target.value))}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem'
            }}
          >
            <option value={1}>1 visite</option>
            <option value={2}>2 visites</option>
            <option value={3}>3 visites</option>
          </select>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
            📝 Après {parametres.nombre_visites_requises} visite(s), l'adresse sera marquée comme complétée (verte) peu importe le statut final
          </p>
        </div>
      </div>

      {/* Section 2: Gestion des Préventionnistes */}
      <div style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        padding: '1.5rem',
        marginBottom: '1.5rem'
      }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
          👨‍🚒 Gestion des Préventionnistes
        </h3>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            fontWeight: '500', 
            marginBottom: '0.5rem',
            color: '#374151'
          }}>
            Superviseur Prévention
          </label>
          <select
            value={parametres.superviseur_prevention_id}
            onChange={(e) => handleChange('superviseur_prevention_id', e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem'
            }}
          >
            <option value="">Aucun superviseur désigné</option>
            {users.filter(u => u.role === 'admin' || u.est_preventionniste).map(user => (
              <option key={user.id} value={user.id}>
                {user.prenom} {user.nom} - {user.role === 'admin' ? 'Admin' : 'Préventionniste'}
              </option>
            ))}
          </select>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
            Le superviseur aura accès complet aux données de tous les préventionnistes et recevra les demandes de validation des plans d'intervention
          </p>
        </div>

        <div style={{
          backgroundColor: '#f3f4f6',
          padding: '1rem',
          borderRadius: '6px',
          marginTop: '1rem'
        }}>
          <p style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
            📊 Préventionnistes actifs: {preventionnistes.length}
          </p>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Les préventionnistes sont définis dans le module Personnel
          </p>
        </div>
      </div>

      {/* Bouton Sauvegarder */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
        <Button
          onClick={handleSave}
          disabled={saving}
          style={{
            backgroundColor: '#3b82f6',
            color: 'white',
            padding: '0.75rem 1.5rem'
          }}
        >
          {saving ? '⏳ Sauvegarde...' : '💾 Sauvegarder les paramètres'}
        </Button>
      </div>
    </div>
  );
};

export default ParametresPrevention;
