import React, { useState, useEffect, lazy, Suspense } from "react";
import axios from "axios";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";
import { useToast } from "../hooks/use-toast";
import { buildApiUrl } from "../utils/api";
import { apiGet, apiPost, apiPut, apiDelete } from "../utils/api";
import { useConfirmDialog } from "./ui/ConfirmDialog";
import Personnalisation from "./Personnalisation.jsx";

// Lazy load des composants pour optimiser les performances
const ParametresAttribution = lazy(() => import("./ParametresAttribution.jsx"));
const ParametresRemplacements = lazy(() => import("./ParametresRemplacements.jsx"));
const ParametresDisponibilites = lazy(() => import("./ParametresDisponibilites.jsx"));
const ParametresFormations = lazy(() => import("./ParametresFormations.jsx"));
const ParametresImports = lazy(() => import("./ParametresImports.jsx"));
const ParametresEquipesGarde = lazy(() => import("./ParametresEquipesGarde.jsx"));
const ParametresFacturation = lazy(() => import("./ParametresFacturation.jsx"));
const ParametresHorairesPersonnalises = lazy(() => import("./ParametresHorairesPersonnalises.jsx"));
import ParametresTypesGarde from "./ParametresTypesGarde";
const EmailsHistory = lazy(() => import("./EmailsHistory.jsx"));
const CasernesSettings = lazy(() => import("./CasernesSettings.jsx"));
const ParametresSecteurs = lazy(() => import("./ParametresSecteurs.jsx"));
const GestionTypesAcces = lazy(() => import("./parametres/GestionTypesAcces.jsx"));
const ParametresGrades = lazy(() => import("./ParametresGrades.jsx"));

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * Composant combiné pour Rotation des équipes + Horaires personnalisés
 */
const RotationEquipesTab = ({ tenantSlug, toast }) => {
  const [subTab, setSubTab] = useState('horaires'); // 'horaires' ou 'configuration'
  
  return (
    <div>
      {/* Sous-navigation */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '20px',
        borderBottom: '2px solid #e5e7eb',
        paddingBottom: '12px'
      }}>
        <button
          onClick={() => setSubTab('horaires')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px 8px 0 0',
            border: 'none',
            background: subTab === 'horaires' ? '#dc2626' : '#f3f4f6',
            color: subTab === 'horaires' ? 'white' : '#374151',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          📆 Horaires de rotation
        </button>
        <button
          onClick={() => setSubTab('configuration')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px 8px 0 0',
            border: 'none',
            background: subTab === 'configuration' ? '#dc2626' : '#f3f4f6',
            color: subTab === 'configuration' ? 'white' : '#374151',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          ⚙️ Configuration des équipes
        </button>
      </div>
      
      {/* Contenu */}
      <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Chargement...</div>}>
        {subTab === 'horaires' && (
          <ParametresHorairesPersonnalises tenantSlug={tenantSlug} toast={toast} />
        )}
        {subTab === 'configuration' && (
          <ParametresEquipesGarde tenantSlug={tenantSlug} toast={toast} />
        )}
      </Suspense>
    </div>
  );
};

/**
 * Composant combiné pour Comptes et Types d'accès
 */
