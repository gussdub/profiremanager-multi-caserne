import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { apiGet, apiPost, apiPut, apiDelete, buildApiUrl, getTenantToken } from '../utils/api';
import imageCompression from 'browser-image-compression';
import axios from 'axios';

// Hook pour geler le scroll du body
const useLockBodyScroll = (isLocked) => {
  useEffect(() => {
    if (isLocked) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      
      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isLocked]);
};

// Couleurs selon le niveau de risque
const getRisqueColor = (niveau) => {
  switch(niveau?.toLowerCase()) {
    case 'faible': return { bg: '#dcfce7', border: '#22c55e', text: '#166534', badge: '#22c55e' };
    case 'moyen': return { bg: '#fef9c3', border: '#eab308', text: '#854d0e', badge: '#eab308' };
    case 'élevé':
    case 'eleve': return { bg: '#fed7aa', border: '#f97316', text: '#9a3412', badge: '#f97316' };
    case 'très élevé':
    case 'tres_eleve': return { bg: '#fecaca', border: '#ef4444', text: '#991b1b', badge: '#ef4444' };
    default: return { bg: '#f3f4f6', border: '#9ca3af', text: '#374151', badge: '#9ca3af' };
  }
};

// Gestionnaire (employés vs préventionniste)
const getGestionnaire = (niveauRisque) => {
  const risqueFaible = ['faible', ''].includes(niveauRisque?.toLowerCase() || '');
  return risqueFaible ? 
    { label: 'Employés', icon: '👥', color: '#22c55e' } : 
    { label: 'Préventionniste', icon: '🛡️', color: '#8b5cf6' };
};

// Catégories de bâtiments
const CATEGORIES = [
  { value: 'A', label: 'Groupe A - Établissements de Réunion' },
  { value: 'B', label: 'Groupe B - Soins et Détention' },
  { value: 'C', label: 'Groupe C - Habitations' },
  { value: 'D', label: 'Groupe D - Établissements d\'Affaires' },
  { value: 'E', label: 'Groupe E - Établissements Commerciaux' },
  { value: 'F', label: 'Groupe F - Établissements Industriels' },
  { value: 'agricole', label: 'Agricole' },
  { value: 'autre', label: 'Autre' }
];

const NIVEAUX_RISQUE = [
  { value: 'faible', label: 'Faible', color: '#22c55e' },
  { value: 'moyen', label: 'Moyen', color: '#eab308' },
  { value: 'élevé', label: 'Élevé', color: '#f97316' },
  { value: 'très élevé', label: 'Très élevé', color: '#ef4444' }
];

/**
 * Composant pour gérer les dépendances d'un bâtiment
 */
