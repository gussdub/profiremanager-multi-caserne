import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Pencil, Trash2, MapPin, Phone, GripVertical, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from './ui/button';

const CasernesSettings = ({ tenantSlug, toast, apiGet, apiPost, apiPut, apiDelete }) => {
  const [casernes, setCasernes] = useState([]);
  const [multiCasernesActif, setMultiCasernesActif] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCaserne, setEditingCaserne] = useState(null);
  const [form, setForm] = useState({ nom: '', code: '', adresse: '', telephone: '', couleur: '#3B82F6' });

  const fetchData = useCallback(async () => {
    try {
      const [configRes, casernesRes] = await Promise.all([
        apiGet(tenantSlug, '/casernes/config'),
        apiGet(tenantSlug, '/casernes')
      ]);
      setMultiCasernesActif(configRes?.multi_casernes_actif || false);
      setCasernes(casernesRes || []);
    } catch (err) {
      console.error('Erreur chargement casernes:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, apiGet]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggle = async () => {
    try {
      const newValue = !multiCasernesActif;
      await apiPut(tenantSlug, '/casernes/config', { multi_casernes_actif: newValue });
      setMultiCasernesActif(newValue);
      toast({
        title: newValue ? "Multi-casernes activ\u00e9" : "Multi-casernes d\u00e9sactiv\u00e9",
        description: newValue
          ? "Vous pouvez maintenant configurer vos casernes et le mode de chaque type de garde."
          : "Le syst\u00e8me fonctionne en mode caserne unique (comportement standard).",
        variant: "success"
      });
    } catch (err) {
      toast({ title: "Erreur", description: "Impossible de modifier la configuration", variant: "destructive" });
    }
  };

  const openCreateModal = () => {
    setEditingCaserne(null);
    setForm({ nom: '', code: '', adresse: '', telephone: '', couleur: '#3B82F6' });
    setShowModal(true);
  };

  const openEditModal = (caserne) => {
    setEditingCaserne(caserne);
    setForm({
      nom: caserne.nom || '',
      code: caserne.code || '',
      adresse: caserne.adresse || '',
      telephone: caserne.telephone || '',
      couleur: caserne.couleur || '#3B82F6'
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nom.trim()) {
      toast({ title: "Champ requis", description: "Le nom de la caserne est obligatoire", variant: "destructive" });
      return;
    }
    try {
      if (editingCaserne) {
        await apiPut(tenantSlug, `/casernes/${editingCaserne.id}`, form);
        toast({ title: "Caserne modifi\u00e9e", description: `${form.nom} a \u00e9t\u00e9 mis \u00e0 jour`, variant: "success" });
      } else {
        await apiPost(tenantSlug, '/casernes', form);
        toast({ title: "Caserne cr\u00e9\u00e9e", description: `${form.nom} a \u00e9t\u00e9 ajout\u00e9e`, variant: "success" });
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err.message || "Impossible de sauvegarder la caserne",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (caserne) => {
    if (!window.confirm(`Supprimer la caserne "${caserne.nom}" ? Cette action est irr\u00e9versible.`)) return;
    try {
      await apiDelete(tenantSlug, `/casernes/${caserne.id}`);
      toast({ title: "Caserne supprim\u00e9e", description: `${caserne.nom} a \u00e9t\u00e9 retir\u00e9e`, variant: "success" });
      fetchData();
    } catch (err) {
      toast({
        title: "Suppression impossible",
        description: err.message || "Des employ\u00e9s sont encore rattach\u00e9s \u00e0 cette caserne",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Chargement...</div>;
  }

  return (
    <div data-testid="casernes-settings">
      {/* Toggle principal */}
      <div
        data-testid="multi-casernes-toggle-section"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', background: multiCasernesActif ? '#f0fdf4' : '#f9fafb',
          border: multiCasernesActif ? '2px solid #22c55e' : '2px solid #e5e7eb',
          borderRadius: '12px', marginBottom: '24px', transition: 'all 0.3s ease'
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>
            Mode Multi-Casernes
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: '#64748b' }}>
            {multiCasernesActif
              ? "Actif - Les types de garde peuvent être configurés par caserne"
              : "Désactivé - Tous les employés sont gérés ensemble (comportement standard)"}
          </p>
        </div>
        <button
          data-testid="multi-casernes-toggle-btn"
          onClick={handleToggle}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
            color: multiCasernesActif ? '#22c55e' : '#9ca3af', transition: 'color 0.3s'
          }}
        >
          {multiCasernesActif
            ? <ToggleRight size={40} strokeWidth={1.5} />
            : <ToggleLeft size={40} strokeWidth={1.5} />}
        </button>
      </div>

      {/* Liste des casernes (visible seulement si actif) */}
      {multiCasernesActif && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Casernes ({casernes.length})</h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                Gérez les casernes de votre service. Rattachez ensuite les employés depuis leur fiche.
              </p>
            </div>
            <Button data-testid="add-caserne-btn" variant="default" onClick={openCreateModal} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} /> Nouvelle caserne
            </Button>
          </div>

          {casernes.length === 0 ? (
            <div style={{
              padding: '40px', textAlign: 'center', background: '#f9fafb',
              borderRadius: '12px', border: '2px dashed #d1d5db'
            }}>
              <Building2 size={48} style={{ color: '#9ca3af', marginBottom: '12px' }} />
              <p style={{ color: '#6b7280', fontWeight: 500 }}>Aucune caserne configurée</p>
              <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Commencez par ajouter vos casernes</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {casernes.map((caserne) => (
                <div
                  key={caserne.id}
                  data-testid={`caserne-card-${caserne.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '16px',
                    padding: '16px 20px', background: 'white',
                    border: '1px solid #e5e7eb', borderRadius: '10px',
                    borderLeft: `4px solid ${caserne.couleur || '#3B82F6'}`,
                    transition: 'box-shadow 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                >
                  <GripVertical size={16} style={{ color: '#d1d5db', flexShrink: 0 }} />
                  <div
                    style={{
                      width: '36px', height: '36px', borderRadius: '8px',
                      background: caserne.couleur || '#3B82F6', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontWeight: 700, fontSize: '0.8rem'
                    }}
                  >
                    {caserne.code || caserne.nom.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{caserne.nom}</div>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                      {caserne.adresse && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <MapPin size={12} /> {caserne.adresse}
                        </span>
                      )}
                      {caserne.telephone && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Phone size={12} /> {caserne.telephone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button
                      data-testid={`edit-caserne-${caserne.id}`}
                      onClick={() => openEditModal(caserne)}
                      style={{
                        background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px',
                        padding: '6px 8px', cursor: 'pointer', color: '#6b7280'
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      data-testid={`delete-caserne-${caserne.id}`}
                      onClick={() => handleDelete(caserne)}
                      style={{
                        background: 'none', border: '1px solid #fecaca', borderRadius: '6px',
                        padding: '6px 8px', cursor: 'pointer', color: '#ef4444'
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal Cr\u00e9ation / Edition */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>{editingCaserne ? 'Modifier la caserne' : 'Nouvelle caserne'}</h3>
              <button className="close-btn" onClick={() => setShowModal(false)}>x</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Nom *</label>
                <input
                  data-testid="caserne-nom-input"
                  type="text"
                  value={form.nom}
                  onChange={(e) => setForm({ ...form, nom: e.target.value })}
                  placeholder="Ex: Caserne 1 - Centre"
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Code court</label>
                  <input
                    data-testid="caserne-code-input"
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="Ex: C1"
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Couleur</label>
                  <input
                    data-testid="caserne-couleur-input"
                    type="color"
                    value={form.couleur}
                    onChange={(e) => setForm({ ...form, couleur: e.target.value })}
                    style={{ width: '100%', height: '38px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Adresse</label>
                <input
                  data-testid="caserne-adresse-input"
                  type="text"
                  value={form.adresse}
                  onChange={(e) => setForm({ ...form, adresse: e.target.value })}
                  placeholder="Ex: 100 rue Principale"
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500 }}>Téléphone</label>
                <input
                  data-testid="caserne-telephone-input"
                  type="text"
                  value={form.telephone}
                  onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                  placeholder="Ex: 450-555-1234"
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
              <Button variant="outline" onClick={() => setShowModal(false)}>Annuler</Button>
              <Button data-testid="save-caserne-btn" variant="default" onClick={handleSave}>
                {editingCaserne ? 'Enregistrer' : 'Cr\u00e9er'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CasernesSettings;
