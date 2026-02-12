import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, X, Save, Wrench, Calendar, DollarSign } from 'lucide-react';
import { useConfirmDialog } from './ui/ConfirmDialog';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Composant pour gérer les réparations/entretiens d'un véhicule
 */
const ReparationsVehicule = ({ vehicule, tenant, onClose, onUpdate }) => {
  const { confirm } = useConfirmDialog();
  const [reparations, setReparations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [coutTotal, setCoutTotal] = useState(0);
  const [filtreType, setFiltreType] = useState('');
  
  const [formData, setFormData] = useState({
    date_reparation: new Date().toISOString().split('T')[0],
    type_intervention: 'entretien_preventif',
    description: '',
    cout: '',
    fournisseur: '',
    kilometrage_actuel: vehicule?.kilometrage || '',
    pieces_remplacees: '',
    numero_facture: '',
    statut: 'complete',
    date_signalement: '',
    priorite: 'normale',
    notes: ''
  });

  const getToken = () => localStorage.getItem(`${tenant}_token`);

  const typesIntervention = [
    { value: 'entretien_preventif', label: '🔧 Entretien préventif (vidange, filtres)', color: '#3b82f6' },
    { value: 'reparation_mineure', label: '⚠️ Réparation mineure (délai 48h)', color: '#f97316' },
    { value: 'reparation_majeure', label: '🔴 Réparation majeure (immobilisation)', color: '#dc2626' },
    { value: 'inspection_mecanique', label: '📋 Inspection mécanique (PEP/vignette)', color: '#8b5cf6' },
    { value: 'autre', label: '📝 Autre', color: '#6b7280' }
  ];

  const fetchReparations = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filtreType) params.append('type_intervention', filtreType);
      
      const response = await fetch(
        `${API_URL}/api/${tenant}/actifs/vehicules/${vehicule.id}/reparations?${params}`,
        { headers: { 'Authorization': `Bearer ${getToken()}` } }
      );
      
      if (response.ok) {
        const data = await response.json();
        setReparations(data.reparations || []);
        setCoutTotal(data.cout_total || 0);
      }
    } catch (error) {
      console.error('Erreur chargement réparations:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (vehicule?.id) {
      fetchReparations();
    }
  }, [vehicule?.id, filtreType]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.description.trim()) {
      toast.error('La description est requise');
      return;
    }
    
    try {
      const url = editingId 
        ? `${API_URL}/api/${tenant}/actifs/reparations/${editingId}`
        : `${API_URL}/api/${tenant}/actifs/vehicules/${vehicule.id}/reparations`;
      
      const method = editingId ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          cout: formData.cout ? parseFloat(formData.cout) : null,
          kilometrage_actuel: formData.kilometrage_actuel ? parseFloat(formData.kilometrage_actuel) : null
        })
      });
      
      if (response.ok) {
        toast.success(editingId ? 'Réparation modifiée' : 'Réparation ajoutée');
        resetForm();
        fetchReparations();
        if (onUpdate) onUpdate();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur lors de l\'enregistrement');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette entrée ?')) return;
    
    try {
      const response = await fetch(
        `${API_URL}/api/${tenant}/actifs/reparations/${id}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${getToken()}` }
        }
      );
      
      if (response.ok) {
        toast.success('Entrée supprimée');
        fetchReparations();
      }
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleEdit = (rep) => {
    setFormData({
      date_reparation: rep.date_reparation || '',
      type_intervention: rep.type_intervention || 'autre',
      description: rep.description || '',
      cout: rep.cout || '',
      fournisseur: rep.fournisseur || '',
      kilometrage_actuel: rep.kilometrage_actuel || '',
      pieces_remplacees: rep.pieces_remplacees || '',
      numero_facture: rep.numero_facture || '',
      statut: rep.statut || 'complete',
      date_signalement: rep.date_signalement || '',
      priorite: rep.priorite || 'normale',
      notes: rep.notes || ''
    });
    setEditingId(rep.id);
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      date_reparation: new Date().toISOString().split('T')[0],
      type_intervention: 'entretien_preventif',
      description: '',
      cout: '',
      fournisseur: '',
      kilometrage_actuel: vehicule?.kilometrage || '',
      pieces_remplacees: '',
      numero_facture: '',
      statut: 'complete',
      date_signalement: '',
      priorite: 'normale',
      notes: ''
    });
    setEditingId(null);
    setShowForm(false);
  };

  const formatMontant = (val) => {
    if (!val) return '-';
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(val);
  };

  const getTypeInfo = (type) => {
    return typesIntervention.find(t => t.value === type) || typesIntervention[4];
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 100000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '900px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#fef2f2'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#991b1b' }}>
              🔧 Réparations & Entretiens
            </h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.875rem' }}>
              {vehicule?.nom} • {vehicule?.marque} {vehicule?.modele}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ 
              padding: '8px 16px', 
              backgroundColor: '#dcfce7', 
              borderRadius: '8px',
              fontWeight: '600',
              color: '#166534'
            }}>
              Total: {formatMontant(coutTotal)}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X size={20} />
            </Button>
          </div>
        </div>

        {/* Filtres et actions */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <select
            value={filtreType}
            onChange={(e) => setFiltreType(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db' }}
          >
            <option value="">Tous les types</option>
            {typesIntervention.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <div style={{ flex: 1 }} />
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus size={16} /> Nouvelle entrée
          </Button>
        </div>

        {/* Contenu scrollable */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {/* Formulaire */}
          {showForm && (
            <div style={{ 
              marginBottom: '24px', 
              padding: '20px', 
              backgroundColor: '#f8fafc', 
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>{editingId ? 'Modifier' : 'Nouvelle entrée'}</h3>
                <Button variant="ghost" size="sm" onClick={resetForm}>
                  <X size={16} />
                </Button>
              </div>
              
              <form onSubmit={handleSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div>
                    <Label>Date de réparation *</Label>
                    <Input
                      type="date"
                      value={formData.date_reparation}
                      onChange={(e) => setFormData({ ...formData, date_reparation: e.target.value })}
                      required
                    />
                  </div>
                  
                  <div>
                    <Label>Type d'intervention *</Label>
                    <select
                      value={formData.type_intervention}
                      onChange={(e) => setFormData({ ...formData, type_intervention: e.target.value })}
                      style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                      required
                    >
                      {typesIntervention.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <Label>Coût ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.cout}
                      onChange={(e) => setFormData({ ...formData, cout: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  
                  <div>
                    <Label>Kilométrage actuel</Label>
                    <Input
                      type="number"
                      value={formData.kilometrage_actuel}
                      onChange={(e) => setFormData({ ...formData, kilometrage_actuel: e.target.value })}
                      placeholder="km"
                    />
                  </div>
                </div>
                
                <div style={{ marginTop: '16px' }}>
                  <Label>Description *</Label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', minHeight: '80px' }}
                    placeholder="Description de l'intervention..."
                    required
                  />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '16px' }}>
                  <div>
                    <Label>Fournisseur / Garage</Label>
                    <Input
                      value={formData.fournisseur}
                      onChange={(e) => setFormData({ ...formData, fournisseur: e.target.value })}
                      placeholder="Nom du garage"
                    />
                  </div>
                  
                  <div>
                    <Label>N° Facture</Label>
                    <Input
                      value={formData.numero_facture}
                      onChange={(e) => setFormData({ ...formData, numero_facture: e.target.value })}
                      placeholder="Numéro"
                    />
                  </div>
                  
                  <div>
                    <Label>Pièces remplacées</Label>
                    <Input
                      value={formData.pieces_remplacees}
                      onChange={(e) => setFormData({ ...formData, pieces_remplacees: e.target.value })}
                      placeholder="Liste des pièces"
                    />
                  </div>
                </div>
                
                {(formData.type_intervention === 'reparation_mineure' || formData.type_intervention === 'reparation_majeure') && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                    <div>
                      <Label>Date de signalement (pour délai 48h)</Label>
                      <Input
                        type="date"
                        value={formData.date_signalement}
                        onChange={(e) => setFormData({ ...formData, date_signalement: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Priorité</Label>
                      <select
                        value={formData.priorite}
                        onChange={(e) => setFormData({ ...formData, priorite: e.target.value })}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
                      >
                        <option value="normale">Normale</option>
                        <option value="urgente">⚠️ Urgente (48h)</option>
                        <option value="critique">🔴 Critique (immédiat)</option>
                      </select>
                    </div>
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                  <Button type="submit">
                    <Save size={16} /> Enregistrer
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Annuler
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Liste des réparations */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              Chargement...
            </div>
          ) : reparations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              <Wrench size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p>Aucune réparation enregistrée</p>
              <Button variant="outline" onClick={() => setShowForm(true)} style={{ marginTop: '12px' }}>
                <Plus size={16} /> Ajouter une entrée
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {reparations.map(rep => {
                const typeInfo = getTypeInfo(rep.type_intervention);
                return (
                  <div
                    key={rep.id}
                    style={{
                      padding: '16px',
                      backgroundColor: rep.type_intervention === 'reparation_majeure' ? '#fef2f2' : '#ffffff',
                      border: `1px solid ${rep.type_intervention === 'reparation_majeure' ? '#fecaca' : '#e5e7eb'}`,
                      borderLeft: `4px solid ${typeInfo.color}`,
                      borderRadius: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            backgroundColor: `${typeInfo.color}20`,
                            color: typeInfo.color
                          }}>
                            {typeInfo.label.split(' ')[0]} {rep.type_intervention.replace(/_/g, ' ')}
                          </span>
                          <span style={{ color: '#64748b', fontSize: '0.875rem' }}>
                            <Calendar size={14} style={{ display: 'inline', marginRight: '4px' }} />
                            {rep.date_reparation}
                          </span>
                          {rep.priorite === 'critique' && (
                            <span style={{ backgroundColor: '#dc2626', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                              CRITIQUE
                            </span>
                          )}
                          {rep.priorite === 'urgente' && (
                            <span style={{ backgroundColor: '#f97316', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                              URGENT
                            </span>
                          )}
                        </div>
                        
                        <p style={{ margin: '0 0 8px', fontWeight: '500', color: '#1e293b' }}>
                          {rep.description}
                        </p>
                        
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.875rem', color: '#64748b' }}>
                          {rep.cout && (
                            <span>
                              <DollarSign size={14} style={{ display: 'inline', marginRight: '2px' }} />
                              {formatMontant(rep.cout)}
                            </span>
                          )}
                          {rep.fournisseur && <span>🏪 {rep.fournisseur}</span>}
                          {rep.kilometrage_actuel && <span>📍 {rep.kilometrage_actuel.toLocaleString()} km</span>}
                          {rep.numero_facture && <span>📄 #{rep.numero_facture}</span>}
                        </div>
                        
                        {rep.pieces_remplacees && (
                          <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                            <strong>Pièces:</strong> {rep.pieces_remplacees}
                          </p>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(rep)}>
                          <Edit2 size={16} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(rep.id)}>
                          <Trash2 size={16} style={{ color: '#ef4444' }} />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReparationsVehicule;
