import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { apiGet, apiPost } from '../utils/api';
import { useTenant } from '../contexts/TenantContext';
import InspectionAPRIAModal from './InspectionAPRIAModal';
import HistoriqueInspectionsAPRIA from './HistoriqueInspectionsAPRIA';
import CameraCapture, { isIOS } from './CameraCapture';
import InspectionPartieFacialeModal from './InspectionPartieFacialeModal';

const MesEPI = ({ user }) => {
  const [epis, setEpis] = useState([]);
  const [equipementsAssignes, setEquipementsAssignes] = useState([]);
  const [masqueAPRIA, setMasqueAPRIA] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedEPI, setSelectedEPI] = useState(null);
  const [selectedEquipement, setSelectedEquipement] = useState(null);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [showHistoriqueModal, setShowHistoriqueModal] = useState(false);
  const [showRemplacementModal, setShowRemplacementModal] = useState(false);
  const [showInspectionAPRIAModal, setShowInspectionAPRIAModal] = useState(false);
  const [showHistoriqueAPRIAModal, setShowHistoriqueAPRIAModal] = useState(false);
  const [showInspectionPartieFacialeModal, setShowInspectionPartieFacialeModal] = useState(false);
  const [showCameraCapture, setShowCameraCapture] = useState(false);
  const [historique, setHistorique] = useState([]);
  const [modelePartieFaciale, setModelePartieFaciale] = useState(null);
  const { tenantSlug } = useTenant();
  const { toast } = useToast();

  const [inspectionForm, setInspectionForm] = useState({
    statut_inspection: 'ok',
    defauts_constates: '',
    notes: '',
    photo_url: '',
    criteres_inspection: {}
  });

  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const [remplacementForm, setRemplacementForm] = useState({
    raison: '',
    details: ''
  });

  const raisonsRemplacement = [
    { id: 'usure', label: 'Usure normale', icon: '⏳', desc: 'L\'EPI montre des signes d\'usure normale', backendValue: 'Usé' },
    { id: 'defaut', label: 'Défaut constaté', icon: '⚠️', desc: 'Défaut technique ou matériel', backendValue: 'Défectueux' },
    { id: 'perte', label: 'Perte/Vol', icon: '🔍', desc: 'EPI perdu ou volé', backendValue: 'Perdu' },
    { id: 'taille', label: 'Taille inadaptée', icon: '📏', desc: 'Besoin d\'une autre taille', backendValue: 'Taille inadaptée' }
  ];

  // Critères d'inspection par type d'EPI (basés sur les documents fournis)
  const criteresParType = {
    'Gants': [
      { id: 'proprete', label: 'Propreté (absence de contamination)', icon: '🧼' },
      { id: 'contamination', label: 'Pas de contamination par matières dangereuses', icon: '☣️' },
      { id: 'dechirure', label: 'Pas de déchirure ou coupure', icon: '✂️' },
      { id: 'flexibilite', label: 'Flexibilité/élasticité conservée', icon: '💪' }
    ],
    'Bottes': [
      { id: 'proprete', label: 'Propreté (absence de contamination)', icon: '🧼' },
      { id: 'perforation', label: 'Pas de perforation, déchirure ou coupure', icon: '🔪' },
      { id: 'etancheite', label: 'Étanchéité préservée', icon: '💧' },
      { id: 'semelle', label: 'Bon état de la semelle', icon: '👟' },
      { id: 'fermeture', label: 'Fermeture éclair fonctionnelle', icon: '🔒' }
    ],
    'Cagoule': [
      { id: 'proprete', label: 'Propreté (absence de contamination)', icon: '🧼' },
      { id: 'dechirure', label: 'Pas de déchirure, coupure ou brûlure', icon: '🔥' },
      { id: 'decoloration', label: 'Pas de décoloration', icon: '🎨' },
      { id: 'couture', label: 'Coutures intactes', icon: '🧵' },
      { id: 'ajustement', label: 'Ajustement facial correct', icon: '😷' }
    ],
    'Casque': [
      { id: 'proprete', label: 'Propreté du revêtement extérieur', icon: '🧼' },
      { id: 'fissure', label: 'Pas de fissure, bosse ou abrasion', icon: '🔨' },
      { id: 'thermique', label: 'Pas de dommage thermique', icon: '🔥' },
      { id: 'visiere', label: 'Visière en bon état', icon: '👁️' },
      { id: 'suspension', label: 'Système de suspension et jugulaire OK', icon: '⛑️' }
    ],
    'Bunker': [
      { id: 'proprete', label: 'Propreté (absence de contamination)', icon: '🧼' },
      { id: 'dechirure', label: 'Pas de déchirure ou coupure', icon: '✂️' },
      { id: 'quincaillerie', label: 'Quincaillerie et fermetures fonctionnelles', icon: '🔧' },
      { id: 'thermique', label: 'Pas de dommage thermique', icon: '🔥' },
      { id: 'bande', label: 'Bandes réfléchissantes intactes', icon: '✨' },
      { id: 'couture', label: 'Coutures intactes', icon: '🧵' }
    ],
    'ARI': [
      { id: 'proprete', label: 'Propreté (absence de contamination)', icon: '🧼' },
      { id: 'dechirure', label: 'Pas de déchirure ou coupure', icon: '✂️' },
      { id: 'quincaillerie', label: 'Quincaillerie complète (filtre, noze cup)', icon: '🔧' },
      { id: 'visiere', label: 'Visière en bon état', icon: '👁️' },
      { id: 'etancheite', label: 'Étanchéité préservée', icon: '💨' }
    ]
  };

  // Fonction pour déterminer les critères selon le type d'EPI
  const getCriteresPourEPI = (typeEPI) => {
    if (!typeEPI) return [];
    
    const typeNormalise = typeEPI.toLowerCase();
    
    if (typeNormalise.includes('gant')) return criteresParType['Gants'];
    if (typeNormalise.includes('botte')) return criteresParType['Bottes'];
    if (typeNormalise.includes('cagoule')) return criteresParType['Cagoule'];
    if (typeNormalise.includes('casque')) return criteresParType['Casque'];
    if (typeNormalise.includes('bunker') || typeNormalise.includes('habit')) return criteresParType['Bunker'];
    if (typeNormalise.includes('ari') || typeNormalise.includes('masque') || typeNormalise.includes('facial')) return criteresParType['ARI'];
    
    // Critères génériques si type non reconnu
    return [
      { id: 'proprete', label: 'Propreté générale', icon: '🧼' },
      { id: 'integrite', label: 'Intégrité structurelle', icon: '✅' },
      { id: 'fonctionnel', label: 'Fonctionnalité préservée', icon: '⚙️' }
    ];
  };

  useEffect(() => {
    loadEPIs();
    loadMasqueAPRIA();
    loadEquipementsAssignes();
    loadModelePartieFaciale();
  }, []);

  const loadEPIs = async () => {
    setLoading(true);
    try {
      const data = await apiGet(tenantSlug, '/mes-epi');
      setEpis(data || []);
    } catch (error) {
      console.error('Erreur chargement EPIs:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger vos EPIs",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Charger les équipements assignés depuis le module Matériel
  const loadEquipementsAssignes = async () => {
    try {
      const data = await apiGet(tenantSlug, '/mes-equipements');
      setEquipementsAssignes(data?.equipements || []);
    } catch (error) {
      console.log('Pas d\'équipements assignés:', error);
      setEquipementsAssignes([]);
    }
  };

  // Charger le modèle d'inspection des parties faciales actif
  const loadModelePartieFaciale = async () => {
    try {
      const data = await apiGet(tenantSlug, '/parties-faciales/modeles-inspection/actif');
      setModelePartieFaciale(data);
    } catch (error) {
      console.log('Pas de modèle de partie faciale:', error);
      setModelePartieFaciale(null);
    }
  };

  // Charger le masque APRIA assigné à l'utilisateur
  const loadMasqueAPRIA = async () => {
    try {
      const data = await apiGet(tenantSlug, '/mes-epi/masque-apria');
      setMasqueAPRIA(data);
    } catch (error) {
      // Pas de masque assigné, c'est normal
      console.log('Pas de masque APRIA assigné');
      setMasqueAPRIA(null);
    }
  };

  const loadHistorique = async (epiId) => {
    try {
      const data = await apiGet(tenantSlug, `/mes-epi/${epiId}/historique`);
      setHistorique(data || []);
    } catch (error) {
      console.error('Erreur chargement historique:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger l'historique",
        variant: "destructive"
      });
    }
  };

  const openInspectionModal = (epi) => {
    setSelectedEPI(epi);
    
    // Initialiser les critères d'inspection pour ce type d'EPI
    const criteres = getCriteresPourEPI(epi.type_epi);
    const criteresInit = {};
    criteres.forEach(critere => {
      criteresInit[critere.id] = true; // Tous cochés par défaut
    });
    
    setInspectionForm({
      statut_inspection: 'ok',
      defauts_constates: '',
      notes: '',
      photo_url: '',
      criteres_inspection: criteresInit
    });
    setPhotoFile(null);
    setPhotoPreview(null);
    setShowInspectionModal(true);
  };

  const openHistoriqueModal = async (epi) => {
    setSelectedEPI(epi);
    await loadHistorique(epi.id);
    setShowHistoriqueModal(true);
  };

  const openRemplacementModal = async (epi) => {
    setSelectedEPI(epi);
    
    // Vérifier s'il y a déjà une demande en attente pour cet EPI
    try {
      const response = await apiGet(tenantSlug, `/mes-epi/${epi.id}/demande-en-attente`);
      if (response && response.existe) {
        // Afficher un toast informatif au lieu d'ouvrir le modal
        toast({
          title: "⏳ Demande en attente",
          description: `Une demande de remplacement est déjà en attente pour cet EPI. Demandée le ${new Date(response.demande.date_demande).toLocaleDateString('fr-FR')} - Raison: ${response.demande.raison}`,
          duration: 5000
        });
        return;
      }
    } catch (error) {
      // Si l'endpoint n'existe pas encore, on continue
      console.log('Vérification demande existante non disponible');
    }
    
    setRemplacementForm({
      raison: '',
      details: ''
    });
    setShowRemplacementModal(true);
  };

  // Vérifier si tous les critères sont cochés
  const tousCriteresCoches = () => {
    const criteres = getCriteresPourEPI(selectedEPI?.type_epi);
    return criteres.every(critere => inspectionForm.criteres_inspection[critere.id] === true);
  };

  // Toggle d'un critère
  const toggleCritere = (critereId) => {
    const newCriteres = { ...inspectionForm.criteres_inspection };
    newCriteres[critereId] = !newCriteres[critereId];
    
    // Si au moins un critère est décoché, statut = defaut
    const tousCoches = Object.values(newCriteres).every(val => val === true);
    
    setInspectionForm({
      ...inspectionForm,
      criteres_inspection: newCriteres,
      statut_inspection: tousCoches ? 'ok' : 'defaut'
    });
  };

  const handleInspection = async () => {
    if (!selectedEPI) return;

    // Validation : si statut = defaut, il faut des défauts constatés
    if (inspectionForm.statut_inspection === 'defaut' && !inspectionForm.defauts_constates.trim()) {
      toast({
        title: "Erreur",
        description: "Veuillez décrire les défauts constatés",
        variant: "destructive"
      });
      return;
    }

    try {
      // Si une photo a été sélectionnée, la convertir en base64
      let photoData = inspectionForm.photo_url;
      
      if (photoFile) {
        const reader = new FileReader();
        photoData = await new Promise((resolve, reject) => {
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(photoFile);
        });
      }

      await apiPost(tenantSlug, `/mes-epi/${selectedEPI.id}/inspection`, {
        statut: inspectionForm.statut_inspection,
        defauts_constates: inspectionForm.defauts_constates,
        notes: inspectionForm.notes,
        photo_url: photoData,
        criteres_inspection: inspectionForm.criteres_inspection
      });
      
      toast({
        title: "Succès",
        description: "Inspection enregistrée avec succès",
        variant: "default"
      });
      
      setShowInspectionModal(false);
      loadEPIs();
    } catch (error) {
      console.error('Erreur lors de l\'inspection:', error);
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer l'inspection",
        variant: "destructive"
      });
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Vérifier la taille du fichier (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Erreur",
          description: "La photo ne doit pas dépasser 5 MB",
          variant: "destructive"
        });
        return;
      }

      setPhotoFile(file);
      
      // Créer une preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoPreview(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Gestionnaire pour la capture caméra iOS
  const handleCameraCapture = (file) => {
    setShowCameraCapture(false);
    if (file) {
      setPhotoFile(file);
      // Créer une preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoPreview(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // Fonction pour ouvrir la capture photo (détection iOS automatique)
  const openPhotoCapture = () => {
    if (isIOS()) {
      setShowCameraCapture(true);
    } else {
      document.getElementById('photo-input')?.click();
    }
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setInspectionForm({...inspectionForm, photo_url: ''});
  };

  const handleDemandeRemplacement = async () => {
    if (!selectedEPI || !remplacementForm.raison) return;

    try {
      // Trouver la raison sélectionnée pour obtenir la valeur backend
      const raisonObj = raisonsRemplacement.find(r => r.id === remplacementForm.raison);
      const raisonBackend = raisonObj ? raisonObj.backendValue : remplacementForm.raison;
      
      await apiPost(tenantSlug, `/mes-epi/${selectedEPI.id}/demander-remplacement`, {
        raison: raisonBackend,
        notes_employe: remplacementForm.details
      });
      
      toast({
        title: "Succès",
        description: "Demande de remplacement envoyée. Un administrateur traitera votre demande.",
      });

      setShowRemplacementModal(false);
      setRemplacementForm({
        raison: '',
        details: ''
      });
      loadEPIs();
    } catch (error) {
      console.error('Erreur lors de la demande:', error);
      const errorMsg = error.response?.data?.detail || error.message;
      toast({
        title: "Erreur",
        description: errorMsg.includes("déjà en attente") 
          ? "Une demande de remplacement est déjà en attente pour cet EPI. Veuillez attendre la réponse de l'administrateur."
          : "Impossible d'envoyer la demande de remplacement",
        variant: "destructive"
      });
    }
  };

  const getStatutColor = (statut) => {
    const colors = {
      'En service': '#10B981',
      'En inspection': '#F59E0B',
      'En maintenance': '#3B82F6',
      'Retiré': '#6B7280',
      'À vérifier': '#F59E0B',
      'En réparation': '#EF4444',
      'Hors service': '#DC2626'
    };
    return colors[statut] || '#6B7280';
  };

  const getTypeIcon = (type) => {
    const icons = {
      'Casque': '⛑️',
      'Gants': '🧤',
      'Bottes': '🥾',
      'Bunker': '🧥',
      'Cagoule': '🎭',
      'ARI': '😷',
      'Habit': '🧥'
    };
    
    const typeNormalise = (type || '').toLowerCase();
    if (typeNormalise.includes('casque')) return icons['Casque'];
    if (typeNormalise.includes('gant')) return icons['Gants'];
    if (typeNormalise.includes('botte')) return icons['Bottes'];
    if (typeNormalise.includes('bunker') || typeNormalise.includes('habit')) return icons['Bunker'];
    if (typeNormalise.includes('cagoule')) return icons['Cagoule'];
    if (typeNormalise.includes('ari') || typeNormalise.includes('masque')) return icons['ARI'];
    
    return '🛡️';
  };

  if (loading) {
    return (
      <div className="mes-epi-container">
        <div className="loading-spinner"></div>
        <p>Chargement de vos EPIs...</p>
      </div>
    );
  }

  return (
    <div className="mes-epi-container">
      <div className="module-header">
        <div>
          <h1>🛡️ Mes EPI</h1>
          <p>Consultez vos équipements de protection individuelle, effectuez des inspections et signalez les défauts</p>
        </div>
      </div>

      {/* Section Masque APRIA assigné */}
      {masqueAPRIA && (
        <div className="apria-section" style={{ marginBottom: '2rem' }}>
          <h2 style={{ 
            fontSize: '1.25rem', 
            fontWeight: '600', 
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            🫁 Mon Masque APRIA
          </h2>
          <div className="epi-card" style={{ 
            border: '2px solid #3B82F6', 
            backgroundColor: '#eff6ff'
          }}>
            <div className="epi-card-header">
              <span className="epi-icon" style={{ fontSize: '2rem' }}>😷</span>
              <div>
                <h3>{masqueAPRIA.nom || 'Pièce faciale APRIA'}</h3>
                <p className="epi-numero">#{masqueAPRIA.code_unique}</p>
              </div>
              <span 
                className="epi-statut-badge" 
                style={{ backgroundColor: getStatutColor(masqueAPRIA.etat === 'bon' ? 'En service' : masqueAPRIA.etat === 'hors_service' ? 'Hors service' : 'À vérifier') }}
              >
                {masqueAPRIA.etat === 'bon' ? 'En service' : masqueAPRIA.etat === 'hors_service' ? 'Hors service' : masqueAPRIA.etat}
              </span>
            </div>
            
            <div className="epi-card-body">
              {masqueAPRIA.description && <p><strong>Description:</strong> {masqueAPRIA.description}</p>}
              {masqueAPRIA.categorie_nom && <p><strong>Catégorie:</strong> {masqueAPRIA.categorie_nom}</p>}
              {masqueAPRIA.date_achat && (
                <p><strong>Date d'achat:</strong> {new Date(masqueAPRIA.date_achat).toLocaleDateString('fr-FR')}</p>
              )}
              {masqueAPRIA.derniere_inspection_apria ? (
                <p>
                  <strong>Dernière inspection:</strong> {new Date(masqueAPRIA.derniere_inspection_apria.date_inspection).toLocaleDateString('fr-FR')} 
                  <span style={{ 
                    marginLeft: '0.5rem',
                    padding: '0.125rem 0.5rem',
                    borderRadius: '0.25rem',
                    fontSize: '0.75rem',
                    backgroundColor: masqueAPRIA.derniere_inspection_apria.conforme ? '#dcfce7' : '#fee2e2',
                    color: masqueAPRIA.derniere_inspection_apria.conforme ? '#166534' : '#991b1b'
                  }}>
                    {masqueAPRIA.derniere_inspection_apria.conforme ? '✅ Conforme' : '⚠️ Non conforme'}
                  </span>
                </p>
              ) : (
                <p style={{ color: '#f59e0b', fontWeight: '500' }}>⚠️ Aucune inspection enregistrée</p>
              )}
            </div>
            
            <div className="epi-card-actions">
              <Button 
                size="sm" 
                onClick={() => {
                  setShowInspectionAPRIAModal(true);
                }}
                disabled={masqueAPRIA.etat === 'hors_service'}
              >
                📝 Inspecter
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => {
                  setShowHistoriqueAPRIAModal(true);
                }}
              >
                📜 Historique
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Section Équipements assignés (Parties Faciales, etc.) */}
      {equipementsAssignes.length > 0 && (
        <div className="equipements-section" style={{ marginBottom: '2rem' }}>
          <h2 style={{ 
            fontSize: '1.25rem', 
            fontWeight: '600', 
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            🎭 Mes Équipements Assignés
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Équipements sous votre responsabilité - Inspections et demandes de remplacement
          </p>
          <div className="epi-grid">
            {equipementsAssignes.map((equip) => {
              const isPartieFaciale = equip.tags?.includes('partie_faciale') || 
                equip.nom?.toLowerCase().includes('facial') ||
                equip.nom?.toLowerCase().includes('masque') ||
                equip.categorie_nom?.toLowerCase().includes('facial');
              
              return (
                <div key={equip.id} className="epi-card" style={{ 
                  border: isPartieFaciale ? '2px solid #8b5cf6' : '1px solid #e5e7eb',
                  backgroundColor: isPartieFaciale ? '#f5f3ff' : 'white'
                }}>
                  <div className="epi-card-header">
                    <span className="epi-icon" style={{ fontSize: '2rem' }}>
                      {isPartieFaciale ? '🎭' : '🔧'}
                    </span>
                    <div>
                      <h3>{equip.nom || 'Équipement'}</h3>
                      <p className="epi-numero">#{equip.code_unique}</p>
                    </div>
                    <span 
                      className="epi-statut-badge" 
                      style={{ 
                        backgroundColor: equip.etat === 'bon' ? '#22c55e' : 
                          equip.etat === 'hors_service' ? '#ef4444' : '#f59e0b'
                      }}
                    >
                      {equip.etat === 'bon' ? '✅ OK' : 
                       equip.etat === 'hors_service' ? '❌ HS' : '⚠️ À vérifier'}
                    </span>
                  </div>
                  
                  <div className="epi-card-body">
                    {equip.description && <p><strong>Description:</strong> {equip.description}</p>}
                    {equip.categorie_nom && <p><strong>Catégorie:</strong> {equip.categorie_nom}</p>}
                    {equip.numero_serie && <p><strong>N° série:</strong> {equip.numero_serie}</p>}
                    {equip.emplacement && <p><strong>Emplacement:</strong> {equip.emplacement}</p>}
                    {isPartieFaciale && (
                      <p style={{ color: '#7c3aed', fontWeight: '500', marginTop: '0.5rem' }}>
                        🎭 Partie faciale - Inspection requise
                      </p>
                    )}
                  </div>
                  
                  <div className="epi-card-actions">
                    {isPartieFaciale && modelePartieFaciale && (
                      <Button 
                        size="sm" 
                        onClick={() => {
                          setSelectedEquipement(equip);
                          setShowInspectionPartieFacialeModal(true);
                        }}
                        style={{ backgroundColor: '#8b5cf6' }}
                        disabled={equip.etat === 'hors_service'}
                      >
                        📋 Inspecter
                      </Button>
                    )}
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        // TODO: Historique des inspections
                        toast({
                          title: "📜 Historique",
                          description: "Fonctionnalité à venir"
                        });
                      }}
                    >
                      📜 Historique
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        setSelectedEquipement(equip);
                        // Ouvrir le modal de demande de remplacement
                        setRemplacementForm({ raison: '', details: '' });
                        setShowRemplacementModal(true);
                      }}
                      disabled={equip.etat === 'hors_service'}
                    >
                      🔄 Remplacement
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section EPI classiques */}
      {epis.length === 0 && !masqueAPRIA ? (
        <div className="empty-state">
          <p>Aucun EPI ne vous est assigné pour le moment.</p>
        </div>
      ) : epis.length > 0 && (
        <>
          {masqueAPRIA && (
            <h2 style={{ 
              fontSize: '1.25rem', 
              fontWeight: '600', 
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              🛡️ Mes autres EPI
            </h2>
          )}
          <div className="epi-grid">
            {epis.map((epi) => (
              <div key={epi.id} className="epi-card">
                <div className="epi-card-header">
                  <span className="epi-icon">{getTypeIcon(epi.type_epi)}</span>
                  <div>
                    <h3>{epi.type_epi || 'EPI'}</h3>
                    <p className="epi-numero">#{epi.numero_serie}</p>
                  </div>
                  <span 
                    className="epi-statut-badge" 
                    style={{ backgroundColor: getStatutColor(epi.statut) }}
                  >
                    {epi.statut}
                  </span>
                </div>
                
                <div className="epi-card-body">
                  {epi.marque && <p><strong>Marque:</strong> {epi.marque}</p>}
                  {epi.modele && <p><strong>Modèle:</strong> {epi.modele}</p>}
                  {epi.taille && <p><strong>Taille:</strong> {epi.taille}</p>}
                  {epi.date_mise_en_service && (
                    <p><strong>Mise en service:</strong> {new Date(epi.date_mise_en_service).toLocaleDateString('fr-FR')}</p>
                  )}
                  {epi.prochaine_inspection && (
                    <p><strong>Prochaine inspection:</strong> {new Date(epi.prochaine_inspection).toLocaleDateString('fr-FR')}</p>
                  )}
                </div>
                
                <div className="epi-card-actions">
                  <Button 
                    size="sm" 
                    onClick={() => openInspectionModal(epi)}
                    disabled={epi.statut === 'Retiré'}
                  >
                    📋 Inspection
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => openHistoriqueModal(epi)}
                  >
                    📜 Historique
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => openRemplacementModal(epi)}
                    disabled={epi.statut === 'Retiré'}
                  >
                    🔄 Remplacement
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal Inspection */}
      {showInspectionModal && selectedEPI && (
        <div className="modal-overlay" onClick={() => setShowInspectionModal(false)}>
          <div className="modal-content inspection-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📋 Inspection après usage</h3>
              <button className="modal-close" onClick={() => setShowInspectionModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              {/* EPI Info Card */}
              <div className="epi-info-card">
                <div className="epi-info-icon">🛡️</div>
                <div className="epi-info-details">
                  <h4>{selectedEPI.type_epi}</h4>
                  <p>{selectedEPI.marque} {selectedEPI.modele}</p>
                  <span className="epi-serial">N° {selectedEPI.numero_serie}</span>
                </div>
              </div>

              {/* Liste de contrôle visuel selon type d'EPI */}
              <div className="form-group">
                <Label className="form-label-bold">Liste de contrôle visuel</Label>
                <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1rem' }}>
                  Vérifiez chaque critère pour votre {selectedEPI.type_epi}
                </p>
                
                <div className="criteres-checklist" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  marginBottom: '1.5rem'
                }}>
                  {getCriteresPourEPI(selectedEPI.type_epi).map(critere => (
                    <div key={critere.id} className="critere-item" style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.5rem',
                      transition: 'all 0.2s',
                      cursor: 'pointer',
                      backgroundColor: inspectionForm.criteres_inspection[critere.id] ? '#f0fdf4' : 'white'
                    }}>
                      <input
                        type="checkbox"
                        id={`critere-${critere.id}`}
                        checked={inspectionForm.criteres_inspection[critere.id] || false}
                        onChange={() => toggleCritere(critere.id)}
                        style={{
                          width: '20px',
                          height: '20px',
                          cursor: 'pointer'
                        }}
                      />
                      <label htmlFor={`critere-${critere.id}`} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                        flex: 1
                      }}>
                        <span style={{ fontSize: '1.25rem' }}>{critere.icon}</span>
                        <span style={{ fontSize: '0.9rem' }}>{critere.label}</span>
                      </label>
                    </div>
                  ))}
                </div>

                {/* Statut automatique */}
                <div style={{
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  backgroundColor: inspectionForm.statut_inspection === 'ok' ? '#f0fdf4' : '#fef2f2',
                  border: `2px solid ${inspectionForm.statut_inspection === 'ok' ? '#86efac' : '#fca5a5'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  fontWeight: '600'
                }}>
                  {inspectionForm.statut_inspection === 'ok' ? (
                    <>
                      <span style={{ fontSize: '1.5rem' }}>✅</span>
                      <span style={{ color: '#16a34a' }}>Tous les critères cochés = CONFORME</span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                      <span style={{ color: '#dc2626' }}>Au moins un critère décoché = DÉFAUT</span>
                    </>
                  )}
                </div>
              </div>

              {/* Défauts constatés (si défaut) */}
              {inspectionForm.statut_inspection === 'defaut' && (
                <div className="form-group defaut-section">
                  <Label className="form-label-bold">Défauts constatés *</Label>
                  <textarea
                    value={inspectionForm.defauts_constates}
                    onChange={(e) => setInspectionForm({...inspectionForm, defauts_constates: e.target.value})}
                    placeholder="Décrivez précisément les défauts observés (déchirure, usure, casse, etc.)..."
                    rows="3"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #fca5a5',
                      borderRadius: '0.5rem',
                      fontSize: '0.95rem',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                </div>
              )}

              {/* Notes complémentaires */}
              <div className="form-group">
                <Label className="form-label-bold">Notes complémentaires</Label>
                <textarea
                  value={inspectionForm.notes}
                  onChange={(e) => setInspectionForm({...inspectionForm, notes: e.target.value})}
                  placeholder="Ajoutez des notes si nécessaire (optionnel)..."
                  rows="2"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    fontSize: '0.95rem',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Photo */}
              <div className="form-group">
                <Label className="form-label-bold">Ajouter une photo</Label>
                
                {!photoPreview ? (
                  <div className="photo-upload-zone" onClick={openPhotoCapture} style={{ cursor: 'pointer' }}>
                    <input
                      type="file"
                      id="photo-input"
                      accept="image/*"
                      
                      onChange={handlePhotoChange}
                      className="photo-input-hidden"
                    />
                    <div className="photo-upload-label">
                      <div className="photo-upload-icon">📷</div>
                      <div className="photo-upload-text">
                        <strong>Prendre ou choisir une photo</strong>
                        <span>Appuyez pour capturer ou sélectionner (max 5 MB)</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="photo-preview-container">
                    <img src={photoPreview} alt="Preview" className="photo-preview" />
                    <button className="photo-remove" onClick={removePhoto} type="button">
                      ✕ Supprimer
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <Button onClick={() => setShowInspectionModal(false)} className="btn-secondary">
                Annuler
              </Button>
              <Button 
                onClick={handleInspection}
                className="btn-primary"
                disabled={inspectionForm.statut_inspection === 'defaut' && !inspectionForm.defauts_constates}
              >
                ✓ Enregistrer l'inspection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Historique */}
      {showHistoriqueModal && selectedEPI && (
        <div className="modal-overlay" onClick={() => setShowHistoriqueModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📜 Historique des inspections</h3>
              <button className="modal-close" onClick={() => setShowHistoriqueModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="mb-4">
                <strong>EPI:</strong> {selectedEPI.type_epi} - {selectedEPI.numero_serie}
              </p>

              {historique.length === 0 ? (
                <p className="text-center text-gray-500">Aucune inspection enregistrée</p>
              ) : (
                <div className="historique-list">
                  {historique.map((inspection, index) => (
                    <div key={index} className="historique-item">
                      <div className="historique-header">
                        <span className="historique-date">
                          📅 {new Date(inspection.date_inspection).toLocaleDateString('fr-FR')} à {new Date(inspection.date_inspection).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className={`badge ${inspection.statut === 'ok' ? 'badge-success' : 'badge-danger'}`}>
                          {inspection.statut === 'ok' ? '✅ OK' : '⚠️ Défaut'}
                        </span>
                      </div>
                      {inspection.defauts_constates && (
                        <div className="historique-defauts">
                          <strong>Défauts:</strong> {inspection.defauts_constates}
                        </div>
                      )}
                      {inspection.notes && (
                        <div className="historique-notes">
                          <strong>Notes:</strong> {inspection.notes}
                        </div>
                      )}
                      {inspection.photo_url && (
                        <div className="historique-photo">
                          <a href={inspection.photo_url} target="_blank" rel="noopener noreferrer">
                            📷 Voir la photo
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <Button onClick={() => setShowHistoriqueModal(false)} className="btn-secondary">
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Demande de Remplacement */}
      {showRemplacementModal && selectedEPI && (
        <div className="modal-overlay" onClick={() => setShowRemplacementModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔄 Demande de remplacement</h3>
              <button className="modal-close" onClick={() => setShowRemplacementModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {/* EPI Info Card */}
              <div className="epi-info-card" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem',
                backgroundColor: '#f8fafc',
                borderRadius: '0.75rem',
                marginBottom: '1.5rem'
              }}>
                <div style={{ fontSize: '2.5rem' }}>{getTypeIcon(selectedEPI.type_epi)}</div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>{selectedEPI.type_epi}</h4>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: '#64748b' }}>
                    {selectedEPI.marque} {selectedEPI.modele}
                  </p>
                  <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                    N° {selectedEPI.numero_serie}
                  </span>
                </div>
              </div>

              {/* Raisons de remplacement - Cartes cliquables */}
              <div className="form-group">
                <Label className="form-label-bold" style={{ marginBottom: '1rem', display: 'block' }}>
                  Raison du remplacement *
                </Label>
                
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '1rem',
                  marginBottom: '1.5rem'
                }}>
                  {raisonsRemplacement.map((raison) => (
                    <div
                      key={raison.id}
                      onClick={() => setRemplacementForm({...remplacementForm, raison: raison.id})}
                      style={{
                        padding: '1rem',
                        border: `2px solid ${remplacementForm.raison === raison.id ? '#3B82F6' : '#e2e8f0'}`,
                        borderRadius: '0.75rem',
                        cursor: 'pointer',
                        backgroundColor: remplacementForm.raison === raison.id ? '#eff6ff' : 'white',
                        transition: 'all 0.2s',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{raison.icon}</div>
                      <div style={{ 
                        fontWeight: '600', 
                        fontSize: '0.95rem',
                        marginBottom: '0.25rem',
                        color: remplacementForm.raison === raison.id ? '#1e40af' : '#1e293b'
                      }}>
                        {raison.label}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {raison.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Détails complémentaires */}
              <div className="form-group">
                <Label className="form-label-bold">Détails complémentaires</Label>
                <textarea
                  value={remplacementForm.details}
                  onChange={(e) => setRemplacementForm({...remplacementForm, details: e.target.value})}
                  placeholder="Ajoutez des détails pour justifier votre demande..."
                  rows="4"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    fontSize: '0.95rem',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    marginTop: '0.5rem'
                  }}
                />
              </div>

              {/* Alert info */}
              <div style={{
                display: 'flex',
                gap: '0.75rem',
                padding: '1rem',
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '0.5rem',
                fontSize: '0.9rem',
                color: '#1e40af'
              }}>
                <span style={{ fontSize: '1.25rem' }}>ℹ️</span>
                <span>Votre demande sera examinée par un administrateur. Vous serez notifié de la décision.</span>
              </div>
            </div>
            <div className="modal-footer">
              <Button onClick={() => setShowRemplacementModal(false)} className="btn-secondary">
                Annuler
              </Button>
              <Button 
                onClick={handleDemandeRemplacement} 
                className="btn-primary"
                disabled={!remplacementForm.raison}
              >
                Envoyer la demande
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Inspection APRIA */}
      {showInspectionAPRIAModal && masqueAPRIA && (
        <InspectionAPRIAModal
          isOpen={showInspectionAPRIAModal}
          onClose={() => setShowInspectionAPRIAModal(false)}
          tenantSlug={tenantSlug}
          user={user}
          equipementPreselectionne={masqueAPRIA}
          onInspectionCreated={() => {
            setShowInspectionAPRIAModal(false);
            loadMasqueAPRIA(); // Recharger pour voir la dernière inspection
          }}
        />
      )}

      {/* Modal Inspection Partie Faciale */}
      {showInspectionPartieFacialeModal && selectedEquipement && modelePartieFaciale && (
        <InspectionPartieFacialeModal
          isOpen={showInspectionPartieFacialeModal}
          onClose={() => setShowInspectionPartieFacialeModal(false)}
          tenantSlug={tenantSlug}
          user={user}
          equipement={selectedEquipement}
          modele={modelePartieFaciale}
          onInspectionCreated={() => {
            setShowInspectionPartieFacialeModal(false);
            loadEquipementsAssignes();
            toast({
              title: "✅ Inspection enregistrée",
              description: "L'inspection a été sauvegardée avec succès"
            });
          }}
        />
      )}

      {/* Modal Historique APRIA */}
      {showHistoriqueAPRIAModal && masqueAPRIA && (
        <HistoriqueInspectionsAPRIA
          isOpen={showHistoriqueAPRIAModal}
          onClose={() => setShowHistoriqueAPRIAModal(false)}
          tenantSlug={tenantSlug}
          equipementId={masqueAPRIA.id}
          equipementNom={masqueAPRIA.nom || 'Pièce faciale APRIA'}
        />
      )}

      {/* Modal de capture caméra iOS */}
      {showCameraCapture && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onClose={() => setShowCameraCapture(false)}
          maxWidth={1280}
          quality={0.85}
          facingMode="environment"
        />
      )}
    </div>
  );
};

export default MesEPI;