const DependancesBatiment = ({ 
  tenantSlug, 
  batimentId, 
  batimentAdresse,
  preventionnisteId,
  onUpdate,
  canEdit = true 
}) => {
  const [dependances, setDependances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDependance, setEditingDependance] = useState(null);
  const [selectedDependance, setSelectedDependance] = useState(null);
  const [activeTab, setActiveTab] = useState('infos'); // infos, photos, inspections
  const [photoUploading, setPhotoUploading] = useState(false);
  
  // Geler le scroll quand un modal est ouvert
  useLockBodyScroll(showForm || selectedDependance);
  
  const [formData, setFormData] = useState({
    nom: '',
    description: '',
    groupe_occupation: '',
    sous_groupe: '',
    niveau_risque: '',
    valeur_fonciere: '',
    annee_construction: '',
    nombre_etages: '1',
    superficie_m2: '',
    materiaux_construction: '',
    notes: '',
    notes_generales: '',
    photo_url: ''
  });

  // Charger les dépendances
  const loadDependances = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, `/prevention/batiments/${batimentId}/dependances`);
      setDependances(data || []);
    } catch (error) {
      console.error('Erreur chargement dépendances:', error);
      setDependances([]);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, batimentId]);

  useEffect(() => {
    if (batimentId) {
      loadDependances();
    }
  }, [batimentId, loadDependances]);

  // Réinitialiser le formulaire
  const resetForm = () => {
    setFormData({
      nom: '',
      description: '',
      groupe_occupation: '',
      sous_groupe: '',
      niveau_risque: '',
      valeur_fonciere: '',
      annee_construction: '',
      nombre_etages: '1',
      superficie_m2: '',
      materiaux_construction: '',
      notes: '',
      notes_generales: '',
      photo_url: ''
    });
    setEditingDependance(null);
    setShowForm(false);
  };

  // Éditer une dépendance
  const handleEdit = (dep) => {
    setFormData({
      nom: dep.nom || '',
      description: dep.description || '',
      groupe_occupation: dep.groupe_occupation || '',
      sous_groupe: dep.sous_groupe || '',
      niveau_risque: dep.niveau_risque || '',
      valeur_fonciere: dep.valeur_fonciere || '',
      annee_construction: dep.annee_construction || '',
      nombre_etages: dep.nombre_etages || '1',
      superficie_m2: dep.superficie_m2 || '',
      materiaux_construction: dep.materiaux_construction || '',
      notes: dep.notes || '',
      notes_generales: dep.notes_generales || '',
      photo_url: dep.photo_url || ''
    });
    setEditingDependance(dep);
    setShowForm(true);
    setSelectedDependance(null);
  };

  // Soumettre le formulaire
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.nom.trim()) {
      alert('Le nom de la dépendance est requis');
      return;
    }

    try {
      if (editingDependance) {
        // Mise à jour
        await apiPut(tenantSlug, `/prevention/dependances/${editingDependance.id}`, formData);
      } else {
        // Création
        await apiPost(tenantSlug, `/prevention/batiments/${batimentId}/dependances`, formData);
      }
      
      await loadDependances();
      resetForm();
      // Mettre à jour le compteur dans le parent
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Erreur sauvegarde dépendance:', error);
      alert('Erreur lors de la sauvegarde de la dépendance');
    }
  };

  // Supprimer une dépendance
  const handleDelete = async (depId) => {
    if (!window.confirm('Supprimer cette dépendance et son historique d\'inspections ?')) return;
    
    try {
      await apiDelete(tenantSlug, `/prevention/dependances/${depId}`);
      await loadDependances();
      setSelectedDependance(null);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert('Erreur lors de la suppression');
    }
  };

  // Upload photo de couverture
  const handlePhotoUpload = async (e, dependanceId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadPhotoFile(file, dependanceId);
  };

  // Fonction commune pour upload une photo (file ou blob)
  const uploadPhotoFile = async (file, dependanceId) => {
    try {
      setPhotoUploading(true);
      
      // Compresser l'image
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1200,
        useWebWorker: true
      };
      const compressedFile = await imageCompression(file, options);
      
      // Upload
      const formDataUpload = new FormData();
      formDataUpload.append('file', compressedFile);
      
      const response = await axios.post(
        buildApiUrl(tenantSlug, '/upload/image'),
        formDataUpload,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${getTenantToken()}`
          }
        }
      );
      
      const imageUrl = response.data.url;
      
      // Mettre à jour la dépendance
      await apiPut(tenantSlug, `/prevention/dependances/${dependanceId}`, {
        photo_url: imageUrl
      });
      
      await loadDependances();
      
      // Mettre à jour la vue détaillée si ouverte
      if (selectedDependance?.id === dependanceId) {
        setSelectedDependance(prev => ({ ...prev, photo_url: imageUrl }));
      }
      
    } catch (error) {
      console.error('Erreur upload photo:', error);
      alert('Erreur lors de l\'upload de la photo');
    } finally {
      setPhotoUploading(false);
    }
  };

  // Gérer le CTRL+V pour coller une image
  const handlePaste = async (e, dependanceId) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          await uploadPhotoFile(blob, dependanceId);
        }
        break;
      }
    }
  };

  // Ajouter une photo à la galerie
  const handleAddToGallery = async (e, dependanceId) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setPhotoUploading(true);
      
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1600,
        useWebWorker: true
      };
      const compressedFile = await imageCompression(file, options);
      
      const formDataUpload = new FormData();
      formDataUpload.append('file', compressedFile);
      
      const response = await axios.post(
        buildApiUrl(tenantSlug, '/upload/image'),
        formDataUpload,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${getTenantToken()}`
          }
        }
      );
      
      // Ajouter à la galerie
      await apiPost(tenantSlug, `/prevention/dependances/${dependanceId}/photos`, {
        url: response.data.url,
        nom: file.name,
        description: ''
      });
      
      // Recharger
      const updatedDep = await apiGet(tenantSlug, `/prevention/dependances/${dependanceId}`);
      setSelectedDependance(updatedDep);
      
    } catch (error) {
      console.error('Erreur ajout photo galerie:', error);
      alert('Erreur lors de l\'ajout de la photo');
    } finally {
      setPhotoUploading(false);
    }
  };

  // Supprimer une photo de la galerie
  const handleDeleteFromGallery = async (dependanceId, photoId) => {
    if (!window.confirm('Supprimer cette photo ?')) return;
    
    try {
      await apiDelete(tenantSlug, `/prevention/dependances/${dependanceId}/photos/${photoId}`);
      
      // Recharger
      const updatedDep = await apiGet(tenantSlug, `/prevention/dependances/${dependanceId}`);
      setSelectedDependance(updatedDep);
    } catch (error) {
      console.error('Erreur suppression photo:', error);
    }
  };

  // Affichage du formulaire
  const renderForm = () => (
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
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
          color: 'white',
          padding: '1.5rem',
          borderRadius: '16px 16px 0 0'
        }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>
            {editingDependance ? '✏️ Modifier la dépendance' : '➕ Nouvelle dépendance'}
          </h3>
          <p style={{ margin: '0.5rem 0 0', opacity: 0.9, fontSize: '0.875rem' }}>
            Rattachée à : {batimentAdresse}
          </p>
        </div>
        
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          {/* Nom */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>
              Nom de la dépendance *
            </label>
            <input
              type="text"
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              placeholder="Ex: Poulailler, Grange, Hangar..."
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem'
              }}
              required
            />
          </div>

          {/* Catégorie et Risque */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>
                Catégorie
              </label>
              <select
                value={formData.groupe_occupation}
                onChange={(e) => setFormData({ ...formData, groupe_occupation: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px'
                }}
              >
                <option value="">-- Sélectionner --</option>
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>
                Niveau de risque
              </label>
              <select
                value={formData.niveau_risque}
                onChange={(e) => setFormData({ ...formData, niveau_risque: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px'
                }}
              >
                <option value="">-- Sélectionner --</option>
                {NIVEAUX_RISQUE.map(nr => (
                  <option key={nr.value} value={nr.value}>{nr.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Valeur et Année */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>
                Valeur foncière
              </label>
              <input
                type="text"
                value={formData.valeur_fonciere}
                onChange={(e) => setFormData({ ...formData, valeur_fonciere: e.target.value })}
                placeholder="Ex: 150 000$"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px'
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>
                Année de construction
              </label>
              <input
                type="text"
                value={formData.annee_construction}
                onChange={(e) => setFormData({ ...formData, annee_construction: e.target.value })}
                placeholder="Ex: 1985"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px'
                }}
              />
            </div>
          </div>

          {/* Étages et Superficie */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>
                Nombre d'étages
              </label>
              <input
                type="text"
                value={formData.nombre_etages}
                onChange={(e) => setFormData({ ...formData, nombre_etages: e.target.value })}
                placeholder="1"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px'
                }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>
                Superficie (m²)
              </label>
              <input
                type="text"
                value={formData.superficie_m2}
                onChange={(e) => setFormData({ ...formData, superficie_m2: e.target.value })}
                placeholder="Ex: 200"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px'
                }}
              />
            </div>
          </div>

          {/* Matériaux */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>
              Matériaux de construction
            </label>
            <input
              type="text"
              value={formData.materiaux_construction}
              onChange={(e) => setFormData({ ...formData, materiaux_construction: e.target.value })}
              placeholder="Ex: Bois, Tôle, Béton..."
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px'
              }}
            />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>
              Notes / Compléments
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Informations supplémentaires..."
              rows={3}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Boutons */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <Button
              type="button"
              variant="outline"
              onClick={resetForm}
              style={{ flex: 1 }}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              style={{ flex: 1, backgroundColor: '#8b5cf6' }}
            >
              {editingDependance ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  // Vue détaillée d'une dépendance
  const renderDetailView = () => {
    if (!selectedDependance) return null;
    
    const dep = selectedDependance;
    const colors = getRisqueColor(dep.niveau_risque);
    const gestionnaire = getGestionnaire(dep.niveau_risque);
    
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
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '800px',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Header avec photo */}
          <div style={{
            background: `linear-gradient(135deg, ${colors.badge} 0%, ${colors.border} 100%)`,
            color: 'white',
            padding: '1.5rem',
            position: 'relative'
          }}>
            <button
              onClick={() => setSelectedDependance(null)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                cursor: 'pointer',
                color: 'white',
                fontSize: '1.25rem'
              }}
            >
              ✕
            </button>
            
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
              {/* Photo de couverture */}
              {/* Photo de couverture avec support CTRL+V */}
              <div 
                tabIndex={0}
                onPaste={(e) => handlePaste(e, dep.id)}
                style={{
                  width: '150px',
                  height: '100px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  flexShrink: 0,
                  position: 'relative',
                  outline: 'none',
                  cursor: canEdit ? 'pointer' : 'default'
                }}
                title={canEdit ? "Cliquez ou CTRL+V pour ajouter une photo" : ""}
              >
                {dep.photo_url ? (
                  <img 
                    src={dep.photo_url} 
                    alt={dep.nom}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ 
                    width: '100%', 
                    height: '100%', 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    gap: '0.25rem'
                  }}>
                    🏚️
                    {canEdit && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>CTRL+V</span>
                    )}
                  </div>
                )}
                {canEdit && (
                  <label style={{
                    position: 'absolute',
                    bottom: '4px',
                    right: '4px',
                    background: 'rgba(0,0,0,0.6)',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    cursor: 'pointer'
                  }}>
                    📷
                    <input 
                      type="file" 
                      accept="image/*" 
                      hidden 
                      onChange={(e) => handlePhotoUpload(e, dep.id)}
                    />
                  </label>
                )}
                {photoUploading && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white'
                  }}>
                    ⏳
                  </div>
                )}
              </div>
              
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem' }}>{dep.nom}</h2>
                <p style={{ margin: 0, opacity: 0.9, fontSize: '0.875rem' }}>
                  Rattachée à : {batimentAdresse}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <span style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    backgroundColor: 'rgba(255,255,255,0.2)'
                  }}>
                    {dep.groupe_occupation || 'Non classé'}
                  </span>
                  <span style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    backgroundColor: 'rgba(255,255,255,0.2)'
                  }}>
                    {gestionnaire.icon} {gestionnaire.label}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Onglets */}
          <div style={{
            display: 'flex',
            borderBottom: '2px solid #e5e7eb',
            backgroundColor: '#f9fafb'
          }}>
            {['infos', 'photos', 'inspections'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '0.75rem 1.5rem',
                  border: 'none',
                  background: activeTab === tab ? 'white' : 'transparent',
                  borderBottom: activeTab === tab ? `3px solid ${colors.badge}` : '3px solid transparent',
                  cursor: 'pointer',
                  fontWeight: activeTab === tab ? '600' : '400',
                  color: activeTab === tab ? colors.text : '#6b7280'
                }}
              >
                {tab === 'infos' && '📋 Informations'}
                {tab === 'photos' && `📸 Photos (${dep.photos?.length || 0})`}
                {tab === 'inspections' && '🔍 Inspections'}
              </button>
            ))}
          </div>
          
          {/* Contenu */}
          <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
            {activeTab === 'infos' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <InfoCard label="Catégorie" value={
                  CATEGORIES.find(c => c.value === dep.groupe_occupation)?.label || dep.groupe_occupation || '-'
                } />
                <InfoCard label="Niveau de risque" value={dep.niveau_risque || '-'} color={colors.badge} />
                <InfoCard label="Valeur foncière" value={dep.valeur_fonciere || '-'} />
                <InfoCard label="Année de construction" value={dep.annee_construction || '-'} />
                <InfoCard label="Nombre d'étages" value={dep.nombre_etages || '-'} />
                <InfoCard label="Superficie" value={dep.superficie_m2 ? `${dep.superficie_m2} m²` : '-'} />
                <InfoCard label="Matériaux" value={dep.materiaux_construction || '-'} fullWidth />
                {dep.notes && (
                  <div style={{ gridColumn: '1 / -1', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                    <strong>Notes :</strong>
                    <p style={{ margin: '0.5rem 0 0', whiteSpace: 'pre-wrap' }}>{dep.notes}</p>
                  </div>
                )}
              </div>
            )}
            
            {activeTab === 'photos' && (
              <div>
                {canEdit && (
                  <label style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1.25rem',
                    backgroundColor: colors.badge,
                    color: 'white',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    marginBottom: '1rem'
                  }}>
                    {photoUploading ? '⏳ Upload...' : '➕ Ajouter une photo'}
                    <input 
                      type="file" 
                      accept="image/*" 
                      hidden 
                      onChange={(e) => handleAddToGallery(e, dep.id)}
                      disabled={photoUploading}
                    />
                  </label>
                )}
                
                {dep.photos?.length > 0 ? (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                    gap: '1rem'
                  }}>
                    {dep.photos.map((photo, idx) => (
                      <div key={photo.id || idx} style={{
                        position: 'relative',
                        paddingTop: '100%',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        backgroundColor: '#f3f4f6'
                      }}>
                        <img 
                          src={photo.url} 
                          alt={photo.nom || `Photo ${idx + 1}`}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover'
                          }}
                        />
                        {canEdit && (
                          <button
                            onClick={() => handleDeleteFromGallery(dep.id, photo.id)}
                            style={{
                              position: 'absolute',
                              top: '4px',
                              right: '4px',
                              background: 'rgba(239,68,68,0.9)',
                              border: 'none',
                              borderRadius: '50%',
                              width: '24px',
                              height: '24px',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '0.75rem'
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    padding: '3rem',
                    textAlign: 'center',
                    color: '#9ca3af'
                  }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📷</div>
                    <p>Aucune photo dans la galerie</p>
                  </div>
                )}
              </div>
            )}
            
            {activeTab === 'inspections' && (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
                <p>Historique des inspections à venir</p>
                <p style={{ fontSize: '0.875rem' }}>Les inspections seront listées ici</p>
              </div>
            )}
          </div>
          
          {/* Footer actions */}
          {canEdit && (
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              gap: '1rem',
              justifyContent: 'flex-end'
            }}>
              <Button
                variant="outline"
                onClick={() => handleEdit(dep)}
                style={{ color: '#8b5cf6', borderColor: '#8b5cf6' }}
              >
                ✏️ Modifier
              </Button>
              <Button
                variant="outline"
                onClick={() => handleDelete(dep.id)}
                style={{ color: '#ef4444', borderColor: '#ef4444' }}
              >
                🗑️ Supprimer
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Carte d'info
  const InfoCard = ({ label, value, color, fullWidth }) => (
    <div style={{ 
      padding: '0.75rem', 
      backgroundColor: '#f9fafb', 
      borderRadius: '8px',
      gridColumn: fullWidth ? '1 / -1' : undefined
    }}>
      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontWeight: '600', color: color || '#1f2937' }}>{value}</div>
    </div>
  );

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        Chargement des dépendances...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem'
      }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🏚️ Dépendances
          <span style={{
            backgroundColor: '#8b5cf6',
            color: 'white',
            padding: '0.125rem 0.5rem',
            borderRadius: '999px',
            fontSize: '0.75rem'
          }}>
            {dependances.length}
          </span>
        </h3>
        {canEdit && (
          <Button
            onClick={() => setShowForm(true)}
            style={{ backgroundColor: '#8b5cf6' }}
            size="sm"
          >
            ➕ Ajouter
          </Button>
        )}
      </div>

      {/* Liste des dépendances */}
      {dependances.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {dependances.map(dep => {
            const colors = getRisqueColor(dep.niveau_risque);
            const gestionnaire = getGestionnaire(dep.niveau_risque);
            
            return (
              <Card
                key={dep.id}
                onClick={() => setSelectedDependance(dep)}
                style={{
                  padding: '1rem',
                  cursor: 'pointer',
                  borderLeft: `4px solid ${colors.badge}`,
                  backgroundColor: colors.bg,
                  transition: 'transform 0.1s, box-shadow 0.1s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateX(4px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateX(0)';
                  e.currentTarget.style.boxShadow = '';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {/* Photo miniature */}
                  <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    backgroundColor: '#e5e7eb',
                    flexShrink: 0
                  }}>
                    {dep.photo_url ? (
                      <img 
                        src={dep.photo_url} 
                        alt={dep.nom}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem'
                      }}>
                        🏚️
                      </div>
                    )}
                  </div>
                  
                  {/* Infos */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', color: colors.text }}>{dep.nom}</div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      {CATEGORIES.find(c => c.value === dep.groupe_occupation)?.label || dep.groupe_occupation || 'Non classé'}
                    </div>
                  </div>
                  
                  {/* Badges */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: '600',
                      backgroundColor: colors.badge,
                      color: 'white'
                    }}>
                      {dep.niveau_risque || 'Non défini'}
                    </span>
                    <span style={{
                      fontSize: '0.7rem',
                      color: gestionnaire.color
                    }}>
                      {gestionnaire.icon} {gestionnaire.label}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          color: '#6b7280'
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏚️</div>
          <p style={{ margin: 0 }}>Aucune dépendance pour ce bâtiment</p>
          {canEdit && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
              Cliquez sur "Ajouter" pour créer une dépendance (poulailler, grange, hangar...)
            </p>
          )}
        </div>
      )}

      {/* Modals */}
      {showForm && renderForm()}
      {selectedDependance && renderDetailView()}
    </div>
  );
};

export default DependancesBatiment;