const ComptesEtAccesTab = ({ users, tenantSlug, toast, setShowCreateUserModal, handleEditAccess, handleRevokeUser }) => {
  const [subTab, setSubTab] = useState('utilisateurs'); // 'utilisateurs' ou 'types-acces'
  
  return (
    <div className="comptes-tab">
      <div className="tab-header">
        <div>
          <h2>Comptes et Accès</h2>
          <p>Gestion des utilisateurs et des types d'accès personnalisés</p>
        </div>
        {subTab === 'utilisateurs' && (
          <Button 
            variant="default" 
            onClick={() => setShowCreateUserModal(true)}
            data-testid="create-user-account-btn"
          >
            + Nouveau Compte
          </Button>
        )}
      </div>

      {/* Sous-navigation */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '20px',
        borderBottom: '2px solid #e5e7eb',
        paddingBottom: '12px'
      }}>
        <button
          onClick={() => setSubTab('utilisateurs')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px 8px 0 0',
            border: 'none',
            background: subTab === 'utilisateurs' ? '#dc2626' : '#f3f4f6',
            color: subTab === 'utilisateurs' ? 'white' : '#374151',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          👥 Utilisateurs
        </button>
        <button
          onClick={() => setSubTab('types-acces')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px 8px 0 0',
            border: 'none',
            background: subTab === 'types-acces' ? '#dc2626' : '#f3f4f6',
            color: subTab === 'types-acces' ? 'white' : '#374151',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          🔐 Types d'accès
        </button>
      </div>

      {/* Contenu selon le sous-onglet */}
      {subTab === 'utilisateurs' && (
        <>
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
              {users.map(u => (
                <div key={u.id} className="user-access-card" data-testid={`user-access-${u.id}`}>
                  <div className="user-access-info">
                    <div className="user-avatar">
                      <span className="avatar-icon">👤</span>
                    </div>
                    <div className="user-details">
                      <h4>{u.prenom} {u.nom}</h4>
                      <p className="user-email">{u.email}</p>
                      <div className="user-badges">
                        <span className={`role-badge ${u.role}`}>
                          {u.role === 'admin' ? '👑 Administrateur' : 
                           u.role === 'superviseur' ? '🎖️ Superviseur' : 
                           '👤 Employé'}
                        </span>
                        <span className="grade-badge">{u.grade}</span>
                        <span className="employment-badge">{u.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="user-access-actions">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleEditAccess(u)}
                      data-testid={`modify-access-${u.id}`}
                    >
                      ✏️ Modifier accès
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="danger" 
                      onClick={() => handleRevokeUser(u.id, `${u.prenom} ${u.nom}`)}
                      data-testid={`revoke-access-${u.id}`}
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
        </>
      )}

      {subTab === 'types-acces' && (
        <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Chargement...</div>}>
          <GestionTypesAcces tenantSlug={tenantSlug} toast={toast} />
        </Suspense>
      )}
    </div>
  );
};

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
    montant_garde: null,
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
    montant_garde: null,
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
  const { confirm } = useConfirmDialog();

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
      fetchParametresDisponibilites();
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

  const fetchParametresDisponibilites = async () => {
    try {
      const response = await axios.get(`${API}/parametres/disponibilites`);
      if (response.data) {
        setSystemSettings(prev => ({
          ...prev,
          blocage_dispos_active: response.data.blocage_dispos_active ?? prev.blocage_dispos_active,
          jour_blocage_dispos: response.data.jour_blocage_dispos ?? prev.jour_blocage_dispos,
          exceptions_admin_superviseur: response.data.exceptions_admin_superviseur ?? prev.exceptions_admin_superviseur,
          admin_peut_modifier_temps_partiel: response.data.admin_peut_modifier_temps_partiel ?? prev.admin_peut_modifier_temps_partiel,
          notifications_dispos_actives: response.data.notifications_dispos_actives ?? prev.notifications_dispos_actives,
          jours_avance_notification: response.data.jours_avance_notification ?? prev.jours_avance_notification
        }));
      }
    } catch (error) {
      console.error("Erreur chargement paramètres disponibilités:", error);
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
      officier_obligatoire: false,
      mode_caserne: 'global'
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
        const delaiMinutes = paramsRemplacementsResponse.data.delai_attente_minutes;
        const maxContacts = paramsRemplacementsResponse.data.max_contacts;
        setSystemSettings(prev => ({
          ...prev,
          mode_notification: paramsRemplacementsResponse.data.mode_notification || 'simultane',
          delai_attente_minutes: delaiMinutes || 1440,
          max_personnes_contact: maxContacts || 5,
          quart_ouvert_approbation_requise: paramsRemplacementsResponse.data.quart_ouvert_approbation_requise || false
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
      montant_garde: type.montant_garde || null,
      competences_requises: type.competences_requises || [],
      mode_caserne: type.mode_caserne || 'global'
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
    const confirmed = await confirm({
      title: 'Supprimer le type de garde',
      message: 'Supprimer ce type de garde ?',
      variant: 'danger',
      confirmText: 'Supprimer'
    });
    if (!confirmed) return;
    
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
    const confirmed = await confirm({
      title: 'Supprimer la compétence',
      message: 'Supprimer cette compétence ?',
      variant: 'danger',
      confirmText: 'Supprimer'
    });
    if (!confirmed) return;
    
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
    const confirmed = await confirm({
      title: 'Supprimer le grade',
      message: 'Supprimer ce grade ?',
      variant: 'danger',
      confirmText: 'Supprimer'
    });
    if (!confirmed) return;
    
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
    const confirmed = await confirm({
      title: 'Supprimer la formation',
      message: 'Supprimer cette formation ?',
      variant: 'danger',
      confirmText: 'Supprimer'
    });
    if (!confirmed) return;
    
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
    
    // Sauvegarder dans le backend
    try {
      if (setting.startsWith('niveau_')) {
        // Paramètres d'attribution
        await axios.put(`${API}/parametres/niveaux-attribution`, {
          [setting]: value
        });
      } else if (['mode_notification', 'nombre_simultane', 'delai_relance', 'delai_expiration', 
                  'privilegier_disponibles', 'competences_egales', 'auto_attribution',
                  'delai_attente_minutes', 'max_personnes_contact', 'quart_ouvert_approbation_requise'].includes(setting)) {
        // Paramètres de remplacement - convertir les noms de champs pour le backend
        let backendData = {};
        if (setting === 'delai_attente_minutes') {
          // Envoyer directement en minutes
          backendData = { delai_attente_minutes: value };
        } else if (setting === 'max_personnes_contact') {
          backendData = { max_contacts: value };
        } else {
          backendData = { [setting]: value };
        }
        await axios.put(`${API}/parametres/remplacements`, backendData);
      } else {
        // Autres paramètres système
        await axios.put(`${API}/parametres/systeme`, {
          [setting]: value
        });
      }
      
      toast({
        title: "Paramètre mis à jour",
        description: "La configuration a été sauvegardée",
        variant: "success"
      });
    } catch (error) {
      console.error("Erreur sauvegarde paramètre:", error);
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder la configuration",
        variant: "destructive"
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
        blocage_dispos_active: systemSettings.blocage_dispos_active,
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
    const confirmed = await confirm({
      title: 'Révoquer le compte',
      message: `Êtes-vous sûr de vouloir révoquer définitivement le compte de ${userName} ?\n\nCette action supprimera :\n- Le compte utilisateur\n- Toutes ses disponibilités\n- Ses assignations\n- Ses demandes de remplacement\n\nCette action est IRRÉVERSIBLE.`,
      variant: 'danger',
      confirmText: 'Révoquer définitivement'
    });
    if (!confirmed) return;

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
          { id: 'grades', icon: '🎖️', title: 'Grades', desc: 'Grades et échelle salariale' },
          { id: 'attribution', icon: '📅', title: 'Horaire', desc: 'Attribution auto' },
          { id: 'rotation-equipes', icon: '🔄', title: 'Rotation', desc: 'Équipes & horaires' },
          { id: 'comptes', icon: '🔐', title: 'Comptes et Accès', desc: 'Utilisateurs et permissions' },
          { id: 'remplacements', icon: '🔁', title: 'Remplacements', desc: 'Règles' },
          { id: 'disponibilites', icon: '📅', title: 'Disponibilités', desc: 'Configuration' },
          { id: 'formations', icon: '📚', title: 'Formations', desc: 'NFPA 1500' },
          { id: 'personnalisation', icon: '🎨', title: 'Personnalisation', desc: 'Logo et branding' },
          { id: 'secteurs', icon: '📍', title: 'Secteurs', desc: 'Zones géographiques' },
          { id: 'casernes', icon: '🏢', title: 'Casernes', desc: 'Multi-casernes' },
          { id: 'imports', icon: '📥', title: 'Imports CSV', desc: 'Import en masse' },
          // Onglets admin uniquement
          ...(user?.role === 'admin' ? [
            { id: 'facturation', icon: '💳', title: 'Facturation', desc: 'Abonnement' },
            { id: 'emails-history', icon: '📧', title: 'E-mails', desc: 'Historique' }
          ] : [])
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
          <ParametresTypesGarde
            typesGarde={typesGarde}
            competences={competences}
            editForm={editForm}
            setEditForm={setEditForm}
            createForm={createForm}
            setCreateForm={setCreateForm}
            showEditTypeModal={showEditTypeModal}
            setShowEditTypeModal={setShowEditTypeModal}
            showCreateTypeModal={showCreateTypeModal}
            setShowCreateTypeModal={setShowCreateTypeModal}
            editingItem={editingItem}
            handleEditType={handleEditType}
            handleDeleteType={handleDeleteType}
            handleUpdateType={handleUpdateType}
            handleCreateType={handleCreateType}
            handleCreateJourChange={handleCreateJourChange}
            handleCreateCompetenceChange={handleCreateCompetenceChange}
            handleEditCompetenceChange={handleEditCompetenceChange}
            confirm={confirm}
            joursOptions={joursOptions}
          />
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
          <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Chargement...</div>}>
            <ParametresGrades
              tenantSlug={tenantSlug}
              toast={toast}
              grades={grades}
              setGrades={setGrades}
              handleEditGrade={handleEditGrade}
              handleDeleteGrade={handleDeleteGrade}
              setShowCreateGradeModal={setShowCreateGradeModal}
            />
          </Suspense>
        )}


        {activeTab === 'attribution' && (
          <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Chargement...</div>}>
            <ParametresAttribution
              systemSettings={systemSettings}
              heuresSupParams={heuresSupParams}
              regroupementParams={regroupementParams}
              handleSettingChange={handleSettingChange}
              handleSaveHeuresSupParams={handleSaveHeuresSupParams}
              setHeuresSupParams={setHeuresSupParams}
              setRegroupementParams={setRegroupementParams}
              validationParams={validationParams}
              setValidationParams={setValidationParams}
              handleSaveValidationParams={handleSaveValidationParams}
            />
          </Suspense>
        )}

        {activeTab === 'comptes' && (
          <ComptesEtAccesTab 
            users={users}
            tenantSlug={tenantSlug}
            toast={toast}
            setShowCreateUserModal={setShowCreateUserModal}
            handleEditAccess={handleEditAccess}
            handleRevokeUser={handleRevokeUser}
          />
        )}

        {activeTab === 'rotation-equipes' && (
          <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Chargement...</div>}>
            <RotationEquipesTab tenantSlug={tenantSlug} toast={toast} />
          </Suspense>
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

        {activeTab === 'secteurs' && (
          <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px' }}>Chargement...</div>}>
            <ParametresSecteurs tenantSlug={tenantSlug} toast={toast} />
          </Suspense>
        )}

        {activeTab === 'casernes' && (
          <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px' }}>Chargement...</div>}>
            <CasernesSettings tenantSlug={tenantSlug} toast={toast} apiGet={apiGet} apiPost={apiPost} apiPut={apiPut} apiDelete={apiDelete} />
          </Suspense>
        )}

        {activeTab === 'facturation' && user?.role === 'admin' && (
          <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px' }}>Chargement...</div>}>
            <ParametresFacturation user={user} tenantSlug={tenantSlug} />
          </Suspense>
        )}

        {activeTab === 'emails-history' && user?.role === 'admin' && (
          <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px' }}>Chargement...</div>}>
            <EmailsHistory />
          </Suspense>
        )}

      </div>

      {/* ========== MODALS DE CRÉATION ET ÉDITION ========== */}

      {/* Modal de création de compétence */}
      {showCreateFormationModal && activeTab === 'competences' && (
        <div className="modal-overlay" onClick={() => setShowCreateFormationModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>Créer une nouvelle compétence</h3>
              <button className="close-btn" onClick={() => setShowCreateFormationModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Nom de la compétence *</label>
                <input
                  type="text"
                  value={newFormation.nom || ''}
                  onChange={(e) => setNewFormation({ ...newFormation, nom: e.target.value })}
                  placeholder="Ex: Conduite véhicule lourd"
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Description</label>
                <textarea
                  value={newFormation.description || ''}
                  onChange={(e) => setNewFormation({ ...newFormation, description: e.target.value })}
                  placeholder="Description de la compétence..."
                  rows={3}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Heures requises annuellement</label>
                <input
                  type="number"
                  value={newFormation.duree_heures || 0}
                  onChange={(e) => setNewFormation({ ...newFormation, duree_heures: parseInt(e.target.value) || 0 })}
                  min="0"
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newFormation.obligatoire || false}
                    onChange={(e) => setNewFormation({ ...newFormation, obligatoire: e.target.checked })}
                  />
                  <span>⚠️ Compétence obligatoire</span>
                </label>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <Button variant="outline" onClick={() => setShowCreateFormationModal(false)}>
                Annuler
              </Button>
              <Button variant="default" onClick={handleCreateCompetence}>
                Créer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'édition de compétence */}
      {showEditFormationModal && activeTab === 'competences' && editingItem && (
        <div className="modal-overlay" onClick={() => setShowEditFormationModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>Modifier la compétence</h3>
              <button className="close-btn" onClick={() => setShowEditFormationModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Nom de la compétence *</label>
                <input
                  type="text"
                  value={editFormation.nom || ''}
                  onChange={(e) => setEditFormation({ ...editFormation, nom: e.target.value })}
                  placeholder="Ex: Conduite véhicule lourd"
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Description</label>
                <textarea
                  value={editFormation.description || ''}
                  onChange={(e) => setEditFormation({ ...editFormation, description: e.target.value })}
                  placeholder="Description de la compétence..."
                  rows={3}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Heures requises annuellement</label>
                <input
                  type="number"
                  value={editFormation.duree_heures || 0}
                  onChange={(e) => setEditFormation({ ...editFormation, duree_heures: parseInt(e.target.value) || 0 })}
                  min="0"
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editFormation.obligatoire || false}
                    onChange={(e) => setEditFormation({ ...editFormation, obligatoire: e.target.checked })}
                  />
                  <span>⚠️ Compétence obligatoire</span>
                </label>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <Button variant="outline" onClick={() => setShowEditFormationModal(false)}>
                Annuler
              </Button>
              <Button variant="default" onClick={handleUpdateCompetence}>
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de création de grade */}
      {showCreateGradeModal && (
        <div className="modal-overlay" onClick={() => setShowCreateGradeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3>Créer un nouveau grade</h3>
              <button className="close-btn" onClick={() => setShowCreateGradeModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Nom du grade *</label>
                <input
                  type="text"
                  value={newGrade.nom || ''}
                  onChange={(e) => setNewGrade({ ...newGrade, nom: e.target.value })}
                  placeholder="Ex: Lieutenant"
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Niveau hiérarchique</label>
                <input
                  type="number"
                  value={newGrade.niveau_hierarchique || 1}
                  onChange={(e) => setNewGrade({ ...newGrade, niveau_hierarchique: parseInt(e.target.value) || 1 })}
                  min="1"
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '4px' }}>
                  Plus le niveau est élevé, plus le grade est haut dans la hiérarchie
                </p>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newGrade.est_officier || false}
                    onChange={(e) => setNewGrade({ ...newGrade, est_officier: e.target.checked })}
                  />
                  <span>👮 Ce grade est un grade d'officier</span>
                </label>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <Button variant="outline" onClick={() => setShowCreateGradeModal(false)}>
                Annuler
              </Button>
              <Button variant="default" onClick={handleCreateGrade}>
                Créer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'édition de grade */}
      {showEditGradeModal && editingItem && (
        <div className="modal-overlay" onClick={() => setShowEditGradeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3>Modifier le grade</h3>
              <button className="close-btn" onClick={() => setShowEditGradeModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Nom du grade *</label>
                <input
                  type="text"
                  value={editGrade.nom || ''}
                  onChange={(e) => setEditGrade({ ...editGrade, nom: e.target.value })}
                  placeholder="Ex: Lieutenant"
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Niveau hiérarchique</label>
                <input
                  type="number"
                  value={editGrade.niveau_hierarchique || 1}
                  onChange={(e) => setEditGrade({ ...editGrade, niveau_hierarchique: parseInt(e.target.value) || 1 })}
                  min="1"
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '4px' }}>
                  Plus le niveau est élevé, plus le grade est haut dans la hiérarchie
                </p>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editGrade.est_officier || false}
                    onChange={(e) => setEditGrade({ ...editGrade, est_officier: e.target.checked })}
                  />
                  <span>👮 Ce grade est un grade d'officier</span>
                </label>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <Button variant="outline" onClick={() => setShowEditGradeModal(false)}>
                Annuler
              </Button>
              <Button variant="default" onClick={handleUpdateGrade}>
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de création de compte utilisateur */}
      {showCreateUserModal && (
        <div className="modal-overlay" onClick={() => setShowCreateUserModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>Créer un nouveau compte</h3>
              <button className="close-btn" onClick={() => setShowCreateUserModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Prénom *</label>
                  <input
                    type="text"
                    value={newUser.prenom || ''}
                    onChange={(e) => setNewUser({ ...newUser, prenom: e.target.value })}
                    placeholder="Prénom"
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Nom *</label>
                  <input
                    type="text"
                    value={newUser.nom || ''}
                    onChange={(e) => setNewUser({ ...newUser, nom: e.target.value })}
                    placeholder="Nom"
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Email *</label>
                <input
                  type="email"
                  value={newUser.email || ''}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="email@exemple.com"
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Mot de passe *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPasswordComptes ? 'text' : 'password'}
                    value={newUser.mot_de_passe || ''}
                    onChange={(e) => setNewUser({ ...newUser, mot_de_passe: e.target.value })}
                    placeholder="Mot de passe sécurisé"
                    style={{ width: '100%', padding: '8px', paddingRight: '40px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordComptes(!showPasswordComptes)}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    {showPasswordComptes ? '🙈' : '👁️'}
                  </button>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>
                  Min. 8 caractères, 1 majuscule, 1 chiffre, 1 caractère spécial (!@#$%^&*+-?())
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Téléphone</label>
                  <input
                    type="tel"
                    value={newUser.telephone || ''}
                    onChange={(e) => setNewUser({ ...newUser, telephone: e.target.value })}
                    placeholder="514-555-1234"
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Contact d'urgence</label>
                  <input
                    type="tel"
                    value={newUser.contact_urgence || ''}
                    onChange={(e) => setNewUser({ ...newUser, contact_urgence: e.target.value })}
                    placeholder="514-555-5678"
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Grade</label>
                  <select
                    value={newUser.grade || 'Pompier'}
                    onChange={(e) => setNewUser({ ...newUser, grade: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  >
                    {grades.map(g => (
                      <option key={g.id} value={g.nom}>{g.nom}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Type d'emploi</label>
                  <select
                    value={newUser.type_emploi || 'temps_plein'}
                    onChange={(e) => setNewUser({ ...newUser, type_emploi: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  >
                    <option value="temps_plein">Temps plein</option>
                    <option value="temps_partiel">Temps partiel</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Rôle</label>
                  <select
                    value={newUser.role || 'employe'}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  >
                    <option value="employe">Employé</option>
                    <option value="superviseur">Superviseur</option>
                    <option value="admin">Administrateur</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Numéro d'employé</label>
                  <input
                    type="text"
                    value={newUser.numero_employe || ''}
                    onChange={(e) => setNewUser({ ...newUser, numero_employe: e.target.value })}
                    placeholder="Auto-généré si vide"
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Date d'embauche</label>
                <input
                  type="date"
                  value={newUser.date_embauche || ''}
                  onChange={(e) => setNewUser({ ...newUser, date_embauche: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <Button variant="outline" onClick={() => setShowCreateUserModal(false)}>
                Annuler
              </Button>
              <Button variant="default" onClick={handleCreateUser}>
                Créer le compte
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de modification d'accès utilisateur */}
      {showEditAccessModal && editingUser && (
        <div className="modal-overlay" onClick={() => setShowEditAccessModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3>Modifier l'accès de {editingUser.prenom} {editingUser.nom}</h3>
              <button className="close-btn" onClick={() => setShowEditAccessModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Rôle</label>
                <select
                  value={userAccess.role || 'employe'}
                  onChange={(e) => setUserAccess({ ...userAccess, role: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                >
                  <option value="employe">👤 Employé</option>
                  <option value="superviseur">🎖️ Superviseur</option>
                  <option value="admin">👑 Administrateur</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Statut</label>
                <select
                  value={userAccess.statut || 'actif'}
                  onChange={(e) => setUserAccess({ ...userAccess, statut: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                >
                  <option value="actif">✅ Actif</option>
                  <option value="inactif">⏸️ Inactif</option>
                  <option value="suspendu">🚫 Suspendu</option>
                </select>
              </div>
              <div style={{ padding: '12px', background: '#f3f4f6', borderRadius: '6px' }}>
                <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  <strong>Note:</strong> Les modifications d'accès prennent effet immédiatement. L'utilisateur devra peut-être se reconnecter.
                </p>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <Button variant="outline" onClick={() => setShowEditAccessModal(false)}>
                Annuler
              </Button>
              <Button variant="default" onClick={handleUpdateAccess}>
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Parametres;
