import React, { useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";

/**
 * DayDetailModal - Modal de détail d'un jour
 * Affiche les disponibilités et indisponibilités d'une journée
 */
const DayDetailModal = ({
  show,
  selectedDay,
  dayDetailData,
  typesGarde,
  onClose,
  onDelete,
  onAddDisponibilite,
  onAddIndisponibilite
}) => {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [deleting, setDeleting] = useState(false);

  if (!show || !selectedDay) return null;

  // Détecte si une indisponibilité provient d'un horaire automatique
  const isFromAutomaticSchedule = (item) => {
    const automaticOrigins = [
      'montreal_7_24', 'quebec_10_14', 'longueuil_7_24',
      'horaire_personnalise', 'rotation', 'automatique'
    ];
    return item.origine && (
      automaticOrigins.some(o => item.origine.toLowerCase().includes(o.toLowerCase())) ||
      item.origine !== 'manuelle'
    );
  };

  // Formate le nom de l'origine pour l'affichage
  const formatOrigineName = (origine) => {
    if (!origine) return 'Manuelle';
    const mapping = {
      'montreal_7_24': 'Montréal 7/24',
      'quebec_10_14': 'Québec 10/14',
      'longueuil_7_24': 'Longueuil 7/24',
      'horaire_personnalise': 'Horaire personnalisé',
      'manuelle': 'Manuelle'
    };
    return mapping[origine] || origine;
  };

  // Gère le clic sur supprimer
  const handleDeleteClick = (item) => {
    if (isFromAutomaticSchedule(item)) {
      // Afficher le dialogue de confirmation pour les indisponibilités automatiques
      setSelectedItem(item);
      setShowConfirmDialog(true);
    } else {
      // Suppression directe pour les entrées manuelles
      onDelete(item.id);
    }
  };

  // Confirme la suppression d'une seule date
  const handleConfirmDeleteSingle = async () => {
    if (!selectedItem) return;
    
    setDeleting(true);
    try {
      await onDelete(selectedItem.id);
      setShowConfirmDialog(false);
      setSelectedItem(null);
    } catch (error) {
      console.error("Erreur suppression:", error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="day-detail-modal" onClick={onClose}>
        <div className="day-detail-content" onClick={(e) => e.stopPropagation()}>
          <div className="day-detail-header">
            <h3>📅 {selectedDay.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
            <Button variant="ghost" onClick={onClose}>✕</Button>
          </div>
          
          <div className="day-detail-body">
            {/* Disponibilités */}
            <div className="day-detail-section">
              <h4>✅ Disponibilités ({dayDetailData.disponibilites.length})</h4>
              {dayDetailData.disponibilites.length === 0 ? (
                <div className="day-detail-empty">Aucune disponibilité ce jour</div>
              ) : (
                dayDetailData.disponibilites.map(dispo => {
                  const typeGarde = typesGarde.find(t => t.id === dispo.type_garde_id);
                  return (
                    <div key={dispo.id} className="day-detail-item">
                      <div className="day-detail-item-header">
                        <span className="day-detail-item-type" style={{ color: typeGarde?.couleur || '#3b82f6' }}>
                          {typeGarde?.nom || 'Disponibilité'}
                        </span>
                        <div className="day-detail-item-actions">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleDeleteClick(dispo)}
                          >
                            🗑️ Supprimer
                          </Button>
                        </div>
                      </div>
                      <div className="day-detail-item-info">
                        ⏰ {dispo.heure_debut} - {dispo.heure_fin}
                        {dispo.origine && <span> • Origine: {formatOrigineName(dispo.origine)}</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Indisponibilités */}
            <div className="day-detail-section">
              <h4>❌ Indisponibilités ({dayDetailData.indisponibilites.length})</h4>
              {dayDetailData.indisponibilites.length === 0 ? (
                <div className="day-detail-empty">Aucune indisponibilité ce jour</div>
              ) : (
                dayDetailData.indisponibilites.map(indispo => (
                  <div key={indispo.id} className="day-detail-item">
                    <div className="day-detail-item-header">
                      <span className="day-detail-item-type" style={{ color: '#dc2626' }}>
                        Indisponible
                      </span>
                      <div className="day-detail-item-actions">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleDeleteClick(indispo)}
                        >
                          🗑️ Supprimer
                        </Button>
                      </div>
                    </div>
                    <div className="day-detail-item-info">
                      ⏰ {indispo.heure_debut || '00:00'} - {indispo.heure_fin || '23:59'}
                      {indispo.origine && (
                        <span className={isFromAutomaticSchedule(indispo) ? 'text-orange-600 font-medium' : ''}>
                          {' '}• Origine: {formatOrigineName(indispo.origine)}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="day-detail-footer">
            <Button variant="outline" onClick={onClose}>
              Fermer
            </Button>
            <Button 
              variant="default" 
              onClick={onAddDisponibilite}
              style={{ background: '#16a34a', borderColor: '#16a34a' }}
            >
              ✅ Ajouter disponibilité
            </Button>
            <Button 
              variant="destructive" 
              onClick={onAddIndisponibilite}
            >
              ❌ Ajouter indisponibilité
            </Button>
          </div>
        </div>
      </div>

      {/* Dialog de confirmation pour suppression d'indisponibilité automatique */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              ⚠️ Supprimer cette indisponibilité ?
            </DialogTitle>
            <DialogDescription>
              Cette indisponibilité provient d'un horaire automatique ({formatOrigineName(selectedItem?.origine)}).
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-3">
            <p className="text-sm text-gray-600">
              Vous êtes sur le point de supprimer l'indisponibilité du{' '}
              <strong>{selectedDay?.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                💡 <strong>Cette action supprime uniquement cette date.</strong><br/>
                Les autres dates de l'horaire automatique ne seront pas affectées.
              </p>
            </div>
            <p className="text-xs text-gray-500">
              Pour supprimer toutes les indisponibilités de cet horaire, utilisez le bouton "Réinitialiser" dans les options de génération.
            </p>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowConfirmDialog(false);
                setSelectedItem(null);
              }}
            >
              Annuler
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmDeleteSingle}
              disabled={deleting}
            >
              {deleting ? '⏳ Suppression...' : '🗑️ Supprimer cette date'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DayDetailModal;
