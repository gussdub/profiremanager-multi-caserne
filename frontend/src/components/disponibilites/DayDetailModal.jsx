import React from "react";
import { Button } from "../ui/button";

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
  if (!show || !selectedDay) return null;

  return (
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
                          onClick={() => onDelete(dispo.id)}
                        >
                          🗑️ Supprimer
                        </Button>
                      </div>
                    </div>
                    <div className="day-detail-item-info">
                      ⏰ {dispo.heure_debut} - {dispo.heure_fin}
                      {dispo.origine && <span> • Origine: {dispo.origine}</span>}
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
                        onClick={() => onDelete(indispo.id)}
                      >
                        🗑️ Supprimer
                      </Button>
                    </div>
                  </div>
                  <div className="day-detail-item-info">
                    ⏰ {indispo.heure_debut} - {indispo.heure_fin}
                    {indispo.origine && <span> • Origine: {indispo.origine}</span>}
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
  );
};

export default DayDetailModal;
