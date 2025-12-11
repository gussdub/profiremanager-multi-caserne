import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import ImageUpload from './ImageUpload';

const ParametresInventairesVehicules = ({ tenantSlug, user }) => {
  const [modeles, setModeles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modeleEnCours, setModeleEnCours] = useState(null);
  const [emailsNotifications, setEmailsNotifications] = useState([]);
  const [users, setUsers] = useState([]);
  const [typesVehicules, setTypesVehicules] = useState([]);
  const [vehicules, setVehicules] = useState([]);

  // Form state
  const [nom, setNom] = useState('');
  const [typeVehicule, setTypeVehicule] = useState('');
  const [description, setDescription] = useState('');
  const [sections, setSections] = useState([]);

  useEffect(() => {
    fetchModeles();
    fetchUsers();
    fetchEmailsConfig();
    fetchVehicules();
  }, [tenantSlug]);

  const fetchModeles = async () => {
    try {
      const data = await apiGet(tenantSlug, '/parametres/modeles-inventaires-vehicules');
      setModeles(data);
    } catch (error) {
      console.error('Erreur chargement modèles:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await apiGet(tenantSlug, '/users');
      setUsers(data);
    } catch (error) {
      console.error('Erreur chargement users:', error);
    }
  };

  const fetchEmailsConfig = async () => {
    try {
      const tenant = await apiGet(tenantSlug, '/tenant');
      const emails = tenant?.parametres?.emails_notifications_inventaires_vehicules || [];
      setEmailsNotifications(emails);
    } catch (error) {
      console.error('Erreur chargement config emails:', error);
    }
  };

  const handleSaveEmailsConfig = async (newEmails) => {
    try {
      await apiPut(tenantSlug, '/parametres', {
        emails_notifications_inventaires_vehicules: newEmails
      });
      setEmailsNotifications(newEmails);
    } catch (error) {
      console.error('Erreur sauvegarde config emails:', error);
      alert('❌ Erreur lors de la sauvegarde');
    }
  };

  const fetchVehicules = async () => {
    try {
      const data = await apiGet(tenantSlug, '/actifs/vehicules');
      setVehicules(data || []);
      
      // Formater tous les véhicules pour le dropdown
      const vehiculesFormates = data.map(v => ({
        value: v.type_vehicule || v.type || 'inconnu',
        label: `${v.nom} (${(v.type_vehicule || v.type || 'Type inconnu').charAt(0).toUpperCase() + (v.type_vehicule || v.type || '').slice(1).replace(/_/g, ' ')})`,
        vehiculeId: v.id,
        vehiculeNom: v.nom,
        vehiculeType: v.type_vehicule || v.type
      }));
      
      setTypesVehicules(vehiculesFormates);
      
      // Définir le premier véhicule comme défaut si disponible
      if (vehiculesFormates.length > 0 && !typeVehicule) {
        setTypeVehicule(vehiculesFormates[0].value);
      }
    } catch (error) {
      console.error('Erreur chargement véhicules:', error);
    }
  };

  const ouvrirModal = (modele = null) => {
    if (modele) {
      setModeleEnCours(modele);
      setNom(modele.nom);
      setTypeVehicule(modele.type_vehicule);
      setDescription(modele.description || '');
      setSections(modele.sections || []);
    } else {
      setModeleEnCours(null);
      setNom('');
      setTypeVehicule(typesVehicules.length > 0 ? typesVehicules[0].value : '');
      setDescription('');
      setSections([{ titre: 'Section 1', items: [], ordre: 0 }]);
    }
    setShowModal(true);
  };

  const fermerModal = () => {
    setShowModal(false);
    setModeleEnCours(null);
  };

  const ajouterSection = () => {
    setSections([
      ...sections,
      { 
        titre: `Section ${sections.length + 1}`, 
        photo_url: '',
        type_champ: 'checkbox', // Type pour toute la section
        options: [], // Options pour checkbox/radio/select
        items: [], 
        ordre: sections.length 
      }
    ]);
  };

  const dupliquerSection = (index) => {
    const sectionADupliquer = sections[index];
    const nouveleSection = {
      ...sectionADupliquer,
      titre: `${sectionADupliquer.titre} (Copie)`,
      items: sectionADupliquer.items.map(item => ({ ...item })),
      options: sectionADupliquer.options ? sectionADupliquer.options.map(opt => ({ ...opt })) : [],
      ordre: sections.length
    };
    setSections([...sections, nouveleSection]);
  };

  const supprimerSection = (index) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const ajouterItem = (sectionIndex) => {
    const newSections = [...sections];
    newSections[sectionIndex].items.push({
      nom: '',
      obligatoire: false,
      photo_url: '',
      ordre: newSections[sectionIndex].items.length
    });
    setSections(newSections);
  };

  const supprimerItem = (sectionIndex, itemIndex) => {
    const newSections = [...sections];
    newSections[sectionIndex].items = newSections[sectionIndex].items.filter((_, i) => i !== itemIndex);
    setSections(newSections);
  };

  const updateSection = (index, field, value) => {
    const newSections = [...sections];
    newSections[index][field] = value;
    setSections(newSections);
  };

  const updateItem = (sectionIndex, itemIndex, field, value) => {
    const newSections = [...sections];
    newSections[sectionIndex].items[itemIndex][field] = value;
    setSections(newSections);
  };

  const sauvegarderModele = async () => {
    if (!nom || sections.length === 0) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        nom,
        type_vehicule: typeVehicule,
        description,
        sections: sections.map(section => ({
          titre: section.titre,
          ordre: section.ordre,
          items: section.items.map(item => ({
            nom: item.nom,
            obligatoire: item.obligatoire,
            photo_requise: item.photo_requise,
            ordre: item.ordre
          }))
        }))
      };

      if (modeleEnCours) {
        await apiPut(tenantSlug, `/parametres/modeles-inventaires-vehicules/${modeleEnCours.id}`, payload);
        alert('✅ Modèle mis à jour avec succès');
      } else {
        await apiPost(tenantSlug, '/parametres/modeles-inventaires-vehicules', payload);
        alert('✅ Modèle créé avec succès');
      }

      fetchModeles();
      fermerModal();
    } catch (error) {
      console.error('Erreur sauvegarde modèle:', error);
      alert('❌ Erreur lors de la sauvegarde du modèle');
    } finally {
      setLoading(false);
    }
  };

  const supprimerModele = async (modeleId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce modèle ?')) return;

    try {
      await apiDelete(tenantSlug, `/parametres/modeles-inventaires-vehicules/${modeleId}`);
      alert('✅ Modèle supprimé avec succès');
      fetchModeles();
    } catch (error) {
      console.error('Erreur suppression modèle:', error);
      alert('❌ Erreur lors de la suppression');
    }
  };

  const sauvegarderEmailsConfig = async () => {
    try {
      await apiPut(tenantSlug, '/tenant/parametres', {
        emails_notifications_inventaires_vehicules: emailsNotifications
      });
      alert('✅ Configuration des emails enregistrée');
    } catch (error) {
      console.error('Erreur sauvegarde emails:', error);
      alert('❌ Erreur lors de la sauvegarde');
    }
  };

  const toggleUserEmail = (userId) => {
    if (emailsNotifications.includes(userId)) {
      setEmailsNotifications(emailsNotifications.filter(id => id !== userId));
    } else {
      setEmailsNotifications([...emailsNotifications, userId]);
    }
  };

  if (!user || !['admin', 'superviseur'].includes(user.role)) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#dc2626' }}>⛔ Accès refusé - Admin/Superviseur uniquement</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1f2937' }}>
        ⚙️ Inventaires Véhicules
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
        Créez et gérez les modèles d'inventaires pour vos véhicules
      </p>

      {/* Bouton créer */}
      <button
        onClick={() => ouvrirModal()}
        style={{
          backgroundColor: '#10b981',
          color: 'white',
          padding: '0.75rem 1.5rem',
          borderRadius: '0.5rem',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1rem',
          fontWeight: '600',
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
      >
        <span style={{ fontSize: '1.25rem' }}>+</span>
        Créer un Modèle d'Inventaire
      </button>

      {/* Liste des modèles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        {modeles.map(modele => (
          <div
            key={modele.id}
            style={{
              backgroundColor: 'white',
              padding: '1.5rem',
              borderRadius: '0.75rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #e5e7eb'
            }}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem', color: '#1f2937' }}>
              {modele.nom}
            </h3>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
              Type: <strong>{typesVehicules.find(t => t.value === modele.type_vehicule)?.label || modele.type_vehicule}</strong>
            </p>
            {modele.description && (
              <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
                {modele.description}
              </p>
            )}
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
              📋 {modele.sections?.length || 0} section(s) • {modele.sections?.reduce((acc, s) => acc + (s.items?.length || 0), 0) || 0} item(s)
            </p>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => ouvrirModal(modele)}
                style={{
                  flex: 1,
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                ✏️ Modifier
              </button>
              <button
                onClick={() => supprimerModele(modele.id)}
                style={{
                  flex: 1,
                  backgroundColor: '#ef4444',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                🗑️ Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Configuration Emails */}
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
          📧 Notifications Email
        </h2>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
          Sélectionnez les utilisateurs qui recevront les notifications lorsque des items sont manquants ou défectueux lors des inventaires.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {users.map(u => (
            <label
              key={u.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                backgroundColor: emailsNotifications.includes(u.id) ? '#eff6ff' : 'white'
              }}
            >
              <input
                type="checkbox"
                checked={emailsNotifications.includes(u.id)}
                onChange={() => toggleUserEmail(u.id)}
                style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.875rem', color: '#1f2937' }}>
                {u.prenom} {u.nom}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                ({u.role})
              </span>
            </label>
          ))}
        </div>

        <button
          onClick={sauvegarderEmailsConfig}
          style={{
            backgroundColor: '#10b981',
            color: 'white',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '600'
          }}
        >
          💾 Enregistrer la Configuration
        </button>
      </div>

      {/* Modal création/édition */}
      {showModal && (
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
            borderRadius: '0.75rem',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
            padding: '2rem'
          }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: '600', marginBottom: '1.5rem', color: '#1f2937' }}>
              {modeleEnCours ? '✏️ Modifier le Modèle' : '➕ Créer un Modèle d\'Inventaire'}
            </h2>

            {/* Champs de base */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                Nom du modèle *
              </label>
              <input
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Ex: Inventaire Autopompe Standard"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '1rem'
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                Type de véhicule *
              </label>
              <select
                value={typeVehicule}
                onChange={(e) => setTypeVehicule(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '1rem'
                }}
              >
                {typesVehicules.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#374151' }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description optionnelle..."
                rows="3"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Sections */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1f2937' }}>Sections et Items</h3>
                <button
                  onClick={ajouterSection}
                  style={{
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.5rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  + Ajouter une Section
                </button>
              </div>

              {sections.map((section, sIndex) => (
                <div key={sIndex} style={{ marginBottom: '1.5rem', padding: '1rem', border: '2px solid #8e44ad', borderRadius: '0.5rem', backgroundColor: '#fafafa' }}>
                  {/* En-tête section */}
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
                    <input
                      type="text"
                      value={section.titre}
                      onChange={(e) => updateSection(sIndex, 'titre', e.target.value)}
                      placeholder="Titre de la section (ex: Coffre latéral gauche)"
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        border: '2px solid #8e44ad',
                        borderRadius: '0.375rem',
                        fontWeight: '600',
                        fontSize: '1rem'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => dupliquerSection(sIndex)}
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
                      onClick={() => supprimerSection(sIndex)}
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

                  {/* Type de champ pour toute la section */}
                  <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f3e8ff', borderRadius: '0.375rem', border: '1px solid #c084fc' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#6b21a8' }}>
                      Type de réponse pour cette section :
                    </label>
                    <select
                      value={section.type_champ || 'checkbox'}
                      onChange={(e) => updateSection(sIndex, 'type_champ', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #c084fc',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        backgroundColor: 'white',
                        fontWeight: '600'
                      }}
                    >
                      <option value="checkbox">☑️ Cases à cocher (multiple)</option>
                      <option value="radio">🔘 Puce (une seule)</option>
                      <option value="text">📝 Texte libre</option>
                      <option value="number">🔢 Nombre</option>
                      <option value="select">📋 Liste déroulante</option>
                      <option value="photo">📸 Photo obligatoire</option>
                    </select>

                    {/* Options pour checkbox, radio, select */}
                    {(section.type_champ === 'checkbox' || section.type_champ === 'radio' || section.type_champ === 'select') && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <label style={{ fontSize: '0.75rem', color: '#6b21a8', fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>
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
                                updateSection(sIndex, 'options', newOptions);
                              }}
                              placeholder="Ex: Présent, Absent, Défectueux..."
                              style={{
                                flex: 1,
                                padding: '0.375rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '0.25rem',
                                fontSize: '0.75rem'
                              }}
                            />
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                              <input
                                type="checkbox"
                                checked={opt.declencherAlerte || false}
                                onChange={(e) => {
                                  const newOptions = [...(section.options || [])];
                                  newOptions[optIndex] = { ...newOptions[optIndex], declencherAlerte: e.target.checked };
                                  updateSection(sIndex, 'options', newOptions);
                                }}
                              />
                              ⚠️ Alerte
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const newOptions = (section.options || []).filter((_, i) => i !== optIndex);
                                updateSection(sIndex, 'options', newOptions);
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
                            updateSection(sIndex, 'options', newOptions);
                          }}
                          style={{
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            padding: '0.375rem 0.75rem',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                            marginTop: '0.25rem'
                          }}
                        >
                          + Ajouter une option
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Upload photo de section */}
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem', display: 'block' }}>Photo de référence de la section :</label>
                    <ImageUpload
                      value={section.photo_url || ''}
                      onChange={(url) => updateSection(sIndex, 'photo_url', url)}
                      compact={true}
                    />
                  </div>

                  {/* Items de la section */}
                  <div style={{ marginLeft: '1rem' }}>
                    {section.items.map((item, iIndex) => (
                      <div key={iIndex} style={{ 
                        marginBottom: '1rem', 
                        padding: '0.75rem', 
                        backgroundColor: 'white', 
                        borderRadius: '0.375rem',
                        border: '1px solid #e5e7eb'
                      }}>
                        {/* Première ligne : Nom + Type */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <input
                            type="text"
                            value={item.nom}
                            onChange={(e) => updateItem(sIndex, iIndex, 'nom', e.target.value)}
                            placeholder="Nom de l'item (ex: Extincteur 10lb)"
                            style={{
                              flex: 1,
                              padding: '0.5rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.375rem',
                              fontSize: '0.875rem'
                            }}
                          />
                          <select
                            value={item.type_champ || 'checkbox'}
                            onChange={(e) => updateItem(sIndex, iIndex, 'type_champ', e.target.value)}
                            style={{
                              padding: '0.5rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.375rem',
                              fontSize: '0.75rem',
                              backgroundColor: 'white'
                            }}
                          >
                            <option value="checkbox">☑️ Cases à cocher (multiple)</option>
                            <option value="radio">🔘 Puce (une seule)</option>
                            <option value="text">📝 Texte libre</option>
                            <option value="number">🔢 Nombre</option>
                            <option value="select">📋 Liste déroulante</option>
                            <option value="photo">📸 Photo obligatoire</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => supprimerItem(sIndex, iIndex)}
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

                        {/* Options configurables pour checkbox, radio, select */}
                        {(item.type_champ === 'checkbox' || item.type_champ === 'radio' || item.type_champ === 'select') && (
                          <div style={{ marginBottom: '0.5rem', paddingLeft: '0.5rem', borderLeft: '2px solid #3b82f6', backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: '0.375rem' }}>
                            <label style={{ fontSize: '0.75rem', color: '#374151', fontWeight: '600', display: 'block', marginBottom: '0.5rem' }}>
                              Options :
                            </label>
                            
                            {(item.options || []).map((opt, optIndex) => (
                              <div key={optIndex} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <input
                                  type="text"
                                  value={opt.label || ''}
                                  onChange={(e) => {
                                    const newOptions = [...(item.options || [])];
                                    newOptions[optIndex] = { ...newOptions[optIndex], label: e.target.value };
                                    updateItem(sIndex, iIndex, 'options', newOptions);
                                  }}
                                  placeholder="Ex: Présent, Absent, Défectueux..."
                                  style={{
                                    flex: 1,
                                    padding: '0.375rem',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.75rem'
                                  }}
                                />
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                                  <input
                                    type="checkbox"
                                    checked={opt.declencherAlerte || false}
                                    onChange={(e) => {
                                      const newOptions = [...(item.options || [])];
                                      newOptions[optIndex] = { ...newOptions[optIndex], declencherAlerte: e.target.checked };
                                      updateItem(sIndex, iIndex, 'options', newOptions);
                                    }}
                                  />
                                  ⚠️ Alerte
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newOptions = (item.options || []).filter((_, i) => i !== optIndex);
                                    updateItem(sIndex, iIndex, 'options', newOptions);
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
                                const newOptions = [...(item.options || []), { label: '', declencherAlerte: false }];
                                updateItem(sIndex, iIndex, 'options', newOptions);
                              }}
                              style={{
                                backgroundColor: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.25rem',
                                padding: '0.375rem 0.75rem',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                marginTop: '0.25rem'
                              }}
                            >
                              + Ajouter une option
                            </button>
                          </div>
                        )}

                        {/* Deuxième ligne : Options */}
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem' }}>
                            <input
                              type="checkbox"
                              checked={item.obligatoire}
                              onChange={(e) => updateItem(sIndex, iIndex, 'obligatoire', e.target.checked)}
                            />
                            Obligatoire
                          </label>
                          
                          {/* Upload photo de référence */}
                          <ImageUpload
                            value={item.photo_url || ''}
                            onChange={(url) => updateItem(sIndex, iIndex, 'photo_url', url)}
                            compact={true}
                          />
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => ajouterItem(sIndex)}
                      style={{
                        backgroundColor: '#10b981',
                        color: 'white',
                        padding: '0.375rem 0.75rem',
                        borderRadius: '0.375rem',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        marginTop: '0.5rem'
                      }}
                    >
                      + Ajouter un Item
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Boutons */}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                onClick={fermerModal}
                disabled={loading}
                style={{
                  backgroundColor: '#6b7280',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '1rem'
                }}
              >
                Annuler
              </button>
              <button
                onClick={sauvegarderModele}
                disabled={loading}
                style={{
                  backgroundColor: '#10b981',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '1rem',
                  fontWeight: '600'
                }}
              >
                {loading ? 'Enregistrement...' : '💾 Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParametresInventairesVehicules;
