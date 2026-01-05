import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { useTenant } from '../contexts/TenantContext';
import { useToast } from '../hooks/use-toast';

const FormulairesInspectionConfig = () => {
  const [formulaires, setFormulaires] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedFormulaire, setSelectedFormulaire] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { tenantSlug } = useTenant();
  const { toast } = useToast();

  // État du formulaire en édition
  const [formData, setFormData] = useState({
    nom: '',
    description: '',
    type: 'inspection',
    categorie_ids: [],
    vehicule_ids: [],  // Pour assigner à des véhicules spécifiques
    frequence: 'mensuelle',
    est_actif: true,
    sections: []
  });

  const frequences = [
    { value: 'quotidienne', label: 'Quotidienne' },
    { value: 'hebdomadaire', label: 'Hebdomadaire' },
    { value: 'mensuelle', label: 'Mensuelle' },
    { value: 'trimestrielle', label: 'Trimestrielle' },
    { value: 'semestrielle', label: 'Semestrielle' },
    { value: 'annuelle', label: 'Annuelle' },
    { value: 'apres_usage', label: 'Après chaque utilisation' },
    { value: 'sur_demande', label: 'Sur demande' }
  ];

  const typesChamp = [
    { value: 'conforme_nc', label: 'Conforme / Non conforme' },
    { value: 'oui_non', label: 'Oui / Non' },
    { value: 'texte', label: 'Texte libre' },
    { value: 'nombre', label: 'Nombre' },
    { value: 'date', label: 'Date' },
    { value: 'liste', label: 'Liste déroulante' },
    { value: 'inspecteur', label: '👤 Inspecteur (auto-rempli)' },
    { value: 'lieu', label: '📍 Lieu (GPS ou adresse)' }
  ];

  const [vehicules, setVehicules] = useState([]);

  useEffect(() => {
    loadFormulaires();
    loadCategories();
    loadVehicules();
  }, []);

  const loadVehicules = async () => {
    try {
      const data = await apiGet(tenantSlug, '/vehicules');
      setVehicules(data || []);
    } catch (error) {
      console.log('Pas de véhicules:', error);
      setVehicules([]);
    }
  };

  const loadFormulaires = async () => {
    setLoading(true);
    try {
      const data = await apiGet(tenantSlug, '/formulaires-inspection');
      setFormulaires(data || []);
    } catch (error) {
      console.error('Erreur chargement formulaires:', error);
      setFormulaires([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      // Charger les catégories de Matériel & Équipements
      const equipCats = await apiGet(tenantSlug, '/equipements/categories');
      
      // Ajouter les types d'EPI comme catégories
      const epiTypes = [
        { id: 'epi_bunker', nom: 'Habit de combat (Bunker)', type: 'epi' },
        { id: 'epi_bottes', nom: 'Bottes', type: 'epi' },
        { id: 'epi_casque', nom: 'Casque', type: 'epi' },
        { id: 'epi_gants', nom: 'Gants', type: 'epi' },
        { id: 'epi_cagoule', nom: 'Cagoule', type: 'epi' },
      ];
      
      setCategories([
        ...epiTypes,
        ...(equipCats || []).map(c => ({ ...c, type: 'equipement' }))
      ]);
    } catch (error) {
      console.error('Erreur chargement catégories:', error);
    }
  };

  const handleCreate = () => {
    setSelectedFormulaire(null);
    setFormData({
      nom: '',
      description: '',
      type: 'inspection',
      categorie_ids: [],
      vehicule_ids: [],
      frequence: 'mensuelle',
      est_actif: true,
      sections: [
        {
          id: `section_${Date.now()}`,
          titre: 'Inspection visuelle',
          icone: '👁️',
          items: []
        }
      ]
    });
    setShowModal(true);
  };

  const handleEdit = (formulaire) => {
    setSelectedFormulaire(formulaire);
    setFormData({
      nom: formulaire.nom || '',
      description: formulaire.description || '',
      type: formulaire.type || 'inspection',
      categorie_ids: formulaire.categorie_ids || [],
      vehicule_ids: formulaire.vehicule_ids || [],
      frequence: formulaire.frequence || 'mensuelle',
      est_actif: formulaire.est_actif ?? true,
      sections: formulaire.sections || []
    });
    setShowModal(true);
  };

  const handleDuplicate = async (formulaire) => {
    try {
      await apiPost(tenantSlug, `/formulaires-inspection/${formulaire.id}/dupliquer`);
      toast({
        title: "✅ Succès",
        description: "Formulaire dupliqué avec succès"
      });
      loadFormulaires();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de dupliquer le formulaire",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedFormulaire) return;
    
    try {
      await apiDelete(tenantSlug, `/formulaires-inspection/${selectedFormulaire.id}`);
      toast({
        title: "✅ Succès",
        description: "Formulaire supprimé avec succès"
      });
      setShowDeleteConfirm(false);
      setSelectedFormulaire(null);
      loadFormulaires();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le formulaire",
        variant: "destructive"
      });
    }
  };

  const handleToggleActive = async (formulaire) => {
    try {
      await apiPut(tenantSlug, `/formulaires-inspection/${formulaire.id}`, {
        est_actif: !formulaire.est_actif
      });
      toast({
        title: "✅ Succès",
        description: `Formulaire ${!formulaire.est_actif ? 'activé' : 'désactivé'}`
      });
      loadFormulaires();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de modifier l'état du formulaire",
        variant: "destructive"
      });
    }
  };

  const handleSave = async () => {
    if (!formData.nom.trim()) {
      toast({
        title: "Erreur",
        description: "Le nom du formulaire est obligatoire",
        variant: "destructive"
      });
      return;
    }

    try {
      if (selectedFormulaire) {
        await apiPut(tenantSlug, `/formulaires-inspection/${selectedFormulaire.id}`, formData);
        toast({
          title: "✅ Succès",
          description: "Formulaire mis à jour avec succès"
        });
      } else {
        await apiPost(tenantSlug, '/formulaires-inspection', formData);
        toast({
          title: "✅ Succès",
          description: "Formulaire créé avec succès"
        });
      }
      setShowModal(false);
      loadFormulaires();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de sauvegarder le formulaire",
        variant: "destructive"
      });
    }
  };

  // Gestion des sections
  const addSection = () => {
    setFormData(prev => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          id: `section_${Date.now()}`,
          titre: 'Nouvelle section',
          icone: '📋',
          items: []
        }
      ]
    }));
  };

  const updateSection = (sectionIndex, field, value) => {
    setFormData(prev => ({
      ...prev,
      sections: prev.sections.map((s, i) => 
        i === sectionIndex ? { ...s, [field]: value } : s
      )
    }));
  };

  const removeSection = (sectionIndex) => {
    setFormData(prev => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== sectionIndex)
    }));
  };

  // Gestion des items
  const addItem = (sectionIndex) => {
    setFormData(prev => ({
      ...prev,
      sections: prev.sections.map((s, i) => 
        i === sectionIndex 
          ? { 
              ...s, 
              items: [
                ...s.items, 
                { 
                  id: `item_${Date.now()}`, 
                  nom: 'Nouvel élément', 
                  type: 'conforme_nc',
                  options: []
                }
              ] 
            }
          : s
      )
    }));
  };

  const updateItem = (sectionIndex, itemIndex, field, value) => {
    setFormData(prev => ({
      ...prev,
      sections: prev.sections.map((s, i) => 
        i === sectionIndex 
          ? { 
              ...s, 
              items: s.items.map((item, j) => 
                j === itemIndex ? { ...item, [field]: value } : item
              )
            }
          : s
      )
    }));
  };

  const removeItem = (sectionIndex, itemIndex) => {
    setFormData(prev => ({
      ...prev,
      sections: prev.sections.map((s, i) => 
        i === sectionIndex 
          ? { ...s, items: s.items.filter((_, j) => j !== itemIndex) }
          : s
      )
    }));
  };

  const filteredFormulaires = formulaires.filter(f =>
    f.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCategoryNames = (categoryIds) => {
    if (!categoryIds || categoryIds.length === 0) return 'Aucune catégorie';
    return categoryIds
      .map(id => categories.find(c => c.id === id)?.nom || id)
      .join(', ');
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'epi': return '🛡️';
      case 'equipement': return '🔧';
      default: return '📋';
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="spinner"></div>
        <p>Chargement des formulaires...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: '600', 
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            📋 Formulaires d'inspection
          </h2>
          <p style={{ color: '#64748b', margin: '0.25rem 0 0' }}>
            Créez et gérez les formulaires d'inspection pour vos équipements et EPI
          </p>
        </div>
        <Button onClick={handleCreate} style={{ backgroundColor: '#3B82F6' }}>
          ➕ Nouveau formulaire
        </Button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Input
          placeholder="🔍 Rechercher un formulaire..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ maxWidth: '400px' }}
        />
      </div>

      {/* Liste des formulaires */}
      {filteredFormulaires.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '3rem',
          backgroundColor: '#f8fafc',
          borderRadius: '12px',
          border: '2px dashed #e2e8f0'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
          <h3 style={{ margin: '0 0 0.5rem' }}>Aucun formulaire</h3>
          <p style={{ color: '#64748b', margin: '0 0 1rem' }}>
            Créez votre premier formulaire d'inspection
          </p>
          <Button onClick={handleCreate}>➕ Créer un formulaire</Button>
        </div>
      ) : (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
          gap: '1rem'
        }}>
          {filteredFormulaires.map(formulaire => (
            <div
              key={formulaire.id}
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                border: `2px solid ${formulaire.est_actif ? '#22c55e' : '#e2e8f0'}`,
                padding: '1.25rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
            >
              {/* Header */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '1rem'
              }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ 
                    margin: '0 0 0.25rem', 
                    fontSize: '1.1rem',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    {formulaire.nom}
                  </h3>
                  <p style={{ 
                    margin: 0, 
                    fontSize: '0.85rem', 
                    color: '#64748b',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {formulaire.description || 'Pas de description'}
                  </p>
                </div>
                <span style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '999px',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  backgroundColor: formulaire.est_actif ? '#dcfce7' : '#fee2e2',
                  color: formulaire.est_actif ? '#166534' : '#991b1b'
                }}>
                  {formulaire.est_actif ? '✅ Actif' : '⏸️ Inactif'}
                </span>
              </div>

              {/* Infos */}
              <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap',
                gap: '0.5rem',
                marginBottom: '1rem'
              }}>
                <span style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  backgroundColor: '#f1f5f9',
                  color: '#475569'
                }}>
                  ⏱️ {frequences.find(f => f.value === formulaire.frequence)?.label || formulaire.frequence}
                </span>
                <span style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  backgroundColor: '#f1f5f9',
                  color: '#475569'
                }}>
                  📂 {formulaire.sections?.length || 0} section(s)
                </span>
                <span style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  backgroundColor: '#f1f5f9',
                  color: '#475569'
                }}>
                  📝 {formulaire.sections?.reduce((acc, s) => acc + (s.items?.length || 0), 0) || 0} critère(s)
                </span>
              </div>

              {/* Catégories */}
              <div style={{ 
                fontSize: '0.8rem', 
                color: '#64748b',
                marginBottom: '1rem',
                padding: '0.5rem',
                backgroundColor: '#f8fafc',
                borderRadius: '6px'
              }}>
                <strong>Catégories:</strong> {getCategoryNames(formulaire.categorie_ids)}
              </div>

              {/* Actions */}
              <div style={{ 
                display: 'flex', 
                gap: '0.5rem',
                flexWrap: 'wrap'
              }}>
                <Button size="sm" variant="outline" onClick={() => handleEdit(formulaire)}>
                  ✏️ Modifier
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDuplicate(formulaire)}>
                  📋 Copier
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleToggleActive(formulaire)}
                >
                  {formulaire.est_actif ? '⏸️' : '▶️'}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => {
                    setSelectedFormulaire(formulaire);
                    setShowDeleteConfirm(true);
                  }}
                  style={{ color: '#ef4444' }}
                >
                  🗑️
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal d'édition */}
      {showModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '1rem',
            overflowY: 'auto'
          }}
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '800px',
              maxHeight: 'calc(100vh - 2rem)',
              display: 'flex',
              flexDirection: 'column',
              margin: '0.5rem auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ 
              padding: '1.25rem', 
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
              borderRadius: '16px 16px 0 0'
            }}>
              <h3 style={{ margin: 0, color: 'white', fontWeight: '600' }}>
                {selectedFormulaire ? '✏️ Modifier le formulaire' : '➕ Nouveau formulaire'}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                style={{ 
                  background: 'rgba(255,255,255,0.2)', 
                  border: 'none', 
                  color: 'white',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px'
                }}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div style={{ 
              flex: 1, 
              overflowY: 'auto', 
              padding: '1.5rem'
            }}>
              {/* Infos générales */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ margin: '0 0 1rem', color: '#374151' }}>📝 Informations générales</h4>
                
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div>
                    <Label>Nom du formulaire *</Label>
                    <Input
                      value={formData.nom}
                      onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                      placeholder="Ex: Inspection mensuelle des ARI"
                    />
                  </div>
                  
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Description du formulaire..."
                      rows={2}
                    />
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <Label>Fréquence</Label>
                      <select
                        value={formData.frequence}
                        onChange={(e) => setFormData({ ...formData, frequence: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '1px solid #e5e7eb'
                        }}
                      >
                        {frequences.map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <Label>État</Label>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, est_actif: true })}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            borderRadius: '6px',
                            border: `2px solid ${formData.est_actif ? '#22c55e' : '#e5e7eb'}`,
                            backgroundColor: formData.est_actif ? '#dcfce7' : 'white',
                            cursor: 'pointer'
                          }}
                        >
                          ✅ Actif
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, est_actif: false })}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            borderRadius: '6px',
                            border: `2px solid ${!formData.est_actif ? '#f59e0b' : '#e5e7eb'}`,
                            backgroundColor: !formData.est_actif ? '#fef3c7' : 'white',
                            cursor: 'pointer'
                          }}
                        >
                          ⏸️ Inactif
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label>Catégories concernées</Label>
                    <div style={{ 
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      gap: '0.5rem',
                      marginTop: '0.5rem',
                      maxHeight: '150px',
                      overflowY: 'auto',
                      padding: '0.5rem',
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px'
                    }}>
                      {categories.map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            const ids = formData.categorie_ids || [];
                            setFormData({
                              ...formData,
                              categorie_ids: ids.includes(cat.id)
                                ? ids.filter(id => id !== cat.id)
                                : [...ids, cat.id]
                            });
                          }}
                          style={{
                            padding: '0.4rem 0.75rem',
                            borderRadius: '999px',
                            border: `2px solid ${formData.categorie_ids?.includes(cat.id) ? '#3B82F6' : '#e5e7eb'}`,
                            backgroundColor: formData.categorie_ids?.includes(cat.id) ? '#dbeafe' : 'white',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                          }}
                        >
                          {getTypeIcon(cat.type)} {cat.nom}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Véhicules spécifiques (pour inventaires) */}
                  {formData.type === 'inventaire' && vehicules.length > 0 && (
                    <div>
                      <Label>🚗 Véhicules spécifiques (optionnel)</Label>
                      <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0.5rem' }}>
                        Sélectionnez des véhicules spécifiques ou laissez vide pour tous les véhicules
                      </p>
                      <div style={{ 
                        display: 'flex', 
                        flexWrap: 'wrap', 
                        gap: '0.5rem',
                        maxHeight: '150px',
                        overflowY: 'auto',
                        padding: '0.5rem',
                        backgroundColor: '#f8fafc',
                        borderRadius: '8px'
                      }}>
                        {vehicules.map(veh => (
                          <button
                            key={veh.id}
                            type="button"
                            onClick={() => {
                              const ids = formData.vehicule_ids || [];
                              setFormData({
                                ...formData,
                                vehicule_ids: ids.includes(veh.id)
                                  ? ids.filter(id => id !== veh.id)
                                  : [...ids, veh.id]
                              });
                            }}
                            style={{
                              padding: '0.4rem 0.75rem',
                              borderRadius: '999px',
                              border: `2px solid ${formData.vehicule_ids?.includes(veh.id) ? '#22c55e' : '#e5e7eb'}`,
                              backgroundColor: formData.vehicule_ids?.includes(veh.id) ? '#dcfce7' : 'white',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                          >
                            🚗 {veh.numero || veh.nom || veh.id}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sections */}
              <div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '1rem'
                }}>
                  <h4 style={{ margin: 0, color: '#374151' }}>📂 Sections et critères</h4>
                  <Button size="sm" variant="outline" onClick={addSection}>
                    ➕ Ajouter une section
                  </Button>
                </div>

                {formData.sections.map((section, sectionIndex) => (
                  <div 
                    key={section.id}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '12px',
                      marginBottom: '1rem',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Section header */}
                    <div style={{
                      padding: '1rem',
                      backgroundColor: '#f8fafc',
                      borderBottom: '1px solid #e5e7eb',
                      display: 'flex',
                      gap: '0.75rem',
                      alignItems: 'center',
                      flexWrap: 'wrap'
                    }}>
                      <Input
                        value={section.icone}
                        onChange={(e) => updateSection(sectionIndex, 'icone', e.target.value)}
                        style={{ width: '60px', textAlign: 'center' }}
                        maxLength={2}
                      />
                      <Input
                        value={section.titre}
                        onChange={(e) => updateSection(sectionIndex, 'titre', e.target.value)}
                        placeholder="Titre de la section"
                        style={{ flex: 1, minWidth: '150px' }}
                      />
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => removeSection(sectionIndex)}
                        style={{ color: '#ef4444' }}
                      >
                        🗑️
                      </Button>
                    </div>

                    {/* Items */}
                    <div style={{ padding: '1rem' }}>
                      {section.items.map((item, itemIndex) => (
                        <div 
                          key={item.id}
                          style={{
                            marginBottom: '0.75rem',
                            padding: '0.75rem',
                            backgroundColor: '#fafafa',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb'
                          }}
                        >
                          <div style={{
                            display: 'flex',
                            gap: '0.5rem',
                            alignItems: 'center',
                            flexWrap: 'wrap'
                          }}>
                            <Input
                              value={item.nom}
                              onChange={(e) => updateItem(sectionIndex, itemIndex, 'nom', e.target.value)}
                              placeholder="Nom du critère"
                              style={{ flex: 1, minWidth: '150px' }}
                            />
                            <select
                              value={item.type}
                              onChange={(e) => updateItem(sectionIndex, itemIndex, 'type', e.target.value)}
                              style={{
                                padding: '0.5rem',
                                borderRadius: '6px',
                                border: '1px solid #e5e7eb',
                                minWidth: '180px'
                              }}
                            >
                              {typesChamp.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => removeItem(sectionIndex, itemIndex)}
                              style={{ color: '#ef4444' }}
                            >
                              ✕
                            </Button>
                          </div>
                          
                          {/* Options pour liste déroulante */}
                          {item.type === 'liste' && (
                            <div style={{ marginTop: '0.5rem' }}>
                              <Label style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                Options de la liste (une par ligne)
                              </Label>
                              <Textarea
                                value={(item.options || []).join('\n')}
                                onChange={(e) => {
                                  const options = e.target.value.split('\n').filter(o => o.trim());
                                  updateItem(sectionIndex, itemIndex, 'options', options);
                                }}
                                placeholder="Option 1&#10;Option 2&#10;Option 3"
                                rows={3}
                                style={{ 
                                  width: '100%', 
                                  fontSize: '0.85rem',
                                  marginTop: '0.25rem'
                                }}
                              />
                            </div>
                          )}
                          
                          {/* Info pour les champs auto-remplis */}
                          {item.type === 'inspecteur' && (
                            <div style={{ 
                              marginTop: '0.5rem', 
                              padding: '0.5rem',
                              backgroundColor: '#dbeafe',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              color: '#1e40af'
                            }}>
                              👤 Ce champ sera automatiquement rempli avec le nom de l'inspecteur connecté
                            </div>
                          )}
                          
                          {item.type === 'lieu' && (
                            <div style={{ 
                              marginTop: '0.5rem', 
                              padding: '0.5rem',
                              backgroundColor: '#dcfce7',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              color: '#166534'
                            }}>
                              📍 L'utilisateur pourra utiliser le GPS ou saisir une adresse manuellement
                            </div>
                          )}
                        </div>
                      ))}
                      
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => addItem(sectionIndex)}
                        style={{ marginTop: '0.5rem' }}
                      >
                        ➕ Ajouter un critère
                      </Button>
                    </div>
                  </div>
                ))}

                {formData.sections.length === 0 && (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '2rem',
                    backgroundColor: '#f8fafc',
                    borderRadius: '8px',
                    color: '#64748b'
                  }}>
                    Aucune section. Cliquez sur "Ajouter une section" pour commencer.
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ 
              padding: '1rem 1.5rem', 
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'flex-end'
            }}>
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Annuler
              </Button>
              <Button onClick={handleSave} style={{ backgroundColor: '#3B82F6' }}>
                💾 {selectedFormulaire ? 'Enregistrer' : 'Créer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmation de suppression */}
      {showDeleteConfirm && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '1.5rem',
            maxWidth: '400px',
            width: '100%'
          }}>
            <h3 style={{ margin: '0 0 1rem', color: '#ef4444' }}>
              ⚠️ Confirmer la suppression
            </h3>
            <p style={{ margin: '0 0 1.5rem', color: '#64748b' }}>
              Êtes-vous sûr de vouloir supprimer le formulaire "{selectedFormulaire?.nom}" ?
              Cette action est irréversible.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Annuler
              </Button>
              <Button 
                onClick={handleDelete}
                style={{ backgroundColor: '#ef4444', color: 'white' }}
              >
                🗑️ Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormulairesInspectionConfig;
