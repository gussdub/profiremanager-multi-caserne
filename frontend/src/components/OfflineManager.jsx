import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { useTenant } from '../contexts/TenantContext';
import { apiGet } from '../utils/api';
import offlineService from '../services/offlineService';

const OfflineManager = ({ tenant }) => {
  const { tenantSlug } = useTenant();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);
  const [stats, setStats] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const [inspectionsPlanifiees, setInspectionsPlanifiees] = useState([]);
  
  // Vérifier si le module prévention est actif
  const hasPreventionModule = tenant?.parametres?.module_prevention_active || false;

  // Vérifier le statut offline au chargement
  useEffect(() => {
    checkOfflineStatus();
    
    // Écouter les changements de connectivité
    const handleOnline = () => {
      setIsOnline(true);
      console.log('🟢 Connexion rétablie');
      autoSync();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      console.log('🔴 Mode offline activé');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const checkOfflineStatus = async () => {
    try {
      const ready = await offlineService.isOfflineReady();
      setOfflineReady(ready);
      
      const offlineStats = await offlineService.getOfflineStats();
      setStats(offlineStats);
    } catch (error) {
      console.error('Erreur vérification statut offline:', error);
    }
  };

  const handleShowConfirmPopup = async () => {
    setPreparing(true);
    try {
      // Récupérer les inspections planifiées
      const inspections = await offlineService.getInspectionsPlanifiees(tenantSlug, apiGet, 7);
      setInspectionsPlanifiees(inspections);
      
      if (inspections.length === 0) {
        alert('⚠️ Aucune inspection planifiée dans les 7 prochains jours.\n\nVous pouvez planifier des inspections depuis le module Prévention.');
        setPreparing(false);
        return;
      }
      
      setShowModal(false);
      setShowConfirmPopup(true);
    } catch (error) {
      console.error('Erreur récupération inspections:', error);
      alert('❌ Erreur: ' + error.message);
    } finally {
      setPreparing(false);
    }
  };

  const handlePrepareOffline = async () => {
    setPreparing(true);
    try {
      const result = await offlineService.prepareOfflineMode(tenantSlug, apiGet, 7);
      
      if (result.inspections === 0) {
        alert('⚠️ Aucune inspection planifiée à télécharger.');
      } else {
        alert(`✅ Mode offline prêt !\n\n📊 Données téléchargées :\n• ${result.inspections} inspection(s) planifiée(s)\n• ${result.batiments} bâtiment(s) (${result.nouveaux} nouveau(x))\n\nVous pouvez maintenant travailler sans connexion !`);
      }
      
      await checkOfflineStatus();
      setShowConfirmPopup(false);
    } catch (error) {
      console.error('Erreur préparation mode offline:', error);
      alert('❌ Erreur lors de la préparation du mode offline: ' + error.message);
    } finally {
      setPreparing(false);
    }
  };

  const autoSync = async () => {
    if (!isOnline) return;
    
    setSyncing(true);
    try {
      const { apiPost } = require('../utils/api');
      const result = await offlineService.syncPendingInspections(tenantSlug, apiPost);
      
      if (result.synced > 0) {
        console.log(`✅ ${result.synced} inspection(s) synchronisée(s)`);
      }
      
      await checkOfflineStatus();
    } catch (error) {
      console.error('Erreur synchronisation auto:', error);
    } finally {
      setSyncing(false);
    }
  };

  const handleManualSync = async () => {
    if (!isOnline) {
      alert('⚠️ Impossible de synchroniser : Vous êtes hors ligne');
      return;
    }
    
    setSyncing(true);
    try {
      const { apiPost } = require('../utils/api');
      const result = await offlineService.syncPendingInspections(tenantSlug, apiPost);
      
      if (result.success) {
        alert(`✅ Synchronisation réussie !\n\n${result.synced} inspection(s) synchronisée(s)`);
      } else {
        alert(`⚠️ Synchronisation partielle\n\n✅ ${result.synced} réussie(s)\n❌ ${result.errors.length} échec(s)`);
      }
      
      await checkOfflineStatus();
      setShowModal(false);
    } catch (error) {
      console.error('Erreur synchronisation:', error);
      alert('❌ Erreur lors de la synchronisation: ' + error.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      {/* Indicateur de statut (toujours visible, discret) */}
      <div style={{ 
        position: 'fixed', 
        top: '70px', 
        right: '20px', 
        zIndex: 1000,
        display: 'flex',
        gap: '8px',
        alignItems: 'center'
      }}>
        {/* Badge Online/Offline - Version discrète */}
        <div 
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: isOnline ? '#28a745' : '#dc3545',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            cursor: 'pointer',
            transition: 'transform 0.2s',
          }}
          onClick={() => setShowModal(true)}
          onMouseEnter={(e) => e.target.style.transform = 'scale(1.3)'}
          onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
          title={isOnline ? '🟢 En ligne - Cliquez pour gérer le mode offline' : '🔴 Hors ligne'}
        />

        {/* Badge inspections en attente - Petit et discret */}
        {stats && stats.pending_inspections > 0 && (
          <div 
            style={{
              background: '#ffc107',
              color: '#000',
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 'bold',
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              cursor: 'pointer'
            }} 
            onClick={() => setShowModal(true)}
            title="Cliquez pour synchroniser"
          >
            {stats.pending_inspections}
          </div>
        )}

        {/* Indicateur de synchronisation - Petit spinner */}
        {syncing && (
          <div style={{
            width: '16px',
            height: '16px',
            border: '2px solid #0dcaf0',
            borderTop: '2px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} title="Synchronisation en cours..." />
        )}
      </div>

      {/* Style pour l'animation du spinner */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Modal de gestion */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>{hasPreventionModule ? '📱 Gestion du mode offline' : '🌐 Indicateur réseau'}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div className="modal-body">
              {/* Si module prévention pas actif */}
              {!hasPreventionModule && (
                <div style={{ 
                  background: '#e7f3ff', 
                  padding: '20px', 
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '40px', marginBottom: '15px' }}>
                    {isOnline ? '🟢' : '🔴'}
                  </div>
                  <h3 style={{ marginTop: 0, marginBottom: '10px' }}>
                    {isOnline ? 'Vous êtes en ligne' : 'Mode hors ligne'}
                  </h3>
                  <p style={{ color: '#6c757d', fontSize: '14px', marginBottom: '15px' }}>
                    Cet indicateur affiche votre statut de connexion internet.
                  </p>
                  <div style={{ 
                    background: '#fff3cd', 
                    padding: '12px', 
                    borderRadius: '6px',
                    fontSize: '13px',
                    marginTop: '15px'
                  }}>
                    💡 <strong>Info :</strong> Les fonctionnalités offline ne sont pas disponibles pour votre compte. Contactez votre administrateur pour activer le module Prévention.
                  </div>
                </div>
              )}

              {/* Si module prévention actif, afficher les fonctionnalités */}
              {hasPreventionModule && (
                <>
              {/* Statut actuel */}
              <div style={{ 
                background: isOnline ? '#d1f2eb' : '#f8d7da', 
                padding: '15px', 
                borderRadius: '8px', 
                marginBottom: '20px',
                border: `2px solid ${isOnline ? '#28a745' : '#dc3545'}`
              }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                  {isOnline ? '🟢 Vous êtes en ligne' : '🔴 Mode offline activé'}
                </div>
                <div style={{ fontSize: '14px', color: '#6c757d' }}>
                  {isOnline 
                    ? 'Connexion internet disponible. Les données seront synchronisées automatiquement.' 
                    : 'Aucune connexion internet. Vous pouvez continuer à travailler en mode offline.'}
                </div>
              </div>

              {/* Statistiques */}
              {stats && (
                <div style={{ 
                  background: '#f8f9fa', 
                  padding: '15px', 
                  borderRadius: '8px', 
                  marginBottom: '20px' 
                }}>
                  <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px' }}>📊 Statistiques</h3>
                  <div style={{ display: 'grid', gap: '8px', fontSize: '14px' }}>
                    <div>✅ <strong>Bâtiments téléchargés:</strong> {stats.batiments}</div>
                    <div>📋 <strong>Grilles d'inspection:</strong> {stats.grilles}</div>
                    {stats.plans > 0 && <div>🗺️ <strong>Plans d'intervention:</strong> {stats.plans}</div>}
                    <div style={{ 
                      color: stats.pending_inspections > 0 ? '#ffc107' : '#28a745',
                      fontWeight: 'bold'
                    }}>
                      {stats.pending_inspections > 0 ? '⏳' : '✅'} <strong>Inspections en attente:</strong> {stats.pending_inspections}
                    </div>
                    {stats.last_offline_prep && (
                      <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '8px' }}>
                        📅 Dernière préparation: {new Date(stats.last_offline_prep).toLocaleString('fr-FR')}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Préparer mode offline */}
                <Button
                  onClick={handleShowConfirmPopup}
                  disabled={preparing || syncing}
                  style={{ 
                    width: '100%', 
                    padding: '15px',
                    background: '#0dcaf0',
                    fontSize: '15px'
                  }}
                >
                  {preparing ? '⏳ Chargement...' : '📥 Préparer le mode offline'}
                </Button>
                
                {/* Description */}
                <p style={{ 
                  fontSize: '12px', 
                  color: '#6c757d', 
                  margin: '5px 0 15px 0',
                  lineHeight: '1.5'
                }}>
                  💡 Télécharge toutes les fiches de bâtiments et grilles d'inspection pour travailler sans connexion
                </p>

                {/* Synchroniser manuellement */}
                {stats && stats.pending_inspections > 0 && (
                  <Button
                    onClick={handleManualSync}
                    disabled={!isOnline || syncing}
                    style={{ 
                      width: '100%', 
                      padding: '15px',
                      background: isOnline ? '#28a745' : '#6c757d',
                      fontSize: '15px'
                    }}
                  >
                    {syncing ? '🔄 Synchronisation...' : '🔄 Synchroniser maintenant'}
                  </Button>
                )}
              </div>

              {/* Aide */}
              <div style={{ 
                marginTop: '20px', 
                padding: '12px', 
                background: '#e7f3ff', 
                borderRadius: '6px',
                fontSize: '13px'
              }}>
                <strong>ℹ️ Comment ça marche ?</strong>
                <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', lineHeight: '1.6' }}>
                  <li>Cliquez sur "Préparer le mode offline" avant de partir sur terrain</li>
                  <li>Faites vos inspections normalement (même sans connexion)</li>
                  <li>Au retour, la synchronisation se fait automatiquement</li>
                </ul>
              </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Popup de confirmation avec liste des inspections */}
      {showConfirmPopup && (
        <div className="modal-overlay" onClick={() => setShowConfirmPopup(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h2>📥 Télécharger pour mode offline</h2>
              <button className="close-btn" onClick={() => setShowConfirmPopup(false)}>✕</button>
            </div>

            <div className="modal-body">
              <div style={{ background: '#e7f3ff', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                <strong>📊 {inspectionsPlanifiees.length} inspection(s) planifiée(s)</strong> dans les 7 prochains jours
              </div>

              {/* Liste des inspections */}
              <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '20px' }}>
                {inspectionsPlanifiees.map((insp, index) => (
                  <div key={index} style={{ 
                    background: '#f8f9fa', 
                    padding: '12px', 
                    borderRadius: '6px', 
                    marginBottom: '10px',
                    border: '1px solid #dee2e6'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                          🏢 {insp.batiment?.nom || 'Bâtiment inconnu'}
                        </div>
                        <div style={{ fontSize: '13px', color: '#6c757d' }}>
                          📅 {new Date(insp.date_planifiee).toLocaleDateString('fr-FR', { 
                            weekday: 'long', 
                            day: '2-digit', 
                            month: 'long' 
                          })}
                        </div>
                        {insp.batiment?.adresse && (
                          <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '2px' }}>
                            📍 {insp.batiment.adresse}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ 
                background: '#fff3cd', 
                padding: '12px', 
                borderRadius: '6px', 
                fontSize: '13px',
                marginBottom: '20px'
              }}>
                💡 <strong>Info :</strong> Seuls les bâtiments de ces inspections seront téléchargés
              </div>

              {/* Boutons d'action */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmPopup(false)}
                  disabled={preparing}
                >
                  Annuler
                </Button>
                <Button
                  onClick={handlePrepareOffline}
                  disabled={preparing}
                  style={{ background: '#28a745' }}
                >
                  {preparing ? '⏳ Téléchargement...' : `✅ Tout télécharger (${inspectionsPlanifiees.length})`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OfflineManager;
