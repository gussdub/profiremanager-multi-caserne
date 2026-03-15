import React from 'react';
import { Button } from '../ui/button';
import { AlertTriangle, FileSpreadsheet, Clock, CheckCircle, BarChart3, CalendarDays } from 'lucide-react';

const typesConge = [
  { value: 'maladie', label: '🏥 Maladie', description: 'Arrêt maladie avec justificatif' },
  { value: 'vacances', label: '🏖️ Vacances', description: 'Congés payés annuels' },
  { value: 'parental', label: '👶 Parental', description: 'Congé maternité/paternité' },
  { value: 'personnel', label: '👤 Personnel', description: 'Congé exceptionnel sans solde' }
];

const niveauxPriorite = [
  { value: 'urgente', label: '🚨 Urgente', color: '#EF4444', description: 'Traitement immédiat requis' },
  { value: 'haute', label: '🔥 Haute', color: '#F59E0B', description: 'Traitement prioritaire dans 24h' },
  { value: 'normale', label: '📋 Normale', color: '#3B82F6', description: 'Traitement dans délai standard' },
  { value: 'faible', label: '📝 Faible', color: '#6B7280', description: 'Traitement différé possible' }
];

const CongesList = ({
  conges,
  filteredConges,
  user,
  isAdminOrSuperviseur,
  loadingImpact,
  filterStatut,
  filterPeriode,
  getUserName,
  getStatutColor,
  getStatutLabel,
  getPrioriteColor,
  parseDateLocal,
  onFilterUrgent,
  onExportConges,
  onShowImpact,
  onApprouverConge
}) => {
  return (
    <div className="conges-content">
      {/* En-tête de gestion toujours visible pour admin/superviseur */}
      {isAdminOrSuperviseur && (
        <div className="management-header">
          <div className="management-info">
            <h3>👑 Gestion des demandes de congé</h3>
            <p>
              Vous pouvez approuver les demandes de congé selon vos permissions
            </p>
          </div>
          <div className="pending-indicator">
            <span className="pending-count">{conges.filter(d => d.statut === 'en_attente').length}</span>
            <span className="pending-label">en attente d'approbation</span>
          </div>
        </div>
      )}

      {/* Boutons d'actions rapides pour admin/superviseur */}
      {isAdminOrSuperviseur && (
        <div className="management-actions">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onFilterUrgent}
            data-testid="filter-urgent-conges"
            className="flex items-center gap-1"
          >
            <AlertTriangle size={14} /> Congés urgents
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onExportConges}
            data-testid="export-conges"
            className="flex items-center gap-1"
          >
            <FileSpreadsheet size={14} /> Exporter congés
          </Button>
        </div>
      )}

      {/* Statistics Cards pour congés */}
      <div className="conge-stats">
        <div className="stat-card-conge pending">
          <div className="stat-icon"><Clock size={20} /></div>
          <div className="stat-content">
            <h3>En attente</h3>
            <p className="stat-number">{conges.filter(d => d.statut === 'en_attente').length}</p>
            <p className="stat-label">À approuver</p>
          </div>
        </div>

        <div className="stat-card-conge approved">
          <div className="stat-icon"><CheckCircle size={20} /></div>
          <div className="stat-content">
            <h3>Approuvés</h3>
            <p className="stat-number">{conges.filter(d => d.statut === 'approuve').length}</p>
            <p className="stat-label">Ce mois</p>
          </div>
        </div>

        <div className="stat-card-conge total">
          <div className="stat-icon"><BarChart3 size={20} /></div>
          <div className="stat-content">
            <h3>Total jours</h3>
            <p className="stat-number">{conges.reduce((total, d) => total + (d.nombre_jours || 0), 0)}</p>
            <p className="stat-label">Jours de congé</p>
          </div>
        </div>
      </div>

      {/* Liste des demandes de congé */}
      <div className="conges-list">
        {filteredConges.length > 0 ? (
          filteredConges.map(conge => (
            <div key={conge.id} className="conge-card" data-testid={`conge-${conge.id}`}>
              <div className="conge-header">
                <div className="conge-type">
                  <span className="type-badge">
                    {typesConge.find(t => t.value === conge.type_conge)?.label || conge.type_conge}
                  </span>
                  <span 
                    className="priorite-badge" 
                    style={{ backgroundColor: getPrioriteColor(conge.priorite) }}
                  >
                    {niveauxPriorite.find(p => p.value === conge.priorite)?.label || conge.priorite}
                  </span>
                </div>
                <div className="conge-status">
                  <span 
                    className="status-badge" 
                    style={{ backgroundColor: getStatutColor(conge.statut) }}
                  >
                    {getStatutLabel(conge.statut)}
                  </span>
                </div>
              </div>
              
              <div className="conge-details">
                <div className="conge-dates">
                  <span className="date-range">
                    {parseDateLocal(conge.date_debut).toLocaleDateString('fr-FR')} - {parseDateLocal(conge.date_fin).toLocaleDateString('fr-FR')}
                  </span>
                  <span className="jours-count">({conge.nombre_jours} jour{conge.nombre_jours > 1 ? 's' : ''})</span>
                </div>
                <p className="conge-raison">{conge.raison}</p>
                <div className="conge-meta">
                  <span>Demandé par: {getUserName(conge.demandeur_id)} </span>
                  <span>Le: {new Date(conge.created_at).toLocaleDateString('fr-FR')}</span>
                </div>
              </div>

              {isAdminOrSuperviseur && conge.statut === 'en_attente' && (
                <div className="conge-actions">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onShowImpact(conge.id);
                    }}
                    disabled={loadingImpact}
                    data-testid={`impact-conge-${conge.id}`}
                    style={{ color: '#6366F1', borderColor: '#6366F1' }}
                  >
                    <CalendarDays size={14} style={{ marginRight: '4px' }} />
                    {loadingImpact ? 'Chargement...' : 'Impact Planning'}
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onApprouverConge(conge.id, 'approuver');
                    }}
                    data-testid={`approve-conge-${conge.id}`}
                  >
                    ✅ Approuver
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onApprouverConge(conge.id, 'refuser');
                    }}
                    data-testid={`reject-conge-${conge.id}`}
                  >
                    ❌ Refuser
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    data-testid={`comment-conge-${conge.id}`}
                  >
                    💬 Commenter
                  </Button>
                </div>
              )}

              {/* Affichage des infos d'approbation si déjà traitée */}
              {conge.statut !== 'en_attente' && conge.approuve_par && (
                <div className="approval-info">
                  <div className="approval-details">
                    <span className="approval-by">
                      {conge.statut === 'approuve' ? '✅' : '❌'} 
                      {conge.statut === 'approuve' ? 'Approuvé' : 'Refusé'} par {getUserName(conge.approuve_par)}
                    </span>
                    <span className="approval-date">le {conge.date_approbation}</span>
                  </div>
                  {conge.commentaire_approbation && (
                    <div className="approval-comment">
                      <strong>Commentaire :</strong> {conge.commentaire_approbation}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="empty-state">
            <h3>Aucune demande de congé</h3>
            <p>
              {filterStatut !== 'toutes' || filterPeriode !== 'toutes'
                ? 'Aucun résultat pour les filtres sélectionnés. Essayez de modifier vos critères.'
                : (isAdminOrSuperviseur 
                  ? 'Les demandes de congé des employés apparaîtront ici pour approbation.' 
                  : 'Vos demandes de congé apparaîtront ici.')}
            </p>
            {isAdminOrSuperviseur && (
              <div className="management-tips">
                <h4>💡 Conseils de gestion :</h4>
                <ul>
                  <li>Les demandes urgentes nécessitent un traitement immédiat</li>
                  <li>Vérifiez l'impact sur le planning avant d'approuver</li>
                  <li>Ajoutez des commentaires pour justifier vos décisions</li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CongesList;
