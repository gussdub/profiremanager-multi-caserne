import React, { useState, useRef } from 'react';
import { Button } from './ui/button';
import { apiGet, apiPost } from '../utils/api';
import { useToast } from '../hooks/use-toast';
import VoiceInputButton from './VoiceInputButton';

// Fonction utilitaire pour obtenir la date locale au format YYYY-MM-DD (sans décalage timezone)
const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const InspectionTerrain = ({ tenantSlug, grille, batiment, onComplete, onCancel }) => {
  const { toast } = useToast();
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [reponses, setReponses] = useState({});
  const [photos, setPhotos] = useState({}); // {questionId: [photos]}
  const [showPhotoPreview, setShowPhotoPreview] = useState(null);
  const fileInputRefs = useRef({});

  // Normaliser le sous-type du bâtiment pour correspondre aux conditions
  const normalizeSubType = (subType) => {
    if (!subType) return '';
    return subType.toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/\(/g, '')
      .replace(/\)/g, '')
      .replace(/-/g, '_')
      .replace(/é/g, 'e')
      .replace(/è/g, 'e')
      .replace(/ê/g, 'e')
      .replace(/à/g, 'a')
      .replace(/ô/g, 'o');
  };

  const batimentSubType = normalizeSubType(batiment.sous_type_batiment || batiment.sous_type || '');

  // Fonction pour évaluer une condition
  const evalCondition = (condition) => {
    if (!condition) return true; // Pas de condition = toujours visible
    if (!batimentSubType) return true; // Pas de sous-type = afficher tout
    
    // Remplacer les opérateurs logiques
    const evaluableCondition = condition
      .replace(/\|\|/g, ' || ')
      .replace(/&&/g, ' && ');
    
    // Créer un contexte d'évaluation avec le sous-type actuel
    try {
      const context = {};
      
      // Définir toutes les variables de sous-types possibles
      const allSubTypes = [
        'unifamiliale', 'bifamiliale', 'multi_3_8', 'multi_9', 'copropriete', 'maison_mobile',
        'bureau', 'magasin', 'restaurant', 'hotel', 'centre_commercial',
        'manufacture_legere', 'manufacture_lourde', 'entrepot', 'usine', 'atelier',
        'ecole', 'hopital', 'chsld', 'centre_communautaire', 'eglise', 'bibliotheque',
        'ferme', 'grange', 'serre', 'ecurie', 'silo'
      ];
      
      allSubTypes.forEach(type => {
        context[type] = (type === batimentSubType);
      });
      
      // Évaluer l'expression
      const func = new Function(...Object.keys(context), `return ${evaluableCondition}`);
      return func(...Object.values(context));
    } catch (e) {
      console.error('Erreur évaluation condition:', e);
      return true; // En cas d'erreur, afficher la question
    }
  };

  // Filtrer les questions selon les conditions
  const getFilteredQuestions = (section) => {
    return section.questions.filter(q => evalCondition(q.condition));
  };

  const currentSection = grille.sections[currentSectionIndex];
  const filteredQuestions = getFilteredQuestions(currentSection);
  const progressPercent = ((currentSectionIndex + 1) / grille.sections.length) * 100;

  const handleReponse = (questionIndex, value) => {
    const questionId = `${currentSectionIndex}_${questionIndex}`;
    setReponses({
      ...reponses,
      [questionId]: value
    });
  };

  const handlePhotoCapture = (questionIndex) => {
    const questionId = `${currentSectionIndex}_${questionIndex}`;
    const input = fileInputRefs.current[questionId];
    if (input) {
      input.click();
    }
  };

  const handlePhotoChange = async (questionIndex, files) => {
    const questionId = `${currentSectionIndex}_${questionIndex}`;
    
    // Convertir les fichiers en base64 et uploader
    const uploadPromises = Array.from(files).map(file => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = reader.result.split(',')[1]; // Enlever le préfixe data:image/...
            
            // Upload vers le serveur
            const response = await apiPost(tenantSlug, '/prevention/upload-photo', {
              photo_base64: base64,
              filename: file.name
            });
            
            resolve({
              file,
              preview: URL.createObjectURL(file),
              name: file.name,
              photo_id: response.photo_id,
              url: response.url
            });
          } catch (error) {
            console.error('Erreur upload:', error);
            reject(error);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });

    try {
      const uploadedPhotos = await Promise.all(uploadPromises);
      
      setPhotos({
        ...photos,
        [questionId]: [...(photos[questionId] || []), ...uploadedPhotos]
      });

      toast({
        title: "Photo(s) ajoutée(s)",
        description: `${uploadedPhotos.length} photo(s) uploadée(s) avec succès`
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'uploader certaines photos",
        variant: "destructive"
      });
    }
  };

  const removePhoto = (questionId, photoIndex) => {
    const updatedPhotos = photos[questionId].filter((_, idx) => idx !== photoIndex);
    setPhotos({
      ...photos,
      [questionId]: updatedPhotos
    });
  };

  const handleNext = () => {
    if (currentSectionIndex < grille.sections.length - 1) {
      setCurrentSectionIndex(currentSectionIndex + 1);
      window.scrollTo(0, 0);
    }
  };

  const handlePrevious = () => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex(currentSectionIndex - 1);
      window.scrollTo(0, 0);
    }
  };

  const handleSubmit = async () => {
    try {
      // Calculer le score de conformité
      const totalQuestions = grille.sections.reduce((acc, s) => acc + getFilteredQuestions(s).length, 0);
      const reponsesConformes = Object.values(reponses).filter(r => r === 'Conforme').length;
      const scoreConformite = totalQuestions > 0 ? Math.round((reponsesConformes / totalQuestions) * 100) : 0;
      
      // Déterminer le statut global
      const statutGlobal = scoreConformite >= 80 ? 'conforme' : 
                          scoreConformite >= 50 ? 'partiellement_conforme' : 
                          'non_conforme';

      // Préparer les photos par question (juste les IDs)
      const photosParQuestion = {};
      Object.keys(photos).forEach(questionId => {
        photosParQuestion[questionId] = photos[questionId].map(p => ({
          photo_id: p.photo_id,
          url: p.url,
          name: p.name
        }));
      });

      // Récupérer l'inspecteur_id depuis localStorage
      const inspectionTerrainData = JSON.parse(localStorage.getItem('inspection_terrain_data') || '{}');
      const inspecteur_id = inspectionTerrainData.inspecteur_id;

      // Préparer les données d'inspection
      const inspectionData = {
        batiment_id: batiment.id,
        grille_inspection_id: grille.id,
        grille_nom: grille.nom,
        date_inspection: new Date().toISOString().split('T')[0],
        heure_debut: new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }),
        heure_fin: new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }),
        inspecteur_id: inspecteur_id,
        resultats: reponses,
        photos: photosParQuestion,
        score_conformite: scoreConformite,
        statut_global: statutGlobal,
        statut: 'terminee',
        notes_inspection: '',
        recommandations: ''
      };

      // Créer l'inspection
      const newInspection = await apiPost(tenantSlug, '/prevention/inspections', inspectionData);

      // Créer automatiquement les non-conformités pour les questions non-conformes
      const nonConformites = [];
      for (const [questionId, reponse] of Object.entries(reponses)) {
        if (reponse === 'Non-conforme') {
          // Parser le questionId pour obtenir la section et la question
          const [sectionIdx, questionIdx] = questionId.split('_').map(Number);
          const section = grille.sections[sectionIdx];
          const filteredQuestions = getFilteredQuestions(section);
          const question = filteredQuestions[questionIdx];
          
          if (question) {
            // Récupérer les photos associées à cette question
            const questionPhotos = photosParQuestion[questionId] || [];
            
            const nonConformiteData = {
              batiment_id: batiment.id,
              inspection_id: newInspection.id,
              titre: question.question,
              description: `Non-conformité détectée lors de l'inspection du ${new Date().toLocaleDateString('fr-FR')}`,
              categorie: section.titre,
              priorite: 'moyenne',
              statut: 'ouverte',
              photos: questionPhotos,
              date_identification: new Date().toISOString().split('T')[0],
              identifie_par: inspecteur_id
            };
            
            nonConformites.push(nonConformiteData);
          }
        }
      }

      // Créer toutes les non-conformités
      for (const nc of nonConformites) {
        try {
          await apiPost(tenantSlug, '/prevention/non-conformites', nc);
        } catch (error) {
          console.error('Erreur création non-conformité:', error);
        }
      }

      toast({
        title: "✅ Inspection terminée",
        description: `Score: ${scoreConformite}% - ${nonConformites.length} non-conformité(s) créée(s)`
      });

      onComplete();
    } catch (error) {
      console.error('Erreur soumission:', error);
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer l'inspection",
        variant: "destructive"
      });
    }
  };

  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '1rem',
      minHeight: '100vh',
      backgroundColor: '#f9fafb'
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: 'white',
        padding: '1rem',
        borderRadius: '8px',
        marginBottom: '1rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>
            {batiment.nom}
          </h2>
          <Button variant="outline" size="sm" onClick={onCancel}>
            ✕
          </Button>
        </div>
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          📋 {grille.nom}
        </p>

        {/* Barre de progression */}
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
            <span>Section {currentSectionIndex + 1} / {grille.sections.length}</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <div style={{
            height: '8px',
            backgroundColor: '#e5e7eb',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              backgroundColor: '#3b82f6',
              width: `${progressPercent}%`,
              transition: 'width 0.3s'
            }} />
          </div>
        </div>
      </div>

      {/* Section actuelle */}
      <div style={{
        backgroundColor: 'white',
        padding: '1.5rem',
        borderRadius: '8px',
        marginBottom: '1rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
          {currentSection.titre}
        </h3>
        {currentSection.description && (
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem', fontStyle: 'italic' }}>
            {currentSection.description}
          </p>
        )}

        {/* Questions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {filteredQuestions.map((question, qIdx) => {
            const questionId = `${currentSectionIndex}_${qIdx}`;
            const reponse = reponses[questionId];
            const questionPhotos = photos[questionId] || [];
            const isNonConforme = reponse === 'Non-conforme';

            return (
              <div key={qIdx} style={{
                padding: '1rem',
                backgroundColor: isNonConforme ? '#fef2f2' : '#f9fafb',
                borderRadius: '6px',
                border: isNonConforme ? '1px solid #fca5a5' : '1px solid #e5e7eb'
              }}>
                <div style={{ marginBottom: '0.75rem' }}>
                  <strong style={{ fontSize: '0.875rem' }}>
                    {qIdx + 1}. {question.question}
                  </strong>
                </div>

                {/* Photos de référence */}
                {question.photos_reference && question.photos_reference.length > 0 && (
                  <div style={{
                    marginBottom: '0.75rem',
                    padding: '0.5rem',
                    backgroundColor: 'white',
                    borderRadius: '4px'
                  }}>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                      📷 Photos de référence:
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {question.photos_reference.map((photo, pIdx) => (
                        <div key={pIdx} style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#f3f4f6',
                          borderRadius: '4px',
                          fontSize: '0.75rem'
                        }}>
                          📎 {photo}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Réponse */}
                {question.type === 'choix' && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(question.options || ['Conforme', 'Non-conforme', 'S.O.']).map(option => (
                      <button
                        key={option}
                        onClick={() => handleReponse(qIdx, option)}
                        style={{
                          padding: '0.5rem 1rem',
                          border: reponse === option ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                          backgroundColor: reponse === option ? '#eff6ff' : 'white',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: reponse === option ? '600' : '400',
                          color: reponse === option ? '#3b82f6' : '#374151'
                        }}
                      >
                        {option === 'Conforme' && '✅ '}
                        {option === 'Non-conforme' && '❌ '}
                        {option === 'S.O.' && '⊘ '}
                        {option}
                      </button>
                    ))}
                  </div>
                )}

                {question.type === 'texte' && (
                  <div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <VoiceInputButton
                        onTranscript={(text) => {
                          const currentText = reponse || '';
                          const newText = currentText ? `${currentText} ${text}` : text;
                          handleReponse(qIdx, newText);
                        }}
                        placeholder="Parlez pour ajouter du texte"
                      />
                      <span style={{ fontSize: '0.75rem', color: '#6b7280', alignSelf: 'center' }}>
                        ou tapez ci-dessous
                      </span>
                    </div>
                    <textarea
                      value={reponse || ''}
                      onChange={(e) => handleReponse(qIdx, e.target.value)}
                      placeholder="Saisir vos observations..."
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px',
                        minHeight: '80px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                )}

                {/* Prise de photos si non-conforme ou type photos */}
                {(isNonConforme || question.type === 'photos') && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <input
                      ref={el => fileInputRefs.current[questionId] = el}
                      type="file"
                      accept="image/*"
                      
                      multiple
                      style={{ 
                        position: 'absolute',
                        width: '1px',
                        height: '1px',
                        padding: '0',
                        margin: '-1px',
                        overflow: 'hidden',
                        clip: 'rect(0, 0, 0, 0)',
                        whiteSpace: 'nowrap',
                        border: '0'
                      }}
                      onChange={(e) => handlePhotoChange(qIdx, e.target.files)}
                    />
                    
                    <Button
                      size="sm"
                      onClick={() => handlePhotoCapture(qIdx)}
                      variant="outline"
                      style={{
                        backgroundColor: question.photo_requise_si_non_conforme && isNonConforme ? '#fef2f2' : 'white'
                      }}
                    >
                      📸 {question.photo_requise_si_non_conforme && isNonConforme ? 'Photo REQUISE' : 'Prendre une photo'}
                    </Button>

                    {/* Aperçu des photos */}
                    {questionPhotos.length > 0 && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {questionPhotos.map((photo, pIdx) => (
                          <div key={pIdx} style={{ position: 'relative' }}>
                            <img
                              src={photo.preview}
                              alt={photo.name}
                              style={{
                                width: '80px',
                                height: '80px',
                                objectFit: 'cover',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                              onClick={() => setShowPhotoPreview(photo.preview)}
                            />
                            <button
                              onClick={() => removePhoto(questionId, pIdx)}
                              style={{
                                position: 'absolute',
                                top: '-8px',
                                right: '-8px',
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                backgroundColor: '#ef4444',
                                color: 'white',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '1rem',
        backgroundColor: 'white',
        padding: '1rem',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={currentSectionIndex === 0}
        >
          ← Précédent
        </Button>

        {currentSectionIndex === grille.sections.length - 1 ? (
          <Button onClick={handleSubmit}>
            ✅ Terminer l'inspection
          </Button>
        ) : (
          <Button onClick={handleNext}>
            Suivant →
          </Button>
        )}
      </div>

      {/* Modal aperçu photo */}
      {showPhotoPreview && (
        <div
          onClick={() => setShowPhotoPreview(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            padding: '2rem'
          }}
        >
          <img
            src={showPhotoPreview}
            alt="Aperçu"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain'
            }}
          />
        </div>
      )}
    </div>
  );
};

export default InspectionTerrain;
