import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../utils/api';
import { useWebSocketUpdate } from './useWebSocketUpdate';

/**
 * Hook personnalisé pour la gestion des données de remplacements et congés
 * Centralise la logique de fetch, état et synchronisation WebSocket
 */
const useRemplacementsData = (tenantSlug, user, toast) => {
  const [demandes, setDemandes] = useState([]);
  const [demandesConge, setDemandesConge] = useState([]);
  const [users, setUsers] = useState([]);
  const [typesGarde, setTypesGarde] = useState([]);
  const [loading, setLoading] = useState(true);
  const [propositionsRecues, setPropositionsRecues] = useState([]);
  const [quartsOuverts, setQuartsOuverts] = useState([]);

  // Fonction pour trier par date de création (plus récent en premier)
  const sortByCreatedAt = (a, b) => new Date(b.created_at) - new Date(a.created_at);

  const fetchData = useCallback(async () => {
    if (!tenantSlug) return;
    
    setLoading(true);
    try {
      const promises = [
        apiGet(tenantSlug, '/remplacements'),
        apiGet(tenantSlug, '/demandes-conge'),
        apiGet(tenantSlug, '/types-garde'),
        apiGet(tenantSlug, '/remplacements/propositions').catch(() => []),
        apiGet(tenantSlug, '/remplacements/quarts-ouverts').catch(() => [])
      ];
      
      // Charger les utilisateurs seulement pour admin/superviseur
      if (!['employe', 'pompier'].includes(user?.role)) {
        promises.push(apiGet(tenantSlug, '/users'));
      }

      const responses = await Promise.all(promises);
      
      setDemandes((responses[0] || []).sort(sortByCreatedAt));
      setDemandesConge((responses[1] || []).sort(sortByCreatedAt));
      setTypesGarde(responses[2]);
      setPropositionsRecues((responses[3] || []).sort(sortByCreatedAt));
      setQuartsOuverts((responses[4] || []).sort(sortByCreatedAt));
      
      if (responses[5]) {
        setUsers(responses[5]);
      }
    } catch (error) {
      console.error('Erreur lors du chargement:', error);
      toast?.({
        title: "Erreur",
        description: "Impossible de charger les données",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, user?.role, toast]);

  // Charger les données au montage
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Écouter les mises à jour WebSocket pour synchronisation temps réel
  useWebSocketUpdate(['remplacement_update', 'conge_update'], (data) => {
    console.log('[useRemplacementsData] Mise à jour WebSocket:', data);
    fetchData();
    
    // Notifications toast selon l'action
    if (data.type === 'remplacement_update' && toast) {
      const toastMessages = {
        'accepte': { title: "Remplacement accepte", desc: `${data.data?.remplacant_nom || 'Un remplacant'} a accepte une demande` },
        'nouvelle_demande': { title: "Nouvelle demande", desc: `${data.data?.demandeur_nom || 'Quelqu\'un'} cherche un remplacant` },
        'approuve_manuellement': { title: "Demande approuvee", desc: `Approuvee par ${data.data?.approuve_par_nom || 'un superviseur'}` },
        'annulee': { title: "Demande annulee", desc: `Annulee par ${data.data?.annule_par_nom || 'un superviseur'}` },
        'relancee': { title: "Demande relancee", desc: `Relancee par ${data.data?.relance_par_nom || 'un utilisateur'}` },
        'supprimee': { title: "Demande supprimee", desc: "Une demande a ete supprimee" },
        'expiree': { title: "Demande expiree", desc: "Aucun remplacant trouve" },
        'arrete': { title: "Processus arrete", desc: `Arrete par ${data.data?.arrete_par_nom || 'un superviseur'}` },
        'quart_ouvert': { title: "Quart disponible", desc: `Un quart de ${data.data?.type_garde_nom || 'garde'} le ${data.data?.date || ''} est ouvert a tous` },
        'quart_pris': { title: "Quart pris", desc: `${data.data?.remplacant_nom || 'Un employe'} a pris un quart ouvert` }
      };
      
      const msg = toastMessages[data.action];
      if (msg) {
        toast({
          title: msg.title,
          description: msg.desc,
          duration: 5000
        });
      }
    }
  }, [fetchData, toast]);

  // Helpers
  const getTypeGardeName = useCallback((typeGardeId) => {
    const typeGarde = typesGarde.find(t => t.id === typeGardeId);
    return typeGarde ? typeGarde.nom : 'Type non spécifié';
  }, [typesGarde]);

  const getUserName = useCallback((userId, demandeurNom = null) => {
    if (demandeurNom) return demandeurNom;
    const foundUser = users.find(u => u.id === userId);
    return foundUser ? `${foundUser.prenom} ${foundUser.nom}` : `Employé #${userId?.slice(-4) || '?'}`;
  }, [users]);

  return {
    // États
    demandes,
    demandesConge,
    users,
    typesGarde,
    loading,
    propositionsRecues,
    quartsOuverts,
    // Setters (pour manipulation directe si nécessaire)
    setDemandes,
    setDemandesConge,
    // Actions
    refetch: fetchData,
    // Helpers
    getTypeGardeName,
    getUserName
  };
};

export default useRemplacementsData;
