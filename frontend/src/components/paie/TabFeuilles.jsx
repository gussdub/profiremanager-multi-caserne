import React from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { 
  Users, Download, Check, RefreshCw, Filter, Search, Trash2, Eye, 
  Edit, CheckCircle, XCircle, Plus, FileText
} from 'lucide-react';
import { moisOptions } from './utils';

const TabFeuilles = ({ context }) => {
  const {
    feuilles, employes, filtreAnnee, setFiltreAnnee, filtreMois, setFiltreMois,
    filtreEmploye, setFiltreEmploye, filtreStatut, setFiltreStatut,
    genPeriodeDebut, setGenPeriodeDebut, genPeriodeFin, setGenPeriodeFin,
    selectedFeuille, setSelectedFeuille, showDetail, setShowDetail,
    editMode, setEditMode, editedLignes, setEditedLignes,
    newLigne, setNewLigne, eventTypes, parametres,
    handleGenererLot, handleValiderFeuille, handleSupprimerFeuille,
    handleVoirDetail, handleExportPaie, handleValiderTout, handleExportPDF,
    handleStartEdit, handleSaveFeuille, handleAddLigne, handleDeleteLigne,
    handleUpdateLigne, calculerMontantAutomatique, getStatutBadge,
    formatMontant, totauxTempsReel, loading, fetchFeuilles
  } = context;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Section génération en lot */}
      <div style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', borderRadius: '12px', padding: '24px', color: 'white' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={20} /> Générer les feuilles de temps (tous les employés)
        </h3>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Début période
            </label>
            <Input
              type="date"
              value={genPeriodeDebut}
              onChange={(e) => setGenPeriodeDebut(e.target.value)}
              style={{ background: 'white', color: '#1e293b' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Fin période
            </label>
            <Input
              type="date"
              value={genPeriodeFin}
              onChange={(e) => setGenPeriodeFin(e.target.value)}
              style={{ background: 'white', color: '#1e293b' }}
            />
          </div>
          <Button onClick={handleGenererLot} disabled={loading} style={{ background: 'white', color: '#ea580c' }}>
            {loading ? <RefreshCw className="animate-spin" size={16} /> : <FileText size={16} />}
            <span style={{ marginLeft: '8px' }}>Générer pour tous</span>
          </Button>
        </div>
      </div>

      {/* Filtres et export */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e5e7eb', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Filter size={18} style={{ color: '#64748b' }} />
        <select
          value={filtreAnnee}
          onChange={(e) => setFiltreAnnee(parseInt(e.target.value))}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
        >
          {[2026, 2025, 2024].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={filtreMois}
          onChange={(e) => setFiltreMois(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
        >
          <option value="">Tous les mois</option>
          <option value="01">Janvier</option>
          <option value="02">Février</option>
          <option value="03">Mars</option>
          <option value="04">Avril</option>
          <option value="05">Mai</option>
          <option value="06">Juin</option>
          <option value="07">Juillet</option>
          <option value="08">Août</option>
          <option value="09">Septembre</option>
          <option value="10">Octobre</option>
          <option value="11">Novembre</option>
          <option value="12">Décembre</option>
        </select>
        <select
          value={filtreEmploye}
          onChange={(e) => setFiltreEmploye(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
        >
          <option value="">Tous les employés</option>
          {employes.map(e => (
            <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>
          ))}
        </select>
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
        >
          <option value="">Tous les statuts</option>
          <option value="brouillon">Brouillon</option>
          <option value="valide">Validé</option>
          <option value="exporte">Exporté</option>
        </select>
        <Button variant="outline" onClick={fetchFeuilles}>
          <Search size={16} />
        </Button>
        <div style={{ flex: 1 }} />
        
        {/* Bouton Valider tout */}
        {feuilles.filter(f => f.statut === 'brouillon').length > 0 && (
          <Button 
            onClick={handleValiderTout} 
            disabled={loading}
            variant="outline"
            style={{ borderColor: '#22c55e', color: '#22c55e' }}
          >
            <Check size={16} /> Valider tout ({feuilles.filter(f => f.statut === 'brouillon').length})
          </Button>
        )}
        
        {/* Export PDF */}
        <Button 
          onClick={() => handleExportPDF()} 
          disabled={loading || feuilles.filter(f => f.statut === 'valide' || f.statut === 'exporte').length === 0}
          variant="outline"
        >
          <FileText size={16} /> PDF
        </Button>
        
        {/* Export Excel */}
        <Button onClick={handleExportPaie} disabled={loading}>
          <Download size={16} /> Exporter Excel
        </Button>
        {selectedProvider?.api_available && payrollConfig?.api_connection_tested && (
          <Button 
            onClick={handleSendToApi} 
            disabled={loading}
            style={{ background: '#dc2626' }}
          >
            <Zap size={16} /> Envoyer via API
          </Button>
        )}
      </div>

      {/* Liste des feuilles */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Employé</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Période</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', fontSize: '0.875rem' }}>Heures</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', fontSize: '0.875rem' }}>Montant</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', fontSize: '0.875rem' }}>Statut</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', fontSize: '0.875rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {feuilles.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                  Aucune feuille de temps trouvée
                </td>
              </tr>
            ) : (
              feuilles.map(f => (
                <tr key={f.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: '500' }}>{f.employe_prenom} {f.employe_nom}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{f.employe_grade} • {f.employe_type_emploi}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {f.periode_debut} → {f.periode_fin}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {f.total_heures_payees}h
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600' }}>
                    {formatMontant(f.total_montant_final)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {getStatutBadge(f.statut)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <Button variant="ghost" size="sm" onClick={() => handleVoirDetail(f.id)} title="Voir détail">
                        <Eye size={16} />
                      </Button>
                      {(f.statut === 'valide' || f.statut === 'exporte') && (
                        <Button variant="ghost" size="sm" onClick={() => handleExportPDF(f.id)} title="Télécharger PDF">
                          <FileText size={16} style={{ color: '#3b82f6' }} />
                        </Button>
                      )}
                      {f.statut === 'brouillon' && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => handleValiderFeuille(f.id)} title="Valider">
                            <Check size={16} style={{ color: '#22c55e' }} />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleSupprimerFeuille(f.id)} title="Supprimer">
                            <Trash2 size={16} style={{ color: '#ef4444' }} />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal détail */}
      {showDetail && selectedFeuille && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '1000px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0 }}>Feuille de temps - {selectedFeuille.employe_prenom} {selectedFeuille.employe_nom}</h2>
                <p style={{ margin: '4px 0 0', color: '#64748b' }}>
                  {selectedFeuille.periode_debut} → {selectedFeuille.periode_fin} • {getStatutBadge(selectedFeuille.statut)}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setShowDetail(false)}>✕</Button>
            </div>
            
            <div style={{ padding: '24px' }}>
              {/* Résumé - utilise les totaux en temps réel en mode édition */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#16a34a' }}>
                    {editMode ? totauxTempsReel?.gardes_internes?.toFixed(1) : selectedFeuille.total_heures_gardes_internes}h
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Gardes int.</div>
                </div>
                <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#d97706' }}>
                    {editMode ? totauxTempsReel?.gardes_externes?.toFixed(1) : selectedFeuille.total_heures_gardes_externes}h
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Gardes ext.</div>
                </div>
                <div style={{ background: '#fee2e2', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#dc2626' }}>
                    {editMode ? totauxTempsReel?.rappels?.toFixed(1) : selectedFeuille.total_heures_rappels}h
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Rappels</div>
                </div>
                <div style={{ background: '#dbeafe', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#2563eb' }}>
                    {editMode ? totauxTempsReel?.formations?.toFixed(1) : selectedFeuille.total_heures_formations}h
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Formations</div>
                </div>
                <div style={{ background: '#f3e8ff', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#9333ea' }}>
                    {editMode ? formatMontant(totauxTempsReel?.montant_total) : formatMontant(selectedFeuille.total_montant_final)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Total</div>
                </div>
              </div>

              {/* Détail lignes */}
              <h4 style={{ margin: '0 0 12px' }}>Détail des entrées</h4>
              <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Date</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Type</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Description</th>
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Qté/Heures</th>
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Montant</th>
                      {editMode && <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontSize: '0.65rem' }} title="Fonction supérieure (+{parametres?.prime_fonction_superieure_pct || 10}%)">Fct.Sup.</th>}
                      {editMode && <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Mode lecture */}
                    {!editMode && selectedFeuille.lignes?.map((ligne, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '8px' }}>{ligne.date}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            background: ligne.type === 'garde_interne' || ligne.type?.includes('GARDE_INTERNE') ? '#d1fae5' :
                                       ligne.type === 'garde_externe' || ligne.type?.includes('GARDE_EXTERNE') ? '#fef3c7' :
                                       ligne.type === 'rappel' ? '#fee2e2' :
                                       ligne.type === 'formation' || ligne.type?.includes('PRATIQUE') ? '#dbeafe' :
                                       ligne.type === 'prime_repas' || ligne.type?.includes('REPAS') ? '#f3e8ff' : '#f1f5f9'
                          }}>
                            {eventTypes.find(et => et.code === ligne.type)?.label || ligne.type}
                          </span>
                          {ligne.fonction_superieure && (
                            <span style={{ marginLeft: '4px', fontSize: '0.6rem', color: '#059669' }}>⬆️</span>
                          )}
                        </td>
                        <td style={{ padding: '8px' }}>
                          {ligne.description}
                          {ligne.note && <small style={{ display: 'block', color: '#64748b' }}>{ligne.note}</small>}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {(() => {
                            const eventType = eventTypes.find(et => et.code === ligne.type);
                            const unit = eventType?.unit || 'heures';
                            const unitLabel = unit === 'km' ? 'km' : unit === 'montant' ? '$' : unit === 'quantite' ? '' : 'h';
                            return ligne.heures_payees > 0 ? `${ligne.heures_payees}${unitLabel}` : '-';
                          })()}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '500' }}>
                          {ligne.montant > 0 ? formatMontant(ligne.montant) : '-'}
                        </td>
                      </tr>
                    ))}
                    
                    {/* Mode édition */}
                    {editMode && editedLignes.map((ligne, idx) => (
                      <tr key={ligne.id || idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '8px' }}>{ligne.date}</td>
                        <td style={{ padding: '8px' }}>
                          <select 
                            value={ligne.type}
                            onChange={(e) => handleUpdateLigne(ligne.id, 'type', e.target.value)}
                            style={{ padding: '4px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.75rem', minWidth: '120px' }}
                          >
                            <option value="">-- Type --</option>
                            {eventTypes.length > 0 ? (
                              eventTypes.map(et => (
                                <option key={et.code} value={et.code}>{et.label}</option>
                              ))
                            ) : (
                              <>
                                <option value="garde_interne">Garde interne</option>
                                <option value="garde_externe">Garde externe</option>
                                <option value="rappel">Rappel</option>
                                <option value="formation">Formation</option>
                                <option value="intervention">Intervention</option>
                                <option value="prime_repas">Prime repas</option>
                                <option value="autre">Autre</option>
                              </>
                            )}
                          </select>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <Input
                            value={ligne.description || ''}
                            onChange={(e) => handleUpdateLigne(ligne.id, 'description', e.target.value)}
                            style={{ padding: '4px', fontSize: '0.75rem' }}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={ligne.heures_payees_text !== undefined ? ligne.heures_payees_text : (ligne.heures_payees || '0')}
                              onChange={(e) => {
                                const textValue = e.target.value;
                                const numValue = parseFloat(textValue.replace(',', '.'));
                                // Mettre à jour avec la valeur texte et numérique
                                handleUpdateLigne(ligne.id, 'heures_payees', isNaN(numValue) ? 0 : numValue);
                                handleUpdateLigne(ligne.id, 'heures_payees_text', textValue);
                              }}
                              style={{ width: '60px', padding: '4px', fontSize: '0.75rem', textAlign: 'right', borderRadius: '4px', border: '1px solid #d1d5db' }}
                            />
                            <span style={{ fontSize: '0.7rem', color: '#64748b', minWidth: '20px' }}>
                              {(() => {
                                const eventType = eventTypes.find(et => et.code === ligne.type);
                                const unit = eventType?.unit || 'heures';
                                return unit === 'km' ? 'km' : unit === 'montant' ? '$' : unit === 'quantite' ? '' : 'h';
                              })()}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={ligne.montant_text !== undefined ? ligne.montant_text : (ligne.montant || '0')}
                            onChange={(e) => {
                              const textValue = e.target.value;
                              const numValue = parseFloat(textValue.replace(',', '.'));
                              handleUpdateLigne(ligne.id, 'montant', isNaN(numValue) ? 0 : numValue);
                              handleUpdateLigne(ligne.id, 'montant_text', textValue);
                            }}
                            style={{ width: '80px', padding: '4px', fontSize: '0.75rem', textAlign: 'right', borderRadius: '4px', border: '1px solid #d1d5db' }}
                          />
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          {/* Afficher Fct.Sup. uniquement pour les types en heures */}
                          {(() => {
                            const eventType = eventTypes.find(et => et.code === ligne.type);
                            const isHourBased = !eventType?.unit || eventType?.unit === 'heures';
                            return isHourBased ? (
                              <input
                                type="checkbox"
                                checked={ligne.fonction_superieure || false}
                                onChange={(e) => handleUpdateLigne(ligne.id, 'fonction_superieure', e.target.checked)}
                                title={`Fonction supérieure (+${parametres?.prime_fonction_superieure_pct || 10}%)`}
                                style={{ cursor: 'pointer' }}
                              />
                            ) : (
                              <span style={{ color: '#9ca3af', fontSize: '0.65rem' }}>N/A</span>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteLigne(ligne.id)}>
                            <Trash2 size={14} style={{ color: '#ef4444' }} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    
                    {/* Formulaire ajout nouvelle ligne (mode édition) */}
                    {editMode && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td style={{ padding: '8px' }}>
                          <Input
                            type="date"
                            value={newLigne.date}
                            onChange={(e) => setNewLigne({...newLigne, date: e.target.value})}
                            style={{ padding: '4px', fontSize: '0.75rem' }}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <select 
                            value={newLigne.type}
                            onChange={(e) => {
                              const selectedType = e.target.value;
                              const eventType = eventTypes.find(et => et.code === selectedType);
                              const montant = calculerMontantAutomatique(selectedType, parseFloat(newLigne.heures_payees) || 0, newLigne.fonction_superieure);
                              setNewLigne({
                                ...newLigne, 
                                type: selectedType,
                                description: eventType?.label || newLigne.description,
                                montant: montant
                              });
                            }}
                            style={{ padding: '4px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.75rem', minWidth: '120px' }}
                          >
                            <option value="">-- Type --</option>
                            {eventTypes.length > 0 ? (
                              eventTypes.map(et => (
                                <option key={et.code} value={et.code}>{et.label}</option>
                              ))
                            ) : (
                              <>
                                <option value="garde_interne">Garde interne</option>
                                <option value="garde_externe">Garde externe</option>
                                <option value="rappel">Rappel</option>
                                <option value="formation">Formation</option>
                                <option value="intervention">Intervention</option>
                                <option value="prime_repas">Prime repas</option>
                                <option value="autre">Autre</option>
                              </>
                            )}
                          </select>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <Input
                            value={newLigne.description}
                            onChange={(e) => setNewLigne({...newLigne, description: e.target.value})}
                            placeholder="Description"
                            style={{ padding: '4px', fontSize: '0.75rem' }}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={newLigne.heures_payees}
                              onChange={(e) => {
                                const textValue = e.target.value;
                                const quantite = parseFloat(textValue.replace(',', '.')) || 0;
                                const montant = calculerMontantAutomatique(newLigne.type, quantite, newLigne.fonction_superieure);
                                setNewLigne({...newLigne, heures_payees: textValue, montant: montant});
                              }}
                              style={{ width: '60px', padding: '4px', fontSize: '0.75rem', textAlign: 'right', borderRadius: '4px', border: '1px solid #d1d5db' }}
                            />
                            <span style={{ fontSize: '0.7rem', color: '#64748b', minWidth: '20px' }}>
                              {(() => {
                                const eventType = eventTypes.find(et => et.code === newLigne.type);
                                const unit = eventType?.unit || 'heures';
                                return unit === 'km' ? 'km' : unit === 'montant' ? '$' : unit === 'quantite' ? '' : 'h';
                              })()}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={newLigne.montant}
                            onChange={(e) => {
                              const textValue = e.target.value;
                              const numValue = parseFloat(textValue.replace(',', '.'));
                              setNewLigne({...newLigne, montant: isNaN(numValue) ? textValue : numValue});
                            }}
                            style={{ width: '80px', padding: '4px', fontSize: '0.75rem', textAlign: 'right', borderRadius: '4px', border: '1px solid #d1d5db' }}
                          />
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          {/* Afficher Fct.Sup. uniquement pour les types en heures */}
                          {(() => {
                            const eventType = eventTypes.find(et => et.code === newLigne.type);
                            const isHourBased = !newLigne.type || !eventType?.unit || eventType?.unit === 'heures';
                            return isHourBased ? (
                              <input
                                type="checkbox"
                                checked={newLigne.fonction_superieure || false}
                                onChange={(e) => setNewLigne({...newLigne, fonction_superieure: e.target.checked})}
                                title={`Fonction supérieure (+${parametres?.prime_fonction_superieure_pct || 10}%)`}
                                style={{ cursor: 'pointer' }}
                              />
                            ) : (
                              <span style={{ color: '#9ca3af', fontSize: '0.65rem' }}>N/A</span>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <Button size="sm" onClick={handleAddLigne} data-testid="add-ligne-btn">
                            <Plus size={14} />
                          </Button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              {selectedFeuille.statut === 'brouillon' && !editMode && (
                <>
                  <Button variant="outline" onClick={handleStartEdit} data-testid="edit-feuille-btn">
                    <Edit size={16} /> Modifier
                  </Button>
                  <Button onClick={() => handleValiderFeuille(selectedFeuille.id)}>
                    <Check size={16} /> Valider
                  </Button>
                </>
              )}
              {editMode && (
                <>
                  <Button variant="outline" onClick={() => setEditMode(false)}>
                    Annuler
                  </Button>
                  <Button onClick={handleSaveFeuille} disabled={loading}>
                    {loading ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
                    <span style={{ marginLeft: '8px' }}>Enregistrer</span>
                  </Button>
                </>
              )}
              {!editMode && <Button variant="outline" onClick={() => setShowDetail(false)}>Fermer</Button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  );
};

export default TabFeuilles;
