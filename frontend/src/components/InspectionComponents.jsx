import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from './ui/ConfirmDialog';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import usePermissions from '../hooks/usePermissions';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { Calendar } from './ui/calendar';
import { fr } from 'date-fns/locale';
import CameraCapture from './CameraCapture';
import {
  NombreUniteField,
  CurseurField,
  ChronometreField,
  CompteReboursField,
  QRCodeField,
  CalculAutoField,
  InspecteurAutoField,
  LieuAutoField,
  MeteoAutoField
} from './InspectionFieldTypes';

// Fonction utilitaire pour obtenir la date locale au format YYYY-MM-DD (sans décalage timezone)
const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const PhotoUploader = ({ photos, setPhotos, maxPhotos = 10 }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const handleCameraCapture = async (imageData) => {
    if (photos.length >= maxPhotos) {
      toast({
        title: "Limite atteinte",
        description: `Maximum ${maxPhotos} photos`,
        variant: "destructive"
      });
      return;
    }
    
    setUploading(true);
    try {
      const response = await apiPost(tenantSlug, '/prevention/upload-photo', {
        photo_base64: imageData,
        filename: `camera_${Date.now()}.jpg`
      });
      
      if (response.url) {
        setPhotos(prev => [...prev, response.url]);
        toast({
          title: "Photo ajoutée",
          description: "La photo a été capturée avec succès"
        });
      }
    } catch (error) {
      // Si l'upload échoue, utiliser le base64 directement
      setPhotos(prev => [...prev, imageData]);
    } finally {
      setUploading(false);
      setShowCamera(false);
    }
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    
    if (photos.length + files.length > maxPhotos) {
      toast({
        title: "Limite atteinte",
        description: `Maximum ${maxPhotos} photos`,
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    try {
      for (const file of files) {
        // Convertir en base64
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result;
          
          try {
            const response = await apiPost(tenantSlug, '/prevention/upload-photo', {
              photo_base64: base64,
              filename: file.name
            });
            
            setPhotos(prev => [...prev, response.url]);
            
            toast({
              title: "Photo ajoutée",
              description: file.name
            });
          } catch (error) {
            console.error('Erreur upload:', error);
            toast({
              title: "Erreur",
              description: `Impossible d'uploader ${file.name}`,
              variant: "destructive"
            });
          }
        };
        reader.readAsDataURL(file);
      }
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="photo-uploader">
      <div className="upload-header">
        <label>📸 Photos ({photos.length}/{maxPhotos})</label>
        <input
          type="file"
          accept="image/*"
          
          multiple
          onChange={handleFileChange}
          disabled={uploading || photos.length >= maxPhotos}
          className="file-input"
          id="photo-upload"
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
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => document.getElementById('photo-upload').click()}
          disabled={uploading || photos.length >= maxPhotos}
        >
          {uploading ? '⏳ Téléversement...' : '📷 Galerie'}
        </Button>
        <Button
          size="sm"
          onClick={() => setShowCamera(true)}
          disabled={uploading || photos.length >= maxPhotos}
          style={{ marginLeft: '0.5rem', backgroundColor: '#3b82f6', color: 'white' }}
        >
          📸 Caméra
        </Button>
      </div>

      {/* Modal Caméra */}
      {showCamera && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}

      {photos.length > 0 && (
        <div className="photos-grid">
          {photos.map((photoUrl, index) => (
            <div key={index} className="photo-item">
              <img 
                src={photoUrl.includes('data:') ? photoUrl : `${process.env.REACT_APP_BACKEND_URL}${photoUrl}`} 
                alt={`Photo ${index + 1}`}
                className="photo-thumbnail"
              />
              <button
                onClick={() => removePhoto(index)}
                className="remove-photo-btn"
                title="Supprimer"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ListeInspections = ({ setCurrentView }) => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();
  const [inspections, setInspections] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [users, setUsers] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, conforme, non_conforme
  
  // Utiliser le hook de permissions RBAC
  const { hasTabAction } = usePermissions(tenantSlug, user);
  const canDeleteInspection = hasTabAction('prevention', 'inspections', 'supprimer');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [inspectionsData, batimentsData, usersData] = await Promise.all([
        apiGet(tenantSlug, '/prevention/inspections'),
        apiGet(tenantSlug, '/prevention/batiments'),
        apiGet(tenantSlug, '/users')
      ]);
      
      setInspections(inspectionsData);
      setBatiments(batimentsData);
      setUsers(usersData);
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les inspections",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenantSlug]);

  const getBatimentName = (batimentId) => {
    const batiment = batiments.find(b => b.id === batimentId);
    return batiment?.nom_etablissement || 'Inconnu';
  };

  const getPreventionnisteName = (userId) => {
    const preventionniste = users.find(u => u.id === userId);
    return preventionniste ? `${preventionniste.prenom} ${preventionniste.nom}` : 'Inconnu';
  };

  const handleDeleteInspection = async (inspectionId) => {
    const confirmed = await confirm({
      title: 'Supprimer l\'inspection',
      message: 'Êtes-vous sûr de vouloir supprimer cette inspection ?',
      variant: 'danger',
      confirmText: 'Supprimer'
    });
    if (!confirmed) return;

    try {
      await apiDelete(tenantSlug, `/prevention/inspections/${inspectionId}`);
      toast({
        title: "Succès",
        description: "Inspection supprimée avec succès",
        variant: "default"
      });
      // Recharger la liste
      fetchData();
    } catch (error) {
      console.error('Erreur suppression inspection:', error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer l'inspection",
        variant: "destructive"
      });
    }
  };

  const filteredInspections = inspections.filter(insp => {
    if (filter === 'all') return true;
    if (filter === 'conforme') return insp.statut_global === 'conforme';
    if (filter === 'non_conforme') return insp.statut_global !== 'conforme';
    return true;
  });

  const handleDownloadPDF = async (inspectionId) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/prevention/inspections/${inspectionId}/rapport-pdf`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem(`${tenantSlug}_token`)}`
        }
      });
      
      if (!response.ok) throw new Error('Erreur téléchargement');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Utiliser iframe pour ouvrir la fenêtre d'impression
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        iframe.contentWindow.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          window.URL.revokeObjectURL(url);
        }, 1000);
      };
      
      toast({
        title: "Succès",
        description: "Fenêtre d'impression ouverte"
      });
    } catch (error) {
      console.error('Erreur téléchargement PDF:', error);
      toast({
        title: "Erreur",
        description: "Impossible de télécharger le rapport",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return <div className="loading-spinner">Chargement des inspections...</div>;
  }

  return (
    <div className="inspections-container">
      <div className="page-header">
        <h2>📋 Liste des Inspections</h2>
        <Button onClick={() => setCurrentView('nouvelle-inspection')}>
          ➕ Nouvelle Inspection
        </Button>
      </div>

      <div className="inspections-filters">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          onClick={() => setFilter('all')}
        >
          Toutes ({inspections.length})
        </Button>
        <Button
          variant={filter === 'conforme' ? 'default' : 'outline'}
          onClick={() => setFilter('conforme')}
        >
          ✅ Conformes ({inspections.filter(i => i.statut_global === 'conforme').length})
        </Button>
        <Button
          variant={filter === 'non_conforme' ? 'default' : 'outline'}
          onClick={() => setFilter('non_conforme')}
        >
          ⚠️ Non-conformes ({inspections.filter(i => i.statut_global !== 'conforme').length})
        </Button>
      </div>

      {filteredInspections.length === 0 ? (
        <div className="empty-state">
          <p>Aucune inspection trouvée</p>
          <Button onClick={() => setCurrentView('nouvelle-inspection')}>
            Créer la première inspection
          </Button>
        </div>
      ) : (
        <div className="inspections-list">
          {filteredInspections.map(inspection => (
            <div key={inspection.id} className="inspection-card">
              <div className="inspection-header">
                <div>
                  <h4>{getBatimentName(inspection.batiment_id)}</h4>
                  <p className="inspection-date">{inspection.date_inspection}</p>
                </div>
                <span className={`statut-badge ${inspection.statut_global}`}>
                  {inspection.statut_global === 'conforme' ? '✅ Conforme' : '⚠️ Non-conforme'}
                </span>
              </div>
              
              <div className="inspection-details">
                <div className="detail-item">
                  <span className="label">Préventionniste:</span>
                  <span>{getPreventionnisteName(inspection.preventionniste_id)}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Type:</span>
                  <span>{inspection.type_inspection}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Score:</span>
                  <span className="score">{inspection.score_conformite}%</span>
                </div>
              </div>
              
              <div className="inspection-actions">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleDownloadPDF(inspection.id)}
                >
                  📄 Rapport PDF
                </Button>
                <Button 
                  size="sm"
                  onClick={() => {
                    localStorage.setItem('detail_inspection_id', inspection.id);
                    setCurrentView('detail-inspection');
                  }}
                >
                  👁️ Voir détails
                </Button>
                {canDeleteInspection && (
                  <Button 
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteInspection(inspection.id)}
                  >
                    🗑️ Supprimer
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const NouvelleInspection = ({ setCurrentView, batiments, selectedBatiment, onBatimentSelected }) => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [grilles, setGrilles] = useState([]);
  const [formData, setFormData] = useState({
    batiment_id: selectedBatiment?.id || '',
    grille_inspection_id: '',
    date_inspection: getLocalDateString(),
    type_inspection: 'reguliere'
  });

  // Mettre à jour le bâtiment si selectedBatiment change
  useEffect(() => {
    if (selectedBatiment?.id) {
      setFormData(prev => ({ ...prev, batiment_id: selectedBatiment.id }));
    }
  }, [selectedBatiment]);

  useEffect(() => {
    const fetchGrilles = async () => {
      try {
        const data = await apiGet(tenantSlug, '/prevention/grilles-inspection');
        setGrilles(data);
      } catch (error) {
        console.error('Erreur chargement grilles:', error);
      }
    };
    fetchGrilles();
  }, [tenantSlug]);

  const handleSubmit = async () => {
    if (!formData.batiment_id || !formData.grille_inspection_id) {
      toast({
        title: "Validation",
        description: "Veuillez sélectionner un bâtiment et une grille",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      const inspection = await apiPost(tenantSlug, '/prevention/inspections', {
        ...formData,
        preventionniste_id: user.id,
        heure_debut: new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }),
        resultats: {},
        statut_global: 'en_cours',
        score_conformite: 0
      });

      toast({
        title: "Succès",
        description: "Inspection créée"
      });

      // Rediriger vers la réalisation de l'inspection
      localStorage.setItem('current_inspection_id', inspection.id);
      setCurrentView('realiser-inspection');
    } catch (error) {
      console.error('Erreur création inspection:', error);
      toast({
        title: "Erreur",
        description: "Impossible de créer l'inspection",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="nouvelle-inspection-container">
      <div className="page-header">
        <h2>🔍 Nouvelle Inspection</h2>
        <Button variant="outline" onClick={() => setCurrentView('inspections')}>
          ← Retour
        </Button>
      </div>

      <div className="inspection-form">
        <div className="form-section">
          <label>Bâtiment à inspecter *</label>
          <select
            value={formData.batiment_id}
            onChange={(e) => setFormData({ ...formData, batiment_id: e.target.value })}
            className="form-select"
          >
            <option value="">-- Sélectionner un bâtiment --</option>
            {batiments.map(b => (
              <option key={b.id} value={b.id}>
                {b.nom_etablissement} - {b.adresse_civique}
              </option>
            ))}
          </select>
        </div>

        <div className="form-section">
          <label>Grille d'inspection *</label>
          {grilles.length === 0 ? (
            <div style={{
              padding: '1rem',
              backgroundColor: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: '8px',
              color: '#92400e',
              fontSize: '0.9rem'
            }}>
              ⚠️ Aucun formulaire d'inspection disponible. Contactez un administrateur.
            </div>
          ) : (
            <select
              value={formData.grille_inspection_id}
              onChange={(e) => setFormData({ ...formData, grille_inspection_id: e.target.value })}
              className="form-select"
            >
              <option value="">-- Sélectionner une grille --</option>
              {grilles.map(g => (
                <option key={g.id} value={g.id}>
                  {g.nom} {g.groupe_occupation ? `(Groupe ${g.groupe_occupation})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="form-section">
          <label>Date d'inspection *</label>
          <input
            type="date"
            value={formData.date_inspection}
            onChange={(e) => setFormData({ ...formData, date_inspection: e.target.value })}
            className="form-input"
          />
        </div>

        <div className="form-section">
          <label>Type d'inspection</label>
          <select
            value={formData.type_inspection}
            onChange={(e) => setFormData({ ...formData, type_inspection: e.target.value })}
            className="form-select"
          >
            <option value="reguliere">Régulière</option>
            <option value="suivi">Suivi</option>
            <option value="urgence">Urgence</option>
            <option value="plainte">Suite à plainte</option>
          </select>
        </div>

        <div className="form-actions">
          <Button variant="outline" onClick={() => setCurrentView('inspections')}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Création...' : 'Démarrer l\'inspection'}
          </Button>
        </div>
      </div>
    </div>
  );
};

const RealiserInspection = ({ setCurrentView }) => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [inspection, setInspection] = useState(null);
  const [grille, setGrille] = useState(null);
  const [batiment, setBatiment] = useState(null);
  const [resultats, setResultats] = useState({});
  const [nonConformites, setNonConformites] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [notes, setNotes] = useState('');
  const [recommandations, setRecommandations] = useState('');

  // Fonction de mapping intelligent entre labels de questions et données du bâtiment
  const smartAutoFill = (label, batimentData, lastInspectionData) => {
    if (!label) return null;
    
    const labelLower = label.toLowerCase().trim();
    
    // Pattern matching pour chaque type de champ
    const patterns = {
      // Propriétaire
      proprietaire: ['propriétaire', 'proprietaire', 'nom du propriétaire', 'nom proprietaire', 'owner'],
      // Téléphone
      telephone: ['téléphone', 'telephone', 'tél', 'tel', 'phone', 'numéro de téléphone', 'numero telephone'],
      // Email
      email: ['courriel', 'email', 'e-mail', 'adresse courriel', 'adresse email', 'mail'],
      // Type de bâtiment
      type: ['type de bâtiment', 'type de batiment', 'type batiment', 'type', 'catégorie', 'categorie'],
      // Nombre d'étages
      etages: ['nombre d\'étages', 'nombre d\'etages', 'étages', 'etages', 'nombre étages', 'nombre etages', 'nbre étages'],
      // Nombre de logements
      logements: ['nombre de logements', 'nombre logements', 'logements', 'nbre logements', 'unités', 'unites'],
      // Superficie
      superficie: ['superficie', 'surface', 'superficie totale', 'aire'],
      // Année construction
      annee: ['année de construction', 'annee construction', 'année construction', 'annee', 'année'],
      // Adresse
      adresse: ['adresse', 'lieu', 'emplacement', 'localisation'],
      // Ville
      ville: ['ville', 'municipalité', 'municipalite'],
      // Code postal
      codePostal: ['code postal', 'code_postal', 'postal'],
      // Matricule
      matricule: ['matricule', 'numéro matricule', 'numero matricule'],
      // Risque
      risque: ['risque', 'niveau de risque', 'cote de risque'],
      // Secteur
      secteur: ['secteur', 'secteur géographique', 'zone']
    };
    
    // Vérifier chaque pattern
    for (const [key, keywords] of Object.entries(patterns)) {
      if (keywords.some(keyword => labelLower.includes(keyword))) {
        // Priorité 1: Données du bâtiment (source officielle)
        switch (key) {
          case 'proprietaire':
            return batimentData.proprietaire_nom || batimentData.proprietaire || null;
          case 'telephone':
            return batimentData.telephone || batimentData.telephone_contact || null;
          case 'email':
            return batimentData.email_contact || batimentData.email || null;
          case 'type':
            return batimentData.type || batimentData.categorie || null;
          case 'etages':
            return batimentData.nombre_etages || batimentData.etages || null;
          case 'logements':
            return batimentData.nombre_logements || batimentData.logements || null;
          case 'superficie':
            return batimentData.superficie || batimentData.superficie_totale || null;
          case 'annee':
            return batimentData.annee_construction || batimentData.annee || null;
          case 'adresse':
            return `${batimentData.adresse_civique || ''}, ${batimentData.ville || ''}`.trim() || null;
          case 'ville':
            return batimentData.ville || null;
          case 'codePostal':
            return batimentData.code_postal || null;
          case 'matricule':
            return batimentData.matricule || null;
          case 'risque':
            return batimentData.risque || batimentData.niveau_risque || null;
          case 'secteur':
            return batimentData.secteur || batimentData.secteur_geographique || null;
        }
      }
    }
    
    // Priorité 2: Si aucun mapping bâtiment, essayer dernière inspection
    if (lastInspectionData) {
      return lastInspectionData;
    }
    
    return null;
  };

  useEffect(() => {
    const loadInspection = async () => {
      try {
        const inspectionId = localStorage.getItem('current_inspection_id');
        if (!inspectionId) {
          setCurrentView('inspections');
          return;
        }

        const inspData = await apiGet(tenantSlug, `/prevention/inspections/${inspectionId}`);
        setInspection(inspData);
        setResultats(inspData.resultats || {});

        const [grilleData, batimentData] = await Promise.all([
          apiGet(tenantSlug, `/prevention/grilles-inspection/${inspData.grille_inspection_id}`),
          apiGet(tenantSlug, `/prevention/batiments/${inspData.batiment_id}`)
        ]);

        setGrille(grilleData);
        setBatiment(batimentData);

        // === SYSTÈME D'AUTO-REMPLISSAGE INTELLIGENT ===
        if (grilleData && batimentData) {
          // 1. Charger la dernière inspection du même bâtiment avec la même grille
          let derniereInspection = null;
          try {
            const inspections = await apiGet(tenantSlug, `/prevention/inspections?batiment_id=${inspData.batiment_id}`);
            // Filtrer pour trouver la dernière inspection avec la même grille (exclure l'inspection actuelle)
            const inspectionsMemeGrille = inspections
              .filter(insp => 
                insp.grille_inspection_id === inspData.grille_inspection_id && 
                insp.id !== inspectionId &&
                insp.statut === 'terminee'
              )
              .sort((a, b) => new Date(b.date_inspection) - new Date(a.date_inspection));
            
            if (inspectionsMemeGrille.length > 0) {
              derniereInspection = inspectionsMemeGrille[0];
            }
          } catch (error) {
            console.log('Aucune inspection précédente trouvée');
          }

          // 2. Auto-remplir intelligemment tous les champs
          const newResultats = { ...(inspData.resultats || {}) };
          let autoFilledCount = 0;

          grilleData.sections?.forEach((section, sectionIdx) => {
            const items = section.items || section.questions || [];
            items.forEach((item, itemIdx) => {
              const fieldKey = `section_${sectionIdx}_item_${itemIdx}`;
              
              // Auto-remplir uniquement si le champ est vide
              if (!newResultats[fieldKey]) {
                let valueToFill = null;

                // Type "lieu_auto" spécial
                if (typeof item === 'object' && item.type === 'lieu_auto') {
                  valueToFill = `${batimentData.adresse_civique || ''}, ${batimentData.ville || ''}`.trim();
                } 
                // Type "inspecteur_auto" spécial (déjà géré par le composant)
                else if (typeof item === 'object' && item.type === 'inspecteur_auto') {
                  // Laisser le composant gérer
                  return;
                }
                // Type "meteo_auto" spécial (déjà géré par le composant)
                else if (typeof item === 'object' && item.type === 'meteo_auto') {
                  // Laisser le composant gérer
                  return;
                }
                // Autres types: mapping intelligent
                else {
                  const itemLabel = typeof item === 'string' ? item : item.label;
                  const lastInspValue = derniereInspection?.resultats?.[fieldKey];
                  valueToFill = smartAutoFill(itemLabel, batimentData, lastInspValue);
                }

                if (valueToFill) {
                  newResultats[fieldKey] = valueToFill;
                  autoFilledCount++;
                }
              }
            });
          });

          if (autoFilledCount > 0) {
            setResultats(newResultats);
            // Toast informatif
            toast({
              title: "✨ Champs pré-remplis",
              description: `${autoFilledCount} champ(s) complété(s) automatiquement depuis la fiche bâtiment${derniereInspection ? ' et la dernière inspection' : ''}`,
              duration: 3000
            });
          }
        }
      } catch (error) {
        console.error('Erreur chargement inspection:', error);
        toast({
          title: "Erreur",
          description: "Impossible de charger l'inspection",
          variant: "destructive"
        });
        // Rediriger vers la liste des inspections en cas d'erreur
        setCurrentView('inspections');
      } finally {
        setLoading(false);
      }
    };

    loadInspection();
  }, [tenantSlug]);

  const handleReponse = (sectionIndex, questionIndex, valeur) => {
    setResultats(prev => ({
      ...prev,
      [`section_${sectionIndex}_question_${questionIndex}`]: valeur
    }));
  };

  // Fonction de rendu dynamique des champs selon le type
  const renderFieldInput = (item, sectionIdx, itemIdx) => {
    const fieldKey = `section_${sectionIdx}_item_${itemIdx}`;
    const value = resultats[fieldKey];
    const handleChange = (val) => handleReponse(sectionIdx, itemIdx, val);

    // Si l'item est un ancien format (string), utiliser le mode conforme/non-conforme par défaut
    if (typeof item === 'string') {
      return (
        <div className="question-reponses">
          <label className="radio-label">
            <input
              type="radio"
              name={fieldKey}
              value="conforme"
              checked={value === 'conforme'}
              onChange={(e) => handleChange(e.target.value)}
            />
            <span>✅ Conforme</span>
          </label>
          <label className="radio-label">
            <input
              type="radio"
              name={fieldKey}
              value="non_conforme"
              checked={value === 'non_conforme'}
              onChange={(e) => handleChange(e.target.value)}
            />
            <span>⚠️ Non-conforme</span>
          </label>
          <label className="radio-label">
            <input
              type="radio"
              name={fieldKey}
              value="na"
              checked={value === 'na'}
              onChange={(e) => handleChange(e.target.value)}
            />
            <span>⊘ N/A</span>
          </label>
        </div>
      );
    }

    // Nouveaux types de champs
    switch (item.type) {
      case 'conforme_non_conforme':
        return (
          <div className="question-reponses">
            <label className="radio-label">
              <input type="radio" name={fieldKey} value="conforme" checked={value === 'conforme'} onChange={(e) => handleChange(e.target.value)} />
              <span>✅ Conforme</span>
            </label>
            <label className="radio-label">
              <input type="radio" name={fieldKey} value="non_conforme" checked={value === 'non_conforme'} onChange={(e) => handleChange(e.target.value)} />
              <span>⚠️ Non-conforme</span>
            </label>
            <label className="radio-label">
              <input type="radio" name={fieldKey} value="na" checked={value === 'na'} onChange={(e) => handleChange(e.target.value)} />
              <span>⊘ N/A</span>
            </label>
          </div>
        );

      case 'oui_non':
        return (
          <div className="question-reponses">
            <label className="radio-label">
              <input type="radio" name={fieldKey} value="oui" checked={value === 'oui'} onChange={(e) => handleChange(e.target.value)} />
              <span>✅ Oui</span>
            </label>
            <label className="radio-label">
              <input type="radio" name={fieldKey} value="non" checked={value === 'non'} onChange={(e) => handleChange(e.target.value)} />
              <span>❌ Non</span>
            </label>
          </div>
        );

      case 'etat':
        return (
          <div className="question-reponses">
            <label className="radio-label">
              <input type="radio" name={fieldKey} value="bon" checked={value === 'bon'} onChange={(e) => handleChange(e.target.value)} />
              <span>🟢 Bon</span>
            </label>
            <label className="radio-label">
              <input type="radio" name={fieldKey} value="moyen" checked={value === 'moyen'} onChange={(e) => handleChange(e.target.value)} />
              <span>🟡 Moyen</span>
            </label>
            <label className="radio-label">
              <input type="radio" name={fieldKey} value="mauvais" checked={value === 'mauvais'} onChange={(e) => handleChange(e.target.value)} />
              <span>🔴 Mauvais</span>
            </label>
          </div>
        );

      case 'radio':
        return (
          <div className="question-reponses">
            {(item.options || []).map((option, idx) => (
              <label key={idx} className="radio-label">
                <input type="radio" name={fieldKey} value={option} checked={value === option} onChange={(e) => handleChange(e.target.value)} />
                <span>{option}</span>
              </label>
            ))}
          </div>
        );

      case 'checkbox':
        return (
          <div className="question-reponses">
            {(item.options || []).map((option, idx) => (
              <label key={idx} className="radio-label">
                <input
                  type="checkbox"
                  checked={(value || []).includes(option)}
                  onChange={(e) => {
                    const currentValues = value || [];
                    const newValues = e.target.checked
                      ? [...currentValues, option]
                      : currentValues.filter(v => v !== option);
                    handleChange(newValues);
                  }}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        );

      case 'texte':
        return <Input value={value || ''} onChange={(e) => handleChange(e.target.value)} placeholder="Votre réponse..." />;

      case 'nombre':
        return <Input type="number" value={value || ''} onChange={(e) => handleChange(e.target.value)} placeholder="Nombre" />;

      case 'nombre_unite':
        return <NombreUniteField value={value} onChange={handleChange} config={item.config} />;

      case 'date':
        return <Input type="date" value={value || ''} onChange={(e) => handleChange(e.target.value)} />;

      case 'liste':
        return (
          <select value={value || ''} onChange={(e) => handleChange(e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}>
            <option value="">-- Sélectionner --</option>
            {(item.options || []).map((option, idx) => (
              <option key={idx} value={option}>{option}</option>
            ))}
          </select>
        );

      case 'curseur':
        return <CurseurField value={value} onChange={handleChange} config={item.config} />;

      case 'chronometre':
        return <ChronometreField value={value} onChange={handleChange} />;

      case 'compte_rebours':
        return <CompteReboursField value={value} onChange={handleChange} config={item.config} />;

      case 'qr_code':
        return <QRCodeField value={value} onChange={handleChange} />;

      case 'calcul_auto':
        return <CalculAutoField value={value} onChange={handleChange} config={item.config} allValues={resultats} />;

      case 'inspecteur_auto':
        return <InspecteurAutoField value={value} onChange={handleChange} />;

      case 'lieu_auto':
        return <LieuAutoField value={value} onChange={handleChange} batiment={batiment} />;

      case 'meteo_auto':
        return <MeteoAutoField value={value} onChange={handleChange} location={batiment} />;

      case 'photo':
        return (
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            📷 Utilisez la section "Photos de l'inspection" ci-dessous
          </div>
        );

      case 'signature':
        return (
          <div style={{ padding: '0.5rem', border: '1px dashed #d1d5db', borderRadius: '6px', backgroundColor: '#f9fafb', textAlign: 'center', color: '#6b7280' }}>
            ✍️ Zone de signature (fonctionnalité à venir)
          </div>
        );

      case 'note_audio':
        return (
          <div style={{ padding: '0.5rem', border: '1px dashed #d1d5db', borderRadius: '6px', backgroundColor: '#f9fafb', textAlign: 'center', color: '#6b7280' }}>
            🎤 Enregistrement audio (fonctionnalité à venir)
          </div>
        );

      default:
        return <Input value={value || ''} onChange={(e) => handleChange(e.target.value)} placeholder="Réponse" />;
    }
  };

  const handleSaveInspection = async (statut = 'brouillon') => {
    try {
      // Calculer le score de conformité
      const totalQuestions = grille.sections.reduce((acc, section) => acc + section.questions.length, 0);
      const reponsesConformes = Object.values(resultats).filter(r => r === 'conforme' || r === 'oui').length;
      const score = totalQuestions > 0 ? Math.round((reponsesConformes / totalQuestions) * 100) : 0;

      const statutGlobal = score >= 80 ? 'conforme' : score >= 50 ? 'partiellement_conforme' : 'non_conforme';

      await apiPut(tenantSlug, `/prevention/inspections/${inspection.id}`, {
        ...inspection,
        resultats,
        score_conformite: score,
        statut_global: statutGlobal,
        photos: photos,
        notes_inspection: notes,
        recommandations: recommandations,
        heure_fin: new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
      });

      // Créer les non-conformités si nécessaire
      for (const nc of nonConformites) {
        await apiPost(tenantSlug, '/prevention/non-conformites', {
          ...nc,
          inspection_id: inspection.id,
          batiment_id: inspection.batiment_id
        });
      }

      toast({
        title: "Succès",
        description: statut === 'brouillon' ? "Inspection sauvegardée" : "Inspection terminée"
      });

      localStorage.removeItem('current_inspection_id');
      setCurrentView('inspections');
    } catch (error) {
      console.error('Erreur sauvegarde inspection:', error);
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder l'inspection",
        variant: "destructive"
      });
    }
  };

  const ajouterNonConformite = (sectionIndex, questionIndex, question) => {
    setNonConformites(prev => [...prev, {
      titre: question,
      section_grille: `Section ${sectionIndex + 1}`,
      description: '',
      gravite: 'moyen',
      statut: 'ouverte'
    }]);
  };

  if (loading) {
    return <div className="loading-spinner">Chargement de l'inspection...</div>;
  }

  if (!inspection || !grille || !batiment) {
    return <div>Erreur: Données manquantes</div>;
  }

  return (
    <div className="realiser-inspection-container">
      <div className="page-header">
        <div>
          <h2>🔍 Inspection en cours</h2>
          <p className="inspection-subtitle">{batiment.nom_etablissement} - {batiment.adresse_civique}</p>
        </div>
        <div className="header-actions">
          <Button variant="outline" onClick={() => handleSaveInspection('brouillon')}>
            💾 Sauvegarder brouillon
          </Button>
          <Button onClick={() => handleSaveInspection('termine')}>
            ✅ Terminer l'inspection
          </Button>
        </div>
      </div>

      <div className="grille-inspection-content">
        {grille.sections.map((section, sectionIdx) => {
          // Support du nouveau format (items) et ancien format (questions)
          const items = section.items || section.questions || [];
          
          return (
            <div key={sectionIdx} className="grille-section">
              <h3>{section.titre}</h3>
              {section.description && (
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
                  {section.description}
                </p>
              )}
              
              <div className="questions-list">
                {items.map((item, itemIdx) => {
                  const fieldKey = `section_${sectionIdx}_item_${itemIdx}`;
                  const itemLabel = typeof item === 'string' ? item : item.label;
                  const currentValue = resultats[fieldKey];
                  
                  // Déterminer si on doit déclencher une alerte
                  const shouldTriggerAlert = item.alerte?.actif && 
                    item.alerte?.declencheur && 
                    currentValue === item.alerte.declencheur;

                  return (
                    <div key={itemIdx} className="question-item">
                      <label className="question-text">
                        {itemLabel}
                        {item.obligatoire && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>}
                      </label>
                      {item.description && (
                        <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                          {item.description}
                        </p>
                      )}
                      
                      {renderFieldInput(item, sectionIdx, itemIdx)}

                      {/* Alerte visuelle si déclenchement */}
                      {shouldTriggerAlert && item.alerte?.creer_anomalie && (
                        <div style={{
                          marginTop: '0.5rem',
                          padding: '0.75rem',
                          backgroundColor: '#fef2f2',
                          border: '1px solid #fecaca',
                          borderRadius: '6px'
                        }}>
                          <div style={{ fontWeight: '600', color: '#dc2626', fontSize: '0.875rem' }}>
                            ⚠️ Une anomalie sera créée automatiquement
                          </div>
                          {item.alerte.article_ref && (
                            <div style={{ fontSize: '0.75rem', color: '#991b1b', marginTop: '0.25rem' }}>
                              Article: {item.alerte.article_ref.article} - {item.alerte.article_ref.titre}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {nonConformites.length > 0 && (
        <div className="non-conformites-preview">
          <h3>⚠️ Non-conformités identifiées ({nonConformites.length})</h3>
          <div className="nc-list-preview">
            {nonConformites.map((nc, idx) => (
              <div key={idx} className="nc-preview-item">
                <span className="nc-number">#{idx + 1}</span>
                <span>{nc.titre}</span>
                <span className={`gravite-badge ${nc.gravite}`}>{nc.gravite}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="inspection-documentation">
        <div className="doc-section">
          <h3>📸 Photos de l'inspection</h3>
          <PhotoUploader photos={photos} setPhotos={setPhotos} maxPhotos={20} />
        </div>

        <div className="doc-section">
          <h3>📝 Notes d'inspection</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes, observations, commentaires..."
            className="notes-textarea"
            rows={4}
          />
        </div>

        <div className="doc-section">
          <h3>💡 Recommandations</h3>
          <textarea
            value={recommandations}
            onChange={(e) => setRecommandations(e.target.value)}
            placeholder="Recommandations pour améliorer la conformité..."
            className="notes-textarea"
            rows={4}
          />
        </div>
      </div>
    </div>
  );
};

const DetailInspection = ({ inspectionId, setCurrentView }) => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [inspection, setInspection] = useState(null);
  const [batiment, setBatiment] = useState(null);
  const [grille, setGrille] = useState(null);
  const [preventionniste, setPreventionniste] = useState(null);
  const [nonConformites, setNonConformites] = useState([]);

  useEffect(() => {
    const loadDetails = async () => {
      try {
        const inspData = await apiGet(tenantSlug, `/prevention/inspections/${inspectionId}`);
        setInspection(inspData);

        const [batData, grilleData, prevData, ncData] = await Promise.all([
          apiGet(tenantSlug, `/prevention/batiments/${inspData.batiment_id}`),
          apiGet(tenantSlug, `/prevention/grilles-inspection/${inspData.grille_inspection_id}`),
          apiGet(tenantSlug, `/users`).then(users => users.find(u => u.id === inspData.preventionniste_id)),
          apiGet(tenantSlug, `/prevention/non-conformites?inspection_id=${inspectionId}`)
        ]);

        setBatiment(batData);
        setGrille(grilleData);
        setPreventionniste(prevData);
        setNonConformites(ncData);
      } catch (error) {
        console.error('Erreur chargement détails:', error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les détails",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [inspectionId, tenantSlug]);

  if (loading) {
    return <div className="loading-spinner">Chargement...</div>;
  }

  if (!inspection || !batiment) {
    return <div>Erreur: Données manquantes</div>;
  }

  return (
    <div className="detail-inspection-container">
      <div className="page-header">
        <h2>🔍 Détails de l'Inspection</h2>
        <div className="header-actions">
          <Button variant="outline" onClick={() => setCurrentView('inspections')}>
            ← Retour à la liste
          </Button>
          <Button onClick={() => {
            window.open(`${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/prevention/inspections/${inspectionId}/rapport-pdf`, '_blank');
          }}>
            📄 Télécharger PDF
          </Button>
        </div>
      </div>

      <div className="detail-content">
        {/* Résumé */}
        <div className="detail-card">
          <h3>📊 Résumé</h3>
          <div className="summary-grid">
            <div className="summary-item">
              <span className="label">Statut:</span>
              <span className={`statut-badge ${inspection.statut_global}`}>
                {inspection.statut_global === 'conforme' ? '✅ Conforme' : '⚠️ Non-conforme'}
              </span>
            </div>
            <div className="summary-item">
              <span className="label">Score:</span>
              <span className="score-badge">{inspection.score_conformite}%</span>
            </div>
            <div className="summary-item">
              <span className="label">Date:</span>
              <span>{inspection.date_inspection}</span>
            </div>
            <div className="summary-item">
              <span className="label">Type:</span>
              <span>{inspection.type_inspection}</span>
            </div>
          </div>
        </div>

        {/* Bâtiment */}
        <div className="detail-card">
          <h3>🏢 Bâtiment Inspecté</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="label">Nom:</span>
              <span>{batiment.nom_etablissement}</span>
            </div>
            <div className="info-item">
              <span className="label">Adresse:</span>
              <span>{batiment.adresse_civique}, {batiment.ville}</span>
            </div>
            <div className="info-item">
              <span className="label">Groupe occupation:</span>
              <span>{batiment.groupe_occupation}</span>
            </div>
          </div>
        </div>

        {/* Préventionniste */}
        {preventionniste && (
          <div className="detail-card">
            <h3>👨‍🚒 Préventionniste</h3>
            <p><strong>{preventionniste.prenom} {preventionniste.nom}</strong></p>
            <p>{preventionniste.email}</p>
          </div>
        )}

        {/* Grille utilisée */}
        {grille && (
          <div className="detail-card">
            <h3>📋 Grille d'Inspection</h3>
            <p><strong>{grille.nom}</strong></p>
            {grille.groupe_occupation && <p>Groupe {grille.groupe_occupation}</p>}
          </div>
        )}

        {/* Non-conformités */}
        {nonConformites.length > 0 && (
          <div className="detail-card">
            <h3>⚠️ Non-Conformités ({nonConformites.length})</h3>
            <div className="nc-detail-list">
              {nonConformites.map((nc, idx) => (
                <div key={nc.id} className="nc-detail-item">
                  <div className="nc-detail-header">
                    <span className="nc-number">#{idx + 1}</span>
                    <h4>{nc.titre}</h4>
                    <span className={`gravite-badge ${nc.gravite}`}>{nc.gravite}</span>
                    <span className={`statut-badge ${nc.statut}`}>{nc.statut}</span>
                  </div>
                  {nc.description && <p className="nc-description">{nc.description}</p>}
                  {nc.delai_correction && (
                    <p className="nc-delai">
                      <strong>Délai:</strong> {nc.delai_correction}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photos */}
        {inspection.photos && inspection.photos.length > 0 && (
          <div className="detail-card">
            <h3>📸 Photos ({inspection.photos.length})</h3>
            <div className="photos-grid">
              {inspection.photos.map((photoUrl, idx) => (
                <div key={idx} className="photo-item-view">
                  <img 
                    src={photoUrl.includes('data:') ? photoUrl : `${process.env.REACT_APP_BACKEND_URL}${photoUrl}`}
                    alt={`Photo ${idx + 1}`}
                    className="photo-detail"
                    onClick={() => window.open(photoUrl, '_blank')}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {inspection.notes_inspection && (
          <div className="detail-card">
            <h3>📝 Notes d'Inspection</h3>
            <p className="note-text">{inspection.notes_inspection}</p>
          </div>
        )}

        {/* Recommandations */}
        {inspection.recommandations && (
          <div className="detail-card">
            <h3>💡 Recommandations</h3>
            <p className="note-text">{inspection.recommandations}</p>
          </div>
        )}
      </div>
    </div>
  );
};

const GestionNonConformites = ({ setCurrentView }) => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [nonConformites, setNonConformites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const fetchNonConformites = async () => {
      try {
        const data = await apiGet(tenantSlug, '/prevention/non-conformites');
        setNonConformites(data);
      } catch (error) {
        console.error('Erreur chargement non-conformités:', error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les non-conformités",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchNonConformites();
  }, [tenantSlug]);

  const handleUpdateStatut = async (ncId, newStatut) => {
    try {
      await apiPatch(tenantSlug, `/prevention/non-conformites/${ncId}/statut`, {
        statut: newStatut
      });

      setNonConformites(prev => 
        prev.map(nc => nc.id === ncId ? { ...nc, statut: newStatut } : nc)
      );

      toast({
        title: "Succès",
        description: "Statut mis à jour"
      });
    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour le statut",
        variant: "destructive"
      });
    }
  };

  const filteredNC = nonConformites.filter(nc => {
    if (filter === 'all') return true;
    if (filter === 'ouverte') return nc.statut === 'ouverte' || nc.statut === 'en_cours';
    if (filter === 'corrigee') return nc.statut === 'corrigee' || nc.statut === 'fermee';
    return true;
  });

  if (loading) {
    return <div className="loading-spinner">Chargement...</div>;
  }

  return (
    <div className="non-conformites-container">
      <div className="page-header">
        <h2>⚠️ Gestion des Non-Conformités</h2>
      </div>

      <div className="nc-filters">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          onClick={() => setFilter('all')}
        >
          Toutes ({nonConformites.length})
        </Button>
        <Button
          variant={filter === 'ouverte' ? 'default' : 'outline'}
          onClick={() => setFilter('ouverte')}
        >
          🔴 Ouvertes ({nonConformites.filter(nc => nc.statut === 'ouverte' || nc.statut === 'en_cours').length})
        </Button>
        <Button
          variant={filter === 'corrigee' ? 'default' : 'outline'}
          onClick={() => setFilter('corrigee')}
        >
          ✅ Corrigées ({nonConformites.filter(nc => nc.statut === 'corrigee' || nc.statut === 'fermee').length})
        </Button>
      </div>

      {filteredNC.length === 0 ? (
        <div className="empty-state">
          <p>Aucune non-conformité trouvée</p>
        </div>
      ) : (
        <div className="nc-list">
          {filteredNC.map(nc => (
            <div key={nc.id} className="nc-card">
              <div className="nc-header">
                <h4>{nc.titre}</h4>
                <span className={`statut-badge ${nc.statut}`}>{nc.statut}</span>
              </div>
              
              <div className="nc-details">
                <p><strong>Description:</strong> {nc.description || 'N/A'}</p>
                <p><strong>Gravité:</strong> <span className={`gravite-badge ${nc.gravite}`}>{nc.gravite}</span></p>
                {nc.delai_correction && (
                  <p><strong>Délai correction:</strong> {nc.delai_correction}</p>
                )}
              </div>

              <div className="nc-actions">
                <select
                  value={nc.statut}
                  onChange={(e) => handleUpdateStatut(nc.id, e.target.value)}
                  className="statut-select"
                >
                  <option value="ouverte">Ouverte</option>
                  <option value="en_cours">En cours</option>
                  <option value="corrigee">Corrigée</option>
                  <option value="fermee">Fermée</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CalendrierInspections = ({ setCurrentView, batiments, filteredBatimentId, setFilteredBatimentId }) => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    const fetchInspections = async () => {
      try {
        const data = await apiGet(tenantSlug, '/prevention/inspections');
        setInspections(data);
      } catch (error) {
        console.error('Erreur chargement inspections:', error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les inspections",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchInspections();
  }, [tenantSlug]);

  // Filtrer les inspections par bâtiment si spécifié
  const filteredInspections = filteredBatimentId 
    ? inspections.filter(insp => insp.batiment_id === filteredBatimentId)
    : inspections;

  const filteredBatiment = filteredBatimentId ? batiments.find(b => b.id === filteredBatimentId) : null;

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const getInspectionsForDay = (day) => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    return filteredInspections.filter(insp => insp.date_inspection === dateStr);
  };

  const getBatimentName = (batimentId) => {
    const batiment = batiments.find(b => b.id === batimentId);
    return batiment?.nom_etablissement || 'Inconnu';
  };

  const getSuggestedInspections = () => {
    // Bâtiments sans inspection dans les 3 derniers mois
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    return batiments.filter(batiment => {
      const batimentInspections = filteredInspections.filter(insp => insp.batiment_id === batiment.id);
      if (batimentInspections.length === 0) return true;
      
      const lastInspection = batimentInspections.sort((a, b) => 
        new Date(b.date_inspection) - new Date(a.date_inspection)
      )[0];
      
      return new Date(lastInspection.date_inspection) < threeMonthsAgo;
    });
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentMonth);
  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const today = new Date();
  const isToday = (day) => {
    return today.getDate() === day && 
           today.getMonth() === month && 
           today.getFullYear() === year;
  };

  if (loading) {
    return <div className="loading-spinner">Chargement du calendrier...</div>;
  }

  return (
    <div className="calendrier-container">
      <div className="page-header">
        <h2>📅 Calendrier des Inspections</h2>
        <Button onClick={() => setCurrentView('nouvelle-inspection')}>
          ➕ Planifier une inspection
        </Button>
      </div>

      {filteredBatiment && (
        <div style={{ 
          backgroundColor: '#eff6ff', 
          border: '2px solid #3b82f6',
          borderRadius: '0.5rem',
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <strong>🏢 Filtré par bâtiment:</strong> {filteredBatiment.nom_etablissement || filteredBatiment.adresse_civique}
          </div>
          <Button size="sm" onClick={() => setFilteredBatimentId(null)} variant="outline">
            ❌ Retirer filtre
          </Button>
        </div>
      )}

      {/* Navigation du calendrier */}
      <div className="calendar-nav">
        <Button 
          variant="outline"
          onClick={previousMonth}
          style={{
            padding: '0.75rem 1.25rem',
            fontSize: '1rem',
            fontWeight: '700',
            borderRadius: '10px',
            border: '2px solid #374151',
            background: 'white',
            color: '#374151'
          }}
        >
          ← Mois précédent
        </Button>
        <h3>{monthNames[month]} {year}</h3>
        <Button 
          variant="outline"
          onClick={nextMonth}
          style={{
            padding: '0.75rem 1.25rem',
            fontSize: '1rem',
            fontWeight: '700',
            borderRadius: '10px',
            border: '2px solid #374151',
            background: 'white',
            color: '#374151'
          }}
        >
          Mois suivant →
        </Button>
      </div>

      {/* Grille du calendrier */}
      <div className="calendar-grid">
        {/* En-têtes des jours */}
        {dayNames.map(day => (
          <div key={day} className="calendar-day-header">
            {day}
          </div>
        ))}
        
        {/* Jours vides au début */}
        {Array.from({ length: startingDayOfWeek }).map((_, index) => (
          <div key={`empty-${index}`} className="calendar-day empty"></div>
        ))}
        
        {/* Jours du mois */}
        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1;
          const dayInspections = getInspectionsForDay(day);
          
          return (
            <div 
              key={day} 
              className={`calendar-day ${isToday(day) ? 'today' : ''} ${dayInspections.length > 0 ? 'has-inspections' : ''}`}
            >
              <div className="day-number">{day}</div>
              {dayInspections.length > 0 && (
                <div className="day-inspections">
                  {dayInspections.slice(0, 2).map(insp => (
                    <div 
                      key={insp.id} 
                      className={`inspection-badge ${insp.statut_global}`}
                      title={getBatimentName(insp.batiment_id)}
                    >
                      {getBatimentName(insp.batiment_id).substring(0, 15)}...
                    </div>
                  ))}
                  {dayInspections.length > 2 && (
                    <div className="more-inspections">
                      +{dayInspections.length - 2} autre(s)
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Inspections à venir suggérées */}
      <div className="suggested-inspections">
        <h3>🔔 Inspections Suggérées</h3>
        <p className="subtitle">Bâtiments sans inspection depuis plus de 3 mois</p>
        
        {getSuggestedInspections().length === 0 ? (
          <div className="empty-state">
            ✅ Tous les bâtiments sont à jour dans leurs inspections
          </div>
        ) : (
          <div className="suggested-list">
            {getSuggestedInspections().slice(0, 10).map(batiment => (
              <div key={batiment.id} className="suggested-item">
                <div className="suggested-info">
                  <h4>{batiment.nom_etablissement}</h4>
                  <p>{batiment.adresse_civique}</p>
                  {batiment.groupe_occupation && (
                    <span className="groupe-badge">Groupe {batiment.groupe_occupation}</span>
                  )}
                </div>
                <Button 
                  size="sm"
                  onClick={() => {
                    // Pre-remplir le formulaire avec ce bâtiment
                    setCurrentView('nouvelle-inspection');
                  }}
                >
                  Planifier
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Légende */}
      <div className="calendar-legend">
        <h4>Légende</h4>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color today-marker"></div>
            <span>Aujourd'hui</span>
          </div>
          <div className="legend-item">
            <div className="legend-color conforme"></div>
            <span>Inspection conforme</span>
          </div>
          <div className="legend-item">
            <div className="legend-color non_conforme"></div>
            <span>Inspection non-conforme</span>
          </div>
        </div>
      </div>
    </div>
  );
};


export { 
  PhotoUploader,
  ListeInspections, 
  NouvelleInspection, 
  RealiserInspection, 
  DetailInspection,
  GestionNonConformites,
  CalendrierInspections
};
export default ListeInspections;
