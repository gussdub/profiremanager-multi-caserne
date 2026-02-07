import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { 
  Calendar, Plus, Edit, Trash2, RefreshCw, Check, X, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TabJoursFeries = ({ tenant }) => {
  const [joursFeries, setJoursFeries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [anneeSelectionnee, setAnneeSelectionnee] = useState(new Date().getFullYear());
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingJour, setEditingJour] = useState(null);
  const [formData, setFormData] = useState({
    nom: '',
    date: '',
    type_ferie: 'personnalise',
    majoration_temps_partiel: 1.5,
    majoration_temps_plein: 1.0,
    actif: true
  });

  const getToken = () => localStorage.getItem(`${tenant}_token`);

  const fetchJoursFeries = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/${tenant}/paie/jours-feries?annee=${anneeSelectionnee}`,
        { headers: { 'Authorization': `Bearer ${getToken()}` } }
      );
      if (response.ok) {
        const data = await response.json();
        // Trier par date
        data.sort((a, b) => a.date.localeCompare(b.date));
        setJoursFeries(data);
      }
    } catch (error) {
      console.error('Erreur chargement jours fériés:', error);
      toast.error('Erreur lors du chargement des jours fériés');
    } finally {
      setLoading(false);
    }
  }, [tenant, anneeSelectionnee]);

  useEffect(() => {
    fetchJoursFeries();
  }, [fetchJoursFeries]);

  const handleAddJourFerie = async () => {
    if (!formData.nom || !formData.date) {
      toast.error('Veuillez remplir le nom et la date');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/jours-feries`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success('Jour férié ajouté avec succès');
        setShowAddForm(false);
        setFormData({
          nom: '',
          date: '',
          type_ferie: 'personnalise',
          majoration_temps_partiel: 1.5,
          majoration_temps_plein: 1.0,
          actif: true
        });
        fetchJoursFeries();
      } else {
        toast.error('Erreur lors de l\'ajout');
      }
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de l\'ajout');
    }
  };

  const handleUpdateJourFerie = async () => {
    if (!editingJour) return;

    try {
      const response = await fetch(
        `${API_URL}/api/${tenant}/paie/jours-feries/${editingJour.id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formData)
        }
      );

      if (response.ok) {
        toast.success('Jour férié modifié avec succès');
        setEditingJour(null);
        fetchJoursFeries();
      } else {
        toast.error('Erreur lors de la modification');
      }
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la modification');
    }
  };

  const handleDeleteJourFerie = async (id, nom) => {
    if (!window.confirm(`Supprimer le jour férié "${nom}" ?`)) return;

    try {
      const response = await fetch(
        `${API_URL}/api/${tenant}/paie/jours-feries/${id}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${getToken()}` }
        }
      );

      if (response.ok) {
        toast.success('Jour férié supprimé');
        fetchJoursFeries();
      } else {
        toast.error('Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleGenererAnnee = async (annee) => {
    if (!window.confirm(`Générer les jours fériés pour ${annee} ?`)) return;

    try {
      const response = await fetch(
        `${API_URL}/api/${tenant}/paie/jours-feries/generer-annee`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ annee })
        }
      );

      const data = await response.json();
      if (data.success) {
        toast.success(data.message);
        setAnneeSelectionnee(annee);
        fetchJoursFeries();
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors de la génération');
    }
  };

  const startEdit = (jour) => {
    setEditingJour(jour);
    setFormData({
      nom: jour.nom,
      date: jour.date,
      type_ferie: jour.type_ferie,
      majoration_temps_partiel: jour.majoration_temps_partiel || 1.5,
      majoration_temps_plein: jour.majoration_temps_plein || 1.0,
      actif: jour.actif !== false
    });
    setShowAddForm(false);
  };

  const cancelEdit = () => {
    setEditingJour(null);
    setShowAddForm(false);
    setFormData({
      nom: '',
      date: '',
      type_ferie: 'personnalise',
      majoration_temps_partiel: 1.5,
      majoration_temps_plein: 1.0,
      actif: true
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('fr-CA', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
  };

  const getTypeBadge = (type) => {
    const types = {
      provincial: { bg: '#dbeafe', color: '#1e40af', text: 'Provincial' },
      federal: { bg: '#fef3c7', color: '#92400e', text: 'Fédéral' },
      personnalise: { bg: '#f3e8ff', color: '#7c3aed', text: 'Personnalisé' }
    };
    const t = types[type] || types.personnalise;
    return (
      <span style={{
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '0.7rem',
        fontWeight: '600',
        background: t.bg,
        color: t.color
      }}>
        {t.text}
      </span>
    );
  };

  const anneesDisponibles = [
    new Date().getFullYear() - 1,
    new Date().getFullYear(),
    new Date().getFullYear() + 1
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* En-tête avec sélecteur d'année */}
      <div style={{ 
        background: 'white', 
        borderRadius: '12px', 
        padding: '20px', 
        border: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
            <Calendar size={20} /> Jours Fériés
          </h3>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
            Gérez les jours fériés pour le calcul de la paie
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={anneeSelectionnee}
            onChange={(e) => setAnneeSelectionnee(parseInt(e.target.value))}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontWeight: '600'
            }}
          >
            {anneesDisponibles.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleGenererAnnee(anneeSelectionnee + 1)}
            disabled={loading}
          >
            <RefreshCw size={16} className="mr-2" />
            Générer {anneeSelectionnee + 1}
          </Button>

          <Button
            onClick={() => {
              setShowAddForm(true);
              setEditingJour(null);
              setFormData({
                nom: '',
                date: `${anneeSelectionnee}-01-01`,
                type_ferie: 'personnalise',
                majoration_temps_partiel: 1.5,
                majoration_temps_plein: 1.0,
                actif: true
              });
            }}
            style={{ background: '#dc2626' }}
          >
            <Plus size={16} className="mr-2" />
            Ajouter
          </Button>
        </div>
      </div>

      {/* Formulaire d'ajout/modification */}
      {(showAddForm || editingJour) && (
        <div style={{ 
          background: '#fef2f2', 
          borderRadius: '12px', 
          padding: '20px', 
          border: '2px solid #fecaca'
        }}>
          <h4 style={{ margin: '0 0 16px 0', color: '#dc2626' }}>
            {editingJour ? '✏️ Modifier le jour férié' : '➕ Ajouter un jour férié'}
          </h4>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '16px' 
          }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Nom du jour férié *
              </label>
              <Input
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                placeholder="Ex: Journée de la caserne"
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Date *
              </label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Type
              </label>
              <select
                value={formData.type_ferie}
                onChange={(e) => setFormData({ ...formData, type_ferie: e.target.value })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
              >
                <option value="provincial">Provincial</option>
                <option value="federal">Fédéral</option>
                <option value="personnalise">Personnalisé</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Majoration temps partiel/temporaire
              </label>
              <Input
                type="number"
                step="0.1"
                min="1"
                max="3"
                value={formData.majoration_temps_partiel}
                onChange={(e) => setFormData({ ...formData, majoration_temps_partiel: parseFloat(e.target.value) || 1.5 })}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Ex: 1.5 = temps et demi
              </span>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Majoration temps plein
              </label>
              <Input
                type="number"
                step="0.1"
                min="1"
                max="3"
                value={formData.majoration_temps_plein}
                onChange={(e) => setFormData({ ...formData, majoration_temps_plein: parseFloat(e.target.value) || 1.0 })}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Généralement 1.0 (payé en fin d'année)
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="actif"
                checked={formData.actif}
                onChange={(e) => setFormData({ ...formData, actif: e.target.checked })}
              />
              <label htmlFor="actif" style={{ fontWeight: '500', fontSize: '0.875rem' }}>
                Actif
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <Button
              onClick={editingJour ? handleUpdateJourFerie : handleAddJourFerie}
              style={{ background: '#059669' }}
            >
              <Check size={16} className="mr-2" />
              {editingJour ? 'Enregistrer' : 'Ajouter'}
            </Button>
            <Button variant="outline" onClick={cancelEdit}>
              <X size={16} className="mr-2" />
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* Info sur les majorations */}
      <div style={{ 
        background: '#fffbeb', 
        borderRadius: '8px', 
        padding: '12px 16px', 
        border: '1px solid #fcd34d',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px'
      }}>
        <AlertTriangle size={20} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '0.875rem', color: '#92400e' }}>
          <strong>Règle de majoration :</strong> Les temps partiels et temporaires travaillant un jour férié 
          reçoivent une majoration (temps et demi par défaut). Les temps pleins ne reçoivent généralement 
          pas de majoration car les fériés sont payés en bloc en fin d'année.
        </div>
      </div>

      {/* Liste des jours fériés */}
      <div style={{ 
        background: 'white', 
        borderRadius: '12px', 
        padding: '20px', 
        border: '1px solid #e5e7eb'
      }}>
        <h4 style={{ margin: '0 0 16px 0', color: '#374151' }}>
          📅 Jours fériés {anneeSelectionnee} ({joursFeries.length})
        </h4>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
            Chargement...
          </div>
        ) : joursFeries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <Calendar size={48} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <p>Aucun jour férié pour {anneeSelectionnee}</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleGenererAnnee(anneeSelectionnee)}
              style={{ marginTop: '8px' }}
            >
              Générer les jours fériés du Québec
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {joursFeries.map((jour) => (
              <div
                key={jour.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: jour.actif ? '#f8fafc' : '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  opacity: jour.actif ? 1 : 0.6
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                  <div style={{ 
                    width: '50px', 
                    height: '50px', 
                    background: jour.actif ? '#fee2e2' : '#e5e7eb',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>
                      {new Date(jour.date + 'T00:00:00').toLocaleDateString('fr-CA', { month: 'short' })}
                    </span>
                    <span style={{ fontSize: '1.25rem', fontWeight: '700', color: jour.actif ? '#dc2626' : '#64748b' }}>
                      {jour.date.split('-')[2]}
                    </span>
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {jour.nom}
                      {getTypeBadge(jour.type_ferie)}
                      {!jour.actif && (
                        <span style={{ 
                          padding: '2px 6px', 
                          borderRadius: '4px', 
                          fontSize: '0.65rem', 
                          background: '#ef4444', 
                          color: 'white' 
                        }}>
                          INACTIF
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      {formatDate(jour.date)}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', minWidth: '150px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Majoration</div>
                    <div style={{ fontSize: '0.875rem' }}>
                      <span style={{ color: '#7c3aed', fontWeight: '600' }}>
                        Partiel: ×{jour.majoration_temps_partiel || 1.5}
                      </span>
                      <span style={{ color: '#94a3b8', margin: '0 4px' }}>|</span>
                      <span style={{ color: '#64748b' }}>
                        Plein: ×{jour.majoration_temps_plein || 1.0}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '4px', marginLeft: '16px' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(jour)}
                    title="Modifier"
                  >
                    <Edit size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteJourFerie(jour.id, jour.nom)}
                    title="Supprimer"
                    style={{ color: '#ef4444' }}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TabJoursFeries;
