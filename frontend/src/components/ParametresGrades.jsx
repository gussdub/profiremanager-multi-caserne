import React, { useState, useEffect } from "react";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";
import { apiGet, apiPost, apiPut, apiDelete } from "../utils/api";

/**
 * ParametresGrades - Onglet de gestion des grades et de l'échelle salariale
 */
const ParametresGrades = ({ 
  tenantSlug, 
  toast, 
  grades, 
  setGrades,
  handleEditGrade,
  handleDeleteGrade,
  setShowCreateGradeModal
}) => {
  const [activeSubTab, setActiveSubTab] = useState('grades');
  const [echelleSalariale, setEchelleSalariale] = useState({
    annee: new Date().getFullYear(),
    taux_indexation: 3.0,
    echelons: []
  });
  const [loading, setLoading] = useState(false);
  const [showAddEchelonModal, setShowAddEchelonModal] = useState(false);
  const [editingEchelon, setEditingEchelon] = useState(null);
  const [newEchelon, setNewEchelon] = useState({ numero: 1, libelle: '', taux_horaire: 0 });
  const [showGenererAnneeModal, setShowGenererAnneeModal] = useState(false);
  const [nouvelleAnnee, setNouvelleAnnee] = useState(new Date().getFullYear() + 1);

  // Charger l'échelle salariale
  useEffect(() => {
    if (activeSubTab === 'echelle') {
      loadEchelleSalariale();
    }
  }, [activeSubTab, tenantSlug]);

  const loadEchelleSalariale = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, '/echelle-salariale');
      setEchelleSalariale({
        annee: data.annee || new Date().getFullYear(),
        taux_indexation: data.taux_indexation || 3.0,
        echelons: data.echelons || []
      });
    } catch (error) {
      console.error('Erreur chargement échelle salariale:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEchelle = async () => {
    try {
      await apiPost(tenantSlug, '/echelle-salariale', {
        annee: echelleSalariale.annee,
        taux_indexation: echelleSalariale.taux_indexation,
        echelons: echelleSalariale.echelons
      });
      toast({
        title: "✅ Succès",
        description: "Échelle salariale sauvegardée",
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder l'échelle salariale",
        variant: "destructive"
      });
    }
  };

  const handleAddEchelon = () => {
    const maxNumero = echelleSalariale.echelons.length > 0 
      ? Math.max(...echelleSalariale.echelons.map(e => e.numero)) 
      : 0;
    setNewEchelon({
      numero: maxNumero + 1,
      libelle: `${maxNumero + 1}${maxNumero === 0 ? 'ère' : 'ème'} année`,
      taux_horaire: 0
    });
    setEditingEchelon(null);
    setShowAddEchelonModal(true);
  };

  const handleEditEchelon = (echelon) => {
    setNewEchelon({ ...echelon });
    setEditingEchelon(echelon);
    setShowAddEchelonModal(true);
  };

  const handleSaveEchelon = () => {
    if (editingEchelon) {
      // Modification
      setEchelleSalariale(prev => ({
        ...prev,
        echelons: prev.echelons.map(e => 
          e.numero === editingEchelon.numero ? newEchelon : e
        )
      }));
    } else {
      // Ajout
      setEchelleSalariale(prev => ({
        ...prev,
        echelons: [...prev.echelons, newEchelon].sort((a, b) => a.numero - b.numero)
      }));
    }
    setShowAddEchelonModal(false);
    setEditingEchelon(null);
  };

  const handleDeleteEchelon = (numero) => {
    if (!window.confirm('Supprimer cet échelon ?')) return;
    setEchelleSalariale(prev => ({
      ...prev,
      echelons: prev.echelons.filter(e => e.numero !== numero)
    }));
  };

  const handleGenererAnnee = async () => {
    try {
      const response = await apiPost(tenantSlug, `/echelle-salariale/generer-annee?nouvelle_annee=${nouvelleAnnee}`);
      toast({
        title: "✅ Succès",
        description: response.message,
        variant: "success"
      });
      setShowGenererAnneeModal(false);
      loadEchelleSalariale();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.data?.detail || "Impossible de générer les nouveaux taux",
        variant: "destructive"
      });
    }
  };

  const handleUpdateGradePrime = async (gradeId, gradeName, newPrime) => {
    try {
      await apiPut(tenantSlug, `/grades/${gradeId}/prime`, {
        prime_pourcentage: parseFloat(newPrime) || 0
      });
      
      // Mettre à jour le state local
      setGrades(prev => prev.map(g => 
        g.id === gradeId ? { ...g, prime_pourcentage: parseFloat(newPrime) || 0 } : g
      ));
      
      toast({
        title: "✅ Succès",
        description: `Prime de ${gradeName} mise à jour`,
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour la prime",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="grades-tab">
      {/* Sous-onglets */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        marginBottom: '1.5rem',
        borderBottom: '2px solid #e5e7eb',
        paddingBottom: '0.5rem'
      }}>
        <Button
          variant={activeSubTab === 'grades' ? 'default' : 'ghost'}
          onClick={() => setActiveSubTab('grades')}
          style={{
            background: activeSubTab === 'grades' ? '#dc2626' : 'transparent',
            color: activeSubTab === 'grades' ? 'white' : '#64748b'
          }}
        >
          🎖️ Grades
        </Button>
        <Button
          variant={activeSubTab === 'echelle' ? 'default' : 'ghost'}
          onClick={() => setActiveSubTab('echelle')}
          style={{
            background: activeSubTab === 'echelle' ? '#dc2626' : 'transparent',
            color: activeSubTab === 'echelle' ? 'white' : '#64748b'
          }}
        >
          💰 Échelle salariale
        </Button>
      </div>

      {/* Contenu Grades */}
      {activeSubTab === 'grades' && (
        <>
          <div className="tab-header">
            <div>
              <h2>Gestion des grades</h2>
              <p>Définissez les grades hiérarchiques et leurs primes associées</p>
            </div>
            <Button 
              variant="default" 
              onClick={() => setShowCreateGradeModal(true)}
              data-testid="create-grade-btn"
            >
              + Nouveau Grade
            </Button>
          </div>

          <div className="grades-grid">
            {grades.map(grade => (
              <div key={grade.id} className="grade-card" data-testid={`grade-${grade.id}`}>
                <div className="grade-header">
                  <div className="grade-info">
                    <h3>
                      {grade.nom}
                      {grade.est_officier && <span className="badge-officier">👮 Officier</span>}
                    </h3>
                    <div className="grade-details">
                      <span className="detail-item">📊 Niveau: {grade.niveau_hierarchique}</span>
                    </div>
                  </div>
                  <div className="grade-actions">
                    <Button 
                      variant="ghost" 
                      onClick={() => handleEditGrade(grade)}
                      data-testid={`edit-grade-${grade.id}`}
                      title="Modifier ce grade"
                    >
                      ✏️ Modifier
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="danger" 
                      onClick={() => handleDeleteGrade(grade.id)}
                      data-testid={`delete-grade-${grade.id}`}
                      title="Supprimer ce grade"
                    >
                      🗑️ Supprimer
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Contenu Échelle Salariale */}
      {activeSubTab === 'echelle' && (
        <div>
          {/* Configuration */}
          <div style={{ 
            background: '#f8fafc', 
            padding: '1.5rem', 
            borderRadius: '12px', 
            marginBottom: '1.5rem',
            border: '1px solid #e2e8f0'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              ⚙️ Configuration
            </h3>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <Label>Année de référence</Label>
                <Input
                  type="number"
                  value={echelleSalariale.annee}
                  onChange={(e) => setEchelleSalariale(prev => ({ ...prev, annee: parseInt(e.target.value) }))}
                  style={{ width: '120px' }}
                />
              </div>
              <div>
                <Label>Taux d'indexation annuelle (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="20"
                  value={echelleSalariale.taux_indexation}
                  onChange={(e) => setEchelleSalariale(prev => ({ ...prev, taux_indexation: parseFloat(e.target.value) }))}
                  style={{ width: '100px' }}
                />
              </div>
              <Button 
                variant="outline"
                onClick={() => {
                  setNouvelleAnnee(echelleSalariale.annee + 1);
                  setShowGenererAnneeModal(true);
                }}
                disabled={echelleSalariale.echelons.length === 0}
              >
                🔄 Générer taux {echelleSalariale.annee + 1}
              </Button>
            </div>
          </div>

          {/* Échelons */}
          <div style={{ 
            background: 'white', 
            padding: '1.5rem', 
            borderRadius: '12px', 
            marginBottom: '1.5rem',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📊 Échelons ({echelleSalariale.annee})
              </h3>
              <Button onClick={handleAddEchelon}>+ Ajouter un échelon</Button>
            </div>

            {echelleSalariale.echelons.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '2rem', 
                color: '#64748b',
                background: '#f8fafc',
                borderRadius: '8px'
              }}>
                <p>Aucun échelon défini</p>
                <p style={{ fontSize: '0.875rem' }}>Cliquez sur "Ajouter un échelon" pour commencer</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>#</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Libellé</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Taux {echelleSalariale.annee}</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {echelleSalariale.echelons.map(echelon => (
                    <tr key={echelon.numero} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '0.75rem', fontWeight: '600' }}>{echelon.numero}</td>
                      <td style={{ padding: '0.75rem' }}>{echelon.libelle}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', color: '#059669' }}>
                        {echelon.taux_horaire.toFixed(2)} $/h
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleEditEchelon(echelon)}
                        >
                          ✏️
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDeleteEchelon(echelon.numero)}
                          style={{ color: '#dc2626' }}
                        >
                          🗑️
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Primes par grade */}
          <div style={{ 
            background: 'white', 
            padding: '1.5rem', 
            borderRadius: '12px',
            border: '1px solid #e2e8f0'
          }}>
            <h3 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🎖️ Primes par grade
            </h3>
            <p style={{ color: '#64748b', marginBottom: '1rem', fontSize: '0.875rem' }}>
              Définissez un pourcentage de prime ajouté au taux horaire de base selon le grade
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
              {grades.map(grade => (
                <div 
                  key={grade.id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <span style={{ fontWeight: '500' }}>{grade.nom}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={grade.prime_pourcentage || 0}
                      onChange={(e) => handleUpdateGradePrime(grade.id, grade.nom, e.target.value)}
                      style={{ width: '70px', textAlign: 'right' }}
                    />
                    <span>%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bouton sauvegarder */}
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <Button onClick={handleSaveEchelle} style={{ minWidth: '200px' }}>
              💾 Sauvegarder l'échelle salariale
            </Button>
          </div>
        </div>
      )}

      {/* Modal Ajouter/Modifier Échelon */}
      {showAddEchelonModal && (
        <div className="modal-overlay" onClick={() => setShowAddEchelonModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h3>{editingEchelon ? 'Modifier l\'échelon' : 'Ajouter un échelon'}</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <Label>Numéro</Label>
                <Input
                  type="number"
                  min="1"
                  value={newEchelon.numero}
                  onChange={(e) => setNewEchelon(prev => ({ ...prev, numero: parseInt(e.target.value) }))}
                  disabled={!!editingEchelon}
                />
              </div>
              <div>
                <Label>Libellé</Label>
                <Input
                  type="text"
                  placeholder="Ex: 1ère année, 2ème année..."
                  value={newEchelon.libelle}
                  onChange={(e) => setNewEchelon(prev => ({ ...prev, libelle: e.target.value }))}
                />
              </div>
              <div>
                <Label>Taux horaire ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Ex: 23.83"
                  value={newEchelon.taux_horaire}
                  onChange={(e) => setNewEchelon(prev => ({ ...prev, taux_horaire: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setShowAddEchelonModal(false)}>
                Annuler
              </Button>
              <Button onClick={handleSaveEchelon}>
                {editingEchelon ? 'Modifier' : 'Ajouter'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Générer Année */}
      {showGenererAnneeModal && (
        <div className="modal-overlay" onClick={() => setShowGenererAnneeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <h3>🔄 Générer les taux pour une nouvelle année</h3>
            
            <p style={{ color: '#64748b', marginBottom: '1rem' }}>
              Les taux seront calculés en appliquant l'indexation de <strong>{echelleSalariale.taux_indexation}%</strong> par année.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <Label>Nouvelle année</Label>
              <Input
                type="number"
                min={echelleSalariale.annee + 1}
                value={nouvelleAnnee}
                onChange={(e) => setNouvelleAnnee(parseInt(e.target.value))}
              />
            </div>

            <div style={{ 
              background: '#f0fdf4', 
              padding: '1rem', 
              borderRadius: '8px',
              border: '1px solid #bbf7d0',
              marginBottom: '1rem'
            }}>
              <strong>Aperçu des nouveaux taux ({nouvelleAnnee}):</strong>
              <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
                {echelleSalariale.echelons.map(e => {
                  const anneeDiff = nouvelleAnnee - echelleSalariale.annee;
                  const facteur = Math.pow(1 + echelleSalariale.taux_indexation / 100, anneeDiff);
                  const nouveauTaux = (e.taux_horaire * facteur).toFixed(2);
                  return (
                    <div key={e.numero} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{e.libelle}:</span>
                      <span>{e.taux_horaire.toFixed(2)} → <strong>{nouveauTaux} $/h</strong></span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setShowGenererAnneeModal(false)}>
                Annuler
              </Button>
              <Button onClick={handleGenererAnnee}>
                🔄 Générer les taux
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParametresGrades;
