// Service de gestion du mode offline avec IndexedDB
import { openDB } from 'idb';

const DB_NAME = 'ProFireManagerOffline';
const DB_VERSION = 1;

// Initialiser la base de données IndexedDB
export const initOfflineDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Store pour les bâtiments
      if (!db.objectStoreNames.contains('batiments')) {
        db.createObjectStore('batiments', { keyPath: 'id' });
      }
      
      // Store pour les grilles d'inspection
      if (!db.objectStoreNames.contains('grilles_inspection')) {
        db.createObjectStore('grilles_inspection', { keyPath: 'id' });
      }
      
      // Store pour les plans d'intervention
      if (!db.objectStoreNames.contains('plans_intervention')) {
        db.createObjectStore('plans_intervention', { keyPath: 'id' });
      }
      
      // Store pour les inspections en attente de synchronisation
      if (!db.objectStoreNames.contains('inspections_pending')) {
        const store = db.createObjectStore('inspections_pending', { keyPath: 'local_id', autoIncrement: true });
        store.createIndex('synced', 'synced');
        store.createIndex('created_at', 'created_at');
      }
      
      // Store pour les métadonnées (dernière sync, etc.)
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
    },
  });
};

// Sauvegarder des données dans un store
export const saveToStore = async (storeName, data) => {
  const db = await initOfflineDB();
  const tx = db.transaction(storeName, 'readwrite');
  
  if (Array.isArray(data)) {
    // Sauvegarder plusieurs items
    await Promise.all(data.map(item => tx.store.put(item)));
  } else {
    // Sauvegarder un seul item
    await tx.store.put(data);
  }
  
  await tx.done;
};

// Récupérer toutes les données d'un store
export const getAllFromStore = async (storeName) => {
  const db = await initOfflineDB();
  return db.getAll(storeName);
};

// Récupérer un item spécifique
export const getFromStore = async (storeName, id) => {
  const db = await initOfflineDB();
  return db.get(storeName, id);
};

// Supprimer un item
export const deleteFromStore = async (storeName, id) => {
  const db = await initOfflineDB();
  await db.delete(storeName, id);
};

// Vider complètement un store
export const clearStore = async (storeName) => {
  const db = await initOfflineDB();
  await db.clear(storeName);
};

// Sauvegarder les métadonnées
export const saveMetadata = async (key, value) => {
  await saveToStore('metadata', { key, value, updated_at: new Date().toISOString() });
};

// Récupérer les métadonnées
export const getMetadata = async (key) => {
  const data = await getFromStore('metadata', key);
  return data ? data.value : null;
};

