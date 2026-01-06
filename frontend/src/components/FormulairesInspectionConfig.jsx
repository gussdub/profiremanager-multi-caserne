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
const SortableSection = ({ section, sectionIndex, children, onRemove }) => {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
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
              fontSize: '1.2rem',
              color: '#64748b',
              touchAction: 'none'
            }}
            title="Glisser pour réorganiser"
          >
            ⋮⋮
          </button>
          {children}
        </div>
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
    { value: 'conforme_nc', label: '✅ Conforme / Non conforme', category: 'basic' },
    { value: 'oui_non', label: '👍 Oui / Non', category: 'basic' },
    { value: 'present_absent', label: '📦 Présent / Absent / Défectueux', category: 'basic' },
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
      type: 'conforme_nc',
      obligatoire: false,
      permettre_photo: false, // Permet de joindre une photo en réponse
      options: [],
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

                  {/* Catégories concernées - SEULEMENT pour type "inspection" */}
                  {formData.type === 'inspection' && (
                    <div>
                      <Label>📂 Catégories d'équipement concernées *</Label>
                      <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0.5rem' }}>
                        Sélectionnez les catégories pour lesquelles ce formulaire sera utilisé
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
                        onRemove={() => removeSection(sectionIndex)}
                      >
                        {/* Section header content */}
                        <div style={{ flex: 1, display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <Input
                            value={section.nom || section.titre || ''}
                            onChange={(e) => updateSection(sectionIndex, 'nom', e.target.value)}
                            placeholder="Nom de la section"
                            style={{ flex: 1, minWidth: '150px' }}
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

                        {/* Photos de référence de la section */}
                        <div style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>📷 Photos de référence:</span>
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
                                      value={item.label || item.nom || ''}
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
                      </SortableSection>
                    ))}
                  </SortableContext>
                </DndContext>

                {formData.sections.length === 0 && ( 
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
