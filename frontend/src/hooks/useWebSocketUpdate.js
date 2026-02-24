/**
 * Hook React pour utiliser le WebSocket et déclencher des refresh automatiques
 */
import { useEffect, useCallback } from 'react';
import WebSocketService from '../services/websocket';

/**
 * Hook pour écouter les mises à jour WebSocket et rafraîchir les données
 * 
 * @param {string|string[]} eventTypes - Type(s) d'événement à écouter (ex: 'planning_update')
 * @param {function} onUpdate - Callback appelé quand une mise à jour est reçue
 * @param {array} deps - Dépendances pour le callback (comme useEffect)
 * 
 * @example
 * // Dans un composant Planning
 * useWebSocketUpdate('planning_update', (data) => {
 *   fetchPlanningData(); // Recharger les données
 * });
 * 
 * // Écouter plusieurs types
 * useWebSocketUpdate(['planning_update', 'remplacement_update'], (data) => {
 *   loadData();
 * });
 */
export function useWebSocketUpdate(eventTypes, onUpdate, deps = []) {
  const memoizedCallback = useCallback(onUpdate, deps);
  
  useEffect(() => {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    const cleanups = [];
    
    types.forEach(type => {
      const cleanup = WebSocketService.on(type, memoizedCallback);
      cleanups.push(cleanup);
    });
    
    return () => {
      cleanups.forEach(cleanup => cleanup());
    };
  }, [eventTypes, memoizedCallback]);
}

/**
 * Hook pour écouter toutes les mises à jour (événement 'update')
 */
export function useWebSocketAnyUpdate(onUpdate, deps = []) {
  return useWebSocketUpdate('update', onUpdate, deps);
}

/**
 * Hook pour obtenir le statut de connexion WebSocket
 */
export function useWebSocketStatus() {
  return {
    isConnected: WebSocketService.isConnected(),
    connect: WebSocketService.connect,
    disconnect: WebSocketService.disconnect
  };
}

export default useWebSocketUpdate;
