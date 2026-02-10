import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { 
  Calendar, Plus, Edit, Trash2, Check, X, AlertTriangle
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
    majoration_temps_partiel: 1.5,
    majoration_temps_plein: 1.0
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
        toast.success('Jour férié personnalisé ajouté');
        setShowAddForm(false);
        setFormData({
          nom: '',
          date: '',
          majoration_temps_partiel: 1.5,
          majoration_temps_plein: 1.0
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
        toast.success('Jour férié modifié');
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

  const handleDeleteJourFerie = async (jour) => {
    if (!jour.est_personnalise) {
      toast.error('Les jours fériés standards ne peuvent pas être supprimés');
      return;
    }
    
    if (!window.confirm(`Supprimer le jour férié "${jour.nom}" ?`)) return;

    try {
      const response = await fetch(
        `${API_URL}/api/${tenant}/paie/jours-feries/${jour.id}`,
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
      toast.error('Erreur');
    }
  };

  const startEdit = (jour) => {
    setEditingJour(jour);
    setFormData({
      nom: jour.nom,
      date: jour.date,
      majoration_temps_partiel: jour.majoration_temps_partiel || 1.5,
      majoration_temps_plein: jour.majoration_temps_plein || 1.0
    });
    setShowAddForm(false);
  };

  const cancelEdit = () => {
    setEditingJour(null);
    setShowAddForm(false);
    setFormData({
      nom: '',
      date: '',
      majoration_temps_partiel: 1.5,
      majoration_temps_plein: 1.0
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

  const getTypeBadge = (jour) => {
    if (jour.est_personnalise) {
      return (
        <span style={{
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '0.7rem',
          fontWeight: '600',
          background: '#f3e8ff',
          color: '#7c3aed'
        }}>
          Personnalisé
        </span>
      );
    }
    
    const types = {
      provincial: { bg: '#dbeafe', color: '#1e40af', text: 'Provincial' },
      federal: { bg: '#fef3c7', color: '#92400e', text: 'Fédéral' }
    };
    const t = types[jour.type_ferie] || types.provincial;
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

  const anneesDisponibles = [];
  for (let i = -2; i <= 5; i++) {
    anneesDisponibles.push(new Date().getFullYear() + i);
  }

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
            Les dates sont calculées automatiquement pour chaque année
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
            onClick={() => {
              setShowAddForm(true);
              setEditingJour(null);
              setFormData({
                nom: '',
                date: `${anneeSelectionnee}-01-01`,
                majoration_temps_partiel: 1.5,
                majoration_temps_plein: 1.0
              });
            }}
            style={{ background: '#dc2626' }}
          >
            <Plus size={16} className="mr-2" />
            Jour personnalisé
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
            {editingJour 
              ? (editingJour.est_personnalise ? '✏️ Modifier le jour personnalisé' : '⚙️ Modifier les majorations')
              : '➕ Ajouter un jour férié personnalisé'}
          </h4>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '16px' 
          }}>
            {/* Nom et date seulement pour les nouveaux ou les personnalisés */}
            {(showAddForm || (editingJour && editingJour.est_personnalise)) && (
              <>
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
              </>
            )}

            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Majoration temps partiel/temporaire
              </label>
              <Input
                type="text"
                inputMode="decimal"
                value={formData.majoration_temps_partiel}
                onChange={(e) => {
                  let val = e.target.value.replace(',', '.');
                  setFormData({ ...formData, majoration_temps_partiel: val });
                }}
                onBlur={(e) => {
                  const num = parseFloat(e.target.value.replace(',', '.'));
                  setFormData({ ...formData, majoration_temps_partiel: isNaN(num) ? 1.5 : num });
                }}
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
                type="text"
                inputMode="decimal"
                value={formData.majoration_temps_plein}
                onChange={(e) => {
                  let val = e.target.value.replace(',', '.');
                  setFormData({ ...formData, majoration_temps_plein: val });
                }}
                onBlur={(e) => {
                  const num = parseFloat(e.target.value.replace(',', '.'));
                  setFormData({ ...formData, majoration_temps_plein: isNaN(num) ? 1.0 : num });
                }}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Généralement 1.0 (payé en fin d'année)
              </span>
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

      {/* Info sur le calcul automatique */}
      <div style={{ 
        background: '#ecfdf5', 
        borderRadius: '8px', 
        padding: '12px 16px', 
        border: '1px solid #6ee7b7',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px'
      }}>
        <Check size={20} style={{ color: '#059669', flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '0.875rem', color: '#065f46' }}>
          <strong>Calcul automatique :</strong> Les dates des jours fériés récurrents (comme Pâques, Fête du Travail, Action de grâce) 
          sont calculées automatiquement pour chaque année. Vous n'avez rien à faire !
        </div>
      </div>

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
          reçoivent une majoration (×1.5 par défaut). Les temps pleins ne reçoivent pas de majoration car les fériés sont payés en fin d'année.
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
            Chargement...
          </div>
        ) : joursFeries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            <Calendar size={48} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <p>Aucun jour férié actif pour {anneeSelectionnee}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {joursFeries.map((jour) => (
              <div
                key={jour.id}
                data-testid={`jour-ferie-${jour.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                  <div style={{ 
                    width: '50px', 
                    height: '50px', 
                    background: '#fee2e2',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>
                      {new Date(jour.date + 'T00:00:00').toLocaleDateString('fr-CA', { month: 'short' })}
                    </span>
                    <span style={{ fontSize: '1.25rem', fontWeight: '700', color: '#dc2626' }}>
                      {jour.date.split('-')[2]}
                    </span>
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {jour.nom}
                      {getTypeBadge(jour)}
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
                    title="Modifier les majorations"
                    data-testid={`edit-jour-${jour.id}`}
                  >
                    <Edit size={16} />
                  </Button>
                  {jour.est_personnalise && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteJourFerie(jour)}
                      title="Supprimer"
                      style={{ color: '#ef4444' }}
                      data-testid={`delete-jour-${jour.id}`}
                    >
                      <Trash2 size={16} />
                    </Button>
                  )}
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
