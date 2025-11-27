import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";
import { useToast } from "../hooks/use-toast";
import { buildApiUrl } from "../utils/api";
import ImportCSVEPI from "./ImportCSVEPI.jsx";
import ImportCSVPersonnel from "./ImportCSVPersonnel.jsx";
import ImportCSVRapports from "./ImportCSVRapports.jsx";
import ImportCSVDisponibilites from "./ImportCSVDisponibilites.jsx";
import Personnalisation from "./Personnalisation.jsx";

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
    }
  }, [user]);

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

  const handleSettingChange = (setting, value) => {
    setSystemSettings(prev => ({
      ...prev,
      [setting]: value
    }));
    toast({
      title: "Paramètre mis à jour",
      description: "La configuration a été sauvegardée",
      variant: "success"
    });
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
          { id: 'epi', icon: '🛡️', title: 'EPI', desc: 'Équipements' },
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
          <div className="attribution-tab" style={{ maxWidth: '1400px', margin: '0 auto' }}>
            <div className="tab-header" style={{ marginBottom: '30px' }}>
              <div>
                <h2>⚙️ Configuration du Planning</h2>
                <p style={{ color: '#64748b' }}>Paramétrez l'attribution automatique, les heures supplémentaires et le regroupement</p>
              </div>
            </div>
            
            {/* Grille de sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* CARTE 1: Algorithme d'attribution */}
              <div style={{
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
              }}>
                <h3 style={{ 
                  margin: '0 0 16px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '1.25rem',
                  color: '#1e293b'
                }}>
                  🤖 Algorithme d'assignation automatique
                  <span 
                    title="L'algorithme assigne automatiquement les employés selon 5 niveaux de priorité dans l'ordre suivant"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: '#3b82f6',
                      color: 'white',
                      fontSize: '0.75rem',
                      cursor: 'help',
                      fontWeight: 'bold'
                    }}
                  >
                    i
                  </span>
                </h3>
                <div className="priority-list">
                  <div className="priority-item">
                    <span className="priority-number">1</span>
                    <div className="priority-content">
                      <span className="priority-text">👤 Assignations manuelles privilégiées</span>
                      <span className="priority-description">Les assignations manuelles ne sont jamais écrasées</span>
                    </div>
                    <span className="priority-status active">✅ Actif</span>
                  </div>
                  
                  <div className="priority-item">
                    <span className="priority-number">2</span>
                    <div className="priority-content">
                      <span className="priority-text">✅ Respecter les disponibilités</span>
                      <span className="priority-description">Temps partiel : doit avoir déclaré une disponibilité. Temps plein : éligible automatiquement</span>
                    </div>
                    <span className="priority-status active">✅ Actif</span>
                  </div>
                  
                  <div className="priority-item">
                    <span className="priority-number">3</span>
                    <div className="priority-content">
                      <span className="priority-text">🎖️ Respecter les grades requis</span>
                      <span className="priority-description">Assignation d'un officier si configuré pour le type de garde</span>
                    </div>
                    <span className="priority-status active">✅ Actif</span>
                  </div>
                  
                  <div className="priority-item">
                    <span className="priority-number">4</span>
                    <div className="priority-content">
                      <span className="priority-text">⚖️ Rotation équitable du personnel</span>
                      <span className="priority-description">Favorise les employés avec moins d'heures dans le mois</span>
                    </div>
                    <span className="priority-status active">✅ Actif</span>
                  </div>
                  
                  <div className="priority-item">
                    <span className="priority-number">5</span>
                    <div className="priority-content">
                      <span className="priority-text">📅 Ancienneté des employés</span>
                      <span className="priority-description">En cas d'égalité d'heures, privilégier l'ancienneté (date d'embauche)</span>
                    </div>
                    <span className="priority-status active">✅ Actif</span>
                  </div>
                </div>
              </div>

              <div className="algorithm-details">
                <h3>Détails de l'algorithme</h3>
                <div className="details-grid">
                  <div className="detail-card">
                    <h4>🎯 Temps partiel</h4>
                    <p>Doit déclarer disponibilité</p>
                    <small>Vérification obligatoire des créneaux disponibles</small>
                  </div>
                  
                  <div className="detail-card">
                    <h4>🏢 Temps plein</h4>
                    <p>Éligible automatiquement</p>
                    <small>Agit comme backup si pas assez de temps partiel</small>
                  </div>
                  
                  <div className="detail-card">
                    <h4>📊 Calcul équitable</h4>
                    <p>Cumul mensuel des heures</p>
                    <small>Priorité à ceux avec moins d'heures assignées</small>
                  </div>
                  
                  <div className="detail-card">
                    <h4>📅 Ancienneté</h4>
                    <p>Basée sur date d'embauche</p>
                    <small>Plus ancien = priorité en cas d'égalité d'heures</small>
                  </div>
                  
                  <div className="detail-card">
                    <h4>⚙️ Déclenchement</h4>
                    <p>Bouton "Attribution auto"</p>
                    <small>Processus sur demande dans le module Planning</small>
                  </div>
                  
                  <div className="detail-card">
                    <h4>🔍 Audit</h4>
                    <p>Traçabilité complète</p>
                    <small>Cliquez sur une garde pour voir le détail de sélection</small>
                  </div>
                </div>
              </div>

              <div className="settings-toggles">
                <h3>Paramètres généraux</h3>
                <div className="toggle-list">
                  <label className="setting-toggle">
                    <div className="toggle-info">
                      <span>Attribution automatique activée</span>
                      <small>Active l'algorithme intelligent à 5 niveaux</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={systemSettings.attribution_auto}
                      onChange={(e) => handleSettingChange('attribution_auto', e.target.checked)}
                    />
                  </label>
                  
                  <label className="setting-toggle">
                    <div className="toggle-info">
                      <span>Notification par email</span>
                      <small>Envoie un email pour chaque nouvelle assignation</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={systemSettings.notification_email}
                      onChange={(e) => handleSettingChange('notification_email', e.target.checked)}
                    />
                  </label>
                </div>
              </div>
              </div>

              {/* CARTE 2: Validation du Planning */}
              <div style={{
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
              }}>
                <h3 style={{ 
                  margin: '0 0 16px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '1.25rem',
                  color: '#1e293b'
                }}>
                  📅 Validation et Notification du Planning
                  <span 
                    title="Configure les emails automatiques envoyés aux employés pour les informer de leurs gardes assignées"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: '#3b82f6',
                      color: 'white',
                      fontSize: '0.75rem',
                      cursor: 'help',
                      fontWeight: 'bold'
                    }}
                  >
                    i
                  </span>
                </h3>
                
                <div className="validation-params-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                  <div className="param-card" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1e293b' }}>
                      Fréquence
                    </label>
                    <select 
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      value={validationParams.frequence || 'mensuel'}
                      onChange={(e) => handleValidationChange('frequence', e.target.value)}
                    >
                      <option value="mensuel">Mensuel</option>
                      <option value="hebdomadaire">Hebdomadaire</option>
                      <option value="personnalise">Personnalisé</option>
                    </select>
                    <small style={{ color: '#64748b' }}>Fréquence d'envoi automatique</small>
                  </div>

                  <div className="param-card" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1e293b' }}>
                      {validationParams.frequence === 'mensuel' ? 'Jour du mois' : 'Jour de la semaine'}
                    </label>
                    {validationParams.frequence === 'mensuel' ? (
                      <input 
                        type="number"
                        min="1"
                        max="31"
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        value={validationParams.jour_envoi || 25}
                        onChange={(e) => handleValidationChange('jour_envoi', parseInt(e.target.value))}
                      />
                    ) : (
                      <select 
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                        value={validationParams.jour_envoi || 'vendredi'}
                        onChange={(e) => handleValidationChange('jour_envoi', e.target.value)}
                      >
                        <option value="lundi">Lundi</option>
                        <option value="mardi">Mardi</option>
                        <option value="mercredi">Mercredi</option>
                        <option value="jeudi">Jeudi</option>
                        <option value="vendredi">Vendredi</option>
                      </select>
                    )}
                    <small style={{ color: '#64748b' }}>Jour d'envoi des notifications</small>
                  </div>

                  <div className="param-card" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1e293b' }}>
                      Heure d'envoi
                    </label>
                    <input 
                      type="time"
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      value={validationParams.heure_envoi || '17:00'}
                      onChange={(e) => handleValidationChange('heure_envoi', e.target.value)}
                    />
                    <small style={{ color: '#64748b' }}>Heure d'envoi automatique</small>
                  </div>

                  <div className="param-card" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1e293b' }}>
                      Période couverte
                    </label>
                    <select 
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      value={validationParams.periode_couverte || 'mois_suivant'}
                      onChange={(e) => handleValidationChange('periode_couverte', e.target.value)}
                    >
                      <option value="mois_suivant">Mois suivant</option>
                      <option value="2_semaines">2 semaines</option>
                      <option value="4_semaines">4 semaines</option>
                    </select>
                    <small style={{ color: '#64748b' }}>Gardes à inclure dans l'email</small>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
                  <label className="setting-toggle" style={{ marginBottom: 0 }}>
                    <div className="toggle-info">
                      <span>Envoi automatique</span>
                      <small>Envoyer automatiquement selon la configuration</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={validationParams.envoi_automatique !== false}
                      onChange={(e) => handleValidationChange('envoi_automatique', e.target.checked)}
                    />
                  </label>
                </div>

                {validationParams.derniere_notification && (
                  <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '8px', marginBottom: '20px' }}>
                    <small style={{ color: '#1e40af' }}>
                      📧 Dernière notification envoyée: {new Date(validationParams.derniere_notification).toLocaleString('fr-FR')}
                    </small>
                  </div>
                )}

                <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

                <h3 style={{ marginBottom: '15px', color: '#1e293b', fontSize: '16px' }}>⚖️ Équité des Gardes</h3>
                
                <div className="param-card" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1e293b' }}>
                    Période d'équité
                  </label>
                  <select 
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    value={validationParams.periode_equite || 'mensuel'}
                    onChange={(e) => handleValidationChange('periode_equite', e.target.value)}
                  >
                    <option value="hebdomadaire">Hebdomadaire (7 jours)</option>
                    <option value="bi-hebdomadaire">Bi-hebdomadaire (14 jours)</option>
                    <option value="mensuel">Mensuelle (mois en cours)</option>
                    <option value="personnalise">Personnalisée</option>
                  </select>
                  <small style={{ color: '#64748b' }}>Période sur laquelle calculer l'équité de distribution des gardes</small>
                </div>

                {validationParams.periode_equite === 'personnalise' && (
                  <div className="param-card" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1e293b' }}>
                      Nombre de jours
                    </label>
                    <input 
                      type="number"
                      min="1"
                      max="365"
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      value={validationParams.periode_equite_jours || 30}
                      onChange={(e) => handleValidationChange('periode_equite_jours', parseInt(e.target.value))}
                    />
                    <small style={{ color: '#64748b' }}>Période glissante en jours (ex: 30 = dernier mois)</small>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <Button 
                    variant="outline"
                    onClick={handleSaveValidationParams}
                    data-testid="save-validation-params"
                  >
                    💾 Enregistrer la configuration
                  </Button>
                  
                  <Button 
                    variant="default"
                    onClick={handleSendNotificationsManually}
                    data-testid="send-notifications-manually"
                    style={{ background: '#dc2626' }}
                  >
                    📧 Envoyer les notifications maintenant
                  </Button>
                </div>
              </div>

              {/* CARTE 3: Autoriser heures supplémentaires */}
              <div style={{
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
              }}>
                <h3 style={{ 
                  margin: '0 0 16px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '1.25rem',
                  color: '#1e293b'
                }}>
                  ⏰ Autoriser heures supplémentaires
                  <span 
                    title="Lorsqu'activé, l'auto-attribution peut dépasser les heures maximum hebdomadaires (lundi-dimanche) configurées dans le dossier personnel de chaque employé."
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: '#3b82f6',
                      color: 'white',
                      fontSize: '0.75rem',
                      cursor: 'help',
                      fontWeight: 'bold'
                    }}
                  >
                    i
                  </span>
                </h3>
              
              <div className="toggle-container" style={{ marginBottom: '20px', background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                <label className="setting-toggle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="toggle-info">
                    <span style={{ fontWeight: '600', color: '#1e293b' }}>Autoriser les heures supplémentaires</span>
                    <small style={{ display: 'block', color: '#64748b', marginTop: '4px' }}>
                      Lorsqu'activé, l'auto-attribution peut dépasser les heures maximum hebdomadaires (lundi-dimanche) configurées dans le dossier personnel de chaque employé.
                    </small>
                  </div>
                  <input
                    type="checkbox"
                    checked={heuresSupParams.activer_gestion_heures_sup}
                    onChange={(e) => setHeuresSupParams({...heuresSupParams, activer_gestion_heures_sup: e.target.checked})}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <Button 
                  variant="default"
                  onClick={handleSaveHeuresSupParams}
                  style={{ background: '#10b981' }}
                >
                  💾 Enregistrer la configuration
                </Button>
              </div>
              </div>

          </div>
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
          <div className="remplacements-tab">
            <div className="tab-header">
              <div>
                <h2>Paramètres des Remplacements</h2>
                <p>Configuration des règles de validation et délais de traitement automatique</p>
              </div>
            </div>
            
            <div className="replacement-settings-compact">
              <div className="settings-row">
                <div className="settings-column">
                  <h4 className="compact-title">🔔 Mode de notification</h4>
                  <p>Définissez comment les employés sont contactés pour les remplacements</p>
                  
                  <div className="setting-inputs-compact">
                    <div className="input-group-compact">
                      <Label>Stratégie de contact</Label>
                      <select 
                        className="form-select"
                        value={systemSettings.mode_notification || 'simultane'}
                        onChange={(e) => handleSettingChange('mode_notification', e.target.value)}
                        data-testid="mode-notification-select"
                      >
                        <option value="simultane">⚡ Simultané - Tous en même temps</option>
                        <option value="sequentiel">🎯 Séquentiel - Un par un</option>
                        <option value="groupe_sequentiel">🔀 Groupes séquentiels - Par groupes</option>
                      </select>
                    </div>

                    {systemSettings.mode_notification === 'groupe_sequentiel' && (
                      <div className="input-group-compact">
                        <Label>Taille du groupe</Label>
                        <Input
                          type="number"
                          min="2"
                          max="10"
                          value={systemSettings.taille_groupe || 3}
                          onChange={(e) => handleSettingChange('taille_groupe', parseInt(e.target.value))}
                          data-testid="taille-groupe-input"
                        />
                        <small>Nombre de personnes contactées simultanément par groupe</small>
                      </div>
                    )}

                    {(systemSettings.mode_notification === 'sequentiel' || systemSettings.mode_notification === 'groupe_sequentiel') && (
                      <div className="input-group-compact">
                        <Label>Délai d'attente (minutes)</Label>
                        <Input
                          type="number"
                          min="30"
                          max="4320"
                          step="30"
                          value={systemSettings.delai_attente_minutes || 1440}
                          onChange={(e) => handleSettingChange('delai_attente_minutes', parseInt(e.target.value))}
                          data-testid="delai-attente-input"
                        />
                        <small>Temps d'attente avant de passer au suivant (en cas de non-réponse). Par défaut: 24h (1440 min)</small>
                      </div>
                    )}

                    <div className="input-group-compact">
                      <Label>Max personnes à contacter</Label>
                      <div className="input-with-reset">
                        <Input
                          type="number"
                          min="1"
                          max="20"
                          value={systemSettings.max_personnes_contact}
                          onChange={(e) => handleSettingChange('max_personnes_contact', parseInt(e.target.value))}
                          data-testid="max-contact-input"
                        />
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleSettingChange('max_personnes_contact', 5)}
                          data-testid="reset-contact-btn"
                        >
                          🔄
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="settings-column">
                  <h4 className="compact-title">Règles de validation automatique</h4>
                  <div className="validation-rules-compact">
                    <label className="validation-rule-compact">
                      <input
                        type="checkbox"
                        checked={systemSettings.privilegier_disponibles}
                        onChange={(e) => handleSettingChange('privilegier_disponibles', e.target.checked)}
                        data-testid="toggle-privilegier-disponibles"
                      />
                      <div className="rule-content-compact">
                        <span className="rule-title">Privilégier les personnes disponibles</span>
                        <span className="rule-description">Priorité aux employés ayant renseigné leur disponibilité</span>
                      </div>
                    </label>
                    
                    <label className="validation-rule-compact">
                      <input
                        type="checkbox"
                        checked={systemSettings.grade_egal}
                        onChange={(e) => handleSettingChange('grade_egal', e.target.checked)}
                        data-testid="toggle-grade-egal"
                      />
                      <div className="rule-content-compact">
                        <span className="rule-title">Grade équivalent ou supérieur</span>
                        <span className="rule-description">Accepter uniquement les grades égaux ou supérieurs</span>
                      </div>
                    </label>
                    
                    <label className="validation-rule-compact">
                      <input
                        type="checkbox"
                        checked={systemSettings.competences_egales}
                        onChange={(e) => handleSettingChange('competences_egales', e.target.checked)}
                        data-testid="toggle-competences-egales"
                      />
                      <div className="rule-content-compact">
                        <span className="rule-title">Compétences équivalentes</span>
                        <span className="rule-description">Mêmes compétences que le demandeur</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Résumé supprimé comme demandé */}
            </div>
          </div>
        )}

        {activeTab === 'disponibilites' && (
          <div className="disponibilites-tab">
            <div className="tab-header">
              <div>
                <h2>Paramètres des Disponibilités</h2>
                <p>Configuration du système de blocage des disponibilités par date limite</p>
              </div>
            </div>
            
            <div className="availability-settings">
              <div className="settings-row">
                <div className="settings-column">
                  <h4 className="compact-title">🚫 Système de blocage</h4>
                  <p>Bloquer la modification des disponibilités du mois suivant à une date déterminée</p>
                  
                  <div className="setting-inputs-compact">
                    <label className="setting-toggle">
                      <div className="toggle-info">
                        <span>Activer le système de blocage</span>
                        <small>Active la restriction des modifications de disponibilités</small>
                      </div>
                      <input
                        type="checkbox"
                        checked={systemSettings.blocage_dispos_active}
                        onChange={(e) => handleSettingChange('blocage_dispos_active', e.target.checked)}
                        data-testid="toggle-blocage-dispos"
                      />
                    </label>

                    {systemSettings.blocage_dispos_active && (
                      <div className="input-group-compact">
                        <Label>Jour de blocage du mois</Label>
                        <Input
                          type="number"
                          min="1"
                          max="28"
                          value={systemSettings.jour_blocage_dispos || 15}
                          onChange={(e) => handleSettingChange('jour_blocage_dispos', parseInt(e.target.value))}
                          data-testid="jour-blocage-input"
                        />
                        <small>Le {systemSettings.jour_blocage_dispos || 15} du mois, bloquer les modifications du mois suivant à minuit</small>
                      </div>
                    )}
                  </div>
                </div>

                <div className="settings-column">
                  <h4 className="compact-title">⚙️ Exceptions et permissions</h4>
                  <div className="validation-rules-compact">
                    <label className="validation-rule-compact">
                      <input
                        type="checkbox"
                        checked={systemSettings.exceptions_admin_superviseur}
                        onChange={(e) => handleSettingChange('exceptions_admin_superviseur', e.target.checked)}
                        data-testid="toggle-exceptions-admin"
                      />
                      <div className="rule-content-compact">
                        <span className="rule-title">Exceptions pour admin/superviseur</span>
                        <span className="rule-description">Les administrateurs et superviseurs peuvent modifier même après la date limite</span>
                      </div>
                    </label>
                    
                    <label className="validation-rule-compact">
                      <input
                        type="checkbox"
                        checked={systemSettings.admin_peut_modifier_temps_partiel}
                        onChange={(e) => handleSettingChange('admin_peut_modifier_temps_partiel', e.target.checked)}
                        data-testid="toggle-admin-modif-temps-partiel"
                      />
                      <div className="rule-content-compact">
                        <span className="rule-title">Admin peut modifier les temps partiel</span>
                        <span className="rule-description">Les admin/superviseurs peuvent modifier les disponibilités des employés temps partiel</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-column">
                  <h4 className="compact-title">🔔 Notifications</h4>
                  <div className="setting-inputs-compact">
                    <label className="setting-toggle">
                      <div className="toggle-info">
                        <span>Activer les notifications</span>
                        <small>Prévenir les employés avant la date limite</small>
                      </div>
                      <input
                        type="checkbox"
                        checked={systemSettings.notifications_dispos_actives}
                        onChange={(e) => handleSettingChange('notifications_dispos_actives', e.target.checked)}
                        data-testid="toggle-notifications-dispos"
                      />
                    </label>

                    {systemSettings.notifications_dispos_actives && (
                      <div className="input-group-compact">
                        <Label>Nombre de jours d'avance</Label>
                        <Input
                          type="number"
                          min="1"
                          max="14"
                          value={systemSettings.jours_avance_notification || 3}
                          onChange={(e) => handleSettingChange('jours_avance_notification', parseInt(e.target.value))}
                          data-testid="jours-avance-input"
                        />
                        <small>Notifier {systemSettings.jours_avance_notification || 3} jour(s) avant la date limite</small>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bouton Sauvegarder */}
                <div style={{marginTop: '2rem', textAlign: 'center'}}>
                  <Button onClick={handleSaveDisponibilitesParams}>
                    💾 Sauvegarder les paramètres de disponibilités
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'epi' && (
          <div className="epi-tab">
            <div className="tab-header">
              <div>
                <h2>Gestion des Équipements de Protection Individuels (EPI)</h2>
                <p>Configuration et suivi des EPI selon les normes NFPA canadiennes</p>
              </div>
            </div>
            
            <div className="epi-content">
              {/* Configuration des notifications EPI */}
              <div className="settings-row">
                <div className="settings-column">
                  <h4 className="compact-title">🔔 Notifications EPI</h4>
                  <div className="setting-inputs-compact">
                    <label className="setting-toggle">
                      <div className="toggle-info">
                        <span>Activer les notifications EPI</span>
                        <small>Alertes automatiques pour inspections et remplacements</small>
                      </div>
                      <input
                        type="checkbox"
                        checked={systemSettings.epi_notifications_actives}
                        onChange={(e) => handleSettingChange('epi_notifications_actives', e.target.checked)}
                        data-testid="toggle-epi-notifications"
                      />
                    </label>

                    {systemSettings.epi_notifications_actives && (
                      <>
                        <div className="input-group-compact">
                          <Label>Alerte expiration (jours d'avance)</Label>
                          <Input
                            type="number"
                            min="7"
                            max="180"
                            value={systemSettings.epi_jours_avance_expiration || 30}
                            onChange={(e) => handleSettingChange('epi_jours_avance_expiration', parseInt(e.target.value))}
                            data-testid="epi-expiration-days"
                          />
                          <small>Notifier {systemSettings.epi_jours_avance_expiration || 30} jours avant expiration</small>
                        </div>

                        <div className="input-group-compact">
                          <Label>Alerte inspection (jours d'avance)</Label>
                          <Input
                            type="number"
                            min="3"
                            max="60"
                            value={systemSettings.epi_jours_avance_inspection || 14}
                            onChange={(e) => handleSettingChange('epi_jours_avance_inspection', parseInt(e.target.value))}
                            data-testid="epi-inspection-days"
                          />
                          <small>Notifier {systemSettings.epi_jours_avance_inspection || 14} jours avant inspection</small>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Note : La gestion individuelle des EPI se trouve dans le module EPI */}
              <div className="epi-info-section">
                <div className="info-card">
                  <h4>💡 Information</h4>
                  <p>La gestion complète des EPI selon NFPA 1851 se trouve dans le <strong>module EPI</strong>.</p>
                  <p>Ce module inclut : inventaire, inspections (3 types), nettoyages, réparations, retrait, et rapports de conformité.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        
        {activeTab === 'formations' && (
          <div className="formations-tab">
            <div className="tab-header">
              <div>
                <h2>Paramètres Formations - NFPA 1500</h2>
                <p>Configuration des exigences de formation annuelles</p>
              </div>
            </div>
            
            <div className="formations-content">
              <div className="settings-row">
                <div className="settings-column">
                  <h4 className="compact-title">⏱️ Exigences annuelles</h4>
                  <div className="setting-inputs-compact">
                    <div className="input-group">
                      <Label>Heures minimales par année (NFPA 1500)</Label>
                      <Input 
                        type="number"
                        value={parametresFormations.heures_minimales_annuelles}
                        onChange={e => setParametresFormations({
                          ...parametresFormations,
                          heures_minimales_annuelles: parseFloat(e.target.value) || 100
                        })}
                        placeholder="100"
                        data-testid="heures-min-input"
                      />
                      <small>Nombre minimum d'heures de formation requises par pompier par année</small>
                    </div>
                    
                    <div className="input-group">
                      <Label>Pourcentage minimum de présence (%)</Label>
                      <Input 
                        type="number"
                        min="0"
                        max="100"
                        value={parametresFormations.pourcentage_presence_minimum || 80}
                        onChange={e => setParametresFormations({
                          ...parametresFormations,
                          pourcentage_presence_minimum: parseFloat(e.target.value) || 80
                        })}
                        placeholder="80"
                        data-testid="pourcentage-min-input"
                      />
                      <small>Pourcentage minimum de présence aux formations passées pour être conforme</small>
                    </div>
                    
                    <div className="input-group">
                      <Label>Délai notification liste d'attente (jours)</Label>
                      <Input 
                        type="number"
                        value={parametresFormations.delai_notification_liste_attente}
                        onChange={e => setParametresFormations({
                          ...parametresFormations,
                          delai_notification_liste_attente: parseInt(e.target.value) || 7
                        })}
                        placeholder="7"
                        data-testid="delai-notification-input"
                      />
                      <small>Nombre de jours avant de notifier les personnes en liste d'attente</small>
                    </div>
                    
                    <label className="setting-toggle">
                      <div className="toggle-info">
                        <strong>Activer les notifications email</strong>
                        <span>Envoyer des emails pour inscriptions et listes d'attente</span>
                      </div>
                      <div className="toggle-switch">
                        <input 
                          type="checkbox"
                          checked={parametresFormations.email_notifications_actif}
                          onChange={e => setParametresFormations({
                            ...parametresFormations,
                            email_notifications_actif: e.target.checked
                          })}
                          data-testid="email-notifications-toggle"
                        />
                        <span className="slider"></span>
                      </div>
                    </label>
                    
                    <div style={{marginTop: '1.5rem'}}>
                      <Button onClick={async () => {
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
                      }}>
                        💾 Sauvegarder les paramètres
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="formations-info-section">
                <div className="info-card">
                  <h4>💡 À propos de NFPA 1500</h4>
                  <p>La norme NFPA 1500 établit les exigences minimales pour un programme de santé et sécurité au travail des services d'incendie.</p>
                  <p><strong>Exigences de formation :</strong></p>
                  <ul>
                    <li>Formation continue obligatoire pour tous les pompiers</li>
                    <li>Minimum d'heures de formation par année (configurable ci-dessus)</li>
                    <li>Suivi et documentation de toutes les formations</li>
                    <li>Validation des présences pour créditer les heures</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nouvel onglet: Imports CSV */}
        {activeTab === 'imports' && (
          <div className="imports-tab">
            <div className="tab-header">
              <div>
                <h2>Imports CSV - Importation en masse</h2>
                <p>Importez vos données rapidement via des fichiers CSV</p>
              </div>
            </div>
            
            <div className="imports-content" style={{ display: 'grid', gap: '2rem', marginTop: '2rem' }}>
              {/* Import EPI */}
              <div className="import-section">
                <h3 style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: '600', 
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  🛡️ Import EPI (Équipements)
                </h3>
                <ImportCSVEPI 
                  tenantSlug={tenantSlug}
                  onImportComplete={(results) => {
                    toast({
                      title: "Import terminé",
                      description: `${results.success_count} EPI importés avec succès`,
                      variant: "success"
                    });
                  }}
                />
              </div>

              {/* Import Personnel */}
              <div className="import-section">
                <h3 style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: '600', 
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  👥 Import Personnel (Employés)
                </h3>
                <ImportCSVPersonnel 
                  tenantSlug={tenantSlug}
                  onImportComplete={(results) => {
                    toast({
                      title: "Import terminé",
                      description: `${results.success_count} employés importés avec succès`,
                      variant: "success"
                    });
                  }}
                />
              </div>

              {/* Import Rapports */}
              <div className="import-section">
                <h3 style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: '600', 
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  📊 Import Rapports (Budgets/Dépenses)
                </h3>
                <ImportCSVRapports 
                  tenantSlug={tenantSlug}
                  onImportComplete={(results) => {
                    toast({
                      title: "Import terminé",
                      description: `${results.created_budgets} budgets et ${results.created_depenses} dépenses créés`,
                      variant: "success"
                    });
                  }}
                />
              </div>

              {/* Import Disponibilités */}
              <div className="import-section">
                <h3 style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: '600', 
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  📅 Import Disponibilités
                </h3>
                <ImportCSVDisponibilites 
                  tenantSlug={tenantSlug}
                  onImportComplete={(results) => {
                    toast({
                      title: "Import terminé",
                      description: `${results.created} créées, ${results.updated} mises à jour, ${results.errors?.length || 0} erreurs`,
                      variant: results.errors?.length > 0 ? "warning" : "success"
                    });
                  }}
                />
              </div>

              {/* Note d'information */}
              <div className="imports-info-section">
                <div className="info-card" style={{
                  padding: '1.5rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px'
                }}>
                  <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600' }}>
                    💡 Guide d'utilisation
                  </h4>
                  <ul style={{ 
                    listStyle: 'disc',
                    paddingLeft: '1.5rem',
                    lineHeight: '1.8',
                    color: '#475569'
                  }}>
                    <li>Téléchargez le template CSV pour chaque type d'import</li>
                    <li>Remplissez le fichier CSV avec vos données</li>
                    <li>Mappez les colonnes de votre CSV avec les champs requis</li>
                    <li>Prévisualisez vos données avant l'import final</li>
                    <li>Les doublons sont détectés automatiquement</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Onglet Personnalisation */}
        {activeTab === 'personnalisation' && (
          <Personnalisation tenantSlug={tenantSlug} toast={toast} />
        )}

      </div>

      {/* Modal d'édition type de garde avec jours */}
      {showEditTypeModal && editingItem && (
        <div className="modal-overlay" onClick={() => setShowEditTypeModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="edit-type-modal">
            <div className="modal-header">
              <h3>Modifier: {editingItem.nom}</h3>
              <Button variant="ghost" onClick={() => setShowEditTypeModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-field">
                  <Label>Nom du type de garde</Label>
                  <Input
                    value={editForm.nom}
                    onChange={(e) => setEditForm({...editForm, nom: e.target.value})}
                    data-testid="edit-nom-input"
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Heure de début</Label>
                    <Input
                      type="time"
                      value={editForm.heure_debut}
                      onChange={(e) => setEditForm({...editForm, heure_debut: e.target.value})}
                      data-testid="edit-debut-input"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Heure de fin</Label>
                    <Input
                      type="time"
                      value={editForm.heure_fin}
                      onChange={(e) => setEditForm({...editForm, heure_fin: e.target.value})}
                      data-testid="edit-fin-input"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Personnel requis</Label>
                    <Input
                      type="number"
                      min="1"
                      value={editForm.personnel_requis}
                      onChange={(e) => setEditForm({...editForm, personnel_requis: parseInt(e.target.value)})}
                      data-testid="edit-personnel-input"
                    />
                  </div>
                </div>

                <div className="form-field">
                  <Label>Couleur</Label>
                  <Input
                    type="color"
                    value={editForm.couleur}
                    onChange={(e) => setEditForm({...editForm, couleur: e.target.value})}
                    data-testid="edit-couleur-input"
                  />
                </div>

                <div className="form-field">
                  <Label>Jours d'application (récurrence)</Label>
                  <div className="days-selection">
                    {joursOptions.map(jour => (
                      <label key={jour.value} className="day-checkbox">
                        <input
                          type="checkbox"
                          checked={editForm.jours_application.includes(jour.value)}
                          onChange={() => handleJourChange(jour.value)}
                          data-testid={`edit-day-${jour.value}`}
                        />
                        <span>{jour.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-field">
                  <Label style={{marginBottom: '0.5rem', fontSize: '0.95rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                    🎯 Compétences requises
                  </Label>
                  
                  {competences.length > 0 ? (
                    <div className="competences-grid-modern">
                      {competences.map(comp => {
                        const isSelected = editForm.competences_requises.includes(comp.id);
                        return (
                          <div
                            key={comp.id}
                            className={`competence-card-modern ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleEditCompetenceChange(comp.id)}
                            data-testid={`edit-competence-${comp.id}`}
                          >
                            <div className="competence-icon">
                              {isSelected ? '✓' : '○'}
                            </div>
                            <div className="competence-info">
                              <span className="competence-nom">{comp.nom}</span>
                              {comp.description && (
                                <span className="competence-desc">{comp.description}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-state-card">
                      <span className="empty-icon">📋</span>
                      <p>Aucune compétence disponible</p>
                      <small>Créez d'abord des compétences dans l'onglet Compétences</small>
                    </div>
                  )}
                  
                  {editForm.competences_requises.length > 0 && (
                    <div className="competences-selected-summary">
                      <strong>{editForm.competences_requises.length}</strong> compétence(s) sélectionnée(s)
                    </div>
                  )}
                </div>

                <div className="form-field">
                  <label className="setting-checkbox-modern">
                    <div className="checkbox-wrapper">
                      <input
                        type="checkbox"
                        checked={editForm.officier_obligatoire}
                        onChange={(e) => setEditForm({...editForm, officier_obligatoire: e.target.checked})}
                      />
                      <span className="checkbox-custom"></span>
                    </div>
                    <div className="checkbox-content">
                      <span className="checkbox-title">👮 Officier obligatoire</span>
                      <span className="checkbox-description">Cette garde nécessite la présence d'un officier qualifié</span>
                    </div>
                  </label>
                </div>

                <div className="form-field">
                  <label className="setting-checkbox">
                    <input
                      type="checkbox"
                      checked={editForm.est_garde_externe}
                      onChange={(e) => setEditForm({...editForm, est_garde_externe: e.target.checked})}
                      data-testid="edit-garde-externe-checkbox"
                    />
                    <span>Garde Externe (astreinte à domicile)</span>
                  </label>
                </div>

                {editForm.est_garde_externe && (
                  <div className="form-field">
                    <Label>Taux horaire externe ($/h)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.taux_horaire_externe || ''}
                      onChange={(e) => setEditForm({...editForm, taux_horaire_externe: e.target.value ? parseFloat(e.target.value) : null})}
                      placeholder="Ex: 25.00"
                      data-testid="edit-taux-horaire-externe-input"
                    />
                    <small className="text-muted">Pour les futures payes automatiques</small>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowEditTypeModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleUpdateType} data-testid="save-changes-btn">
                  Sauvegarder les modifications
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'édition compétence */}
      {showEditFormationModal && editingItem && (
        <div className="modal-overlay" onClick={() => setShowEditFormationModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="edit-competence-modal">
            <div className="modal-header">
              <h3>Modifier la compétence: {editingItem.nom}</h3>
              <Button variant="ghost" onClick={() => setShowEditFormationModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-field">
                  <Label>Nom de la compétence *</Label>
                  <Input
                    value={editFormation.nom}
                    onChange={(e) => setEditFormation({...editFormation, nom: e.target.value})}
                    data-testid="edit-competence-nom"
                  />
                </div>

                <div className="form-field">
                  <Label>Description de la compétence</Label>
                  <textarea
                    value={editFormation.description}
                    onChange={(e) => setEditFormation({...editFormation, description: e.target.value})}
                    className="form-textarea"
                    rows="3"
                    placeholder="Décrivez cette compétence et ses exigences..."
                    data-testid="edit-competence-description"
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Durée de formation requise (heures)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={editFormation.duree_heures}
                      onChange={(e) => setEditFormation({...editFormation, duree_heures: parseInt(e.target.value)})}
                      data-testid="edit-competence-duree"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Renouvellement de la compétence</Label>
                    <select
                      value={editFormation.validite_mois}
                      onChange={(e) => setEditFormation({...editFormation, validite_mois: parseInt(e.target.value)})}
                      className="form-select"
                      data-testid="edit-competence-validite"
                    >
                      <option value="0">Pas de renouvellement</option>
                      <option value="6">6 mois</option>
                      <option value="12">12 mois</option>
                      <option value="24">24 mois</option>
                      <option value="36">36 mois</option>
                      <option value="60">60 mois</option>
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label className="setting-checkbox">
                    <input
                      type="checkbox"
                      checked={editFormation.obligatoire}
                      onChange={(e) => setEditFormation({...editFormation, obligatoire: e.target.checked})}
                    />
                    <span>Compétence obligatoire pour tous les pompiers</span>
                  </label>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowEditFormationModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleUpdateCompetence} data-testid="save-competence-btn">
                  Sauvegarder la compétence
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de création de grade */}
      {showCreateGradeModal && (
        <div className="modal-overlay" onClick={() => setShowCreateGradeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} data-testid="create-grade-modal">
            <div className="modal-header">
              <h3>Nouveau grade</h3>
              <Button variant="ghost" onClick={() => setShowCreateGradeModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-field">
                  <Label>Nom du grade *</Label>
                  <Input
                    value={newGrade.nom}
                    onChange={(e) => setNewGrade({...newGrade, nom: e.target.value})}
                    placeholder="Ex: Sergent, Chef de bataillon..."
                    data-testid="new-grade-nom"
                  />
                </div>

                <div className="form-field">
                  <Label>Niveau hiérarchique *</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={newGrade.niveau_hierarchique}
                    onChange={(e) => setNewGrade({...newGrade, niveau_hierarchique: parseInt(e.target.value) || 1})}
                    data-testid="new-grade-niveau"
                  />
                  <small>1 = niveau le plus bas, 10 = niveau le plus haut</small>
                </div>

                <div className="form-field">
                  <label className="setting-checkbox">
                    <input
                      type="checkbox"
                      checked={newGrade.est_officier}
                      onChange={(e) => setNewGrade({...newGrade, est_officier: e.target.checked})}
                      data-testid="new-grade-est-officier"
                    />
                    <span>👮 Est un grade d'officier</span>
                  </label>
                  <small className="text-muted">Les grades d'officiers incluent Capitaine, Lieutenant, Directeur, Chef de division, etc.</small>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowCreateGradeModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleCreateGrade} data-testid="create-grade-submit-btn">
                  Créer le grade
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'édition de grade */}
      {showEditGradeModal && editingItem && (
        <div className="modal-overlay" onClick={() => setShowEditGradeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} data-testid="edit-grade-modal">
            <div className="modal-header">
              <h3>Modifier le grade: {editingItem.nom}</h3>
              <Button variant="ghost" onClick={() => setShowEditGradeModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-field">
                  <Label>Nom du grade *</Label>
                  <Input
                    value={editGrade.nom}
                    onChange={(e) => setEditGrade({...editGrade, nom: e.target.value})}
                    data-testid="edit-grade-nom"
                  />
                </div>

                <div className="form-field">
                  <Label>Niveau hiérarchique *</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={editGrade.niveau_hierarchique}
                    onChange={(e) => setEditGrade({...editGrade, niveau_hierarchique: parseInt(e.target.value) || 1})}
                    data-testid="edit-grade-niveau"
                  />
                  <small>1 = niveau le plus bas, 10 = niveau le plus haut</small>
                </div>

                <div className="form-field">
                  <label className="setting-checkbox">
                    <input
                      type="checkbox"
                      checked={editGrade.est_officier}
                      onChange={(e) => setEditGrade({...editGrade, est_officier: e.target.checked})}
                      data-testid="edit-grade-est-officier"
                    />
                    <span>👮 Est un grade d'officier</span>
                  </label>
                  <small className="text-muted">Les grades d'officiers incluent Capitaine, Lieutenant, Directeur, Chef de division, etc.</small>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowEditGradeModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleUpdateGrade} data-testid="save-grade-btn">
                  Sauvegarder les modifications
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de création d'utilisateur */}
      {showCreateUserModal && (
        <div className="modal-overlay" onClick={() => setShowCreateUserModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="create-user-modal">
            <div className="modal-header">
              <h3>Nouveau compte d'accès</h3>
              <Button variant="ghost" onClick={() => setShowCreateUserModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-row">
                  <div className="form-field">
                    <Label>Prénom *</Label>
                    <Input
                      value={newUser.prenom}
                      onChange={(e) => setNewUser({...newUser, prenom: e.target.value})}
                      data-testid="new-user-prenom"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Nom *</Label>
                    <Input
                      value={newUser.nom}
                      onChange={(e) => setNewUser({...newUser, nom: e.target.value})}
                      data-testid="new-user-nom"
                    />
                  </div>
                </div>

                <div className="form-field">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    data-testid="new-user-email"
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Grade</Label>
                    <select
                      value={newUser.grade}
                      onChange={(e) => setNewUser({...newUser, grade: e.target.value})}
                      className="form-select"
                      data-testid="new-user-grade"
                    >
                      {grades.map(grade => (
                        <option key={grade.id} value={grade.nom}>{grade.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <Label>Rôle *</Label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                      className="form-select"
                      data-testid="new-user-role"
                    >
                      <option value="employe">👤 Employé</option>
                      <option value="superviseur">🎖️ Superviseur</option>
                      <option value="admin">👑 Administrateur</option>
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <Label>Type d'emploi</Label>
                  <select
                    value={newUser.type_emploi}
                    onChange={(e) => setNewUser({...newUser, type_emploi: e.target.value})}
                    className="form-select"
                    data-testid="new-user-employment"
                  >
                    <option value="temps_plein">Temps plein</option>
                    <option value="temps_partiel">Temps partiel</option>
                  </select>
                </div>

                <div className="form-field">
                  <Label>Mot de passe temporaire *</Label>
                  <div style={{position: 'relative'}}>
                    <Input
                      type={showPasswordComptes ? "text" : "password"}
                      value={newUser.mot_de_passe}
                      onChange={(e) => setNewUser({...newUser, mot_de_passe: e.target.value})}
                      data-testid="new-user-password"
                      placeholder="Minimum 8 caractères complexes"
                      style={{paddingRight: '40px'}}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordComptes(!showPasswordComptes)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '1.2rem'
                      }}
                    >
                      {showPasswordComptes ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                  <div className="password-requirements">
                    <small className="requirement-title">Exigences du mot de passe :</small>
                    <div className="requirements-list">
                      <span className={`requirement ${newUser.mot_de_passe.length >= 8 ? 'valid' : 'invalid'}`}>
                        {newUser.mot_de_passe.length >= 8 ? '✅' : '❌'} 8 caractères minimum
                      </span>
                      <span className={`requirement ${/[A-Z]/.test(newUser.mot_de_passe) ? 'valid' : 'invalid'}`}>
                        {/[A-Z]/.test(newUser.mot_de_passe) ? '✅' : '❌'} 1 majuscule
                      </span>
                      <span className={`requirement ${/\d/.test(newUser.mot_de_passe) ? 'valid' : 'invalid'}`}>
                        {/\d/.test(newUser.mot_de_passe) ? '✅' : '❌'} 1 chiffre
                      </span>
                      <span className={`requirement ${/[!@#$%^&*+\-?()]/.test(newUser.mot_de_passe) ? 'valid' : 'invalid'}`}>
                        {/[!@#$%^&*+\-?()]/.test(newUser.mot_de_passe) ? '✅' : '❌'} 1 caractère spécial (!@#$%^&*+-?())
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowCreateUserModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleCreateUser} data-testid="create-account-btn">
                  Créer le compte
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de création de type de garde */}
      {showCreateTypeModal && (
        <div className="modal-overlay" onClick={() => setShowCreateTypeModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="create-type-modal">
            <div className="modal-header">
              <h3>Nouveau type de garde</h3>
              <Button variant="ghost" onClick={() => setShowCreateTypeModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-field">
                  <Label>Nom du type de garde *</Label>
                  <Input
                    value={createForm.nom}
                    onChange={(e) => setCreateForm({...createForm, nom: e.target.value})}
                    placeholder="Ex: Garde Interne Nuit"
                    data-testid="create-nom-input"
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Heure de début *</Label>
                    <Input
                      type="time"
                      value={createForm.heure_debut}
                      onChange={(e) => setCreateForm({...createForm, heure_debut: e.target.value})}
                      data-testid="create-debut-input"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Heure de fin *</Label>
                    <Input
                      type="time"
                      value={createForm.heure_fin}
                      onChange={(e) => setCreateForm({...createForm, heure_fin: e.target.value})}
                      data-testid="create-fin-input"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Personnel requis</Label>
                    <Input
                      type="number"
                      min="1"
                      value={createForm.personnel_requis}
                      onChange={(e) => setCreateForm({...createForm, personnel_requis: parseInt(e.target.value)})}
                      data-testid="create-personnel-input"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Couleur</Label>
                    <Input
                      type="color"
                      value={createForm.couleur}
                      onChange={(e) => setCreateForm({...createForm, couleur: e.target.value})}
                      data-testid="create-couleur-input"
                    />
                  </div>
                </div>

                <div className="form-field">
                  <Label>Jours d'application (récurrence)</Label>
                  <div className="days-selection">
                    {joursOptions.map(jour => (
                      <label key={jour.value} className="day-checkbox">
                        <input
                          type="checkbox"
                          checked={createForm.jours_application.includes(jour.value)}
                          onChange={() => handleCreateJourChange(jour.value)}
                          data-testid={`create-day-${jour.value}`}
                        />
                        <span>{jour.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-field">
                  <Label style={{marginBottom: '0.5rem', fontSize: '0.95rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                    🎯 Compétences requises
                  </Label>
                  
                  {competences.length > 0 ? (
                    <div className="competences-grid-modern">
                      {competences.map(comp => {
                        const isSelected = createForm.competences_requises.includes(comp.id);
                        return (
                          <div
                            key={comp.id}
                            className={`competence-card-modern ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleCreateCompetenceChange(comp.id)}
                            data-testid={`create-competence-${comp.id}`}
                          >
                            <div className="competence-icon">
                              {isSelected ? '✓' : '○'}
                            </div>
                            <div className="competence-info">
                              <span className="competence-nom">{comp.nom}</span>
                              {comp.description && (
                                <span className="competence-desc">{comp.description}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-state-card">
                      <span className="empty-icon">📋</span>
                      <p>Aucune compétence disponible</p>
                      <small>Créez d'abord des compétences dans l'onglet Compétences</small>
                    </div>
                  )}
                  
                  {createForm.competences_requises.length > 0 && (
                    <div className="competences-selected-summary">
                      <strong>{createForm.competences_requises.length}</strong> compétence(s) sélectionnée(s)
                    </div>
                  )}
                </div>

                <div className="form-field">
                  <label className="setting-checkbox-modern">
                    <div className="checkbox-wrapper">
                      <input
                        type="checkbox"
                        checked={createForm.officier_obligatoire}
                        onChange={(e) => setCreateForm({...createForm, officier_obligatoire: e.target.checked})}
                      />
                      <span className="checkbox-custom"></span>
                    </div>
                    <div className="checkbox-content">
                      <span className="checkbox-title">👮 Officier obligatoire</span>
                      <span className="checkbox-description">Cette garde nécessite la présence d'un officier qualifié</span>
                    </div>
                  </label>
                </div>

                <div className="form-field">
                  <label className="setting-checkbox">
                    <input
                      type="checkbox"
                      checked={createForm.est_garde_externe}
                      onChange={(e) => setCreateForm({...createForm, est_garde_externe: e.target.checked})}
                      data-testid="create-garde-externe-checkbox"
                    />
                    <span>Garde Externe (astreinte à domicile)</span>
                  </label>
                </div>

                {createForm.est_garde_externe && (
                  <div className="form-field">
                    <Label>Taux horaire externe ($/h)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={createForm.taux_horaire_externe || ''}
                      onChange={(e) => setCreateForm({...createForm, taux_horaire_externe: e.target.value ? parseFloat(e.target.value) : null})}
                      placeholder="Ex: 25.00"
                      data-testid="create-taux-horaire-externe-input"
                    />
                    <small className="text-muted">Pour les futures payes automatiques</small>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowCreateTypeModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleCreateType} data-testid="create-type-btn">
                  Créer le type de garde
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de création de compétence */}
      {showCreateFormationModal && (
        <div className="modal-overlay" onClick={() => setShowCreateFormationModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="create-competence-modal">
            <div className="modal-header">
              <h3>Nouvelle compétence</h3>
              <Button variant="ghost" onClick={() => setShowCreateFormationModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-field">
                  <Label>Nom de la compétence *</Label>
                  <Input
                    value={newFormation.nom}
                    onChange={(e) => setNewFormation({...newFormation, nom: e.target.value})}
                    placeholder="Ex: Conduite d'échelle, Sauvetage aquatique"
                    data-testid="create-competence-nom"
                  />
                </div>

                <div className="form-field">
                  <Label>Description de la compétence</Label>
                  <textarea
                    value={newFormation.description}
                    onChange={(e) => setNewFormation({...newFormation, description: e.target.value})}
                    placeholder="Décrivez cette compétence, les exigences et les critères d'évaluation..."
                    rows="3"
                    className="form-textarea"
                    data-testid="create-competence-description"
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Durée de formation requise (heures)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={newFormation.duree_heures}
                      onChange={(e) => setNewFormation({...newFormation, duree_heures: parseInt(e.target.value)})}
                      data-testid="create-competence-duree"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Renouvellement de la compétence</Label>
                    <select
                      value={newFormation.validite_mois}
                      onChange={(e) => setNewFormation({...newFormation, validite_mois: parseInt(e.target.value)})}
                      className="form-select"
                      data-testid="create-competence-validite"
                    >
                      <option value="0">Pas de renouvellement</option>
                      <option value="6">6 mois</option>
                      <option value="12">12 mois</option>
                      <option value="24">24 mois</option>
                      <option value="36">36 mois</option>
                      <option value="60">60 mois</option>
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label className="setting-checkbox">
                    <input
                      type="checkbox"
                      checked={newFormation.obligatoire}
                      onChange={(e) => setNewFormation({...newFormation, obligatoire: e.target.checked})}
                    />
                    <span>Compétence obligatoire pour tous les pompiers</span>
                  </label>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowCreateFormationModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleCreateCompetence} data-testid="create-competence-submit-btn">
                  Créer la compétence
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de modification d'accès utilisateur */}
      {showEditAccessModal && editingUser && (
        <div className="modal-overlay" onClick={() => setShowEditAccessModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} data-testid="edit-access-modal">
            <div className="modal-header">
              <h3>Modifier l'accès - {editingUser.prenom} {editingUser.nom}</h3>
              <Button variant="ghost" onClick={() => setShowEditAccessModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="current-user-info">
                <div className="user-summary">
                  <div className="user-avatar">
                    <span className="avatar-icon">👤</span>
                  </div>
                  <div className="user-details">
                    <h4>{editingUser.prenom} {editingUser.nom}</h4>
                    <p>{editingUser.email}</p>
                    <p>Grade: {editingUser.grade} | {editingUser.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'}</p>
                  </div>
                </div>
              </div>

              <div className="access-form">
                <div className="form-field">
                  <Label>Rôle/Autorisation</Label>
                  <select
                    value={userAccess.role}
                    onChange={(e) => setUserAccess({...userAccess, role: e.target.value})}
                    className="form-select"
                    data-testid="edit-user-role-select"
                  >
                    <option value="employe">👤 Employé</option>
                    <option value="superviseur">🎖️ Superviseur</option>
                    <option value="admin">👑 Administrateur</option>
                  </select>
                  <small className="field-description">
                    Détermine les modules et fonctionnalités accessibles
                  </small>
                </div>

                <div className="form-field">
                  <Label>Statut du compte</Label>
                  <select
                    value={userAccess.statut}
                    onChange={(e) => setUserAccess({...userAccess, statut: e.target.value})}
                    className="form-select"
                    data-testid="edit-user-status-select"
                  >
                    <option value="Actif">✅ Actif - Peut se connecter</option>
                    <option value="Inactif">❌ Inactif - Connexion bloquée</option>
                  </select>
                  <small className="field-description">
                    Un compte inactif ne peut plus se connecter temporairement
                  </small>
                </div>

                <div className="permissions-preview">
                  <h4>Aperçu des permissions :</h4>
                  <div className="permissions-list">
                    {userAccess.role === 'admin' && (
                      <div className="permission-group">
                        <span className="permission-title">👑 Administrateur</span>
                        <ul>
                          <li>Accès complet à tous les modules</li>
                          <li>Gestion du personnel et création de comptes</li>
                          <li>Configuration système et paramètres</li>
                        </ul>
                      </div>
                    )}
                    {userAccess.role === 'superviseur' && (
                      <div className="permission-group">
                        <span className="permission-title">🎖️ Superviseur</span>
                        <ul>
                          <li>Gestion du personnel (consultation)</li>
                          <li>Validation du planning et remplacements</li>
                          <li>Accès aux formations</li>
                        </ul>
                      </div>
                    )}
                    {userAccess.role === 'employe' && (
                      <div className="permission-group">
                        <span className="permission-title">👤 Employé</span>
                        <ul>
                          <li>Consultation du planning personnel</li>
                          <li>Demandes de remplacement</li>
                          <li>Gestion des disponibilités</li>
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowEditAccessModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleUpdateAccess} data-testid="save-access-btn">
                  Sauvegarder les modifications
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de gestion des EPI individuels sera dans le module Personnel */}
    </div>
  );
};

export default Parametres;