import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { useTenant } from '../contexts/TenantContext';
import { useToast } from '../hooks/use-toast';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Composant draggable pour les sections
const SortableSection = ({ section, sectionIndex, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id || `section-${sectionIndex}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{
        backgroundColor: '#f8fafc',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1rem',
        border: isDragging ? '2px dashed #3b82f6' : '1px solid #e5e7eb'
      }}>
        {/* Passer les props de drag au children via une fonction */}
        {typeof children === 'function' 
          ? children({ dragHandleProps: { ...attributes, ...listeners } })
          : children
        }
      </div>
    </div>
  );
};

// Composant draggable pour les items
const SortableItem = ({ item, itemIndex, sectionIndex, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id || `item-${sectionIndex}-${itemIndex}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '0.75rem',
        marginBottom: '0.5rem',
        border: isDragging ? '2px dashed #3b82f6' : '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem'
      }}>
        {/* Handle de drag */}
        <button
          {...attributes}
          {...listeners}
          type="button"
          style={{
            cursor: 'grab',
            padding: '0.25rem',
            background: 'none',
            border: 'none',
            fontSize: '1rem',
            color: '#9ca3af',
            touchAction: 'none',
            flexShrink: 0
          }}
          title="Glisser pour réorganiser"
        >
          ⋮⋮
        </button>
        <div style={{ flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
};

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

  // Configuration des capteurs pour drag & drop (souris + touch)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // État du formulaire en édition
  const [formData, setFormData] = useState({
    nom: '',
    description: '',
    type: 'inspection',
    categorie_ids: [],
    vehicule_ids: [],
    frequence: 'mensuelle',
    est_actif: true,
    tags: [],
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

  // Types de champs enrichis
  const typesChamp = [
    { value: 'radio', label: '🔘 Bouton radio (choix unique)', category: 'basic' },
    { value: 'checkbox', label: '☑️ Cases à cocher (choix multiples)', category: 'basic' },
    { value: 'texte', label: '📝 Texte libre', category: 'basic' },
    { value: 'nombre', label: '🔢 Nombre', category: 'basic' },
    { value: 'nombre_unite', label: '📏 Nombre avec unité', category: 'basic' },
    { value: 'slider', label: '📊 Curseur (slider)', category: 'advanced' },
    { value: 'date', label: '📅 Date', category: 'basic' },
    { value: 'liste', label: '📋 Liste déroulante', category: 'basic' },
    { value: 'photo', label: '📷 Photo/Image', category: 'media' },
    { value: 'signature', label: '✍️ Signature', category: 'media' },
    { value: 'chronometre', label: '⏱️ Chronomètre', category: 'advanced' },
    { value: 'compte_rebours', label: '⏳ Compte à rebours', category: 'advanced' },
    { value: 'qr_scan', label: '📱 Scan QR/Code-barres', category: 'advanced' },
    { value: 'audio', label: '🎤 Note vocale', category: 'media' },
    { value: 'inspecteur', label: '👤 Inspecteur (auto-rempli)', category: 'auto' },
    { value: 'lieu', label: '📍 Lieu (GPS ou adresse)', category: 'auto' },
    { value: 'meteo', label: '🌤️ Météo (auto-rempli)', category: 'auto' },
    { value: 'calcul', label: '🧮 Calcul automatique', category: 'advanced' }
  ];

  // Unités disponibles pour le type nombre_unite
  const unites = [
    { value: 'psi', label: 'PSI' },
    { value: 'bar', label: 'Bar' },
    { value: 'litres', label: 'Litres' },
    { value: 'gallons', label: 'Gallons' },
    { value: 'metres', label: 'Mètres' },
    { value: 'pieds', label: 'Pieds' },
    { value: 'kg', label: 'Kg' },
    { value: 'lbs', label: 'Lbs' },
    { value: 'celsius', label: '°C' },
    { value: 'fahrenheit', label: '°F' },
    { value: 'percent', label: '%' },
    { value: 'custom', label: 'Personnalisé' }
  ];

  const [vehicules, setVehicules] = useState([]);

  useEffect(() => {
    loadFormulaires();
    loadCategories();
    loadVehicules();
  }, []);

  const loadVehicules = async () => {
    try {
      const data = await apiGet(tenantSlug, '/actifs/vehicules');
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
      // Catégories principales correspondant aux sections du module "Gestion des Actifs"
      // Garder uniquement les 4 catégories principales
      const categoriesPrincipales = [
        { id: 'vehicule', nom: '🚗 Véhicules', type: 'actif_principal' },
        { id: 'point_eau', nom: '💧 Points d\'eau', type: 'actif_principal' },
        { id: 'equipement', nom: '🔧 Matériel & Équipements', type: 'actif_principal' },
        { id: 'epi', nom: '🦺 EPI (Équipements de protection)', type: 'actif_principal' },
      ];
      
      setCategories(categoriesPrincipales);
    } catch (error) {
      console.error('Erreur chargement catégories:', error);
    }
  };

  // ====== DRAG & DROP HANDLERS ======
  
  // Gestion du drag & drop des sections
  const handleSectionDragEnd = (event) => {
    const { active, over } = event;
    
    if (active.id !== over?.id) {
      setFormData(prev => {
        const oldIndex = prev.sections.findIndex(s => (s.id || `section-${prev.sections.indexOf(s)}`) === active.id);
        const newIndex = prev.sections.findIndex(s => (s.id || `section-${prev.sections.indexOf(s)}`) === over.id);
        
        return {
          ...prev,
          sections: arrayMove(prev.sections, oldIndex, newIndex)
        };
      });
    }
  };

  // Gestion du drag & drop des items dans une section
  const handleItemDragEnd = (sectionIndex) => (event) => {
    const { active, over } = event;
    
    if (active.id !== over?.id) {
      setFormData(prev => {
        const sections = [...prev.sections];
        const items = sections[sectionIndex].items || [];
        
        const oldIndex = items.findIndex(item => (item.id || `item-${sectionIndex}-${items.indexOf(item)}`) === active.id);
        const newIndex = items.findIndex(item => (item.id || `item-${sectionIndex}-${items.indexOf(item)}`) === over.id);
        
        sections[sectionIndex] = {
          ...sections[sectionIndex],
          items: arrayMove(items, oldIndex, newIndex)
        };
        
        return { ...prev, sections };
      });
    }
  };

  // ====== SECTION MANAGEMENT ======

  const addSection = () => {
    const newSection = {
      id: `section-${Date.now()}`,
      nom: 'Nouvelle section',
      description: '',
      photos: [], // Photos de référence pour la section
      items: []
    };
    setFormData(prev => ({
      ...prev,
      sections: [...prev.sections, newSection]
    }));
  };

  const removeSection = (index) => {
    setFormData(prev => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== index)
    }));
  };

  const duplicateSection = (index) => {
    const sectionToCopy = formData.sections[index];
    const newSection = {
      ...JSON.parse(JSON.stringify(sectionToCopy)),
      id: `section-${Date.now()}`,
      nom: `${sectionToCopy.nom} (copie)`
    };
    setFormData(prev => ({
      ...prev,
      sections: [...prev.sections.slice(0, index + 1), newSection, ...prev.sections.slice(index + 1)]
    }));
  };

  const updateSection = (index, field, value) => {
    setFormData(prev => {
      const sections = [...prev.sections];
      sections[index] = { ...sections[index], [field]: value };
      // Si on modifie le nom, supprimer titre pour éviter les conflits
      if (field === 'nom') {
        delete sections[index].titre;
      }
      return { ...prev, sections };
    });
  };

  // Upload photo pour une section
  const handleSectionPhotoUpload = async (sectionIndex, files) => {
    const newPhotos = [];
    for (const file of files) {
      const reader = new FileReader();
      await new Promise((resolve) => {
        reader.onloadend = () => {
          newPhotos.push({
            id: `photo-${Date.now()}-${Math.random()}`,
            data: reader.result,
            name: file.name
          });
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }
    
    setFormData(prev => {
      const sections = [...prev.sections];
      sections[sectionIndex] = {
        ...sections[sectionIndex],
        photos: [...(sections[sectionIndex].photos || []), ...newPhotos]
      };
      return { ...prev, sections };
    });
  };

  const removeSectionPhoto = (sectionIndex, photoIndex) => {
    setFormData(prev => {
      const sections = [...prev.sections];
      sections[sectionIndex] = {
        ...sections[sectionIndex],
        photos: sections[sectionIndex].photos.filter((_, i) => i !== photoIndex)
      };
      return { ...prev, sections };
    });
  };

  // ====== ITEM MANAGEMENT ======

  const addItem = (sectionIndex) => {
    const newItem = {
      id: `item-${Date.now()}`,
      label: 'Nouvel élément',
      type: 'radio',
      obligatoire: false,
      permettre_photo: false, // Permet de joindre une photo en réponse
      options: [], // Aucune option par défaut
      // Configuration des alertes selon les réponses
      alertes: {
        // Pour types à choix (radio, checkbox)
        valeurs_declenchantes: [],
        // Pour types numériques (nombre, slider)
        seuil_min: null, // Alerte si valeur < seuil_min
        seuil_max: null, // Alerte si valeur > seuil_max
        // Pour liste déroulante - indices des options qui déclenchent une alerte
        options_declenchantes: [],
        // Message personnalisé pour l'alerte
        message: ''
      },
      // Options avancées selon le type
      config: {
        unite: '',
        min: 0,
        max: 100,
        step: 1,
        seuils: [], // Pour validation automatique
        countdown_seconds: 300, // Pour compte à rebours
        formule: '' // Pour calcul automatique
      },
      // Conditions d'affichage
      condition: {
        active: false,
        field_id: '',
        operator: 'equals',
        value: ''
      }
    };
    
    setFormData(prev => {
      const sections = [...prev.sections];
      sections[sectionIndex] = {
        ...sections[sectionIndex],
        items: [...(sections[sectionIndex].items || []), newItem]
      };
      return { ...prev, sections };
    });
  };

  const removeItem = (sectionIndex, itemIndex) => {
    setFormData(prev => {
      const sections = [...prev.sections];
      sections[sectionIndex] = {
        ...sections[sectionIndex],
        items: sections[sectionIndex].items.filter((_, i) => i !== itemIndex)
      };
      return { ...prev, sections };
    });
  };

  const duplicateItem = (sectionIndex, itemIndex) => {
    const itemToCopy = formData.sections[sectionIndex].items[itemIndex];
    const newItem = {
      ...JSON.parse(JSON.stringify(itemToCopy)),
      id: `item-${Date.now()}`,
      label: `${itemToCopy.label} (copie)`
    };
    
    setFormData(prev => {
      const sections = [...prev.sections];
      const items = [...sections[sectionIndex].items];
      items.splice(itemIndex + 1, 0, newItem);
      sections[sectionIndex] = { ...sections[sectionIndex], items };
      return { ...prev, sections };
    });
  };

  const updateItem = (sectionIndex, itemIndex, field, value) => {
    setFormData(prev => {
      const sections = [...prev.sections];
      const items = [...sections[sectionIndex].items];
      
      if (field.includes('.')) {
        // Support pour les champs imbriqués comme 'config.min'
        const [parent, child] = field.split('.');
        items[itemIndex] = {
          ...items[itemIndex],
          [parent]: {
            ...items[itemIndex][parent],
            [child]: value
          }
        };
      } else {
        items[itemIndex] = { ...items[itemIndex], [field]: value };
        // Si on modifie le label, supprimer nom pour éviter les conflits (et vice versa)
        if (field === 'label') {
          delete items[itemIndex].nom;
        } else if (field === 'nom') {
          delete items[itemIndex].label;
        }
      }
      
      sections[sectionIndex] = { ...sections[sectionIndex], items };
      return { ...prev, sections };
    });
  };

  // Gestion des options pour liste déroulante
  const addOption = (sectionIndex, itemIndex) => {
    setFormData(prev => {
      const sections = [...prev.sections];
      const items = [...sections[sectionIndex].items];
      items[itemIndex] = {
        ...items[itemIndex],
        options: [...(items[itemIndex].options || []), `Option ${(items[itemIndex].options?.length || 0) + 1}`]
      };
      sections[sectionIndex] = { ...sections[sectionIndex], items };
      return { ...prev, sections };
    });
  };

  const updateOption = (sectionIndex, itemIndex, optionIndex, value) => {
    setFormData(prev => {
      const sections = [...prev.sections];
      const items = [...sections[sectionIndex].items];
      const options = [...items[itemIndex].options];
      options[optionIndex] = value;
      items[itemIndex] = { ...items[itemIndex], options };
      sections[sectionIndex] = { ...sections[sectionIndex], items };
      return { ...prev, sections };
    });
  };

  const removeOption = (sectionIndex, itemIndex, optionIndex) => {
    setFormData(prev => {
      const sections = [...prev.sections];
      const items = [...sections[sectionIndex].items];
      items[itemIndex] = {
        ...items[itemIndex],
        options: items[itemIndex].options.filter((_, i) => i !== optionIndex)
      };
      sections[sectionIndex] = { ...sections[sectionIndex], items };
      return { ...prev, sections };
    });
  };

  // Gestion des seuils de validation
  const addThreshold = (sectionIndex, itemIndex) => {
    setFormData(prev => {
      const sections = [...prev.sections];
      const items = [...sections[sectionIndex].items];
      const seuils = items[itemIndex].config?.seuils || [];
      items[itemIndex] = {
        ...items[itemIndex],
        config: {
          ...items[itemIndex].config,
          seuils: [...seuils, { value: 50, color: '#f59e0b', alert: true, message: 'Attention' }]
        }
      };
      sections[sectionIndex] = { ...sections[sectionIndex], items };
      return { ...prev, sections };
    });
  };

  // ====== CRUD HANDLERS ======

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
      tags: [],
      sections: [
        {
          id: `section_${Date.now()}`,
          nom: 'Inspection visuelle',
          description: '',
          photos: [],
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
      case 'actif_principal': return '📌';
      case 'vehicule': return '🚗';
      case 'point_eau': return '💧';
      case 'epi': 
      case 'epi_sous': return '🛡️';
      case 'equipement':
      case 'equipement_sous': return '🔧';
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
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '1rem'
        }}>
          {filteredFormulaires.map(formulaire => (
            <div
              key={formulaire.id}
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                border: `2px solid ${formulaire.est_actif ? '#22c55e' : '#e2e8f0'}`,
                padding: '1rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                overflow: 'hidden'
              }}
            >
              {/* Header */}
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: '0.5rem',
                marginBottom: '1rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <h3 style={{ 
                    margin: 0, 
                    fontSize: '1rem',
                    fontWeight: '600',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {formulaire.nom}
                  </h3>
                  <span style={{
                    padding: '0.2rem 0.5rem',
                    borderRadius: '999px',
                    fontSize: '0.65rem',
                    fontWeight: '500',
                    backgroundColor: formulaire.est_actif ? '#dcfce7' : '#fee2e2',
                    color: formulaire.est_actif ? '#166534' : '#991b1b',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}>
                    {formulaire.est_actif ? '✅ Actif' : '⏸️ Inactif'}
                  </span>
                </div>
                <p style={{ 
                  margin: 0, 
                  fontSize: '0.8rem', 
                  color: '#64748b',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {formulaire.description || 'Pas de description'}
                </p>
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
                  backgroundColor: formulaire.type === 'inventaire' ? '#dcfce7' : '#dbeafe',
                  color: formulaire.type === 'inventaire' ? '#166534' : '#1e40af',
                  fontWeight: '500'
                }}>
                  {formulaire.type === 'inventaire' ? '🚗 Inventaire' : '📋 Inspection'}
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

              {/* Catégories ou Véhicules selon le type */}
              <div style={{ 
                fontSize: '0.8rem', 
                color: '#64748b',
                marginBottom: '1rem',
                padding: '0.5rem',
                backgroundColor: '#f8fafc',
                borderRadius: '6px'
              }}>
                {formulaire.type === 'inventaire' ? (
                  <>
                    <strong>🚗 Véhicules:</strong> {
                      (formulaire.vehicule_ids && formulaire.vehicule_ids.length > 0)
                        ? formulaire.vehicule_ids.map(vid => {
                            const v = vehicules.find(veh => veh.id === vid);
                            return v ? (v.numero || v.nom) : vid;
                          }).join(', ')
                        : 'Aucun véhicule sélectionné'
                    }
                  </>
                ) : (
                  <>
                    <strong>📂 Catégories:</strong> {getCategoryNames(formulaire.categorie_ids)}
                  </>
                )}
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
            zIndex: 100000,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: 'clamp(0.5rem, 2vw, 1rem)',
            overflowY: 'auto'
          }}
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: 'clamp(8px, 2vw, 16px)',
              width: '100%',
              maxWidth: '800px',
              maxHeight: 'calc(100vh - 1rem)',
              display: 'flex',
              flexDirection: 'column',
              margin: '0.25rem auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header - Optimisé mobile */}
            <div style={{ 
              padding: 'clamp(0.75rem, 2vw, 1.25rem)', 
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
              borderRadius: 'clamp(8px, 2vw, 16px) clamp(8px, 2vw, 16px) 0 0',
              flexShrink: 0
            }}>
              <h3 style={{ 
                margin: 0, 
                color: 'white', 
                fontWeight: '600',
                fontSize: 'clamp(0.9rem, 3vw, 1.1rem)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {selectedFormulaire ? '✏️ Modifier' : '➕ Nouveau'} formulaire
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                style={{ 
                  background: 'rgba(255,255,255,0.2)', 
                  border: 'none', 
                  color: 'white',
                  fontSize: 'clamp(1.2rem, 4vw, 1.5rem)',
                  cursor: 'pointer',
                  borderRadius: '50%',
                  width: 'clamp(32px, 8vw, 36px)',
                  height: 'clamp(32px, 8vw, 36px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                ×
              </button>
            </div>

            {/* Content - Padding réduit sur mobile */}
            <div style={{ 
              flex: 1, 
              overflowY: 'auto', 
              padding: 'clamp(0.75rem, 3vw, 1.5rem)'
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
                  
                  {/* Type de formulaire */}
                  <div>
                    <Label>Type de formulaire *</Label>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, type: 'inspection', vehicule_ids: [] })}
                        style={{
                          flex: 1,
                          padding: '0.75rem 1rem',
                          borderRadius: '8px',
                          border: `2px solid ${formData.type === 'inspection' ? '#3B82F6' : '#e5e7eb'}`,
                          backgroundColor: formData.type === 'inspection' ? '#dbeafe' : 'white',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          fontWeight: formData.type === 'inspection' ? '600' : '400'
                        }}
                      >
                        📋 Inspection
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, type: 'inventaire', categorie_ids: [] })}
                        style={{
                          flex: 1,
                          padding: '0.75rem 1rem',
                          borderRadius: '8px',
                          border: `2px solid ${formData.type === 'inventaire' ? '#22c55e' : '#e5e7eb'}`,
                          backgroundColor: formData.type === 'inventaire' ? '#dcfce7' : 'white',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          fontWeight: formData.type === 'inventaire' ? '600' : '400'
                        }}
                      >
                        🚗 Inventaire véhicule
                      </button>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                      {formData.type === 'inspection' 
                        ? '📋 Un formulaire d\'inspection est associé à des catégories d\'équipement (EPI, matériel, etc.)'
                        : '🚗 Un formulaire d\'inventaire est associé à un ou plusieurs véhicules spécifiques'}
                    </p>
                  </div>

                  <div style={{ marginTop: '0.5rem' }}>
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

                  {/* Catégories concernées - SEULEMENT pour type "inspection" */}
                  {formData.type === 'inspection' && (
                    <div>
                      <Label style={{ fontSize: 'clamp(0.8rem, 2.5vw, 0.9rem)' }}>📂 Catégories concernées *</Label>
                      <p style={{ fontSize: 'clamp(0.7rem, 2vw, 0.8rem)', color: '#64748b', margin: '0.25rem 0 0.5rem' }}>
                        Sélectionnez les catégories pour ce formulaire
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
                  )}

                  {/* Véhicules concernés - SEULEMENT pour type "inventaire" */}
                  {formData.type === 'inventaire' && (
                    <div>
                      <Label>🚗 Véhicules concernés *</Label>
                      <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0.5rem' }}>
                        Sélectionnez les véhicules pour lesquels ce formulaire d'inventaire sera utilisé
                      </p>
                      {vehicules.length === 0 ? (
                        <div style={{ 
                          padding: '1rem', 
                          backgroundColor: '#fef3c7', 
                          borderRadius: '8px',
                          color: '#92400e',
                          fontSize: '0.85rem'
                        }}>
                          ⚠️ Aucun véhicule disponible. Ajoutez des véhicules dans le module "Véhicules" pour pouvoir créer un inventaire.
                        </div>
                      ) : (
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
                      )}
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
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button size="sm" variant="outline" onClick={addSection}>
                      ➕ Ajouter une section
                    </Button>
                  </div>
                </div>

                {/* Drag & Drop Context pour les sections */}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleSectionDragEnd}
                >
                  <SortableContext
                    items={formData.sections.map((s, i) => s.id || `section-${i}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    {formData.sections.map((section, sectionIndex) => (
                      <SortableSection
                        key={section.id || `section-${sectionIndex}`}
                        section={section}
                        sectionIndex={sectionIndex}
                      >
                        {({ dragHandleProps }) => (
                          <>
                            {/* Section header avec handle de drag - Optimisé mobile */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(0.25rem, 1vw, 0.5rem)', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                              {/* Handle de drag */}
                              <button
                                {...dragHandleProps}
                                type="button"
                                style={{
                                  cursor: 'grab',
                                  padding: '0.25rem',
                                  background: 'none',
                                  border: 'none',
                                  fontSize: 'clamp(1rem, 3vw, 1.2rem)',
                                  color: '#64748b',
                                  touchAction: 'none',
                                  flexShrink: 0
                                }}
                                title="Glisser pour réorganiser"
                              >
                                ⋮⋮
                              </button>
                              <Input
                                value={section.nom !== undefined ? section.nom : (section.titre || '')}
                                onChange={(e) => updateSection(sectionIndex, 'nom', e.target.value)}
                                placeholder="Nom de la section"
                                style={{ flex: 1, minWidth: '100px', fontSize: 'clamp(0.8rem, 2.5vw, 0.9rem)' }}
                              />
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => duplicateSection(sectionIndex)}
                                title="Dupliquer la section"
                              >
                                📋
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => removeSection(sectionIndex)}
                                style={{ color: '#ef4444' }}
                                title="Supprimer la section"
                              >
                                🗑️
                              </Button>
                            </div>

                            {/* Photos de référence de la section - Optimisé mobile */}
                            <div style={{ marginBottom: '0.75rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 'clamp(0.7rem, 2vw, 0.8rem)', color: '#64748b' }}>📷 Photos réf.:</span>
                                <label style={{
                                  cursor: 'pointer',
                                  padding: '0.25rem 0.5rem',
                                  backgroundColor: '#f1f5f9',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  border: '1px dashed #cbd5e1'
                                }}>
                                  + Ajouter
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    style={{ display: 'none' }}
                                    onChange={(e) => handleSectionPhotoUpload(sectionIndex, Array.from(e.target.files))}
                                  />
                                </label>
                              </div>
                              {section.photos && section.photos.length > 0 && (
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  {section.photos.map((photo, photoIndex) => (
                                    <div key={photo.id || photoIndex} style={{ position: 'relative' }}>
                                      <img
                                        src={photo.data || photo}
                                        alt={photo.name || `Photo ${photoIndex + 1}`}
                                        style={{
                                          width: '60px',
                                          height: '60px',
                                          objectFit: 'cover',
                                          borderRadius: '4px',
                                          border: '1px solid #e5e7eb'
                                        }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => removeSectionPhoto(sectionIndex, photoIndex)}
                                        style={{
                                          position: 'absolute',
                                          top: '-5px',
                                          right: '-5px',
                                          width: '18px',
                                          height: '18px',
                                          borderRadius: '50%',
                                          backgroundColor: '#ef4444',
                                          color: 'white',
                                          border: 'none',
                                          cursor: 'pointer',
                                          fontSize: '10px',
                                          lineHeight: '1'
                                        }}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                        {/* Items de la section avec drag & drop */}
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleItemDragEnd(sectionIndex)}
                        >
                          <SortableContext
                            items={(section.items || []).map((item, i) => item.id || `item-${sectionIndex}-${i}`)}
                            strategy={verticalListSortingStrategy}
                          >
                            {(section.items || []).map((item, itemIndex) => (
                              <SortableItem
                                key={item.id || `item-${sectionIndex}-${itemIndex}`}
                                item={item}
                                itemIndex={itemIndex}
                                sectionIndex={sectionIndex}
                              >
                                {/* Item content */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <Input
                                      value={item.label !== undefined ? item.label : (item.nom || '')}
                                      onChange={(e) => updateItem(sectionIndex, itemIndex, 'label', e.target.value)}
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
                                        minWidth: '200px',
                                        fontSize: '0.85rem'
                                      }}
                                    >
                                      <optgroup label="Basique">
                                        {typesChamp.filter(t => t.category === 'basic').map(t => (
                                          <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                      </optgroup>
                                      <optgroup label="Média">
                                        {typesChamp.filter(t => t.category === 'media').map(t => (
                                          <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                      </optgroup>
                                      <optgroup label="Avancé">
                                        {typesChamp.filter(t => t.category === 'advanced').map(t => (
                                          <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                      </optgroup>
                                      <optgroup label="Auto">
                                        {typesChamp.filter(t => t.category === 'auto').map(t => (
                                          <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                      </optgroup>
                                    </select>
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => duplicateItem(sectionIndex, itemIndex)}
                                      title="Dupliquer"
                                    >
                                      📋
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => removeItem(sectionIndex, itemIndex)}
                                      style={{ color: '#ef4444' }}
                                      title="Supprimer"
                                    >
                                      🗑️
                                    </Button>
                                  </div>

                                  {/* Options selon le type de champ */}
                                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8rem' }}>
                                    {/* Obligatoire */}
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                                      <input
                                        type="checkbox"
                                        checked={item.obligatoire || false}
                                        onChange={(e) => updateItem(sectionIndex, itemIndex, 'obligatoire', e.target.checked)}
                                      />
                                      Obligatoire
                                    </label>
                                    
                                    {/* Permettre photo en réponse */}
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                                      <input
                                        type="checkbox"
                                        checked={item.permettre_photo || false}
                                        onChange={(e) => updateItem(sectionIndex, itemIndex, 'permettre_photo', e.target.checked)}
                                      />
                                      📷 Photo en réponse
                                    </label>
                                  </div>

                                  {/* Options spécifiques selon le type */}
                                  {item.type === 'liste' && (
                                    <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
                                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>Options de la liste:</div>
                                      {(item.options || []).map((opt, optIndex) => (
                                        <div key={optIndex} style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.25rem' }}>
                                          <Input
                                            value={opt}
                                            onChange={(e) => updateOption(sectionIndex, itemIndex, optIndex, e.target.value)}
                                            style={{ flex: 1, fontSize: '0.85rem' }}
                                          />
                                          <button
                                            type="button"
                                            onClick={() => removeOption(sectionIndex, itemIndex, optIndex)}
                                            style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ))}
                                      <Button size="sm" variant="ghost" onClick={() => addOption(sectionIndex, itemIndex)}>
                                        + Option
                                      </Button>
                                    </div>
                                  )}

                                  {/* Options pour bouton radio (choix unique) */}
                                  {item.type === 'radio' && (
                                    <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd' }}>
                                      <div style={{ fontSize: '0.75rem', color: '#0369a1', marginBottom: '0.25rem', fontWeight: '500' }}>🔘 Options (choix unique):</div>
                                      {(item.options || []).map((opt, optIndex) => (
                                        <div key={optIndex} style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.25rem', alignItems: 'center' }}>
                                          <span style={{ color: '#0369a1', fontSize: '0.8rem' }}>○</span>
                                          <Input
                                            value={opt}
                                            onChange={(e) => updateOption(sectionIndex, itemIndex, optIndex, e.target.value)}
                                            style={{ flex: 1, fontSize: '0.85rem' }}
                                            placeholder={`Option ${optIndex + 1}`}
                                          />
                                          <button
                                            type="button"
                                            onClick={() => removeOption(sectionIndex, itemIndex, optIndex)}
                                            style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ))}
                                      <Button size="sm" variant="ghost" onClick={() => addOption(sectionIndex, itemIndex)} style={{ color: '#0369a1' }}>
                                        + Ajouter une option
                                      </Button>
                                    </div>
                                  )}

                                  {/* Options pour cases à cocher (choix multiples) */}
                                  {item.type === 'checkbox' && (
                                    <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                                      <div style={{ fontSize: '0.75rem', color: '#166534', marginBottom: '0.25rem', fontWeight: '500' }}>☑️ Options (choix multiples):</div>
                                      {(item.options || []).map((opt, optIndex) => (
                                        <div key={optIndex} style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.25rem', alignItems: 'center' }}>
                                          <span style={{ color: '#166534', fontSize: '0.8rem' }}>☐</span>
                                          <Input
                                            value={opt}
                                            onChange={(e) => updateOption(sectionIndex, itemIndex, optIndex, e.target.value)}
                                            style={{ flex: 1, fontSize: '0.85rem' }}
                                            placeholder={`Option ${optIndex + 1}`}
                                          />
                                          <button
                                            type="button"
                                            onClick={() => removeOption(sectionIndex, itemIndex, optIndex)}
                                            style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ))}
                                      <Button size="sm" variant="ghost" onClick={() => addOption(sectionIndex, itemIndex)} style={{ color: '#166534' }}>
                                        + Ajouter une option
                                      </Button>
                                    </div>
                                  )}

                                  {/* Options pour nombre avec unité */}
                                  {item.type === 'nombre_unite' && (
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                      <select
                                        value={item.config?.unite || ''}
                                        onChange={(e) => updateItem(sectionIndex, itemIndex, 'config.unite', e.target.value)}
                                        style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid #e5e7eb', fontSize: '0.85rem' }}
                                      >
                                        <option value="">Unité...</option>
                                        {unites.map(u => (
                                          <option key={u.value} value={u.value}>{u.label}</option>
                                        ))}
                                      </select>
                                      <Input
                                        type="number"
                                        placeholder="Min"
                                        value={item.config?.min || ''}
                                        onChange={(e) => updateItem(sectionIndex, itemIndex, 'config.min', parseFloat(e.target.value))}
                                        style={{ width: '70px', fontSize: '0.85rem' }}
                                      />
                                      <Input
                                        type="number"
                                        placeholder="Max"
                                        value={item.config?.max || ''}
                                        onChange={(e) => updateItem(sectionIndex, itemIndex, 'config.max', parseFloat(e.target.value))}
                                        style={{ width: '70px', fontSize: '0.85rem' }}
                                      />
                                    </div>
                                  )}

                                  {/* Options pour slider */}
                                  {item.type === 'slider' && (
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                      <Input
                                        type="number"
                                        placeholder="Min"
                                        value={item.config?.min ?? 0}
                                        onChange={(e) => updateItem(sectionIndex, itemIndex, 'config.min', parseFloat(e.target.value))}
                                        style={{ width: '70px', fontSize: '0.85rem' }}
                                      />
                                      <Input
                                        type="number"
                                        placeholder="Max"
                                        value={item.config?.max ?? 100}
                                        onChange={(e) => updateItem(sectionIndex, itemIndex, 'config.max', parseFloat(e.target.value))}
                                        style={{ width: '70px', fontSize: '0.85rem' }}
                                      />
                                      <Input
                                        type="number"
                                        placeholder="Pas"
                                        value={item.config?.step ?? 1}
                                        onChange={(e) => updateItem(sectionIndex, itemIndex, 'config.step', parseFloat(e.target.value))}
                                        style={{ width: '60px', fontSize: '0.85rem' }}
                                      />
                                      <select
                                        value={item.config?.unite || ''}
                                        onChange={(e) => updateItem(sectionIndex, itemIndex, 'config.unite', e.target.value)}
                                        style={{ padding: '0.35rem', borderRadius: '4px', border: '1px solid #e5e7eb', fontSize: '0.85rem' }}
                                      >
                                        <option value="">Unité...</option>
                                        {unites.map(u => (
                                          <option key={u.value} value={u.value}>{u.label}</option>
                                        ))}
                                      </select>
                                    </div>
                                  )}

                                  {/* Options pour compte à rebours */}
                                  {item.type === 'compte_rebours' && (
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Durée (secondes):</span>
                                      <Input
                                        type="number"
                                        value={item.config?.countdown_seconds || 300}
                                        onChange={(e) => updateItem(sectionIndex, itemIndex, 'config.countdown_seconds', parseInt(e.target.value))}
                                        style={{ width: '100px', fontSize: '0.85rem' }}
                                      />
                                      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                        ({Math.floor((item.config?.countdown_seconds || 300) / 60)} min)
                                      </span>
                                    </div>
                                  )}

                                  {/* Configuration des alertes - CONTRÔLE TOTAL */}
                                  <div style={{ 
                                    marginTop: '0.5rem', 
                                    padding: 'clamp(0.35rem, 2vw, 0.5rem)',
                                    backgroundColor: '#fef2f2',
                                    borderRadius: '6px',
                                    border: '1px solid #fecaca'
                                  }}>
                                    <div style={{ 
                                      fontSize: 'clamp(0.65rem, 2.5vw, 0.75rem)', 
                                      fontWeight: '600', 
                                      color: '#991b1b',
                                      marginBottom: '0.35rem',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                      flexWrap: 'wrap'
                                    }}>
                                      🔔 Configuration des alertes
                                    </div>

                                    {/* Pour Bouton Radio et Cases à cocher - alertes basées sur les options personnalisées */}
                                    {(item.type === 'radio' || item.type === 'checkbox') && item.options && item.options.length > 0 && (
                                      <div style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.8rem)', color: '#7f1d1d' }}>
                                        <span style={{ marginBottom: '0.25rem', display: 'block', fontSize: 'clamp(0.65rem, 2vw, 0.75rem)' }}>
                                          Déclencher une alerte si la réponse est:
                                        </span>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(0.5rem, 2vw, 0.75rem)' }}>
                                          {item.options.map((opt, optIdx) => (
                                            <label key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', cursor: 'pointer', fontSize: 'clamp(0.7rem, 2vw, 0.8rem)' }}>
                                              <input
                                                type="checkbox"
                                                checked={item.alertes?.valeurs_declenchantes?.includes(opt) ?? false}
                                                onChange={(e) => {
                                                  const current = item.alertes?.valeurs_declenchantes || [];
                                                  const newVals = e.target.checked 
                                                    ? [...current, opt]
                                                    : current.filter(v => v !== opt);
                                                  updateItem(sectionIndex, itemIndex, 'alertes.valeurs_declenchantes', newVals);
                                                }}
                                              />
                                              {opt}
                                            </label>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Message si pas d'options définies pour radio/checkbox */}
                                    {(item.type === 'radio' || item.type === 'checkbox') && (!item.options || item.options.length === 0) && (
                                      <div style={{ fontSize: 'clamp(0.65rem, 2vw, 0.75rem)', color: '#9ca3af', fontStyle: 'italic' }}>
                                        Ajoutez des options ci-dessus pour configurer les alertes
                                      </div>
                                    )}

                                    {/* Pour Chronomètre - alerte sur temps */}
                                    {item.type === 'chronometre' && (
                                      <div style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.8rem)', color: '#7f1d1d' }}>
                                        <span style={{ marginBottom: '0.35rem', display: 'block', fontSize: 'clamp(0.65rem, 2vw, 0.75rem)' }}>
                                          Déclencher une alerte si le temps (en secondes):
                                        </span>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <input
                                              type="checkbox"
                                              checked={item.alertes?.chrono_min_active ?? false}
                                              onChange={(e) => updateItem(sectionIndex, itemIndex, 'alertes.chrono_min_active', e.target.checked)}
                                            />
                                            <span>est inférieur à</span>
                                            <Input
                                              type="number"
                                              placeholder="sec"
                                              value={item.alertes?.chrono_min ?? ''}
                                              onChange={(e) => updateItem(sectionIndex, itemIndex, 'alertes.chrono_min', e.target.value ? parseFloat(e.target.value) : null)}
                                              style={{ width: '70px', fontSize: '0.8rem' }}
                                              disabled={!item.alertes?.chrono_min_active}
                                            />
                                            <span>sec</span>
                                          </label>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <input
                                              type="checkbox"
                                              checked={item.alertes?.chrono_max_active ?? false}
                                              onChange={(e) => updateItem(sectionIndex, itemIndex, 'alertes.chrono_max_active', e.target.checked)}
                                            />
                                            <span>est supérieur à</span>
                                            <Input
                                              type="number"
                                              placeholder="sec"
                                              value={item.alertes?.chrono_max ?? ''}
                                              onChange={(e) => updateItem(sectionIndex, itemIndex, 'alertes.chrono_max', e.target.value ? parseFloat(e.target.value) : null)}
                                              style={{ width: '70px', fontSize: '0.8rem' }}
                                              disabled={!item.alertes?.chrono_max_active}
                                            />
                                            <span>sec</span>
                                          </label>
                                        </div>
                                      </div>
                                    )}

                                    {/* Pour Compte à rebours - alerte si pas terminé à temps */}
                                    {item.type === 'compte_rebours' && (
                                      <div style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.8rem)', color: '#7f1d1d' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                                          <input
                                            type="checkbox"
                                            checked={item.alertes?.alerte_non_termine ?? false}
                                            onChange={(e) => updateItem(sectionIndex, itemIndex, 'alertes.alerte_non_termine', e.target.checked)}
                                          />
                                          <span>Alerte si le compte à rebours n'est pas terminé</span>
                                        </label>
                                      </div>
                                    )}

                                    {/* Pour types numériques (nombre, slider, pression, etc.) */}
                                    {['nombre', 'nombre_unite', 'slider'].includes(item.type) && (
                                      <div style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.8rem)', color: '#7f1d1d' }}>
                                        <span style={{ marginBottom: '0.35rem', display: 'block', fontSize: 'clamp(0.65rem, 2vw, 0.75rem)' }}>
                                          Déclencher une alerte si la valeur{item.config?.unite ? ` (${item.config.unite})` : ''}:
                                        </span>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <input
                                              type="checkbox"
                                              checked={item.alertes?.min_active ?? false}
                                              onChange={(e) => updateItem(sectionIndex, itemIndex, 'alertes.min_active', e.target.checked)}
                                            />
                                            <span>est inférieure à</span>
                                            <Input
                                              type="number"
                                              placeholder="Min"
                                              value={item.alertes?.seuil_min ?? ''}
                                              onChange={(e) => updateItem(sectionIndex, itemIndex, 'alertes.seuil_min', e.target.value ? parseFloat(e.target.value) : null)}
                                              style={{ width: '80px', fontSize: '0.8rem' }}
                                              disabled={!item.alertes?.min_active}
                                            />
                                          </label>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <input
                                              type="checkbox"
                                              checked={item.alertes?.max_active ?? false}
                                              onChange={(e) => updateItem(sectionIndex, itemIndex, 'alertes.max_active', e.target.checked)}
                                            />
                                            <span>est supérieure à</span>
                                            <Input
                                              type="number"
                                              placeholder="Max"
                                              value={item.alertes?.seuil_max ?? ''}
                                              onChange={(e) => updateItem(sectionIndex, itemIndex, 'alertes.seuil_max', e.target.value ? parseFloat(e.target.value) : null)}
                                              style={{ width: '80px', fontSize: '0.8rem' }}
                                              disabled={!item.alertes?.max_active}
                                            />
                                          </label>
                                        </div>
                                      </div>
                                    )}

                                    {/* Pour liste déroulante */}
                                    {item.type === 'liste' && item.options && item.options.length > 0 && (
                                      <div style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.8rem)', color: '#7f1d1d' }}>
                                        <span style={{ marginBottom: '0.25rem', display: 'block', fontSize: 'clamp(0.65rem, 2vw, 0.75rem)' }}>
                                          Cochez les options qui déclenchent une alerte:
                                        </span>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                          {item.options.map((opt, optIdx) => (
                                            <label key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                                              <input
                                                type="checkbox"
                                                checked={item.alertes?.options_declenchantes?.includes(optIdx) ?? false}
                                                onChange={(e) => {
                                                  const current = item.alertes?.options_declenchantes || [];
                                                  const newOpts = e.target.checked 
                                                    ? [...current, optIdx]
                                                    : current.filter(i => i !== optIdx);
                                                  updateItem(sectionIndex, itemIndex, 'alertes.options_declenchantes', newOpts);
                                                }}
                                              />
                                              🔔 {opt}
                                            </label>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Pour texte - alerte si contient certains mots */}
                                    {['texte', 'textarea'].includes(item.type) && (
                                      <div style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.8rem)', color: '#7f1d1d' }}>
                                        <span style={{ marginBottom: '0.35rem', display: 'block', fontSize: 'clamp(0.65rem, 2vw, 0.75rem)' }}>
                                          Déclencher une alerte si le texte contient:
                                        </span>
                                        <Input
                                          placeholder="Mots-clés séparés par des virgules (ex: urgent, défaut, cassé)"
                                          value={item.alertes?.mots_cles || ''}
                                          onChange={(e) => updateItem(sectionIndex, itemIndex, 'alertes.mots_cles', e.target.value)}
                                          style={{ fontSize: '0.8rem', width: '100%' }}
                                        />
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem', cursor: 'pointer' }}>
                                          <input
                                            type="checkbox"
                                            checked={item.alertes?.alerte_si_vide ?? false}
                                            onChange={(e) => updateItem(sectionIndex, itemIndex, 'alertes.alerte_si_vide', e.target.checked)}
                                          />
                                          <span>Alerte si le champ est vide</span>
                                        </label>
                                      </div>
                                    )}

                                    {/* Message personnalisé */}
                                    <div style={{ marginTop: '0.5rem' }}>
                                      <Input
                                        placeholder="Message d'alerte personnalisé (optionnel)"
                                        value={item.alertes?.message || ''}
                                        onChange={(e) => updateItem(sectionIndex, itemIndex, 'alertes.message', e.target.value)}
                                        style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.8rem)', width: '100%', padding: 'clamp(0.35rem, 1.5vw, 0.5rem)' }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </SortableItem>
                            ))}
                          </SortableContext>
                        </DndContext>

                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => addItem(sectionIndex)}
                          style={{ marginTop: '0.5rem' }}
                        >
                          ➕ Ajouter un critère
                        </Button>
                          </>
                        )}
                      </SortableSection>
                    ))}
                  </SortableContext>
                </DndContext>

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
