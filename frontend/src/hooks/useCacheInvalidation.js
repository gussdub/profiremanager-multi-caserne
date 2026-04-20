/**
 * Hook pour invalider le cache après des opérations critiques
 * Utilise le CacheManager pour garantir des données fraîches
 */

import { useCallback } from 'react';
import CacheManager from '../services/cacheManager';

/**
 * Hook pour gérer l'invalidation du cache
 * @returns {Object} - Fonctions d'invalidation du cache
 */
export const useCacheInvalidation = () => {
  /**
   * Invalide le cache API après un import
   * À appeler après tout import de données (PFM, CSV, etc.)
   */
  const invalidateAfterImport = useCallback(async () => {
    console.log('[Cache] Invalidation après import...');
    const success = await CacheManager.clearApiCache();
    if (success) {
      console.log('[Cache] ✅ Cache API invalidé après import');
    }
    return success;
  }, []);

  /**
   * Invalide le cache API après une création/modification/suppression
   * À appeler après des opérations CRUD importantes
   */
  const invalidateAfterMutation = useCallback(async () => {
    const success = await CacheManager.clearApiCache();
    return success;
  }, []);

  /**
   * Force le rechargement complet (cache + page)
   * À utiliser en cas de problème de synchronisation
   */
  const forceRefresh = useCallback(async () => {
    await CacheManager.clearAndReload();
  }, []);

  /**
   * Récupère le statut du cache
   */
  const getCacheStatus = useCallback(async () => {
    return await CacheManager.getCacheStatus();
  }, []);

  return {
    invalidateAfterImport,
    invalidateAfterMutation,
    forceRefresh,
    getCacheStatus
  };
};

export default useCacheInvalidation;
