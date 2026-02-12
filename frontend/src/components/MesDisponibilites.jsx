import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Calendar } from "./ui/calendar";
import { useToast } from "../hooks/use-toast";
import { useConfirmDialog } from "./ui/ConfirmDialog";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { apiGet, apiPost, apiPut, apiDelete, apiCall } from '../utils/api';
import { fr } from "date-fns/locale";
import { ReinitModal, ExportModal, DayDetailModal, QuickAddModal, BatchConflictModal } from './disponibilites';

// Fonction pour parser une date en évitant les problèmes de timezone
const parseDateLocal = (dateStr) => {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Fonction pour formater une date en YYYY-MM-DD (format local)
const formatDateLocal = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const MesDisponibilites = ({ managingUser, setCurrentPage, setManagingUserDisponibilites }) => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  
  // Déterminer quel utilisateur on gère (soi-même ou un autre)
  const targetUser = managingUser || user;
  const [userDisponibilites, setUserDisponibilites] = useState([]);
  const [users, setUsers] = useState([]); // Liste de tous les utilisateurs pour les KPIs
  const [typesGarde, setTypesGarde] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingDisponibilites, setSavingDisponibilites] = useState(false);
  const [savingMessage, setSavingMessage] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState(''); // 'pdf' ou 'excel'
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showGenerationModal, setShowGenerationModal] = useState(false);
  const [selectedDates, setSelectedDates] = useState([]);
  
  // État pour le blocage des disponibilités
  const [blocageInfo, setBlocageInfo] = useState({
    bloque: false,
    raison: '',
    blocage_actif: false,
    date_blocage: null,
    jours_restants: null,
    mois_cible: null
  });
  
  // États pour le calendrier visuel mensuel
  const [calendarCurrentMonth, setCalendarCurrentMonth] = useState(new Date().getMonth());
  const [calendarCurrentYear, setCalendarCurrentYear] = useState(new Date().getFullYear());
  const [selectedDayForDetail, setSelectedDayForDetail] = useState(null);
  const [showDayDetailModal, setShowDayDetailModal] = useState(false);
  const [dayDetailData, setDayDetailData] = useState({ disponibilites: [], indisponibilites: [] });
  const [selectedDateDetails, setSelectedDateDetails] = useState(null);
  const [pendingConfigurations, setPendingConfigurations] = useState([]);
  const [availabilityConfig, setAvailabilityConfig] = useState({
    type_garde_id: '',
    heure_debut: '00:00',
    heure_fin: '23:59',
    statut: 'disponible',
    // Pour mode récurrence
    mode: 'calendrier', // 'calendrier' ou 'recurrence'
    date_debut: new Date().toISOString().split('T')[0],
    date_fin: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0],
    recurrence_type: 'hebdomadaire',
    recurrence_frequence: 'jours',
    recurrence_intervalle: 1,
    jours_semaine: [] // Pour sélection des jours en mode hebdomadaire/bihebdomadaire
  });

  const [generationConfig, setGenerationConfig] = useState({
    horaire_type: 'montreal',
    equipe: 'Rouge',
    date_debut: new Date().toISOString().split('T')[0],  // Date du jour
    date_fin: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0],  // 31 décembre de l'année en cours
    conserver_manuelles: true
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [indispoTab, setIndispoTab] = useState('generation'); // 'generation', 'manuelle_calendrier', 'manuelle_recurrence'
  const [manualIndispoMode, setManualIndispoMode] = useState('calendrier'); // 'calendrier' ou 'recurrence'
  const [manualIndispoConfig, setManualIndispoConfig] = useState({
    // Pour mode calendrier (clics multiples)
    dates: [],
    
    // Pour mode récurrence
    date_debut: new Date().toISOString().split('T')[0],
    date_fin: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0],
    heure_debut: '00:00',
    heure_fin: '23:59',
    
    // Options de récurrence
    recurrence_type: 'hebdomadaire', // 'hebdomadaire', 'bihebdomadaire', 'mensuelle', 'annuelle', 'personnalisee'
    recurrence_frequence: 'jours', // Pour personnalisée: 'jours', 'semaines', 'mois', 'ans'
    recurrence_intervalle: 1, // Tous les X (jours/semaines/mois/ans)
    jours_semaine: [] // Pour sélection des jours en mode hebdomadaire/bihebdomadaire
  });
  const [showReinitModal, setShowReinitModal] = useState(false);
  const [reinitConfig, setReinitConfig] = useState({
    periode: 'mois',
    mode: 'generees_seulement',
    type_entree: 'les_deux',
    date_debut: new Date().toISOString().split('T')[0],
    date_fin: new Date().toISOString().split('T')[0]
  });

  // États pour formatage planning (demo uniquement)
  const [showFormatageSection, setShowFormatageSection] = useState(false);
  const [moisFormatage, setMoisFormatage] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  const [isReinitializing, setIsReinitializing] = useState(false);
  const [reinitWarning, setReinitWarning] = useState(null);
  
  // Nouveau modal d'ajout rapide
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddType, setQuickAddType] = useState('disponibilite'); // 'disponibilite' ou 'indisponibilite'
  const [quickAddConfig, setQuickAddConfig] = useState({
    date: new Date().toISOString().split('T')[0],
    type_garde_id: '',
    heure_debut: '00:00',
    heure_fin: '23:59'
  });
  
  // État pour le nouveau modal de résolution de conflits multiples
  const [showBatchConflictModal, setShowBatchConflictModal] = useState(false);
  const [batchConflicts, setBatchConflicts] = useState([]);
  const [batchConflictSelections, setBatchConflictSelections] = useState({});
  
  // État pour le modal d'erreur explicite
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorModalContent, setErrorModalContent] = useState({ title: '', messages: [] });
  
  // État pour les horaires personnalisés
  const [horairesPersonnalises, setHorairesPersonnalises] = useState([]);
  
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();

  // Fonction pour vérifier le blocage pour un mois donné
  const checkBlocageForMonth = async (year, month) => {
    if (!tenantSlug || !user || !user.id) return null;
    try {
      const moisStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const response = await apiGet(tenantSlug, `/disponibilites/statut-blocage?mois=${moisStr}`);
      return response;
    } catch (error) {
      // Ignorer les erreurs - le blocage n'est pas critique pour l'affichage
      console.warn('Erreur vérification blocage (ignorée):', error.message || error);
      return null;
    }
  };

  // Vérifier le blocage quand le mois du calendrier change (seulement si utilisateur authentifié et temps partiel)
  useEffect(() => {
    const fetchBlocageStatus = async () => {
      // Ne vérifier que si l'utilisateur est authentifié et temps partiel (ou admin gérant un autre utilisateur)
      if (!tenantSlug || !user || !user.id) return;
      if (!managingUser && targetUser && targetUser.type_emploi !== 'temps_partiel') return;
      
      // Vérifier pour le mois actuellement affiché dans le calendrier
      const blocageData = await checkBlocageForMonth(calendarCurrentYear, calendarCurrentMonth);
      if (blocageData) {
        setBlocageInfo(blocageData);
      }
    };
    
    fetchBlocageStatus();
  }, [tenantSlug, calendarCurrentYear, calendarCurrentMonth, user, targetUser, managingUser]);

  useEffect(() => {
    const fetchDisponibilites = async () => {
      if (!tenantSlug || !targetUser || !targetUser.id) return;
      
      try {
        const [dispoData, typesData, usersData, horairesData] = await Promise.all([
          apiGet(tenantSlug, `/disponibilites/${targetUser.id}`),
          apiGet(tenantSlug, '/types-garde'),
          apiGet(tenantSlug, '/users'), // Tous les rôles peuvent voir les users (lecture seule)
          apiGet(tenantSlug, '/horaires-personnalises').catch(() => ({ horaires: [] })) // Charger les horaires personnalisés
        ]);
        setUserDisponibilites(dispoData);
        setTypesGarde(typesData);
        setUsers(usersData);
        setHorairesPersonnalises(horairesData.horaires || []);
      } catch (error) {
        console.error('Erreur lors du chargement des disponibilités:', error);
        // Ne pas afficher de toast si c'est une erreur 401/403 (déjà gérée par apiCall)
        if (error.status !== 401 && error.status !== 403) {
          toast({
            title: "Erreur",
            description: "Impossible de charger les disponibilités",
            variant: "destructive"
          });
        }
      } finally {
        setLoading(false);
      }
    };

    if (targetUser && targetUser.id && targetUser.type_emploi === 'temps_partiel') {
      fetchDisponibilites();
    } else if (targetUser) {
      // Si l'utilisateur existe mais n'est pas temps partiel, arrêter le loading
      setLoading(false);
    }
  }, [targetUser, tenantSlug, toast]);

  const handleTypeGardeChange = (typeGardeId) => {
    const selectedType = typesGarde.find(t => t.id === typeGardeId);
    
    if (selectedType) {
      // Auto-remplir les horaires du type de garde
      setAvailabilityConfig({
        ...availabilityConfig,
        type_garde_id: typeGardeId,
        heure_debut: selectedType.heure_debut,
        heure_fin: selectedType.heure_fin
      });
    } else {
      // "Tous les types" - garder les horaires personnalisés
      setAvailabilityConfig({
        ...availabilityConfig,
        type_garde_id: typeGardeId
      });
    }
  };



  const handleAddConfiguration = () => {
    if (selectedDates.length === 0) {
      toast({
        title: "Aucune date sélectionnée",
        description: "Veuillez sélectionner au moins une date",
        variant: "destructive"
      });
      return;
    }

    const selectedType = typesGarde.find(t => t.id === availabilityConfig.type_garde_id);
    const newConfig = {
      id: Date.now(),
      type_garde_id: availabilityConfig.type_garde_id,
      type_garde_name: selectedType ? selectedType.nom : 'Tous les types',
      couleur: selectedType ? selectedType.couleur : '#10B981',
      heure_debut: selectedType ? selectedType.heure_debut : availabilityConfig.heure_debut,
      heure_fin: selectedType ? selectedType.heure_fin : availabilityConfig.heure_fin,
      statut: availabilityConfig.statut,
      dates: [...selectedDates]
    };

    setPendingConfigurations([...pendingConfigurations, newConfig]);
    setSelectedDates([]);
    
    toast({
      title: "Configuration ajoutée",
      description: `${newConfig.dates.length} jour(s) pour ${newConfig.type_garde_name}`,
      variant: "success"
    });
  };

  const handleRemoveConfiguration = (configId) => {
    setPendingConfigurations(prev => prev.filter(c => c.id !== configId));
  };

  const handleSaveAllConfigurations = async () => {
    // Vérifier le blocage avant sauvegarde
    if (blocageInfo.bloque && !blocageInfo.exception_appliquee) {
      toast({
        title: "Saisie bloquée",
        description: blocageInfo.raison,
        variant: "destructive"
      });
      return;
    }
    
    if (pendingConfigurations.length === 0) {
      toast({
        title: "Aucune configuration",
        description: "Veuillez ajouter au moins une configuration",
        variant: "destructive"
      });
      return;
    }

    try {
      // Combiner avec les disponibilités existantes + nouvelles configurations
      const existingDispos = userDisponibilites.map(d => ({
        user_id: targetUser.id,
        date: d.date,
        type_garde_id: d.type_garde_id || null,
        heure_debut: d.heure_debut,
        heure_fin: d.heure_fin,
        statut: d.statut
      }));

      const newDispos = pendingConfigurations.flatMap(config => 
        config.dates.map(date => ({
          user_id: targetUser.id,
          date: date.toISOString().split('T')[0],
          type_garde_id: config.type_garde_id || null,
          heure_debut: config.heure_debut,
          heure_fin: config.heure_fin,
          statut: config.statut
        }))
      );

      const allDisponibilites = [...existingDispos, ...newDispos];

      await apiPut(tenantSlug, `/disponibilites/${targetUser.id}`, allDisponibilites);
      
      toast({
        title: "Toutes les disponibilités sauvegardées",
        description: `${newDispos.length} nouvelles disponibilités ajoutées`,
        variant: "success"
      });
      
      setShowCalendarModal(false);
      setPendingConfigurations([]);
      
      // Reload disponibilités
      const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
      setUserDisponibilites(dispoData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder",
        variant: "destructive"
      });
    }
  };

  const handleSaveAvailability = async () => {
    try {
      setSavingDisponibilites(true);
      setSavingMessage('Préparation des disponibilités...');
      
      let disponibilitesACreer = [];
      
      if (availabilityConfig.mode === 'calendrier') {
        // MODE CALENDRIER: Clics multiples sur dates
        if (selectedDates.length === 0) {
          setSavingDisponibilites(false);
          toast({
            title: "Aucune date sélectionnée",
            description: "Veuillez cliquer sur les dates dans le calendrier",
            variant: "destructive"
          });
          return;
        }
        
        setSavingMessage(`Création de ${selectedDates.length} disponibilité(s)...`);
        
        // Créer une disponibilité pour chaque date sélectionnée
        for (const date of selectedDates) {
          disponibilitesACreer.push({
            user_id: targetUser.id,
            date: date.toISOString().split('T')[0],
            type_garde_id: availabilityConfig.type_garde_id || null,
            heure_debut: availabilityConfig.heure_debut,
            heure_fin: availabilityConfig.heure_fin,
            statut: availabilityConfig.statut,
            origine: 'manuelle' // Origine manuelle car sélection date par date via calendrier
          });
        }
        
      } else {
        // MODE RÉCURRENCE: Date début/fin avec récurrence
        setSavingMessage('Calcul des dates de récurrence...');
        
        const dateDebut = parseDateLocal(availabilityConfig.date_debut);
        const dateFin = parseDateLocal(availabilityConfig.date_fin);
        
        if (dateDebut > dateFin) {
          setSavingDisponibilites(false);
          toast({
            title: "Dates invalides",
            description: "La date de début doit être avant la date de fin",
            variant: "destructive"
          });
          return;
        }
        
        // Calculer l'intervalle selon le type de récurrence
        let intervalJours = 1;
        
        switch (availabilityConfig.recurrence_type) {
          case 'hebdomadaire':
            intervalJours = 7;
            break;
          case 'bihebdomadaire':
            intervalJours = 14;
            break;
          case 'mensuelle':
            intervalJours = 30;
            break;
          case 'annuelle':
            intervalJours = 365;
            break;
          case 'personnalisee':
            if (availabilityConfig.recurrence_frequence === 'jours') {
              intervalJours = availabilityConfig.recurrence_intervalle;
            } else if (availabilityConfig.recurrence_frequence === 'semaines') {
              intervalJours = availabilityConfig.recurrence_intervalle * 7;
            } else if (availabilityConfig.recurrence_frequence === 'mois') {
              intervalJours = availabilityConfig.recurrence_intervalle * 30;
            } else if (availabilityConfig.recurrence_frequence === 'ans') {
              intervalJours = availabilityConfig.recurrence_intervalle * 365;
            }
            break;
        }
        
        // Générer les dates avec récurrence
        let currentDate = new Date(dateDebut);
        let compteur = 0;
        const maxIterations = 1000;
        
        // Mapping des jours pour la vérification
        const dayMap = {
          'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
          'thursday': 4, 'friday': 5, 'saturday': 6
        };
        
        // DEBUG: Afficher les jours sélectionnés
        console.log('===== DEBUG RÉCURRENCE =====');
        console.log('Date début:', dateDebut.toISOString().split('T')[0]);
        console.log('Date fin:', dateFin.toISOString().split('T')[0]);
        console.log('Jours sélectionnés:', availabilityConfig.jours_semaine);
        console.log('DayMap:', dayMap);
        console.log('============================');
        
        // Pour bi-hebdomadaire : Compteur de semaines depuis le début
        let weeksFromStart = 0;
        let lastWeekProcessed = -1;
        
        // Pour bi-hebdomadaire : calculer le numéro de semaine ISO de la date de début comme référence
        const getWeekNumber = (date) => {
          const tempDate = new Date(date);
          tempDate.setHours(0, 0, 0, 0);
          // Set to nearest Thursday: current date + 4 - current day number, make Sunday's day number 7
          tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));
          // Get first day of year
          const yearStart = new Date(tempDate.getFullYear(), 0, 1);
          // Calculate full weeks to nearest Thursday
          const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
          return weekNo;
        };
        
        const referenceWeekNumber = getWeekNumber(dateDebut);
        
        while (currentDate <= dateFin && compteur < maxIterations) {
          // Calculer le numéro de semaine ISO pour la date actuelle
          const currentWeekNumber = getWeekNumber(currentDate);
          // Calculer la différence de semaines depuis la référence
          const weeksDifference = currentWeekNumber - referenceWeekNumber;
          
          // Si hebdomadaire/bihebdomadaire ET des jours sont sélectionnés
          let includeDate = false; // FIX: Par défaut false, includeDate devient true seulement si le jour correspond
          if ((availabilityConfig.recurrence_type === 'hebdomadaire' || availabilityConfig.recurrence_type === 'bihebdomadaire') 
              && availabilityConfig.jours_semaine && availabilityConfig.jours_semaine.length > 0) {
            
            const dayOfWeek = currentDate.getDay();
            
            // DEBUG: Log pour comprendre le problème
            if (compteur < 10) {
              console.log(`DEBUG Récurrence - Date: ${currentDate.toISOString().split('T')[0]}, getDay(): ${dayOfWeek}, Jours sélectionnés:`, availabilityConfig.jours_semaine);
              availabilityConfig.jours_semaine.forEach(jour => {
                console.log(`  ${jour} -> dayMap[${jour}] = ${dayMap[jour]}, match: ${dayMap[jour] === dayOfWeek}`);
              });
            }
            
            // Vérifier si ce jour est dans les jours sélectionnés
            includeDate = availabilityConfig.jours_semaine.some(jour => dayMap[jour] === dayOfWeek);
            
            // Pour bi-hebdomadaire : ne garder que les semaines paires (0, 2, 4, 6...)
            if (includeDate && availabilityConfig.recurrence_type === 'bihebdomadaire') {
              includeDate = weeksDifference % 2 === 0;
            }
          }
          
          if (includeDate) {
            disponibilitesACreer.push({
              user_id: targetUser.id,
              date: formatDateLocal(currentDate),
              type_garde_id: availabilityConfig.type_garde_id || null,
              heure_debut: availabilityConfig.heure_debut,
              heure_fin: availabilityConfig.heure_fin,
              statut: availabilityConfig.statut,
              origine: 'recurrence' // Origine récurrence car généré automatiquement
            });
          }
          
          // Avancer d'un jour (on vérifie tous les jours mais on filtre selon récurrence)
          currentDate = new Date(currentDate);
          currentDate.setDate(currentDate.getDate() + 1);
          compteur++;
        }
      }
      
      setSavingMessage(`Enregistrement de ${disponibilitesACreer.length} disponibilité(s)...`);
      
      // Envoyer les disponibilités au backend - COLLECTER LES CONFLITS
      let successCount = 0;
      let collectedConflicts = [];
      let errorCount = 0;
      let errorMessages = []; // Pour collecter les messages d'erreur explicites
      
      for (let i = 0; i < disponibilitesACreer.length; i++) {
        const dispo = disponibilitesACreer[i];
        try {
          await apiPost(tenantSlug, '/disponibilites', dispo);
          successCount++;
        } catch (error) {
          // Vérifier si c'est une erreur de conflit (409)
          // Le wrapper apiCall met le status dans error.status et les data dans error.data
          if (error.status === 409) {
            const conflictDetails = error.data?.detail;
            const typeGarde = typesGarde.find(t => t.id === dispo.type_garde_id);
            
            // Si c'est un message string (conflit incompatible bloquant)
            if (typeof conflictDetails === 'string') {
              errorMessages.push({
                date: dispo.date,
                message: conflictDetails
              });
              errorCount++;
            } 
            // Si c'est un objet avec des conflits à résoudre
            else if (conflictDetails?.conflicts) {
              collectedConflicts.push({
                newItem: dispo,
                conflicts: conflictDetails.conflicts,
                newType: typeGarde?.nom || 'Disponibilité',
                existingType: conflictDetails.conflicts[0]?.statut === 'disponible' ? 'Disponibilité' : 'Indisponibilité',
                existingHours: `${conflictDetails.conflicts[0]?.heure_debut}-${conflictDetails.conflicts[0]?.heure_fin}`,
                existingOrigine: conflictDetails.conflicts[0]?.origine
              });
            }
          } else {
            errorCount++;
            const errorMsg = error.data?.detail || error.message || 'Erreur inconnue';
            errorMessages.push({
              date: dispo.date,
              message: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)
            });
          }
        }
        
        // Mettre à jour le message tous les 10 enregistrements
        if ((i + 1) % 10 === 0 || i === disponibilitesACreer.length - 1) {
          setSavingMessage(`Enregistrement... ${i + 1}/${disponibilitesACreer.length}`);
        }
      }
      
      setSavingMessage('Finalisation...');
      setSavingDisponibilites(false);
      
      // Si des erreurs bloquantes ont été détectées, afficher le modal d'erreur
      if (errorMessages.length > 0) {
        // Toujours recharger les données pour voir ce qui a été créé
        try {
          const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
          setUserDisponibilites(dispoData);
        } catch (e) {
          console.error('Erreur rechargement disponibilités:', e);
        }
        
        setErrorModalContent({
          title: `${errorMessages.length} conflit(s) détecté(s)`,
          messages: errorMessages,
          successCount: successCount  // Ajouter le nombre de succès
        });
        setShowErrorModal(true);
        setShowCalendarModal(false);
        setSelectedDates([]);
        return;
      }
      
      // Si des conflits résolvables ont été détectés, afficher le modal de résolution
      if (collectedConflicts.length > 0) {
        setBatchConflicts(collectedConflicts);
        setBatchConflictSelections({});
        setShowBatchConflictModal(true);
        setShowCalendarModal(false);
        
        toast({
          title: "Conflits détectés",
          description: `${successCount} créée(s), ${collectedConflicts.length} conflit(s) à résoudre`,
          variant: "default"
        });
        
        return; // Ne pas fermer le modal ou recharger
      }
      
      // Si pas de conflits, message de succès normal
      let message = '';
      if (successCount > 0) {
        message += `${successCount} disponibilité(s) créée(s)`;
      }
      if (errorCount > 0) {
        message += (message ? ', ' : '') + `${errorCount} erreur(s)`;
      }
      
      toast({
        title: successCount > 0 ? "Disponibilités enregistrées" : "Attention",
        description: message || "Aucune disponibilité créée",
        variant: successCount > 0 ? "success" : "destructive"
      });
      
      setShowCalendarModal(false);
      setSelectedDates([]);
      
      // Réinitialiser la config
      setAvailabilityConfig({
        type_garde_id: '',
        heure_debut: '00:00',
        heure_fin: '23:59',
        statut: 'disponible',
        mode: 'calendrier',
        date_debut: new Date().toISOString().split('T')[0],
        date_fin: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0],
        recurrence_type: 'hebdomadaire',
        recurrence_frequence: 'jours',
        recurrence_intervalle: 1,
        jours_semaine: []
      });
      
      // Recharger les disponibilités
      const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
      setUserDisponibilites(dispoData);
      
      setSavingDisponibilites(false);
      
    } catch (error) {
      setSavingDisponibilites(false);
      const errorMessage = error.data?.detail || error.message || "Impossible d'enregistrer les disponibilités";
      console.error('Erreur sauvegarde disponibilités:', errorMessage);
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };


  // Fonctions pour le calendrier visuel
  const getDaysInMonth = (month, year) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month, year) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Convertir dimanche (0) en 6, lundi reste 0
  };

  const navigateMonth = (direction) => {
    if (direction === 'prev') {
      if (calendarCurrentMonth === 0) {
        setCalendarCurrentMonth(11);
        setCalendarCurrentYear(calendarCurrentYear - 1);
      } else {
        setCalendarCurrentMonth(calendarCurrentMonth - 1);
      }
    } else {
      if (calendarCurrentMonth === 11) {
        setCalendarCurrentMonth(0);
        setCalendarCurrentYear(calendarCurrentYear + 1);
      } else {
        setCalendarCurrentMonth(calendarCurrentMonth + 1);
      }
    }
  };

  const getDisponibilitesForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return userDisponibilites.filter(d => d.date === dateStr);
  };

  const handleDayClick = (dayNumber) => {
    const clickedDate = new Date(calendarCurrentYear, calendarCurrentMonth, dayNumber);
    // Format YYYY-MM-DD sans conversion UTC
    const dateStr = `${calendarCurrentYear}-${String(calendarCurrentMonth + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
    
    const disponibilites = userDisponibilites.filter(d => (d.date === dateStr || d.date.startsWith(dateStr)) && d.statut === 'disponible');
    const indisponibilites = userDisponibilites.filter(d => (d.date === dateStr || d.date.startsWith(dateStr)) && d.statut === 'indisponible');
    
    setSelectedDayForDetail(clickedDate);
    setDayDetailData({ disponibilites, indisponibilites });
    setShowDayDetailModal(true);
  };

  // Fonction pour résoudre les conflits en batch
  const handleResolveBatchConflicts = async () => {
    try {
      let successCount = 0;
      let errorCount = 0;
      
      // Traiter uniquement les conflits sélectionnés
      for (let i = 0; i < batchConflicts.length; i++) {
        const conflict = batchConflicts[i];
        const isSelected = batchConflictSelections[i];
        
        if (isSelected) {
          // Remplacer: supprimer l'ancien et créer le nouveau
          try {
            // Supprimer les conflits existants
            for (const existingConflict of conflict.conflicts) {
              await apiDelete(tenantSlug, `/disponibilites/${existingConflict.id}`);
            }
            
            // Créer la nouvelle disponibilité
            await apiPost(tenantSlug, '/disponibilites', conflict.newItem);
            successCount++;
          } catch (error) {
            console.error(`Erreur lors du remplacement pour ${conflict.newItem.date}:`, error);
            errorCount++;
          }
        }
        // Si non sélectionné, on ignore simplement (ne crée pas)
      }
      
      // Message récapitulatif
      let message = '';
      if (successCount > 0) {
        message += `${successCount} conflit(s) résolu(s)`;
      }
      if (errorCount > 0) {
        message += (message ? ', ' : '') + `${errorCount} erreur(s)`;
      }
      const ignoredCount = batchConflicts.length - Object.values(batchConflictSelections).filter(Boolean).length;
      if (ignoredCount > 0) {
        message += (message ? ', ' : '') + `${ignoredCount} ignoré(s)`;
      }
      
      toast({
        title: successCount > 0 ? "Conflits résolus" : "Attention",
        description: message || "Aucun conflit résolu",
        variant: successCount > 0 ? "success" : "default"
      });
      
      // Recharger les disponibilités
      const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
      setUserDisponibilites(dispoData);
      
      // Fermer le modal et réinitialiser
      setShowBatchConflictModal(false);
      setBatchConflicts([]);
      setBatchConflictSelections({});
      
    } catch (error) {
      console.error('Erreur lors de la résolution des conflits:', error);
      toast({
        title: "Erreur",
        description: "Impossible de résoudre les conflits",
        variant: "destructive"
      });
    }
  };

  const handleDeleteDisponibilite = async (dispoId) => {
    try {
      await apiDelete(tenantSlug, `/disponibilites/${dispoId}`);
      toast({
        title: "Supprimé",
        description: "Entrée supprimée avec succès",
        variant: "success"
      });
      
      // Recharger
      const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
      setUserDisponibilites(dispoData);
      
      // Mettre à jour le modal si un jour est sélectionné
      if (selectedDayForDetail) {
        const dateStr = selectedDayForDetail.toISOString().split('T')[0];
        const disponibilites = dispoData.filter(d => d.date === dateStr && d.statut === 'disponible');
        const indisponibilites = dispoData.filter(d => d.date === dateStr && d.statut === 'indisponible');
        setDayDetailData({ disponibilites, indisponibilites });
      }
      
    } catch (error) {
      console.error('Erreur suppression:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || "Impossible de supprimer";
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive"
      });
      // Propager l'erreur pour que le modal puisse réagir
      throw error;
    }
  };

  const getMonthName = (month) => {
    const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return months[month];
  };



  // Fonction pour formater le planning (demo uniquement)
  const handleFormaterPlanning = async () => {
    if (tenantSlug !== 'demo') {
      alert('Cette fonctionnalité est réservée au tenant demo');
      return;
    }

    if (user.role !== 'admin') {
      toast({
        title: 'Accès refusé',
        description: 'Accès réservé aux administrateurs',
        variant: 'destructive'
      });
      return;
    }

    const confirmed = await confirm({
      title: '⚠️ ATTENTION',
      message: `Vous êtes sur le point de SUPPRIMER toutes les assignations et demandes de remplacement du mois ${moisFormatage}.\n\nCette action est IRRÉVERSIBLE.`,
      variant: 'danger',
      confirmText: 'Formater'
    });

    if (!confirmed) return;

    try {
      const response = await apiDelete(tenantSlug, `/planning/formater-mois?mois=${moisFormatage}`);

      toast({
        title: '✅ Formatage réussi',
        description: `${response.assignations_supprimees} assignation(s) et ${response.demandes_supprimees} demande(s) supprimée(s)`
      });
      
      // Recharger la page
      window.location.reload();
    } catch (error) {
      console.error('Erreur formatage planning:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors du formatage: ' + error.message,
        variant: 'destructive'
      });
    }
  };

  const handleGenerateIndisponibilites = async () => {
    setIsGenerating(true);
    
    try {
      const response = await apiPost(tenantSlug, '/disponibilites/generer', {
        user_id: targetUser.id,
        horaire_type: generationConfig.horaire_type,
        equipe: generationConfig.equipe,
        date_debut: generationConfig.date_debut,
        date_fin: generationConfig.date_fin,
        conserver_manuelles: generationConfig.conserver_manuelles
      });
      
      const horaireNames = {
        montreal: 'Montreal 7/24',
        quebec: 'Quebec 10/14',
        longueuil: 'Longueuil 7/24'
      };
      
      toast({
        title: "Génération réussie",
        description: `${response.nombre_indisponibilites} indisponibilités générées pour ${horaireNames[generationConfig.horaire_type] || generationConfig.horaire_type} - Équipe ${generationConfig.equipe} (${generationConfig.date_debut} au ${generationConfig.date_fin})`,
        variant: "success"
      });
      
      setShowGenerationModal(false);
      
      // Recharger les disponibilités
      const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
      setUserDisponibilites(dispoData);
      
    } catch (error) {
      console.error('Erreur génération:', error);
      toast({
        title: "Erreur",
        description: error.data?.detail || error.message || "Impossible de générer les indisponibilités",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReinitialiser = async () => {
    // Validation des dates pour période personnalisée
    if (reinitConfig.periode === 'personnalisee') {
      const dateDebut = new Date(reinitConfig.date_debut);
      const dateFin = new Date(reinitConfig.date_fin);
      
      if (dateDebut > dateFin) {
        toast({
          title: "Erreur",
          description: "La date de début doit être avant la date de fin",
          variant: "destructive"
        });
        return;
      }
      
      // Limiter à 1 an maximum
      const diffTime = Math.abs(dateFin - dateDebut);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 365) {
        toast({
          title: "Erreur",
          description: "La plage de dates ne peut pas dépasser 1 an",
          variant: "destructive"
        });
        return;
      }
      
      // Vérifier les dates bloquées si l'avertissement n'a pas déjà été confirmé
      if (!reinitWarning) {
        try {
          const params = await apiGet(tenantSlug, '/parametres/disponibilites');
          const joursBlocage = params.jour_blocage_dispos || 0;
          
          if (joursBlocage > 0) {
            const today = new Date();
            const dateBloquee = new Date(today);
            dateBloquee.setDate(dateBloquee.getDate() + joursBlocage);
            
            // Vérifier si des dates sont dans la période bloquée
            if (dateDebut < dateBloquee) {
              setReinitWarning(`⚠️ Certaines dates sont dans la période bloquée (moins de ${joursBlocage} jours). Êtes-vous sûr de vouloir continuer?`);
              return; // Afficher l'avertissement et attendre confirmation
            }
          }
        } catch (error) {
          console.error('Erreur vérification blocage:', error);
        }
      }
    }
    
    setIsReinitializing(true);
    setReinitWarning(null); // Réinitialiser l'avertissement
    
    try {
      const requestBody = {
        user_id: targetUser.id,
        periode: reinitConfig.periode,
        mode: reinitConfig.mode,
        type_entree: reinitConfig.type_entree
      };
      
      // Ajouter les dates si période personnalisée
      if (reinitConfig.periode === 'personnalisee') {
        requestBody.date_debut = reinitConfig.date_debut;
        requestBody.date_fin = reinitConfig.date_fin;
      }
      
      const response = await apiCall(tenantSlug, '/disponibilites/reinitialiser', {
        method: 'DELETE',
        body: JSON.stringify(requestBody)
      });
      
      const periodeLabel = reinitConfig.periode === 'personnalisee'
        ? `du ${reinitConfig.date_debut} au ${reinitConfig.date_fin}`
        : {
            'semaine': 'la semaine courante',
            'mois': 'le mois courant',
            'annee': "l'année courante"
          }[reinitConfig.periode];
      
      const typeLabel = {
        'disponibilites': 'disponibilités',
        'indisponibilites': 'indisponibilités',
        'les_deux': 'disponibilités et indisponibilités'
      }[reinitConfig.type_entree];
      
      const modeLabel = reinitConfig.mode === 'tout' 
        ? 'Toutes les' 
        : 'Les entrées générées automatiquement de';
      
      toast({
        title: "Réinitialisation réussie",
        description: `${modeLabel} ${typeLabel} de ${periodeLabel} ont été supprimées (${response.nombre_supprimees} entrée(s))`,
        variant: "success"
      });
      
      setShowReinitModal(false);
      
      // Recharger les disponibilités
      const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
      setUserDisponibilites(dispoData);
      
    } catch (error) {
      console.error('Erreur réinitialisation:', error);
      toast({
        title: "Erreur",
        description: error.data?.detail || error.message || "Impossible de réinitialiser",
        variant: "destructive"
      });
    } finally {
      setIsReinitializing(false);
    }
  };

  const handleSaveManualIndisponibilites = async () => {
    try {
      setSavingDisponibilites(true);
      setSavingMessage('Préparation des indisponibilités...');
      
      let indisponibilitesACreer = [];
      
      if (manualIndispoMode === 'calendrier') {
        // MODE CALENDRIER: Clics multiples sur dates
        if (manualIndispoConfig.dates.length === 0) {
          setSavingDisponibilites(false);
          toast({
            title: "Aucune date sélectionnée",
            description: "Veuillez cliquer sur les dates dans le calendrier",
            variant: "destructive"
          });
          return;
        }
        
        setSavingMessage(`Création de ${manualIndispoConfig.dates.length} indisponibilité(s)...`);
        
        // Créer une indisponibilité pour chaque date sélectionnée
        for (const date of manualIndispoConfig.dates) {
          indisponibilitesACreer.push({
            user_id: targetUser.id,
            date: new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString().split('T')[0],
            type_garde_id: null,
            heure_debut: manualIndispoConfig.heure_debut,
            heure_fin: manualIndispoConfig.heure_fin,
            statut: 'indisponible',
            origine: 'manuelle' // Origine manuelle car sélection date par date via calendrier
          });
        }
        
      } else {
        // MODE RÉCURRENCE: Date début/fin avec récurrence
        setSavingMessage('Calcul des dates de récurrence...');
        
        const dateDebut = parseDateLocal(manualIndispoConfig.date_debut);
        const dateFin = parseDateLocal(manualIndispoConfig.date_fin);
        
        if (dateDebut > dateFin) {
          setSavingDisponibilites(false);
          toast({
            title: "Dates invalides",
            description: "La date de début doit être avant la date de fin",
            variant: "destructive"
          });
          return;
        }
        
        // Calculer l'intervalle selon le type de récurrence
        let intervalJours = 1;
        
        switch (manualIndispoConfig.recurrence_type) {
          case 'hebdomadaire':
            intervalJours = 7;
            break;
          case 'bihebdomadaire':
            intervalJours = 14;
            break;
          case 'mensuelle':
            intervalJours = 30; // Approximation
            break;
          case 'annuelle':
            intervalJours = 365;
            break;
          case 'personnalisee':
            // Calculer selon la fréquence et l'intervalle
            if (manualIndispoConfig.recurrence_frequence === 'jours') {
              intervalJours = manualIndispoConfig.recurrence_intervalle;
            } else if (manualIndispoConfig.recurrence_frequence === 'semaines') {
              intervalJours = manualIndispoConfig.recurrence_intervalle * 7;
            } else if (manualIndispoConfig.recurrence_frequence === 'mois') {
              intervalJours = manualIndispoConfig.recurrence_intervalle * 30;
            } else if (manualIndispoConfig.recurrence_frequence === 'ans') {
              intervalJours = manualIndispoConfig.recurrence_intervalle * 365;
            }
            break;
        }
        
        // Générer les dates avec récurrence
        let currentDate = new Date(dateDebut);
        let compteur = 0;
        const maxIterations = 1000; // Sécurité pour éviter boucle infinie
        
        // Mapping des jours pour la vérification
        const dayMap = {
          'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
          'thursday': 4, 'friday': 5, 'saturday': 6
        };
        
        // Pour bi-hebdomadaire : calculer le numéro de semaine ISO de la date de début comme référence
        const getWeekNumber = (date) => {
          const tempDate = new Date(date);
          tempDate.setHours(0, 0, 0, 0);
          // Set to nearest Thursday: current date + 4 - current day number, make Sunday's day number 7
          tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));
          // Get first day of year
          const yearStart = new Date(tempDate.getFullYear(), 0, 1);
          // Calculate full weeks to nearest Thursday
          const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
          return weekNo;
        };
        
        const referenceWeekNumber = getWeekNumber(dateDebut);
        
        while (currentDate <= dateFin && compteur < maxIterations) {
          // Calculer le numéro de semaine ISO pour la date actuelle
          const currentWeekNumber = getWeekNumber(currentDate);
          // Calculer la différence de semaines depuis la référence
          const weeksDifference = currentWeekNumber - referenceWeekNumber;
          
          // Si hebdomadaire/bihebdomadaire ET des jours sont sélectionnés, filtrer par jour
          let includeDate = true;
          if ((manualIndispoConfig.recurrence_type === 'hebdomadaire' || manualIndispoConfig.recurrence_type === 'bihebdomadaire') 
              && manualIndispoConfig.jours_semaine && manualIndispoConfig.jours_semaine.length > 0) {
            const dayOfWeek = currentDate.getDay();
            includeDate = manualIndispoConfig.jours_semaine.some(jour => dayMap[jour] === dayOfWeek);
            
            // Pour bi-hebdomadaire : ne garder que les semaines paires (0, 2, 4, 6...)
            if (includeDate && manualIndispoConfig.recurrence_type === 'bihebdomadaire') {
              includeDate = weeksDifference % 2 === 0;
            }
          }
          
          if (includeDate) {
            indisponibilitesACreer.push({
              user_id: targetUser.id,
              date: formatDateLocal(currentDate),
              type_garde_id: null,
              heure_debut: manualIndispoConfig.heure_debut,
              heure_fin: manualIndispoConfig.heure_fin,
              statut: 'indisponible',
              origine: 'recurrence' // Origine récurrence car généré automatiquement
            });
          }
          
          // Avancer à la prochaine date
          currentDate = new Date(currentDate);
          currentDate.setDate(currentDate.getDate() + 1); // Toujours avancer de 1 jour pour vérifier tous les jours
          compteur++;
        }
      }
      
      setSavingMessage(`Enregistrement de ${indisponibilitesACreer.length} indisponibilité(s)...`);
      
      // Envoyer les indisponibilités au backend - COLLECTER LES CONFLITS
      let successCount = 0;
      let collectedConflicts = [];
      let errorCount = 0;
      let errorMessages = []; // Pour collecter les messages d'erreur explicites
      
      for (let i = 0; i < indisponibilitesACreer.length; i++) {
        const indispo = indisponibilitesACreer[i];
        
        try {
          await apiPost(tenantSlug, '/disponibilites', indispo);
          successCount++;
        } catch (error) {
          // Vérifier si c'est une erreur de conflit (409)
          // Le wrapper apiCall met le status dans error.status et les data dans error.data
          if (error.status === 409) {
            const conflictDetails = error.data?.detail;
            
            // Si c'est un message string (conflit incompatible bloquant)
            if (typeof conflictDetails === 'string') {
              errorMessages.push({
                date: indispo.date,
                message: conflictDetails
              });
              errorCount++;
            }
            // Si c'est un objet avec des conflits à résoudre
            else if (conflictDetails?.conflicts) {
              collectedConflicts.push({
                newItem: indispo,
                conflicts: conflictDetails.conflicts,
                newType: 'Indisponibilité',
                existingType: conflictDetails.conflicts[0]?.statut === 'disponible' ? 'Disponibilité' : 'Indisponibilité',
                existingHours: `${conflictDetails.conflicts[0]?.heure_debut}-${conflictDetails.conflicts[0]?.heure_fin}`,
                existingOrigine: conflictDetails.conflicts[0]?.origine
              });
            }
          } else {
            // Autre erreur
            errorCount++;
            const errorMsg = error.data?.detail || error.message || 'Erreur inconnue';
            errorMessages.push({
              date: indispo.date,
              message: typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg)
            });
          }
        }
        
        // Mettre à jour le message tous les 10 enregistrements
        if ((i + 1) % 10 === 0 || i === indisponibilitesACreer.length - 1) {
          setSavingMessage(`Enregistrement... ${i + 1}/${indisponibilitesACreer.length}`);
        }
      }
      
      setSavingMessage('Finalisation...');
      setSavingDisponibilites(false);
      
      // Si des erreurs bloquantes ont été détectées, afficher le modal d'erreur
      if (errorMessages.length > 0) {
        // Toujours recharger les données pour voir ce qui a été créé
        try {
          const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
          setUserDisponibilites(dispoData);
        } catch (e) {
          console.error('Erreur rechargement disponibilités:', e);
        }
        
        setErrorModalContent({
          title: `${errorMessages.length} conflit(s) détecté(s)`,
          messages: errorMessages,
          successCount: successCount  // Ajouter le nombre de succès
        });
        setShowErrorModal(true);
        setShowGenerationModal(false);
        return;
      }
      
      // Si des conflits résolvables ont été détectés, afficher le modal
      if (collectedConflicts.length > 0) {
        setBatchConflicts(collectedConflicts);
        setBatchConflictSelections({});
        setShowBatchConflictModal(true);
        setShowGenerationModal(false);
        
        toast({
          title: "Conflits détectés",
          description: `${successCount} créée(s), ${collectedConflicts.length} conflit(s) à résoudre`,
          variant: "default"
        });
        
        return; // Ne pas fermer le modal ou recharger
      }
      
      // Si pas de conflits, message de succès normal
      let message = '';
      if (successCount > 0) {
        message += `${successCount} indisponibilité(s) créée(s)`;
      }
      if (errorCount > 0) {
        message += (message ? ', ' : '') + `${errorCount} erreur(s)`;
      }
      
      toast({
        title: successCount > 0 ? "Indisponibilités enregistrées" : "Attention",
        description: message || "Aucune indisponibilité créée",
        variant: successCount > 0 ? "success" : "destructive"
      });
      
      setShowGenerationModal(false);
      
      // Réinitialiser la config
      setManualIndispoConfig({
        dates: [],
        date_debut: new Date().toISOString().split('T')[0],
        date_fin: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0],
        heure_debut: '00:00',
        heure_fin: '23:59',
        recurrence_type: 'hebdomadaire',
        recurrence_frequence: 'jours',
        recurrence_intervalle: 1,
        jours_semaine: []
      });
      
      // Recharger les disponibilités
      const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
      setUserDisponibilites(dispoData);
      
      setSavingDisponibilites(false);
      
    } catch (error) {
      setSavingDisponibilites(false);
      const errorMessage = error.data?.detail || error.message || "Impossible d'enregistrer les indisponibilités";
      console.error('Erreur sauvegarde indisponibilités:', errorMessage);
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const getTypeGardeName = (typeGardeId) => {
    if (!typeGardeId) return 'Tous types';
    const typeGarde = typesGarde.find(t => t.id === typeGardeId);
    return typeGarde ? typeGarde.nom : 'Type non spécifié';
  };

  const getAvailableDates = () => {
    return userDisponibilites
      .filter(d => d.statut === 'disponible')
      .map(d => parseDateLocal(d.date));
  };

  const getColorByTypeGarde = (typeGardeId) => {
    if (!typeGardeId) return '#10B981'; // Vert par défaut pour "Tous types"
    const typeGarde = typesGarde.find(t => t.id === typeGardeId);
    return typeGarde ? typeGarde.couleur : '#10B981';
  };

  // Fonction pour sauvegarde rapide (ajout simple d'une dispo ou indispo)
  const handleQuickAddSave = async () => {
    try {
      // Validation
      if (!quickAddConfig.date) {
        toast({
          title: "Erreur",
          description: "Veuillez sélectionner une date",
          variant: "destructive"
        });
        return;
      }

      // Créer l'entrée via POST pour bénéficier de la validation des conflits
      const newEntry = {
        user_id: targetUser.id,
        date: quickAddConfig.date,
        type_garde_id: quickAddConfig.type_garde_id || null,
        heure_debut: quickAddConfig.heure_debut,
        heure_fin: quickAddConfig.heure_fin,
        statut: quickAddType === 'disponibilite' ? 'disponible' : 'indisponible',
        origine: 'manuelle'
      };

      // Utiliser POST pour la validation des conflits côté backend
      await apiPost(tenantSlug, '/disponibilites', newEntry);
      
      toast({
        title: "✅ Enregistré !",
        description: quickAddType === 'disponibilite' 
          ? `Disponibilité ajoutée pour le ${quickAddConfig.date}`
          : `Indisponibilité ajoutée pour le ${quickAddConfig.date}`,
        variant: "success"
      });
      
      setShowQuickAddModal(false);
      
      // Recharger les disponibilités
      try {
        const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
        setUserDisponibilites(dispoData);
      } catch (e) {
        console.error('Erreur rechargement disponibilités:', e);
      }
      
      // Réinitialiser le formulaire
      setQuickAddConfig({
        date: new Date().toISOString().split('T')[0],
        type_garde_id: '',
        heure_debut: '00:00',
        heure_fin: '23:59'
      });
      
    } catch (error) {
      console.error('Erreur sauvegarde rapide:', error);
      
      // Vérifier si c'est une erreur de conflit (409)
      // Le wrapper apiCall met le status dans error.status et les data dans error.data
      if (error.status === 409) {
        const conflictDetails = error.data?.detail;
        
        // Si c'est un message string (conflit incompatible bloquant)
        if (typeof conflictDetails === 'string') {
          // Fermer le modal QuickAdd d'abord
          setShowQuickAddModal(false);
          
          // Afficher le modal d'erreur avec les détails
          setErrorModalContent({
            title: `Conflit détecté`,
            messages: [{
              date: quickAddConfig.date,
              message: conflictDetails
            }]
          });
          setShowErrorModal(true);
          return;
        }
      }
      
      toast({
        title: "Erreur",
        description: error.message || "Impossible d'enregistrer",
        variant: "destructive"
      });
    }
  };

  const getDisponibiliteForDate = (date) => {
    // Format YYYY-MM-DD sans conversion UTC
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return userDisponibilites.find(d => d.date === dateStr || d.date.startsWith(dateStr));
  };

  const handleDateClick = (date) => {
    // Format YYYY-MM-DD sans conversion UTC
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const dispos = userDisponibilites.filter(d => d.date === dateStr || d.date.startsWith(dateStr));
    
    console.log('Date cliquée:', dateStr, 'Disponibilités trouvées:', dispos.length);
    
    if (dispos.length > 0) {
      // Afficher TOUTES les disponibilités pour cette date
      setSelectedDateDetails({
        date: dateStr,
        disponibilites: dispos, // Tableau au lieu d'un seul objet
        count: dispos.length
      });
    } else {
      setSelectedDateDetails(null);
    }
  };

  // Vérifier le type d'emploi de la personne dont on gère les disponibilités
  if (targetUser?.type_emploi !== 'temps_partiel') {
    return (
      <div className="access-denied">
        <h1>Module réservé aux employés temps partiel</h1>
        <p>Ce module permet aux employés à temps partiel de gérer leurs disponibilités.</p>
        {managingUser && (
          <p style={{ marginTop: '10px', color: '#dc2626' }}>
            ⚠️ <strong>{targetUser?.prenom} {targetUser?.nom}</strong> est un employé <strong>temps plein</strong> et ne peut pas gérer de disponibilités.
          </p>
        )}
      </div>
    );
  }

  // Fonctions d'export Disponibilités
  const handleExportDisponibilites = async (userId = null) => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL;
      const token = localStorage.getItem(`${tenantSlug}_token`);
      
      const endpoint = exportType === 'pdf' ? 'export-pdf' : 'export-excel';
      const url = userId 
        ? `${backendUrl}/api/${tenantSlug}/disponibilites/${endpoint}?user_id=${userId}`
        : `${backendUrl}/api/${tenantSlug}/disponibilites/${endpoint}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Erreur lors de l\'export');
      
      const blob = await response.blob();
      
      if (exportType === 'pdf') {
        // Pour les PDF, ouvrir directement le dialogue d'impression
        const pdfUrl = window.URL.createObjectURL(blob);
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = pdfUrl;
        document.body.appendChild(iframe);
        
        iframe.onload = function() {
          iframe.contentWindow.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
            window.URL.revokeObjectURL(pdfUrl);
          }, 100);
        };
      } else {
        // Pour les Excel, télécharger directement
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = userId 
          ? `disponibilites_${userId}.xlsx` 
          : `disponibilites_tous.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
      }
      
      toast({ 
        title: "Succès", 
        description: `Export ${exportType.toUpperCase()} ${exportType === 'pdf' ? 'prêt à imprimer' : 'téléchargé'}`,
        variant: "success"
      });
      
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

  if (loading) return <div className="loading" data-testid="disponibilites-loading">Chargement...</div>;

  // Ne pas afficher le module pour les utilisateurs temps plein (sauf si admin gère un autre utilisateur)
  if (!managingUser && targetUser?.type_emploi !== 'temps_partiel') {
    return null;
  }

  return (
    <div className="disponibilites-refonte">
      {/* Bouton retour si on gère un autre utilisateur */}
      {managingUser && (
        <div style={{ marginBottom: '20px' }}>
          <Button 
            variant="outline" 
            onClick={() => {
              setManagingUserDisponibilites(null);
              setCurrentPage('personnel');
            }}
          >
            ← Retour à Personnel
          </Button>
        </div>
      )}

      {/* Header Moderne */}
      <div className="module-header">
        <div>
          <h1 data-testid="disponibilites-title">
            {managingUser 
              ? `📅 Disponibilités de ${targetUser.prenom} ${targetUser.nom}`
              : '📅 Mes Disponibilités'}
          </h1>
          <p>
            {managingUser 
              ? `Gérez les disponibilités de ${targetUser.prenom} ${targetUser.nom} pour les quarts de travail`
              : 'Gérez vos disponibilités pour les quarts de travail temps partiel'}
          </p>
        </div>
      </div>

      {/* Alerte de Blocage */}
      {blocageInfo.blocage_actif && (
        <div 
          className={`blocage-alert ${blocageInfo.bloque ? 'bloque' : 'avertissement'}`}
          style={{
            padding: '1rem 1.5rem',
            marginBottom: '1.5rem',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            backgroundColor: blocageInfo.bloque ? '#FEE2E2' : '#FEF3C7',
            borderLeft: `4px solid ${blocageInfo.bloque ? '#EF4444' : '#F59E0B'}`,
          }}
          data-testid="blocage-alert"
        >
          <span style={{ fontSize: '1.5rem' }}>
            {blocageInfo.bloque ? '🚫' : '⏰'}
          </span>
          <div style={{ flex: 1 }}>
            <strong style={{ color: blocageInfo.bloque ? '#B91C1C' : '#92400E' }}>
              {blocageInfo.bloque ? 'Saisie bloquée' : 'Date limite approche'}
            </strong>
            <p style={{ margin: '0.25rem 0 0', color: blocageInfo.bloque ? '#DC2626' : '#B45309', fontSize: '0.9rem' }}>
              {blocageInfo.raison}
              {!blocageInfo.bloque && blocageInfo.jours_restants !== null && (
                <> — <strong>{blocageInfo.jours_restants} jour(s) restant(s)</strong></>
              )}
            </p>
            {blocageInfo.exception_appliquee && (
              <p style={{ margin: '0.25rem 0 0', color: '#059669', fontSize: '0.85rem', fontStyle: 'italic' }}>
                ✓ Exception admin/superviseur active — vous pouvez modifier
              </p>
            )}
          </div>
        </div>
      )}

      {/* KPIs - Toujours affichés pour la personne en question */}
      {!managingUser && (() => {
        // Filtrer les disponibilités de l'utilisateur cible uniquement
        const myDisponibilites = userDisponibilites.filter(d => d.user_id === targetUser.id && d.statut === 'disponible');
        const myIndisponibilites = userDisponibilites.filter(d => d.user_id === targetUser.id && d.statut === 'indisponible');
        
        // Calculer les jours uniques avec disponibilités (ignorer les doublons)
        const joursAvecDispo = [...new Set(myDisponibilites.map(d => d.date))].length;
        
        // Calculer le nombre de types de garde différents couverts
        // Calculer les stats pour le mois M+1 uniquement
        const today = new Date();
        let nextMonth, nextYear;
        if (today.getMonth() === 11) {
          nextMonth = 0;
          nextYear = today.getFullYear() + 1;
        } else {
          nextMonth = today.getMonth() + 1;
          nextYear = today.getFullYear();
        }
        
        const moisNoms = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", 
                         "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
        const moisProchainLabel = `${moisNoms[nextMonth]} ${nextYear}`;
        
        // Filtrer les disponibilités pour le mois M+1
        const disposMoisProchain = myDisponibilites.filter(d => {
          const date = parseDateLocal(d.date);
          return date.getMonth() === nextMonth && date.getFullYear() === nextYear;
        });
        
        const indisposMoisProchain = myIndisponibilites.filter(d => {
          const date = parseDateLocal(d.date);
          return date.getMonth() === nextMonth && date.getFullYear() === nextYear;
        });
        
        return (
          <div className="kpi-grid" style={{marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', maxWidth: '600px'}}>
            <div className="kpi-card" style={{background: '#D1FAE5'}}>
              <h3>{disposMoisProchain.length}</h3>
              <p>Disponibilités</p>
              <small style={{fontSize: '0.75rem', opacity: 0.8}}>{moisProchainLabel}</small>
            </div>
            <div className="kpi-card" style={{background: '#FCA5A5'}}>
              <h3>{indisposMoisProchain.length}</h3>
              <p>Indisponibilités</p>
              <small style={{fontSize: '0.75rem', opacity: 0.8}}>{moisProchainLabel}</small>
            </div>
          </div>
        );
      })()}

      {/* Barre de Contrôles */}
      <div className="personnel-controls" style={{marginBottom: '2rem'}}>
        <div style={{display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between'}}>
          {/* Boutons d'action */}
          <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap'}}>
            <Button 
              variant="default" 
              onClick={() => setShowCalendarModal(true)}
              data-testid="configure-availability-btn"
              disabled={blocageInfo.bloque && !blocageInfo.exception_appliquee}
              title={blocageInfo.bloque && !blocageInfo.exception_appliquee ? blocageInfo.raison : ''}
            >
              ✅ Mes Disponibilités
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowGenerationModal(true)}
              data-testid="generate-indisponibilites-btn"
              disabled={blocageInfo.bloque && !blocageInfo.exception_appliquee}
              title={blocageInfo.bloque && !blocageInfo.exception_appliquee ? blocageInfo.raison : ''}
            >
              ❌ Indisponibilités
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => setShowReinitModal(true)}
              data-testid="reinit-disponibilites-btn"
              disabled={blocageInfo.bloque && !blocageInfo.exception_appliquee}
              title={blocageInfo.bloque && !blocageInfo.exception_appliquee ? blocageInfo.raison : ''}
            >
              🗑️ Supprimer Tout
            </Button>
          </div>

          {/* Exports - Uniquement pour Admin/Superviseur */}
          {(user.role === 'admin' || user.role === 'superviseur') && (
            <div style={{display: 'flex', gap: '1rem'}}>
              <Button variant="outline" onClick={() => { setExportType('pdf'); setShowExportModal(true); }}>
                📄 Export PDF
              </Button>
              <Button variant="outline" onClick={() => { setExportType('excel'); setShowExportModal(true); }}>
                📊 Export Excel
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Module Disponibilités - Calendrier Visuel */}
      <div className="disponibilites-visual-container">

        {/* Barre de navigation du mois - Harmonisée */}
        <div className="calendar-month-nav" style={{
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1rem',
          padding: '0.75rem',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          gap: '0.25rem',
          flexWrap: 'nowrap',
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box'
        }}>
          <Button 
            variant="outline"
            onClick={() => navigateMonth('prev')}
            className="month-nav-btn"
          >
            ←
          </Button>
          <h2 className="month-nav-title" style={{margin: 0, fontSize: '1.1rem', fontWeight: '600', color: '#1F2937', textAlign: 'center', flex: 1, minWidth: 0, whiteSpace: 'nowrap'}}>
            {getMonthName(calendarCurrentMonth)} {calendarCurrentYear}
          </h2>
          <Button 
            variant="outline"
            onClick={() => navigateMonth('next')}
            className="month-nav-btn"
          >
            →
          </Button>
        </div>

        {/* Grand Calendrier Visuel */}
        <div className="visual-calendar">
          {/* Jours de la semaine */}
          <div className="calendar-weekdays">
            <div className="calendar-weekday">Lun</div>
            <div className="calendar-weekday">Mar</div>
            <div className="calendar-weekday">Mer</div>
            <div className="calendar-weekday">Jeu</div>
            <div className="calendar-weekday">Ven</div>
            <div className="calendar-weekday">Sam</div>
            <div className="calendar-weekday">Dim</div>
          </div>

          {/* Grille des jours */}
          <div className="calendar-days-grid">
            {/* Cases vides pour aligner le premier jour */}
            {Array.from({ length: getFirstDayOfMonth(calendarCurrentMonth, calendarCurrentYear) }).map((_, index) => (
              <div key={`empty-${index}`} className="calendar-day-cell empty"></div>
            ))}

            {/* Jours du mois */}
            {Array.from({ length: getDaysInMonth(calendarCurrentMonth, calendarCurrentYear) }).map((_, dayIndex) => {
              const dayNumber = dayIndex + 1;
              const currentDate = new Date(calendarCurrentYear, calendarCurrentMonth, dayNumber);
              // Format YYYY-MM-DD sans conversion UTC
              const dateStr = `${calendarCurrentYear}-${String(calendarCurrentMonth + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
              const today = new Date();
              const isToday = currentDate.toDateString() === today.toDateString();
              
              const dayDispos = userDisponibilites.filter(d => d.date === dateStr || d.date.startsWith(dateStr));
              const disponibilites = dayDispos.filter(d => d.statut === 'disponible');
              const hasIndisponibilite = dayDispos.some(d => d.statut === 'indisponible');

              return (
                <div 
                  key={dayNumber} 
                  className={`calendar-day-cell ${isToday ? 'today' : ''}`}
                  onClick={() => handleDayClick(dayNumber)}
                >
                  <div className="calendar-day-number">{dayNumber}</div>
                  <div className="calendar-day-content">
                    {/* Indisponibilité: croix rouge */}
                    {hasIndisponibilite && (
                      <div className="calendar-indispo-marker">❌</div>
                    )}

                    {/* Disponibilités: pastilles colorées */}
                    {!hasIndisponibilite && disponibilites.length > 0 && (
                      <div className="calendar-dispo-pills">
                        {disponibilites.slice(0, 2).map((dispo, idx) => {
                          const typeGarde = typesGarde.find(t => t.id === dispo.type_garde_id);
                          const color = typeGarde?.couleur || '#3b82f6';
                          const typeName = typeGarde?.nom || 'Dispo';
                          
                          return (
                            <div 
                              key={idx}
                              className="calendar-dispo-pill"
                              style={{ backgroundColor: color }}
                              title={`${typeName} ${dispo.heure_debut}-${dispo.heure_fin}`}
                            >
                              {typeName}
                            </div>
                          );
                        })}
                        {disponibilites.length > 2 && (
                          <div className="calendar-dispo-more">+{disponibilites.length - 2}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Légende du calendrier */}
        <div className="calendar-legend">
          <div className="calendar-legend-item">
            <span className="calendar-legend-icon">❌</span>
            <span className="calendar-legend-label">Indisponible</span>
          </div>
          {typesGarde.map(type => (
            <div key={type.id} className="calendar-legend-item">
              <div 
                className="calendar-legend-pill" 
                style={{ backgroundColor: type.couleur }}
              ></div>
              <span className="calendar-legend-label">{type.nom}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modal détail du jour */}

      {/* Modal de détail du jour */}
      <DayDetailModal
        show={showDayDetailModal}
        selectedDay={selectedDayForDetail}
        dayDetailData={dayDetailData}
        typesGarde={typesGarde}
        onClose={() => setShowDayDetailModal(false)}
        onDelete={handleDeleteDisponibilite}
        onAddDisponibilite={() => {
          if (selectedDayForDetail) {
            setQuickAddConfig({
              date: selectedDayForDetail.toISOString().split('T')[0],
              type_garde_id: '',
              heure_debut: '00:00',
              heure_fin: '23:59'
            });
            setQuickAddType('disponibilite');
            setShowDayDetailModal(false);
            setShowQuickAddModal(true);
          }
        }}
        onAddIndisponibilite={() => {
          if (selectedDayForDetail) {
            setQuickAddConfig({
              date: selectedDayForDetail.toISOString().split('T')[0],
              type_garde_id: '',
              heure_debut: '00:00',
              heure_fin: '23:59'
            });
            setQuickAddType('indisponibilite');
            setShowDayDetailModal(false);
            setShowQuickAddModal(true);
          }
        }}
      />

      {/* Modal d'ajout rapide */}
      <QuickAddModal
        show={showQuickAddModal}
        type={quickAddType}
        config={quickAddConfig}
        setConfig={setQuickAddConfig}
        typesGarde={typesGarde}
        onClose={() => setShowQuickAddModal(false)}
        onSave={handleQuickAddSave}
      />

      {/* Modal de configuration avancée */}
      {showCalendarModal && (
        <div className="modal-overlay" onClick={() => setShowCalendarModal(false)}>
          <div className="modal-content extra-large-modal" onClick={(e) => e.stopPropagation()} data-testid="availability-config-modal">
            <div className="modal-header">
              <h3>✅ Gérer disponibilités</h3>
              <Button variant="ghost" onClick={() => setShowCalendarModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="availability-config-advanced">
                {/* Sélecteur de mode */}
                <div className="config-section" style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button
                      onClick={() => setAvailabilityConfig({...availabilityConfig, mode: 'calendrier'})}
                      style={{
                        padding: '10px 20px',
                        border: availabilityConfig.mode === 'calendrier' ? '2px solid #16a34a' : '2px solid #e2e8f0',
                        borderRadius: '8px',
                        background: availabilityConfig.mode === 'calendrier' ? '#f0fdf4' : 'white',
                        cursor: 'pointer',
                        fontWeight: availabilityConfig.mode === 'calendrier' ? 'bold' : 'normal',
                        color: availabilityConfig.mode === 'calendrier' ? '#16a34a' : '#64748b'
                      }}
                    >
                      📅 Calendrier (Clics multiples)
                    </button>
                    <button
                      onClick={() => setAvailabilityConfig({...availabilityConfig, mode: 'recurrence'})}
                      style={{
                        padding: '10px 20px',
                        border: availabilityConfig.mode === 'recurrence' ? '2px solid #16a34a' : '2px solid #e2e8f0',
                        borderRadius: '8px',
                        background: availabilityConfig.mode === 'recurrence' ? '#f0fdf4' : 'white',
                        cursor: 'pointer',
                        fontWeight: availabilityConfig.mode === 'recurrence' ? 'bold' : 'normal',
                        color: availabilityConfig.mode === 'recurrence' ? '#16a34a' : '#64748b'
                      }}
                    >
                      🔄 Avec récurrence
                    </button>
                  </div>
                </div>

                {/* Configuration du type de garde */}
                <div className="config-section">
                  <h4>🚒 Type de garde spécifique</h4>
                  <div className="type-garde-selection">
                    <Label>Pour quel type de garde êtes-vous disponible ?</Label>
                    <select
                      value={availabilityConfig.type_garde_id}
                      onChange={(e) => handleTypeGardeChange(e.target.value)}
                      className="form-select"
                      data-testid="availability-type-garde-select"
                    >
                      <option value="">Tous les types de garde</option>
                      {typesGarde.map(type => (
                        <option key={type.id} value={type.id}>
                          {type.nom} ({type.heure_debut} - {type.heure_fin})
                        </option>
                      ))}
                    </select>
                    <small>
                      Sélectionnez un type spécifique ou laissez "Tous les types" pour une disponibilité générale
                    </small>
                  </div>
                </div>

                {/* Configuration des horaires - Seulement si "Tous les types" */}
                {!availabilityConfig.type_garde_id && (
                  <div className="config-section">
                    <h4>⏰ Créneaux horaires personnalisés</h4>
                    <p className="section-note">Définissez vos horaires de disponibilité générale</p>
                    <div className="time-config-row">
                      <div className="time-field">
                        <Label>Heure de début</Label>
                        <Input 
                          type="time" 
                          value={availabilityConfig.heure_debut}
                          onChange={(e) => setAvailabilityConfig({...availabilityConfig, heure_debut: e.target.value})}
                          data-testid="availability-start-time"
                        />
                      </div>
                      <div className="time-field">
                        <Label>Heure de fin</Label>
                        <Input 
                          type="time" 
                          value={availabilityConfig.heure_fin}
                          onChange={(e) => setAvailabilityConfig({...availabilityConfig, heure_fin: e.target.value})}
                          data-testid="availability-end-time"
                        />
                      </div>
                    </div>
                    <small style={{ marginTop: '8px', display: 'block', color: '#64748b' }}>
                      ℹ️ Les entrées créées ici seront automatiquement marquées comme "Disponible"
                    </small>
                  </div>
                )}

                {/* Horaires automatiques si type spécifique sélectionné */}
                {availabilityConfig.type_garde_id && (
                  <div className="config-section">
                    <h4>⏰ Horaires du type de garde</h4>
                    <div className="automatic-hours">
                      <div className="hours-display">
                        <span className="hours-label">Horaires automatiques :</span>
                        <span className="hours-value">
                          {(() => {
                            const selectedType = typesGarde.find(t => t.id === availabilityConfig.type_garde_id);
                            return selectedType ? `${selectedType.heure_debut} - ${selectedType.heure_fin}` : 'Non défini';
                          })()}
                        </span>
                      </div>
                      <small style={{ marginTop: '8px', display: 'block', color: '#64748b' }}>
                        ℹ️ Les disponibilités seront automatiquement enregistrées avec ces horaires
                      </small>
                    </div>
                  </div>
                )}

                {/* MODE CALENDRIER - Sélection des dates */}
                {availabilityConfig.mode === 'calendrier' && (
                  <div className="config-section">
                    <h4>📆 Sélection des dates</h4>
                    <div className="calendar-instructions">
                      <p>Cliquez sur les dates où vous êtes disponible :</p>
                      <small style={{color: '#3b82f6', marginTop: '0.5rem', display: 'block'}}>
                        🔵 Les dates en bleu clair indiquent des disponibilités déjà saisies
                      </small>
                      <small style={{color: '#ef4444', marginTop: '0.25rem', display: 'block'}}>
                        ❌ Les dates barrées en rouge indiquent des indisponibilités existantes
                      </small>
                    </div>
                    
                    <Calendar
                      mode="multiple"
                      selected={selectedDates}
                      onSelect={setSelectedDates}
                      className="interactive-calendar"
                      disabled={(date) => date < new Date().setHours(0,0,0,0)}
                      indisponibilites={userDisponibilites.filter(d => d.statut === 'indisponible')}
                      disponibilites={userDisponibilites.filter(d => d.statut === 'disponible')}
                    />
                    
                    <div className="selection-summary-advanced">
                      <div className="summary-item">
                        <strong>Type de garde :</strong> {getTypeGardeName(availabilityConfig.type_garde_id)}
                      </div>
                      <div className="summary-item">
                        <strong>Dates sélectionnées :</strong> {selectedDates?.length || 0} jour(s)
                      </div>
                      <div className="summary-item">
                        <strong>Horaires :</strong> {availabilityConfig.heure_debut} - {availabilityConfig.heure_fin}
                      </div>
                    </div>
                  </div>
                )}

                {/* MODE RÉCURRENCE - Période avec récurrence */}
                {availabilityConfig.mode === 'recurrence' && (
                  <>
                    <div className="config-section">
                      <h4>📅 Période</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <Label>Date de début</Label>
                          <Input
                            type="date"
                            value={availabilityConfig.date_debut}
                            onChange={(e) => setAvailabilityConfig({...availabilityConfig, date_debut: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label>Date de fin</Label>
                          <Input
                            type="date"
                            value={availabilityConfig.date_fin}
                            onChange={(e) => setAvailabilityConfig({...availabilityConfig, date_fin: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="config-section">
                      <h4>🔄 Récurrence</h4>
                      <Label>Type de récurrence</Label>
                      <select
                        value={availabilityConfig.recurrence_type}
                        onChange={(e) => setAvailabilityConfig({...availabilityConfig, recurrence_type: e.target.value})}
                        className="form-select"
                      >
                        <option value="hebdomadaire">Toutes les semaines (hebdomadaire)</option>
                        <option value="bihebdomadaire">Toutes les deux semaines (bihebdomadaire)</option>
                        <option value="mensuelle">Tous les mois (mensuelle)</option>
                        <option value="annuelle">Tous les ans (annuelle)</option>
                        <option value="personnalisee">Personnalisée</option>
                      </select>

                      {availabilityConfig.recurrence_type === 'personnalisee' && (
                        <div style={{ marginTop: '15px', padding: '15px', background: '#f0fdf4', borderRadius: '8px' }}>
                          <h5 style={{ marginTop: 0, marginBottom: '10px' }}>⚙️ Configuration personnalisée</h5>
                          <Label>Fréquence</Label>
                          <select
                            value={availabilityConfig.recurrence_frequence}
                            onChange={(e) => setAvailabilityConfig({...availabilityConfig, recurrence_frequence: e.target.value})}
                            className="form-select"
                            style={{ marginBottom: '10px' }}
                          >
                            <option value="jours">Jours</option>
                            <option value="semaines">Semaines</option>
                            <option value="mois">Mois</option>
                            <option value="ans">Ans</option>
                          </select>

                          <Label>Intervalle : Tous les</Label>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <Input
                              type="number"
                              min="1"
                              max="365"
                              value={availabilityConfig.recurrence_intervalle}
                              onChange={(e) => setAvailabilityConfig({...availabilityConfig, recurrence_intervalle: parseInt(e.target.value) || 1})}
                              style={{ width: '100px' }}
                            />
                            <span>{availabilityConfig.recurrence_frequence}</span>
                          </div>
                        </div>
                      )}
                      
                      {/* Sélection des jours de la semaine pour hebdomadaire/bihebdomadaire */}
                      {(availabilityConfig.recurrence_type === 'hebdomadaire' || availabilityConfig.recurrence_type === 'bihebdomadaire') && (
                        <div style={{ marginTop: '15px', padding: '15px', background: '#f0fdf4', borderRadius: '8px' }}>
                          <h5 style={{ marginTop: 0, marginBottom: '10px' }}>📅 Sélectionnez les jours de la semaine</h5>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
                            {[
                              { label: 'Lun', value: 'monday' },
                              { label: 'Mar', value: 'tuesday' },
                              { label: 'Mer', value: 'wednesday' },
                              { label: 'Jeu', value: 'thursday' },
                              { label: 'Ven', value: 'friday' },
                              { label: 'Sam', value: 'saturday' },
                              { label: 'Dim', value: 'sunday' }
                            ].map(jour => (
                              <label
                                key={jour.value}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  padding: '8px',
                                  borderRadius: '8px',
                                  border: `2px solid ${availabilityConfig.jours_semaine?.includes(jour.value) ? '#16a34a' : '#cbd5e1'}`,
                                  background: availabilityConfig.jours_semaine?.includes(jour.value) ? '#dcfce7' : 'white',
                                  cursor: 'pointer',
                                  fontWeight: availabilityConfig.jours_semaine?.includes(jour.value) ? '600' : '400'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={availabilityConfig.jours_semaine?.includes(jour.value) || false}
                                  onChange={(e) => {
                                    const currentJours = availabilityConfig.jours_semaine || [];
                                    const newJours = e.target.checked
                                      ? [...currentJours, jour.value]
                                      : currentJours.filter(j => j !== jour.value);
                                    setAvailabilityConfig({...availabilityConfig, jours_semaine: newJours});
                                  }}
                                  style={{ marginRight: '6px' }}
                                />
                                {jour.label}
                              </label>
                            ))}
                          </div>
                          {availabilityConfig.jours_semaine && availabilityConfig.jours_semaine.length > 0 && (
                            <p style={{ marginTop: '10px', color: '#16a34a', fontSize: '0.9rem' }}>
                              ✓ {availabilityConfig.jours_semaine.length} jour(s) sélectionné(s)
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Résumé pour le mode récurrence */}
                    <div className="config-section" style={{ background: '#f0fdf4', padding: '15px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                      <h4 style={{ color: '#15803d', marginTop: 0 }}>📊 Résumé</h4>
                      <ul style={{ margin: '10px 0', paddingLeft: '20px', color: '#15803d' }}>
                        <li><strong>Mode :</strong> Récurrence</li>
                        <li><strong>Type de garde :</strong> {getTypeGardeName(availabilityConfig.type_garde_id)}</li>
                        <li><strong>Période :</strong> Du {new Date(availabilityConfig.date_debut).toLocaleDateString('fr-FR')} au {new Date(availabilityConfig.date_fin).toLocaleDateString('fr-FR')}</li>
                        <li><strong>Récurrence :</strong> {
                          availabilityConfig.recurrence_type === 'hebdomadaire' ? 'Toutes les semaines' :
                          availabilityConfig.recurrence_type === 'bihebdomadaire' ? 'Toutes les 2 semaines' :
                          availabilityConfig.recurrence_type === 'mensuelle' ? 'Tous les mois' :
                          availabilityConfig.recurrence_type === 'annuelle' ? 'Tous les ans' :
                          `Tous les ${availabilityConfig.recurrence_intervalle} ${availabilityConfig.recurrence_frequence}`
                        }</li>
                        <li><strong>Horaires :</strong> {availabilityConfig.heure_debut} - {availabilityConfig.heure_fin}</li>
                      </ul>
                    </div>
                  </>
                )}
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowCalendarModal(false)}>
                  Annuler
                </Button>
                <Button 
                  variant="default" 
                  onClick={handleSaveAvailability}
                  data-testid="save-availability-btn"
                  disabled={availabilityConfig.mode === 'calendrier' && (!selectedDates || selectedDates.length === 0)}
                >
                  {availabilityConfig.mode === 'calendrier' 
                    ? `✅ Sauvegarder (${selectedDates?.length || 0} jour${selectedDates?.length > 1 ? 's' : ''})`
                    : '✅ Générer les disponibilités'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de génération automatique d'indisponibilités */}
      {showGenerationModal && (
        <div className="modal-overlay" onClick={() => setShowGenerationModal(false)}>
          <div className="modal-content extra-large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>❌ Gérer indisponibilités</h3>
              <Button variant="ghost" onClick={() => setShowGenerationModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              {/* Onglets */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0' }}>
                <button
                  onClick={() => setIndispoTab('generation')}
                  style={{
                    padding: '12px 24px',
                    border: 'none',
                    background: indispoTab === 'generation' ? 'white' : 'transparent',
                    borderBottom: indispoTab === 'generation' ? '3px solid #dc2626' : 'none',
                    fontWeight: indispoTab === 'generation' ? 'bold' : 'normal',
                    cursor: 'pointer',
                    color: indispoTab === 'generation' ? '#dc2626' : '#64748b'
                  }}
                >
                  🚒 Génération automatique
                </button>
                <button
                  onClick={() => setIndispoTab('manuelle')}
                  style={{
                    padding: '12px 24px',
                    border: 'none',
                    background: indispoTab === 'manuelle' ? 'white' : 'transparent',
                    borderBottom: indispoTab === 'manuelle' ? '3px solid #dc2626' : 'none',
                    fontWeight: indispoTab === 'manuelle' ? 'bold' : 'normal',
                    cursor: 'pointer',
                    color: indispoTab === 'manuelle' ? '#dc2626' : '#64748b'
                  }}
                >
                  ✍️ Saisie manuelle
                </button>
              </div>

              {/* Contenu de l'onglet Génération */}
              {indispoTab === 'generation' && (
              <div>
              <div className="generation-config">
                {/* Sélection du type d'horaire */}
                <div className="config-section">
                  <h4>📋 Type d'horaire</h4>
                  <select
                    value={generationConfig.horaire_type}
                    onChange={(e) => setGenerationConfig({...generationConfig, horaire_type: e.target.value})}
                    className="form-select"
                  >
                    {/* Horaires prédéfinis */}
                    <option value="montreal">Montréal 7/24 (Cycle 28 jours)</option>
                    <option value="quebec">Québec 10/14 (Cycle 28 jours)</option>
                    <option value="longueuil">Longueuil 7/24 (Cycle 28 jours)</option>
                    {/* Horaires personnalisés - mélangés sans séparateur */}
                    {horairesPersonnalises.filter(h => !h.predefini).map(h => (
                      <option key={h.id} value={h.id}>
                        {h.nom} ({h.nombre_equipes} équipes, {h.duree_cycle} jours)
                      </option>
                    ))}
                  </select>
                  <small style={{ display: 'block', marginTop: '8px', color: '#666' }}>
                    {generationConfig.horaire_type === 'montreal' 
                      ? 'Horaire Montréal 7/24 : Cycle de 28 jours. Vous serez INDISPONIBLE les 7 jours où votre équipe travaille.'
                      : generationConfig.horaire_type === 'quebec'
                      ? 'Horaire Québec 10/14 : Cycle de 28 jours. Vous serez INDISPONIBLE les 13 jours travaillés par cycle.'
                      : generationConfig.horaire_type === 'longueuil'
                      ? 'Horaire Longueuil 7/24 : Cycle de 28 jours. Vous serez INDISPONIBLE les 7 jours de 24h où votre équipe travaille.'
                      : (() => {
                          const horaire = horairesPersonnalises.find(h => h.id === generationConfig.horaire_type);
                          return horaire 
                            ? `${horaire.nom} : Cycle de ${horaire.duree_cycle} jours avec ${horaire.nombre_equipes} équipes. ${horaire.type_quart === '12h_jour_nuit' ? 'Quarts jour/nuit.' : 'Quarts de 24h.'}`
                            : 'Sélectionnez un horaire';
                        })()
                    }
                  </small>
                </div>

                {/* Sélection de l'équipe - dynamique selon l'horaire choisi */}
                <div className="config-section">
                  <h4>👥 Équipe</h4>
                  <div className="equipe-selection" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                    {(() => {
                      // Récupérer les équipes de l'horaire sélectionné
                      const horaireSelectionne = horairesPersonnalises.find(h => h.id === generationConfig.horaire_type);
                      const equipes = horaireSelectionne?.equipes || [
                        {nom: 'Vert', numero: 1, couleur: '#22C55E'},
                        {nom: 'Bleu', numero: 2, couleur: '#3B82F6'},
                        {nom: 'Jaune', numero: 3, couleur: '#EAB308'},
                        {nom: 'Rouge', numero: 4, couleur: '#EF4444'}
                      ];
                      return equipes.map(equipe => (
                        <button
                          key={equipe.nom}
                          onClick={() => setGenerationConfig({...generationConfig, equipe: equipe.nom})}
                          className={`equipe-button ${generationConfig.equipe === equipe.nom ? 'selected' : ''}`}
                          style={{
                            padding: '12px',
                            border: generationConfig.equipe === equipe.nom ? '2px solid #dc2626' : '2px solid #e2e8f0',
                            borderRadius: '8px',
                            backgroundColor: generationConfig.equipe === equipe.nom ? (equipe.couleur || '#fff') + '30' : '#fff',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          <span style={{ 
                            display: 'inline-block', 
                            width: '12px', 
                            height: '12px', 
                            borderRadius: '50%', 
                            backgroundColor: equipe.couleur || '#6b7280',
                            marginRight: '8px'
                          }}></span>
                          {equipe.nom}
                        </button>
                      ));
                    })()}
                  </div>
                </div>

                {/* Sélection des dates */}
                <div className="config-section">
                  <h4>📅 Période de génération</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Date de début</label>
                      <Input
                        type="date"
                        value={generationConfig.date_debut}
                        onChange={(e) => setGenerationConfig({...generationConfig, date_debut: e.target.value})}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Date de fin</label>
                      <Input
                        type="date"
                        value={generationConfig.date_fin}
                        onChange={(e) => setGenerationConfig({...generationConfig, date_fin: e.target.value})}
                      />
                    </div>
                  </div>
                  <small style={{ display: 'block', marginTop: '8px', color: '#666' }}>
                    Les indisponibilités seront générées entre ces deux dates
                  </small>
                </div>

                {/* Option de conservation des modifications manuelles */}
                <div className="config-section">
                  <h4>⚠️ Gestion des données existantes</h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: '#fef3c7', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                    <input
                      type="checkbox"
                      id="conserver-manuelles"
                      checked={generationConfig.conserver_manuelles}
                      onChange={(e) => setGenerationConfig({...generationConfig, conserver_manuelles: e.target.checked})}
                      style={{ width: '20px', height: '20px' }}
                    />
                    <label htmlFor="conserver-manuelles" style={{ cursor: 'pointer', color: '#78350f' }}>
                      <strong>Conserver les modifications manuelles</strong>
                      <div style={{ fontSize: '0.875rem', marginTop: '4px' }}>
                        {generationConfig.conserver_manuelles 
                          ? 'Les disponibilités ajoutées manuellement seront préservées'
                          : '⚠️ ATTENTION : Toutes les disponibilités existantes seront supprimées'}
                      </div>
                    </label>
                  </div>
                </div>

                {/* Résumé de la génération */}
                <div className="config-section" style={{ background: '#eff6ff', padding: '15px', borderRadius: '8px', border: '1px solid #3b82f6' }}>
                  <h4 style={{ color: '#1e40af', marginTop: 0 }}>📊 Résumé de la génération</h4>
                  <ul style={{ margin: '10px 0', paddingLeft: '20px', color: '#1e40af' }}>
                    <li><strong>Horaire :</strong> {
                      generationConfig.horaire_type === 'montreal' ? 'Montreal 7/24' 
                      : generationConfig.horaire_type === 'quebec' ? 'Quebec 10/14'
                      : 'Longueuil 7/24'
                    }</li>
                    <li><strong>Équipe :</strong> {generationConfig.equipe}</li>
                    <li><strong>Période :</strong> Du {new Date(generationConfig.date_debut).toLocaleDateString('fr-FR')} au {new Date(generationConfig.date_fin).toLocaleDateString('fr-FR')}</li>
                    <li><strong>Mode :</strong> {generationConfig.conserver_manuelles ? 'Conservation des modifications manuelles' : 'Remplacement total'}</li>


                {/* Section Formatage Planning supprimée - déplacée vers modal Planning */}
                {false && (
                  <div style={{
                    marginTop: '30px',
                    padding: '20px',
                    backgroundColor: '#fef2f2',
                    border: '2px solid #fecaca',
                    borderRadius: '8px'
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: showFormatageSection ? '15px' : '0'
                    }}>
                      <h4 style={{ margin: 0, color: '#991b1b', fontSize: '14px' }}>
                        🗑️ Formatage Planning (DEMO)
                      </h4>
                      <button
                        onClick={() => setShowFormatageSection(!showFormatageSection)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'transparent',
                          border: '1px solid #dc2626',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: '#dc2626'
                        }}
                      >
                        {showFormatageSection ? '▲ Masquer' : '▼ Afficher'}
                      </button>
                    </div>

                    {showFormatageSection && (
                      <div>
                        <p style={{ 
                          fontSize: '13px', 
                          color: '#7f1d1d',
                          marginBottom: '15px',
                          lineHeight: '1.5'
                        }}>
                          ⚠️ Cette fonctionnalité supprime <strong>toutes les assignations et demandes de remplacement</strong> du mois sélectionné. Utilisez-la pour vider le planning avant une démonstration.
                        </p>

                        <div style={{ marginBottom: '15px' }}>
                          <label style={{ 
                            display: 'block', 
                            marginBottom: '8px',
                            fontSize: '13px',
                            fontWeight: 'bold',
                            color: '#7f1d1d'
                          }}>
                            📅 Sélectionner le mois à formater:
                          </label>
                          <input
                            type="month"
                            value={moisFormatage}
                            onChange={(e) => setMoisFormatage(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '10px',
                              border: '2px solid #dc2626',
                              borderRadius: '6px',
                              fontSize: '14px'
                            }}
                          />
                        </div>

                        <button
                          onClick={handleFormaterPlanning}
                          style={{
                            width: '100%',
                            padding: '12px',
                            backgroundColor: '#dc2626',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#b91c1c'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = '#dc2626'}
                        >
                          🗑️ Formater le planning de {new Date(moisFormatage + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                  </ul>
                  <p style={{ margin: '10px 0 0 0', fontSize: '0.875rem', color: '#1e40af' }}>
                    💡 Les <strong>INDISPONIBILITÉS</strong> seront générées pour tous les jours où votre équipe <strong>TRAVAILLE</strong> à son emploi principal selon le cycle sélectionné (vous ne serez donc pas disponible pour les gardes de pompiers ces jours-là).
                  </p>
                </div>
              </div>

                <div className="modal-actions">
                  <Button variant="outline" onClick={() => setShowGenerationModal(false)}>
                    Annuler
                  </Button>
                  <Button 
                    variant="default" 
                    onClick={handleGenerateIndisponibilites}
                    disabled={isGenerating}
                  >
                    {isGenerating ? 'Génération en cours...' : '🚀 Générer les indisponibilités'}
                  </Button>
                </div>
              </div>
              )}

              {/* Contenu de l'onglet Saisie manuelle */}
              {indispoTab === 'manuelle' && (
                <div>
                  <div className="manual-indispo-config">
                    {/* Sélecteur de mode */}
                    <div className="config-section" style={{ marginBottom: '20px' }}>
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                        <button
                          onClick={() => setManualIndispoMode('calendrier')}
                          style={{
                            padding: '10px 20px',
                            border: manualIndispoMode === 'calendrier' ? '2px solid #dc2626' : '2px solid #e2e8f0',
                            borderRadius: '8px',
                            background: manualIndispoMode === 'calendrier' ? '#fef2f2' : 'white',
                            cursor: 'pointer',
                            fontWeight: manualIndispoMode === 'calendrier' ? 'bold' : 'normal',
                            color: manualIndispoMode === 'calendrier' ? '#dc2626' : '#64748b'
                          }}
                        >
                          📅 Calendrier (Clics multiples)
                        </button>
                        <button
                          onClick={() => setManualIndispoMode('recurrence')}
                          style={{
                            padding: '10px 20px',
                            border: manualIndispoMode === 'recurrence' ? '2px solid #dc2626' : '2px solid #e2e8f0',
                            borderRadius: '8px',
                            background: manualIndispoMode === 'recurrence' ? '#fef2f2' : 'white',
                            cursor: 'pointer',
                            fontWeight: manualIndispoMode === 'recurrence' ? 'bold' : 'normal',
                            color: manualIndispoMode === 'recurrence' ? '#dc2626' : '#64748b'
                          }}
                        >
                          🔄 Avec récurrence
                        </button>
                      </div>
                    </div>

                    {/* MODE CALENDRIER */}
                    {manualIndispoMode === 'calendrier' && (
                      <>
                        <div className="config-section">
                          <h4>📆 Sélection des dates d'indisponibilité</h4>
                          <Calendar
                            mode="multiple"
                            selected={manualIndispoConfig.dates}
                            onSelect={(dates) => setManualIndispoConfig({...manualIndispoConfig, dates: dates || []})}
                            className="interactive-calendar"
                            locale={fr}
                            indisponibilites={userDisponibilites.filter(d => d.statut === 'indisponible')}
                            disponibilites={userDisponibilites.filter(d => d.statut === 'disponible')}
                          />
                          <small style={{ display: 'block', marginTop: '8px', color: '#64748b' }}>
                            📌 Cliquez sur plusieurs dates pour sélectionner vos jours d'indisponibilité
                          </small>
                          <small style={{color: '#1e3a5f', marginTop: '0.5rem', display: 'block'}}>
                            🔵 Les dates en bleu foncé indiquent des disponibilités déjà saisies
                          </small>
                          <small style={{color: '#ef4444', marginTop: '0.25rem', display: 'block'}}>
                            ❌ Les dates barrées en rouge indiquent des indisponibilités existantes
                          </small>
                          {manualIndispoConfig.dates.length > 0 && (
                            <p style={{ marginTop: '10px', color: '#dc2626', fontWeight: 'bold' }}>
                              ✓ {manualIndispoConfig.dates.length} date(s) sélectionnée(s)
                            </p>
                          )}
                        </div>
                      </>
                    )}

                    {/* MODE RÉCURRENCE */}
                    {manualIndispoMode === 'recurrence' && (
                      <>
                        <div className="config-section">
                          <h4>📅 Période</h4>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                              <Label>Date de début</Label>
                              <Input
                                type="date"
                                value={manualIndispoConfig.date_debut}
                                onChange={(e) => setManualIndispoConfig({...manualIndispoConfig, date_debut: e.target.value})}
                              />
                            </div>
                            <div>
                              <Label>Date de fin</Label>
                              <Input
                                type="date"
                                value={manualIndispoConfig.date_fin}
                                onChange={(e) => setManualIndispoConfig({...manualIndispoConfig, date_fin: e.target.value})}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="config-section">
                          <h4>🔄 Récurrence</h4>
                          <Label>Type de récurrence</Label>
                          <select
                            value={manualIndispoConfig.recurrence_type}
                            onChange={(e) => setManualIndispoConfig({...manualIndispoConfig, recurrence_type: e.target.value})}
                            className="form-select"
                          >
                            <option value="hebdomadaire">Toutes les semaines (hebdomadaire)</option>
                            <option value="bihebdomadaire">Toutes les deux semaines (bihebdomadaire)</option>
                            <option value="mensuelle">Tous les mois (mensuelle)</option>
                            <option value="annuelle">Tous les ans (annuelle)</option>
                            <option value="personnalisee">Personnalisée</option>
                          </select>

                          {manualIndispoConfig.recurrence_type === 'personnalisee' && (
                            <div style={{ marginTop: '15px', padding: '15px', background: '#f8fafc', borderRadius: '8px' }}>
                              <h5 style={{ marginTop: 0, marginBottom: '10px' }}>⚙️ Configuration personnalisée</h5>
                              <Label>Fréquence</Label>
                              <select
                                value={manualIndispoConfig.recurrence_frequence}
                                onChange={(e) => setManualIndispoConfig({...manualIndispoConfig, recurrence_frequence: e.target.value})}
                                className="form-select"
                                style={{ marginBottom: '10px' }}
                              >
                                <option value="jours">Jours</option>
                                <option value="semaines">Semaines</option>
                                <option value="mois">Mois</option>
                                <option value="ans">Ans</option>
                              </select>

                              <Label>Intervalle : Tous les</Label>
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <Input
                                  type="number"
                                  min="1"
                                  max="365"
                                  value={manualIndispoConfig.recurrence_intervalle}
                                  onChange={(e) => setManualIndispoConfig({...manualIndispoConfig, recurrence_intervalle: parseInt(e.target.value) || 1})}
                                  style={{ width: '100px' }}
                                />
                                <span>{manualIndispoConfig.recurrence_frequence}</span>
                              </div>
                            </div>
                          )}
                          
                          {/* Sélection des jours de la semaine pour hebdomadaire/bihebdomadaire */}
                          {(manualIndispoConfig.recurrence_type === 'hebdomadaire' || manualIndispoConfig.recurrence_type === 'bihebdomadaire') && (
                            <div style={{ marginTop: '15px', padding: '15px', background: '#fef2f2', borderRadius: '8px' }}>
                              <h5 style={{ marginTop: 0, marginBottom: '10px' }}>📅 Sélectionnez les jours de la semaine</h5>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
                                {[
                                  { label: 'Lun', value: 'monday' },
                                  { label: 'Mar', value: 'tuesday' },
                                  { label: 'Mer', value: 'wednesday' },
                                  { label: 'Jeu', value: 'thursday' },
                                  { label: 'Ven', value: 'friday' },
                                  { label: 'Sam', value: 'saturday' },
                                  { label: 'Dim', value: 'sunday' }
                                ].map(jour => (
                                  <label
                                    key={jour.value}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      padding: '8px',
                                      borderRadius: '8px',
                                      border: `2px solid ${manualIndispoConfig.jours_semaine?.includes(jour.value) ? '#dc2626' : '#cbd5e1'}`,
                                      background: manualIndispoConfig.jours_semaine?.includes(jour.value) ? '#fee2e2' : 'white',
                                      cursor: 'pointer',
                                      fontWeight: manualIndispoConfig.jours_semaine?.includes(jour.value) ? '600' : '400'
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={manualIndispoConfig.jours_semaine?.includes(jour.value) || false}
                                      onChange={(e) => {
                                        const currentJours = manualIndispoConfig.jours_semaine || [];
                                        const newJours = e.target.checked
                                          ? [...currentJours, jour.value]
                                          : currentJours.filter(j => j !== jour.value);
                                        setManualIndispoConfig({...manualIndispoConfig, jours_semaine: newJours});
                                      }}
                                      style={{ marginRight: '6px' }}
                                    />
                                    {jour.label}
                                  </label>
                                ))}
                              </div>
                              {manualIndispoConfig.jours_semaine && manualIndispoConfig.jours_semaine.length > 0 && (
                                <p style={{ marginTop: '10px', color: '#dc2626', fontSize: '0.9rem' }}>
                                  ✓ {manualIndispoConfig.jours_semaine.length} jour(s) sélectionné(s)
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* Configuration des horaires (commun aux deux modes) */}
                    <div className="config-section">
                      <h4>⏰ Horaires d'indisponibilité</h4>
                      <div className="time-config-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <Label>Heure de début</Label>
                          <Input 
                            type="time" 
                            value={manualIndispoConfig.heure_debut}
                            onChange={(e) => setManualIndispoConfig({...manualIndispoConfig, heure_debut: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label>Heure de fin</Label>
                          <Input 
                            type="time" 
                            value={manualIndispoConfig.heure_fin}
                            onChange={(e) => setManualIndispoConfig({...manualIndispoConfig, heure_fin: e.target.value})}
                          />
                        </div>
                      </div>
                      <small style={{ display: 'block', marginTop: '8px', color: '#64748b' }}>
                        💡 Par défaut : 00:00-23:59 (toute la journée)
                      </small>
                    </div>

                    {/* Résumé */}
                    <div className="config-section" style={{ background: '#fef2f2', padding: '15px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                      <h4 style={{ color: '#991b1b', marginTop: 0 }}>📊 Résumé</h4>
                      {manualIndispoMode === 'calendrier' ? (
                        <ul style={{ margin: '10px 0', paddingLeft: '20px', color: '#991b1b' }}>
                          <li><strong>Mode :</strong> Calendrier (clics multiples)</li>
                          <li><strong>Dates sélectionnées :</strong> {manualIndispoConfig.dates.length} jour(s)</li>
                          <li><strong>Horaires :</strong> {manualIndispoConfig.heure_debut} - {manualIndispoConfig.heure_fin}</li>
                        </ul>
                      ) : (
                        <ul style={{ margin: '10px 0', paddingLeft: '20px', color: '#991b1b' }}>
                          <li><strong>Mode :</strong> Récurrence</li>
                          <li><strong>Période :</strong> Du {new Date(manualIndispoConfig.date_debut).toLocaleDateString('fr-FR')} au {new Date(manualIndispoConfig.date_fin).toLocaleDateString('fr-FR')}</li>
                          <li><strong>Récurrence :</strong> {
                            manualIndispoConfig.recurrence_type === 'hebdomadaire' ? 'Toutes les semaines' :
                            manualIndispoConfig.recurrence_type === 'bihebdomadaire' ? 'Toutes les 2 semaines' :
                            manualIndispoConfig.recurrence_type === 'mensuelle' ? 'Tous les mois' :
                            manualIndispoConfig.recurrence_type === 'annuelle' ? 'Tous les ans' :
                            `Tous les ${manualIndispoConfig.recurrence_intervalle} ${manualIndispoConfig.recurrence_frequence}`
                          }</li>
                          <li><strong>Horaires :</strong> {manualIndispoConfig.heure_debut} - {manualIndispoConfig.heure_fin}</li>
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="modal-actions">
                    <Button variant="outline" onClick={() => setShowGenerationModal(false)}>
                      Annuler
                    </Button>
                    <Button 
                      variant="default" 
                      onClick={handleSaveManualIndisponibilites}
                      disabled={manualIndispoMode === 'calendrier' && manualIndispoConfig.dates.length === 0}
                    >
                      {manualIndispoMode === 'calendrier' 
                        ? `✅ Enregistrer ${manualIndispoConfig.dates.length > 0 ? `(${manualIndispoConfig.dates.length} jour${manualIndispoConfig.dates.length > 1 ? 's' : ''})` : ''}`
                        : '✅ Générer les indisponibilités'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de réinitialisation */}

      {/* Modal de réinitialisation */}
      <ReinitModal
        show={showReinitModal}
        onClose={() => setShowReinitModal(false)}
        reinitConfig={reinitConfig}
        setReinitConfig={setReinitConfig}
        reinitWarning={reinitWarning}
        setReinitWarning={setReinitWarning}
        isReinitializing={isReinitializing}
        onReinitialiser={handleReinitialiser}
      />

      {/* Modal Export Disponibilités */}

      {/* Modal Export Disponibilités */}
      <ExportModal
        show={showExportModal}
        onClose={() => setShowExportModal(false)}
        exportType={exportType}
        onExportAll={() => handleExportDisponibilites()}
        toast={toast}
      />
      
      {/* Overlay de chargement lors de l'enregistrement */}
      {savingDisponibilites && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          color: 'white'
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.5rem',
            padding: '2rem',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '16px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
            minWidth: '400px',
            maxWidth: '500px'
          }}>
            {/* Spinner animé */}
            <div style={{
              width: '60px',
              height: '60px',
              border: '4px solid rgba(255, 255, 255, 0.3)',
              borderTop: '4px solid white',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            
            {/* Message */}
            <div style={{
              fontSize: '1.2rem',
              fontWeight: '600',
              textAlign: 'center'
            }}>
              {savingMessage}
            </div>
            
            <div style={{
              fontSize: '0.9rem',
              opacity: 0.9,
              textAlign: 'center'
            }}>
              Veuillez patienter...
            </div>
          </div>
          
          <style>
            {`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}
          </style>
        </div>
      )}

      {/* Nouveau Modal de résolution de conflits multiples (batch) */}

      {/* Modal de conflits en batch */}
      <BatchConflictModal
        show={showBatchConflictModal}
        conflicts={batchConflicts}
        selections={batchConflictSelections}
        setSelections={setBatchConflictSelections}
        onClose={() => setShowBatchConflictModal(false)}
        onConfirm={handleResolveBatchConflicts}
      />

      {/* Modal d'erreur explicite pour les conflits bloquants */}
      {showErrorModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            zIndex: 1000009,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={() => setShowErrorModal(false)}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '16px',
              maxWidth: '550px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              animation: 'modalAppear 0.2s ease-out'
            }}
          >
            {/* Header */}
            <div style={{ 
              background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
              padding: '1.5rem',
              color: 'white'
            }}>
              <h2 style={{ 
                margin: 0, 
                fontSize: '1.5rem', 
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <span style={{ fontSize: '2rem' }}>🚫</span>
                {errorModalContent.title}
              </h2>
            </div>
            
            {/* Corps */}
            <div style={{ padding: '1.5rem' }}>
              {/* Message de succès si des entrées ont été créées */}
              {errorModalContent.successCount > 0 && (
                <div style={{
                  background: '#ECFDF5',
                  border: '2px solid #A7F3D0',
                  borderRadius: '12px',
                  padding: '1rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}>
                  <span style={{ fontSize: '1.5rem' }}>✅</span>
                  <div>
                    <div style={{ fontWeight: '600', color: '#065F46' }}>
                      {errorModalContent.successCount} entrée(s) créée(s) avec succès
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#047857' }}>
                      Les entrées sans conflit ont été enregistrées.
                    </div>
                  </div>
                </div>
              )}
              
              <p style={{ 
                marginBottom: '1rem', 
                color: '#4B5563',
                fontSize: '0.95rem',
                lineHeight: '1.5'
              }}>
                {errorModalContent.messages?.length === 1 
                  ? "L'entrée suivante n'a pas pu être créée car elle est en conflit :"
                  : `Les ${errorModalContent.messages?.length} entrées suivantes n'ont pas pu être créées car elles sont en conflit :`
                }
              </p>
              
              <div style={{ 
                background: '#FEF2F2', 
                border: '2px solid #FECACA', 
                borderRadius: '12px',
                padding: '1.25rem',
                maxHeight: '250px',
                overflow: 'auto'
              }}>
                {errorModalContent.messages.map((err, idx) => (
                  <div 
                    key={idx} 
                    style={{ 
                      padding: '1rem',
                      background: 'white',
                      borderRadius: '8px',
                      marginBottom: idx < errorModalContent.messages.length - 1 ? '0.75rem' : 0,
                      border: '1px solid #FECACA'
                    }}
                  >
                    <div style={{ 
                      fontWeight: '700', 
                      color: '#DC2626',
                      fontSize: '1rem',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      📅 {err.date}
                    </div>
                    <div style={{ 
                      color: '#7F1D1D', 
                      fontSize: '0.9rem',
                      lineHeight: '1.4',
                      background: '#FEE2E2',
                      padding: '0.75rem',
                      borderRadius: '6px'
                    }}>
                      {err.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Footer */}
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid #E5E7EB',
              display: 'flex',
              justifyContent: 'flex-end',
              background: '#F9FAFB'
            }}>
              <Button 
                onClick={() => setShowErrorModal(false)}
                style={{ 
                  background: '#DC2626', 
                  color: 'white',
                  padding: '0.75rem 2rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  borderRadius: '8px'
                }}
              >
                Compris
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Mon Profil Component épuré - sans disponibilités et remplacements
// Mon Profil Component épuré - sans disponibilités et remplacements

export default MesDisponibilites;
