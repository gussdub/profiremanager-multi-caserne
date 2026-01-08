import React, { useState, useEffect, Suspense, lazy } from "react";
import axios from "axios";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Calendar } from "./ui/calendar";
import { useToast } from "../hooks/use-toast";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { fr } from "date-fns/locale";
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
const RapportHeuresModal = lazy(() => import("./RapportHeuresModal"));
const AuditModal = lazy(() => import("./AuditModal"));

const Planning = () => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
  const token = localStorage.getItem('token');
  
  const [currentWeek, setCurrentWeek] = useState(() => {
    const today = new Date();
    // Utiliser UTC pour éviter les problèmes de fuseau horaire
    const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const dayOfWeek = todayUTC.getUTCDay(); // 0 = dimanche, 1 = lundi, etc.
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(todayUTC);
    monday.setUTCDate(todayUTC.getUTCDate() + daysToMonday);
    return monday.toISOString().split('T')[0];
  });
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  const [viewMode, setViewMode] = useState('mois'); // 'semaine' ou 'mois' - Défaut: mois
  const [displayMode] = useState('calendrier'); // Vue calendrier uniquement (liste supprimée car moins lisible)
  const [searchFilter, setSearchFilter] = useState('');
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  
  // Fermer les suggestions quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showSearchSuggestions && !e.target.closest('.search-container')) {
        setShowSearchSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSearchSuggestions]);
  const [typeGardeFilter, setTypeGardeFilter] = useState('');
  const [typesGarde, setTypesGarde] = useState([]);
  const [assignations, setAssignations] = useState([]);
  const [users, setUsers] = useState([]);
  const [grades, setGrades] = useState([]);  // Pour vérifier si un utilisateur est officier
  const [loading, setLoading] = useState(true);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showGardeDetailsModal, setShowGardeDetailsModal] = useState(false);
  const [showAdvancedAssignModal, setShowAdvancedAssignModal] = useState(false);
  const [showAutoAttributionModal, setShowAutoAttributionModal] = useState(false);
  const [showRapportHeuresModal, setShowRapportHeuresModal] = useState(false);
  const [autoAttributionConfig, setAutoAttributionConfig] = useState({
    periode: 'semaine', // semaine ou mois
    periodeLabel: '', // 'Semaine actuelle', 'Semaine suivante', 'Mois actuel', 'Mois suivant'
    date: currentWeek,
    mode: 'completer', // 'completer' ou 'reinitialiser'
    mode: 'completer' // 'completer' ou 'reinitialiser'
  });
  const [advancedAssignConfig, setAdvancedAssignConfig] = useState({
    user_id: '',
    type_garde_ids: [], // Changé en array pour multi-sélection
    recurrence_type: 'unique', // unique, hebdomadaire, bihebdomadaire, mensuelle, annuelle, personnalisee
    jours_semaine: [], // pour récurrence hebdomadaire/bihebdomadaire (sélection multiple)
    bi_hebdomadaire: false, // une semaine sur deux (obsolète, utilisé par bihebdomadaire maintenant)
    recurrence_intervalle: 1, // pour personnalisée
    recurrence_frequence: 'jours', // pour personnalisée: jours, semaines, mois, ans
    date_debut: '',
    date_fin: '',
    exceptions: [] // dates d'exception
  });

  // États pour formatage planning (demo uniquement)
  const [showFormatageSection, setShowFormatageSection] = useState(false);
  const [moisFormatage, setMoisFormatage] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });

  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [quickAssignSearchQuery, setQuickAssignSearchQuery] = useState('');
  const [showQuickAssignDropdown, setShowQuickAssignDropdown] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedGardeDetails, setSelectedGardeDetails] = useState(null);
  const [attributionLoading, setAttributionLoading] = useState(false);
  const [attributionStep, setAttributionStep] = useState('');
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [selectedAuditAssignation, setSelectedAuditAssignation] = useState(null);
  const [auditNotesEdit, setAuditNotesEdit] = useState('');
  const { toast } = useToast();

  // Fonction pour calculer l'aperçu des dates de récurrence
  const calculateRecurrenceDates = () => {
    if (!advancedAssignConfig.date_debut || !advancedAssignConfig.recurrence_type) {
      return [];
    }

    const dates = [];
    const startDate = new Date(advancedAssignConfig.date_debut);
    const endDate = advancedAssignConfig.date_fin 
      ? new Date(advancedAssignConfig.date_fin)
      : new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 an max pour aperçu
    
    let currentDate = new Date(startDate);
    const maxDates = 10; // Afficher max 10 dates

    // Mapper les jours
    const dayMap = {
      'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4,
      'friday': 5, 'saturday': 6, 'sunday': 0
    };

    if (advancedAssignConfig.recurrence_type === 'unique') {
      dates.push(new Date(startDate));
    } 
    else if (advancedAssignConfig.jour_specifique) {
      // Avec jour spécifique
      const targetDay = dayMap[advancedAssignConfig.jour_specifique];
      
      if (advancedAssignConfig.recurrence_type === 'hebdomadaire') {
        while (currentDate <= endDate && dates.length < maxDates) {
          if (currentDate.getDay() === targetDay) {
            dates.push(new Date(currentDate));
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else if (advancedAssignConfig.recurrence_type === 'bihebdomadaire') {
        let weekCount = 0;
        let lastWeekStart = null;
        
        while (currentDate <= endDate && dates.length < maxDates) {
          const weekStart = new Date(currentDate);
          weekStart.setDate(currentDate.getDate() - currentDate.getDay());
          
          if (lastWeekStart === null || weekStart.getTime() !== lastWeekStart.getTime()) {
            if (lastWeekStart !== null) weekCount++;
            lastWeekStart = new Date(weekStart);
          }
          
          if (currentDate.getDay() === targetDay && weekCount % 2 === 0) {
            dates.push(new Date(currentDate));
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else if (advancedAssignConfig.recurrence_type === 'personnalisee') {
        const interval = advancedAssignConfig.recurrence_intervalle || 1;
        const freq = advancedAssignConfig.recurrence_frequence || 'semaines';
        
        // Trouver le premier jour correspondant
        while (currentDate.getDay() !== targetDay && currentDate <= endDate) {
          currentDate.setDate(currentDate.getDate() + 1);
        }
        
        while (currentDate <= endDate && dates.length < maxDates) {
          dates.push(new Date(currentDate));
          
          if (freq === 'jours') {
            currentDate.setDate(currentDate.getDate() + interval);
          } else if (freq === 'semaines') {
            currentDate.setDate(currentDate.getDate() + (interval * 7));
          } else if (freq === 'mois') {
            currentDate.setMonth(currentDate.getMonth() + interval);
          } else if (freq === 'ans') {
            currentDate.setFullYear(currentDate.getFullYear() + interval);
          }
        }
      }
    }

    return dates;
  };

  // Fonction pour suggérer le prochain jour spécifique
  const getSuggestedNextDay = () => {
    if (!advancedAssignConfig.jour_specifique || !advancedAssignConfig.date_debut) {
      return null;
    }

    const dayMap = {
      'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4,
      'friday': 5, 'saturday': 6, 'sunday': 0
    };
    const dayNameMap = {
      'monday': 'lundi', 'tuesday': 'mardi', 'wednesday': 'mercredi',
      'thursday': 'jeudi', 'friday': 'vendredi', 'saturday': 'samedi', 'sunday': 'dimanche'
    };

    const startDate = new Date(advancedAssignConfig.date_debut);
    const targetDay = dayMap[advancedAssignConfig.jour_specifique];
    const startDay = startDate.getDay();

    if (startDay === targetDay) {
      return null; // Déjà le bon jour
    }

    // Calculer le prochain jour correspondant
    let daysToAdd = targetDay - startDay;
    if (daysToAdd < 0) daysToAdd += 7;

    const suggestedDate = new Date(startDate);
    suggestedDate.setDate(startDate.getDate() + daysToAdd);

    return {
      date: suggestedDate,
      formatted: suggestedDate.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      dayName: dayNameMap[advancedAssignConfig.jour_specifique]
    };
  };

  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const weekDaysEn = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const [year, month, day] = currentWeek.split('-').map(Number);
    // Utiliser Date.UTC pour éviter les problèmes de fuseau horaire
    const date = new Date(Date.UTC(year, month - 1, day + i));
    return date;
  });

  // Générer les dates du mois pour la vue mois (calendrier commençant le lundi)
  const monthDates = (() => {
    if (viewMode !== 'mois') return [];
    
    const [year, month] = currentMonth.split('-').map(Number);
    
    // Utiliser UTC pour éviter les problèmes de fuseau horaire
    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const lastDay = new Date(Date.UTC(year, month, 0));
    const dates = [];
    
    // Calculer le jour de la semaine du premier jour (0 = dimanche, 1 = lundi, etc.)
    let firstDayOfWeek = firstDay.getUTCDay();
    // Convertir pour que lundi = 0, dimanche = 6
    firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    
    // Ajouter les jours vides au début pour commencer à lundi
    for (let i = 0; i < firstDayOfWeek; i++) {
      dates.push(null); // Jours vides
    }
    
    // Ajouter tous les jours du mois en UTC
    for (let day = 1; day <= lastDay.getUTCDate(); day++) {
      dates.push(new Date(Date.UTC(year, month - 1, day, 12, 0, 0))); // Midi UTC pour éviter les décalages
    }
    
    return dates;
  })();

  useEffect(() => {
    fetchPlanningData();
  }, [currentWeek, currentMonth, viewMode, tenantSlug]);

  // Écouter les événements de navigation précise (depuis les notifications)
  useEffect(() => {
    const handleOpenPlanningDate = (event) => {
      const { date: dateStr } = event.detail || {};
      console.log('[Planning] Navigation vers date:', dateStr);
      
      if (dateStr) {
        // Parser la date et naviguer vers la bonne semaine/mois
        const targetDate = new Date(dateStr);
        const year = targetDate.getFullYear();
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        
        // Calculer le début de la semaine (lundi)
        const dayOfWeek = targetDate.getDay();
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(targetDate);
        monday.setDate(targetDate.getDate() + diffToMonday);
        const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
        
        // Naviguer vers la bonne période
        setCurrentWeek(mondayStr);
        setCurrentMonth(`${year}-${month}`);
        
        // Stocker la date cible pour ouvrir le modal après le chargement des données
        setPendingOpenDate(targetDate);
      }
    };

    window.addEventListener('openPlanningDate', handleOpenPlanningDate);
    
    return () => {
      window.removeEventListener('openPlanningDate', handleOpenPlanningDate);
    };
  }, []);

  // État pour stocker une date en attente d'ouverture du modal
  const [pendingOpenDate, setPendingOpenDate] = useState(null);

  // Ouvrir le modal quand les données sont chargées et qu'une date est en attente
  useEffect(() => {
    if (pendingOpenDate && typesGarde.length > 0 && assignations.length >= 0 && !loading) {
      const dateStr = pendingOpenDate.toISOString().split('T')[0];
      const typeGarde = typesGarde[0];
      
      const gardeAssignations = assignations.filter(a => 
        a.date === dateStr && a.type_garde_id === typeGarde.id
      );
      
      const personnelAssigne = gardeAssignations
        .map(a => {
          const person = users.find(u => u.id === a.user_id);
          return person ? { ...person, assignation_id: a.id } : null;
        })
        .filter(p => p !== null);
      
      setSelectedGardeDetails({
        date: pendingOpenDate,
        typeGarde,
        personnelAssigne,
        assignations: gardeAssignations
      });
      setShowGardeDetailsModal(true);
      setPendingOpenDate(null); // Reset
    }
  }, [pendingOpenDate, typesGarde, assignations, users, loading]);

  const fetchPlanningData = async () => {
    if (!tenantSlug) return;
    
    setLoading(true);
    try {
      const dateRange = viewMode === 'mois' ? 
        `${currentMonth}-01` : // Premier jour du mois
        currentWeek;
        
      const [typesData, assignationsData, usersData, gradesData] = await Promise.all([
        apiGet(tenantSlug, '/types-garde'),
        apiGet(tenantSlug, `/planning/assignations/${dateRange}`),
        apiGet(tenantSlug, '/users'), // Tous les rôles peuvent voir les users (lecture seule)
        apiGet(tenantSlug, '/grades') // Pour vérifier si un utilisateur est officier
      ]);
      
      setTypesGarde(typesData);
      setAssignations(assignationsData);
      setUsers(usersData);
      setGrades(gradesData || []);
    } catch (error) {
      console.error('Erreur lors du chargement du planning:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger le planning",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getGardeCoverage = (date, typeGarde) => {
    const dateStr = date.toISOString().split('T')[0];
    const gardeAssignations = assignations.filter(a => 
      a.date === dateStr && a.type_garde_id === typeGarde.id
    );
    
    const assigned = gardeAssignations.length;
    const required = typeGarde.personnel_requis;
    
    if (assigned === 0) return 'vacante';
    if (assigned >= required) return 'complete';
    return 'partielle';
  };

  const getCoverageColor = (coverage) => {
    switch (coverage) {
      case 'complete': return '#10B981'; // Vert
      case 'partielle': return '#F59E0B'; // Jaune
      case 'vacante': return '#EF4444'; // Rouge
      default: return '#6B7280';
    }
  };

  const handleNettoyerAssignationsInvalides = async () => {
    if (user.role !== 'admin') {
      toast({
        title: "Accès refusé",
        description: "Cette action est réservée aux administrateurs",
        variant: "destructive"
      });
      return;
    }

    try {
      // D'abord, obtenir le rapport
      toast({
        title: "Analyse en cours...",
        description: "Recherche d'assignations invalides"
      });

      const rapportResponse = await fetch(buildApiUrl(tenantSlug, '/planning/rapport-assignations-invalides'), {
        headers: {
          'Authorization': `Bearer ${getTenantToken()}`
        }
      });

      if (!rapportResponse.ok) {
        throw new Error('Erreur lors de l\'analyse');
      }

      const rapport = await rapportResponse.json();
      const count = rapport.statistiques.assignations_invalides;

      if (count === 0) {
        toast({
          title: "Aucune assignation invalide",
          description: "Toutes les assignations respectent les jours d'application",
          variant: "success"
        });
        return;
      }

      // Confirmer avec le nombre trouvé
      if (!window.confirm(`⚠️ ${count} assignation(s) invalide(s) détectée(s)!\n\nElles ne respectent pas les jours d'application de leur type de garde.\n\nVoulez-vous les supprimer?\n\nCette action est irréversible.`)) {
        return;
      }

      toast({
        title: "Suppression en cours...",
        description: `Suppression de ${count} assignation(s)`
      });

      const response = await fetch(buildApiUrl(tenantSlug, '/planning/supprimer-assignations-invalides'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getTenantToken()}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la suppression');
      }

      const data = await response.json();

      toast({
        title: "✅ Nettoyage terminé",
        description: `${data.deleted_count} assignation(s) supprimée(s). Rechargement de la page...`,
        variant: "success"
      });

      // Recharger la page pour mettre à jour toutes les données
      setTimeout(() => {
        window.location.reload();
      }, 1500);
      
    } catch (error) {
      console.error('Erreur nettoyage:', error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de nettoyer les assignations",
        variant: "destructive"
      });
    }
  };


  // Fonction pour formater le planning (demo uniquement)
  const handleFormaterPlanning = async () => {
    if (tenantSlug !== 'demo') {
      alert('Cette fonctionnalité est réservée au tenant demo');
      return;
    }

    if (user.role !== 'admin') {
      alert('Accès réservé aux administrateurs');
      return;
    }

    const confirmation = window.confirm(
      `⚠️ ATTENTION\n\nVous êtes sur le point de SUPPRIMER toutes les assignations et demandes de remplacement du mois ${moisFormatage}.\n\nCette action est IRRÉVERSIBLE.\n\nConfirmer?`
    );

    if (!confirmation) return;

    try {
      const response = await apiDelete(tenantSlug, `/planning/formater-mois?mois=${moisFormatage}`);

      alert(`✅ ${response.message}\n\n` +
            `📊 Résumé:\n` +
            `- ${response.assignations_supprimees} assignation(s) supprimée(s)\n` +
            `- ${response.demandes_supprimees} demande(s) de remplacement supprimée(s)`);
      
      // Recharger la page
      window.location.reload();
    } catch (error) {
      console.error('Erreur formatage planning:', error);
      alert('❌ Erreur lors du formatage: ' + error.message);
    }
  };

  const handleAttributionAuto = async () => {
    if (user.role === 'employe') return;

    try {
      // Activer l'overlay de chargement
      setAttributionLoading(true);
      setShowAutoAttributionModal(false);
      setAttributionStep('📋 Initialisation...');
      
      // Calculer la plage de dates selon la période
      let semaine_debut, semaine_fin;
      
      if (autoAttributionConfig.periode === 'semaine') {
        // Pour une semaine: date de début = lundi, date de fin = dimanche
        const monday = new Date(autoAttributionConfig.date);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        
        semaine_debut = monday.toISOString().split('T')[0];
        semaine_fin = sunday.toISOString().split('T')[0];
      } else {
        // Pour un mois: calculer toutes les semaines du mois
        const [year, month] = autoAttributionConfig.date.split('-');
        const firstDay = new Date(parseInt(year), parseInt(month) - 1, 1);
        const lastDay = new Date(parseInt(year), parseInt(month), 0);
        
        // Trouver le lundi de la première semaine du mois
        const firstMonday = new Date(firstDay);
        firstMonday.setDate(firstDay.getDate() - firstDay.getDay() + (firstDay.getDay() === 0 ? -6 : 1));
        
        // Trouver le dimanche de la dernière semaine du mois
        const lastSunday = new Date(lastDay);
        lastSunday.setDate(lastDay.getDate() + (7 - lastDay.getDay()) % 7);
        
        semaine_debut = firstMonday.toISOString().split('T')[0];
        semaine_fin = lastSunday.toISOString().split('T')[0];
      }
      
      // Lancer l'attribution automatique avec le paramètre reset
      const resetParam = autoAttributionConfig.mode === 'reinitialiser' ? '&reset=True' : '';
      const initResponse = await apiPost(
        tenantSlug, 
        `/planning/attribution-auto?semaine_debut=${semaine_debut}&semaine_fin=${semaine_fin}${resetParam}`, 
        {}
      );
      
      // Récupérer le task_id et l'URL du stream
      const { task_id, stream_url } = initResponse;
      
      if (!task_id) {
        throw new Error("Aucun task_id reçu du serveur");
      }
      
      setAttributionStep('🚀 Attribution lancée - connexion au flux temps réel...');
      
      // Se connecter au flux SSE pour recevoir les mises à jour
      const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
      const eventSource = new EventSource(`${backendUrl}${stream_url}`);
      
      eventSource.onmessage = (event) => {
        try {
          const progress = JSON.parse(event.data);
          
          // Mettre à jour l'affichage avec la progression en temps réel
          setAttributionStep(
            `${progress.current_step} (${progress.progress_percentage}% - ${progress.elapsed_time})`
          );
          
          // Si terminé, fermer la connexion
          if (progress.status === 'termine') {
            eventSource.close();
            
            // Désactiver l'overlay
            setAttributionLoading(false);
            setAttributionStep('');
            
            // Message personnalisé selon le mode
            const successMessage = autoAttributionConfig.mode === 'reinitialiser' 
              ? `Planning réinitialisé ! ${progress.assignations_creees} assignation(s) créée(s)`
              : `${progress.assignations_creees} assignation(s) créée(s) pour ${autoAttributionConfig.periodeLabel}`;
            
            toast({
              title: autoAttributionConfig.mode === 'reinitialiser' ? "Planning réinitialisé" : "Attribution automatique réussie",
              description: successMessage,
              variant: "success"
            });

            // Réinitialiser la config
            setAutoAttributionConfig({
              periode: 'semaine',
              periodeLabel: '',
              date: currentWeek,
              mode: 'completer'
            });
            fetchPlanningData();
          }
          
          // Si erreur, fermer la connexion
          if (progress.status === 'erreur') {
            eventSource.close();
            
            setAttributionLoading(false);
            setAttributionStep('');
            
            toast({
              title: "Erreur d'attribution",
              description: progress.error_message || "Une erreur s'est produite",
              variant: "destructive"
            });
          }
        } catch (parseError) {
          console.error('Erreur parsing SSE:', parseError);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('Erreur SSE:', error);
        eventSource.close();
        
        setAttributionLoading(false);
        setAttributionStep('');
        
        toast({
          title: "Erreur de connexion",
          description: "La connexion au serveur a été interrompue",
          variant: "destructive"
        });
      };
      
    } catch (error) {
      // Désactiver l'overlay en cas d'erreur
      setAttributionLoading(false);
      setAttributionStep('');
      
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Erreur lors de l'attribution automatique",
        variant: "destructive"
      });
    }
  };

  const handleRemoveAllPersonnelFromGarde = async () => {
    console.log('selectedGardeDetails:', selectedGardeDetails);
    console.log('assignations:', selectedGardeDetails.assignations);
    
    if (!selectedGardeDetails.assignations || selectedGardeDetails.assignations.length === 0) {
      toast({
        title: "Aucun personnel",
        description: "Il n'y a aucun personnel assigné à cette garde",
        variant: "default"
      });
      return;
    }

    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer TOUT le personnel de cette garde ?\n\nCela supprimera ${selectedGardeDetails.assignations.length} assignation(s) pour la ${selectedGardeDetails.typeGarde.nom} du ${selectedGardeDetails.date.toLocaleDateString('fr-FR')}.`)) {
      return;
    }

    try {
      // Vérifier que chaque assignation a un ID
      const assignationsWithIds = selectedGardeDetails.assignations.filter(a => a.id);
      
      if (assignationsWithIds.length === 0) {
        toast({
          title: "Erreur technique",
          description: "Les assignations n'ont pas d'ID - impossible de les supprimer",
          variant: "destructive"
        });
        return;
      }

      console.log('Deleting assignations with IDs:', assignationsWithIds.map(a => a.id));

      // Supprimer toutes les assignations de cette garde
      const deletePromises = assignationsWithIds.map(assignation => 
        apiDelete(tenantSlug, `/planning/assignation/${assignation.id}`)
      );

      await Promise.all(deletePromises);
      
      toast({
        title: "Personnel supprimé",
        description: `Tout le personnel (${assignationsWithIds.length} personne(s)) a été retiré de cette garde`,
        variant: "success"
      });

      // Fermer le modal et recharger les données
      setShowGardeDetailsModal(false);
      fetchPlanningData();
      
    } catch (error) {
      console.error('Error removing all personnel:', error);
      toast({
        title: "Erreur",
        description: error.detail || error.message || "Impossible de supprimer le personnel de cette garde",
        variant: "destructive"
      });
    }
  };

  const handleRemovePersonFromGarde = async (personId, gardeName) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir retirer cette personne de la garde ${gardeName} ?`)) {
      return;
    }

    try {
      // Trouver l'assignation à supprimer
      const assignationToRemove = selectedGardeDetails.assignations.find(a => a.user_id === personId);
      
      if (!assignationToRemove) {
        toast({
          title: "Erreur",
          description: "Assignation non trouvée",
          variant: "destructive"
        });
        return;
      }

      await apiDelete(tenantSlug, `/planning/assignation/${assignationToRemove.id}`);
      
      toast({
        title: "Personne retirée",
        description: "La personne a été retirée de cette garde avec succès",
        variant: "success"
      });

      // Fermer le modal et recharger les données
      setShowGardeDetailsModal(false);
      fetchPlanningData();
      
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.detail || error.message || "Impossible de retirer la personne",
        variant: "destructive"
      });
    }
  };

  const handleAssignUser = async (userId, typeGardeId, date) => {
    if (user.role === 'employe') return;

    try {
      await apiPost(tenantSlug, '/planning/assignation', {
        user_id: userId,
        type_garde_id: typeGardeId,
        date: date,
        assignation_type: "manuel"
      });

      toast({
        title: "Attribution réussie",
        description: "L'assignation a été créée avec succès",
        variant: "success"
      });

      fetchPlanningData();
      setShowAssignModal(false);
    } catch (error) {
      toast({
        title: "Erreur d'attribution",
        description: "Impossible de créer l'assignation",
        variant: "destructive"
      });
    }
  };

  const handleAdvancedAssignment = async () => {
    if (user.role === 'employe') return;

    // Validation des champs requis
    if (!advancedAssignConfig.user_id || advancedAssignConfig.type_garde_ids.length === 0 || !advancedAssignConfig.date_debut) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires (utilisateur, au moins un type de garde, date de début)",
        variant: "destructive"
      });
      return;
    }

    // Validation spécifique pour récurrence hebdomadaire
    if (advancedAssignConfig.recurrence_type === 'hebdomadaire' && advancedAssignConfig.jours_semaine.length === 0) {
      toast({
        title: "Jours requis",
        description: "Veuillez sélectionner au moins un jour de la semaine",
        variant: "destructive"
      });
      return;
    }

    // Vérification des chevauchements d'horaires entre les types de garde sélectionnés
    const selectedTypesGarde = typesGarde.filter(tg => advancedAssignConfig.type_garde_ids.includes(tg.id));
    let hasOverlap = false;
    
    for (let i = 0; i < selectedTypesGarde.length; i++) {
      for (let j = i + 1; j < selectedTypesGarde.length; j++) {
        const tg1 = selectedTypesGarde[i];
        const tg2 = selectedTypesGarde[j];
        
        // Vérifier si les horaires se chevauchent (si les champs existent)
        if (tg1.heure_debut && tg1.heure_fin && tg2.heure_debut && tg2.heure_fin) {
          const start1 = tg1.heure_debut;
          const end1 = tg1.heure_fin;
          const start2 = tg2.heure_debut;
          const end2 = tg2.heure_fin;
          
          // Chevauchement si: start1 < end2 AND start2 < end1
          if (start1 < end2 && start2 < end1) {
            hasOverlap = true;
            break;
          }
        }
      }
      if (hasOverlap) break;
    }
    
    // Avertir si chevauchement mais permettre quand même
    if (hasOverlap) {
      toast({
        title: "⚠️ Attention - Horaires qui se chevauchent",
        description: "Certains types de garde sélectionnés ont des horaires qui se chevauchent. L'assignation sera quand même créée.",
        variant: "warning",
        duration: 5000
      });
    }

    try {
      // Créer une assignation pour chaque type de garde sélectionné
      const promises = advancedAssignConfig.type_garde_ids.map(type_garde_id => {
        const assignmentData = {
          user_id: advancedAssignConfig.user_id,
          type_garde_id: type_garde_id,
          recurrence_type: advancedAssignConfig.recurrence_type,
          date_debut: advancedAssignConfig.date_debut,
          date_fin: advancedAssignConfig.date_fin || advancedAssignConfig.date_debut,
          jours_semaine: advancedAssignConfig.jours_semaine,
          bi_hebdomadaire: advancedAssignConfig.bi_hebdomadaire,
          recurrence_intervalle: advancedAssignConfig.recurrence_intervalle,
          recurrence_frequence: advancedAssignConfig.recurrence_frequence,
          assignation_type: "manuel_avance"
        };
        
        return apiPost(tenantSlug, '/planning/assignation-avancee', assignmentData);
      });
      
      await Promise.all(promises);

      const selectedUser = users.find(u => u.id === advancedAssignConfig.user_id);
      const selectedTypesNames = selectedTypesGarde.map(tg => tg.nom).join(', ');
      
      toast({
        title: "Assignations avancées créées",
        description: `${selectedUser?.prenom} ${selectedUser?.nom} assigné(e) pour ${advancedAssignConfig.type_garde_ids.length} type(s) de garde: ${selectedTypesNames} (${advancedAssignConfig.recurrence_type})`,
        variant: "success"
      });

      // Reset du formulaire
      setAdvancedAssignConfig({
        user_id: '',
        type_garde_ids: [],
        jour_specifique: '',
        recurrence_type: 'unique',
        jours_semaine: [],
        bi_hebdomadaire: false,
        recurrence_intervalle: 1,
        recurrence_frequence: 'jours',
        date_debut: '',
        date_fin: '',
        exceptions: []
      });

      setShowAdvancedAssignModal(false);
      fetchPlanningData();
    } catch (error) {
      toast({
        title: "Erreur d'assignation",
        description: error.response?.data?.detail || "Impossible de créer l'assignation avancée",
        variant: "destructive"
      });
    }
  };

  const getAssignationForSlot = (date, typeGardeId) => {
    const dateStr = date.toISOString().split('T')[0];
    return assignations.find(a => a.date === dateStr && a.type_garde_id === typeGardeId);
  };

  const getUserById = (userId) => {
    return users.find(u => u.id === userId);
  };

  const shouldShowTypeGardeForDay = (typeGarde, dayIndex) => {
    // Si pas de jours d'application spécifiés, afficher tous les jours
    if (!typeGarde.jours_application || typeGarde.jours_application.length === 0) {
      return true;
    }
    
    // Vérifier si le jour de la semaine est dans les jours d'application
    const dayNameEn = weekDaysEn[dayIndex];
    return typeGarde.jours_application.includes(dayNameEn);
  };

  const openGardeDetails = (date, typeGarde) => {
    const dateStr = date.toISOString().split('T')[0];
    const gardeAssignations = assignations.filter(a => 
      a.date === dateStr && a.type_garde_id === typeGarde.id
    );
    
    const personnelAssigne = gardeAssignations
      .map(a => {
        const person = getUserById(a.user_id);
        return person ? { ...person, assignation_id: a.id } : null;
      })
      .filter(p => p !== null);
    
    setSelectedGardeDetails({
      date,
      typeGarde,
      personnelAssigne,
      assignations: gardeAssignations
    });
    setShowGardeDetailsModal(true);
  };

  // Ouvrir le modal d'audit pour une assignation
  const openAuditModal = (assignation, person) => {
    console.log('openAuditModal appelé', { assignation, person });
    
    if (!assignation) {
      console.error('Assignation manquante');
      toast({
        title: "Erreur",
        description: "Assignation introuvable",
        variant: "destructive"
      });
      return;
    }
    
    if (!assignation.justification) {
      console.error('Justification manquante', assignation);
      toast({
        title: "Justification indisponible",
        description: "Cette assignation ne contient pas de données d'audit. Elle a peut-être été créée avant l'activation de la fonctionnalité d'audit.",
        variant: "destructive"
      });
      return;
    }
    
    setSelectedAuditAssignation({
      ...assignation,
      person: person
    });
    setAuditNotesEdit(assignation.notes_admin || '');
    setShowAuditModal(true);
    console.log('Modal audit ouvert');
  };

  // Sauvegarder les notes admin
  const handleSaveAuditNotes = async () => {
    if (!selectedAuditAssignation) return;
    
    try {
      await apiPut(
        tenantSlug,
        `/assignations/${selectedAuditAssignation.id}/notes`,
        { notes: auditNotesEdit }
      );
      
      toast({
        title: "Notes enregistrées",
        description: "Les notes admin ont été mises à jour avec succès",
      });
      
      // Mettre à jour localement
      setAssignations(prev => prev.map(a => 
        a.id === selectedAuditAssignation.id 
          ? { ...a, notes_admin: auditNotesEdit }
          : a
      ));
      
      // Mettre à jour l'assignation sélectionnée
      setSelectedAuditAssignation(prev => ({
        ...prev,
        notes_admin: auditNotesEdit
      }));
      
    } catch (error) {
      console.error('Erreur sauvegarde notes:', error);
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder les notes",
        variant: "destructive"
      });
    }
  };

  // Télécharger le rapport d'audit
  const handleDownloadAuditReport = async (format = 'pdf') => {
    try {
      const currentDate = new Date(currentWeek);
      const mois = currentDate.toISOString().slice(0, 7); // YYYY-MM
      
      const response = await fetch(
        `${BACKEND_URL}/api/${tenantSlug}/planning/rapport-audit?mois=${mois}&format=${format}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem(`${tenantSlug}_token`)}`
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Erreur téléchargement rapport');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_affectations_${mois}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Téléchargement réussi",
        description: `Le rapport d'audit ${format.toUpperCase()} a été téléchargé`,
      });
    } catch (error) {
      console.error('Erreur téléchargement rapport:', error);
      toast({
        title: "Erreur",
        description: "Impossible de télécharger le rapport d'audit",
        variant: "destructive"
      });
    }
  };

  const openAssignModal = (date, typeGarde) => {
    if (user.role === 'employe') return;
    setSelectedSlot({ date, typeGarde });
    setShowAssignModal(true);
  };

  const navigateWeek = (direction) => {
    const [year, month, day] = currentWeek.split('-').map(Number);
    const newDate = new Date(Date.UTC(year, month - 1, day));
    newDate.setUTCDate(newDate.getUTCDate() + (direction * 7));
    setCurrentWeek(newDate.toISOString().split('T')[0]);
  };

  const navigateMonth = (direction) => {
    const [year, month] = currentMonth.split('-').map(Number);
    const newDate = new Date(year, month - 1 + direction, 1);
    setCurrentMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
  };

  // Calcul des KPIs pour le mois affiché dans le planning (currentMonth)
  const calculateKPIs = (monthString = currentMonth) => {
    const [year, month] = monthString.split('-').map(Number);
    
    // Calculer le début et la fin du mois affiché
    const targetMonthStart = new Date(year, month - 1, 1);
    const targetMonthEnd = new Date(year, month, 0);
    const monthLabel = targetMonthStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    
    // Filtrer les assignations du mois cible
    const monthAssignations = assignations.filter(a => {
      const assignDate = new Date(a.date);
      return assignDate >= targetMonthStart && assignDate <= targetMonthEnd;
    });
    
    // Calculer les heures de personnel requises VS assignées
    const daysInMonth = targetMonthEnd.getDate();
    let heuresPersonnelRequises = 0;
    let heuresPersonnelAssignees = 0;
    let totalGardesTheoriques = 0;
    let gardesAvecPersonnel = 0;
    
    // Pour chaque jour du mois
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(targetMonthStart.getFullYear(), targetMonthStart.getMonth(), day);
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayIndex = currentDate.getUTCDay() === 0 ? 6 : currentDate.getUTCDay() - 1; // Lundi = 0
      
      // Pour chaque type de garde
      typesGarde.forEach(typeGarde => {
        // Vérifier si cette garde est applicable ce jour-là
        const isApplicable = shouldShowTypeGardeForDay(typeGarde, dayIndex);
        
        if (isApplicable) {
          totalGardesTheoriques++;
          
          // Calculer la durée de cette garde en heures
          let dureeGarde = 12; // défaut
          if (typeGarde.heure_debut && typeGarde.heure_fin) {
            const [heureDebut] = typeGarde.heure_debut.split(':').map(Number);
            const [heureFin] = typeGarde.heure_fin.split(':').map(Number);
            dureeGarde = heureFin > heureDebut ? heureFin - heureDebut : (24 - heureDebut) + heureFin;
          }
          
          const personnelRequis = typeGarde.personnel_requis || 1;
          
          // Heures de personnel requises pour cette garde
          heuresPersonnelRequises += dureeGarde * personnelRequis;
          
          // Vérifier combien de personnes sont assignées
          const gardeAssignations = monthAssignations.filter(a => 
            a.date === dateStr && a.type_garde_id === typeGarde.id
          );
          
          // Heures de personnel assignées (nombre de personnes × durée)
          heuresPersonnelAssignees += gardeAssignations.length * dureeGarde;
          
          // Compter les gardes avec au moins 1 personne
          if (gardeAssignations.length > 0) {
            gardesAvecPersonnel++;
          }
        }
      });
    }
    
    const gardesSansPersonnel = totalGardesTheoriques - gardesAvecPersonnel;
    
    // Calculer le taux de couverture basé sur les HEURES DE PERSONNEL
    const tauxCouverture = heuresPersonnelRequises > 0 
      ? Math.round((heuresPersonnelAssignees / heuresPersonnelRequises) * 100) 
      : 0;
    
    return {
      totalGardes: totalGardesTheoriques,
      quartsCouverts: gardesAvecPersonnel,
      quartsNonCouverts: gardesSansPersonnel,
      heuresTotales: Math.round(heuresPersonnelAssignees), // Heures assignées
      heuresRequises: Math.round(heuresPersonnelRequises), // Heures requises
      tauxCouverture, // Basé sur heures, pas gardes!
      membresActifs: new Set(monthAssignations.map(a => a.user_id)).size,
      monthLabel
    };
  };

  // KPIs calculées automatiquement pour le mois affiché (currentMonth)
  const kpis = calculateKPIs(currentMonth);

  // Fonctions d'export Planning
  const handleExportPDFPlanning = async () => {
    try {
      const periode = viewMode === 'semaine' ? currentWeek : currentMonth;
      
      const response = await fetch(
        buildApiUrl(tenantSlug, `/planning/export-pdf?periode=${periode}&type=${viewMode}`),
        {
          headers: {
            'Authorization': `Bearer ${getTenantToken()}`
          }
        }
      );
      
      if (!response.ok) throw new Error('Erreur génération rapport');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Créer un iframe caché pour déclencher l'impression
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);
      
      // Attendre que le PDF soit chargé, puis déclencher l'impression
      iframe.onload = () => {
        try {
          iframe.contentWindow.print();
          // Nettoyer après un délai
          setTimeout(() => {
            document.body.removeChild(iframe);
            window.URL.revokeObjectURL(url);
          }, 1000);
        } catch (e) {
          console.error('Erreur impression:', e);
          document.body.removeChild(iframe);
          window.URL.revokeObjectURL(url);
        }
      };
      
    } catch (error) {
      console.error('Erreur export PDF planning:', error);
      toast({ 
        title: "Erreur", 
        description: `Impossible d'exporter le planning: ${error.message}`,
        variant: "destructive"
      });
    }
  };

  const handleExportExcelPlanning = async () => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL;
      const token = getTenantToken();
      
      const periode = viewMode === 'semaine' ? currentWeek : currentMonth;
      const url = `${backendUrl}/api/${tenantSlug}/planning/export-excel?periode=${periode}&type=${viewMode}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Erreur lors de l\'export');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `planning_${viewMode}_${periode}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      
      toast({ 
        title: "Succès", 
        description: "Export Excel téléchargé",
        variant: "success"
      });
    } catch (error) {
      toast({ 
        title: "Erreur", 
        description: "Impossible d'exporter l'Excel", 
        variant: "destructive" 
      });
    }
  };

  if (loading) return <div className="loading" data-testid="planning-loading">Chargement du planning...</div>;

  return (
    <div className="planning-refonte">
      {/* Header Moderne */}
      <div className="module-header">
        <div>
          <h1>📅 Planning des Gardes</h1>
          <p>Gestion des quarts de travail et assignations du personnel</p>
        </div>
      </div>

      {/* Section KPIs pour le mois affiché */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1rem',
        padding: '0.75rem 1rem',
        background: 'white',
        borderRadius: '8px',
        border: '1px solid #E5E7EB'
      }}>
        <h3 style={{
          fontSize: '1.125rem',
          fontWeight: '600',
          color: '#1F2937',
          margin: 0
        }}>📊 Statistiques - {kpis.monthLabel}</h3>
      </div>

      {/* KPIs du Mois */}
      <div className="kpi-grid" style={{marginBottom: '2rem'}}>
        <div className="kpi-card" style={{background: '#D1FAE5'}}>
          <h3>{kpis.quartsCouverts} / {kpis.quartsNonCouverts}</h3>
          <p>Couverts / Non Couverts</p>
        </div>
        <div className="kpi-card" style={{background: '#DBEAFE'}}>
          <h3>{kpis.heuresTotales}h</h3>
          <p>Heures Totales Planifiées</p>
        </div>
        <div className="kpi-card" style={{background: '#FEF3C7'}}>
          <h3>{kpis.tauxCouverture}%</h3>
          <p>Taux de Couverture</p>
        </div>
      </div>

      {/* Barre de Contrôles Harmonisée */}
      <div className="personnel-controls" style={{marginBottom: '2rem'}}>
        <div style={{display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap'}}>
          {/* Recherche avec suggestions */}
          <div className="search-container" style={{flex: 1, minWidth: '300px', position: 'relative'}}>
            <Input 
              placeholder="🔍 Rechercher un pompier..."
              value={searchFilter}
              onChange={e => {
                const newValue = e.target.value;
                setSearchFilter(newValue);
                // Réinitialiser selectedUserId si le champ est vidé
                if (!newValue.trim()) {
                  setSelectedUserId(null);
                }
              }}
              onFocus={() => setShowSearchSuggestions(true)}
            />
            {/* Dropdown de suggestions */}
            {showSearchSuggestions && searchFilter.trim() && (
              <div 
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  zIndex: 1000,
                  marginTop: '4px'
                }}
              >
                {(() => {
                  const searchLower = searchFilter.toLowerCase();
                  const filteredUsers = users.filter(u => 
                    u.statut === 'Actif' && (
                      u.nom.toLowerCase().includes(searchLower) ||
                      u.prenom.toLowerCase().includes(searchLower) ||
                      (u.email && u.email.toLowerCase().includes(searchLower))
                    )
                  ).slice(0, 10); // Limiter à 10 résultats
                  
                  if (filteredUsers.length === 0) {
                    return (
                      <div style={{padding: '1rem', textAlign: 'center', color: '#6B7280'}}>
                        Aucun pompier trouvé
                      </div>
                    );
                  }
                  
                  return filteredUsers.map(u => (
                    <div
                      key={u.id}
                      onClick={() => {
                        setSearchFilter(`${u.prenom} ${u.nom}`);
                        setSelectedUserId(u.id);
                        setShowSearchSuggestions(false);
                      }}
                      style={{
                        padding: '0.75rem 1rem',
                        cursor: 'pointer',
                        borderBottom: '1px solid #F3F4F6',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#F9FAFB'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                    >
                      <div style={{fontWeight: '600', color: '#1F2937'}}>
                        {u.prenom} {u.nom}
                      </div>
                      <div style={{fontSize: '0.875rem', color: '#6B7280'}}>
                        {u.grade} • {u.type_emploi === 'temps_partiel' ? 'TP' : 'TF'}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
          
          {/* Toggle Vue Semaine/Mois */}
          <div className="view-toggle">
            <button 
              className={viewMode === 'semaine' ? 'active' : ''}
              onClick={() => setViewMode('semaine')}
              title="Vue Semaine"
            >
              📅 Semaine
            </button>
            <button 
              className={viewMode === 'mois' ? 'active' : ''}
              onClick={() => setViewMode('mois')}
              title="Vue Mois"
            >
              📊 Mois
            </button>
          </div>

          {/* Imprimer Planning */}
          <Button 
            variant="outline" 
            onClick={handleExportPDFPlanning}
            style={{ 
              borderColor: '#3B82F6', 
              color: '#3B82F6',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            🖨️ Imprimer Planning
          </Button>
        </div>
        
        {/* Indicateur de résultats de recherche */}
        {searchFilter.trim() && (
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            background: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.95rem',
            color: '#1E40AF'
          }}>
            <span>🔍</span>
            <span>
              {(() => {
                // Si un utilisateur spécifique a été sélectionné
                if (selectedUserId) {
                  const selectedUser = getUserById(selectedUserId);
                  const userAssignations = assignations.filter(a => a.user_id === selectedUserId);
                  return selectedUser 
                    ? `${selectedUser.prenom} ${selectedUser.nom} - ${userAssignations.length} assignation(s) pour cette période`
                    : `Utilisateur sélectionné - ${userAssignations.length} assignation(s)`;
                }
                
                // Sinon recherche générale
                const matchingAssignations = assignations.filter(a => {
                  const u = getUserById(a.user_id);
                  if (!u) return false;
                  const searchLower = searchFilter.toLowerCase();
                  return u.nom.toLowerCase().includes(searchLower) ||
                         u.prenom.toLowerCase().includes(searchLower) ||
                         (u.email && u.email.toLowerCase().includes(searchLower));
                });
                const uniqueUserIds = [...new Set(matchingAssignations.map(a => a.user_id))];
                return uniqueUserIds.length > 0 
                  ? `${uniqueUserIds.length} employé(s) trouvé(s) correspondant à "${searchFilter}"`
                  : `Recherche: "${searchFilter}" - Aucune assignation trouvée pour cette période`;
              })()}
            </span>
            <button
              onClick={() => {
                setSearchFilter('');
                setSelectedUserId(null);
              }}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                color: '#1E40AF',
                cursor: 'pointer',
                fontSize: '1.2rem',
                padding: '0 0.5rem'
              }}
              title="Effacer la recherche"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Boutons d'Assignation - Responsive Mobile/Desktop */}
      {user.role !== 'employe' && (
        <div className="planning-action-buttons" style={{
          display: 'flex', 
          flexWrap: 'wrap',
          gap: '0.5rem', 
          marginBottom: '1.5rem', 
          justifyContent: 'center',
          padding: '0 0.5rem'
        }}>
          <Button 
            className="planning-btn planning-btn-auto"
            onClick={() => {
              setAutoAttributionConfig({
                periode: viewMode,
                date: viewMode === 'semaine' ? currentWeek : currentMonth
              });
              setShowAutoAttributionModal(true);
            }}
            data-testid="auto-assign-btn"
          >
            <span className="btn-icon">✨</span>
            <span className="btn-text-short">Auto</span>
            <span className="btn-text-full">Attribution Automatique</span>
          </Button>
          <Button 
            className="planning-btn planning-btn-manual"
            onClick={() => setShowAdvancedAssignModal(true)}
            data-testid="manual-assign-btn"
          >
            <span className="btn-icon">👤</span>
            <span className="btn-text-short">Manuelle</span>
            <span className="btn-text-full">Assignation Manuelle</span>
          </Button>
          <Button 
            className="planning-btn planning-btn-rapport"
            onClick={() => setShowRapportHeuresModal(true)}
            data-testid="rapport-heures-btn"
          >
            <span className="btn-icon">📊</span>
            <span className="btn-text-short">Rapport</span>
            <span className="btn-text-full">Rapport d'Heures</span>
          </Button>
        </div>
      )}

      {/* Navigation Temporelle */}
      <div className="time-navigation" style={{
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
      }}
      className="calendar-month-nav"
      >
        <Button 
          variant="outline"
          onClick={() => viewMode === 'mois' ? navigateMonth(-1) : navigateWeek(-1)}
          data-testid="prev-period-btn"
          className="month-nav-btn"
        >
          ←
        </Button>
        <h2 className="month-nav-title" style={{margin: 0, fontSize: '1.1rem', fontWeight: '600', color: '#1F2937', textAlign: 'center', flex: 1, minWidth: 0}}>
          {viewMode === 'mois' ? (
            new Date(currentMonth + '-01T12:00:00Z').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
          ) : (
            `Semaine du ${weekDates[0].toLocaleDateString('fr-FR', { timeZone: 'UTC' })} au ${weekDates[6].toLocaleDateString('fr-FR', { timeZone: 'UTC' })}`
          )}
        </h2>
        <Button 
          variant="outline"
          onClick={() => viewMode === 'mois' ? navigateMonth(1) : navigateWeek(1)}
          data-testid="next-period-btn"
          className="month-nav-btn"
        >
          →
        </Button>
      </div>

      {/* Vue Calendrier */}
      {viewMode === 'semaine' ? (
        // Vue Semaine - Style Tableau Blanc Vertical
        <div className="planning-whiteboard" style={{
          display: 'flex',
          gap: '1rem',
          overflowX: 'auto',
          padding: '1rem',
          background: 'white',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          {weekDates.map((date, dayIndex) => {
            // Récupérer les types de garde applicables pour ce jour, triés chronologiquement
            const gardesOfDay = typesGarde
              .filter(typeGarde => shouldShowTypeGardeForDay(typeGarde, dayIndex))
              .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));

            return (
              <div 
                key={dayIndex} 
                className="day-column" 
                style={{
                  flex: '1 1 0',
                  minWidth: '200px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}
              >
                {/* En-tête de la colonne jour */}
                <div style={{
                  textAlign: 'center',
                  padding: '1rem',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 10
                }}>
                  <div style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>{weekDays[dayIndex]}</div>
                  <div style={{ fontSize: '1.5rem' }}>{date.getUTCDate()}</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>
                    {date.toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' })}
                  </div>
                </div>

                {/* Cartes de garde pour ce jour */}
                {gardesOfDay.map(typeGarde => {
                  const dateStr = date.toISOString().split('T')[0];
                  const gardeAssignations = assignations.filter(a => 
                    a.date === dateStr && a.type_garde_id === typeGarde.id
                  );
                  const assignedUsers = gardeAssignations.map(a => getUserById(a.user_id)).filter(Boolean);
                  
                  // Filtrer les utilisateurs selon la recherche ou l'utilisateur sélectionné
                  const filteredUsers = selectedUserId 
                    ? assignedUsers.filter(u => u.id === selectedUserId)
                    : searchFilter.trim() 
                      ? assignedUsers.filter(u => 
                          u.nom.toLowerCase().includes(searchFilter.toLowerCase()) ||
                          u.prenom.toLowerCase().includes(searchFilter.toLowerCase()) ||
                          (u.email && u.email.toLowerCase().includes(searchFilter.toLowerCase()))
                        )
                      : [];
                  
                  const assignedCount = assignedUsers.length;
                  const requiredCount = typeGarde.personnel_requis;
                  const coverage = getGardeCoverage(date, typeGarde);
                  
                  // Vérifier si un officier est assigné à cette garde
                  const hasOfficerAssigned = assignedUsers.some(u => {
                    const gradeInfo = grades && grades.find(g => g.nom === u.grade);
                    return (gradeInfo && gradeInfo.est_officier) || u.fonction_superieur;
                  });
                  
                  // Vérifier si c'est un quart de l'utilisateur actuel
                  const isMyShift = user.role === 'employe' && assignedUsers.some(u => u.id === user.id);
                  
                  // Surbrillance bleue UNIQUEMENT si une recherche est active ET des utilisateurs correspondent
                  const isSearchedUserAssigned = (selectedUserId || searchFilter.trim()) && filteredUsers.length > 0;

                  // Utiliser la couleur définie dans les paramètres du type de garde
                  const gardeColor = typeGarde.couleur || '#6B7280';

                  return (
                    <div
                      key={typeGarde.id}
                      className="garde-card-vertical"
                      style={{
                        background: isSearchedUserAssigned 
                          ? '#EFF6FF' 
                          : isMyShift ? '#3B82F610' : 'white',
                        border: isSearchedUserAssigned
                          ? '3px solid #2563EB'
                          : `3px solid ${isMyShift ? '#3B82F6' : gardeColor}`,
                        borderRadius: '8px',
                        padding: '1rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: isSearchedUserAssigned
                          ? '0 4px 12px rgba(37, 99, 235, 0.4)'
                          : '0 2px 4px rgba(0,0,0,0.1)',
                        position: 'relative'
                      }}
                      onClick={() => {
                        if (assignedUsers.length > 0) {
                          openGardeDetails(date, typeGarde);
                        } else if (user.role !== 'employe') {
                          openAssignModal(date, typeGarde);
                        }
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                      }}
                      data-testid={`garde-card-${dayIndex}-${typeGarde.id}`}
                    >
                      {/* Indicateur de couverture en haut à droite */}
                      <div style={{
                        position: 'absolute',
                        top: '0.5rem',
                        right: '0.5rem',
                        fontSize: '1.2rem'
                      }}>
                        {coverage === 'complete' ? '✅' : coverage === 'partielle' ? '⚠️' : '❌'}
                      </div>

                      {/* En-tête de la carte avec barre colorée */}
                      <div style={{
                        background: gardeColor,
                        color: 'white',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        marginBottom: '0.75rem',
                        fontWeight: 'bold',
                        fontSize: '0.95rem'
                      }}>
                        {typeGarde.nom}
                      </div>

                      {/* Horaires */}
                      <div style={{
                        fontSize: '0.85rem',
                        color: '#6B7280',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        <span>⏰</span>
                        <span>{typeGarde.heure_debut} - {typeGarde.heure_fin}</span>
                      </div>

                      {/* Ratio personnel */}
                      <div style={{
                        fontSize: '0.9rem',
                        fontWeight: 'bold',
                        marginBottom: '0.75rem',
                        color: coverage === 'complete' ? '#10b981' : coverage === 'partielle' ? '#f59e0b' : '#ef4444'
                      }}>
                        Personnel: {assignedCount}/{requiredCount}
                      </div>

                      {/* Liste du personnel assigné */}
                      <div style={{
                        borderTop: '1px solid #E5E7EB',
                        paddingTop: '0.75rem'
                      }}>
                        {assignedUsers.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {(searchFilter.trim() ? filteredUsers : assignedUsers).map((u, idx) => (
                              <div 
                                key={idx} 
                                style={{
                                  padding: '0.5rem',
                                  background: searchFilter.trim() && (filteredUsers.includes(u) || u.id === selectedUserId) 
                                    ? 'linear-gradient(135deg, #93C5FD 0%, #BFDBFE 100%)' 
                                    : '#F9FAFB',
                                  borderRadius: '4px',
                                  fontSize: '0.85rem',
                                  fontWeight: (searchFilter.trim() && (filteredUsers.includes(u) || u.id === selectedUserId)) || u.id === user.id ? 'bold' : 'normal',
                                  border: (searchFilter.trim() && (filteredUsers.includes(u) || u.id === selectedUserId)) 
                                    ? '2px solid #2563EB' 
                                    : u.id === user.id ? '2px solid #3B82F6' : '1px solid #E5E7EB',
                                  boxShadow: searchFilter.trim() && (filteredUsers.includes(u) || u.id === selectedUserId) ? '0 2px 8px rgba(37, 99, 235, 0.3)' : 'none'
                                }}
                              >
                                {searchFilter.trim() && (filteredUsers.includes(u) || u.id === selectedUserId) && '🔍 '}
                                {u.prenom.charAt(0)}. {u.nom} - {u.grade}
                              </div>
                            ))}
                            {searchFilter.trim() && filteredUsers.length === 0 && (
                              <div style={{
                                fontSize: '0.8rem',
                                color: '#6B7280',
                                fontStyle: 'italic',
                                textAlign: 'center'
                              }}>
                                Aucune correspondance
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{
                            textAlign: 'center',
                            color: '#EF4444',
                            fontWeight: 'bold',
                            fontSize: '0.9rem',
                            padding: '0.5rem'
                          }}>
                            🚫 Vacant
                          </div>
                        )}
                      </div>

                      {/* Badge Officier si requis */}
                      {typeGarde.officier_obligatoire && (
                        <div style={{
                          marginTop: '0.5rem',
                          padding: '0.25rem 0.5rem',
                          background: hasOfficerAssigned ? '#D1FAE5' : '#FEE2E2',
                          color: hasOfficerAssigned ? '#065F46' : '#991B1B',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          textAlign: 'center',
                          border: hasOfficerAssigned ? '1px solid #10B981' : '1px solid #EF4444'
                        }}>
                          {hasOfficerAssigned ? '✅ Officier présent' : '⚠️ Officier manquant'}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Message si aucune garde ce jour */}
                {gardesOfDay.length === 0 && (
                  <div style={{
                    padding: '2rem 1rem',
                    textAlign: 'center',
                    color: '#9CA3AF',
                    fontSize: '0.9rem',
                    fontStyle: 'italic',
                    border: '2px dashed #E5E7EB',
                    borderRadius: '8px',
                    background: '#F9FAFB'
                  }}>
                    Aucune garde ce jour
                  </div>
                )}
              </div>
            );
          })}
        </div>
        ) : (
          // Vue Mois Calendrier
        <div className="planning-mois">
          <div className="mois-header">
            <h3>📅 Planning mensuel - {new Date(currentMonth + '-01T12:00:00Z').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3>
          </div>
          
          <div className="calendrier-mois">
            {monthDates.map((date, index) => {
              // Si date est null, c'est un jour vide (avant le 1er du mois)
              if (date === null) {
                return <div key={`empty-${index}`} className="jour-mois jour-vide"></div>;
              }

              const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' });
              const dayIndex = date.getUTCDay() === 0 ? 6 : date.getUTCDay() - 1; // Lundi = 0
              
              const gardesJour = typesGarde.filter(typeGarde => 
                shouldShowTypeGardeForDay(typeGarde, dayIndex)
              );

              return (
                <div key={date.toISOString().split('T')[0]} className="jour-mois">
                  <div className="jour-mois-header">
                    <span className="jour-mois-name">{dayName}</span>
                    <span className="jour-mois-date">{date.getUTCDate()}</span>
                  </div>
                  
                  <div className="gardes-jour-list">
                    {gardesJour.map(typeGarde => {
                      const coverage = getGardeCoverage(date, typeGarde);
                      const dateStr = date.toISOString().split('T')[0];
                      const gardeAssignations = assignations.filter(a => 
                        a.date === dateStr && a.type_garde_id === typeGarde.id
                      );
                      const assignedUsers = gardeAssignations.map(a => getUserById(a.user_id)).filter(Boolean);
                      
                      // Filtrer les utilisateurs selon la recherche (même logique que vue semaine)
                      const filteredUsers = selectedUserId 
                        ? assignedUsers.filter(u => u.id === selectedUserId)
                        : searchFilter.trim() 
                          ? assignedUsers.filter(u => 
                              u.nom.toLowerCase().includes(searchFilter.toLowerCase()) ||
                              u.prenom.toLowerCase().includes(searchFilter.toLowerCase()) ||
                              (u.email && u.email.toLowerCase().includes(searchFilter.toLowerCase()))
                            )
                          : [];
                      
                      const isMyShift = user.role === 'employe' && assignedUsers.some(u => u.id === user.id);
                      // Surbrillance bleue UNIQUEMENT si une recherche est active ET des utilisateurs correspondent
                      const isSearchedUserAssigned = (selectedUserId || searchFilter.trim()) && filteredUsers.length > 0;
                      
                      return (
                        <div
                          key={typeGarde.id}
                          className={`garde-mois-item ${coverage} ${isMyShift ? 'my-shift' : ''} ${isSearchedUserAssigned ? 'searched-user' : ''}`}
                          style={{
                            backgroundColor: isSearchedUserAssigned ? '#2563EB' : (isMyShift ? '#3B82F6' : getCoverageColor(coverage)),
                            opacity: coverage === 'vacante' ? 0.7 : 1,
                            border: isSearchedUserAssigned ? '2px solid #1D4ED8' : 'none',
                            boxShadow: isSearchedUserAssigned ? '0 0 0 3px rgba(37, 99, 235, 0.3)' : 'none'
                          }}
                          onClick={() => openGardeDetails(date, typeGarde)}
                          data-testid={`garde-mois-${date.getDate()}-${typeGarde.id}`}
                          title={`${typeGarde.nom} - ${assignedUsers.length}/${typeGarde.personnel_requis}`}
                        >
                          <span className="garde-nom-complet">{typeGarde.nom}</span>
                          <span className="coverage-icon">
                            {coverage === 'complete' ? '✅' : coverage === 'partielle' ? '⚠️' : '❌'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Légende des Couleurs - En bas du planning */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        justifyContent: 'center',
        marginTop: '1.5rem',
        padding: '1rem',
        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        border: '1px solid #e2e8f0'
      }}>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
          <span style={{
            width: '20px', 
            height: '20px', 
            background: '#10B981', 
            borderRadius: '6px', 
            display: 'inline-block',
            flexShrink: 0
          }}></span>
          <span style={{fontSize: '0.85rem', fontWeight: '500', color: '#1e293b', whiteSpace: 'nowrap'}}>✅ Complet</span>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
          <span style={{
            width: '20px', 
            height: '20px', 
            background: '#F59E0B', 
            borderRadius: '6px', 
            display: 'inline-block',
            flexShrink: 0
          }}></span>
          <span style={{fontSize: '0.85rem', fontWeight: '500', color: '#1e293b', whiteSpace: 'nowrap'}}>⚠️ Partiel</span>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
          <span style={{
            width: '20px', 
            height: '20px', 
            background: '#EF4444', 
            borderRadius: '6px', 
            display: 'inline-block',
            flexShrink: 0
          }}></span>
          <span style={{fontSize: '0.85rem', fontWeight: '500', color: '#1e293b', whiteSpace: 'nowrap'}}>❌ Vacant</span>
        </div>
        {user.role === 'employe' && (
          <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
            <span style={{
              width: '20px', 
              height: '20px', 
              background: '#3B82F6', 
              borderRadius: '6px', 
              display: 'inline-block',
              flexShrink: 0
            }}></span>
            <span style={{fontSize: '0.85rem', fontWeight: '500', color: '#1e293b', whiteSpace: 'nowrap'}}>👤 Mes Quarts</span>
          </div>
        )}
      </div>

      {/* Assignment Modal */}
      {showAssignModal && selectedSlot && user.role !== 'employe' && (
        <div className="modal-overlay" onClick={() => { setShowAssignModal(false); setQuickAssignSearchQuery(''); setShowQuickAssignDropdown(false); }}>
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()} 
            data-testid="assign-modal"
            style={{
              maxHeight: '85vh',
              maxWidth: '600px',
              width: '95%',
              overflow: 'visible',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h3>Assigner une garde</h3>
              <Button variant="ghost" onClick={() => { setShowAssignModal(false); setQuickAssignSearchQuery(''); setShowQuickAssignDropdown(false); }}>✕</Button>
            </div>
            <div className="modal-body" style={{ 
              overflow: 'visible', 
              flex: 1, 
              minHeight: 0,
              padding: '1.5rem'
            }}>
              <div className="assignment-details" style={{ 
                padding: '1rem', 
                background: '#f8fafc', 
                borderRadius: '8px',
                marginBottom: '1.25rem'
              }}>
                <p style={{ margin: '0.5rem 0', fontSize: '1rem' }}>
                  <strong>Garde:</strong> {selectedSlot.typeGarde.nom}
                </p>
                <p style={{ margin: '0.5rem 0', fontSize: '1rem' }}>
                  <strong>Date:</strong> {selectedSlot.date.toLocaleDateString('fr-FR')}
                </p>
                <p style={{ margin: '0.5rem 0', fontSize: '1rem' }}>
                  <strong>Horaires:</strong> {selectedSlot.typeGarde.heure_debut} - {selectedSlot.typeGarde.heure_fin}
                </p>
              </div>
              
              <div className="user-selection" style={{ overflow: 'visible', marginBottom: '0.5rem' }}>
                <h4 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Rechercher un pompier:</h4>
                <div style={{ position: 'relative', overflow: 'visible' }}>
                  <Input
                    type="text"
                    placeholder="Tapez le nom ou prénom du pompier..."
                    value={quickAssignSearchQuery}
                    onChange={(e) => {
                      setQuickAssignSearchQuery(e.target.value);
                      setShowQuickAssignDropdown(true);
                    }}
                    onFocus={() => setShowQuickAssignDropdown(true)}
                    style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
                    data-testid="quick-assign-search"
                  />
                  
                  {showQuickAssignDropdown && quickAssignSearchQuery && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      maxHeight: '300px',
                      overflowY: 'auto',
                      background: 'white',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      marginTop: '4px',
                      zIndex: 1050,
                      boxShadow: '0 10px 15px rgba(0,0,0,0.15)',
                      fontSize: '0.875rem',
                      color: '#1e293b'
                    }}>
                      {users
                        .filter(userOption => {
                          // Filtrer les utilisateurs déjà assignés
                          const dateStr = selectedSlot.date.toISOString().split('T')[0];
                          const alreadyAssigned = assignations.some(a => 
                            a.date === dateStr && 
                            a.type_garde_id === selectedSlot.typeGarde.id && 
                            a.user_id === userOption.id
                          );
                          
                          // Filtrer par recherche
                          const searchLower = quickAssignSearchQuery.toLowerCase();
                          const matchesSearch = 
                            `${userOption.prenom} ${userOption.nom}`.toLowerCase().includes(searchLower) ||
                            userOption.grade.toLowerCase().includes(searchLower);
                          
                          return !alreadyAssigned && matchesSearch;
                        })
                        .map(userOption => (
                          <div
                            key={userOption.id}
                            onClick={() => {
                              handleAssignUser(userOption.id, selectedSlot.typeGarde.id, selectedSlot.date.toISOString().split('T')[0]);
                              setQuickAssignSearchQuery('');
                              setShowQuickAssignDropdown(false);
                            }}
                            style={{
                              padding: '0.75rem',
                              cursor: 'pointer',
                              borderBottom: '1px solid #f1f5f9',
                              transition: 'background 0.2s',
                              color: '#1e293b'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#f8fafc';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'white';
                            }}
                            data-testid={`quick-assign-user-${userOption.id}`}
                          >
                            <div style={{ 
                              fontWeight: '500', 
                              fontSize: '0.95rem',
                              color: '#1e293b',
                              marginBottom: '0.25rem'
                            }}>
                              {userOption.prenom} {userOption.nom}
                            </div>
                            <div style={{ 
                              fontSize: '0.85rem', 
                              color: '#64748b',
                              fontWeight: '400'
                            }}>
                              {userOption.grade} - {userOption.type_emploi === 'temps_plein' ? 'TP' : 'TPA'}
                            </div>
                          </div>
                        ))}
                      
                      {users.filter(userOption => {
                        const dateStr = selectedSlot.date.toISOString().split('T')[0];
                        const alreadyAssigned = assignations.some(a => 
                          a.date === dateStr && 
                          a.type_garde_id === selectedSlot.typeGarde.id && 
                          a.user_id === userOption.id
                        );
                        const searchLower = quickAssignSearchQuery.toLowerCase();
                        const matchesSearch = 
                          `${userOption.prenom} ${userOption.nom}`.toLowerCase().includes(searchLower) ||
                          userOption.grade.toLowerCase().includes(searchLower);
                        return !alreadyAssigned && matchesSearch;
                      }).length === 0 && (
                        <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>
                          Aucun pompier trouvé
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal détails d'une garde - Voir tout le personnel */}
      {showGardeDetailsModal && selectedGardeDetails && (
        <div className="modal-overlay" onClick={() => setShowGardeDetailsModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="garde-details-modal">
            <div className="modal-header">
              <h3>🚒 Détails de la garde - {selectedGardeDetails.date.toLocaleDateString('fr-FR')}</h3>
              <Button variant="ghost" onClick={() => setShowGardeDetailsModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="garde-info-header">
                <div className="garde-type-info">
                  <h4>{selectedGardeDetails.typeGarde.nom}</h4>
                  <div className="garde-details-meta">
                    <span>⏰ {selectedGardeDetails.typeGarde.heure_debut} - {selectedGardeDetails.typeGarde.heure_fin}</span>
                    <span>👥 {selectedGardeDetails.typeGarde.personnel_requis} personnel requis</span>
                    {selectedGardeDetails.typeGarde.officier_obligatoire && (() => {
                      const hasOfficer = selectedGardeDetails.personnelAssigne.some(u => {
                        const gradeInfo = grades && grades.find(g => g.nom === u.grade);
                        return (gradeInfo && gradeInfo.est_officier) || u.fonction_superieur;
                      });
                      return (
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          background: hasOfficer ? '#D1FAE5' : '#FEE2E2',
                          color: hasOfficer ? '#065F46' : '#991B1B',
                          fontWeight: 'bold'
                        }}>
                          {hasOfficer ? '✅ Officier présent' : '⚠️ Officier manquant'}
                        </span>
                      );
                    })()}
                    {selectedGardeDetails.typeGarde.est_garde_externe && (
                      <span className="badge-externe">🏠 Garde Externe</span>
                    )}
                  </div>
                </div>
                <div className="coverage-indicator">
                  <span className="coverage-ratio">
                    {selectedGardeDetails.personnelAssigne.length}/{selectedGardeDetails.typeGarde.personnel_requis}
                  </span>
                  <span className="coverage-label">Personnel assigné</span>
                </div>
              </div>

              <div className="personnel-assigned">
                <h4>👥 Personnel assigné</h4>
                {selectedGardeDetails.personnelAssigne.length > 0 ? (
                  <div className="personnel-list">
                    {selectedGardeDetails.personnelAssigne.map((person, index) => (
                      <div key={person.id} className="personnel-item">
                        <div className="personnel-info">
                          <div className="personnel-avatar">
                            <span className="avatar-icon">👤</span>
                          </div>
                          <div className="personnel-details">
                            <span className="personnel-name">{person.prenom} {person.nom}</span>
                            <span className="personnel-grade">{person.grade}</span>
                            <span className="personnel-type">{person.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'}</span>
                          </div>
                        </div>
                        <div className="personnel-actions">
                          <span className="assignment-method">
                            {selectedGardeDetails.assignations[index]?.assignation_type === 'auto' ? '🤖 Auto' : '👤 Manuel'}
                          </span>
                          {user.role === 'admin' && selectedGardeDetails.assignations[index]?.assignation_type === 'auto' && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => {
                                console.log('Bouton Audit cliqué', selectedGardeDetails.assignations[index]);
                                openAuditModal(selectedGardeDetails.assignations[index], person);
                              }}
                              style={{ marginLeft: '8px' }}
                            >
                              🔍 Audit
                            </Button>
                          )}
                          {user.role !== 'employe' && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleRemovePersonFromGarde(person.id, selectedGardeDetails.typeGarde.nom)}
                              data-testid={`remove-person-${person.id}`}
                            >
                              ❌ Retirer
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-personnel">
                    <p>Aucun personnel assigné à cette garde</p>
                    {user.role !== 'employe' && (
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setShowGardeDetailsModal(false);
                          openAssignModal(selectedGardeDetails.date, selectedGardeDetails.typeGarde);
                        }}
                        data-testid="assign-personnel-btn"
                      >
                        Assigner du personnel
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="garde-actions">
                {user.role !== 'employe' && (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setShowGardeDetailsModal(false);
                        openAssignModal(selectedGardeDetails.date, selectedGardeDetails.typeGarde);
                      }}
                      data-testid="add-more-personnel-btn"
                    >
                      ➕ Ajouter personnel
                    </Button>
                    <Button 
                      variant="destructive" 
                      onClick={handleRemoveAllPersonnelFromGarde}
                      data-testid="remove-all-personnel-btn"
                    >
                      🗑️ Supprimer tout le personnel
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'assignation manuelle avancée avec récurrence */}
      {showAdvancedAssignModal && user.role !== 'employe' && (
        <div className="modal-overlay" onClick={() => setShowAdvancedAssignModal(false)}>
          <div className="modal-content extra-large-modal" onClick={(e) => e.stopPropagation()} data-testid="advanced-assign-modal">
            <div className="modal-header">
              <h3>👤 Assignation manuelle avancée</h3>
              <Button variant="ghost" onClick={() => setShowAdvancedAssignModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="advanced-assign-form">
                {/* Section 1: Sélection personnel */}
                <div className="assign-section">
                  <h4>👥 Sélection du personnel</h4>
                  <div className="form-field" style={{ position: 'relative' }}>
                    <Label>Pompier à assigner *</Label>
                    <Input
                      type="text"
                      placeholder="Tapez le nom du pompier..."
                      value={userSearchQuery}
                      onChange={(e) => {
                        setUserSearchQuery(e.target.value);
                        setShowUserDropdown(true);
                      }}
                      onFocus={() => setShowUserDropdown(true)}
                      data-testid="advanced-user-search"
                    />
                    {showUserDropdown && userSearchQuery && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        maxHeight: '200px',
                        overflowY: 'auto',
                        background: 'white',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        marginTop: '4px',
                        zIndex: 1000,
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                      }}>
                        {users
                          .filter(user => 
                            `${user.prenom} ${user.nom}`.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                            user.grade.toLowerCase().includes(userSearchQuery.toLowerCase())
                          )
                          .map(user => (
                            <div
                              key={user.id}
                              onClick={() => {
                                setAdvancedAssignConfig({...advancedAssignConfig, user_id: user.id});
                                setUserSearchQuery(`${user.prenom} ${user.nom}`);
                                setShowUserDropdown(false);
                              }}
                              style={{
                                padding: '0.75rem',
                                cursor: 'pointer',
                                borderBottom: '1px solid #f1f5f9',
                                transition: 'background 0.2s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                            >
                              <div style={{ fontWeight: '500' }}>{user.prenom} {user.nom}</div>
                              <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                                {user.grade} - {user.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'}
                              </div>
                            </div>
                          ))}
                        {users.filter(user => 
                          `${user.prenom} ${user.nom}`.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                          user.grade.toLowerCase().includes(userSearchQuery.toLowerCase())
                        ).length === 0 && (
                          <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>
                            Aucun pompier trouvé
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 2: Type de garde */}
                <div className="assign-section">
                  <h4>🚒 Type(s) de garde</h4>
                  <div className="form-field">
                    <Label>Type(s) de garde * (sélection multiple)</Label>
                    <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1rem' }}>
                      💡 Vous pouvez sélectionner plusieurs types de garde pour la même assignation
                    </p>
                    
                    {/* Multi-select avec checkboxes */}
                    <div style={{
                      maxHeight: '300px',
                      overflowY: 'auto',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '0.5rem',
                      background: '#f8fafc'
                    }}>
                      {typesGarde.length === 0 && (
                        <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>
                          Aucun type de garde disponible
                        </div>
                      )}
                      
                      {typesGarde.map(type => {
                        const isSelected = advancedAssignConfig.type_garde_ids.includes(type.id);
                        
                        return (
                          <label
                            key={type.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem',
                              padding: '0.75rem',
                              margin: '0.25rem 0',
                              border: '2px solid',
                              borderColor: isSelected ? '#dc2626' : '#e2e8f0',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              background: isSelected ? '#fee2e2' : 'white',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) e.currentTarget.style.background = '#fafafa';
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) e.currentTarget.style.background = 'white';
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  // Ajouter le type de garde
                                  setAdvancedAssignConfig({
                                    ...advancedAssignConfig,
                                    type_garde_ids: [...advancedAssignConfig.type_garde_ids, type.id]
                                  });
                                } else {
                                  // Retirer le type de garde
                                  setAdvancedAssignConfig({
                                    ...advancedAssignConfig,
                                    type_garde_ids: advancedAssignConfig.type_garde_ids.filter(id => id !== type.id)
                                  });
                                }
                              }}
                              style={{
                                width: '20px',
                                height: '20px',
                                cursor: 'pointer',
                                accentColor: '#dc2626'
                              }}
                              data-testid={`type-garde-checkbox-${type.id}`}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: isSelected ? '600' : '500', color: '#1e293b' }}>
                                {type.nom}
                              </div>
                              <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                                {type.heure_debut && type.heure_fin ? (
                                  <>⏰ {type.heure_debut} - {type.heure_fin} ({type.duree_heures || 8}h)</>
                                ) : (
                                  <>⏰ Durée: {type.duree_heures || 8}h</>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <div style={{ color: '#dc2626', fontSize: '1.2rem' }}>✓</div>
                            )}
                          </label>
                        );
                      })}
                    </div>
                    
                    {/* Résumé de la sélection */}
                    {advancedAssignConfig.type_garde_ids.length > 0 && (
                      <div style={{
                        marginTop: '1rem',
                        padding: '0.75rem',
                        background: '#eff6ff',
                        border: '1px solid #3b82f6',
                        borderRadius: '8px'
                      }}>
                        <div style={{ fontWeight: '600', color: '#1e40af', marginBottom: '0.5rem' }}>
                          📋 Sélection actuelle: {advancedAssignConfig.type_garde_ids.length} type(s) de garde
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#1e40af' }}>
                          {typesGarde
                            .filter(tg => advancedAssignConfig.type_garde_ids.includes(tg.id))
                            .map(tg => tg.nom)
                            .join(' + ')}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 2.5: Sélection des jours (conditionnel selon type récurrence) */}
                {advancedAssignConfig.recurrence_type !== 'unique' && advancedAssignConfig.recurrence_type !== 'mensuelle' && advancedAssignConfig.recurrence_type !== 'annuelle' && advancedAssignConfig.recurrence_type !== 'personnalisee' && (
                  <div className="assign-section" style={{ background: '#eff6ff', padding: '1rem', borderRadius: '8px', border: '2px solid #3b82f6' }}>
                    <h4>📋 Jours de la semaine pour la récurrence</h4>
                    <p style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '1rem' }}>
                      ✅ Sélectionnez un ou plusieurs jours pour créer des assignations récurrentes.
                      <br />
                      <strong>Exemple :</strong> Cochez Lundi + Mercredi + Vendredi pour créer des gardes ces 3 jours chaque semaine.
                    </p>
                    <div className="jours-selection">
                      {[
                        { value: 'monday', label: 'Lundi' },
                        { value: 'tuesday', label: 'Mardi' },
                        { value: 'wednesday', label: 'Mercredi' },
                        { value: 'thursday', label: 'Jeudi' },
                        { value: 'friday', label: 'Vendredi' },
                        { value: 'saturday', label: 'Samedi' },
                        { value: 'sunday', label: 'Dimanche' }
                      ].map(jour => (
                        <label key={jour.value} className="jour-checkbox" style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.75rem 1rem',
                          margin: '0.25rem',
                          border: '2px solid',
                          borderColor: advancedAssignConfig.jours_semaine.includes(jour.value) ? '#3b82f6' : '#cbd5e1',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          background: advancedAssignConfig.jours_semaine.includes(jour.value) ? '#dbeafe' : 'white',
                          fontWeight: advancedAssignConfig.jours_semaine.includes(jour.value) ? '600' : '400',
                          transition: 'all 0.2s ease'
                        }}>
                          <input
                            type="checkbox"
                            checked={advancedAssignConfig.jours_semaine.includes(jour.value)}
                            onChange={(e) => {
                              const newJours = e.target.checked
                                ? [...advancedAssignConfig.jours_semaine, jour.value]
                                : advancedAssignConfig.jours_semaine.filter(j => j !== jour.value);
                              setAdvancedAssignConfig({...advancedAssignConfig, jours_semaine: newJours});
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <span>{jour.label}</span>
                        </label>
                      ))}
                    </div>
                    {advancedAssignConfig.jours_semaine.length > 0 && (
                      <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#059669', fontWeight: '600' }}>
                        ✅ {advancedAssignConfig.jours_semaine.length} jour(s) sélectionné(s)
                      </p>
                    )}
                  </div>
                )}

                {/* Section 3: Configuration récurrence */}
                <div className="assign-section">
                  <h4>🔄 Type de récurrence</h4>
                  <div style={{ marginBottom: '1rem' }}>
                    <select
                      value={advancedAssignConfig.recurrence_type}
                      onChange={(e) => setAdvancedAssignConfig({...advancedAssignConfig, recurrence_type: e.target.value})}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }}
                    >
                      <option value="unique">📅 Assignation unique</option>
                      <option value="hebdomadaire">🔁 Toutes les semaines (hebdomadaire)</option>
                      <option value="bihebdomadaire">🔄 Toutes les deux semaines (bi-hebdomadaire)</option>
                      <option value="mensuelle">📆 Tous les mois (mensuelle)</option>
                      <option value="annuelle">🗓️ Tous les ans (annuelle)</option>
                      <option value="personnalisee">⚙️ Personnalisée</option>
                    </select>
                  </div>

                  {/* Options pour personnalisée */}
                  {advancedAssignConfig.recurrence_type === 'personnalisee' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '6px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                          Tous les
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={advancedAssignConfig.recurrence_intervalle || 1}
                          onChange={(e) => setAdvancedAssignConfig({...advancedAssignConfig, recurrence_intervalle: parseInt(e.target.value) || 1})}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                          Type
                        </label>
                        <select
                          value={advancedAssignConfig.recurrence_frequence || 'jours'}
                          onChange={(e) => setAdvancedAssignConfig({...advancedAssignConfig, recurrence_frequence: e.target.value})}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                        >
                          <option value="jours">Jours</option>
                          <option value="semaines">Semaines</option>
                          <option value="mois">Mois</option>
                          <option value="ans">Ans</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 4: Configuration dates */}
                <div className="assign-section">
                  <h4>📅 Période d'assignation</h4>
                  <div className="form-row">
                    <div className="form-field">
                      <Label>Date de début *</Label>
                      <Input
                        type="date"
                        value={advancedAssignConfig.date_debut}
                        onChange={(e) => setAdvancedAssignConfig({...advancedAssignConfig, date_debut: e.target.value})}
                        min={new Date().toISOString().split('T')[0]}
                        data-testid="advanced-date-debut"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Date de fin *</Label>
                      <Input
                        type="date"
                        value={advancedAssignConfig.date_fin}
                        onChange={(e) => setAdvancedAssignConfig({...advancedAssignConfig, date_fin: e.target.value})}
                        min={advancedAssignConfig.date_debut || new Date().toISOString().split('T')[0]}
                        data-testid="advanced-date-fin"
                      />
                    </div>
                  </div>
                </div>

                {/* Suggestion de prochain jour si nécessaire */}
                {advancedAssignConfig.jour_specifique && advancedAssignConfig.date_debut && getSuggestedNextDay() && (
                  <div className="assign-section" style={{ background: '#fef3c7', padding: '1rem', borderRadius: '8px', border: '2px solid #f59e0b' }}>
                    <h4>💡 Suggestion</h4>
                    <p style={{ fontSize: '0.9rem', color: '#92400e', marginBottom: '0.75rem' }}>
                      La date de début sélectionnée n'est pas un {getSuggestedNextDay()?.dayName}.
                    </p>
                    <Button
                      variant="outline"
                      style={{ background: 'white', border: '2px solid #f59e0b', color: '#92400e', fontWeight: '500' }}
                      onClick={() => {
                        const suggested = getSuggestedNextDay();
                        if (suggested) {
                          const dateStr = suggested.date.toISOString().split('T')[0];
                          setAdvancedAssignConfig({...advancedAssignConfig, date_debut: dateStr});
                          toast({
                            title: "Date ajustée",
                            description: `Date de début changée au prochain ${suggested.dayName}`,
                            variant: "success"
                          });
                        }
                      }}
                    >
                      📅 Utiliser le prochain {getSuggestedNextDay()?.dayName} : {getSuggestedNextDay()?.formatted}
                    </Button>
                  </div>
                )}

                {/* Aperçu des dates de récurrence */}
                {advancedAssignConfig.date_debut && advancedAssignConfig.recurrence_type !== 'unique' && advancedAssignConfig.jour_specifique && (
                  <div className="assign-section" style={{ background: '#f0fdf4', padding: '1rem', borderRadius: '8px', border: '2px solid #22c55e' }}>
                    <h4>👁️ Aperçu des dates (10 premières)</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem', marginTop: '0.75rem' }}>
                      {calculateRecurrenceDates().map((date, index) => (
                        <div
                          key={index}
                          style={{
                            padding: '0.5rem',
                            background: 'white',
                            borderRadius: '6px',
                            border: '1px solid #86efac',
                            fontSize: '0.875rem',
                            textAlign: 'center'
                          }}
                        >
                          <div style={{ fontWeight: '600', color: '#166534' }}>
                            {date.toLocaleDateString('fr-FR', { weekday: 'short' })}
                          </div>
                          <div style={{ color: '#15803d' }}>
                            {date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                        </div>
                      ))}
                    </div>
                    {calculateRecurrenceDates().length === 0 && (
                      <p style={{ textAlign: 'center', color: '#166534', marginTop: '0.5rem' }}>
                        Aucune date à afficher. Vérifiez votre configuration.
                      </p>
                    )}
                  </div>
                )}

                {/* Section 6: Résumé de l'assignation */}
                <div className="assign-section">
                  <h4>📊 Résumé de l'assignation</h4>
                  <div className="assignment-summary">
                    <div className="summary-row">
                      <span className="summary-label">Personnel :</span>
                      <span className="summary-value">
                        {advancedAssignConfig.user_id ? 
                          users.find(u => u.id === advancedAssignConfig.user_id)?.prenom + ' ' + 
                          users.find(u => u.id === advancedAssignConfig.user_id)?.nom 
                          : 'Non sélectionné'}
                      </span>
                    </div>
                    <div className="summary-row">
                      <span className="summary-label">Type(s) de garde :</span>
                      <span className="summary-value">
                        {advancedAssignConfig.type_garde_ids.length > 0 ?
                          typesGarde
                            .filter(t => advancedAssignConfig.type_garde_ids.includes(t.id))
                            .map(t => t.nom)
                            .join(' + ')
                          : 'Non sélectionné'}
                      </span>
                    </div>
                    <div className="summary-row">
                      <span className="summary-label">Récurrence :</span>
                      <span className="summary-value">
                        {advancedAssignConfig.recurrence_type === 'unique' ? '📅 Assignation unique' :
                         advancedAssignConfig.recurrence_type === 'hebdomadaire' ? 
                           `🔁 Chaque semaine (${advancedAssignConfig.jours_semaine.length} jour(s) sélectionné(s))` :
                         advancedAssignConfig.recurrence_type === 'bihebdomadaire' ?
                           `🔄 Toutes les 2 semaines (${advancedAssignConfig.jours_semaine.length} jour(s) sélectionné(s))` :
                         advancedAssignConfig.recurrence_type === 'mensuelle' ? '📆 Tous les mois' :
                         advancedAssignConfig.recurrence_type === 'annuelle' ? '🗓️ Tous les ans' :
                         `⚙️ Tous les ${advancedAssignConfig.recurrence_intervalle} ${advancedAssignConfig.recurrence_frequence}`}
                      </span>
                    </div>
                    <div className="summary-row">
                      <span className="summary-label">Période :</span>
                      <span className="summary-value">
                        {advancedAssignConfig.date_debut && advancedAssignConfig.date_fin ?
                          `Du ${new Date(advancedAssignConfig.date_debut).toLocaleDateString('fr-FR')} au ${new Date(advancedAssignConfig.date_fin).toLocaleDateString('fr-FR')}`
                          : 'Période non définie'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowAdvancedAssignModal(false)}>
                  Annuler
                </Button>
                <Button 
                  variant="default" 
                  onClick={handleAdvancedAssignment}
                  data-testid="create-advanced-assignment-btn"
                  disabled={!advancedAssignConfig.user_id || advancedAssignConfig.type_garde_ids.length === 0 || !advancedAssignConfig.date_debut}
                >
                  🚒 Créer l'assignation{advancedAssignConfig.type_garde_ids.length > 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      
      {/* Modal Attribution Automatique - Version améliorée */}
      {showAutoAttributionModal && (
        <div className="modal-overlay" onClick={() => setShowAutoAttributionModal(false)}>
          <div className="modal-content medium-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>✨ Attribution Automatique du Planning</h2>
              <Button variant="ghost" onClick={() => setShowAutoAttributionModal(false)}>✕</Button>
            </div>
            
            <div className="modal-body">
              <h3 style={{marginBottom: '1rem', fontSize: '1.1rem'}}>Pour quelle période?</h3>
              
              <div style={{display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(2, 1fr)'}}>
                {/* Semaine actuelle */}
                <button
                  onClick={() => {
                    const today = new Date();
                    const monday = new Date(today);
                    monday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
                    const dateStr = monday.toISOString().split('T')[0];
                    setAutoAttributionConfig({
                      ...autoAttributionConfig,
                      periode: 'semaine',
                      periodeLabel: 'Semaine actuelle',
                      date: dateStr
                    });
                  }}
                  style={{
                    padding: '1.5rem',
                    border: autoAttributionConfig.periodeLabel === 'Semaine actuelle' ? '3px solid #3B82F6' : '2px solid #E5E7EB',
                    borderRadius: '12px',
                    background: autoAttributionConfig.periodeLabel === 'Semaine actuelle' ? '#EFF6FF' : 'white',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{fontSize: '2rem', marginBottom: '0.5rem'}}>📅</div>
                  <div style={{fontWeight: '600', marginBottom: '0.25rem'}}>Semaine actuelle</div>
                  <div style={{fontSize: '0.875rem', color: '#6B7280'}}>
                    {(() => {
                      const today = new Date();
                      const monday = new Date(today);
                      monday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
                      const sunday = new Date(monday);
                      sunday.setDate(monday.getDate() + 6);
                      return `${monday.toLocaleDateString('fr-CA')} au ${sunday.toLocaleDateString('fr-CA')}`;
                    })()}
                  </div>
                </button>

                {/* Semaine suivante */}
                <button
                  onClick={() => {
                    const today = new Date();
                    const nextMonday = new Date(today);
                    nextMonday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? 1 : 8));
                    const dateStr = nextMonday.toISOString().split('T')[0];
                    setAutoAttributionConfig({
                      ...autoAttributionConfig,
                      periode: 'semaine',
                      periodeLabel: 'Semaine suivante',
                      date: dateStr
                    });
                  }}
                  style={{
                    padding: '1.5rem',
                    border: autoAttributionConfig.periodeLabel === 'Semaine suivante' ? '3px solid #3B82F6' : '2px solid #E5E7EB',
                    borderRadius: '12px',
                    background: autoAttributionConfig.periodeLabel === 'Semaine suivante' ? '#EFF6FF' : 'white',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{fontSize: '2rem', marginBottom: '0.5rem'}}>📅</div>
                  <div style={{fontWeight: '600', marginBottom: '0.25rem'}}>Semaine suivante</div>
                  <div style={{fontSize: '0.875rem', color: '#6B7280'}}>
                    {(() => {
                      const today = new Date();
                      const nextMonday = new Date(today);
                      nextMonday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? 1 : 8));
                      const nextSunday = new Date(nextMonday);
                      nextSunday.setDate(nextMonday.getDate() + 6);
                      return `${nextMonday.toLocaleDateString('fr-CA')} au ${nextSunday.toLocaleDateString('fr-CA')}`;
                    })()}
                  </div>
                </button>

                {/* Mois actuel */}
                <button
                  onClick={() => {
                    const today = new Date();
                    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                    const dateStr = firstDay.toISOString().split('T')[0];
                    setAutoAttributionConfig({
                      ...autoAttributionConfig,
                      periode: 'mois',
                      periodeLabel: 'Mois actuel',
                      date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
                    });
                  }}
                  style={{
                    padding: '1.5rem',
                    border: autoAttributionConfig.periodeLabel === 'Mois actuel' ? '3px solid #3B82F6' : '2px solid #E5E7EB',
                    borderRadius: '12px',
                    background: autoAttributionConfig.periodeLabel === 'Mois actuel' ? '#EFF6FF' : 'white',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{fontSize: '2rem', marginBottom: '0.5rem'}}>📆</div>
                  <div style={{fontWeight: '600', marginBottom: '0.25rem'}}>Mois actuel</div>
                  <div style={{fontSize: '0.875rem', color: '#6B7280'}}>
                    {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                  </div>
                </button>

                {/* Mois suivant */}
                <button
                  onClick={() => {
                    const today = new Date();
                    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
                    const dateStr = nextMonth.toISOString().split('T')[0];
                    setAutoAttributionConfig({
                      ...autoAttributionConfig,
                      periode: 'mois',
                      periodeLabel: 'Mois suivant',
                      date: `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`
                    });
                  }}
                  style={{
                    padding: '1.5rem',
                    border: autoAttributionConfig.periodeLabel === 'Mois suivant' ? '3px solid #3B82F6' : '2px solid #E5E7EB',
                    borderRadius: '12px',
                    background: autoAttributionConfig.periodeLabel === 'Mois suivant' ? '#EFF6FF' : 'white',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{fontSize: '2rem', marginBottom: '0.5rem'}}>📆</div>
                  <div style={{fontWeight: '600', marginBottom: '0.25rem'}}>Mois suivant</div>
                  <div style={{fontSize: '0.875rem', color: '#6B7280'}}>
                    {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                  </div>
                </button>
              </div>
              
              <div style={{marginTop: '1.5rem', padding: '1rem', background: '#EFF6FF', borderRadius: '8px'}}>
                <p style={{margin: 0, fontSize: '0.875rem', color: '#1E40AF'}}>
                  💡 L'attribution automatique créera les assignations selon les règles configurées dans Paramètres.
                  {autoAttributionConfig.periode === 'mois' && ' Toutes les semaines du mois seront planifiées.'}
                </p>
              </div>

              {/* Choix du mode : Compléter ou Réinitialiser */}
              <div style={{marginTop: '1.5rem'}}>
                <h3 style={{marginBottom: '1rem', fontSize: '1rem', fontWeight: '600'}}>⚙️ Mode d'attribution</h3>
                
                <div style={{display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(2, 1fr)'}}>
                  {/* Option A : Compléter */}
                  <button
                    onClick={() => setAutoAttributionConfig({...autoAttributionConfig, mode: 'completer'})}
                    style={{
                      padding: '1rem',
                      border: autoAttributionConfig.mode === 'completer' ? '3px solid #10B981' : '2px solid #E5E7EB',
                      borderRadius: '8px',
                      background: autoAttributionConfig.mode === 'completer' ? '#ECFDF5' : 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>✅</div>
                    <div style={{fontWeight: '600', marginBottom: '0.25rem', color: '#10B981'}}>Compléter le planning</div>
                    <div style={{fontSize: '0.8rem', color: '#6B7280'}}>
                      Conserve les assignations existantes et complète les slots vides
                    </div>
                  </button>

                  {/* Option B : Réinitialiser */}
                  <button
                    onClick={() => setAutoAttributionConfig({...autoAttributionConfig, mode: 'reinitialiser'})}
                    style={{
                      padding: '1rem',
                      border: autoAttributionConfig.mode === 'reinitialiser' ? '3px solid #EF4444' : '2px solid #E5E7EB',
                      borderRadius: '8px',
                      background: autoAttributionConfig.mode === 'reinitialiser' ? '#FEF2F2' : 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>🔄</div>
                    <div style={{fontWeight: '600', marginBottom: '0.25rem', color: '#EF4444'}}>Réinitialiser complètement</div>
                    <div style={{fontSize: '0.8rem', color: '#6B7280'}}>
                      ⚠️ Supprime toutes les assignations AUTO et recommence
                    </div>
                  </button>
                </div>
              </div>
            </div>
            


            {/* Section Formatage Planning (DEMO uniquement) */}
            {tenantSlug === 'demo' && user?.role === 'admin' && (
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
                      🗑️ Formater le planning de {(() => {
                        const [year, month] = moisFormatage.split('-');
                        const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 
                                          'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
                        return `${monthNames[parseInt(month) - 1]} ${year}`;
                      })()}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="modal-actions">
              <Button variant="outline" onClick={() => setShowAutoAttributionModal(false)}>Annuler</Button>
              <Button 
                onClick={handleAttributionAuto}
                disabled={!autoAttributionConfig.periodeLabel}
                style={{
                  opacity: !autoAttributionConfig.periodeLabel ? 0.5 : 1,
                  background: autoAttributionConfig.mode === 'reinitialiser' ? '#EF4444' : '#3B82F6'
                }}
              >
                {autoAttributionConfig.mode === 'reinitialiser' ? '🔄 Réinitialiser et Attribuer' : '✨ Lancer l\'attribution'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rapport d'Heures */}
      {showRapportHeuresModal && (
        <RapportHeuresModal 
          isOpen={showRapportHeuresModal}
          onClose={() => setShowRapportHeuresModal(false)}
          tenantSlug={tenantSlug}
        />
      )}

      {/* Overlay de chargement Attribution Automatique */}
      {attributionLoading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '40px',
            maxWidth: '500px',
            width: '90%',
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
          }}>
            {/* Spinner animé */}
            <div style={{
              width: '80px',
              height: '80px',
              margin: '0 auto 24px',
              border: '6px solid #f3f4f6',
              borderTop: '6px solid #dc2626',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            
            {/* Message d'étape */}
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              color: '#1e293b',
              marginBottom: '12px'
            }}>
              Attribution en cours...
            </h2>
            
            <p style={{
              fontSize: '1rem',
              color: '#64748b',
              marginBottom: '24px',
              minHeight: '24px'
            }}>
              {attributionStep}
            </p>
            
            {/* Barre de progression visuelle */}
            <div style={{
              width: '100%',
              height: '4px',
              backgroundColor: '#f3f4f6',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                backgroundColor: '#dc2626',
                animation: 'progress 2s ease-in-out infinite'
              }}></div>
            </div>
            
            <p style={{
              fontSize: '0.875rem',
              color: '#94a3b8',
              marginTop: '20px',
              fontStyle: 'italic'
            }}>
              Veuillez patienter, cela peut prendre quelques instants...
            </p>
          </div>
        </div>
      )}

      {/* Modal d'Audit de l'Affectation - Nouveau Design */}
      <AuditModal
        isOpen={showAuditModal}
        onClose={() => setShowAuditModal(false)}
        assignation={selectedAuditAssignation}
        auditNotes={auditNotesEdit}
        onSaveNotes={handleSaveAuditNotes}
      />

    </div>
  );
};

// Remplacements Component optimisé - Gestion complète remplacements et congés

export default Planning;