// Télécharger toutes les données pour le mode offline
export const prepareOfflineMode = async (tenantSlug, apiGet) => {
  try {
    console.log('📥 Téléchargement des données pour mode offline...');
    
    // Télécharger les bâtiments
    console.log('📥 Téléchargement des bâtiments...');
    const batiments = await apiGet(tenantSlug, '/prevention/batiments');
    await clearStore('batiments');
    await saveToStore('batiments', batiments);
    console.log(`✅ ${batiments.length} bâtiments téléchargés`);
    
    // Télécharger les grilles d'inspection
    console.log('📥 Téléchargement des grilles d\'inspection...');
    const grilles = await apiGet(tenantSlug, '/prevention/grilles-inspection');
    await clearStore('grilles_inspection');
    await saveToStore('grilles_inspection', grilles);
    console.log(`✅ ${grilles.length} grilles téléchargées`);
    
    // Télécharger les plans d'intervention (optionnel)
    try {
      console.log('📥 Téléchargement des plans d\'intervention...');
      const plans = await apiGet(tenantSlug, '/prevention/plans-intervention');
      await clearStore('plans_intervention');
      await saveToStore('plans_intervention', plans);
      console.log(`✅ ${plans.length} plans téléchargés`);
    } catch (e) {
      console.log('⚠️ Plans d\'intervention non disponibles (optionnel)');
    }
    
    // Sauvegarder la date de dernière synchronisation
    await saveMetadata('last_offline_prep', new Date().toISOString());
    await saveMetadata('tenant_slug', tenantSlug);
    
    console.log('✅ Mode offline prêt !');
    return {
      success: true,
      batiments: batiments.length,
      grilles: grilles.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Erreur préparation mode offline:', error);
    throw error;
  }
};

// Sauvegarder une inspection en mode offline
export const saveInspectionOffline = async (inspectionData) => {
  const inspection = {
    ...inspectionData,
    local_id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    synced: false,
    created_at: new Date().toISOString()
  };
  
  await saveToStore('inspections_pending', inspection);
  console.log('💾 Inspection sauvegardée en mode offline:', inspection.local_id);
  return inspection;
};

// Récupérer les inspections non synchronisées
export const getPendingInspections = async () => {
  const db = await initOfflineDB();
  const tx = db.transaction('inspections_pending', 'readonly');
  const index = tx.store.index('synced');
  return index.getAll(false);
};

// Marquer une inspection comme synchronisée
export const markInspectionAsSynced = async (local_id) => {
  const db = await initOfflineDB();
  const inspection = await db.get('inspections_pending', local_id);
  
  if (inspection) {
    inspection.synced = true;
    inspection.synced_at = new Date().toISOString();
    await db.put('inspections_pending', inspection);
  }
};

// Synchroniser toutes les inspections en attente
export const syncPendingInspections = async (tenantSlug, apiPost) => {
  const pending = await getPendingInspections();
  
  if (pending.length === 0) {
    console.log('✅ Aucune inspection à synchroniser');
    return { success: true, synced: 0 };
  }
  
  console.log(`🔄 Synchronisation de ${pending.length} inspection(s)...`);
  
  let synced = 0;
  let errors = [];
  
  for (const inspection of pending) {
    try {
      // Retirer les champs locaux avant l'envoi
      const { local_id, synced, created_at, synced_at, ...dataToSync } = inspection;
      
      // Envoyer au backend
      await apiPost(tenantSlug, '/prevention/inspections', dataToSync);
      
      // Marquer comme synchronisée
      await markInspectionAsSynced(local_id);
      synced++;
      
      console.log(`✅ Inspection ${local_id} synchronisée`);
    } catch (error) {
      console.error(`❌ Erreur sync inspection ${inspection.local_id}:`, error);
      errors.push({ local_id: inspection.local_id, error: error.message });
    }
  }
  
  // Sauvegarder la date de dernière synchronisation
  await saveMetadata('last_sync', new Date().toISOString());
  
  return {
    success: errors.length === 0,
    synced,
    errors,
    total: pending.length
  };
};

// Vérifier si le mode offline est prêt
export const isOfflineReady = async () => {
  const lastPrep = await getMetadata('last_offline_prep');
  if (!lastPrep) return false;
  
  const batiments = await getAllFromStore('batiments');
  const grilles = await getAllFromStore('grilles_inspection');
  
  return batiments.length > 0 && grilles.length > 0;
};

// Obtenir les statistiques du mode offline
export const getOfflineStats = async () => {
  const batiments = await getAllFromStore('batiments');
  const grilles = await getAllFromStore('grilles_inspection');
  const plans = await getAllFromStore('plans_intervention');
  const pending = await getPendingInspections();
  const lastPrep = await getMetadata('last_offline_prep');
  const lastSync = await getMetadata('last_sync');
  
  return {
    ready: batiments.length > 0 && grilles.length > 0,
    batiments: batiments.length,
    grilles: grilles.length,
    plans: plans.length,
    pending_inspections: pending.length,
    last_offline_prep: lastPrep,
    last_sync: lastSync
  };
};

export default {
  initOfflineDB,
  prepareOfflineMode,
  saveInspectionOffline,
  syncPendingInspections,
  isOfflineReady,
  getOfflineStats,
  getAllFromStore,
  getFromStore,
  saveToStore,
  deleteFromStore,
  clearStore
};
