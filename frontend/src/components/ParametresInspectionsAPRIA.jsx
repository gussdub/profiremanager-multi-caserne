import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import ImageUpload from './ImageUpload';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
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

// Types de champs disponibles
const TYPES_CHAMPS = [
  { value: 'checkbox', label: '☑️ Cases à cocher (multiple)', hasOptions: true },
  { value: 'radio', label: '🔘 Puces radio (une seule)', hasOptions: true },
  { value: 'select', label: '📋 Liste déroulante', hasOptions: true },
  { value: 'multiselect', label: '📋 Sélection multiple', hasOptions: true },
  { value: 'text', label: '📝 Texte libre', hasOptions: false },
  { value: 'number', label: '🔢 Nombre', hasOptions: false, hasUnit: true },
  { value: 'toggle', label: '🔀 Oui/Non', hasOptions: false },
  { value: 'date', label: '📅 Date', hasOptions: false },
  { value: 'timer', label: '⏱️ Chronomètre', hasOptions: false, hasUnit: true },
  { value: 'photo', label: '📸 Photo', hasOptions: false },
  { value: 'signature', label: '✍️ Signature', hasOptions: false },
  { value: 'geolocation', label: '📍 Géolocalisation', hasOptions: false },
  { value: 'rating', label: '⭐ Évaluation (étoiles)', hasOptions: false },
];

