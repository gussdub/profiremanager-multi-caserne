import React, { useState, useEffect, lazy, Suspense } from "react";
import axios from "axios";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";
import { useToast } from "../hooks/use-toast";
import { buildApiUrl } from "../utils/api";
import Personnalisation from "./Personnalisation.jsx";

// Lazy load des composants pour optimiser les performances
const ParametresAttribution = lazy(() => import("./ParametresAttribution.jsx"));
const ParametresRemplacements = lazy(() => import("./ParametresRemplacements.jsx"));
const ParametresDisponibilites = lazy(() => import("./ParametresDisponibilites.jsx"));
const ParametresFormations = lazy(() => import("./ParametresFormations.jsx"));
const ParametresImports = lazy(() => import("./ParametresImports.jsx"));
const ParametresEquipesGarde = lazy(() => import("./ParametresEquipesGarde.jsx"));

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const Parametres = ({ user, tenantSlug }) => {
  // Construire l'API URL avec le tenant
  const API = `${BACKEND_URL}/api/${tenantSlug}`;
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('types-garde');
  const [typesGarde, setTypesGarde] = useState([]);
  const [formations, setFormations] = useState([]);
  const [competences, setCompetences] = useState([]);
  const [grades, setGrades] = useState([]);
  const [users, setUsers] = useState([]);
  const [episTypes, setEpisTypes] = useState([]);
  const [selectedUserEpi, setSelectedUserEpi] = useState(null);
  const [epiAlerts, setEpiAlerts] = useState([]);
  const [showPasswordComptes, setShowPasswordComptes] = useState(false);

  
  // Modals states
  const [showCreateTypeModal, setShowCreateTypeModal] = useState(false);
  const [showEditTypeModal, setShowEditTypeModal] = useState(false);
  const [showCreateFormationModal, setShowCreateFormationModal] = useState(false);
  const [showEditFormationModal, setShowEditFormationModal] = useState(false);
  const [showCreateGradeModal, setShowCreateGradeModal] = useState(false);
  const [showEditGradeModal, setShowEditGradeModal] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showEditAccessModal, setShowEditAccessModal] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [showEpiModal, setShowEpiModal] = useState(false);
  const [showEpiReportModal, setShowEpiReportModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [userAccess, setUserAccess] = useState({
    role: '',
    statut: ''
  });
  
  // Edit form state for types garde
  const [editForm, setEditForm] = useState({
    nom: '',
    heure_debut: '',
    heure_fin: '',
    personnel_requis: 1,
    duree_heures: 8,
    couleur: '#3B82F6',
    jours_application: [],
    officier_obligatoire: false,
    est_garde_externe: false,
    taux_horaire_externe: null,
    competences_requises: []
  });

  // Create form state for new types garde
  const [createForm, setCreateForm] = useState({
    nom: '',
    heure_debut: '08:00',
    heure_fin: '16:00',
    personnel_requis: 1,
    duree_heures: 8,
    couleur: '#3B82F6',
    jours_application: [],
    officier_obligatoire: false,
    est_garde_externe: false,
    taux_horaire_externe: null,
    competences_requises: []
  });

  const [editFormation, setEditFormation] = useState({
    nom: '',
    description: '',
    duree_heures: 8,
    validite_mois: 12,
    obligatoire: false
  });

  const [newFormation, setNewFormation] = useState({
    nom: '',
    description: '',
    duree_heures: 8,
    validite_mois: 12,
    obligatoire: false
  });

  const [newGrade, setNewGrade] = useState({
    nom: '',
    niveau_hierarchique: 1,
    est_officier: false
  });

  const [editGrade, setEditGrade] = useState({
    nom: '',
    niveau_hierarchique: 1,
    est_officier: false
  });

  const [newUser, setNewUser] = useState({
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    contact_urgence: '',
    grade: 'Pompier',
    type_emploi: 'temps_plein',
    role: 'employe',
    numero_employe: '',
    date_embauche: '',
    mot_de_passe: 'motdepasse123'
  });

  const [systemSettings, setSystemSettings] = useState({
    attribution_auto: true,
    notification_email: true,
    max_personnes_contact: 5,
    grade_equivalent: true,
    // Niveaux d'attribution automatique (nouveaux)
    niveau_2_actif: true,  // Temps partiel disponibles
    niveau_3_actif: true,  // Temps partiel stand-by
    niveau_4_actif: true,  // Temps plein incomplets
    niveau_5_actif: true,  // Temps plein complets (heures sup)
    // Nouvelles règles de validation pour remplacements
    privilegier_disponibles: true,
    grade_egal: true,
    competences_egales: true,
    // Paramètres de notification de remplacement
    mode_notification: 'simultane',
    taille_groupe: 3,
    delai_attente_minutes: 1440,
    // Paramètres de disponibilités
    blocage_dispos_active: true,
    jour_blocage_dispos: 15,
    exceptions_admin_superviseur: true,
    admin_peut_modifier_temps_partiel: true,
    notifications_dispos_actives: true,
    jours_avance_notification: 3,
    // Paramètres EPI
    epi_notifications_actives: true,
    epi_jours_avance_expiration: 30,
    epi_jours_avance_inspection: 14
  });

  // Paramètres Formations NFPA 1500
  const [parametresFormations, setParametresFormations] = useState({
    heures_minimales_annuelles: 100,
    pourcentage_presence_minimum: 80,
    delai_notification_liste_attente: 7,
    email_notifications_actif: true
  });


  // Paramètres de validation du planning
  const [validationParams, setValidationParams] = useState({
    frequence: 'mensuel',
    jour_envoi: 25,
    heure_envoi: '17:00',
    periode_couverte: 'mois_suivant',
    envoi_automatique: true,
    derniere_notification: null,
    periode_equite: 'mensuel',
    periode_equite_jours: 30
  });

  // Paramètres de gestion des heures supplémentaires
  const [heuresSupParams, setHeuresSupParams] = useState({
    activer_gestion_heures_sup: false,
    seuil_max_heures: 40,
    periode_calcul_heures: 'semaine',
    jours_periode_personnalisee: 7
  });

  // Paramètres de regroupement des heures
  const [regroupementParams, setRegroupementParams] = useState({
    activer_regroupement_heures: false,
    duree_max_regroupement: 24
  });

  const { toast } = useToast();

  const joursOptions = [
    { value: 'monday', label: 'Lundi' },
    { value: 'tuesday', label: 'Mardi' },
    { value: 'wednesday', label: 'Mercredi' },
    { value: 'thursday', label: 'Jeudi' },
    { value: 'friday', label: 'Vendredi' },
    { value: 'saturday', label: 'Samedi' },
    { value: 'sunday', label: 'Dimanche' }
  ];

  const episTypesDefaut = [
    { 
      id: 'casque',
      nom: 'Casque', 
      icone: '🪖',
      duree_vie_annees: 10,
      inspection_mois: 12,
      tailles: ['XS', 'S', 'M', 'L', 'XL', 'XXL']
    },
    { 
      id: 'bottes',
      nom: 'Bottes', 
      icone: '👢',
      duree_vie_annees: 3,
      inspection_mois: 6,
      tailles: ['39', '40', '41', '42', '43', '44', '45', '46', '47', '48']
    },
    { 
      id: 'veste_bunker',
      nom: 'Veste Bunker', 
      icone: '🧥',
      duree_vie_annees: 10,
      inspection_mois: 12,
      tailles: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']
    },
    { 
      id: 'pantalon_bunker',
      nom: 'Pantalon Bunker', 
      icone: '👖',
      duree_vie_annees: 10,
      inspection_mois: 12,
      tailles: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']
    },
    { 
      id: 'gants',
      nom: 'Gants', 
      icone: '🧤',
      duree_vie_annees: 2,
      inspection_mois: 6,
      tailles: ['XS', 'S', 'M', 'L', 'XL', 'XXL']
    },
    { 
      id: 'masque_apria',
      nom: 'Facial APRIA', 
      icone: '😷',
      duree_vie_annees: 15,
      inspection_mois: 12,
      tailles: ['S', 'M', 'L']
    },
    { 
      id: 'cagoule',
      nom: 'Cagoule Anti-Particules', 
      icone: '🎭',
      duree_vie_annees: 10,
      inspection_mois: 12,
      tailles: ['S', 'M', 'L', 'XL']
    }
  ];

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchData();
      fetchNiveauxAttribution();
    }
  }, [user]);
  
  const fetchNiveauxAttribution = async () => {
    try {
      const response = await axios.get(`${API}/parametres/niveaux-attribution`);
      setSystemSettings(prev => ({
        ...prev,
        ...response.data
      }));
    } catch (error) {
      console.error("Erreur chargement niveaux:", error);
    }
  };

  const handleCreateType = async () => {
    if (!createForm.nom || !createForm.heure_debut || !createForm.heure_fin) {
      toast({
        title: "Champs requis",
        description: "Nom, heure de début et heure de fin sont obligatoires",
        variant: "destructive"
      });
      return;
    }

    try {
      // Calculer automatiquement la durée
      const duree_heures = calculateDuration(createForm.heure_debut, createForm.heure_fin);
      const dataToSend = {
        ...createForm,
        duree_heures
      };
      
      await axios.post(`${API}/types-garde`, dataToSend);
      toast({
        title: "Type de garde créé",
        description: "Le nouveau type de garde a été ajouté avec succès",
        variant: "success"
      });
      setShowCreateTypeModal(false);
      resetCreateForm();
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de créer le type de garde",
        variant: "destructive"
      });
    }
  };

  const resetCreateForm = () => {
    setCreateForm({
      nom: '',
      heure_debut: '08:00',
      heure_fin: '16:00',
      personnel_requis: 1,
      duree_heures: 8,
      couleur: '#3B82F6',
      jours_application: [],
      officier_obligatoire: false
    });
  };

  const handleCreateJourChange = (jour) => {
    const updatedJours = createForm.jours_application.includes(jour)
      ? createForm.jours_application.filter(j => j !== jour)
      : [...createForm.jours_application, jour];
    
    setCreateForm({...createForm, jours_application: updatedJours});
  };

  const handleCreateCompetenceChange = (competenceId) => {
    const updatedCompetences = createForm.competences_requises.includes(competenceId)
      ? createForm.competences_requises.filter(c => c !== competenceId)
      : [...createForm.competences_requises, competenceId];
    
    setCreateForm({...createForm, competences_requises: updatedCompetences});
  };

  const handleEditCompetenceChange = (competenceId) => {
    const updatedCompetences = editForm.competences_requises.includes(competenceId)
      ? editForm.competences_requises.filter(c => c !== competenceId)
      : [...editForm.competences_requises, competenceId];
    
    setEditForm({...editForm, competences_requises: updatedCompetences});
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [typesResponse, formationsResponse, competencesResponse, gradesResponse, usersResponse, validationResponse, paramsFormationsResponse, paramsRemplacementsResponse] = await Promise.all([
        axios.get(`${API}/types-garde`),
        axios.get(`${API}/formations`),
        axios.get(`${API}/competences`),
        axios.get(`${API}/grades`),
        axios.get(`${API}/users`),
        axios.get(`${API}/parametres/validation-planning`).catch(() => ({ data: validationParams })),
        axios.get(`${API}/parametres/formations`).catch(() => ({ data: { heures_minimales_annuelles: 100, delai_notification_liste_attente: 7, email_notifications_actif: true } })),
        axios.get(`${API}/parametres/remplacements`).catch(() => ({ data: null }))
      ]);
      setTypesGarde(typesResponse.data);
      setFormations(formationsResponse.data);
      setCompetences(competencesResponse.data);
      setGrades(gradesResponse.data);
      setUsers(usersResponse.data);
      setValidationParams(validationResponse.data);
      setParametresFormations(paramsFormationsResponse.data);
      
      // Charger les paramètres de remplacements (incluant heures sup)
      if (paramsRemplacementsResponse.data) {
        setHeuresSupParams({
          activer_gestion_heures_sup: paramsRemplacementsResponse.data.activer_gestion_heures_sup || false,
          seuil_max_heures: paramsRemplacementsResponse.data.seuil_max_heures || 40,
          periode_calcul_heures: paramsRemplacementsResponse.data.periode_calcul_heures || 'semaine',
          jours_periode_personnalisee: paramsRemplacementsResponse.data.jours_periode_personnalisee || 7
        });
        
        setRegroupementParams({
          activer_regroupement_heures: paramsRemplacementsResponse.data.activer_regroupement_heures || false,
          duree_max_regroupement: paramsRemplacementsResponse.data.duree_max_regroupement || 24
        });
        
        // Charger aussi les autres paramètres de remplacements dans systemSettings
        setSystemSettings(prev => ({
          ...prev,
          mode_notification: paramsRemplacementsResponse.data.mode_notification || 'simultane',
          delai_attente_minutes: paramsRemplacementsResponse.data.delai_attente_heures * 60 || 1440,
          max_personnes_contact: paramsRemplacementsResponse.data.max_contacts || 5
        }));
      }
    } catch (error) {
      console.error('Erreur lors du chargement des paramètres:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditType = (type) => {
    setEditingItem(type);
    setEditForm({
      nom: type.nom,
      heure_debut: type.heure_debut,
      heure_fin: type.heure_fin,
      personnel_requis: type.personnel_requis,
      duree_heures: type.duree_heures,
      couleur: type.couleur,
      jours_application: type.jours_application || [],
      officier_obligatoire: type.officier_obligatoire || false,
      est_garde_externe: type.est_garde_externe || false,
      taux_horaire_externe: type.taux_horaire_externe || null,
      competences_requises: type.competences_requises || []
    });
    setShowEditTypeModal(true);
  };

  // Fonction pour calculer automatiquement la durée en heures
  const calculateDuration = (heure_debut, heure_fin) => {
    if (!heure_debut || !heure_fin) return 0;
    
    const [startH, startM] = heure_debut.split(':').map(Number);
    const [endH, endM] = heure_fin.split(':').map(Number);
    
    let startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;
    
    // Si fin < début, c'est une garde qui passe minuit
    if (endMinutes <= startMinutes) {
      endMinutes += 24 * 60; // Ajouter 24h
    }
    
    const durationMinutes = endMinutes - startMinutes;
    return durationMinutes / 60; // Convertir en heures
  };

  const handleUpdateType = async () => {
    if (!editForm.nom || !editForm.heure_debut || !editForm.heure_fin) {
      toast({
        title: "Champs requis",
        description: "Nom, heure de début et heure de fin sont obligatoires",
        variant: "destructive"
      });
      return;
    }

    try {
      // Calculer automatiquement la durée
      const duree_heures = calculateDuration(editForm.heure_debut, editForm.heure_fin);
      const dataToSend = {
        ...editForm,
        duree_heures
      };
      
      console.log('Updating type with data:', dataToSend);
      const response = await axios.put(`${API}/types-garde/${editingItem.id}`, dataToSend);
      console.log('Update response:', response.data);
      
      toast({
        title: "Type mis à jour",
        description: "Les modifications ont été sauvegardées",
        variant: "success"
      });
      setShowEditTypeModal(false);
      fetchData();
    } catch (error) {
      console.error('Update error:', error);
      toast({
        title: "Erreur de modification",
        description: error.response?.data?.detail || "Impossible de mettre à jour le type de garde",
        variant: "destructive"
      });
    }
  };

  const handleDeleteType = async (typeId) => {
    if (!window.confirm("Supprimer ce type de garde ?")) return;
    
    try {
      await axios.delete(`${API}/types-garde/${typeId}`);
      toast({
        title: "Supprimé",
        description: "Type de garde supprimé avec succès",
        variant: "success"
      });
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer",
        variant: "destructive"
      });
    }
  };

  const handleEditFormation = (formation) => {
    setEditingItem(formation);
    setEditFormation({
      nom: formation.nom,
      description: formation.description,
      duree_heures: formation.duree_heures,
      validite_mois: formation.validite_mois,
      obligatoire: formation.obligatoire
    });
    setShowEditFormationModal(true);
  };

  const handleUpdateFormation = async () => {
    try {
      await axios.put(`${API}/formations/${editingItem.id}`, editFormation);
      toast({
        title: "Formation mise à jour",
        description: "Les modifications ont été sauvegardées",
        variant: "success"
      });
      setShowEditFormationModal(false);
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour la formation",
        variant: "destructive"
      });
    }
  };

  const handleCreateFormation = async () => {
    if (!newFormation.nom) {
      toast({
        title: "Champs requis",
        description: "Le nom de la formation est obligatoire",
        variant: "destructive"
      });
      return;
    }

    try {
      await axios.post(`${API}/formations`, newFormation);
      toast({
        title: "Formation créée",
        description: "La nouvelle formation a été ajoutée avec succès",
        variant: "success"
      });
      setShowCreateFormationModal(false);
      resetNewFormation();
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de créer la formation",
        variant: "destructive"
      });
    }
  };


  const handleCreateCompetence = async () => {
    if (!newFormation.nom) {
      toast({
        title: "Champs requis",
        description: "Le nom de la compétence est obligatoire",
        variant: "destructive"
      });
      return;
    }

    try {
      const competenceData = {
        nom: newFormation.nom,
        description: newFormation.description || '',
        heures_requises_annuelles: newFormation.duree_heures || 0,
        obligatoire: newFormation.obligatoire || false
      };
      
      await axios.post(`${API}/competences`, competenceData);
      toast({
        title: "Compétence créée",
        description: "La nouvelle compétence a été ajoutée avec succès",
        variant: "success"
      });
      setShowCreateFormationModal(false);
      resetNewFormation();
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de créer la compétence",
        variant: "destructive"
      });
    }
  };

  const handleEditCompetence = (competence) => {
    setEditingItem(competence);
    setEditFormation({
      nom: competence.nom,
      description: competence.description,
      duree_heures: competence.heures_requises_annuelles || 0,
      validite_mois: 12, // not used for competences
      obligatoire: competence.obligatoire
    });
    setShowEditFormationModal(true);
  };

  const handleUpdateCompetence = async () => {
    try {
      const competenceData = {
        nom: editFormation.nom,
        description: editFormation.description || '',
        heures_requises_annuelles: editFormation.duree_heures || 0,
        obligatoire: editFormation.obligatoire || false
      };

      await axios.put(`${API}/competences/${editingItem.id}`, competenceData);
      toast({
        title: "Compétence mise à jour",
        description: "Les modifications ont été sauvegardées",
        variant: "success"
      });
      setShowEditFormationModal(false);
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour la compétence",
        variant: "destructive"
      });
    }
  };

  const handleDeleteCompetence = async (competenceId) => {
    if (!window.confirm("Supprimer cette compétence ?")) return;
    
    try {
      await axios.delete(`${API}/competences/${competenceId}`);
      toast({
        title: "Compétence supprimée",
        description: "La compétence a été supprimée avec succès",
        variant: "success"
      });
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la compétence",
        variant: "destructive"
      });
    }
  };

  // ========== GRADES CRUD FUNCTIONS ==========

  const handleCreateGrade = async () => {
    if (!newGrade.nom) {
      toast({
        title: "Champs requis",
        description: "Le nom du grade est obligatoire",
        variant: "destructive"
      });
      return;
    }

    try {
      await axios.post(`${API}/grades`, newGrade);
      toast({
        title: "Grade créé",
        description: "Le nouveau grade a été ajouté avec succès",
        variant: "success"
      });
      setShowCreateGradeModal(false);
      resetNewGrade();
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de créer le grade",
        variant: "destructive"
      });
    }
  };

  const handleEditGrade = (grade) => {
    setEditingItem(grade);
    setEditGrade({
      nom: grade.nom,
      niveau_hierarchique: grade.niveau_hierarchique,
      est_officier: grade.est_officier || false
    });
    setShowEditGradeModal(true);
  };

  const handleUpdateGrade = async () => {
    try {
      await axios.put(`${API}/grades/${editingItem.id}`, editGrade);
      toast({
        title: "Grade mis à jour",
        description: "Les modifications ont été sauvegardées",
        variant: "success"
      });
      setShowEditGradeModal(false);
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour le grade",
        variant: "destructive"
      });
    }
  };

  const handleDeleteGrade = async (gradeId) => {
    if (!window.confirm("Supprimer ce grade ?")) return;
    
    try {
      await axios.delete(`${API}/grades/${gradeId}`);
      toast({
        title: "Grade supprimé",
        description: "Le grade a été supprimé avec succès",
        variant: "success"
      });
      fetchData();
    } catch (error) {
      const errorMessage = error.response?.data?.detail || "Impossible de supprimer le grade";
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const resetNewGrade = () => {
    setNewGrade({
      nom: '',
      niveau_hierarchique: 1
    });
  };

  // ========== END GRADES CRUD FUNCTIONS ==========

  const resetNewFormation = () => {
    setNewFormation({
      nom: '',
      description: '',
      duree_heures: 8,
      validite_mois: 12,
      obligatoire: false
    });
  };

  const handleDeleteFormation = async (formationId) => {
    if (!window.confirm("Supprimer cette formation ?")) return;
    
    try {
      await axios.delete(`${API}/formations/${formationId}`);
      toast({
        title: "Formation supprimée",
        description: "La formation a été supprimée avec succès",
        variant: "success"
      });
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la formation",
        variant: "destructive"
      });
    }
  };

  const handleJourChange = (jour) => {
    const updatedJours = editForm.jours_application.includes(jour)
      ? editForm.jours_application.filter(j => j !== jour)
      : [...editForm.jours_application, jour];
    
    setEditForm({...editForm, jours_application: updatedJours});
  };

  const handleSettingChange = async (setting, value) => {
    setSystemSettings(prev => ({
      ...prev,
      [setting]: value
    }));
    
    // Sauvegarder dans le backend si c'est un niveau d'attribution
    if (setting.startsWith('niveau_')) {
      try {
        await axios.put(`${API}/parametres/niveaux-attribution`, {
          [setting]: value
        });
        toast({
          title: "Paramètre mis à jour",
          description: "La configuration a été sauvegardée",
          variant: "success"
        });
      } catch (error) {
        console.error("Erreur sauvegarde niveau:", error);
        toast({
          title: "Erreur",
          description: "Impossible de sauvegarder la configuration",
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "Paramètre mis à jour",
        description: "La configuration a été sauvegardée",
        variant: "success"
      });
    }
  };

  const handleValidationChange = (setting, value) => {
    setValidationParams(prev => ({
      ...prev,
      [setting]: value
    }));
  };

  const handleSaveValidationParams = async () => {
    try {
      await axios.put(`${API}/parametres/validation-planning`, validationParams);
      toast({
        title: "Configuration sauvegardée",
        description: "Les paramètres de validation ont été enregistrés avec succès",
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de sauvegarder la configuration",
        variant: "destructive"
      });
    }
  };


  const handleSaveDisponibilitesParams = async () => {
    try {
      const paramsToSave = {
        jour_blocage_dispos: systemSettings.jour_blocage_dispos,
        exceptions_admin_superviseur: systemSettings.exceptions_admin_superviseur,
        admin_peut_modifier_temps_partiel: systemSettings.admin_peut_modifier_temps_partiel,
        notifications_dispos_actives: systemSettings.notifications_dispos_actives,
        jours_avance_notification: systemSettings.jours_avance_notification
      };
      
      await axios.put(`${API}/parametres/disponibilites`, paramsToSave);
      toast({
        title: "Configuration sauvegardée",
        description: "Les paramètres de disponibilités ont été enregistrés",
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de sauvegarder",
        variant: "destructive"
      });
    }
  };


  const handleSendNotificationsManually = async () => {
    try {
      // Calculer les dates selon la période configurée
      const today = new Date();
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const endOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      
      const periode_debut = nextMonth.toISOString().split('T')[0];
      const periode_fin = endOfNextMonth.toISOString().split('T')[0];
      
      const response = await axios.post(`${API}/planning/envoyer-notifications`, null, {
        params: { periode_debut, periode_fin }
      });
      
      // Mettre à jour la dernière notification
      await axios.get(`${API}/parametres/validation-planning`).then(res => {
        setValidationParams(res.data);
      });
      
      toast({
        title: "Notifications envoyées",
        description: `${response.data.emails_envoyes} emails envoyés avec succès`,
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Erreur d'envoi",
        description: error.response?.data?.detail || "Impossible d'envoyer les notifications",
        variant: "destructive"
      });
    }
  };

  const handleSaveHeuresSupParams = async () => {
    try {
      // Récupérer d'abord les paramètres de remplacements existants
      const existingParams = await axios.get(`${API}/parametres/remplacements`).catch(() => ({ data: null }));
      
      // Fusionner avec les nouveaux paramètres d'heures sup et regroupement
      const updatedParams = {
        ...(existingParams.data || {}),
        ...heuresSupParams,
        ...regroupementParams
      };
      
      await axios.put(`${API}/parametres/remplacements`, updatedParams);
      toast({
        title: "Configuration sauvegardée",
        description: "Les paramètres ont été enregistrés avec succès",
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de sauvegarder les paramètres",
        variant: "destructive"
      });
    }
  };

  const validatePassword = (password) => {
    if (password.length < 8) return false;
    const hasUppercase = /[A-Z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*+\-?()]/.test(password);
    return hasUppercase && hasDigit && hasSpecial;
  };

  const handleCreateUser = async () => {
    if (!newUser.nom || !newUser.prenom || !newUser.email || !newUser.mot_de_passe) {
      toast({
        title: "Champs requis",
        description: "Nom, prénom, email et mot de passe sont obligatoires",
        variant: "destructive"
      });
      return;
    }

    if (!validatePassword(newUser.mot_de_passe)) {
      toast({
        title: "Mot de passe invalide",
        description: "Le mot de passe doit contenir 8 caractères, une majuscule, un chiffre et un caractère spécial (!@#$%^&*+-?())",
        variant: "destructive"
      });
      return;
    }

    try {
      const userToCreate = {
        ...newUser,
        numero_employe: newUser.numero_employe || `${newUser.role.toUpperCase()}${String(Date.now()).slice(-3)}`,
        date_embauche: newUser.date_embauche || new Date().toLocaleDateString('fr-FR'),
        formations: []
      };

      await axios.post(`${API}/users`, userToCreate);
      toast({
        title: "Compte créé avec succès",
        description: "Un email de bienvenue a été envoyé avec les informations de connexion",
        variant: "success"
      });
      setShowCreateUserModal(false);
      resetNewUser();
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de créer le compte",
        variant: "destructive"
      });
    }
  };

  const handleEditAccess = (user) => {
    setEditingUser(user);
    setUserAccess({
      role: user.role,
      statut: user.statut
    });
    setShowEditAccessModal(true);
  };

  const handleUpdateAccess = async () => {
    try {
      await axios.put(`${API}/users/${editingUser.id}/access?role=${userAccess.role}&statut=${userAccess.statut}`);
      toast({
        title: "Accès modifié",
        description: "Les permissions de l'utilisateur ont été mises à jour",
        variant: "success"
      });
      setShowEditAccessModal(false);
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de modifier l'accès",
        variant: "destructive"
      });
    }
  };

  const handleRevokeUser = async (userId, userName) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir révoquer définitivement le compte de ${userName} ?\n\nCette action supprimera :\n- Le compte utilisateur\n- Toutes ses disponibilités\n- Ses assignations\n- Ses demandes de remplacement\n\nCette action est IRRÉVERSIBLE.`)) {
      return;
    }

    try {
      await axios.delete(`${API}/users/${userId}/revoke`);
      toast({
        title: "Compte révoqué",
        description: "Le compte et toutes les données associées ont été supprimés définitivement",
        variant: "success"
      });
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de révoquer le compte",
        variant: "destructive"
      });
    }
  };

  const resetNewUser = () => {
    setNewUser({
      nom: '',
      prenom: '',
      email: '',
      telephone: '',
      contact_urgence: '',
      grade: 'Pompier',
      type_emploi: 'temps_plein',
      role: 'employe',
      numero_employe: '',
      date_embauche: '',
      mot_de_passe: 'motdepasse123'
    });
  };

  if (user?.role !== 'admin') {
    return (
      <div className="access-denied">
        <h1>Accès refusé</h1>
        <p>Cette section est réservée aux administrateurs.</p>
      </div>
    );
  }

  if (loading) return <div className="loading" data-testid="parametres-loading">Chargement...</div>;

  return (
    <div className="parametres-harmonized">
      {/* Header Harmonisé */}
      <div className="module-header">
        <div>
          <h1 data-testid="parametres-title">⚙️ Paramètres du système</h1>
          <p>Configuration complète de ProFireManager - Gérez tous les aspects de votre caserne</p>
        </div>
      </div>

      {/* Navigation par GRILLE DE CARTES */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '20px',
        marginBottom: '30px',
        padding: '0 10px'
      }}>
        {[
          { id: 'types-garde', icon: '🚒', title: 'Gardes', desc: 'Types de gardes' },
          { id: 'competences', icon: '📜', title: 'Compétences', desc: 'Certifications' },
          { id: 'grades', icon: '🎖️', title: 'Grades', desc: 'Hiérarchie' },
          { id: 'attribution', icon: '📅', title: 'Planning', desc: 'Attribution auto' },
          { id: 'comptes', icon: '👥', title: 'Comptes', desc: 'Utilisateurs' },
          { id: 'remplacements', icon: '🔄', title: 'Remplacements', desc: 'Règles' },
          { id: 'disponibilites', icon: '📅', title: 'Disponibilités', desc: 'Configuration' },
          { id: 'formations', icon: '📚', title: 'Formations', desc: 'NFPA 1500' },
          { id: 'personnalisation', icon: '🎨', title: 'Personnalisation', desc: 'Logo et branding' },
          { id: 'imports', icon: '📥', title: 'Imports CSV', desc: 'Import en masse' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`param-card ${activeTab === tab.id ? 'active' : ''}`}
            style={{
              background: activeTab === tab.id ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' : 'white',
              border: activeTab === tab.id ? '2px solid #dc2626' : '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '20px',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              textAlign: 'left',
              boxShadow: activeTab === tab.id ? '0 8px 16px rgba(220, 38, 38, 0.2)' : '0 2px 4px rgba(0,0,0,0.05)',
              transform: activeTab === tab.id ? 'scale(1.02)' : 'scale(1)'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            <div style={{
              fontSize: '2rem',
              marginBottom: '10px',
              filter: activeTab === tab.id ? 'brightness(0) invert(1)' : 'none'
            }}>
              {tab.icon}
            </div>
            <div style={{
              fontWeight: '600',
              fontSize: '1.1rem',
              color: activeTab === tab.id ? 'white' : '#1e293b',
              marginBottom: '4px'
            }}>
              {tab.title}
            </div>
            <div style={{
              fontSize: '0.875rem',
              color: activeTab === tab.id ? 'rgba(255,255,255,0.9)' : '#64748b'
            }}>
              {tab.desc}
            </div>
          </button>
        ))}
      </div>

      {/* Contenu conditionnel selon l'onglet actif */}
      <div className="tab-content">
        {activeTab === 'types-garde' && (
          <div className="types-garde-tab">
            <div className="tab-header">
              <div>
                <h2>Paramétrage des gardes</h2>
                <p>Créez et modifiez les types de gardes disponibles</p>
              </div>
              <Button 
                variant="default" 
                onClick={() => setShowCreateTypeModal(true)}
                data-testid="create-type-garde-btn"
              >
                + Nouveau Type de Garde
              </Button>
            </div>

            <div className="types-garde-grid">
              {typesGarde.map(type => (
                <div key={type.id} className="type-garde-card" data-testid={`type-garde-${type.id}`}>
                  <div className="type-garde-header">
                    <div className="type-info">
                      <h3>{type.nom}</h3>
                      <div className="type-schedule">
                        <span>⏰ {type.heure_debut} - {type.heure_fin}</span>
                        <span>👥 {type.personnel_requis} personnel</span>
                        {type.officier_obligatoire && <span>🎖️ Officier requis</span>}
                        {type.est_garde_externe && <span className="badge-externe">🏠 Garde Externe</span>}
                      </div>
                    </div>
                    <div className="type-actions">
                      <Button 
                        variant="ghost" 
                        onClick={() => handleEditType(type)}
                        data-testid={`edit-type-${type.id}`}
                      >
                        ✏️ Modifier
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="danger" 
                        onClick={() => handleDeleteType(type.id)}
                        data-testid={`delete-type-${type.id}`}
                      >
                        🗑️ Supprimer
                      </Button>
                    </div>
                  </div>
                  <div className="type-details">
                    <span className="color-preview" style={{ backgroundColor: type.couleur }}></span>
                    <span>Couleur: {type.couleur}</span>
                    {type.jours_application?.length > 0 && (
                      <div className="type-days">
                        <span>📅 Jours: {type.jours_application.join(', ')}</span>
                      </div>
                    )}
                    {type.est_garde_externe && type.taux_horaire_externe && (
                      <div className="type-taux">
                        <span>💰 Taux externe: {type.taux_horaire_externe}$/h</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'competences' && (
          <div className="competences-tab">
            <div className="tab-header">
              <div>
                <h2>Gestion des compétences</h2>
                <p>Définissez les compétences et certifications requises pour évaluer le niveau des employés</p>
              </div>
              <Button 
                variant="default" 
                onClick={() => setShowCreateFormationModal(true)}
                data-testid="create-competence-btn"
              >
                + Nouvelle Compétence
              </Button>
            </div>

            <div className="competences-grid">
              {competences.map(competence => (
                <div key={competence.id} className="competence-card" data-testid={`competence-${competence.id}`}>
                  <div className="competence-header">
                    <div className="competence-info">
                      <h3>{competence.nom}</h3>
                      <p className="competence-description">{competence.description}</p>
                      <div className="competence-details">
                        <span className="detail-item">⏱️ {competence.heures_requises_annuelles || 0}h requises/an</span>
                        {competence.obligatoire && (
                          <span className="detail-item obligatoire-indicator">⚠️ COMPÉTENCE OBLIGATOIRE</span>
                        )}
                      </div>
                    </div>
                    <div className="competence-actions">
                      <Button 
                        variant="ghost" 
                        onClick={() => handleEditCompetence(competence)}
                        data-testid={`edit-competence-${competence.id}`}
                        title="Modifier cette compétence"
                      >
                        ✏️ Modifier
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="danger" 
                        onClick={() => handleDeleteCompetence(competence.id)}
                        data-testid={`delete-competence-${competence.id}`}
                        title="Supprimer cette compétence"
                      >
                        🗑️ Supprimer
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'grades' && (
          <div className="grades-tab">
            <div className="tab-header">
              <div>
                <h2>Gestion des grades</h2>
                <p>Définissez les grades hiérarchiques utilisés dans votre organisation</p>
              </div>
              <Button 
                variant="default" 
                onClick={() => setShowCreateGradeModal(true)}
                data-testid="create-grade-btn"
              >
                + Nouveau Grade
              </Button>
            </div>

            <div className="grades-grid">
              {grades.map(grade => (
                <div key={grade.id} className="grade-card" data-testid={`grade-${grade.id}`}>
                  <div className="grade-header">
                    <div className="grade-info">
                      <h3>
                        {grade.nom}
                        {grade.est_officier && <span className="badge-officier">👮 Officier</span>}
                      </h3>
                      <div className="grade-details">
                        <span className="detail-item">📊 Niveau hiérarchique: {grade.niveau_hierarchique}</span>
                      </div>
                    </div>
                    <div className="grade-actions">
                      <Button 
                        variant="ghost" 
                        onClick={() => handleEditGrade(grade)}
                        data-testid={`edit-grade-${grade.id}`}
                        title="Modifier ce grade"
                      >
                        ✏️ Modifier
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="danger" 
                        onClick={() => handleDeleteGrade(grade.id)}
                        data-testid={`delete-grade-${grade.id}`}
                        title="Supprimer ce grade"
                      >
                        🗑️ Supprimer
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}


        {activeTab === 'attribution' && (
          <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Chargement...</div>}>
            <ParametresAttribution
              systemSettings={systemSettings}
              validationParams={validationParams}
              heuresSupParams={heuresSupParams}
              regroupementParams={regroupementParams}
              handleSettingChange={handleSettingChange}
              handleValidationChange={handleValidationChange}
              handleSaveValidationParams={handleSaveValidationParams}
              handleSendNotificationsManually={handleSendNotificationsManually}
              handleSaveHeuresSupParams={handleSaveHeuresSupParams}
              setHeuresSupParams={setHeuresSupParams}
              setRegroupementParams={setRegroupementParams}
            />
          </Suspense>
        )}

        {activeTab === 'comptes' && (
          <div className="comptes-tab">
            <div className="tab-header">
              <div>
                <h2>Comptes d'Accès</h2>
                <p>Gestion des utilisateurs et permissions</p>
              </div>
              <Button 
                variant="default" 
                onClick={() => setShowCreateUserModal(true)}
                data-testid="create-user-account-btn"
              >
                + Nouveau Compte
              </Button>
            </div>
            
            <div className="accounts-stats">
              <div className="account-stat">
                <span className="stat-number">{users.filter(u => u.role === 'admin').length}</span>
                <span className="stat-label">Administrateurs</span>
              </div>
              <div className="account-stat">
                <span className="stat-number">{users.filter(u => u.role === 'superviseur').length}</span>
                <span className="stat-label">Superviseurs</span>
              </div>
              <div className="account-stat">
                <span className="stat-number">{users.filter(u => u.role === 'employe').length}</span>
                <span className="stat-label">Employés</span>
              </div>
            </div>

            {/* Liste des utilisateurs existants */}
            <div className="existing-users-section">
              <h3>Utilisateurs existants</h3>
              <div className="users-list">
                {users.map(user => (
                  <div key={user.id} className="user-access-card" data-testid={`user-access-${user.id}`}>
                    <div className="user-access-info">
                      <div className="user-avatar">
                        <span className="avatar-icon">👤</span>
                      </div>
                      <div className="user-details">
                        <h4>{user.prenom} {user.nom}</h4>
                        <p className="user-email">{user.email}</p>
                        <div className="user-badges">
                          <span className={`role-badge ${user.role}`}>
                            {user.role === 'admin' ? '👑 Administrateur' : 
                             user.role === 'superviseur' ? '🎖️ Superviseur' : 
                             '👤 Employé'}
                          </span>
                          <span className="grade-badge">{user.grade}</span>
                          <span className="employment-badge">{user.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="user-access-actions">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleEditAccess(user)}
                        data-testid={`modify-access-${user.id}`}
                      >
                        ✏️ Modifier accès
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="danger" 
                        onClick={() => handleRevokeUser(user.id, `${user.prenom} ${user.nom}`)}
                        data-testid={`revoke-access-${user.id}`}
                      >
                        🚫 Révoquer
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="role-descriptions">
              <div className="role-card admin">
                <h3>👑 Administrateur</h3>
                <ul>
                  <li>Accès complet à tous les modules</li>
                  <li>Gestion du personnel et comptes</li>
                  <li>Configuration système</li>
                </ul>
              </div>
              <div className="role-card superviseur">
                <h3>🎖️ Superviseur</h3>
                <ul>
                  <li>Gestion du personnel</li>
                  <li>Validation du planning</li>
                  <li>Approbation des remplacements</li>
                </ul>
              </div>
              <div className="role-card employe">
                <h3>👤 Employé</h3>
                <ul>
                  <li>Consultation du planning</li>
                  <li>Demandes de remplacement</li>
                  <li>Gestion des disponibilités</li>
                </ul>
              </div>
            </div>
          </div>
        )}


        {activeTab === 'remplacements' && (
          <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Chargement...</div>}>
            <ParametresRemplacements
              systemSettings={systemSettings}
              handleSettingChange={handleSettingChange}
            />
          </Suspense>
        )}

        {activeTab === 'disponibilites' && (
          <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Chargement...</div>}>
            <ParametresDisponibilites
              systemSettings={systemSettings}
              handleSettingChange={handleSettingChange}
              handleSaveDisponibilitesParams={handleSaveDisponibilitesParams}
            />
          </Suspense>
        )}

        
        {activeTab === 'formations' && (
          <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Chargement...</div>}>
            <ParametresFormations
              parametresFormations={parametresFormations}
              setParametresFormations={setParametresFormations}
              onSave={async () => {
                try {
                  await axios.put(`${API}/parametres/formations`, parametresFormations);
                  toast({
                    title: "Succès",
                    description: "Paramètres formations sauvegardés",
                    variant: "success"
                  });
                } catch (error) {
                  toast({
                    title: "Erreur",
                    description: "Impossible de sauvegarder",
                    variant: "destructive"
                  });
                }
              }}
            />
          </Suspense>
        )}

        {/* Nouvel onglet: Imports CSV */}
        {activeTab === 'imports' && (
          <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Chargement...</div>}>
            <ParametresImports
              tenantSlug={tenantSlug}
              toast={toast}
            />
          </Suspense>
        )}

        {/* Onglet Personnalisation */}
        {activeTab === 'personnalisation' && (
          <Personnalisation tenantSlug={tenantSlug} toast={toast} />
        )}

      </div>
    </div>
  );
}

export default Parametres;
