import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "../hooks/use-toast";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';

// Fonction pour parser une date en évitant les problèmes de timezone
const parseDateLocal = (dateStr) => {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const Personnel = ({ setCurrentPage, setManagingUserDisponibilites }) => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [formations, setFormations] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showManageDisponibilitesModal, setShowManageDisponibilitesModal] = useState(false);
  const [showEPIModal, setShowEPIModal] = useState(false);
  const [showAddEPIModal, setShowAddEPIModal] = useState(false);
  const [showEPIAccordion, setShowEPIAccordion] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDisponibilites, setUserDisponibilites] = useState([]);
  const [userEPIs, setUserEPIs] = useState([]);
  const [userValidations, setUserValidations] = useState([]);
  const [showValidateCompetenceModal, setShowValidateCompetenceModal] = useState(false);
  const [competences, setCompetences] = useState([]);
  const [newValidation, setNewValidation] = useState({
    competence_id: '',
    justification: '',
    date_validation: new Date().toISOString().split('T')[0]
  });
  
  // Nouveaux états pour la refonte
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' ou 'cards'
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState(''); // 'pdf' ou 'excel'
  const [exportScope, setExportScope] = useState('all'); // 'all' ou 'individual'
  const [selectedPersonForExport, setSelectedPersonForExport] = useState('');
  
  // États pour la prévisualisation PDF/Excel
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState(null);
  const [previewFilename, setPreviewFilename] = useState('');
  const [previewType, setPreviewType] = useState('pdf'); // 'pdf' ou 'excel'
  
  // État pour la photo de profil
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = React.useRef(null);
  
  const [newDisponibilite, setNewDisponibilite] = useState({
    date: new Date().toISOString().split('T')[0],
    heure_debut: '08:00',
    heure_fin: '17:00',
    statut: 'disponible',
    recurrence: false,
    type_recurrence: 'hebdomadaire',
    jours_semaine: [],
    bi_hebdomadaire: false,
    date_fin: ''
  });
  const [editingEPIId, setEditingEPIId] = useState(null);
  const [newEPI, setNewEPI] = useState({
    type_epi: '',
    taille: '',
    date_attribution: new Date().toISOString().split('T')[0],
    etat: 'Neuf',
    date_expiration: '',
    date_prochaine_inspection: '',
    notes: ''
  });
  const [newUser, setNewUser] = useState({
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    adresse: '',
    contact_urgence: '',
    grade: '',
    fonction_superieur: false,
    type_emploi: '',
    equipe_garde: null,
    numero_employe: '',
    date_embauche: '',
    taux_horaire: 0,
    formations: [],
    accepte_gardes_externes: true, // True par défaut
    mot_de_passe: '',
    // Tailles EPI (optionnelles)
    taille_casque: '',
    taille_bottes: '',
    taille_veste_bunker: '',
    taille_pantalon_bunker: '',
    taille_gants: '',
    taille_masque_apria: '',
    taille_cagoule: ''
  });
  const [equipesGardeParams, setEquipesGardeParams] = useState(null);
  const { toast } = useToast();
  const { tenantSlug } = useTenant();

  useEffect(() => {
    const fetchData = async () => {
      if (!tenantSlug) return;
      
      try {
        const [usersData, competencesData, gradesData, equipesGardeData] = await Promise.all([
          apiGet(tenantSlug, '/users'),
          apiGet(tenantSlug, '/competences'),
          apiGet(tenantSlug, '/grades'),
          apiGet(tenantSlug, '/parametres/equipes-garde').catch(() => null)
        ]);
        setUsers(usersData);
        setFormations(competencesData);
        setCompetences(competencesData);
        setGrades(gradesData);
        if (equipesGardeData) {
          setEquipesGardeParams(equipesGardeData);
        }
      } catch (error) {
        console.error('Erreur lors du chargement des données:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tenantSlug]);

  const handleCreateUser = async () => {
    if (!newUser.nom || !newUser.prenom || !newUser.email) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir Nom, Prénom et Email",
        variant: "destructive"
      });
      return;
    }

    try {
      const userToCreate = {
        ...newUser,
        grade: newUser.grade || 'Pompier',
        type_emploi: newUser.type_emploi || 'temps_plein',
        role: 'employe',
        numero_employe: newUser.numero_employe || `POM${String(Date.now()).slice(-3)}`,
        date_embauche: newUser.date_embauche || new Date().toISOString().split('T')[0],
        mot_de_passe: 'TempPassword123!'
      };

      await apiPost(tenantSlug, '/users', userToCreate);
      toast({
        title: "Pompier créé",
        description: "Le nouveau pompier a été ajouté avec succès",
        variant: "success"
      });
      
      setShowCreateModal(false);
      resetNewUser();
      
      const usersData = await apiGet(tenantSlug, '/users');
      setUsers(usersData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.detail || error.message || "Impossible de créer le pompier",
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
      adresse: '',
      contact_urgence: '',
      grade: '',
      fonction_superieur: false,
      type_emploi: '',
      equipe_garde: null,
      numero_employe: '',
      date_embauche: new Date().toISOString().split('T')[0],
      taux_horaire: 0,
      formations: [],
      mot_de_passe: ''
    });
  };

  const handleViewUser = async (user) => {
    setSelectedUser(user);
    // Charger les EPI et validations de l'utilisateur
    try {
      const [episData, validationsData] = await Promise.all([
        apiGet(tenantSlug, `/epi/employe/${user.id}`),
        apiGet(tenantSlug, `/validations-competences/${user.id}`)
      ]);
      setUserEPIs(episData || []);
      setUserValidations(validationsData || []);
      // Ouvrir le modal APRÈS avoir mis à jour les states
      setShowViewModal(true);
    } catch (error) {
      console.error('❌ Erreur lors du chargement des EPIs:', error);
      setUserEPIs([]);
      setUserValidations([]);
      setShowViewModal(true);
    }
  };

  const handleValidateCompetence = async () => {
    if (!newValidation.competence_id || !newValidation.justification) {
      toast({
        title: "Champs requis",
        description: "Veuillez sélectionner une compétence et fournir une justification",
        variant: "destructive"
      });
      return;
    }

    try {
      const validation = {
        user_id: selectedUser.id,
        competence_id: newValidation.competence_id,
        justification: newValidation.justification,
        date_validation: newValidation.date_validation
      };

      await apiPost(tenantSlug, '/validations-competences', validation);

      toast({
        title: "Succès",
        description: "Compétence validée avec succès",
        variant: "success"
      });

      // Recharger les validations
      const validationsData = await apiGet(tenantSlug, `/validations-competences/${selectedUser.id}`);
      setUserValidations(validationsData || []);

      // Réinitialiser le formulaire
      setNewValidation({
        competence_id: '',
        justification: '',
        date_validation: new Date().toISOString().split('T')[0]
      });
      setShowValidateCompetenceModal(false);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.detail || error.message || "Impossible de valider la compétence",
        variant: "destructive"
      });
    }
  };

  const handleDeleteValidation = async (validationId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette validation ?')) {
      return;
    }

    try {
      await apiDelete(tenantSlug, `/validations-competences/${validationId}`);

      toast({
        title: "Succès",
        description: "Validation supprimée",
        variant: "success"
      });

      // Recharger les validations
      const validationsData = await apiGet(tenantSlug, `/validations-competences/${selectedUser.id}`);
      setUserValidations(validationsData || []);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la validation",
        variant: "destructive"
      });
    }
  };

  // Gestion de la photo de profil (Admin)
  const handlePhotoSelectAdmin = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !selectedUser) return;

    // Vérifier le type de fichier
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Format non supporté",
        description: "Veuillez choisir une image JPG, PNG ou WEBP",
        variant: "destructive"
      });
      return;
    }

    setPhotoUploading(true);

    try {
      // Fonction pour compresser l'image côté client
      const compressImage = (file, maxWidth = 400, quality = 0.8) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              
              if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
              }
              
              canvas.width = width;
              canvas.height = height;
              
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              
              const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
              resolve(compressedBase64);
            };
            img.onerror = reject;
            img.src = e.target.result;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      };

      // Compresser si > 500KB
      let base64;
      if (file.size > 500 * 1024) {
        toast({
          title: "Compression en cours...",
          description: "L'image est optimisée automatiquement",
        });
        base64 = await compressImage(file, 400, 0.85);
      } else {
        base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      
      const response = await apiPost(tenantSlug, `/users/${selectedUser.id}/photo-profil`, {
        photo_base64: base64
      });
      
      // Mettre à jour l'utilisateur sélectionné et la liste
      setSelectedUser(prev => ({...prev, photo_profil: response.photo_profil}));
      setUsers(prev => prev.map(u => 
        u.id === selectedUser.id ? {...u, photo_profil: response.photo_profil} : u
      ));
      
      toast({
        title: "Photo mise à jour",
        description: `Photo de ${selectedUser.prenom} enregistrée`,
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de sauvegarder la photo",
        variant: "destructive"
      });
    } finally {
      setPhotoUploading(false);
    }
    
    event.target.value = '';
  };

  const handleDeletePhotoAdmin = async () => {
    if (!selectedUser) return;
    
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer la photo de ${selectedUser.prenom} ?`)) {
      return;
    }

    try {
      await apiDelete(tenantSlug, `/users/${selectedUser.id}/photo-profil`);
      setSelectedUser(prev => ({...prev, photo_profil: null}));
      setUsers(prev => prev.map(u => 
        u.id === selectedUser.id ? {...u, photo_profil: null} : u
      ));
      toast({
        title: "Photo supprimée",
        description: `Photo de ${selectedUser.prenom} supprimée`,
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la photo",
        variant: "destructive"
      });
    }
  };

  const handleEditUser = async (user) => {
    // Définir l'utilisateur sélectionné directement avec ses tailles EPI
    setSelectedUser(user);
    
    setNewUser({
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      telephone: user.telephone,
      adresse: user.adresse || '',
      contact_urgence: user.contact_urgence || '',
      grade: user.grade,
      fonction_superieur: user.fonction_superieur || false,
      est_preventionniste: user.est_preventionniste || false,
      type_emploi: user.type_emploi,
      equipe_garde: user.equipe_garde || null,
      numero_employe: user.numero_employe,
      date_embauche: user.date_embauche,
      taux_horaire: user.taux_horaire || 0,
      heures_max_semaine: user.heures_max_semaine || 40,
      formations: user.formations || [],
      accepte_gardes_externes: user.accepte_gardes_externes !== false,
      tailles_epi: user.tailles_epi || {},
      mot_de_passe: ''
    });
    
    setShowEditModal(true);
  };

  const handleUpdateUser = async () => {
    if (!newUser.nom || !newUser.prenom || !newUser.email || !newUser.grade || !newUser.type_emploi) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive"
      });
      return;
    }

    try {
      const userToUpdate = {
        ...newUser,
        heures_max_semaine: newUser.heures_max_semaine !== null && newUser.heures_max_semaine !== undefined 
          ? parseInt(newUser.heures_max_semaine) 
          : 40,
        role: selectedUser.role, // Préserver le rôle existant
        statut: selectedUser.statut, // Préserver le statut existant
        tailles_epi: selectedUser.tailles_epi || {}, // Inclure les tailles EPI modifiées
        mot_de_passe: newUser.mot_de_passe || 'unchanged' // Mot de passe optionnel
      };

      await apiPut(tenantSlug, `/users/${selectedUser.id}`, userToUpdate);
      toast({
        title: "Pompier mis à jour",
        description: "Les informations ont été mises à jour avec succès",
        variant: "success"
      });
      setShowEditModal(false);
      
      // Reload users list
      const usersData = await apiGet(tenantSlug, '/users');
      setUsers(usersData);
    } catch (error) {
      console.error('Error updating user:', error);
      toast({
        title: "Erreur de modification",
        description: error.detail || error.message || "Impossible de mettre à jour le pompier",
        variant: "destructive"
      });
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce pompier ?")) return;

    try {
      await apiDelete(tenantSlug, `/users/${userId}`);
      toast({
        title: "Pompier supprimé",
        description: "Le pompier a été supprimé avec succès",
        variant: "success"
      });
      const usersData = await apiGet(tenantSlug, '/users');
      setUsers(usersData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le pompier",
        variant: "destructive"
      });
    }
  };

  // Ouvrir le modal d'export
  const handleOpenExportModal = (type) => {
    setExportType(type);
    setExportScope('all'); // Par défaut, tout le personnel
    setSelectedPersonForExport('');
    setShowExportModal(true);
  };

  // Confirmer l'export après sélection dans le modal
  const handleConfirmExport = async () => {
    const userId = exportScope === 'individual' ? selectedPersonForExport : null;
    
    if (exportScope === 'individual' && !selectedPersonForExport) {
      toast({
        title: "Sélection requise",
        description: "Veuillez sélectionner une personne à exporter",
        variant: "destructive"
      });
      return;
    }
    
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL;
      const token = localStorage.getItem(`${tenantSlug}_token`);
      
      // Utiliser le nouvel endpoint qui génère une URL de téléchargement direct
      const url = `${backendUrl}/api/${tenantSlug}/personnel/generate-export?export_type=${exportType}${userId ? `&user_id=${userId}` : ''}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) throw new Error('Erreur lors de l\'export');
      
      const data = await response.json();
      
      if (data.success && data.download_url) {
        // Afficher la modale avec l'URL de téléchargement direct
        setPreviewDataUrl(data.download_url);
        setPreviewFilename(data.filename);
        setPreviewType(exportType);
        setShowPreviewModal(true);
      } else {
        throw new Error('URL de téléchargement non disponible');
      }
      
      setShowExportModal(false);
    } catch (error) {
      console.error('Erreur export:', error);
      toast({ 
        title: "Erreur", 
        description: `Impossible d'exporter le ${exportType.toUpperCase()}`, 
        variant: "destructive" 
      });
    }
  };

  // Confirmer l'export après sélection dans le modal
  const getFilteredUsers = () => {
    if (!searchTerm) return users;
    return users.filter(user => 
      `${user.prenom} ${user.nom}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.grade?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const handleManageDisponibilites = async (user) => {
    if (user.type_emploi !== 'temps_partiel') {
      toast({
        title: "Information",
        description: "Les disponibilités ne concernent que les employés à temps partiel",
        variant: "default"
      });
      return;
    }

    // Stocker l'utilisateur et naviguer vers le module disponibilités
    setManagingUserDisponibilites(user);
    setCurrentPage('disponibilites');
  };

  const handleAddDisponibilite = async () => {
    if (!newDisponibilite.date || !newDisponibilite.heure_debut || !newDisponibilite.heure_fin) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs",
        variant: "destructive"
      });
      return;
    }

    // Validation pour récurrence
    if (newDisponibilite.recurrence) {
      if (!newDisponibilite.date_fin) {
        toast({
          title: "Date de fin requise",
          description: "Veuillez spécifier une date de fin pour la récurrence",
          variant: "destructive"
        });
        return;
      }
      if (newDisponibilite.type_recurrence === 'hebdomadaire' && newDisponibilite.jours_semaine.length === 0) {
        toast({
          title: "Jours requis",
          description: "Veuillez sélectionner au moins un jour de la semaine",
          variant: "destructive"
        });
        return;
      }
    }

    try {
      let disponibilitesToCreate = [];

      if (newDisponibilite.recurrence) {
        // Générer toutes les occurrences avec origine "recurrence"
        disponibilitesToCreate = generateRecurringDisponibilites(newDisponibilite, selectedUser.id);
        // Marquer toutes comme récurrence
        disponibilitesToCreate = disponibilitesToCreate.map(d => ({...d, origine: 'recurrence'}));
      } else {
        // Disponibilité unique avec origine "manuelle"
        disponibilitesToCreate = [{
          date: newDisponibilite.date,
          heure_debut: newDisponibilite.heure_debut,
          heure_fin: newDisponibilite.heure_fin,
          statut: newDisponibilite.statut,
          user_id: selectedUser.id,
          origine: 'manuelle'
        }];
      }

      // Créer toutes les disponibilités
      let successCount = 0;
      let conflictCount = 0;
      let errorCount = 0;
      
      for (const dispo of disponibilitesToCreate) {
        try {
          await apiPost(tenantSlug, '/disponibilites', dispo);
          successCount++;
        } catch (error) {
          // Vérifier si c'est une erreur de conflit (409)
          if (error.response && error.response.status === 409) {
            conflictCount++;
            const conflictDetail = error.response.data;
            console.log(`Conflit détecté pour ${dispo.date}:`, conflictDetail);
            
            // Si c'est le premier conflit, afficher les détails dans un modal
            if (conflictCount === 1 && conflictDetail.conflicts && conflictDetail.conflicts.length > 0) {
              // Afficher le modal avec les détails du conflit
              setConflictData({
                conflicts: conflictDetail.conflicts,
                newItem: conflictDetail.new_item,
                date: dispo.date,
                action_required: conflictDetail.action_required
              });
              setShowConflictModal(true);
              // Arrêter la création si conflit incompatible
              if (conflictDetail.action_required === 'choose') {
                break;
              }
            }
          } else {
            // Autre erreur
            errorCount++;
            console.error(`Erreur lors de la création de la disponibilité pour ${dispo.date}:`, error);
            // Continuer aussi pour les autres erreurs
          }
        }
      }

      // Message récapitulatif
      let message = '';
      if (successCount > 0) {
        message += `${successCount} disponibilité(s) créée(s)`;
      }
      if (conflictCount > 0) {
        message += (message ? ', ' : '') + `${conflictCount} ignorée(s) (conflit)`;
      }
      if (errorCount > 0) {
        message += (message ? ', ' : '') + `${errorCount} erreur(s)`;
      }

      toast({
        title: successCount > 0 ? "Disponibilité(s) ajoutée(s)" : "Attention",
        description: message || "Aucune disponibilité créée",
        variant: successCount > 0 ? "default" : "destructive"
      });

      // Recharger les disponibilités
      const disponibilitesData = await apiGet(tenantSlug, `/disponibilites/${selectedUser.id}`);
      setUserDisponibilites(disponibilitesData);

      // Réinitialiser le formulaire
      setNewDisponibilite({
        date: new Date().toISOString().split('T')[0],
        heure_debut: '08:00',
        heure_fin: '17:00',
        statut: 'disponible',
        recurrence: false,
        type_recurrence: 'hebdomadaire',
        jours_semaine: [],
        bi_hebdomadaire: false,
        date_fin: ''
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'ajouter la disponibilité",
        variant: "destructive"
      });
    }
  };

  // Fonction pour résoudre les conflits de disponibilités
  const handleResolveConflict = async (action) => {
    try {
      if (action === 'annuler') {
        setShowConflictModal(false);
        setConflictData({ conflicts: [], newItem: null, itemType: null });
        return;
      }

      const conflict_ids = conflictData.conflicts.map(c => c.conflict_id);
      
      const response = await apiPost(tenantSlug, '/disponibilites/resolve-conflict', {
        action: action,
        new_item: conflictData.newItem,
        conflict_ids: conflict_ids
      });

      toast({
        title: "Résolution réussie",
        description: response.message,
        variant: "default"
      });

      // Recharger les disponibilités
      if (selectedUser) {
        const disponibilitesData = await apiGet(tenantSlug, `/disponibilites/${selectedUser.id}`);
        setUserDisponibilites(disponibilitesData);
      }

      // Fermer le modal
      setShowConflictModal(false);
      setConflictData({ conflicts: [], newItem: null, itemType: null });

      // Réinitialiser le formulaire
      setNewDisponibilite({
        date: new Date().toISOString().split('T')[0],
        heure_debut: '08:00',
        heure_fin: '17:00',
        statut: 'disponible',
        recurrence: false,
        type_recurrence: 'hebdomadaire',
        jours_semaine: [],
        bi_hebdomadaire: false,
        date_fin: ''
      });

    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de résoudre le conflit",
        variant: "destructive"
      });
    }
  };

  // Fonction pour générer les disponibilités récurrentes
  const generateRecurringDisponibilites = (config, userId) => {
    const disponibilites = [];
    // Parser les dates en timezone local (pas UTC) pour éviter décalage d'un jour
    const [startYear, startMonth, startDay] = config.date.split('-').map(Number);
    const startDate = new Date(startYear, startMonth - 1, startDay);
    const [endYear, endMonth, endDay] = config.date_fin.split('-').map(Number);
    const endDate = new Date(endYear, endMonth - 1, endDay);

    if (config.type_recurrence === 'hebdomadaire') {
      // Pour chaque jour sélectionné
      config.jours_semaine.forEach(jourIndex => {
        let currentDate = new Date(startDate);
        
        // Trouver le premier jour correspondant
        while (currentDate.getDay() !== jourIndex) {
          currentDate.setDate(currentDate.getDate() + 1);
        }

        let weekCounter = 0;
        // Générer les occurrences
        while (currentDate <= endDate) {
          // Si bi-hebdomadaire, ne créer qu'une semaine sur deux
          if (!config.bi_hebdomadaire || weekCounter % 2 === 0) {
            disponibilites.push({
              date: formatDateLocal(currentDate),
              heure_debut: config.heure_debut,
              heure_fin: config.heure_fin,
              statut: config.statut,
              user_id: userId
            });
          }
          // Avancer d'une semaine (7 jours)
          currentDate.setDate(currentDate.getDate() + 7);
          weekCounter++;
        }
      });
    } else if (config.type_recurrence === 'mensuelle') {
      // Récurrence mensuelle (même jour du mois)
      let currentDate = new Date(startDate);
      const dayOfMonth = startDate.getDate();

      while (currentDate <= endDate) {
        disponibilites.push({
          date: formatDateLocal(currentDate),
          heure_debut: config.heure_debut,
          heure_fin: config.heure_fin,
          statut: config.statut,
          user_id: userId
        });

        // Passer au mois suivant
        currentDate.setMonth(currentDate.getMonth() + 1);
        // Garder le même jour du mois
        currentDate.setDate(dayOfMonth);
      }
    }

    return disponibilites;
  };

  const handleDeleteDisponibilite = async (disponibiliteId) => {
    try {
      await apiDelete(tenantSlug, `/disponibilites/${disponibiliteId}`);

      toast({
        title: "Disponibilité supprimée",
        description: "La disponibilité a été supprimée avec succès"
      });

      // Recharger les disponibilités
      const disponibilitesData = await apiGet(tenantSlug, `/disponibilites/${selectedUser.id}`);
      setUserDisponibilites(disponibilitesData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la disponibilité",
        variant: "destructive"
      });
    }
  };

  // Fonctions de gestion des EPI
  const handleViewEPI = async (user) => {
    try {
      const episData = await apiGet(tenantSlug, `/epi/employe/${user.id}`);
      setUserEPIs(episData);
      setSelectedUser(user);
      setShowEPIModal(true);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les EPI",
        variant: "destructive"
      });
    }
  };

  const handleAddEPI = () => {
    setShowAddEPIModal(true);
  };

  const handleCreateEPI = async () => {
    if (!newEPI.type_epi || !newEPI.taille || !newEPI.date_attribution || !newEPI.date_expiration) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive"
      });
      return;
    }

    try {
      await apiPost(tenantSlug, '/epi', {
        ...newEPI,
        employe_id: selectedUser.id
      });
      
      toast({
        title: "EPI ajouté",
        description: "L'équipement a été ajouté avec succès",
        variant: "success"
      });
      
      setShowAddEPIModal(false);
      resetNewEPI();
      
      // Recharger les EPI
      const episData = await apiGet(tenantSlug, `/epi/employe/${selectedUser.id}`);
      setUserEPIs(episData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.detail || error.message || "Impossible d'ajouter l'EPI",
        variant: "destructive"
      });
    }
  };

  const handleUpdateEPITaille = async (epiId, newTaille) => {
    try {
      await apiPut(tenantSlug, `/epi/${epiId}`, {
        taille: newTaille
      });
      
      toast({
        title: "Taille mise à jour",
        description: "La taille de l'EPI a été modifiée",
        variant: "success"
      });
      
      // Recharger les EPI
      const episData = await apiGet(tenantSlug, `/epi/employe/${selectedUser.id}`);
      setUserEPIs(episData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de modifier la taille",
        variant: "destructive"
      });
    }
  };

  const handleDeleteEPI = async (epiId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cet EPI ?")) {
      return;
    }

    try {
      await apiDelete(tenantSlug, `/epi/${epiId}`);
      
      toast({
        title: "EPI supprimé",
        description: "L'équipement a été supprimé",
        variant: "success"
      });
      
      // Recharger les EPI
      const episData = await apiGet(tenantSlug, `/epi/employe/${selectedUser.id}`);
      setUserEPIs(episData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer l'EPI",
        variant: "destructive"
      });
    }
  };

  const resetNewEPI = () => {
    setNewEPI({
      type_epi: '',
      taille: '',
      date_attribution: new Date().toISOString().split('T')[0],
      etat: 'Neuf',
      date_expiration: '',
      date_prochaine_inspection: '',
      notes: ''
    });
  };

  const getAllEPITypes = () => {
    return [
      { id: 'casque', nom: 'Casque', icone: '🪖' },
      { id: 'bottes', nom: 'Bottes', icone: '👢' },
      { id: 'veste_bunker', nom: 'Veste Bunker', icone: '🧥' },
      { id: 'pantalon_bunker', nom: 'Pantalon Bunker', icone: '👖' },
      { id: 'gants', nom: 'Gants', icone: '🧤' },
      { id: 'masque_apria', nom: 'Facial APRIA', icone: '😷' },
      { id: 'cagoule', nom: 'Cagoule Anti-Particules', icone: '🎭' }
    ];
  };

  const getEPINom = (typeEpi) => {
    const noms = {
      'casque': 'Casque',
      'bottes': 'Bottes',
      'veste_bunker': 'Veste Bunker',
      'pantalon_bunker': 'Pantalon Bunker',
      'gants': 'Gants',
      'masque_apria': 'Facial APRIA',
      'cagoule': 'Cagoule Anti-Particules'
    };
    return noms[typeEpi] || typeEpi;
  };

  const getEPIIcone = (typeEpi) => {
    const icones = {
      'casque': '🪖',
      'bottes': '👢',
      'veste_bunker': '🧥',
      'pantalon_bunker': '👖',
      'gants': '🧤',
      'masque_apria': '😷',
      'cagoule': '🎭'
    };
    return icones[typeEpi] || '🛡️';
  };

  const getEtatColor = (etat) => {
    const colors = {
      'Neuf': '#10B981',
      'Bon': '#3B82F6',
      'À remplacer': '#F59E0B',
      'Défectueux': '#EF4444'
    };
    return colors[etat] || '#6B7280';
  };

  const getEPITailleForType = (typeEpi) => {
    const epi = userEPIs.find(e => e.type_epi === typeEpi);
    return epi ? epi.taille : '';
  };

  const getFormationName = (formationId) => {
    const formation = formations.find(f => f.id === formationId);
    return formation ? formation.nom : formationId;
  };

  const getCompetenceName = (competenceId) => {
    const competence = competences.find(c => c.id === competenceId);
    if (competence) return competence.nom;
    // Fallback pour compétences obsolètes/supprimées
    return "⚠️ Compétence obsolète";
  };

  const handleFormationToggle = (formationId) => {
    const updatedFormations = newUser.formations.includes(formationId)
      ? newUser.formations.filter(id => id !== formationId)
      : [...newUser.formations, formationId];
    
    setNewUser({...newUser, formations: updatedFormations});
  };

  const translateDay = (day) => {
    const translations = {
      'monday': 'Lundi', 'tuesday': 'Mardi', 'wednesday': 'Mercredi',
      'thursday': 'Jeudi', 'friday': 'Vendredi', 'saturday': 'Samedi', 'sunday': 'Dimanche'
    };
    return translations[day] || day;
  };

  const getStatusColor = (statut) => statut === 'Actif' ? '#10B981' : '#EF4444';
  const getGradeColor = (grade) => {
    const colors = {
      'Directeur': '#8B5CF6', 'Capitaine': '#3B82F6', 'Lieutenant': '#F59E0B', 'Pompier': '#10B981'
    };
    return colors[grade] || '#6B7280';
  };

  if (loading) return <div className="loading" data-testid="personnel-loading">Chargement...</div>;

  const filteredUsers = getFilteredUsers();
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.statut === 'Actif').length;
  const tempsPlein = users.filter(u => u.type_emploi === 'temps_plein').length;
  const tempsPartiel = users.filter(u => u.type_emploi === 'temps_partiel' || u.type_emploi === 'temporaire').length;

  return (
    <div className="personnel-refonte">
      {/* Header */}
      <div className="module-header">
        <div>
          <h1>👥 Gestion du Personnel</h1>
          <p>Liste complète des pompiers du service</p>
        </div>
        <Button 
          onClick={() => setShowCreateModal(true)}
          data-testid="add-personnel-btn"
        >
          ➕ Nouveau pompier
        </Button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{marginBottom: '2rem'}}>
        <div className="kpi-card" style={{background: '#FCA5A5'}}>
          <h3>{totalUsers}</h3>
          <p>Total Personnel</p>
        </div>
        <div className="kpi-card" style={{background: '#D1FAE5'}}>
          <h3>{activeUsers}</h3>
          <p>Personnel Actif</p>
        </div>
        <div className="kpi-card" style={{background: '#DBEAFE'}}>
          <h3>{tempsPlein}</h3>
          <p>Temps Plein</p>
        </div>
        <div className="kpi-card" style={{background: '#FEF3C7'}}>
          <h3>{tempsPartiel}</h3>
          <p>Temps Partiel</p>
        </div>
      </div>

      {/* Barre de contrôles */}
      <div className="personnel-controls">
        <div style={{display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap'}}>
          <div style={{flex: 1, minWidth: '150px', maxWidth: '100%'}}>
            <Input 
              placeholder="🔍 Rechercher par nom, email, grade..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{width: '100%', boxSizing: 'border-box'}}
            />
          </div>
          
          {/* Toggle Vue */}
          <div className="view-toggle">
            <button 
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
              title="Vue Liste"
            >
              ☰
            </button>
            <button 
              className={viewMode === 'cards' ? 'active' : ''}
              onClick={() => setViewMode('cards')}
              title="Vue Cartes"
            >
              ⊞
            </button>
          </div>

          {/* Exports */}
          <Button variant="outline" onClick={() => handleOpenExportModal('pdf')}>
            📄 Export PDF
          </Button>
          <Button variant="outline" onClick={() => handleOpenExportModal('excel')}>
            📊 Export Excel
          </Button>
        </div>
      </div>

      {/* Vue Liste */}
      {viewMode === 'list' && (
        <div className="personnel-table-modern">
          <div className="table-header-modern">
            <div>Pompier</div>
            <div>Grade / N° Employé</div>
            <div>Contact</div>
            <div>Statut</div>
            <div>Type Emploi</div>
            <div>Actions</div>
          </div>

          {filteredUsers.map(user => (
            <div key={user.id} className="table-row-modern" data-testid={`user-row-${user.id}`}>
              <div className="user-cell-modern">
                <div className="user-avatar-modern" style={{
                  overflow: 'hidden',
                  background: user.photo_profil ? 'transparent' : '#e5e7eb'
                }}>
                  {user.photo_profil ? (
                    <img 
                      src={user.photo_profil} 
                      alt={`${user.prenom} ${user.nom}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                    />
                  ) : (
                    '👤'
                  )}
                </div>
                <div>
                  <p className="user-name-modern">
                    {user.prenom} {user.nom}
                    {user.est_preventionniste && (
                      <span 
                        title="Préventionniste" 
                        style={{
                          marginLeft: '0.5rem',
                          fontSize: '0.875rem',
                          opacity: 0.7
                        }}
                      >
                        🎯
                      </span>
                    )}
                  </p>
                  <p className="user-detail-modern">Embauché le {user.date_embauche}</p>
                </div>
              </div>

              <div className="cell-modern">
                <p style={{fontWeight: '600'}}>{user.grade}</p>
                <p className="user-detail-modern">N° {user.numero_employe}</p>
              </div>

              <div className="cell-modern">
                <p className="email-truncated" title={user.email}>{user.email}</p>
                <p className="user-detail-modern">{user.telephone}</p>
              </div>

              <div className="cell-modern">
                <span className={`badge-status ${user.statut === 'Actif' ? 'actif' : 'inactif'}`}>
                  {user.statut}
                </span>
              </div>

              <div className="cell-modern">
                <span className={`badge-emploi ${user.type_emploi === 'temps_plein' ? 'tp' : user.type_emploi === 'temporaire' ? 'temp' : 'tpa'}`}>
                  {user.type_emploi === 'temps_plein' ? 'Temps plein' : user.type_emploi === 'temporaire' ? 'Temporaire' : 'Temps partiel'}
                </span>
              </div>

              <div className="actions-cell-modern">
                <button onClick={() => handleViewUser(user)} title="Voir">👁️</button>
                <button onClick={() => handleEditUser(user)} title="Modifier">✏️</button>
                <button onClick={() => handleDeleteUser(user.id)} title="Supprimer">🗑️</button>
                {(user.type_emploi === 'temps_partiel' || user.type_emploi === 'temporaire') && (
                  <button onClick={() => handleManageDisponibilites(user)} title="Gérer dispo">📅</button>
                )}
              </div>
            </div>
          ))}

          {filteredUsers.length === 0 && (
            <div className="empty-state">
              <p>Aucun pompier trouvé</p>
            </div>
          )}
        </div>
      )}

      {/* Vue Cartes */}
      {viewMode === 'cards' && (
        <div className="personnel-cards-grid">
          {filteredUsers.map(user => (
            <div key={user.id} className="personnel-card" data-testid={`user-card-${user.id}`}>
              <div className="card-header">
                <div className="user-avatar-card" style={{
                  overflow: 'hidden',
                  background: user.photo_profil ? 'transparent' : '#e5e7eb'
                }}>
                  {user.photo_profil ? (
                    <img 
                      src={user.photo_profil} 
                      alt={`${user.prenom} ${user.nom}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                    />
                  ) : (
                    '👤'
                  )}
                </div>
                <div>
                  <h3>
                    {user.prenom} {user.nom}
                    {user.est_preventionniste && (
                      <span 
                        title="Préventionniste" 
                        style={{
                          marginLeft: '0.5rem',
                          fontSize: '0.875rem',
                          opacity: 0.7
                        }}
                      >
                        🎯
                      </span>
                    )}
                  </h3>
                  <p className="card-grade">{user.grade}</p>
                </div>
                <span className={`badge-status ${user.statut === 'Actif' ? 'actif' : 'inactif'}`}>
                  {user.statut}
                </span>
              </div>

              <div className="card-body">
                <div className="card-info-item">
                  <span className="info-label">Email:</span>
                  <span className="info-value">{user.email}</span>
                </div>
                <div className="card-info-item">
                  <span className="info-label">Téléphone:</span>
                  <span className="info-value">{user.telephone}</span>
                </div>
                <div className="card-info-item">
                  <span className="info-label">Type emploi:</span>
                  <span className={`badge-emploi ${user.type_emploi === 'temps_plein' ? 'tp' : user.type_emploi === 'temporaire' ? 'temp' : 'tpa'}`}>
                    {user.type_emploi === 'temps_plein' ? 'Temps plein' : user.type_emploi === 'temporaire' ? 'Temporaire' : 'Temps partiel'}
                  </span>
                </div>
                <div className="card-info-item">
                  <span className="info-label">N° Employé:</span>
                  <span className="info-value">{user.numero_employe}</span>
                </div>
              </div>

              <div className="card-footer">
                <Button size="sm" variant="outline" onClick={() => handleViewUser(user)}>
                  👁️ Voir
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleEditUser(user)}>
                  ✏️ Modifier
                </Button>
                {(user.type_emploi === 'temps_partiel' || user.type_emploi === 'temporaire') && (
                  <Button size="sm" variant="outline" onClick={() => handleManageDisponibilites(user)}>
                    📅 Dispo
                  </Button>
                )}
              </div>
            </div>
          ))}

          {filteredUsers.length === 0 && (
            <div className="empty-state" style={{gridColumn: '1 / -1'}}>
              <p>Aucun pompier trouvé</p>
            </div>
          )}
        </div>
      )}

      {/* Create User Modal - Version optimisée */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content extra-large-modal" onClick={(e) => e.stopPropagation()} data-testid="create-user-modal">
            <div className="modal-header">
              <h3>🚒 Nouveau pompier</h3>
              <Button variant="ghost" onClick={() => setShowCreateModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="personnel-form-grid">
                {/* Section 1: Informations personnelles */}
                <div className="form-section">
                  <h4 className="section-title">👤 Informations personnelles</h4>
                  <div className="form-row">
                    <div className="form-field">
                      <Label>Prénom *</Label>
                      <Input
                        value={newUser.prenom}
                        onChange={(e) => setNewUser({...newUser, prenom: e.target.value})}
                        placeholder="Ex: Pierre"
                        data-testid="user-prenom-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Nom *</Label>
                      <Input
                        value={newUser.nom}
                        onChange={(e) => setNewUser({...newUser, nom: e.target.value})}
                        placeholder="Ex: Dupont"
                        data-testid="user-nom-input"
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                      placeholder="ex: pierre.dupont@firemanager.ca"
                      data-testid="user-email-input"
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-field">
                      <Label>Téléphone</Label>
                      <Input
                        value={newUser.telephone}
                        onChange={(e) => setNewUser({...newUser, telephone: e.target.value})}
                        placeholder="Ex: 514-555-1234"
                        data-testid="user-phone-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Adresse</Label>
                      <Input
                        value={newUser.adresse}
                        onChange={(e) => setNewUser({...newUser, adresse: e.target.value})}
                        placeholder="123 Rue Principale, Ville, Province"
                        data-testid="user-address-input"
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <Label>Contact d'urgence</Label>
                    <Input
                      value={newUser.contact_urgence}
                      onChange={(e) => setNewUser({...newUser, contact_urgence: e.target.value})}
                      placeholder="Nom et téléphone du contact d'urgence"
                      data-testid="user-emergency-input"
                    />
                  </div>
                </div>

                {/* Section 2: Informations professionnelles */}
                <div className="form-section">
                  <h4 className="section-title">🎖️ Informations professionnelles</h4>
                  <div className="form-row">
                    <div className="form-field">
                      <Label>Grade *</Label>
                      <select
                        value={newUser.grade}
                        onChange={(e) => setNewUser({...newUser, grade: e.target.value})}
                        className="form-select"
                        data-testid="user-grade-select"
                      >
                        <option value="">Sélectionner un grade</option>
                        {grades.map(grade => (
                          <option key={grade.id} value={grade.nom}>{grade.nom}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-field">
                      <Label>Type d'emploi *</Label>
                      <select
                        value={newUser.type_emploi}
                        onChange={(e) => setNewUser({...newUser, type_emploi: e.target.value, equipe_garde: null})}
                        className="form-select"
                        data-testid="user-employment-select"
                      >
                        <option value="">Sélectionner le type</option>
                        <option value="temps_plein">Temps plein</option>
                        <option value="temps_partiel">Temps partiel</option>
                        <option value="temporaire">Temporaire</option>
                      </select>
                    </div>
                  </div>

                  {/* Sélection équipe de garde - affiché si le système est actif ET la rotation du type d'emploi est active */}
                  {equipesGardeParams?.actif && newUser.type_emploi && (
                    (newUser.type_emploi === 'temps_plein' && equipesGardeParams?.temps_plein?.rotation_active) ||
                    (newUser.type_emploi !== 'temps_plein' && equipesGardeParams?.temps_partiel?.rotation_active)
                  ) && (
                    <div className="form-field">
                      <Label>Équipe de garde</Label>
                      <select
                        value={newUser.equipe_garde || ''}
                        onChange={(e) => setNewUser({...newUser, equipe_garde: e.target.value ? parseInt(e.target.value) : null})}
                        className="form-select"
                        data-testid="user-equipe-garde-select"
                      >
                        <option value="">Aucune équipe</option>
                        {(newUser.type_emploi === 'temps_plein' 
                          ? equipesGardeParams?.temps_plein?.equipes_config 
                          : equipesGardeParams?.temps_partiel?.equipes_config
                        )?.map((equipe) => (
                          <option key={equipe.numero} value={equipe.numero}>
                            {equipe.numero} - {equipe.nom}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Assigner cet employé à une équipe de garde pour le planning automatique
                      </p>
                    </div>
                  )}

                  {/* Option fonction supérieur pour les pompiers */}
                  {['Pompier', 'Lieutenant', 'Capitaine', 'Chef de division'].includes(newUser.grade) && (
                    <div className="form-field">
                      <div className="fonction-superieur-option">
                        <label className="fonction-checkbox">
                          <input
                            type="checkbox"
                            checked={newUser.fonction_superieur}
                            onChange={(e) => setNewUser({...newUser, fonction_superieur: e.target.checked})}
                            data-testid="user-fonction-superieur"
                          />
                          <div className="fonction-content">
                            <span className="fonction-title">🎖️ Fonction supérieur</span>
                            <span className="fonction-description">
                              {newUser.grade === 'Pompier' && "Ce pompier peut agir comme Lieutenant en dernier recours dans les affectations"}
                              {newUser.grade === 'Lieutenant' && "Ce lieutenant peut couvrir un poste de Capitaine en cas de besoin"}
                              {newUser.grade === 'Capitaine' && "Ce capitaine peut couvrir un poste de Chef de division en cas de besoin"}
                              {newUser.grade === 'Chef de division' && "Ce chef peut couvrir un poste de directeur en cas de besoin"}
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Option préventionniste (admin seulement) */}
                  {user.role === 'admin' && (
                    <div className="form-field">
                      <div className="fonction-superieur-option">
                        <label className="fonction-checkbox">
                          <input
                            type="checkbox"
                            checked={newUser.est_preventionniste || false}
                            onChange={(e) => setNewUser({...newUser, est_preventionniste: e.target.checked})}
                            data-testid="user-est-preventionniste"
                          />
                          <div className="fonction-content">
                            <span className="fonction-title">🎯 Préventionniste</span>
                            <span className="fonction-description">
                              Désigner cet employé comme préventionniste (module Prévention)
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="form-row">
                    <div className="form-field">
                      <Label>Numéro d'employé</Label>
                      <Input
                        value={newUser.numero_employe}
                        onChange={(e) => setNewUser({...newUser, numero_employe: e.target.value})}
                        placeholder="Ex: POM001 (automatique si vide)"
                        data-testid="user-number-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Date d'embauche *</Label>
                      <Input
                        type="date"
                        value={newUser.date_embauche}
                        onChange={(e) => setNewUser({...newUser, date_embauche: e.target.value})}
                        data-testid="user-hire-date-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Taux horaire ($/h)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={newUser.taux_horaire || ''}
                        onChange={(e) => setNewUser({...newUser, taux_horaire: parseFloat(e.target.value) || 0})}
                        placeholder="Ex: 25.50"
                        data-testid="user-taux-horaire-input"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2.5: Préférences gardes externes */}
                <div className="form-section">
                  <h4 className="section-title">⚡ Préférences d'assignation</h4>
                  <div className="form-field">
                    <div className="garde-externe-option">
                      <label className="garde-externe-checkbox">
                        <input
                          type="checkbox"
                          checked={newUser.accepte_gardes_externes !== false} // True par défaut
                          onChange={(e) => setNewUser({...newUser, accepte_gardes_externes: e.target.checked})}
                          data-testid="user-accepte-gardes-externes"
                        />
                        <div className="garde-externe-content">
                          <span className="garde-externe-title">🏠 Accepter les gardes externes</span>
                          <span className="garde-externe-description">
                            {newUser.type_emploi === 'temps_partiel' 
                              ? "Temps partiel: Requis pour être assigné aux gardes externes (en plus des disponibilités)"
                              : newUser.type_emploi === 'temps_plein'
                                ? "Temps plein: Permet d'être assigné automatiquement aux gardes externes"
                                : "Permet d'être assigné aux gardes externes (astreinte à domicile)"
                            }
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Section 3: Compétences et formations - Version compacte */}
                <div className="form-section">
                  <h4 className="section-title">📜 Compétences et certifications</h4>
                  <div className="formations-compact-grid">
                    {formations.map(formation => (
                      <label key={formation.id} className="formation-compact-item">
                        <input
                          type="checkbox"
                          checked={newUser.formations.includes(formation.id)}
                          onChange={() => handleFormationToggle(formation.id)}
                          data-testid={`formation-${formation.id}`}
                        />
                        <div className="formation-compact-content">
                          <div className="formation-compact-header">
                            <span className="formation-compact-name">{formation.nom}</span>
                            {formation.obligatoire && (
                              <span className="compact-obligatoire">OBL</span>
                            )}
                          </div>
                          <div className="formation-compact-meta">
                            <span>{formation.heures_requises_annuelles || 0}h/an</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="formations-summary">
                    <span className="summary-text">
                      {newUser.formations.length} compétence(s) sélectionnée(s)
                    </span>
                  </div>
                </div>

                {/* Section 4: EPI (Équipements de Protection Individuels) - Optionnel */}
                <div className="form-section">
                  <h4 className="section-title">🛡️ Tailles des EPI (Optionnel)</h4>
                  <p className="section-description">Les tailles peuvent être saisies maintenant ou ajoutées plus tard</p>
                  
                  <div className="epi-tailles-grid-modal">
                    {getAllEPITypes().map(epiType => (
                      <div key={epiType.id} className="epi-taille-row">
                        <span className="epi-taille-icon-modal">{epiType.icone}</span>
                        <Label className="epi-taille-label-modal">{epiType.nom}</Label>
                        <Input
                          placeholder="Taille (optionnel)"
                          value={newUser[`taille_${epiType.id}`] || ''}
                          onChange={(e) => setNewUser({...newUser, [`taille_${epiType.id}`]: e.target.value})}
                          className="epi-taille-input-modal"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  Annuler
                </Button>
                <Button variant="default" onClick={handleCreateUser} data-testid="submit-user-btn">
                  🚒 Créer le pompier
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View User Modal - Version modernisée */}
      {showViewModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="view-user-modal">
            <div className="modal-header">
              <h3>👤 Profil de {selectedUser.prenom} {selectedUser.nom}</h3>
              <Button variant="ghost" onClick={() => setShowViewModal(false)}>✕</Button>
            </div>
            <div className="modal-body modal-body-optimized">
              <div className="user-profile-view">
                {/* Header stylé */}
                <div className="profile-summary-compact">
                  <div className="profile-avatar-medium">
                    <span className="avatar-icon-medium">👤</span>
                  </div>
                  <div className="profile-info-summary">
                    <h4>{selectedUser.prenom} {selectedUser.nom}</h4>
                    <div className="profile-badges">
                      <span className="grade-badge" style={{ backgroundColor: getGradeColor(selectedUser.grade) }}>
                        {selectedUser.grade}
                      </span>
                      <span className="employment-badge">
                        {selectedUser.type_emploi === 'temps_plein' ? 'Temps plein' : selectedUser.type_emploi === 'temporaire' ? 'Temporaire' : 'Temps partiel'}
                      </span>
                      <span className={`status-badge ${selectedUser.statut.toLowerCase()}`}>
                        {selectedUser.statut}
                      </span>
                    </div>
                    <p className="employee-id">#{selectedUser.numero_employe}</p>
                  </div>
                </div>

                {/* Grille 2 colonnes pour TOUTES les sections */}
                <div className="profile-details-grid-optimized">
                  {/* Colonne gauche */}
                  <div className="detail-column" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div className="detail-section detail-section-optimized" style={{ marginBottom: '1.5rem' }}>
                      <h5>📞 Contact</h5>
                      <div className="detail-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Email</span>
                          <span className="detail-value" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1 }}>{selectedUser.email}</span>
                        </div>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Téléphone</span>
                          <span className="detail-value" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1 }}>{selectedUser.telephone || 'Non renseigné'}</span>
                        </div>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Adresse</span>
                          <span className="detail-value" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1 }}>{selectedUser.adresse || 'Non renseignée'}</span>
                        </div>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Contact d'urgence</span>
                          <span className="detail-value emergency" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1 }}>{selectedUser.contact_urgence || 'Non renseigné'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="detail-section detail-section-optimized" style={{ marginBottom: '1.5rem' }}>
                      <h5>📜 Compétences</h5>
                      {selectedUser.competences?.length > 0 ? (
                        <div className="competences-view-optimized">
                          {selectedUser.competences.map((competenceId, index) => (
                            <div key={index} className="competence-badge-optimized">
                              <span className="competence-name">{getCompetenceName(competenceId)}</span>
                              <span className="competence-status">✅</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="no-data-text">Aucune compétence enregistrée</p>
                      )}
                    </div>
                  </div>

                  {/* Colonne droite */}
                  <div className="detail-column" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div className="detail-section detail-section-optimized" style={{ marginBottom: '1.5rem' }}>
                      <h5>🎖️ Professionnel</h5>
                      <div className="detail-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Date d'embauche</span>
                          <span className="detail-value" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1 }}>{selectedUser.date_embauche}</span>
                        </div>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Ancienneté</span>
                          <span className="detail-value" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1 }}>
                            {(() => {
                              const embauche = new Date(selectedUser.date_embauche.split('/').reverse().join('-'));
                              const annees = Math.floor((new Date() - embauche) / (365.25 * 24 * 60 * 60 * 1000));
                              return `${annees} an(s)`;
                            })()}
                          </span>
                        </div>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Rôle système</span>
                          <span className="detail-value" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1 }}>
                            {selectedUser.role === 'admin' ? '👑 Administrateur' : 
                             selectedUser.role === 'superviseur' ? '🎖️ Superviseur' : '👤 Employé'}
                          </span>
                        </div>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Taux horaire</span>
                          <span className="detail-value" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1 }}>
                            {selectedUser.taux_horaire ? `${selectedUser.taux_horaire.toFixed(2)} $/h` : 'Non défini'}
                          </span>
                        </div>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Heures max/semaine</span>
                          <span className="detail-value" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <span>{selectedUser.heures_max_semaine || 40}h</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="detail-section detail-section-optimized" style={{ marginBottom: '1.5rem' }}>
                      <h5>📏 Tailles EPI</h5>
                      <p style={{ fontSize: '0.813rem', color: '#64748b', marginBottom: '0.75rem' }}>
                        Tailles déclarées par l'employé dans "Mon profil" (lecture seule)
                      </p>
                      {selectedUser.tailles_epi && Object.keys(selectedUser.tailles_epi).length > 0 ? (
                        <div className="detail-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {getAllEPITypes().map(epiType => {
                            const taille = selectedUser.tailles_epi[epiType.id];
                            if (!taille) return null;
                            return (
                              <div key={epiType.id} className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                                <span className="detail-label" style={{ minWidth: '140px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span>{epiType.icone}</span>
                                  {epiType.nom}
                                </span>
                                <span className="detail-value" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1, fontWeight: '600', color: '#1F2937' }}>
                                  {taille}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="no-data-text">Aucune taille renseignée</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions rapides */}
                <div className="profile-actions">
                  <Button 
                    variant="default" 
                    onClick={() => {
                      setShowViewModal(false);
                      handleEditUser(selectedUser);
                    }}
                    data-testid="quick-edit-user-btn"
                  >
                    ✏️ Modifier ce profil
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de gestion des disponibilités - Admin/Superviseur */}
      {/* Modal supprimé - On utilise maintenant le module complet Mes Disponibilités */}
      
      {false && showManageDisponibilitesModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowManageDisponibilitesModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="manage-disponibilites-modal">
            <div className="modal-header">
              <h3>✏️ Gérer les disponibilités - {selectedUser.prenom} {selectedUser.nom}</h3>
              <Button variant="ghost" onClick={() => setShowManageDisponibilitesModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              {/* Formulaire d'ajout */}
              <div className="add-disponibilite-form" style={{ marginBottom: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                <h4 style={{ marginBottom: '1rem' }}>➕ Ajouter une disponibilité</h4>
                
                {/* Première ligne : Date, heures, statut */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                      {newDisponibilite.recurrence ? 'Date de début' : 'Date'}
                    </label>
                    <input
                      type="date"
                      value={newDisponibilite.date}
                      onChange={(e) => setNewDisponibilite({...newDisponibilite, date: e.target.value})}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Heure début</label>
                    <input
                      type="time"
                      value={newDisponibilite.heure_debut}
                      onChange={(e) => setNewDisponibilite({...newDisponibilite, heure_debut: e.target.value})}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Heure fin</label>
                    <input
                      type="time"
                      value={newDisponibilite.heure_fin}
                      onChange={(e) => setNewDisponibilite({...newDisponibilite, heure_fin: e.target.value})}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Statut</label>
                    <select
                      value={newDisponibilite.statut}
                      onChange={(e) => setNewDisponibilite({...newDisponibilite, statut: e.target.value})}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    >
                      <option value="disponible">✅ Disponible</option>
                      <option value="indisponible">❌ Indisponible</option>
                    </select>
                  </div>
                </div>

                {/* Checkbox récurrence */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newDisponibilite.recurrence}
                      onChange={(e) => setNewDisponibilite({...newDisponibilite, recurrence: e.target.checked})}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ fontWeight: '500', fontSize: '0.95rem' }}>📅 Récurrence (répéter cette disponibilité)</span>
                  </label>
                </div>

                {/* Options de récurrence */}
                {newDisponibilite.recurrence && (
                  <div style={{ padding: '1rem', background: 'white', borderRadius: '8px', border: '2px solid #3b82f6', marginBottom: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Type de récurrence</label>
                        <select
                          value={newDisponibilite.type_recurrence}
                          onChange={(e) => setNewDisponibilite({...newDisponibilite, type_recurrence: e.target.value})}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                        >
                          <option value="hebdomadaire">📅 Hebdomadaire</option>
                          <option value="mensuelle">📆 Mensuelle</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Date de fin *</label>
                        <input
                          type="date"
                          value={newDisponibilite.date_fin}
                          onChange={(e) => setNewDisponibilite({...newDisponibilite, date_fin: e.target.value})}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                        />
                      </div>
                    </div>

                    {/* Sélection des jours pour hebdomadaire */}
                    {newDisponibilite.type_recurrence === 'hebdomadaire' && (
                      <>
                        <div style={{ marginBottom: '1rem' }}>
                          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                            Jours de la semaine *
                          </label>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {[
                              { label: 'Lun', value: 1 },
                              { label: 'Mar', value: 2 },
                              { label: 'Mer', value: 3 },
                              { label: 'Jeu', value: 4 },
                              { label: 'Ven', value: 5 },
                              { label: 'Sam', value: 6 },
                              { label: 'Dim', value: 0 }
                            ].map(jour => (
                              <label 
                                key={jour.value}
                                style={{ 
                                  padding: '0.5rem 1rem', 
                                  borderRadius: '6px', 
                                  border: '2px solid',
                                  borderColor: newDisponibilite.jours_semaine.includes(jour.value) ? '#3b82f6' : '#cbd5e1',
                                  background: newDisponibilite.jours_semaine.includes(jour.value) ? '#dbeafe' : 'white',
                                  cursor: 'pointer',
                                  fontWeight: '500',
                                  fontSize: '0.875rem'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={newDisponibilite.jours_semaine.includes(jour.value)}
                                  onChange={(e) => {
                                    const jours = e.target.checked 
                                      ? [...newDisponibilite.jours_semaine, jour.value]
                                      : newDisponibilite.jours_semaine.filter(j => j !== jour.value);
                                    setNewDisponibilite({...newDisponibilite, jours_semaine: jours});
                                  }}
                                  style={{ display: 'none' }}
                                />
                                {jour.label}
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Option bi-hebdomadaire */}
                        <div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={newDisponibilite.bi_hebdomadaire}
                              onChange={(e) => setNewDisponibilite({...newDisponibilite, bi_hebdomadaire: e.target.checked})}
                              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.875rem' }}>Une semaine sur deux (bi-hebdomadaire)</span>
                          </label>
                        </div>
                      </>
                    )}

                    {newDisponibilite.type_recurrence === 'mensuelle' && (
                      <p style={{ fontSize: '0.875rem', color: '#64748b', fontStyle: 'italic' }}>
                        💡 La disponibilité sera répétée le même jour chaque mois
                      </p>
                    )}
                  </div>
                )}

                {/* Bouton Ajouter */}
                <Button onClick={handleAddDisponibilite} style={{ width: '100%' }}>
                  {newDisponibilite.recurrence ? '➕ Créer les disponibilités récurrentes' : '➕ Ajouter'}
                </Button>
              </div>

              {/* Liste des disponibilités existantes */}
              <div className="disponibilites-list">
                <h4 style={{ marginBottom: '1rem' }}>📋 Disponibilités existantes</h4>
                {userDisponibilites.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {userDisponibilites.sort((a, b) => parseDateLocal(a.date) - parseDateLocal(b.date)).map(dispo => (
                      <div key={dispo.id} style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '150px 120px 120px 150px auto', 
                        gap: '1rem', 
                        padding: '0.75rem', 
                        background: 'white', 
                        border: '1px solid #e2e8f0', 
                        borderRadius: '6px',
                        alignItems: 'center'
                      }}>
                        <div>
                          <strong>{parseDateLocal(dispo.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}</strong>
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                          {dispo.heure_debut}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                          {dispo.heure_fin}
                        </div>
                        <div>
                          <span style={{ 
                            padding: '0.25rem 0.75rem', 
                            borderRadius: '12px', 
                            fontSize: '0.875rem',
                            background: dispo.statut === 'disponible' ? '#dcfce7' : '#fee2e2',
                            color: dispo.statut === 'disponible' ? '#166534' : '#991b1b'
                          }}>
                            {dispo.statut === 'disponible' ? '✅ Disponible' : '❌ Indisponible'}
                          </span>
                        </div>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => handleDeleteDisponibilite(dispo.id)}
                        >
                          🗑️ Supprimer
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
                    <p>Aucune disponibilité renseignée</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EPI Modal - Gestion des équipements */}
      {showEPIModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowEPIModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="epi-modal">
            <div className="modal-header">
              <h3>🛡️ EPI - {selectedUser.prenom} {selectedUser.nom}</h3>
              <Button variant="ghost" onClick={() => setShowEPIModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="epi-management">
                {/* Bouton d'ajout (Admin/Superviseur uniquement) */}
                <div className="epi-header-actions">
                  <Button 
                    onClick={handleAddEPI}
                    data-testid="add-epi-btn"
                  >
                    + Ajouter un EPI
                  </Button>
                </div>

                {/* Liste des EPI */}
                {userEPIs.length > 0 ? (
                  <div className="epi-list">
                    {userEPIs.map(epi => (
                      <div key={epi.id} className="epi-item-card" data-testid={`epi-item-${epi.id}`}>
                        <div className="epi-item-header">
                          <div className="epi-item-icon">{getEPIIcone(epi.type_epi)}</div>
                          <div className="epi-item-title">
                            <h4>{getEPINom(epi.type_epi)}</h4>
                            <span 
                              className="epi-etat-badge" 
                              style={{ backgroundColor: getEtatColor(epi.etat) }}
                            >
                              {epi.etat}
                            </span>
                          </div>
                        </div>

                        <div className="epi-item-details">
                          <div className="epi-detail-row">
                            <span className="epi-label">Taille:</span>
                            <span className="epi-value">{epi.taille}</span>
                          </div>
                          <div className="epi-detail-row">
                            <span className="epi-label">Attribution:</span>
                            <span className="epi-value">{epi.date_attribution}</span>
                          </div>
                          <div className="epi-detail-row">
                            <span className="epi-label">Expiration:</span>
                            <span className="epi-value">{epi.date_expiration}</span>
                          </div>
                          {epi.date_prochaine_inspection && (
                            <div className="epi-detail-row">
                              <span className="epi-label">Prochaine inspection:</span>
                              <span className="epi-value">{epi.date_prochaine_inspection}</span>
                            </div>
                          )}
                          {epi.notes && (
                            <div className="epi-detail-row">
                              <span className="epi-label">Notes:</span>
                              <span className="epi-value">{epi.notes}</span>
                            </div>
                          )}
                        </div>

                        <div className="epi-item-actions">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              const newTaille = prompt("Nouvelle taille:", epi.taille);
                              if (newTaille) handleUpdateEPITaille(epi.id, newTaille);
                            }}
                            data-testid={`update-taille-${epi.id}`}
                          >
                            ✏️ Modifier taille
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => handleDeleteEPI(epi.id)}
                            data-testid={`delete-epi-${epi.id}`}
                          >
                            🗑️ Supprimer
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-epi">
                    <p>Aucun EPI enregistré pour cet employé</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add EPI Modal */}
      {showAddEPIModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowAddEPIModal(false)}>
          <div className="modal-content medium-modal" onClick={(e) => e.stopPropagation()} data-testid="add-epi-modal">
            <div className="modal-header">
              <h3>+ Ajouter un EPI</h3>
              <Button variant="ghost" onClick={() => setShowAddEPIModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-field">
                  <Label>Type d'EPI *</Label>
                  <select
                    value={newEPI.type_epi}
                    onChange={(e) => setNewEPI({...newEPI, type_epi: e.target.value})}
                    className="form-select"
                    data-testid="new-epi-type-select"
                  >
                    <option value="">Sélectionnez un type</option>
                    <option value="casque">🪖 Casque</option>
                    <option value="bottes">👢 Bottes</option>
                    <option value="veste_bunker">🧥 Veste Bunker</option>
                    <option value="pantalon_bunker">👖 Pantalon Bunker</option>
                    <option value="gants">🧤 Gants</option>
                    <option value="masque_apria">😷 Facial APRIA</option>
                    <option value="cagoule">🎭 Cagoule Anti-Particules</option>
                  </select>
                </div>

                <div className="form-field">
                  <Label>Taille *</Label>
                  <Input
                    value={newEPI.taille}
                    onChange={(e) => setNewEPI({...newEPI, taille: e.target.value})}
                    placeholder="Ex: M, L, 42, etc."
                    data-testid="new-epi-taille-input"
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Date d'attribution *</Label>
                    <Input
                      type="date"
                      value={newEPI.date_attribution}
                      onChange={(e) => setNewEPI({...newEPI, date_attribution: e.target.value})}
                      data-testid="new-epi-attribution-input"
                    />
                  </div>

                  <div className="form-field">
                    <Label>État</Label>
                    <select
                      value={newEPI.etat}
                      onChange={(e) => setNewEPI({...newEPI, etat: e.target.value})}
                      className="form-select"
                      data-testid="new-epi-etat-select"
                    >
                      <option value="Neuf">Neuf</option>
                      <option value="Bon">Bon</option>
                      <option value="À remplacer">À remplacer</option>
                      <option value="Défectueux">Défectueux</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Date d'expiration *</Label>
                    <Input
                      type="date"
                      value={newEPI.date_expiration}
                      onChange={(e) => setNewEPI({...newEPI, date_expiration: e.target.value})}
                      data-testid="new-epi-expiration-input"
                    />
                  </div>

                  <div className="form-field">
                    <Label>Prochaine inspection</Label>
                    <Input
                      type="date"
                      value={newEPI.date_prochaine_inspection}
                      onChange={(e) => setNewEPI({...newEPI, date_prochaine_inspection: e.target.value})}
                      data-testid="new-epi-inspection-input"
                    />
                  </div>
                </div>

                <div className="form-field">
                  <Label>Notes</Label>
                  <textarea
                    value={newEPI.notes}
                    onChange={(e) => setNewEPI({...newEPI, notes: e.target.value})}
                    className="form-textarea"
                    rows="3"
                    placeholder="Remarques ou observations..."
                    data-testid="new-epi-notes-input"
                  />
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowAddEPIModal(false)}>
                  Annuler
                </Button>
                <Button onClick={handleCreateEPI} data-testid="create-epi-btn">
                  Ajouter l'EPI
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal - Complet et fonctionnel */}
      {showEditModal && selectedUser && (
        <div className="modal-overlay" onClick={async () => {
          await handleUpdateUser();
        }}>
          <div className="modal-content extra-large-modal" onClick={(e) => e.stopPropagation()} data-testid="edit-user-modal">
            <div className="modal-header">
              <h3>✏️ Modifier {selectedUser.prenom} {selectedUser.nom}</h3>
              <Button variant="ghost" onClick={async () => {
                await handleUpdateUser();
              }}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="personnel-form-grid">
                {/* Section Photo de Profil */}
                <div className="form-section" style={{ gridColumn: '1 / -1' }}>
                  <h4 className="section-title">📷 Photo de profil</h4>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '1.5rem',
                    padding: '0.75rem',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    flexWrap: 'wrap'
                  }}>
                    {/* Photo preview */}
                    <div style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      background: '#e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid #d1d5db',
                      flexShrink: 0
                    }}>
                      {selectedUser?.photo_profil ? (
                        <img 
                          src={selectedUser.photo_profil} 
                          alt="Photo de profil"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span style={{ fontSize: '2rem', color: '#9ca3af' }}>👤</span>
                      )}
                    </div>
                    
                    {/* Boutons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <input
                        type="file"
                        ref={photoInputRef}
                        onChange={handlePhotoSelectAdmin}
                        accept="image/jpeg,image/png,image/webp"
                        
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
                        onClick={() => photoInputRef.current?.click()}
                        disabled={photoUploading}
                      >
                        {photoUploading ? '⏳ Téléversement...' : '📷 Prendre une photo'}
                      </Button>
                      {selectedUser?.photo_profil && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleDeletePhotoAdmin}
                          style={{ color: '#ef4444' }}
                        >
                          🗑️ Supprimer
                        </Button>
                      )}
                    </div>
                    <p style={{ 
                      fontSize: '0.7rem', 
                      color: '#6b7280',
                      margin: 0
                    }}>
                      JPG, PNG ou WEBP • Max 2 MB
                    </p>
                  </div>
                </div>

                {/* Section 1: Informations personnelles */}
                <div className="form-section">
                  <h4 className="section-title">👤 Informations personnelles</h4>
                  <div className="form-row">
                    <div className="form-field">
                      <Label>Prénom *</Label>
                      <Input
                        value={newUser.prenom}
                        onChange={(e) => setNewUser({...newUser, prenom: e.target.value})}
                        data-testid="edit-user-prenom-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Nom *</Label>
                      <Input
                        value={newUser.nom}
                        onChange={(e) => setNewUser({...newUser, nom: e.target.value})}
                        data-testid="edit-user-nom-input"
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                      data-testid="edit-user-email-input"
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-field">
                      <Label>Téléphone</Label>
                      <Input
                        value={newUser.telephone}
                        onChange={(e) => setNewUser({...newUser, telephone: e.target.value})}
                        data-testid="edit-user-phone-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Adresse</Label>
                      <Input
                        value={newUser.adresse}
                        onChange={(e) => setNewUser({...newUser, adresse: e.target.value})}
                        placeholder="123 Rue Principale, Ville, Province"
                        data-testid="edit-user-address-input"
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <Label>Contact d'urgence</Label>
                    <Input
                      value={newUser.contact_urgence}
                      onChange={(e) => setNewUser({...newUser, contact_urgence: e.target.value})}
                      placeholder="Nom et téléphone du contact d'urgence"
                      data-testid="edit-user-emergency-input"
                    />
                  </div>
                </div>

                {/* Section 2: Informations professionnelles */}
                <div className="form-section">
                  <h4 className="section-title">🎖️ Informations professionnelles</h4>
                  <div className="form-row">
                    <div className="form-field">
                      <Label>Grade *</Label>
                      <select
                        value={newUser.grade}
                        onChange={(e) => setNewUser({...newUser, grade: e.target.value})}
                        className="form-select"
                        data-testid="edit-user-grade-select"
                      >
                        {grades.map(grade => (
                          <option key={grade.id} value={grade.nom}>{grade.nom}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-field">
                      <Label>Type d'emploi *</Label>
                      <select
                        value={newUser.type_emploi}
                        onChange={(e) => setNewUser({...newUser, type_emploi: e.target.value, equipe_garde: null})}
                        className="form-select"
                        data-testid="edit-user-employment-select"
                      >
                        <option value="temps_plein">Temps plein</option>
                        <option value="temps_partiel">Temps partiel</option>
                        <option value="temporaire">Temporaire</option>
                      </select>
                    </div>
                  </div>

                  {/* Sélection équipe de garde - affiché si le système est actif ET la rotation du type d'emploi est active */}
                  {equipesGardeParams?.actif && newUser.type_emploi && (
                    (newUser.type_emploi === 'temps_plein' && equipesGardeParams?.temps_plein?.rotation_active) ||
                    (newUser.type_emploi !== 'temps_plein' && equipesGardeParams?.temps_partiel?.rotation_active)
                  ) && (
                    <div className="form-field">
                      <Label>Équipe de garde</Label>
                      <select
                        value={newUser.equipe_garde || ''}
                        onChange={(e) => setNewUser({...newUser, equipe_garde: e.target.value ? parseInt(e.target.value) : null})}
                        className="form-select"
                        data-testid="edit-user-equipe-garde-select"
                      >
                        <option value="">Aucune équipe</option>
                        {(newUser.type_emploi === 'temps_plein' 
                          ? equipesGardeParams?.temps_plein?.equipes_config 
                          : equipesGardeParams?.temps_partiel?.equipes_config
                        )?.map((equipe) => (
                          <option key={equipe.numero} value={equipe.numero}>
                            {equipe.numero} - {equipe.nom}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        Équipe de garde pour le planning automatique
                      </p>
                    </div>
                  )}

                  {/* Option fonction supérieur pour pompiers et officiers */}
                  {['Pompier', 'Lieutenant', 'Capitaine', 'Chef de division'].includes(newUser.grade) && (
                    <div className="form-field">
                      <div className="fonction-superieur-option">
                        <label className="fonction-checkbox">
                          <input
                            type="checkbox"
                            checked={newUser.fonction_superieur}
                            onChange={(e) => setNewUser({...newUser, fonction_superieur: e.target.checked})}
                            data-testid="edit-user-fonction-superieur"
                          />
                          <div className="fonction-content">
                            <span className="fonction-title">🎖️ Fonction supérieur</span>
                            <span className="fonction-description">
                              {newUser.grade === 'Pompier' && "Ce pompier peut agir comme Lieutenant en dernier recours dans les affectations"}
                              {newUser.grade === 'Lieutenant' && "Ce lieutenant peut couvrir un poste de Capitaine en cas de besoin"}
                              {newUser.grade === 'Capitaine' && "Ce capitaine peut couvrir un poste de Chef de division en cas de besoin"}
                              {newUser.grade === 'Chef de division' && "Ce chef peut couvrir un poste de directeur en cas de besoin"}
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Option préventionniste (admin seulement) */}
                  {user.role === 'admin' && (
                    <div className="form-field">
                      <div className="fonction-superieur-option">
                        <label className="fonction-checkbox">
                          <input
                            type="checkbox"
                            checked={newUser.est_preventionniste || false}
                            onChange={(e) => setNewUser({...newUser, est_preventionniste: e.target.checked})}
                            data-testid="edit-user-est-preventionniste"
                          />
                          <div className="fonction-content">
                            <span className="fonction-title">🎯 Préventionniste</span>
                            <span className="fonction-description">
                              Désigner cet employé comme préventionniste (module Prévention)
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="form-row">
                    <div className="form-field">
                      <Label>Numéro d'employé</Label>
                      <Input
                        value={newUser.numero_employe}
                        onChange={(e) => setNewUser({...newUser, numero_employe: e.target.value})}
                        data-testid="edit-user-number-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Date d'embauche *</Label>
                      <Input
                        type="date"
                        value={newUser.date_embauche}
                        onChange={(e) => setNewUser({...newUser, date_embauche: e.target.value})}
                        data-testid="edit-user-hire-date-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Taux horaire ($/h)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={newUser.taux_horaire || ''}
                        onChange={(e) => setNewUser({...newUser, taux_horaire: parseFloat(e.target.value) || 0})}
                        placeholder="Ex: 25.50"
                        data-testid="edit-user-taux-horaire-input"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-field">
                      <Label>Heures maximum par semaine *</Label>
                      <input
                        type="number"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          fontSize: '14px'
                        }}
                        value={newUser.heures_max_semaine !== null && newUser.heures_max_semaine !== undefined 
                          ? newUser.heures_max_semaine 
                          : ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            setNewUser({...newUser, heures_max_semaine: ''});
                          } else {
                            const numValue = parseInt(value);
                            if (!isNaN(numValue)) {
                              setNewUser({...newUser, heures_max_semaine: numValue});
                            }
                          }
                        }}
                        onBlur={(e) => {
                          // Valider à la sortie du champ
                          const value = e.target.value;
                          if (value === '' || parseInt(value) < 5) {
                            setNewUser({...newUser, heures_max_semaine: 5});
                          } else if (parseInt(value) > 168) {
                            setNewUser({...newUser, heures_max_semaine: 168});
                          }
                        }}
                        placeholder="Ex: 40"
                        data-testid="edit-user-heures-max-input"
                        disabled={
                          newUser.type_emploi === 'temps_partiel' || 
                          (newUser.type_emploi === 'temps_plein' && user?.role !== 'admin')
                        }
                      />
                      <small style={{ display: 'block', marginTop: '0.25rem', color: '#64748b', fontSize: '0.875rem' }}>
                        {newUser.type_emploi === 'temps_plein' 
                          ? "Modifiable uniquement par les administrateurs (5-168h)"
                          : "Les employés temps partiel modifient ce champ dans leur profil"}
                      </small>
                    </div>
                  </div>
                </div>

                {/* Section 2.5: Préférences gardes externes */}
                <div className="form-section">
                  <h4 className="section-title">⚡ Préférences d'assignation</h4>
                  <div className="form-field">
                    <div className="garde-externe-option">
                      <label className="garde-externe-checkbox">
                        <input
                          type="checkbox"
                          checked={newUser.accepte_gardes_externes !== false} // True par défaut
                          onChange={(e) => setNewUser({...newUser, accepte_gardes_externes: e.target.checked})}
                          data-testid="edit-user-accepte-gardes-externes"
                        />
                        <div className="garde-externe-content">
                          <span className="garde-externe-title">🏠 Accepter les gardes externes</span>
                          <span className="garde-externe-description">
                            {newUser.type_emploi === 'temps_partiel' 
                              ? "Temps partiel: Requis pour être assigné aux gardes externes (en plus des disponibilités)"
                              : newUser.type_emploi === 'temps_plein'
                                ? "Temps plein: Permet d'être assigné automatiquement aux gardes externes"
                                : "Permet d'être assigné aux gardes externes (astreinte à domicile)"
                            }
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Section 3: Compétences */}
                <div className="form-section">
                  <h4 className="section-title">📜 Compétences et certifications</h4>
                  <div className="formations-compact-grid">
                    {formations.map(formation => (
                      <label key={formation.id} className="formation-compact-item">
                        <input
                          type="checkbox"
                          checked={newUser.formations.includes(formation.id)}
                          onChange={() => handleFormationToggle(formation.id)}
                          data-testid={`edit-formation-${formation.id}`}
                        />
                        <div className="formation-compact-content">
                          <div className="formation-compact-header">
                            <span className="formation-compact-name">{formation.nom}</span>
                            {formation.obligatoire && (
                              <span className="compact-obligatoire">OBL</span>
                            )}
                          </div>
                          <div className="formation-compact-meta">
                            <span>{formation.heures_requises_annuelles || 0}h/an</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="formations-summary">
                    <span className="summary-text">
                      {newUser.formations.length} compétence(s) sélectionnée(s)
                    </span>
                  </div>
                </div>

                {/* Section 4: EPI (Équipements de Protection Individuels) */}
                <div className="form-section">
                  <h4 className="section-title">🛡️ Tailles des EPI</h4>
                  <p className="section-description">Sélectionnez les tailles pour chaque équipement. Ces tailles seront visibles dans "Mon Profil" de l'employé.</p>
                  
                  <div className="epi-tailles-grid-modal">
                    {getAllEPITypes().map(epiType => {
                      const currentValue = (selectedUser.tailles_epi || {})[epiType.id] || '';
                      
                      return (
                        <div key={epiType.id} className="epi-taille-row">
                          <span className="epi-taille-icon-modal">{epiType.icone}</span>
                          <Label className="epi-taille-label-modal">{epiType.nom}</Label>
                          <Input
                            value={currentValue}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              const updatedTailles = {
                                ...(selectedUser.tailles_epi || {}),
                                [epiType.id]: newValue
                              };
                              // Supprimer les tailles vides
                              if (!newValue) {
                                delete updatedTailles[epiType.id];
                              }
                              setSelectedUser({
                                ...selectedUser,
                                tailles_epi: updatedTailles
                              });
                            }}
                            placeholder="Saisir la taille"
                            className="epi-taille-input-modal"
                          />
                        </div>
                      );
                    })}
                  </div>
                  <p className="epi-note-modal">
                    💡 Ces tailles seront synchronisées avec le profil de l'employé
                  </p>
                </div>
              </div>

              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', padding: '1.5rem', borderTop: '1px solid #e5e7eb', background: '#f8fafc' }}>
                <Button 
                  variant="outline" 
                  onClick={() => setShowEditModal(false)}
                  data-testid="cancel-edit-user-btn"
                >
                  Annuler
                </Button>
                <Button 
                  variant="default" 
                  onClick={handleUpdateUser}
                  data-testid="save-edit-user-btn"
                >
                  💾 Enregistrer les modifications
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal Export - Choix entre tout ou individuel */}
      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{maxWidth: '500px'}}>
            <div className="modal-header">
              <h3>📊 Options d'Export {exportType === 'pdf' ? 'PDF' : 'Excel'}</h3>
              <Button variant="ghost" onClick={() => setShowExportModal(false)}>✕</Button>
            </div>
            <div className="modal-body" style={{padding: '2rem'}}>
              <p style={{marginBottom: '1.5rem', color: '#64748b'}}>
                Que souhaitez-vous exporter ?
              </p>
              
              {/* Choix : Tout le personnel */}
              <label 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1.5rem',
                  border: exportScope === 'all' ? '2px solid #FCA5A5' : '2px solid #E5E7EB',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  marginBottom: '1rem',
                  background: exportScope === 'all' ? '#FEF2F2' : 'white',
                  transition: 'all 0.2s ease'
                }}
              >
                <input
                  type="radio"
                  name="exportScope"
                  value="all"
                  checked={exportScope === 'all'}
                  onChange={(e) => setExportScope(e.target.value)}
                  style={{width: '20px', height: '20px', cursor: 'pointer'}}
                />
                <span style={{fontSize: '1.5rem'}}>📋</span>
                <div style={{flex: 1}}>
                  <div style={{fontWeight: '600', fontSize: '1rem'}}>Tout le personnel</div>
                  <div style={{fontSize: '0.875rem', color: '#64748b'}}>
                    Exporter la liste complète ({users.length} pompier{users.length > 1 ? 's' : ''})
                  </div>
                </div>
              </label>

              {/* Choix : Une personne spécifique */}
              <label 
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  padding: '1.5rem',
                  border: exportScope === 'individual' ? '2px solid #FCA5A5' : '2px solid #E5E7EB',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: exportScope === 'individual' ? '#FEF2F2' : 'white',
                  transition: 'all 0.2s ease'
                }}
              >
                <input
                  type="radio"
                  name="exportScope"
                  value="individual"
                  checked={exportScope === 'individual'}
                  onChange={(e) => setExportScope(e.target.value)}
                  style={{width: '20px', height: '20px', cursor: 'pointer', marginTop: '0.25rem'}}
                />
                <span style={{fontSize: '1.5rem'}}>👤</span>
                <div style={{flex: 1}}>
                  <div style={{fontWeight: '600', fontSize: '1rem', marginBottom: '0.5rem'}}>
                    Une personne spécifique
                  </div>
                  {exportScope === 'individual' && (
                    <select
                      value={selectedPersonForExport}
                      onChange={(e) => setSelectedPersonForExport(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: '1px solid #E5E7EB',
                        fontSize: '0.9rem',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">-- Sélectionner une personne --</option>
                      {users.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.prenom} {user.nom} - {user.grade}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </label>

              <div style={{marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end'}}>
                <Button variant="outline" onClick={() => setShowExportModal(false)}>
                  Annuler
                </Button>
                <Button onClick={handleConfirmExport}>
                  {exportType === 'pdf' ? '📄' : '📊'} Exporter
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de prévisualisation PDF/Excel */}
      {showPreviewModal && previewDataUrl && (
        <div 
          className="modal-overlay" 
          onClick={() => {
            setShowPreviewModal(false);
            URL.revokeObjectURL(previewDataUrl);
            setPreviewDataUrl(null);
          }}
          style={{ zIndex: 100001 }}
        >
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()} 
            style={{ 
              maxWidth: previewType === 'pdf' ? '900px' : '500px', 
              width: '95%', 
              height: previewType === 'pdf' ? '90vh' : 'auto',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h3>{previewType === 'pdf' ? '📄' : '📊'} {previewFilename}</h3>
              <Button 
                variant="ghost" 
                onClick={() => {
                  setShowPreviewModal(false);
                  URL.revokeObjectURL(previewDataUrl);
                  setPreviewDataUrl(null);
                }}
              >
                ✕
              </Button>
            </div>
            <div style={{ 
              flex: 1, 
              overflow: 'hidden', 
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center'
            }}>
              {previewType === 'pdf' ? (
                <>
                  <embed
                    src={previewDataUrl}
                    type="application/pdf"
                    style={{
                      width: '100%',
                      height: '100%',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      minHeight: '500px'
                    }}
                  />
                  <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                    Si le PDF ne s'affiche pas, utilisez le bouton ci-dessous pour le télécharger.
                  </p>
                </>
              ) : (
                <>
                  <div style={{ 
                    fontSize: '4rem', 
                    marginBottom: '1rem' 
                  }}>
                    📊
                  </div>
                  <p style={{ 
                    fontSize: '1rem', 
                    color: '#374151',
                    marginBottom: '1.5rem'
                  }}>
                    Votre fichier Excel est prêt !
                  </p>
                </>
              )}
              
              <a 
                href={previewDataUrl} 
                download={previewFilename}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  background: '#dc2626',
                  color: 'white',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '1rem',
                  fontWeight: '600',
                  marginTop: previewType === 'pdf' ? '0' : '0'
                }}
                onClick={() => {
                  toast({
                    title: "Téléchargement lancé",
                    description: `${previewFilename} est en cours de téléchargement`,
                    variant: "success"
                  });
                }}
              >
                📥 Télécharger {previewFilename}
              </a>
              
              <p style={{ 
                marginTop: '1rem', 
                fontSize: '0.75rem', 
                color: '#9ca3af' 
              }}>
                Cliquez sur le bouton ci-dessus pour sauvegarder le fichier sur votre appareil
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal de validation de compétence */}
      {showValidateCompetenceModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowValidateCompetenceModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h3>✅ Valider une Compétence</h3>
              <Button variant="ghost" onClick={() => setShowValidateCompetenceModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', fontSize: '0.875rem' }}>
                <strong>Employé:</strong> {selectedUser.prenom} {selectedUser.nom}
              </p>
              
              <div style={{ marginBottom: '1rem', padding: '1rem', background: '#fef3c7', borderRadius: '8px', border: '1px solid #fbbf24' }}>
                <p style={{ fontSize: '0.875rem', color: '#92400e', margin: 0 }}>
                  ⚠️ <strong>Important:</strong> Cette validation manuelle permet de marquer qu'un employé a acquis une compétence 
                  par un moyen externe (formation externe, équivalence, expérience, etc.). 
                  Une justification est obligatoire pour la traçabilité.
                </p>
              </div>

              <div className="form-field" style={{ marginBottom: '1rem' }}>
                <Label>Compétence *</Label>
                <select
                  value={newValidation.competence_id}
                  onChange={(e) => setNewValidation({...newValidation, competence_id: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="">-- Sélectionner une compétence --</option>
                  {competences.map(comp => (
                    <option key={comp.id} value={comp.id}>{comp.nom}</option>
                  ))}
                </select>
              </div>

              <div className="form-field" style={{ marginBottom: '1rem' }}>
                <Label>Justification * (Formation externe, équivalence, etc.)</Label>
                <textarea
                  value={newValidation.justification}
                  onChange={(e) => setNewValidation({...newValidation, justification: e.target.value})}
                  placeholder="Ex: Formation externe suivie chez XYZ le 15/10/2024 - Certificat disponible"
                  rows="4"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
                <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
                  Décrivez précisément comment la compétence a été acquise (où, quand, document justificatif)
                </small>
              </div>

              <div className="form-field" style={{ marginBottom: '1rem' }}>
                <Label>Date de validation *</Label>
                <Input
                  type="date"
                  value={newValidation.date_validation}
                  onChange={(e) => setNewValidation({...newValidation, date_validation: e.target.value})}
                />
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="outline" onClick={() => setShowValidateCompetenceModal(false)}>
                Annuler
              </Button>
              <Button onClick={handleValidateCompetence}>
                ✅ Valider la Compétence
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de validation de compétence / rattrapage */}
      {showValidateCompetenceModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowValidateCompetenceModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h3>🎖️ Enregistrer un Rattrapage</h3>
              <Button variant="ghost" onClick={() => setShowValidateCompetenceModal(false)}>✕</Button>
            </div>
            
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', color: '#64748b' }}>
                Employé: <strong>{selectedUser.prenom} {selectedUser.nom}</strong>
              </p>
              
              <div className="form-field">
                <Label>Compétence</Label>
                <select
                  value={newValidation.competence_id}
                  onChange={(e) => setNewValidation({...newValidation, competence_id: e.target.value})}
                  className="form-select"
                >
                  <option value="">Sélectionner une compétence</option>
                  {competences.map(comp => (
                    <option key={comp.id} value={comp.id}>{comp.nom}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-field">
                <Label>Justification</Label>
                <textarea
                  value={newValidation.justification}
                  onChange={(e) => setNewValidation({...newValidation, justification: e.target.value})}
                  placeholder="Expliquez pourquoi cette compétence doit être validée manuellement..."
                  rows="4"
                  className="form-input"
                />
              </div>
              
              <div className="form-field">
                <Label>Date de validation</Label>
                <Input
                  type="date"
                  value={newValidation.date_validation}
                  onChange={(e) => setNewValidation({...newValidation, date_validation: e.target.value})}
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <Button variant="outline" onClick={() => setShowValidateCompetenceModal(false)}>
                Annuler
              </Button>
              <Button onClick={handleValidateCompetence}>
                ✅ Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default Personnel;
