import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { apiGet, apiPost, apiPut } from '../utils/api';

const Sidebar = ({ currentPage, setCurrentPage, tenant }) => {
  const { toast } = useToast();
  const { user, tenant: authTenant, logout } = useAuth();
  const { tenantSlug, switchTenant } = useTenant();
  
  // Afficher le bouton "Changer de caserne" sur mobile (écran < 768px) ou app native/standalone
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      const isMobile = window.innerWidth < 768 || 
        window.navigator.standalone === true || 
        window.matchMedia('(display-mode: standalone)').matches ||
        /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      setIsMobileDevice(isMobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showAllNotifications, setShowAllNotifications] = useState(false); // false = non lues seulement
  const [showRemplacementModal, setShowRemplacementModal] = useState(false);
  const [selectedDemandeRemplacement, setSelectedDemandeRemplacement] = useState(null);
  const [remplacementCommentaire, setRemplacementCommentaire] = useState('');
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  
  // Effet pour ajouter une classe au body quand le menu mobile est ouvert
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.classList.add('mobile-menu-open');
    } else {
      document.body.classList.remove('mobile-menu-open');
    }
    return () => {
      document.body.classList.remove('mobile-menu-open');
    };
  }, [isMobileMenuOpen]);
  
  // Paramètres de notifications (localStorage)
  const [notificationSettings, setNotificationSettings] = useState(() => {
    const saved = localStorage.getItem('notificationSettings');
    return saved ? JSON.parse(saved) : {
      soundEnabled: true,
      soundType: 'default',
      volume: 50,
      pushEnabled: true
    };
  });

  // Charger les notifications
  const loadNotifications = async () => {
    if (!tenantSlug || !user) return;
    
    // Ne charger les notifications que pour les utilisateurs non-employés de base
    // Les pompiers temps partiel peuvent recevoir des notifications (remplacements, disponibilités)
    if (['employe', 'pompier'].includes(user.role) && user.type_emploi !== 'temps_partiel') return;
    
    try {
      const notificationsData = await apiGet(tenantSlug, '/notifications');
      setNotifications(notificationsData);
      
      const countData = await apiGet(tenantSlug, '/notifications/non-lues/count');
      setUnreadCount(countData.count);
    } catch (error) {
      console.error('Erreur chargement notifications:', error);
    }
  };

  // Charger au montage et toutes les 30 secondes
  useEffect(() => {
    if (user) {
      loadNotifications();
      const interval = setInterval(loadNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [user, tenantSlug]);

  // Ouvrir le modal de détails de demande de remplacement
  const openRemplacementModal = async (demande_id) => {
    try {
      const demande = await apiGet(tenantSlug, `/remplacements/${demande_id}`);
      setSelectedDemandeRemplacement(demande);
      setRemplacementCommentaire('');
      setShowRemplacementModal(true);
    } catch (error) {
      console.error('Erreur chargement demande:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les détails de la demande",
        variant: "destructive"
      });
    }
  };

  // Accepter une demande de remplacement
  const handleAccepterRemplacement = async () => {
    if (!selectedDemandeRemplacement) return;
    
    try {
      await apiPost(
        tenantSlug,
        `/remplacements/${selectedDemandeRemplacement.id}/accepter`,
        { commentaire: remplacementCommentaire }
      );
      
      toast({
        title: "✅ Remplacement accepté",
        description: "Vous avez été assigné à cette garde. Le demandeur a été notifié.",
      });
      
      setShowRemplacementModal(false);
      setSelectedDemandeRemplacement(null);
      loadNotifications();
      
    } catch (error) {
      console.error('Erreur acceptation remplacement:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible d'accepter la demande",
        variant: "destructive"
      });
    }
  };

  // Refuser une demande de remplacement
  const handleRefuserRemplacement = async () => {
    if (!selectedDemandeRemplacement) return;
    
    try {
      await apiPost(
        tenantSlug,
        `/remplacements/${selectedDemandeRemplacement.id}/refuser`,
        { raison: remplacementCommentaire || "Non disponible" }
      );
      
      toast({
        title: "Demande refusée",
        description: "Le demandeur a été notifié de votre refus.",
      });
      
      setShowRemplacementModal(false);
      setSelectedDemandeRemplacement(null);
      loadNotifications();
      
    } catch (error) {
      console.error('Erreur refus remplacement:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de refuser la demande",
        variant: "destructive"
      });
    }
  };

  // Jouer un son quand il y a de nouvelles notifications
  useEffect(() => {
    if (unreadCount > 0) {
      // Vérifier s'il y a une notification urgente (remplacement)
      const hasUrgent = notifications.some(n => !n.lu && (n.urgent || n.type === 'remplacement_proposition'));
      if (hasUrgent) {
        // Jouer le son urgent plus fort
        playNotificationSound({ ...notificationSettings, soundType: 'urgent', volume: Math.min(notificationSettings.volume * 1.5, 100) });
      } else {
        playNotificationSound();
      }
    }
  }, [unreadCount]);

  const marquerCommeLue = async (notifId) => {
    try {
      await apiPut(tenantSlug, `/notifications/${notifId}/marquer-lu`, {});
      loadNotifications();
    } catch (error) {
      console.error('Erreur marquage notification:', error);
    }
  };

  const marquerToutesLues = async () => {
    try {
      await apiPut(tenantSlug, '/notifications/marquer-toutes-lues', {});
      loadNotifications();
    } catch (error) {
      console.error('Erreur marquage toutes notifications:', error);
    }
  };
  
  // Jouer le son de notification
  const playNotificationSound = (customSettings = null) => {
    const settings = customSettings || notificationSettings;
    
    if (!settings.soundEnabled) return;
    
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const gainNode = audioContext.createGain();
      gainNode.connect(audioContext.destination);
      
      // Configuration des sonneries - MINIMUM 2 secondes
      const soundConfigs = {
        default: { 
          freqs: [523.25, 659.25, 783.99, 659.25, 523.25, 659.25, 783.99, 1046.50], 
          duration: 2.0, 
          noteLength: 0.25,
          volumeMultiplier: 1.2 
        },
        chime: { 
          freqs: [659.25, 783.99, 1046.50, 783.99, 659.25, 783.99, 1046.50, 1318.51], 
          duration: 2.0, 
          noteLength: 0.25,
          volumeMultiplier: 1.3 
        },
        bell: { 
          freqs: [830.61, 987.77, 830.61, 987.77, 830.61, 987.77, 1174.66, 987.77], 
          duration: 2.0, 
          noteLength: 0.25,
          volumeMultiplier: 1.4 
        },
        doorbell: { 
          freqs: [523, 659, 784, 1047, 784, 659, 523, 659, 784, 1047], 
          duration: 2.5, 
          noteLength: 0.25,
          volumeMultiplier: 1.5 
        },
        triple: { 
          freqs: [784, 988, 1175, 988, 784, 988, 1175, 1319, 1175, 988], 
          duration: 2.5, 
          noteLength: 0.25,
          volumeMultiplier: 1.6 
        },
        alert: { 
          freqs: [1000, 800, 1000, 800, 1000, 800, 1000, 800], 
          duration: 2.4, 
          noteLength: 0.3,
          volumeMultiplier: 1.8,
          waveType: 'triangle'
        },
        alarm: { 
          freqs: [880, 1100, 880, 1100, 880, 1100, 880, 1100, 880, 1100], 
          duration: 3.0, 
          noteLength: 0.3,
          volumeMultiplier: 1.9,
          waveType: 'square'
        },
        siren: { 
          freqs: [600, 900, 600, 900, 600, 900, 600, 900, 600, 900, 600, 900], 
          duration: 3.5, 
          noteLength: 0.28,
          volumeMultiplier: 1.8,
          waveType: 'sawtooth'
        },
        emergency: { 
          freqs: [1200, 800, 1200, 800, 1200, 800, 1200, 800, 1200, 800, 1200, 800, 1200, 800], 
          duration: 4.0, 
          noteLength: 0.28,
          volumeMultiplier: 2.0,
          waveType: 'square'
        },
        urgent: { 
          freqs: [880, 1100, 880, 1100, 880, 1100, 880, 1100, 880, 1100], 
          duration: 3.0, 
          noteLength: 0.3,
          volumeMultiplier: 2.0,
          waveType: 'square'
        }
      };
      
      const config = soundConfigs[settings.soundType] || soundConfigs.default;
      const { freqs, duration, noteLength, volumeMultiplier, waveType } = config;
      
      // Créer l'oscillateur avec le bon type d'onde
      const oscillator = audioContext.createOscillator();
      oscillator.type = waveType || 'sine';
      oscillator.connect(gainNode);
      
      // Volume ajusté avec le multiplicateur
      const baseVolume = (settings.volume / 100) * volumeMultiplier;
      const clampedVolume = Math.min(baseVolume, 1.5); // Limiter pour éviter la saturation
      
      gainNode.gain.setValueAtTime(clampedVolume * 0.5, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      
      // Jouer les fréquences en séquence
      oscillator.frequency.setValueAtTime(freqs[0], audioContext.currentTime);
      freqs.forEach((freq, index) => {
        if (index > 0) {
          oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + (index * noteLength));
        }
      });
      
      // Démarrer et arrêter proprement
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);
      
      // Fermer le contexte audio après la fin
      setTimeout(() => {
        audioContext.close().catch(() => {});
      }, (duration + 0.1) * 1000);
      
    } catch (error) {
      console.error('Erreur lecture son:', error);
    }
  };
  
  // Sauvegarder les paramètres
  const saveNotificationSettings = (newSettings) => {
    setNotificationSettings(newSettings);
    localStorage.setItem('notificationSettings', JSON.stringify(newSettings));
    toast({
      title: "✅ Paramètres sauvegardés",
      description: "Vos préférences de notification ont été enregistrées"
    });
  };

  const menuItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: '📊', roles: ['admin', 'superviseur', 'employe', 'pompier'] },
    { id: 'personnel', label: 'Personnel', icon: '👥', roles: ['admin', 'superviseur'] },
    { id: 'actifs', label: 'Gestion des Actifs', icon: '🚒', roles: ['admin', 'superviseur', 'employe', 'pompier'] },
    { id: 'planning', label: 'Planning', icon: '📅', roles: ['admin', 'superviseur', 'employe', 'pompier'] },
    { id: 'disponibilites', label: 'Mes disponibilités', icon: '📋', roles: ['admin', 'superviseur', 'employe', 'pompier'] },
    { id: 'remplacements', label: 'Remplacements', icon: '🔄', roles: ['admin', 'superviseur', 'employe', 'pompier'] },
    { id: 'formations', label: 'Formations', icon: '📚', roles: ['admin', 'superviseur', 'employe', 'pompier'] },
    { id: 'prevention', label: 'Prévention', icon: '🔥', roles: ['admin'] },
    { id: 'rapports', label: 'Rapports', icon: '📈', roles: ['admin'] },
    { id: 'parametres', label: 'Paramètres', icon: '⚙️', roles: ['admin'] },
    { id: 'mesepi', label: 'Mes EPI', icon: '🛡️', roles: ['admin', 'superviseur', 'employe', 'pompier'] },
    { id: 'monprofil', label: 'Mon profil', icon: '👤', roles: ['admin', 'superviseur', 'employe', 'pompier'] }
  ];

  const filteredMenuItems = menuItems.filter(item => {
    if (!item.roles.includes(user?.role)) return false;
    if (item.id === 'disponibilites' && !['temps_partiel', 'temporaire'].includes(user?.type_emploi) && !['admin', 'superviseur'].includes(user?.role)) return false;
    if (item.id === 'prevention' && !authTenant?.parametres?.module_prevention_active) return false;
    return true;
  });

  return (
    <>
      {/* Notifications dropdown - s'affiche depuis le bouton dans le sidebar */}
      {showNotifications && (
        <div 
          className="notifications-overlay"
          onClick={() => setShowNotifications(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 998
          }}
        />
      )}

      {showNotifications && (
        <div className="notifications-dropdown" style={{ 
          zIndex: 999,
          position: 'fixed',
          bottom: '80px',
          left: '20px',
          maxHeight: '70vh'
        }}>
          <div className="notifications-header">
            <h3>Notifications</h3>
            <div style={{display: 'flex', gap: '0.5rem'}}>
              <button 
                onClick={() => setShowNotificationSettings(!showNotificationSettings)} 
                className="notification-settings-btn"
                title="Paramètres des notifications"
              >
                ⚙️
              </button>
              {unreadCount > 0 && (
                <button onClick={marquerToutesLues} className="mark-all-read">
                  Tout marquer comme lu
                </button>
              )}
            </div>
          </div>
            
            {showNotificationSettings && (
              <div className="notification-settings" style={{
                padding: '1rem',
                background: '#f8fafc',
                borderBottom: '1px solid #e5e7eb',
                borderRadius: '8px',
                margin: '0.5rem'
              }}>
                <h4 style={{marginBottom: '1rem', fontSize: '0.9rem', fontWeight: '600'}}>⚙️ Paramètres des notifications</h4>
                
                <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={notificationSettings.soundEnabled}
                      onChange={(e) => saveNotificationSettings({...notificationSettings, soundEnabled: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <span style={{fontSize: '0.85rem'}}>🔔 Activer les sons</span>
                  </label>
                  
                  {notificationSettings.soundEnabled && (
                    <>
                      <div>
                        <label style={{fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem'}}>🎵 Type de son</label>
                        <select
                          value={notificationSettings.soundType}
                          onChange={(e) => {
                            const newSettings = {...notificationSettings, soundType: e.target.value};
                            saveNotificationSettings(newSettings);
                            setTimeout(() => playNotificationSound(newSettings), 100);
                          }}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            fontSize: '0.85rem'
                          }}
                        >
                          <option value="default">Son par défaut</option>
                          <option value="chime">Carillon</option>
                          <option value="bell">Cloche</option>
                          <option value="doorbell">Sonnette</option>
                          <option value="triple">Triple tonalité</option>
                          <option value="alert">⚠️ Alerte</option>
                          <option value="alarm">🔔 Alarme (fort)</option>
                          <option value="siren">🚨 Sirène (long)</option>
                          <option value="emergency">🚒 Urgence (très fort)</option>
                        </select>
                      </div>
                      
                      <div>
                        <label style={{fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem'}}>
                          🔊 Volume ({notificationSettings.volume}%)
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={notificationSettings.volume}
                          onChange={(e) => saveNotificationSettings({...notificationSettings, volume: parseInt(e.target.value)})}
                          style={{width: '100%'}}
                        />
                      </div>
                    </>
                  )}
                  
                  <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={notificationSettings.pushEnabled}
                      onChange={(e) => saveNotificationSettings({...notificationSettings, pushEnabled: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <span style={{fontSize: '0.85rem'}}>📱 Notifications push du navigateur</span>
                  </label>
                </div>
              </div>
            )}

            {/* Boutons de filtre */}
            <div style={{
              display: 'flex',
              gap: '8px',
              padding: '10px 15px',
              borderBottom: '1px solid #e5e7eb',
              background: '#f9fafb'
            }}>
              <button
                onClick={() => setShowAllNotifications(false)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: !showAllNotifications ? '#1e3a5f' : '#e5e7eb',
                  color: !showAllNotifications ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
                data-testid="filter-unread-btn"
              >
                🔔 Non lues {unreadCount > 0 && `(${unreadCount})`}
              </button>
              <button
                onClick={() => setShowAllNotifications(true)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: showAllNotifications ? '#1e3a5f' : '#e5e7eb',
                  color: showAllNotifications ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
                data-testid="filter-all-btn"
              >
                📜 Historique
              </button>
            </div>

            <div className="notifications-list">
              {(() => {
                const filteredNotifications = showAllNotifications 
                  ? notifications 
                  : notifications.filter(n => n.statut === 'non_lu');
                
                if (filteredNotifications.length === 0) {
                  return (
                    <div className="no-notifications">
                      <i className="fas fa-inbox"></i>
                      <p>{showAllNotifications ? 'Aucune notification dans l\'historique' : 'Aucune notification non lue'}</p>
                      {!showAllNotifications && notifications.length > 0 && (
                        <button
                          onClick={() => setShowAllNotifications(true)}
                          style={{
                            marginTop: '10px',
                            padding: '8px 16px',
                            background: '#1e3a5f',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            cursor: 'pointer'
                          }}
                        >
                          📜 Voir l'historique
                        </button>
                      )}
                    </div>
                  );
                }
                
                return filteredNotifications.map(notif => (
                  <div 
                    key={notif.id}
                    className={`notification-item ${notif.statut === 'non_lu' ? 'unread' : ''}`}
                  >
                    <div 
                      onClick={() => {
                        marquerCommeLue(notif.id);
                        setShowNotifications(false);
                        
                        switch (notif.type) {
                          case 'remplacement_disponible':
                            if (notif.data?.demande_id) {
                              openRemplacementModal(notif.data.demande_id);
                            } else {
                              setCurrentPage('remplacements');
                            }
                            break;
                          case 'remplacement_accepte':
                          case 'remplacement_refuse':
                          case 'remplacement_demande':
                          case 'remplacement_pourvu':
                          case 'remplacement_expire':
                            setCurrentPage('remplacements');
                            // Si on a l'ID de la demande, naviguer vers celle-ci
                            if (notif.data?.demande_id) {
                              setTimeout(() => {
                                window.dispatchEvent(new CustomEvent('openDemandeRemplacementQuart', { 
                                  detail: { demandeId: notif.data.demande_id } 
                                }));
                              }, 300);
                            }
                            break;
                          case 'planning_assigne':
                          case 'planning_modifie':
                            setCurrentPage('planning');
                            // Si on a la date du quart, naviguer vers cette date et ouvrir le modal
                            if (notif.data?.date) {
                              setTimeout(() => {
                                window.dispatchEvent(new CustomEvent('openPlanningDate', { 
                                  detail: { 
                                    date: notif.data.date,
                                    assignationId: notif.data.assignation_id
                                  } 
                                }));
                              }, 300);
                            }
                            break;
                          case 'conge_approuve':
                          case 'conge_refuse':
                          case 'conge_demande':
                            setCurrentPage('remplacements'); // Les congés sont gérés dans le module Remplacements
                            // Si on a l'ID de la demande, naviguer vers l'onglet congés
                            setTimeout(() => {
                              window.dispatchEvent(new CustomEvent('openDemandeConge', { 
                                detail: { demandeId: notif.data?.demande_id } 
                              }));
                            }, 300);
                            break;
                          case 'formation_assignee':
                          case 'formation_rappel':
                          case 'formation_liste_attente':
                            setCurrentPage('formations');
                            // Si on a l'ID de la formation, l'ouvrir directement
                            if (notif.data?.formation_id) {
                              setTimeout(() => {
                                window.dispatchEvent(new CustomEvent('openFormationDetail', { 
                                  detail: { formationId: notif.data.formation_id } 
                                }));
                              }, 300);
                            }
                            break;
                          // EPI et équipements
                          case 'demande_remplacement_epi':
                          case 'reponse_demande_remplacement_epi':
                            setCurrentPage('actifs');
                            // Naviguer vers l'onglet EPI et ouvrir la demande spécifique
                            setTimeout(() => {
                              window.dispatchEvent(new CustomEvent('navigateToTab', { detail: { tab: 'epi' } }));
                              // Si on a l'ID de la demande, l'ouvrir directement
                              if (notif.data?.demande_id) {
                                setTimeout(() => {
                                  window.dispatchEvent(new CustomEvent('openDemandeRemplacement', { 
                                    detail: { demandeId: notif.data.demande_id } 
                                  }));
                                }, 300);
                              }
                            }, 100);
                            break;
                          case 'epi_defaut':
                          case 'epi_reparation_terminee':
                            setCurrentPage('actifs');
                            setTimeout(() => {
                              window.dispatchEvent(new CustomEvent('navigateToTab', { detail: { tab: 'epi' } }));
                              // Si on a l'ID de l'EPI, naviguer vers l'inventaire et l'ouvrir
                              if (notif.data?.epi_id) {
                                setTimeout(() => {
                                  window.dispatchEvent(new CustomEvent('openEPIDetail', { 
                                    detail: { epiId: notif.data.epi_id } 
                                  }));
                                }, 300);
                              }
                            }, 100);
                            break;
                          case 'epi_nouvel_assignation':
                            // Rediriger vers "Mes EPI" pour les nouvelles assignations
                            setCurrentPage('mesepi');
                            break;
                          case 'epi_inspection':
                          case 'epi_alerte':
                            setCurrentPage('actifs');
                            setTimeout(() => {
                              window.dispatchEvent(new CustomEvent('navigateToTab', { detail: { tab: 'epi' } }));
                              // Si on a l'ID de l'EPI, l'ouvrir directement
                              if (notif.data?.epi_id) {
                                setTimeout(() => {
                                  window.dispatchEvent(new CustomEvent('openEPIDetail', { 
                                    detail: { epiId: notif.data.epi_id, action: 'inspect' } 
                                  }));
                                }, 300);
                              }
                            }, 100);
                            break;
                          case 'equipement_alerte':
                          case 'equipement_inspection':
                          case 'inspection_alerte':
                            setCurrentPage('actifs');
                            setTimeout(() => {
                              window.dispatchEvent(new CustomEvent('navigateToTab', { detail: { tab: 'equipements' } }));
                              // Si on a l'ID de l'équipement, l'ouvrir
                              if (notif.data?.equipement_id) {
                                setTimeout(() => {
                                  window.dispatchEvent(new CustomEvent('openEquipementDetail', { 
                                    detail: { equipementId: notif.data.equipement_id } 
                                  }));
                                }, 300);
                              }
                            }, 100);
                            break;
                          case 'borne_seche':
                          case 'point_eau':
                          case 'borne_seche_inspection':
                            setCurrentPage('actifs');
                            setTimeout(() => {
                              window.dispatchEvent(new CustomEvent('navigateToTab', { detail: { tab: 'eau' } }));
                              if (notif.data?.borne_id || notif.data?.point_eau_id) {
                                setTimeout(() => {
                                  window.dispatchEvent(new CustomEvent('openPointEauDetail', { 
                                    detail: { pointEauId: notif.data.borne_id || notif.data.point_eau_id } 
                                  }));
                                }, 300);
                              }
                            }, 100);
                            break;
                          case 'vehicule_inspection':
                          case 'vehicule_inventaire':
                            setCurrentPage('actifs');
                            setTimeout(() => {
                              window.dispatchEvent(new CustomEvent('navigateToTab', { detail: { tab: 'vehicules' } }));
                              if (notif.data?.vehicule_id) {
                                setTimeout(() => {
                                  window.dispatchEvent(new CustomEvent('openVehiculeDetail', { 
                                    detail: { vehiculeId: notif.data.vehicule_id } 
                                  }));
                                }, 300);
                              }
                            }, 100);
                            break;
                          case 'prevention':
                          case 'prevention_alerte':
                            setCurrentPage('prevention');
                            break;
                          default:
                            // Utiliser le lien s'il est défini
                            if (notif.lien) {
                              const pageName = notif.lien.replace(/^\//, '').split('/')[0];
                              if (pageName === 'gestion-epi' || pageName === 'epi') {
                                setCurrentPage('actifs');
                                setTimeout(() => {
                                  window.dispatchEvent(new CustomEvent('navigateToTab', { detail: { tab: 'epi' } }));
                                  // Ouvrir la demande spécifique si l'ID est disponible
                                  if (notif.data?.demande_id) {
                                    setTimeout(() => {
                                      window.dispatchEvent(new CustomEvent('openDemandeRemplacement', { 
                                        detail: { demandeId: notif.data.demande_id } 
                                      }));
                                    }, 300);
                                  } else if (notif.data?.epi_id) {
                                    setTimeout(() => {
                                      window.dispatchEvent(new CustomEvent('openEPIDetail', { 
                                        detail: { epiId: notif.data.epi_id } 
                                      }));
                                    }, 300);
                                  }
                                }, 100);
                              } else if (pageName === 'actifs' || pageName === 'equipements') {
                                setCurrentPage('actifs');
                                if (notif.data?.equipement_id) {
                                  setTimeout(() => {
                                    window.dispatchEvent(new CustomEvent('navigateToTab', { detail: { tab: 'equipements' } }));
                                    setTimeout(() => {
                                      window.dispatchEvent(new CustomEvent('openEquipementDetail', { 
                                        detail: { equipementId: notif.data.equipement_id } 
                                      }));
                                    }, 300);
                                  }, 100);
                                }
                              } else if (pageName === 'remplacements') {
                                setCurrentPage('remplacements');
                                // Pourrait ouvrir un modal de demande spécifique ici aussi
                              } else if (pageName) {
                                setCurrentPage(pageName);
                              }
                            }
                        }
                      }}
                      style={{ cursor: 'pointer', flex: 1 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                        <div className="notification-icon">
                          {notif.type === 'remplacement_demande' && '🔄'}
                          {notif.type === 'remplacement_disponible' && '🔔'}
                          {notif.type === 'remplacement_accepte' && '✅'}
                          {notif.type === 'remplacement_pourvu' && 'ℹ️'}
                          {notif.type === 'remplacement_expire' && '⏰'}
                          {notif.type === 'conge_approuve' && '✅'}
                          {notif.type === 'conge_refuse' && '❌'}
                          {notif.type === 'conge_demande' && '📝'}
                          {notif.type === 'planning_assigne' && '📅'}
                          {notif.type === 'planning_modifie' && '📅'}
                          {notif.type === 'demande_remplacement_epi' && '🦺'}
                          {notif.type === 'reponse_demande_remplacement_epi' && '🔄'}
                          {notif.type === 'epi_inspection' && '📋'}
                          {notif.type === 'epi_alerte' && '⚠️'}
                          {notif.type === 'epi_defaut' && '⚠️'}
                          {notif.type === 'epi_nouvel_assignation' && '🦺'}
                          {notif.type === 'epi_reparation_terminee' && '✅'}
                          {notif.type === 'equipement_alerte' && '🔧'}
                          {notif.type === 'equipement_inspection' && '📋'}
                          {notif.type === 'inspection_alerte' && '⚠️'}
                          {notif.type === 'borne_seche' && '🚒'}
                          {notif.type === 'point_eau' && '💧'}
                          {notif.type === 'vehicule_inspection' && '🚒'}
                          {notif.type === 'vehicule_inventaire' && '📦'}
                          {notif.type === 'prevention' && '🔥'}
                          {notif.type === 'formation_assignee' && '📚'}
                          {notif.type === 'formation_rappel' && '⏰'}
                          {notif.type === 'formation_liste_attente' && '⏳'}
                        </div>
                        <div className="notification-content" style={{ flex: 1 }}>
                          <h4>{notif.titre}</h4>
                          <p>{notif.message}</p>
                          <span className="notification-time">
                            {new Date(notif.date_creation).toLocaleString('fr-FR')}
                          </span>
                          
                          {notif.type === 'remplacement_disponible' && notif.data?.demande_id && (
                            <div style={{ 
                              display: 'flex', 
                              gap: '8px', 
                              marginTop: '10px',
                              paddingTop: '10px',
                              borderTop: '1px solid #e5e7eb'
                            }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRemplacementModal(notif.data.demande_id);
                                  setShowNotifications(false);
                                }}
                                style={{
                                  flex: 1,
                                  padding: '6px 12px',
                                  background: '#10b981',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontSize: '0.85rem',
                                  fontWeight: '600',
                                  cursor: 'pointer'
                                }}
                              >
                                ✅ Accepter
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRemplacementModal(notif.data.demande_id);
                                  setShowNotifications(false);
                                }}
                                style={{
                                  flex: 1,
                                  padding: '6px 12px',
                                  background: '#6b7280',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontSize: '0.85rem',
                                  fontWeight: '600',
                                  cursor: 'pointer'
                                }}
                              >
                                📋 Voir détails
                              </button>
                            </div>
                          )}
                        </div>
                        {notif.statut === 'non_lu' && (
                          <div className="notification-dot"></div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      {/* Mobile hamburger button */}
      <button 
        className="mobile-menu-toggle"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        data-testid="mobile-menu-toggle"
      >
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
      </button>

      <div 
        className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}
      >
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-flame">
              <div className="flame-container">
                <i className="fas fa-fire flame-icon"></i>
              </div>
            </div>
            <div>
              <h2>ProFireManager</h2>
              <p className="version">v2.0 Avancé</p>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {filteredMenuItems.map(item => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => {
                setCurrentPage(item.id);
                setIsMobileMenuOpen(false);
              }}
              data-testid={`nav-${item.id}-btn`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="user-info">
            <div className="user-avatar">
              {user?.photo_profil ? (
                <img 
                  src={user.photo_profil} 
                  alt="Photo de profil"
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover',
                    borderRadius: '50%'
                  }}
                />
              ) : (
                <span className="user-icon">👤</span>
              )}
            </div>
            <div className="user-details">
              <p className="user-name">{user?.prenom} {user?.nom}</p>
              <p className="user-role">{user?.role === 'admin' ? 'Administrateur' : 
                                      user?.role === 'superviseur' ? 'Superviseur' : 'Employé'}</p>
              <p className="user-grade">{user?.grade}</p>
            </div>
          </div>
          <div className="sidebar-user-actions" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
            {/* Bouton Notifications dans le sidebar */}
            <Button 
              variant="outline" 
              onClick={() => setShowNotifications(!showNotifications)}
              className={`notification-sidebar-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
              data-testid="notification-bell"
              style={{ 
                fontSize: '0.85rem', 
                padding: '0.5rem 0.75rem',
                background: unreadCount > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.1)',
                border: unreadCount > 0 ? '2px solid #EF4444' : '1px solid rgba(255,255,255,0.2)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                position: 'relative',
                animation: unreadCount > 0 ? 'pulse-notification 2s infinite' : 'none'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🔔 Notifications
                {unreadCount > 0 && (
                  <span style={{
                    background: '#EF4444',
                    color: 'white',
                    borderRadius: '50%',
                    minWidth: '22px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)',
                    animation: 'badge-pulse 1.5s infinite'
                  }}>
                    {unreadCount}
                  </span>
                )}
              </span>
            </Button>
            
            {isMobileDevice && (
              <Button 
                variant="outline" 
                onClick={() => {
                  if (switchTenant) {
                    switchTenant();
                  } else {
                    localStorage.removeItem('profiremanager_last_tenant');
                    window.location.href = '/';
                  }
                  setIsMobileMenuOpen(false);
                }}
                className="switch-tenant-btn"
                style={{ 
                  fontSize: '0.85rem', 
                  padding: '0.5rem 0.75rem',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: 'white'
                }}
              >
                🏢 Changer de caserne
              </Button>
            )}
            <Button 
              variant="ghost" 
              onClick={() => {
                logout();
                setIsMobileMenuOpen(false);
              }}
              className="logout-btn"
              data-testid="logout-btn"
            >
              🚪 Déconnexion
            </Button>
          </div>
        </div>
      </div>
      
      {isMobileMenuOpen && (
        <div 
          className="mobile-close-area"
          onClick={() => setIsMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99997,
            background: 'rgba(0, 0, 0, 0.6)',
            cursor: 'pointer'
          }}
        ></div>
      )}

      {/* Modal Remplacement */}
      {showRemplacementModal && selectedDemandeRemplacement && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>🔄 Détails du remplacement</h2>
              <button className="modal-close" onClick={() => setShowRemplacementModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '1rem' }}>
                <p><strong>Demandeur:</strong> {selectedDemandeRemplacement.demandeur_nom}</p>
                <p><strong>Date:</strong> {selectedDemandeRemplacement.date_garde}</p>
                <p><strong>Poste:</strong> {selectedDemandeRemplacement.poste}</p>
                <p><strong>Raison:</strong> {selectedDemandeRemplacement.raison}</p>
              </div>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Commentaire (optionnel):
                </label>
                <textarea
                  value={remplacementCommentaire}
                  onChange={(e) => setRemplacementCommentaire(e.target.value)}
                  placeholder="Ajoutez un commentaire..."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    minHeight: '80px'
                  }}
                />
              </div>
            </div>
            <div className="modal-actions" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setShowRemplacementModal(false)}>
                Annuler
              </Button>
              <Button 
                variant="outline" 
                onClick={handleRefuserRemplacement}
                style={{ color: '#ef4444', borderColor: '#ef4444' }}
              >
                ❌ Refuser
              </Button>
              <Button onClick={handleAccepterRemplacement}>
                ✅ Accepter
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
