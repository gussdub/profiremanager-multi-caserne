import React, { useState } from 'react';
import { Button } from './ui/button';

const AuditModal = ({ 
  isOpen, 
  onClose, 
  assignation, 
  auditNotes, 
  onSaveNotes 
}) => {
  const [notesEdit, setNotesEdit] = useState(auditNotes || '');
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  
  if (!isOpen || !assignation || !assignation.justification) return null;
  
  const justif = assignation.justification;
  const assignedUser = justif.assigned_user || {};
  const otherCandidates = justif.other_candidates || [];
  const totalCandidates = justif.total_candidates_evaluated || 0;
  
  // Déterminer la raison principale de sélection
  const getRaisonPrincipale = () => {
    const details = assignedUser.details || {};
    const heures = details.heures_ce_mois || 0;
    return `Plus faible nombre d'heures ce mois (${heures}h)`;
  };
  
  // Top 5 candidats pour la comparaison
  const topCandidates = [assignedUser, ...otherCandidates].slice(0, 5);
  
  const handleSave = async () => {
    await onSaveNotes(notesEdit);
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content large-modal" 
        onClick={(e) => e.stopPropagation()} 
        style={{ maxWidth: '1000px', maxHeight: '90vh', overflow: 'auto' }}
      >
        <div className="modal-header">
          <h3>🔍 Audit de l'Affectation Automatique</h3>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>
        
        <div className="modal-body" style={{ padding: '1.5rem' }}>
          
          {/* ===== PARTIE 1: Résultat Final + Raison Principale ===== */}
          <div style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: 'white',
            padding: '1.5rem',
            borderRadius: '12px',
            marginBottom: '1.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '2rem' }}>🏆</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {assignedUser.nom_complet}
                </h3>
                <div style={{ fontSize: '0.9rem', opacity: 0.95 }}>
                  {assignedUser.grade} • {assignedUser.type_emploi}
                </div>
              </div>
            </div>
            
            <div style={{
              background: 'rgba(255, 255, 255, 0.2)',
              padding: '0.75rem',
              borderRadius: '8px',
              marginTop: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>✅</span>
                <div>
                  <strong>Raison de sélection:</strong>
                  <div style={{ marginTop: '0.25rem' }}>{getRaisonPrincipale()}</div>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', fontSize: '0.9rem' }}>
              <span>📅 {assignation.date}</span>
              <span>🚒 {justif.type_garde_info?.nom}</span>
              <span>⏱️ {justif.type_garde_info?.duree_heures}h</span>
            </div>
          </div>
          
          {/* ===== PARTIE 2: Tableau Comparatif Top 5 ===== */}
          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ marginBottom: '1rem', color: '#1f2937', fontSize: '1.25rem' }}>
              📊 Comparaison des Meilleurs Candidats
            </h4>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.9rem'
              }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Employé</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>H. ce mois</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>Ancienneté</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>Grade</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600' }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {topCandidates.map((candidate, index) => {
                    const isSelected = index === 0;
                    const details = candidate.details || {};
                    const heures = details.heures_ce_mois || 0;
                    const annees = details.annees_service || 0;
                    const excluded = candidate.excluded_reason;
                    
                    return (
                      <tr 
                        key={candidate.user_id}
                        style={{
                          background: isSelected ? '#ecfdf5' : 'white',
                          borderBottom: '1px solid #e5e7eb',
                          borderLeft: isSelected ? '4px solid #10b981' : 'none'
                        }}
                      >
                        <td style={{ padding: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {isSelected && <span style={{ fontSize: '1.25rem' }}>🏆</span>}
                            <div>
                              <div style={{ fontWeight: '600' }}>{candidate.nom_complet}</div>
                              <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{candidate.type_emploi}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600' }}>
                          {heures}h
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          {annees.toFixed(1)} ans
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <span style={{
                            padding: '0.25rem 0.5rem',
                            background: '#eff6ff',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            fontWeight: '500'
                          }}>
                            {candidate.grade}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          {isSelected ? (
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              background: '#10b981',
                              color: 'white',
                              borderRadius: '12px',
                              fontSize: '0.85rem',
                              fontWeight: '600'
                            }}>
                              ✅ SÉLECTIONNÉ
                            </span>
                          ) : excluded ? (
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              background: '#fef3c7',
                              color: '#d97706',
                              borderRadius: '12px',
                              fontSize: '0.85rem'
                            }}>
                              ❌ {excluded}
                            </span>
                          ) : (
                            <span style={{
                              padding: '0.25rem 0.75rem',
                              background: '#f3f4f6',
                              color: '#6b7280',
                              borderRadius: '12px',
                              fontSize: '0.85rem'
                            }}>
                              Score inférieur
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* ===== PARTIE 3: Section Collapsible - Tous les Candidats ===== */}
          {totalCandidates > 5 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <Button
                variant="outline"
                onClick={() => setShowAllCandidates(!showAllCandidates)}
                style={{
                  width: '100%',
                  justifyContent: 'space-between',
                  background: '#f9fafb',
                  padding: '1rem'
                }}
              >
                <span>
                  📋 Voir tous les candidats analysés ({totalCandidates})
                </span>
                <span>{showAllCandidates ? '▲' : '▼'}</span>
              </Button>
              
              {showAllCandidates && (
                <div style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  maxHeight: '400px',
                  overflowY: 'auto'
                }}>
                  {[assignedUser, ...otherCandidates].map((candidate, index) => {
                    const isSelected = index === 0;
                    const details = candidate.details || {};
                    const scores = candidate.scores || {};
                    
                    return (
                      <div 
                        key={candidate.user_id}
                        style={{
                          padding: '1rem',
                          background: 'white',
                          borderRadius: '8px',
                          marginBottom: '0.75rem',
                          borderLeft: isSelected ? '4px solid #10b981' : '1px solid #e5e7eb'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                          <div>
                            <div style={{ fontWeight: '600', fontSize: '1rem' }}>
                              {isSelected && '🏆 '}{candidate.nom_complet}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                              {candidate.grade} • {candidate.type_emploi}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Score Total</div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: isSelected ? '#10b981' : '#6b7280' }}>
                              {scores.total?.toFixed(1) || 'N/A'}
                            </div>
                          </div>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', fontSize: '0.85rem', color: '#6b7280' }}>
                          <div>⏰ {details.heures_ce_mois || 0}h ce mois</div>
                          <div>🎖️ {details.annees_service?.toFixed(1) || 0} ans</div>
                          <div>✅ Disponibilité: {scores.disponibilite || 0}/100</div>
                          <div>💼 Compétences: {scores.competences || 0}/100</div>
                        </div>
                        
                        {candidate.excluded_reason && (
                          <div style={{
                            marginTop: '0.5rem',
                            padding: '0.5rem',
                            background: '#fef3c7',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            color: '#d97706'
                          }}>
                            ❌ {candidate.excluded_reason}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          
          {/* ===== Notes Admin ===== */}
          <div style={{ marginBottom: '1rem' }}>
            <h4 style={{ marginBottom: '0.5rem', color: '#1f2937' }}>📝 Notes de l'Administrateur</h4>
            <textarea
              value={notesEdit}
              onChange={(e) => setNotesEdit(e.target.value)}
              placeholder="Ex: Affectation validée, équilibre respecté..."
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.9rem'
              }}
            />
            <Button
              onClick={handleSave}
              style={{
                marginTop: '0.5rem',
                background: '#3b82f6'
              }}
            >
              💾 Enregistrer les notes
            </Button>
          </div>
          
          {/* ===== Footer Stats ===== */}
          <div style={{
            padding: '1rem',
            background: '#eff6ff',
            borderRadius: '8px',
            border: '1px solid #93c5fd',
            fontSize: '0.85rem',
            color: '#1e40af'
          }}>
            <strong>Candidats totaux évalués:</strong> {totalCandidates} • 
            <strong> Date d'attribution:</strong> {new Date(justif.date_attribution).toLocaleString('fr-FR')}
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default AuditModal;
