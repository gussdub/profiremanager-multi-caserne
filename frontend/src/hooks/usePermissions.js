/**
 * Hook pour vérifier les permissions de l'utilisateur
 * basé sur le système Types d'accès
 */

import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../utils/api';

// Cache des permissions pour éviter les appels répétés
let permissionsCache = null;
let cacheUserId = null;

/**
 * Hook pour récupérer et vérifier les permissions de l'utilisateur
 */
export const usePermissions = (tenantSlug, user) => {
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPermissions = async () => {
      if (!tenantSlug || !user?.id) {
        setLoading(false);
        return;
      }

      // Utiliser le cache si disponible pour le même utilisateur
      if (permissionsCache && cacheUserId === user.id) {
        setPermissions(permissionsCache);
        setLoading(false);
        return;
      }

      try {
        // Pour admin, accès complet
        if (user.role === 'admin') {
          const fullAccess = { is_full_access: true };
          permissionsCache = fullAccess;
          cacheUserId = user.id;
          setPermissions(fullAccess);
          setLoading(false);
          return;
        }

        // Récupérer les permissions du type d'accès de l'utilisateur
        const response = await apiGet(tenantSlug, `/users/${user.id}/permissions`);
        permissionsCache = response.permissions || {};
        cacheUserId = user.id;
        setPermissions(permissionsCache);
      } catch (error) {
        console.error('Erreur chargement permissions:', error);
        // Fallback sur les permissions par défaut du rôle
        const fallback = getDefaultPermissionsForRole(user.role);
        setPermissions(fallback);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [tenantSlug, user?.id, user?.role]);

  /**
   * Vérifie si l'utilisateur a accès à un module
   */
  const hasModuleAccess = useCallback((moduleId) => {
    if (!permissions) return false;
    if (permissions.is_full_access) return true;
    return permissions.modules?.[moduleId]?.access === true;
  }, [permissions]);

  /**
   * Vérifie si l'utilisateur a une action spécifique sur un module
   */
  const hasModuleAction = useCallback((moduleId, action) => {
    if (!permissions) return false;
    if (permissions.is_full_access) return true;
    const modulePerms = permissions.modules?.[moduleId];
    if (!modulePerms?.access) return false;
    return modulePerms.actions?.includes(action) || false;
  }, [permissions]);

  /**
   * Vérifie si l'utilisateur a accès à un onglet
   */
  const hasTabAccess = useCallback((moduleId, tabId) => {
    if (!permissions) return false;
    if (permissions.is_full_access) return true;
    const modulePerms = permissions.modules?.[moduleId];
    if (!modulePerms?.access) return false;
    return modulePerms.tabs?.[tabId]?.access === true;
  }, [permissions]);

  /**
   * Vérifie si l'utilisateur a une action spécifique sur un onglet
   */
  const hasTabAction = useCallback((moduleId, tabId, action) => {
    if (!permissions) return false;
    if (permissions.is_full_access) return true;
    const modulePerms = permissions.modules?.[moduleId];
    if (!modulePerms?.access) return false;
    const tabPerms = modulePerms.tabs?.[tabId];
    if (!tabPerms?.access) return false;
    return tabPerms.actions?.includes(action) || false;
  }, [permissions]);

  /**
   * Vérifie si l'utilisateur peut signer les rapports d'intervention
   */
  const canSignInterventions = useCallback(() => {
    return hasTabAction('interventions', 'rapports', 'signer');
  }, [hasTabAction]);

  /**
   * Vérifie si l'utilisateur peut créer des rapports d'intervention
   */
  const canCreateInterventions = useCallback(() => {
    return hasTabAction('interventions', 'rapports', 'creer');
  }, [hasTabAction]);

  /**
   * Vérifie si l'utilisateur peut valider (DSI, etc.)
   */
  const canValidate = useCallback((moduleId, tabId) => {
    return hasTabAction(moduleId, tabId, 'valider');
  }, [hasTabAction]);

  return {
    permissions,
    loading,
    hasModuleAccess,
    hasModuleAction,
    hasTabAccess,
    hasTabAction,
    canSignInterventions,
    canCreateInterventions,
    canValidate
  };
};

/**
 * Permissions par défaut pour les rôles de base
 * (utilisé en fallback si l'API ne répond pas)
 */
const getDefaultPermissionsForRole = (role) => {
  if (role === 'admin') {
    return { is_full_access: true };
  }
  
  if (role === 'superviseur') {
    return {
      modules: {
        dashboard: { access: true, actions: ['voir'] },
        personnel: { access: true, actions: ['voir', 'creer', 'modifier', 'supprimer'] },
        actifs: { access: true, actions: ['voir', 'creer', 'modifier', 'supprimer'] },
        interventions: {
          access: true,
          actions: ['voir', 'creer', 'modifier', 'supprimer', 'exporter'],
          tabs: {
            rapports: { access: true, actions: ['voir', 'creer', 'modifier', 'supprimer', 'exporter', 'signer'] },
            'fausses-alarmes': { access: true, actions: ['voir', 'creer', 'modifier', 'supprimer', 'exporter'] },
            'conformite-dsi': { access: true, actions: ['voir', 'valider', 'exporter'] },
            historique: { access: true, actions: ['voir', 'exporter'] },
            parametres: { access: false, actions: [] }
          }
        },
        paie: { access: true, actions: ['voir', 'exporter'] },
        planning: { access: true, actions: ['voir', 'creer', 'modifier', 'supprimer'] },
        remplacements: { access: true, actions: ['voir', 'creer', 'modifier', 'supprimer'] },
        formations: { access: true, actions: ['voir', 'creer', 'modifier', 'supprimer'] },
        prevention: { access: true, actions: ['voir', 'creer', 'modifier', 'supprimer'] },
        disponibilites: { access: true, actions: ['voir', 'creer', 'modifier', 'supprimer'] },
        rapports: { access: false, actions: [] },
        parametres: { access: false, actions: [] }
      }
    };
  }
  
  // Employé par défaut - accès limité
  return {
    modules: {
      dashboard: { access: true, actions: ['voir'] },
      personnel: { access: false, actions: [] },
      actifs: { access: true, actions: ['voir'] },
      interventions: { access: false, actions: [], tabs: {} },
      paie: { access: false, actions: [] },
      planning: { 
        access: true, 
        actions: ['voir'],
        tabs: {
          calendrier: { access: true, actions: ['voir'] },
          assignation: { access: false, actions: [] },
          'rapport-heures': { access: true, actions: ['voir', 'exporter'] },
          export: { access: false, actions: [] }
        }
      },
      remplacements: { access: true, actions: ['voir', 'creer'] },
      formations: { access: true, actions: ['voir'] },
      prevention: { access: false, actions: [] },
      disponibilites: { access: true, actions: ['voir', 'creer', 'modifier', 'supprimer'] },
      rapports: { access: false, actions: [] },
      parametres: { access: false, actions: [] }
    }
  };
};

/**
 * Invalide le cache des permissions (à appeler après modification)
 */
export const invalidatePermissionsCache = () => {
  permissionsCache = null;
  cacheUserId = null;
};

export default usePermissions;
