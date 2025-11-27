import React, { useState, useRef } from 'react';
import { Button } from './ui/button';
import { apiGet, apiPost } from '../utils/api';
import { useToast } from '../hooks/use-toast';

const InspectionTerrain = ({ tenantSlug, grille, batiment, onComplete, onCancel }) => {
  const { toast } = useToast();
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [reponses, setReponses] = useState({});
  const [photos, setPhotos] = useState({}); // {questionId: [photos]}
  const [showPhotoPreview, setShowPhotoPreview] = useState(null);
  const fileInputRefs = useRef({});

  const currentSection = grille.sections[currentSectionIndex];
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

  const handlePhotoChange = (questionIndex, files) => {
    const questionId = `${currentSectionIndex}_${questionIndex}`;
    const newPhotos = Array.from(files).map(file => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name
    }));

    setPhotos({
      ...photos,
      [questionId]: [...(photos[questionId] || []), ...newPhotos]
    });

    toast({
      title: "Photo ajoutée",
      description: `${newPhotos.length} photo(s) ajoutée(s)`
    });
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
      // Préparer les données d'inspection
      const inspectionData = {
        batiment_id: batiment.id,
        grille_id: grille.id,
        grille_nom: grille.nom,
        date_inspection: new Date().toISOString(),
        reponses: reponses,
        photos: photos,
        statut: 'terminee'
      };

      // TODO: Upload photos et créer l'inspection
      await apiPost(tenantSlug, '/prevention/inspections', inspectionData);

      toast({
        title: "Inspection terminée",
        description: "Les données ont été enregistrées avec succès"
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
          {currentSection.questions.map((question, qIdx) => {
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
                )}

                {/* Prise de photos si non-conforme ou type photos */}
                {(isNonConforme || question.type === 'photos') && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <input
                      ref={el => fileInputRefs.current[questionId] = el}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      style={{ display: 'none' }}
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
            zIndex: 2000,
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