// Composant pour un item draggable
const SortableItem = ({ id, item, index, sectionIndex, updateItem, supprimerItem }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        marginBottom: '0.75rem',
        padding: '0.75rem',
        backgroundColor: 'white',
        borderRadius: '0.375rem',
        border: '1px solid #e5e7eb'
      }}
    >
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <div
          {...attributes}
          {...listeners}
          style={{
            cursor: 'grab',
            padding: '0.25rem',
            color: '#9ca3af',
            fontSize: '1.2rem',
            lineHeight: '1',
            userSelect: 'none'
          }}
          title="Glisser pour réorganiser"
        >
          ⋮⋮
        </div>
        <span style={{ fontSize: '0.875rem', color: '#6b7280', minWidth: '20px' }}>{index + 1}.</span>
        <input
          type="text"
          value={item.nom}
          onChange={(e) => updateItem(sectionIndex, index, 'nom', e.target.value)}
          placeholder="Nom de l'item (ex: Sangle dorsale intacte)"
          style={{
            flex: 1,
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem'
          }}
        />
        <ImageUpload
          value={item.photo_url || ''}
          onChange={(url) => updateItem(sectionIndex, index, 'photo_url', url)}
          compact={true}
        />
        <button
          type="button"
          onClick={() => supprimerItem(sectionIndex, index)}
          style={{
            backgroundColor: '#ef4444',
            color: 'white',
            padding: '0.375rem 0.5rem',
            borderRadius: '0.375rem',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.75rem'
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

// Composant pour une section draggable (identique à bornes sèches)
const SortableSection = ({ 
  id, 
  section, 
  sectionIndex, 
  updateSection, 
  updateItem, 
  ajouterItem, 
  supprimerItem, 
  dupliquerSection, 
  supprimerSection,
  handleDragEndItems
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const typeChamp = TYPES_CHAMPS.find(t => t.value === section.type_champ) || TYPES_CHAMPS[0];
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        marginBottom: '1.5rem',
        padding: '1rem',
        border: '2px solid #f97316',
        borderRadius: '0.5rem',
        backgroundColor: '#fff7ed'
      }}
    >
      {/* En-tête section */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
        <div
          {...attributes}
          {...listeners}
          style={{
            cursor: 'grab',
            padding: '0.5rem',
            color: '#f97316',
            fontSize: '1.5rem',
            lineHeight: '1',
            userSelect: 'none',
            fontWeight: 'bold'
          }}
          title="Glisser pour réorganiser la section"
        >
          ⋮⋮
        </div>
        <input
          type="text"
          value={section.titre}
          onChange={(e) => updateSection(sectionIndex, 'titre', e.target.value)}
          placeholder="Titre de la section"
          style={{
            flex: 1,
            padding: '0.5rem',
            border: '2px solid #f97316',
            borderRadius: '0.375rem',
            fontWeight: '600',
            fontSize: '1rem'
          }}
        />
        <button
          type="button"
          onClick={() => dupliquerSection(sectionIndex)}
          style={{
            backgroundColor: '#3b82f6',
            color: 'white',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
          title="Dupliquer cette section"
        >
          📋
        </button>
        <button
          type="button"
          onClick={() => supprimerSection(sectionIndex)}
          style={{
            backgroundColor: '#ef4444',
            color: 'white',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          🗑️
        </button>
      </div>

      {/* Type de champ */}
      <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#fed7aa', borderRadius: '0.375rem', border: '1px solid #fdba74' }}>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#9a3412' }}>
          Type de réponse pour cette section :
        </label>
        <select
          value={section.type_champ || 'checkbox'}
          onChange={(e) => updateSection(sectionIndex, 'type_champ', e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #fdba74',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            backgroundColor: 'white',
            fontWeight: '600'
          }}
        >
          {TYPES_CHAMPS.map(type => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>

        {/* Unité pour les champs numériques */}
        {typeChamp.hasUnit && (
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label style={{ fontSize: '0.75rem', color: '#9a3412', fontWeight: '600' }}>Unité:</label>
            <input
              type="text"
              value={section.unite || ''}
              onChange={(e) => updateSection(sectionIndex, 'unite', e.target.value)}
              placeholder="Ex: PSI, secondes"
              style={{
                flex: 1,
                padding: '0.375rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
                fontSize: '0.75rem'
              }}
            />
            <label style={{ fontSize: '0.75rem', color: '#9a3412', fontWeight: '600' }}>Seuil minimum:</label>
            <input
              type="number"
              value={section.seuil_minimum || ''}
              onChange={(e) => updateSection(sectionIndex, 'seuil_minimum', e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="Ex: 4050"
              style={{
                width: '80px',
                padding: '0.375rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
                fontSize: '0.75rem'
              }}
            />
          </div>
        )}

        {/* Options pour checkbox, radio, select, multiselect */}
        {typeChamp.hasOptions && (
          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', color: '#9a3412', fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>
              Options de réponse :
            </label>
            
            {(section.options || []).map((opt, optIndex) => (
              <div key={optIndex} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  value={opt.label || ''}
                  onChange={(e) => {
                    const newOptions = [...(section.options || [])];
                    newOptions[optIndex] = { ...newOptions[optIndex], label: e.target.value };
                    updateSection(sectionIndex, 'options', newOptions);
                  }}
                  placeholder="Ex: Conforme, Non conforme..."
                  style={{
                    flex: 1,
                    padding: '0.375rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.25rem',
                    fontSize: '0.75rem'
                  }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', whiteSpace: 'nowrap', color: '#f97316' }}>
                  <input
                    type="checkbox"
                    checked={opt.declencherAlerte || false}
                    onChange={(e) => {
                      const newOptions = [...(section.options || [])];
                      newOptions[optIndex] = { ...newOptions[optIndex], declencherAlerte: e.target.checked };
                      updateSection(sectionIndex, 'options', newOptions);
                    }}
                  />
                  ⚠️ Alerte
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const newOptions = (section.options || []).filter((_, i) => i !== optIndex);
                    updateSection(sectionIndex, 'options', newOptions);
                  }}
                  style={{
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    padding: '0.25rem 0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.7rem'
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            
            <button
              type="button"
              onClick={() => {
                const newOptions = [...(section.options || []), { label: '', declencherAlerte: false }];
                updateSection(sectionIndex, 'options', newOptions);
              }}
              style={{
                marginTop: '0.5rem',
                padding: '0.375rem 0.75rem',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                fontSize: '0.75rem'
              }}
            >
              + Ajouter une option
            </button>
          </div>
        )}
      </div>

      {/* Liste des items (pour les sections avec items) */}
      {(section.type_champ === 'checkbox' || section.type_champ === 'radio') && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
              Items à vérifier ({section.items?.length || 0})
            </h4>
            <button
              type="button"
              onClick={() => ajouterItem(sectionIndex)}
              style={{
                padding: '0.375rem 0.75rem',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.75rem'
              }}
            >
              + Ajouter un item
            </button>
          </div>

          {section.items && section.items.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event) => handleDragEndItems(event, sectionIndex)}
            >
              <SortableContext
                items={section.items.map(item => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {section.items.map((item, itemIndex) => (
                  <SortableItem
                    key={item.id}
                    id={item.id}
                    item={item}
                    index={itemIndex}
                    sectionIndex={sectionIndex}
                    updateItem={updateItem}
                    supprimerItem={supprimerItem}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af', backgroundColor: 'white', borderRadius: '0.375rem', border: '1px dashed #d1d5db' }}>
              Aucun item. Cliquez sur "+ Ajouter un item" pour commencer.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Composant principal
const ParametresInspectionsAPRIA = ({ tenantSlug }) => {
  const [modeles, setModeles] = useState([]);
  const [modeleEnCours, setModeleEnCours] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showEditeur, setShowEditeur] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [users, setUsers] = useState([]);
  const [showContactsConfig, setShowContactsConfig] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Charger les modèles
  const fetchModeles = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, '/apria/modeles-inspection');
      setModeles(data);
    } catch (error) {
      console.error('Erreur chargement modèles:', error);
    } finally {
      setLoading(false);
    }
  };

  // Charger les paramètres (contacts)
  const fetchParametres = async () => {
    try {
      const data = await apiGet(tenantSlug, '/apria/parametres');
      setContacts(data.contacts_alertes || []);
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
    }
  };

  // Charger les utilisateurs
  const fetchUsers = async () => {
    try {
      const data = await apiGet(tenantSlug, '/users');
      setUsers(data);
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
    }
  };

  useEffect(() => {
    fetchModeles();
    fetchParametres();
    fetchUsers();
  }, [tenantSlug]);

  // Créer un nouveau modèle
  const nouveauModele = () => {
    setModeleEnCours({
      nom: 'Nouveau modèle APRIA',
      description: '',
      sections: []
    });
    setShowEditeur(true);
  };

  // Éditer un modèle existant
  const editerModele = (modele) => {
    setModeleEnCours({ ...modele });
    setShowEditeur(true);
  };

  // Ajouter une section
  const ajouterSection = () => {
    const newSection = {
      id: `section_${Date.now()}`,
      titre: '',
      type_champ: 'radio',
      options: [
        { label: 'Conforme', declencherAlerte: false },
        { label: 'Non conforme', declencherAlerte: true }
      ],
      items: [],
      ordre: modeleEnCours.sections.length
    };
    setModeleEnCours({
      ...modeleEnCours,
      sections: [...modeleEnCours.sections, newSection]
    });
  };

  // Mettre à jour une section
  const updateSection = (sectionIndex, field, value) => {
    const newSections = [...modeleEnCours.sections];
    newSections[sectionIndex] = { ...newSections[sectionIndex], [field]: value };
    setModeleEnCours({ ...modeleEnCours, sections: newSections });
  };

  // Dupliquer une section
  const dupliquerSection = (sectionIndex) => {
    const sectionToDuplicate = modeleEnCours.sections[sectionIndex];
    const newSection = {
      ...sectionToDuplicate,
      id: `section_${Date.now()}`,
      titre: `${sectionToDuplicate.titre} (copie)`,
      items: sectionToDuplicate.items.map(item => ({
        ...item,
        id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }))
    };
    const newSections = [...modeleEnCours.sections];
    newSections.splice(sectionIndex + 1, 0, newSection);
    setModeleEnCours({ ...modeleEnCours, sections: newSections });
  };

  // Supprimer une section
  const supprimerSection = (sectionIndex) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette section ?')) {
      const newSections = modeleEnCours.sections.filter((_, i) => i !== sectionIndex);
      setModeleEnCours({ ...modeleEnCours, sections: newSections });
    }
  };

  // Ajouter un item à une section
  const ajouterItem = (sectionIndex) => {
    const newItem = {
      id: `item_${Date.now()}`,
      nom: '',
      photo_url: '',
      obligatoire: false,
      ordre: modeleEnCours.sections[sectionIndex].items?.length || 0
    };
    const newSections = [...modeleEnCours.sections];
    newSections[sectionIndex] = {
      ...newSections[sectionIndex],
      items: [...(newSections[sectionIndex].items || []), newItem]
    };
    setModeleEnCours({ ...modeleEnCours, sections: newSections });
  };

  // Mettre à jour un item
  const updateItem = (sectionIndex, itemIndex, field, value) => {
    const newSections = [...modeleEnCours.sections];
    const newItems = [...newSections[sectionIndex].items];
    newItems[itemIndex] = { ...newItems[itemIndex], [field]: value };
    newSections[sectionIndex] = { ...newSections[sectionIndex], items: newItems };
    setModeleEnCours({ ...modeleEnCours, sections: newSections });
  };

  // Supprimer un item
  const supprimerItem = (sectionIndex, itemIndex) => {
    const newSections = [...modeleEnCours.sections];
    newSections[sectionIndex] = {
      ...newSections[sectionIndex],
      items: newSections[sectionIndex].items.filter((_, i) => i !== itemIndex)
    };
    setModeleEnCours({ ...modeleEnCours, sections: newSections });
  };

  // Drag & Drop sections
  const handleDragEndSections = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = modeleEnCours.sections.findIndex(s => s.id === active.id);
      const newIndex = modeleEnCours.sections.findIndex(s => s.id === over.id);
      const newSections = arrayMove(modeleEnCours.sections, oldIndex, newIndex);
      setModeleEnCours({ ...modeleEnCours, sections: newSections });
    }
  };

  // Drag & Drop items
  const handleDragEndItems = (event, sectionIndex) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const section = modeleEnCours.sections[sectionIndex];
      const oldIndex = section.items.findIndex(i => i.id === active.id);
      const newIndex = section.items.findIndex(i => i.id === over.id);
      const newItems = arrayMove(section.items, oldIndex, newIndex);
      const newSections = [...modeleEnCours.sections];
      newSections[sectionIndex] = { ...section, items: newItems };
      setModeleEnCours({ ...modeleEnCours, sections: newSections });
    }
  };

  // Sauvegarder le modèle
  const sauvegarderModele = async () => {
    if (!modeleEnCours.nom.trim()) {
      alert('Veuillez donner un nom au modèle');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        nom: modeleEnCours.nom,
        description: modeleEnCours.description,
        sections: modeleEnCours.sections.map((s, i) => ({ ...s, ordre: i }))
      };

      if (modeleEnCours.id) {
        await apiPut(tenantSlug, `/apria/modeles-inspection/${modeleEnCours.id}`, payload);
      } else {
        await apiPost(tenantSlug, '/apria/modeles-inspection', payload);
      }

      alert('Modèle sauvegardé avec succès !');
      setShowEditeur(false);
      setModeleEnCours(null);
      fetchModeles();
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('Erreur lors de la sauvegarde: ' + (error.message || 'Erreur inconnue'));
    } finally {
      setSaving(false);
    }
  };

  // Activer un modèle
  const activerModele = async (modeleId) => {
    try {
      await apiPost(tenantSlug, `/apria/modeles-inspection/${modeleId}/activer`, {});
      fetchModeles();
    } catch (error) {
      console.error('Erreur activation:', error);
      alert('Erreur lors de l\'activation');
    }
  };

  // Supprimer un modèle
  const supprimerModele = async (modeleId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce modèle ?')) return;
    
    try {
      await apiDelete(tenantSlug, `/apria/modeles-inspection/${modeleId}`);
      fetchModeles();
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert('Erreur: ' + (error.message || 'Impossible de supprimer'));
    }
  };

  // Dupliquer un modèle existant
  const dupliquerModele = async (modele) => {
    const nouveauNom = window.prompt(
      'Nom du nouveau formulaire:',
      `${modele.nom} (copie)`
    );
    
    if (!nouveauNom) return;
    
    try {
      await apiPost(tenantSlug, `/apria/modeles-inspection/${modele.id}/dupliquer`, {
        nouveau_nom: nouveauNom
      });
      fetchModeles();
      alert(`✅ Formulaire "${nouveauNom}" créé avec succès!`);
    } catch (error) {
      console.error('Erreur duplication:', error);
      alert('Erreur: ' + (error.message || 'Impossible de dupliquer'));
    }
  };

  // Sauvegarder les contacts
  const sauvegarderContacts = async () => {
    try {
      await apiPut(tenantSlug, '/apria/parametres', { contacts_alertes: contacts });
      alert('✅ Contacts sauvegardés avec succès');
      setShowContactsConfig(false);
    } catch (error) {
      console.error('Erreur sauvegarde contacts:', error);
      alert('Erreur lors de la sauvegarde');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
        Chargement des modèles...
      </div>
    );
  }

  // Éditeur de modèle
  if (showEditeur && modeleEnCours) {
    return (
      <div style={{ padding: '1rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <button
              onClick={() => {
                if (window.confirm('Quitter sans sauvegarder ?')) {
                  setShowEditeur(false);
                  setModeleEnCours(null);
                }
              }}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                marginRight: '1rem'
              }}
            >
              ← Retour
            </button>
            <span style={{ fontSize: '1.25rem', fontWeight: '600' }}>
              {modeleEnCours.id ? 'Modifier le modèle' : 'Nouveau modèle'}
            </span>
          </div>
          <button
            onClick={sauvegarderModele}
            disabled={saving}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: saving ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: '600'
            }}
          >
            {saving ? '⏳ Sauvegarde...' : '💾 Sauvegarder'}
          </button>
        </div>

        {/* Infos modèle */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>Nom du modèle *</label>
            <input
              type="text"
              value={modeleEnCours.nom}
              onChange={(e) => setModeleEnCours({ ...modeleEnCours, nom: e.target.value })}
              placeholder="Ex: Inspection mensuelle APRIA..."
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '1rem'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>Description</label>
            <textarea
              value={modeleEnCours.description}
              onChange={(e) => setModeleEnCours({ ...modeleEnCours, description: e.target.value })}
              placeholder="Description optionnelle du modèle..."
              rows={2}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                resize: 'vertical'
              }}
            />
          </div>
        </div>

        {/* Sections */}
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600' }}>
            Sections du formulaire ({modeleEnCours.sections.length})
          </h3>
          <button
            onClick={ajouterSection}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#f97316',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            + Ajouter une section
          </button>
        </div>

        {modeleEnCours.sections.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEndSections}
          >
            <SortableContext
              items={modeleEnCours.sections.map(s => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {modeleEnCours.sections.map((section, index) => (
                <SortableSection
                  key={section.id}
                  id={section.id}
                  section={section}
                  sectionIndex={index}
                  updateSection={updateSection}
                  updateItem={updateItem}
                  ajouterItem={ajouterItem}
                  supprimerItem={supprimerItem}
                  dupliquerSection={dupliquerSection}
                  supprimerSection={supprimerSection}
                  handleDragEndItems={handleDragEndItems}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '2px dashed #d1d5db' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
            <p>Aucune section. Cliquez sur "+ Ajouter une section" pour commencer.</p>
          </div>
        )}
      </div>
    );
  }

  // Configuration des contacts
  if (showContactsConfig) {
    return (
      <div style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>
            👥 Personnes à contacter pour les alertes APRIA
          </h2>
          <button
            onClick={() => setShowContactsConfig(false)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer'
            }}
          >
            ← Retour
          </button>
        </div>

        <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
          Sélectionnez les personnes qui recevront des alertes lors d'inspections non conformes ou de problèmes détectés sur les APRIA.
        </p>

        <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {users.filter(u => ['admin', 'superviseur'].includes(u.role)).map(user => (
            <label
              key={user.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                backgroundColor: contacts.includes(user.id) ? '#fef3c7' : 'white',
                borderRadius: '0.5rem',
                border: contacts.includes(user.id) ? '2px solid #f97316' : '1px solid #e5e7eb',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={contacts.includes(user.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setContacts([...contacts, user.id]);
                  } else {
                    setContacts(contacts.filter(id => id !== user.id));
                  }
                }}
                style={{ width: '1.25rem', height: '1.25rem' }}
              />
              <div>
                <div style={{ fontWeight: '600' }}>{user.prenom} {user.nom}</div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{user.email} - {user.role}</div>
              </div>
            </label>
          ))}
        </div>

        <h4 style={{ marginBottom: '0.75rem' }}>Autres utilisateurs :</h4>
        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {users.filter(u => !['admin', 'superviseur'].includes(u.role)).map(user => (
            <label
              key={user.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.5rem 1rem',
                backgroundColor: contacts.includes(user.id) ? '#fef3c7' : '#f9fafb',
                borderRadius: '0.375rem',
                border: contacts.includes(user.id) ? '2px solid #f97316' : '1px solid #e5e7eb',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              <input
                type="checkbox"
                checked={contacts.includes(user.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setContacts([...contacts, user.id]);
                  } else {
                    setContacts(contacts.filter(id => id !== user.id));
                  }
                }}
              />
              {user.prenom} {user.nom} ({user.email})
            </label>
          ))}
        </div>

        <button
          onClick={sauvegarderContacts}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          💾 Sauvegarder les contacts
        </button>
      </div>
    );
  }

  // Liste des modèles
  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: '#111827' }}>
            📝 Gestion APRIA - Inspections
          </h2>
          <p style={{ margin: '0.5rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
            Créez et personnalisez les formulaires d'inspection APRIA
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setShowContactsConfig(true)}
            style={{
              padding: '0.75rem 1.25rem',
              backgroundColor: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            👥 Personnes à contacter
          </button>
          <button
            onClick={nouveauModele}
            style={{
              padding: '0.75rem 1.25rem',
              backgroundColor: '#f97316',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            ➕ Nouveau modèle
          </button>
        </div>
      </div>

      {/* Liste des modèles */}
      {modeles.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: '0.75rem', border: '2px dashed #d1d5db' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📝</div>
          <h3 style={{ margin: '0 0 0.5rem', color: '#374151' }}>Aucun modèle d'inspection APRIA</h3>
          <p>Créez votre premier modèle pour personnaliser les inspections d'APRIA.</p>
          <button
            onClick={nouveauModele}
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f97316',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Créer un modèle
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {modeles.map(modele => (
            <div
              key={modele.id}
              style={{
                padding: '1.25rem',
                backgroundColor: 'white',
                borderRadius: '0.75rem',
                border: modele.est_actif ? '2px solid #f97316' : '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600' }}>{modele.nom}</h3>
                    {modele.est_actif && (
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        backgroundColor: '#fed7aa',
                        color: '#9a3412',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '600'
                      }}>
                        ✓ Actif
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
                    {modele.description || 'Aucune description'}
                  </p>
                  <p style={{ margin: '0.5rem 0 0', color: '#9ca3af', fontSize: '0.75rem' }}>
                    {modele.sections?.length || 0} section(s)
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {!modele.est_actif && (
                    <button
                      onClick={() => activerModele(modele.id)}
                      style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      Activer
                    </button>
                  )}
                  <button
                    onClick={() => editerModele(modele)}
                    style={{
                      padding: '0.5rem 0.75rem',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.75rem'
                    }}
                  >
                    ✏️ Modifier
                  </button>
                  <button
                    onClick={() => dupliquerModele(modele)}
                    style={{
                      padding: '0.5rem 0.75rem',
                      backgroundColor: '#8b5cf6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.75rem'
                    }}
                    title="Créer une copie de ce modèle"
                  >
                    📋 Copier
                  </button>
                  {!modele.est_actif && (
                    <button
                      onClick={() => supprimerModele(modele.id)}
                      style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ParametresInspectionsAPRIA;
