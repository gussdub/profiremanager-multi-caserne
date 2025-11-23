import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut } from '../utils/api';

const Debogage = () => {
  const [activeTab, setActiveTab] = useState('bugs'); // bugs ou features
  const [bugs, setBugs] = useState([]);
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  
  // Filtres
  const [filtreStatut, setFiltreStatut] = useState('');
  const [filtrePriorite, setFiltrePriorite] = useState('');
  const [filtreModule, setFiltreModule] = useState('');
  
  // Formulaire
  const [formData, setFormData] = useState({});
  const [commentaire, setCommentaire] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pasteAreaActive, setPasteAreaActive] = useState(false);

  useEffect(() => {
    loadData();
  }, [activeTab, filtreStatut, filtrePriorite, filtreModule]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtreStatut) params.append('statut', filtreStatut);
      if (filtrePriorite) params.append('priorite', filtrePriorite);
      if (filtreModule) params.append('module', filtreModule);
      
      const endpoint = activeTab === 'bugs' ? '/admin/bugs' : '/admin/features';
      const data = await apiGet('admin', `${endpoint}?${params.toString()}`);
      
      if (activeTab === 'bugs') {
        setBugs(data);
      } else {
        setFeatures(data);
      }
    } catch (error) {
      console.error('Erreur chargement données:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      const endpoint = activeTab === 'bugs' ? '/admin/bugs' : '/admin/features';
      
      if (isEditing && selectedItem) {
        // Mode édition
        await apiPut('admin', `${endpoint}/${selectedItem.id}`, formData);
        alert('✅ Modification enregistrée avec succès');
      } else {
        // Mode création
        await apiPost('admin', endpoint, formData);
        alert('✅ Création réussie');
      }
      
      setShowCreateModal(false);
      setFormData({});
      setIsEditing(false);
      setSelectedItem(null);
      loadData();
    } catch (error) {
      console.error('Erreur:', error);
      alert(isEditing ? 'Erreur lors de la modification' : 'Erreur lors de la création');
    }
  };

  const handleEdit = (item) => {
    setSelectedItem(item);
    setFormData({
      titre: item.titre || '',
      description: item.description || '',
      module: item.module || item.module_concerne || '',
      priorite: item.priorite || '',
      etapes_reproduction: item.etapes_reproduction || item.steps_to_reproduce || '',
      resultat_attendu: item.resultat_attendu || item.expected_behavior || '',
      resultat_observe: item.resultat_observe || item.actual_behavior || '',
      navigateur: item.navigateur || '',
      os: item.os || '',
      role_utilisateur: item.role_utilisateur || '',
      console_logs: item.console_logs || '',
      infos_supplementaires: item.infos_supplementaires || '',
      images: item.images || []
    });
    setIsEditing(true);
    setShowCreateModal(true);
  };

  const handleStatusChange = async (itemId, newStatus) => {
    try {
      const endpoint = activeTab === 'bugs' 
        ? `/admin/bugs/${itemId}/statut`
        : `/admin/features/${itemId}/statut`;
      
      await apiPut('admin', endpoint, { nouveau_statut: newStatus });
      alert('✓ Statut mis à jour avec succès!');
      loadData();
      if (selectedItem && selectedItem.id === itemId) {
        loadItemDetail(itemId);
      }
    } catch (error) {
      console.error('Erreur changement statut:', error);
      alert(`Erreur lors de la mise à jour du statut: ${error.message || 'Erreur inconnue'}`);
    }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer cet élément? Cette action est irréversible.`)) {
      return;
    }

    try {
      const endpoint = activeTab === 'bugs'
        ? `/admin/bugs/${itemId}`
        : `/admin/features/${itemId}`;
      
      // Utiliser le bon token (admin_token pour super admin)
      const token = localStorage.getItem('admin_token') || localStorage.getItem('token');
      
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api${endpoint}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        alert('✓ Élément supprimé avec succès!');
        setShowDetailModal(false);
        setSelectedItem(null);
        loadData();
      } else {
        const error = await response.json();
        alert(`Erreur lors de la suppression: ${error.detail || 'Erreur inconnue'}`);
      }
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert(`Erreur lors de la suppression: ${error.message || 'Erreur inconnue'}`);
    }
  };

  const handleAddComment = async () => {
    if (!commentaire.trim()) return;
    
    try {
      const endpoint = activeTab === 'bugs'
        ? `/admin/bugs/${selectedItem.id}/commentaires`
        : `/admin/features/${selectedItem.id}/commentaires`;
      
      await apiPost('admin', endpoint, { texte: commentaire });
      setCommentaire('');
      loadItemDetail(selectedItem.id);
    } catch (error) {
      console.error('Erreur ajout commentaire:', error);
    }
  };

  const loadItemDetail = async (itemId) => {
    try {
      const endpoint = activeTab === 'bugs'
        ? `/admin/bugs/${itemId}`
        : `/admin/features/${itemId}`;
      
      const data = await apiGet('admin', endpoint);
      setSelectedItem(data);
    } catch (error) {
      console.error('Erreur chargement détail:', error);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploadingImage(true);
    try {
      const formDataImg = new FormData();
      formDataImg.append('file', file);
      
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/admin/upload-image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formDataImg
      });
      
      const data = await response.json();
      setFormData(prev => ({
        ...prev,
        images: [...(prev.images || []), data.url]
      }));
    } catch (error) {
      console.error('Erreur upload image:', error);
      alert('Erreur lors de l\'upload de l\'image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handlePaste = async (e) => {
    e.preventDefault();
    const items = e.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        setUploadingImage(true);
        
        try {
          const formDataImg = new FormData();
          formDataImg.append('file', blob);
          
          const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/admin/upload-image`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('admin_token') || localStorage.getItem('token')}`
            },
            body: formDataImg
          });
          
          const data = await response.json();
          setFormData(prev => ({
            ...prev,
            images: [...(prev.images || []), data.url]
          }));
          
          alert('✓ Image collée avec succès!');
        } catch (error) {
          console.error('Erreur upload image collée:', error);
          alert('Erreur lors de l\'upload de l\'image collée');
        } finally {
          setUploadingImage(false);
        }
        break;
      }
    }
  };

  const getPrioriteColor = (priorite) => {
    const colors = {
      critique: '#dc2626',
      haute: '#f97316',
      moyenne: '#eab308',
      basse: '#22c55e'
    };
    return colors[priorite] || '#6b7280';
  };

  const getStatutColor = (statut) => {
    const colors = {
      nouveau: '#3b82f6',
      en_cours: '#f59e0b',
      test: '#8b5cf6',
      resolu: '#22c55e',
      ferme: '#6b7280'
    };
    return colors[statut] || '#6b7280';
  };

  const renderList = () => {
    const items = activeTab === 'bugs' ? bugs : features;
    
    if (loading) {
      return <div style={{ textAlign: 'center', padding: '2rem' }}>Chargement...</div>;
    }

    if (items.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
            {activeTab === 'bugs' ? '🐛' : '✨'}
          </div>
          <p>Aucun {activeTab === 'bugs' ? 'bug' : 'feature request'} trouvé</p>
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gap: '1rem' }}>
        {items.map(item => (
          <div
            key={item.id}
            onClick={() => {
              setSelectedItem(item);
              setShowDetailModal(true);
            }}
            style={{
              backgroundColor: 'white',
              padding: '1.5rem',
              borderRadius: '0.75rem',
              border: '1px solid #e2e8f0',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#1e293b', flex: 1 }}>
                {activeTab === 'bugs' ? '🐛' : '✨'} {item.titre}
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <span style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: getPrioriteColor(item.priorite) + '20',
                  color: getPrioriteColor(item.priorite),
                  textTransform: 'uppercase'
                }}>
                  {item.priorite}
                </span>
                <span style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: getStatutColor(item.statut) + '20',
                  color: getStatutColor(item.statut)
                }}>
                  {item.statut.replace('_', ' ')}
                </span>
              </div>
            </div>
            
            <p style={{ margin: '0.5rem 0', color: '#64748b', fontSize: '0.875rem', lineHeight: '1.5' }}>
              {item.description.substring(0, 150)}...
            </p>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                <span style={{ fontWeight: 500 }}>Module:</span> {item.module}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Par {item.created_by_name} • {new Date(item.created_at).toLocaleDateString('fr-FR')}
              </div>
            </div>
            
            {item.commentaires && item.commentaires.length > 0 && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#64748b' }}>
                💬 {item.commentaires.length} commentaire{item.commentaires.length > 1 ? 's' : ''}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderCreateModal = () => {
    if (!showCreateModal) return null;

    const modules = [
      'Planning', 'Mes Disponibilités', 'Personnel', 'Gestion EPI', 
      'Paramètres', 'Dashboard', 'Authentification', 'Prévention', 'Autre'
    ];

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem'
      }} onClick={() => setShowCreateModal(false)}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '1rem',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
        }} onClick={(e) => e.stopPropagation()}>
          <div style={{
            padding: '1.5rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
              {isEditing 
                ? (activeTab === 'bugs' ? '✏️ Modifier Bug Report' : '✏️ Modifier Feature Request')
                : (activeTab === 'bugs' ? '🐛 Nouveau Bug Report' : '✨ Nouvelle Feature Request')
              }
            </h2>
            <button
              onClick={() => {
                setShowCreateModal(false);
                setIsEditing(false);
                setFormData({});
              }}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                color: '#64748b'
              }}
            >
              ×
            </button>
          </div>

          <form onSubmit={handleCreateSubmit} style={{ padding: '1.5rem' }}>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {/* Titre */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Titre *
                </label>
                <input
                  type="text"
                  required
                  value={formData.titre || ''}
                  onChange={(e) => setFormData({...formData, titre: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    fontSize: '1rem'
                  }}
                  placeholder="Titre court et descriptif"
                />
              </div>

              {/* Description */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Description *
                </label>
                <textarea
                  required
                  value={formData.description || ''}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  rows="4"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    fontSize: '1rem',
                    resize: 'vertical'
                  }}
                  placeholder="Description détaillée..."
                />
              </div>

              {/* Module et Priorité */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                    Module *
                  </label>
                  <select
                    required
                    value={formData.module || ''}
                    onChange={(e) => setFormData({...formData, module: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.5rem',
                      fontSize: '1rem'
                    }}
                  >
                    <option value="">Sélectionner...</option>
                    {modules.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                    Priorité *
                  </label>
                  <select
                    required
                    value={formData.priorite || ''}
                    onChange={(e) => setFormData({...formData, priorite: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.5rem',
                      fontSize: '1rem'
                    }}
                  >
                    <option value="">Sélectionner...</option>
                    <option value="critique">🔴 Critique</option>
                    <option value="haute">🟠 Haute</option>
                    <option value="moyenne">🟡 Moyenne</option>
                    <option value="basse">🟢 Basse</option>
                  </select>
                </div>
              </div>

              {/* Champs spécifiques selon le type */}
              {activeTab === 'bugs' ? (
                <>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                      Étapes de reproduction *
                    </label>
                    <textarea
                      required
                      value={formData.etapes_reproduction || ''}
                      onChange={(e) => setFormData({...formData, etapes_reproduction: e.target.value})}
                      rows="3"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '1rem'
                      }}
                      placeholder="1. Aller sur...\n2. Cliquer sur...\n3. Observer..."
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                        Résultat attendu *
                      </label>
                      <textarea
                        required
                        value={formData.resultat_attendu || ''}
                        onChange={(e) => setFormData({...formData, resultat_attendu: e.target.value})}
                        rows="2"
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #e2e8f0',
                          borderRadius: '0.5rem',
                          fontSize: '1rem'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                        Résultat observé *
                      </label>
                      <textarea
                        required
                        value={formData.resultat_observe || ''}
                        onChange={(e) => setFormData({...formData, resultat_observe: e.target.value})}
                        rows="2"
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #e2e8f0',
                          borderRadius: '0.5rem',
                          fontSize: '1rem'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                      Console Logs (optionnel)
                    </label>
                    <textarea
                      value={formData.console_logs || ''}
                      onChange={(e) => setFormData({...formData, console_logs: e.target.value})}
                      rows="3"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '0.875rem',
                        fontFamily: 'monospace',
                        backgroundColor: '#f8fafc'
                      }}
                      placeholder="Coller les logs de la console ici..."
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                      Problème à résoudre *
                    </label>
                    <textarea
                      required
                      value={formData.probleme_a_resoudre || ''}
                      onChange={(e) => setFormData({...formData, probleme_a_resoudre: e.target.value})}
                      rows="3"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '1rem'
                      }}
                      placeholder="Quel problème cette fonctionnalité résout-elle?"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                      Solution proposée *
                    </label>
                    <textarea
                      required
                      value={formData.solution_proposee || ''}
                      onChange={(e) => setFormData({...formData, solution_proposee: e.target.value})}
                      rows="3"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '1rem'
                      }}
                      placeholder="Comment devrait fonctionner cette fonctionnalité?"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                      Cas d'usage *
                    </label>
                    <textarea
                      required
                      value={formData.cas_usage || ''}
                      onChange={(e) => setFormData({...formData, cas_usage: e.target.value})}
                      rows="3"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        fontSize: '1rem'
                      }}
                      placeholder="En tant que [rôle], je veux [action], afin de [bénéfice]"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                      Utilisateurs concernés
                    </label>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      {['admin', 'superviseur', 'employe', 'tous'].map(user => (
                        <label key={user} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={(formData.utilisateurs_concernes || []).includes(user)}
                            onChange={(e) => {
                              const current = formData.utilisateurs_concernes || [];
                              const updated = e.target.checked
                                ? [...current, user]
                                : current.filter(u => u !== user);
                              setFormData({...formData, utilisateurs_concernes: updated});
                            }}
                          />
                          {user.charAt(0).toUpperCase() + user.slice(1)}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Upload d'images */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                  Captures d'écran (optionnel)
                </label>
                
                {/* Upload fichier */}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploadingImage}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    marginBottom: '0.75rem'
                  }}
                />
                
                {/* Zone Ctrl+V */}
                <div
                  onPaste={handlePaste}
                  onFocus={() => setPasteAreaActive(true)}
                  onBlur={() => setPasteAreaActive(false)}
                  tabIndex={0}
                  style={{
                    padding: '2rem',
                    border: `2px dashed ${pasteAreaActive ? '#3b82f6' : '#cbd5e1'}`,
                    borderRadius: '0.5rem',
                    backgroundColor: pasteAreaActive ? '#eff6ff' : '#f8fafc',
                    textAlign: 'center',
                    cursor: 'text',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
                    Cliquez ici et appuyez sur <strong>Ctrl+V</strong> pour coller une capture d'écran
                  </p>
                  {uploadingImage && (
                    <p style={{ margin: '0.5rem 0 0 0', color: '#3b82f6', fontSize: '0.875rem' }}>
                      ⏳ Upload en cours...
                    </p>
                  )}
                </div>
                
                {formData.images && formData.images.length > 0 && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <div style={{ fontSize: '0.875rem', color: '#22c55e', marginBottom: '0.5rem' }}>
                      ✓ {formData.images.length} image{formData.images.length > 1 ? 's' : ''} ajoutée{formData.images.length > 1 ? 's' : ''}
                    </div>
                    {/* Preview miniatures */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {formData.images.map((img, idx) => (
                        <div key={idx} style={{ position: 'relative' }}>
                          <img
                            src={img}
                            alt={`Preview ${idx + 1}`}
                            style={{
                              width: '80px',
                              height: '80px',
                              objectFit: 'cover',
                              borderRadius: '0.5rem',
                              border: '2px solid #e2e8f0'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                images: prev.images.filter((_, i) => i !== idx)
                              }));
                            }}
                            style={{
                              position: 'absolute',
                              top: '-8px',
                              right: '-8px',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              border: 'none',
                              backgroundColor: '#ef4444',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '14px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 'bold'
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '1rem',
              marginTop: '1.5rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid #e2e8f0'
            }}>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #e2e8f0',
                  backgroundColor: 'white',
                  color: '#64748b',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Annuler
              </button>
              <button
                type="submit"
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  backgroundColor: activeTab === 'bugs' ? '#dc2626' : '#2563eb',
                  color: 'white',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                {isEditing 
                  ? '💾 Enregistrer les modifications'
                  : (activeTab === 'bugs' ? '🐛 Créer Bug Report' : '✨ Créer Feature Request')
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const renderDetailModal = () => {
    if (!showDetailModal || !selectedItem) return null;

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem'
      }} onClick={() => setShowDetailModal(false)}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '1rem',
          maxWidth: '900px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
        }} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div style={{
            padding: '1.5rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'start'
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: getPrioriteColor(selectedItem.priorite) + '20',
                  color: getPrioriteColor(selectedItem.priorite),
                  textTransform: 'uppercase'
                }}>
                  {selectedItem.priorite}
                </span>
                <span style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: getStatutColor(selectedItem.statut) + '20',
                  color: getStatutColor(selectedItem.statut)
                }}>
                  {selectedItem.statut.replace('_', ' ')}
                </span>
              </div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
                {activeTab === 'bugs' ? '🐛' : '✨'} {selectedItem.titre}
              </h2>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#64748b' }}>
                Par {selectedItem.created_by_name} • {new Date(selectedItem.created_at).toLocaleDateString('fr-FR')} • Module: {selectedItem.module}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  handleEdit(selectedItem);
                }}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #3b82f6',
                  backgroundColor: 'white',
                  color: '#3b82f6',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                ✏️ Modifier
              </button>
              <button
                onClick={() => setShowDetailModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
              >
                ×
              </button>
            </div>
          </div>

          <div style={{ padding: '1.5rem' }}>
            {/* Changer statut */}
            <div style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              backgroundColor: '#f8fafc',
              borderRadius: '0.75rem'
            }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Changer le statut
              </label>
              <select
                value={selectedItem.statut}
                onChange={(e) => handleStatusChange(selectedItem.id, e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  backgroundColor: 'white'
                }}
              >
                <option value="nouveau">Nouveau</option>
                <option value="en_cours">En cours</option>
                <option value="test">Test</option>
                <option value="resolu">Résolu</option>
                <option value="ferme">Fermé</option>
              </select>
            </div>

            {/* Bouton de suppression */}
            <div style={{ marginBottom: '1.5rem' }}>
              <button
                onClick={() => handleDelete(selectedItem.id)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #ef4444',
                  borderRadius: '0.5rem',
                  backgroundColor: 'white',
                  color: '#ef4444',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '1rem',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#ef4444';
                  e.currentTarget.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.color = '#ef4444';
                }}
              >
                🗑️ Supprimer cet élément
              </button>
            </div>

            {/* Description */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                Description
              </h3>
              <p style={{ margin: 0, lineHeight: '1.6', color: '#475569', whiteSpace: 'pre-wrap' }}>
                {selectedItem.description}
              </p>
            </div>

            {/* Détails spécifiques */}
            {activeTab === 'bugs' && (
              <>
                {selectedItem.etapes_reproduction && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                      Étapes de reproduction
                    </h3>
                    <p style={{ margin: 0, lineHeight: '1.6', color: '#475569', whiteSpace: 'pre-wrap' }}>
                      {selectedItem.etapes_reproduction}
                    </p>
                  </div>
                )}
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  {selectedItem.resultat_attendu && (
                    <div>
                      <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                        ✅ Résultat attendu
                      </h3>
                      <p style={{ margin: 0, lineHeight: '1.6', color: '#475569', fontSize: '0.875rem' }}>
                        {selectedItem.resultat_attendu}
                      </p>
                    </div>
                  )}
                  
                  {selectedItem.resultat_observe && (
                    <div>
                      <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                        ❌ Résultat observé
                      </h3>
                      <p style={{ margin: 0, lineHeight: '1.6', color: '#475569', fontSize: '0.875rem' }}>
                        {selectedItem.resultat_observe}
                      </p>
                    </div>
                  )}
                </div>

                {selectedItem.console_logs && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                      Console Logs
                    </h3>
                    <pre style={{
                      margin: 0,
                      padding: '1rem',
                      backgroundColor: '#1e293b',
                      color: '#e2e8f0',
                      borderRadius: '0.5rem',
                      fontSize: '0.75rem',
                      overflow: 'auto',
                      maxHeight: '200px'
                    }}>
                      {selectedItem.console_logs}
                    </pre>
                  </div>
                )}
              </>
            )}

            {activeTab === 'features' && (
              <>
                {selectedItem.probleme_a_resoudre && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                      🎯 Problème à résoudre
                    </h3>
                    <p style={{ margin: 0, lineHeight: '1.6', color: '#475569' }}>
                      {selectedItem.probleme_a_resoudre}
                    </p>
                  </div>
                )}

                {selectedItem.solution_proposee && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                      💡 Solution proposée
                    </h3>
                    <p style={{ margin: 0, lineHeight: '1.6', color: '#475569' }}>
                      {selectedItem.solution_proposee}
                    </p>
                  </div>
                )}

                {selectedItem.cas_usage && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                      📝 Cas d'usage
                    </h3>
                    <p style={{ margin: 0, lineHeight: '1.6', color: '#475569' }}>
                      {selectedItem.cas_usage}
                    </p>
                  </div>
                )}

                {selectedItem.utilisateurs_concernes && selectedItem.utilisateurs_concernes.length > 0 && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                      👥 Utilisateurs concernés
                    </h3>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {selectedItem.utilisateurs_concernes.map(user => (
                        <span key={user} style={{
                          padding: '0.25rem 0.75rem',
                          backgroundColor: '#eff6ff',
                          color: '#1e40af',
                          borderRadius: '9999px',
                          fontSize: '0.875rem'
                        }}>
                          {user.charAt(0).toUpperCase() + user.slice(1)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Images */}
            {selectedItem.images && selectedItem.images.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                  📸 Captures d'écran
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
                  {selectedItem.images.map((img, idx) => (
                    <img
                      key={idx}
                      src={img}
                      alt={`Screenshot ${idx + 1}`}
                      style={{
                        width: '100%',
                        height: '150px',
                        objectFit: 'cover',
                        borderRadius: '0.5rem',
                        border: '1px solid #e2e8f0'
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Historique des statuts */}
            {selectedItem.historique_statuts && selectedItem.historique_statuts.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                  📜 Historique
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedItem.historique_statuts.map((hist, idx) => (
                    <div key={idx} style={{
                      padding: '0.75rem',
                      backgroundColor: '#f8fafc',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem'
                    }}>
                      <span style={{ fontWeight: 500 }}>{hist.user_name}</span> a changé le statut de{' '}
                      <span style={{ color: getStatutColor(hist.ancien_statut), fontWeight: 600 }}>
                        {hist.ancien_statut}
                      </span>
                      {' '}à{' '}
                      <span style={{ color: getStatutColor(hist.nouveau_statut), fontWeight: 600 }}>
                        {hist.nouveau_statut}
                      </span>
                      {' '}• {new Date(hist.date_changement || hist.date).toLocaleString('fr-FR')}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Commentaires */}
            <div>
              <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1rem', fontWeight: 600 }}>
                💬 Commentaires ({selectedItem.commentaires?.length || 0})
              </h3>
              
              {/* Liste des commentaires */}
              {selectedItem.commentaires && selectedItem.commentaires.length > 0 && (
                <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {selectedItem.commentaires.map((comment, idx) => (
                    <div key={idx} style={{
                      padding: '1rem',
                      backgroundColor: '#f8fafc',
                      borderRadius: '0.75rem',
                      borderLeft: '3px solid #3b82f6'
                    }}>
                      <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.875rem' }}>
                          {comment.user_name}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {new Date(comment.date).toLocaleString('fr-FR')}
                        </span>
                      </div>
                      <p style={{ margin: 0, color: '#475569', lineHeight: '1.5', fontSize: '0.875rem' }}>
                        {comment.texte}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Ajouter un commentaire */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <textarea
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  placeholder="Ajouter un commentaire..."
                  rows="3"
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                    resize: 'vertical'
                  }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={!commentaire.trim()}
                  style={{
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    backgroundColor: commentaire.trim() ? '#3b82f6' : '#e2e8f0',
                    color: commentaire.trim() ? 'white' : '#94a3b8',
                    fontWeight: 500,
                    cursor: commentaire.trim() ? 'pointer' : 'not-allowed',
                    alignSelf: 'flex-start'
                  }}
                >
                  Envoyer
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '2rem' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 700, color: '#1e293b' }}>
            🛠️ Débogage & Fonctionnalités
          </h1>
          <p style={{ margin: '0.5rem 0 0 0', color: '#64748b' }}>
            Gestion des bugs et demandes de fonctionnalités
          </p>
        </div>
        <button
          onClick={() => {
            setFormData({});
            setShowCreateModal(true);
          }}
          style={{
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            border: 'none',
            backgroundColor: activeTab === 'bugs' ? '#dc2626' : '#2563eb',
            color: 'white',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '1rem',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          {activeTab === 'bugs' ? '🐛 Nouveau Bug' : '✨ Nouvelle Feature'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1.5rem',
        borderBottom: '2px solid #e2e8f0'
      }}>
        <button
          onClick={() => setActiveTab('bugs')}
          style={{
            padding: '1rem 2rem',
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'bugs' ? '#dc2626' : '#64748b',
            fontWeight: 600,
            cursor: 'pointer',
            borderBottom: activeTab === 'bugs' ? '2px solid #dc2626' : '2px solid transparent',
            marginBottom: '-2px',
            fontSize: '1rem'
          }}
        >
          🐛 Bugs ({bugs.length})
        </button>
        <button
          onClick={() => setActiveTab('features')}
          style={{
            padding: '1rem 2rem',
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'features' ? '#2563eb' : '#64748b',
            fontWeight: 600,
            cursor: 'pointer',
            borderBottom: activeTab === 'features' ? '2px solid #2563eb' : '2px solid transparent',
            marginBottom: '-2px',
            fontSize: '1rem'
          }}
        >
          ✨ Features ({features.length})
        </button>
      </div>

      {/* Filtres */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem',
        padding: '1rem',
        backgroundColor: '#f8fafc',
        borderRadius: '0.75rem'
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
            Statut
          </label>
          <select
            value={filtreStatut}
            onChange={(e) => setFiltreStatut(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #e2e8f0',
              borderRadius: '0.5rem',
              backgroundColor: 'white'
            }}
          >
            <option value="">Tous</option>
            <option value="nouveau">Nouveau</option>
            <option value="en_cours">En cours</option>
            <option value="test">Test</option>
            <option value="resolu">Résolu</option>
            <option value="ferme">Fermé</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
            Priorité
          </label>
          <select
            value={filtrePriorite}
            onChange={(e) => setFiltrePriorite(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #e2e8f0',
              borderRadius: '0.5rem',
              backgroundColor: 'white'
            }}
          >
            <option value="">Toutes</option>
            <option value="critique">Critique</option>
            <option value="haute">Haute</option>
            <option value="moyenne">Moyenne</option>
            <option value="basse">Basse</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
            Module
          </label>
          <select
            value={filtreModule}
            onChange={(e) => setFiltreModule(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #e2e8f0',
              borderRadius: '0.5rem',
              backgroundColor: 'white'
            }}
          >
            <option value="">Tous</option>
            <option value="Planning">Planning</option>
            <option value="Mes Disponibilités">Mes Disponibilités</option>
            <option value="Personnel">Personnel</option>
            <option value="Gestion EPI">Gestion EPI</option>
            <option value="Paramètres">Paramètres</option>
            <option value="Dashboard">Dashboard</option>
            <option value="Autre">Autre</option>
          </select>
        </div>
      </div>

      {/* Liste */}
      {renderList()}

      {/* Modals */}
      {renderCreateModal()}
      {renderDetailModal()}
    </div>
  );
};

export default Debogage;
