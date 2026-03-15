import { useCallback } from 'react';
import { apiPost, apiPut, apiDelete, apiGet } from '../utils/api';

/**
 * Hook personnalisé pour les handlers de remplacements et congés
 * Centralise toutes les actions (create, approve, delete, etc.)
 */
const useRemplacementsHandlers = (tenantSlug, toast, refetch, permissions = {}) => {
  const { canApproveRemplacement, canEditRemplacement, canDeleteRemplacement } = permissions;

  // Créer une demande de remplacement
  const handleCreateRemplacement = useCallback(async (newDemande, onSuccess) => {
    if (!newDemande.type_garde_id || !newDemande.date || !newDemande.raison?.trim()) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive"
      });
      return false;
    }

    try {
      await apiPost(tenantSlug, '/remplacements', newDemande);
      toast({
        title: "Demande créée",
        description: "Votre demande de remplacement a été soumise et la recherche automatique va commencer",
        variant: "success"
      });
      onSuccess?.();
      refetch();
      return true;
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de créer la demande",
        variant: "destructive"
      });
      return false;
    }
  }, [tenantSlug, toast, refetch]);

  // Créer une demande de congé
  const handleCreateConge = useCallback(async (newConge, onSuccess) => {
    if (!newConge.type_conge || !newConge.date_debut || !newConge.date_fin || !newConge.raison?.trim()) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive"
      });
      return false;
    }

    try {
      await apiPost(tenantSlug, '/demandes-conge', newConge);
      toast({
        title: "Demande de congé créée",
        description: "Votre demande a été soumise et sera examinée par votre superviseur",
        variant: "success"
      });
      onSuccess?.();
      refetch();
      return true;
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de créer la demande de congé",
        variant: "destructive"
      });
      return false;
    }
  }, [tenantSlug, toast, refetch]);

  // Approuver/Refuser un congé
  const handleApprouverConge = useCallback(async (demandeId, action, commentaire = "") => {
    if (!canApproveRemplacement) return false;

    try {
      await apiPut(tenantSlug, `/demandes-conge/${demandeId}/approuver?action=${action}&commentaire=${commentaire}`, {});
      toast({
        title: action === 'approuver' ? "Congé approuvé" : "Congé refusé",
        description: `La demande de congé a été ${action === 'approuver' ? 'approuvée' : 'refusée'}`,
        variant: "success"
      });
      refetch();
      return true;
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de traiter la demande",
        variant: "destructive"
      });
      return false;
    }
  }, [tenantSlug, toast, refetch, canApproveRemplacement]);

  // Arrêter le processus de remplacement
  const handleArreterProcessus = useCallback(async (demandeId) => {
    if (!canEditRemplacement) return false;

    if (!window.confirm("Voulez-vous vraiment arrêter ce processus de remplacement? Cette action est irréversible.")) {
      return false;
    }

    try {
      await apiPut(tenantSlug, `/remplacements/${demandeId}/arreter`, {});
      toast({
        title: "🛑 Processus arrêté",
        description: "Le processus de remplacement a été arrêté",
        variant: "default"
      });
      refetch();
      return true;
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible d'arrêter le processus",
        variant: "destructive"
      });
      return false;
    }
  }, [tenantSlug, toast, refetch, canEditRemplacement]);

  // Répondre à une proposition (accepter/refuser)
  const handleRepondreProposition = useCallback(async (demandeId, action) => {
    try {
      const endpoint = action === 'accepter' ? 'accepter' : 'refuser';
      await apiPut(tenantSlug, `/remplacements/${demandeId}/${endpoint}`, {});
      toast({
        title: action === 'accepter' ? "✅ Remplacement accepté" : "Proposition refusée",
        description: action === 'accepter' 
          ? "Vous avez accepté ce remplacement. L'échange sera effectué automatiquement."
          : "Vous avez refusé cette proposition. Un autre remplaçant sera contacté.",
        variant: action === 'accepter' ? "success" : "default"
      });
      refetch();
      return true;
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de traiter votre réponse",
        variant: "destructive"
      });
      return false;
    }
  }, [tenantSlug, toast, refetch]);

  // Relancer une demande expirée/annulée
  const handleRelancerDemande = useCallback(async (demandeId) => {
    if (!window.confirm("Voulez-vous relancer cette demande? La recherche de remplaçant repartira de zéro.")) {
      return false;
    }
    
    try {
      await apiPut(tenantSlug, `/remplacements/${demandeId}/relancer`, {});
      toast({
        title: "🔄 Demande relancée",
        description: "La recherche de remplaçant a redémarré.",
        variant: "success"
      });
      refetch();
      return true;
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de relancer la demande",
        variant: "destructive"
      });
      return false;
    }
  }, [tenantSlug, toast, refetch]);

  // Supprimer une demande
  const handleSupprimerDemande = useCallback(async (demandeId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette demande? Cette action est irréversible.")) {
      return false;
    }
    
    try {
      await apiDelete(tenantSlug, `/remplacements/${demandeId}`);
      toast({
        title: "🗑️ Demande supprimée",
        description: "La demande a été supprimée.",
        variant: "success"
      });
      refetch();
      return true;
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de supprimer la demande",
        variant: "destructive"
      });
      return false;
    }
  }, [tenantSlug, toast, refetch]);

  // Annuler sa propre demande
  const handleAnnulerDemande = useCallback(async (demandeId) => {
    if (!window.confirm("Voulez-vous vraiment annuler votre demande de remplacement?")) {
      return false;
    }
    
    try {
      await apiDelete(tenantSlug, `/remplacements/${demandeId}/annuler`);
      toast({
        title: "❌ Demande annulée",
        description: "Votre demande de remplacement a été annulée.",
        variant: "default"
      });
      refetch();
      return true;
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || error.message || "Impossible d'annuler la demande",
        variant: "destructive"
      });
      return false;
    }
  }, [tenantSlug, toast, refetch]);

  // Charger l'impact planning pour un congé
  const handleShowImpact = useCallback(async (congeId, setImpactData, setShowImpactModal, setLoadingImpact) => {
    setLoadingImpact(true);
    try {
      const data = await apiGet(tenantSlug, `/demandes-conge/${congeId}/impact-planning`);
      setImpactData(data);
      setShowImpactModal(true);
    } catch (error) {
      console.error('Erreur chargement impact:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger l'impact sur le planning",
        variant: "destructive"
      });
    } finally {
      setLoadingImpact(false);
    }
  }, [tenantSlug, toast]);

  return {
    handleCreateRemplacement,
    handleCreateConge,
    handleApprouverConge,
    handleArreterProcessus,
    handleRepondreProposition,
    handleRelancerDemande,
    handleSupprimerDemande,
    handleAnnulerDemande,
    handleShowImpact
  };
};

export default useRemplacementsHandlers;
