import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { apiGet, apiPost } from '../utils/api';

// Chart dynamique
const Chart = lazy(() => import("react-apexcharts"));

const Rapports = () => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('internes'); // 'internes' ou 'externes'
  const [activeRapport, setActiveRapport] = useState('dashboard'); // Type de rapport actif
  
  // États pour les données
  const [dashboardData, setDashboardData] = useState(null);
  const [rapportSalaires, setRapportSalaires] = useState(null);
  const [rapportDisponibilite, setRapportDisponibilite] = useState(null);
  const [rapportCoutsFormations, setRapportCoutsFormations] = useState(null);
  const [rapportBudgetaire, setRapportBudgetaire] = useState(null);
  const [rapportImmobilisations, setRapportImmobilisations] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [immobilisations, setImmobilisations] = useState([]);
  
  // États pour les filtres
  const [dateDebut, setDateDebut] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [dateFin, setDateFin] = useState(new Date().toISOString().split('T')[0]);
  const [anneeSelectionnee, setAnneeSelectionnee] = useState(new Date().getFullYear());
  
  // États pour les modals de saisie
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showImmobilisationModal, setShowImmobilisationModal] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ annee: new Date().getFullYear(), categorie: 'salaires', budget_alloue: 0, notes: '' });
  const [immobilisationForm, setImmobilisationForm] = useState({ 
    type_immobilisation: 'vehicule', 
    nom: '', 
    date_acquisition: new Date().toISOString().split('T')[0], 
    cout_acquisition: 0, 
    cout_entretien_annuel: 0, 
    etat: 'bon', 
    notes: '' 
  });

  useEffect(() => {
    if (user?.role === 'admin' && tenantSlug) {
      loadData();
    }
  }, [user, tenantSlug, activeTab, activeRapport, anneeSelectionnee]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'internes') {
        if (activeRapport === 'dashboard') {
          const dashData = await apiGet(tenantSlug, '/rapports/dashboard-interne');
          setDashboardData(dashData);
        } else if (activeRapport === 'salaires') {
          // Ne pas charger automatiquement, attendre que l'utilisateur clique sur "Générer"
        } else if (activeRapport === 'disponibilite') {
          // Ne pas charger automatiquement
        } else if (activeRapport === 'formations') {
          // Ne pas charger automatiquement
        }
      } else if (activeTab === 'externes') {
        if (activeRapport === 'budgetaire') {
          const [budgetsData] = await Promise.all([
            apiGet(tenantSlug, `/rapports/budgets?annee=${anneeSelectionnee}`)
          ]);
          setBudgets(budgetsData || []);
          
          // Charger aussi le rapport budgétaire agrégé
          try {
            const rapportBudg = await apiGet(tenantSlug, `/rapports/tableau-bord-budgetaire?annee=${anneeSelectionnee}`);
            setRapportBudgetaire(rapportBudg);
          } catch (e) {
            console.log('Pas de données budgétaires agrégées');
          }
        } else if (activeRapport === 'immobilisations') {
          const [immobData, rapportImmob] = await Promise.all([
            apiGet(tenantSlug, '/rapports/immobilisations'),
            apiGet(tenantSlug, '/rapports/rapport-immobilisations')
          ]);
          setImmobilisations(immobData || []);
          setRapportImmobilisations(rapportImmob);
        }
      }
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast({ title: "Erreur", description: "Impossible de charger les données", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleGenererRapportSalaires = async () => {
    setLoading(true);
    try {
      const params = `date_debut=${dateDebut}&date_fin=${dateFin}`;
      const rapport = await apiGet(tenantSlug, `/rapports/couts-salariaux?${params}`);
      setRapportSalaires(rapport);
      toast({ title: "Succès", description: "Rapport généré" });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de générer le rapport", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleGenererRapportDisponibilite = async () => {
    setLoading(true);
    try {
      const params = `date_debut=${dateDebut}&date_fin=${dateFin}`;
      const rapport = await apiGet(tenantSlug, `/rapports/disponibilite?${params}`);
      setRapportDisponibilite(rapport);
      toast({ title: "Succès", description: "Rapport généré" });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de générer le rapport", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleGenererRapportFormations = async () => {
    setLoading(true);
    try {
      const rapport = await apiGet(tenantSlug, `/rapports/couts-formations?annee=${anneeSelectionnee}`);
      setRapportCoutsFormations(rapport);
      toast({ title: "Succès", description: "Rapport généré" });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de générer le rapport", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleSaveBudget = async () => {
    try {
      await apiPost(tenantSlug, '/rapports/budgets', budgetForm);
      toast({ title: "Succès", description: "Budget ajouté" });
      setShowBudgetModal(false);
      setBudgetForm({ annee: new Date().getFullYear(), categorie: 'salaires', budget_alloue: 0, notes: '' });
      loadData();
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible d'ajouter le budget", variant: "destructive" });
    }
  };

  const handleSaveImmobilisation = async () => {
    try {
      await apiPost(tenantSlug, '/rapports/immobilisations', immobilisationForm);
      toast({ title: "Succès", description: "Immobilisation ajoutée" });
      setShowImmobilisationModal(false);
      setImmobilisationForm({ 
        type_immobilisation: 'vehicule', 
        nom: '', 
        date_acquisition: new Date().toISOString().split('T')[0], 
        cout_acquisition: 0, 
        cout_entretien_annuel: 0, 
        etat: 'bon', 
        notes: '' 
      });
      loadData();
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible d'ajouter l'immobilisation", variant: "destructive" });
    }
  };

  const handleExportPDF = async (typeRapport) => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL;
      const token = localStorage.getItem(`${tenantSlug}_token`);
      
      let url = '';
      if (typeRapport === 'dashboard') {
        url = `${backendUrl}/api/${tenantSlug}/rapports/export-dashboard-pdf`;
      } else if (typeRapport === 'salaires') {
        url = `${backendUrl}/api/${tenantSlug}/rapports/export-salaires-pdf?date_debut=${dateDebut}&date_fin=${dateFin}`;
      } else if (typeRapport === 'budgetaire') {
        toast({ title: "Info", description: "Export PDF Budgétaire en développement" });
        return;
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Erreur lors de l\'export');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `rapport_${typeRapport}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      
      toast({ title: "Succès", description: `Rapport PDF téléchargé` });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible d'exporter le PDF", variant: "destructive" });
    }
  };

  const handleExportExcel = async (typeRapport) => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL;
      const token = localStorage.getItem(`${tenantSlug}_token`);
      
      let url = '';
      if (typeRapport === 'salaires') {
        url = `${backendUrl}/api/${tenantSlug}/rapports/export-salaires-excel?date_debut=${dateDebut}&date_fin=${dateFin}`;
      } else {
        toast({ title: "Info", description: "Export Excel en développement pour ce rapport" });
        return;
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Erreur lors de l\'export');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `rapport_${typeRapport}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      
      toast({ title: "Succès", description: `Rapport Excel téléchargé` });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible d'exporter l'Excel", variant: "destructive" });
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="access-denied">
        <h1>Accès refusé</h1>
        <p>Cette section est réservée aux administrateurs.</p>
      </div>
    );
  }

  if (loading) return <div className="loading">Chargement des rapports...</div>;

  return (
    <div className="module-rapports-nfpa">
      <div className="module-header">
        <div>
          <h1>📈 Rapports et Analyses</h1>
          <p>Rapports internes et externes pour la gestion et la communication</p>
        </div>
      </div>

      {/* Onglets principaux - Style unifié */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2 flex-wrap">
        <button 
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'internes' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => { setActiveTab('internes'); setActiveRapport('dashboard'); }}
        >
          📊 Rapports Internes
        </button>
        <button 
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'externes' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => { setActiveTab('externes'); setActiveRapport('budgetaire'); }}
        >
          📈 Rapports Externes
        </button>
      </div>

      {/* SECTION RAPPORTS INTERNES */}
      {activeTab === 'internes' && (
        <div className="rapports-internes">
          {/* Sous-navigation */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <button 
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeRapport === 'dashboard' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setActiveRapport('dashboard')}
            >
              📊 Dashboard
            </button>
            <button 
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeRapport === 'salaires' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setActiveRapport('salaires')}
            >
              💰 Coûts Salariaux
            </button>
            <button 
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeRapport === 'disponibilite' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setActiveRapport('disponibilite')}
            >
              📅 Disponibilité
            </button>
            <button 
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeRapport === 'formations' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setActiveRapport('formations')}
            >
              🎓 Formations
            </button>
          </div>

          {/* Dashboard Interne */}
          {activeRapport === 'dashboard' && dashboardData && (
            <div className="dashboard-interne">
              <h2>📊 Dashboard Interne - {dashboardData.periode}</h2>
              
              <div className="kpi-grid">
                <div className="kpi-card" style={{background: '#FEF3C7'}}>
                  <h3>{dashboardData.heures_travaillees_mois}h</h3>
                  <p>Heures travaillées ce mois</p>
                </div>
                <div className="kpi-card" style={{background: '#FCA5A5'}}>
                  <h3>${dashboardData.cout_salarial_mois.toLocaleString()}</h3>
                  <p>Coût salarial du mois</p>
                </div>
                <div className="kpi-card" style={{background: '#D1FAE5'}}>
                  <h3>{dashboardData.pompiers_disponibles}</h3>
                  <p>Pompiers disponibles</p>
                </div>
                <div className="kpi-card" style={{background: '#DBEAFE'}}>
                  <h3>{dashboardData.total_pompiers}</h3>
                  <p>Total pompiers</p>
                </div>
              </div>
              
              {/* Graphiques */}
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem', marginTop: '2rem'}}>
                {/* Graphique Donut - Disponibilité */}
                <div style={{background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #E5E7EB'}}>
                  <h3 style={{marginBottom: '1rem'}}>Disponibilité du Personnel</h3>
                  <Chart
                    options={{
                      chart: { type: 'donut' },
                      labels: ['Disponibles', 'Non disponibles'],
                      colors: ['#10B981', '#EF4444'],
                      legend: { position: 'bottom' },
                      dataLabels: { enabled: true },
                      plotOptions: {
                        pie: {
                          donut: {
                            labels: {
                              show: true,
                              total: {
                                show: true,
                                label: 'Total',
                                formatter: () => dashboardData.total_pompiers
                              }
                            }
                          }
                        }
                      }
                    }}
                    series={[dashboardData.pompiers_disponibles, dashboardData.total_pompiers - dashboardData.pompiers_disponibles]}
                    type="donut"
                    height={300}
                  />
                </div>

                {/* Graphique Barres - Coûts */}
                <div style={{background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #E5E7EB'}}>
                  <h3 style={{marginBottom: '1rem'}}>Évolution Coûts Mensuels</h3>
                  <Chart
                    options={{
                      chart: { type: 'bar' },
                      xaxis: { categories: ['Janv', 'Févr', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil', 'Août', 'Sept'] },
                      colors: ['#FCA5A5'],
                      plotOptions: {
                        bar: {
                          borderRadius: 8,
                          dataLabels: { position: 'top' }
                        }
                      },
                      dataLabels: {
                        enabled: true,
                        formatter: (val) => `$${Math.round(val/1000)}k`,
                        offsetY: -20,
                        style: { fontSize: '12px', colors: ['#6B7280'] }
                      }
                    }}
                    series={[{
                      name: 'Coûts',
                      data: [25000, 28000, 30000, 27000, 29000, 31000, 32000, 30000, dashboardData.cout_salarial_mois]
                    }]}
                    type="bar"
                    height={300}
                  />
                </div>
              </div>
              
              <div style={{marginTop: '2rem', display: 'flex', gap: '1rem'}}>
                <Button onClick={() => handleExportPDF('dashboard')}>📄 Export PDF</Button>
                <Button variant="outline" onClick={() => handleExportExcel('dashboard')}>📊 Export Excel</Button>
              </div>
            </div>
          )}

          {/* Rapport Coûts Salariaux */}
          {activeRapport === 'salaires' && (
            <div className="rapport-salaires">
              <h2>💰 Rapport de Coûts Salariaux Détaillés</h2>
              
              <div className="filtres-grid" style={{marginBottom: '2rem'}}>
                <div>
                  <Label>Date début</Label>
                  <Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
                </div>
                <div>
                  <Label>Date fin</Label>
                  <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} />
                </div>
                <div style={{display: 'flex', alignItems: 'end'}}>
                  <Button onClick={handleGenererRapportSalaires}>Générer le rapport</Button>
                </div>
              </div>

              {rapportSalaires ? (
                <div>
                  {/* Résumé */}
                  <div className="kpi-grid" style={{marginBottom: '2rem'}}>
                    <div className="kpi-card" style={{background: '#FCA5A5'}}>
                      <h3>${rapportSalaires.cout_total.toLocaleString()}</h3>
                      <p>Coût Total</p>
                    </div>
                    <div className="kpi-card" style={{background: '#D1FAE5'}}>
                      <h3>{rapportSalaires.nombre_employes}</h3>
                      <p>Employés</p>
                    </div>
                    <div className="kpi-card" style={{background: '#DBEAFE'}}>
                      <h3>
                        {rapportSalaires.employes.reduce((sum, e) => sum + e.heures_travaillees, 0)}h
                      </h3>
                      <p>Total Heures</p>
                    </div>
                  </div>

                  {/* Tableau détaillé */}
                  <div className="salaires-table">
                    <div className="table-header">
                      <div className="header-cell">Nom</div>
                      <div className="header-cell">Matricule</div>
                      <div className="header-cell">Type</div>
                      <div className="header-cell">Heures</div>
                      <div className="header-cell">Taux/h</div>
                      <div className="header-cell">Coût Total</div>
                    </div>
                    {rapportSalaires.employes.map((emp, idx) => (
                      <div key={idx} className="table-row">
                        <div className="table-cell">{emp.nom}</div>
                        <div className="table-cell">{emp.matricule}</div>
                        <div className="table-cell">
                          <span className={`badge ${emp.type_emploi}`}>
                            {emp.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'}
                          </span>
                        </div>
                        <div className="table-cell">{emp.heures_travaillees}h</div>
                        <div className="table-cell">${emp.taux_horaire}/h</div>
                        <div className="table-cell" style={{fontWeight: 'bold', color: '#DC2626'}}>
                          ${emp.cout_total.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Exports */}
                  <div style={{marginTop: '2rem', display: 'flex', gap: '1rem'}}>
                    <Button onClick={() => handleExportPDF('salaires')}>📄 Export PDF</Button>
                    <Button variant="outline" onClick={() => handleExportExcel('salaires')}>📊 Export Excel</Button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p>Sélectionnez une période et cliquez sur "Générer le rapport"</p>
                </div>
              )}
            </div>
          )}
          {/* Rapport Disponibilité */}
          {activeRapport === 'disponibilite' && (
            <div className="rapport-disponibilite">
              <h2>📅 Rapport de Disponibilité/Indisponibilité</h2>
              
              <div className="filtres-grid" style={{marginBottom: '2rem'}}>
                <div>
                  <Label>Date début</Label>
                  <Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
                </div>
                <div>
                  <Label>Date fin</Label>
                  <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} />
                </div>
                <div style={{display: 'flex', alignItems: 'end'}}>
                  <Button onClick={handleGenererRapportDisponibilite}>Générer le rapport</Button>
                </div>
              </div>

              {rapportDisponibilite ? (
                <div>
                  {/* Résumé avec graphique */}
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem'}}>
                    <div>
                      <div className="kpi-grid" style={{gridTemplateColumns: '1fr 1fr'}}>
                        <div className="kpi-card" style={{background: '#D1FAE5'}}>
                          <h3>{rapportDisponibilite.total_jours_disponibles}</h3>
                          <p>Jours Disponibles</p>
                        </div>
                        <div className="kpi-card" style={{background: '#FCA5A5'}}>
                          <h3>{rapportDisponibilite.total_jours_indisponibles}</h3>
                          <p>Jours Indisponibles</p>
                        </div>
                        <div className="kpi-card" style={{background: '#DBEAFE', gridColumn: 'span 2'}}>
                          <h3>{rapportDisponibilite.taux_disponibilite_global}%</h3>
                          <p>Taux de Disponibilité Global</p>
                        </div>
                      </div>
                    </div>
                    <div style={{background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid #E5E7EB'}}>
                      <Chart
                        options={{
                          chart: { type: 'pie' },
                          labels: ['Disponibles', 'Indisponibles'],
                          colors: ['#10B981', '#EF4444'],
                          legend: { position: 'bottom' }
                        }}
                        series={[rapportDisponibilite.total_jours_disponibles, rapportDisponibilite.total_jours_indisponibles]}
                        type="pie"
                        height={250}
                      />
                    </div>
                  </div>

                  {/* Tableau par employé */}
                  <div className="salaires-table">
                    <div className="table-header">
                      <div className="header-cell">Nom</div>
                      <div className="header-cell">Grade</div>
                      <div className="header-cell">Jours Dispo.</div>
                      <div className="header-cell">Jours Indispo.</div>
                      <div className="header-cell">Taux %</div>
                      <div className="header-cell">Motifs</div>
                    </div>
                    {rapportDisponibilite.employes.map((emp, idx) => (
                      <div key={idx} className="table-row">
                        <div className="table-cell">{emp.nom}</div>
                        <div className="table-cell">{emp.grade}</div>
                        <div className="table-cell" style={{color: '#10B981', fontWeight: 'bold'}}>{emp.jours_disponibles}</div>
                        <div className="table-cell" style={{color: '#EF4444', fontWeight: 'bold'}}>{emp.jours_indisponibles}</div>
                        <div className="table-cell">{emp.taux_disponibilite}%</div>
                        <div className="table-cell" style={{fontSize: '0.85rem'}}>
                          {Object.entries(emp.motifs_indisponibilite).map(([motif, count]) => (
                            <span key={motif} style={{display: 'block'}}>{motif}: {count}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{marginTop: '2rem', display: 'flex', gap: '1rem'}}>
                    <Button onClick={() => handleExportPDF('disponibilite')}>📄 Export PDF</Button>
                    <Button variant="outline" onClick={() => handleExportExcel('disponibilite')}>📊 Export Excel</Button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p>Sélectionnez une période et cliquez sur "Générer le rapport"</p>
                </div>
              )}
            </div>
          )}

          {/* Rapport Coûts Formations */}
          {activeRapport === 'formations' && (
            <div className="rapport-formations">
              <h2>🎓 Rapport de Coûts de Formation</h2>
              
              <div className="filtres-grid" style={{marginBottom: '2rem'}}>
                <div>
                  <Label>Année</Label>
                  <select 
                    className="form-select" 
                    value={anneeSelectionnee} 
                    onChange={e => setAnneeSelectionnee(parseInt(e.target.value))}
                  >
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div style={{display: 'flex', alignItems: 'end'}}>
                  <Button onClick={handleGenererRapportFormations}>Générer le rapport</Button>
                </div>
              </div>

              {rapportCoutsFormations ? (
                <div>
                  {/* KPIs */}
                  <div className="kpi-grid" style={{marginBottom: '2rem'}}>
                    <div className="kpi-card" style={{background: '#FCA5A5'}}>
                      <h3>${rapportCoutsFormations.cout_total.toLocaleString()}</h3>
                      <p>Coût Total</p>
                    </div>
                    <div className="kpi-card" style={{background: '#D1FAE5'}}>
                      <h3>{rapportCoutsFormations.nombre_formations}</h3>
                      <p>Formations</p>
                    </div>
                    <div className="kpi-card" style={{background: '#DBEAFE'}}>
                      <h3>{rapportCoutsFormations.nombre_total_participants}</h3>
                      <p>Participants</p>
                    </div>
                    <div className="kpi-card" style={{background: '#FEF3C7'}}>
                      <h3>{rapportCoutsFormations.heures_totales}h</h3>
                      <p>Heures Totales</p>
                    </div>
                  </div>

                  {/* Tableau formations */}
                  <div className="salaires-table">
                    <div className="table-header">
                      <div className="header-cell">Formation</div>
                      <div className="header-cell">Date</div>
                      <div className="header-cell">Durée</div>
                      <div className="header-cell">Participants</div>
                      <div className="header-cell">Coût Formation</div>
                      <div className="header-cell">Coût Salarial</div>
                    </div>
                    {rapportCoutsFormations.formations.map((formation, idx) => (
                      <div key={idx} className="table-row">
                        <div className="table-cell">{formation.nom_formation}</div>
                        <div className="table-cell">{new Date(formation.date).toLocaleDateString('fr-FR')}</div>
                        <div className="table-cell">{formation.duree_heures}h</div>
                        <div className="table-cell">{formation.nombre_participants}</div>
                        <div className="table-cell">${formation.cout_formation.toLocaleString()}</div>
                        <div className="table-cell" style={{fontWeight: 'bold', color: '#DC2626'}}>
                          ${formation.cout_total.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{marginTop: '2rem', display: 'flex', gap: '1rem'}}>
                    <Button onClick={() => handleExportPDF('formations')}>📄 Export PDF</Button>
                    <Button variant="outline" onClick={() => handleExportExcel('formations')}>📊 Export Excel</Button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p>Sélectionnez une année et cliquez sur "Générer le rapport"</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SECTION RAPPORTS EXTERNES */}
      {activeTab === 'externes' && (
        <div className="rapports-externes">
          {/* Sous-navigation */}
          <div className="rapports-sub-nav">
            <button className={activeRapport === 'budgetaire' ? 'active' : ''} onClick={() => setActiveRapport('budgetaire')}>
              💰 Tableau Budgétaire
            </button>
            <button className={activeRapport === 'immobilisations' ? 'active' : ''} onClick={() => setActiveRapport('immobilisations')}>
              🚒 Immobilisations
            </button>
          </div>

          {/* Tableau de Bord Budgétaire */}
          {activeRapport === 'budgetaire' && (
            <div className="rapport-budgetaire">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
                <h2>💰 Tableau de Bord Budgétaire - {anneeSelectionnee}</h2>
                <div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
                  <select 
                    className="form-select" 
                    value={anneeSelectionnee} 
                    onChange={e => setAnneeSelectionnee(parseInt(e.target.value))}
                  >
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <Button onClick={() => setShowBudgetModal(true)}>➕ Ajouter Budget</Button>
                </div>
              </div>

              {budgets.length > 0 ? (
                <div>
                  <div className="budgets-grid">
                    {budgets.map(budget => {
                      const pourcentage = budget.budget_alloue > 0 ? (budget.budget_consomme / budget.budget_alloue * 100) : 0;
                      return (
                        <div key={budget.id} className="budget-card">
                          <h3>{budget.categorie}</h3>
                          <div className="budget-montants">
                            <div>
                              <p className="budget-label">Alloué</p>
                              <p className="budget-value">${budget.budget_alloue.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="budget-label">Consommé</p>
                              <p className="budget-value">${budget.budget_consomme.toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="budget-bar">
                            <div 
                              className="budget-progress" 
                              style={{
                                width: `${Math.min(pourcentage, 100)}%`,
                                background: pourcentage > 90 ? '#EF4444' : pourcentage > 75 ? '#F59E0B' : '#10B981'
                              }}
                            />
                          </div>
                          <p style={{fontSize: '0.9rem', color: '#6B7280', marginTop: '0.5rem'}}>
                            {pourcentage.toFixed(1)}% utilisé
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Graphique Budget Global */}
                  {rapportBudgetaire && (
                    <div style={{marginTop: '2rem', background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #E5E7EB'}}>
                      <h3 style={{marginBottom: '1rem'}}>Vue d'ensemble Budgétaire - {anneeSelectionnee}</h3>
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem'}}>
                        <div>
                          <Chart
                            options={{
                              chart: { type: 'donut' },
                              labels: rapportBudgetaire.par_categorie.map(b => b.categorie),
                              colors: ['#FCA5A5', '#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899'],
                              legend: { position: 'bottom' },
                              plotOptions: {
                                pie: {
                                  donut: {
                                    labels: {
                                      show: true,
                                      total: {
                                        show: true,
                                        label: 'Total Alloué',
                                        formatter: () => `$${(rapportBudgetaire.budget_total_alloue/1000).toFixed(0)}k`
                                      }
                                    }
                                  }
                                }
                              }
                            }}
                            series={rapportBudgetaire.par_categorie.map(b => b.budget_alloue)}
                            type="donut"
                            height={300}
                          />
                        </div>
                        <div>
                          <div className="kpi-grid" style={{gridTemplateColumns: '1fr 1fr'}}>
                            <div className="kpi-card" style={{background: '#FEF3C7'}}>
                              <h3>${rapportBudgetaire.budget_total_alloue.toLocaleString()}</h3>
                              <p>Budget Alloué</p>
                            </div>
                            <div className="kpi-card" style={{background: '#FCA5A5'}}>
                              <h3>${rapportBudgetaire.budget_total_consomme.toLocaleString()}</h3>
                              <p>Budget Consommé</p>
                            </div>
                            <div className="kpi-card" style={{background: '#D1FAE5', gridColumn: 'span 2'}}>
                              <h3>{rapportBudgetaire.pourcentage_global}%</h3>
                              <p>Taux d'utilisation global</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div style={{marginTop: '2rem', display: 'flex', gap: '1rem'}}>
                    <Button onClick={() => handleExportPDF('budgetaire')}>📄 Export PDF</Button>
                    <Button variant="outline" onClick={() => handleExportExcel('budgetaire')}>📊 Export Excel</Button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p>Aucun budget pour {anneeSelectionnee}. Cliquez sur "Ajouter Budget" pour commencer.</p>
                </div>
              )}
            </div>
          )}

          {/* Immobilisations */}
          {activeRapport === 'immobilisations' && (
            <div className="rapport-immobilisations">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
                <h2>🚒 Rapport sur les Immobilisations</h2>
                <Button onClick={() => setShowImmobilisationModal(true)}>➕ Ajouter Immobilisation</Button>
              </div>

              {rapportImmobilisations ? (
                <div>
                  {/* Statistiques globales */}
                  <div className="kpi-grid" style={{marginBottom: '2rem'}}>
                    <div className="kpi-card" style={{background: '#FEF3C7'}}>
                      <h3>{rapportImmobilisations.statistiques.nombre_vehicules}</h3>
                      <p>Véhicules</p>
                    </div>
                    <div className="kpi-card" style={{background: '#D1FAE5'}}>
                      <h3>{rapportImmobilisations.statistiques.nombre_equipements}</h3>
                      <p>Équipements</p>
                    </div>
                    <div className="kpi-card" style={{background: '#FCA5A5'}}>
                      <h3>${rapportImmobilisations.statistiques.cout_acquisition_total.toLocaleString()}</h3>
                      <p>Coût Acquisition</p>
                    </div>
                    <div className="kpi-card" style={{background: '#DBEAFE'}}>
                      <h3>${rapportImmobilisations.statistiques.cout_entretien_annuel_total.toLocaleString()}</h3>
                      <p>Entretien Annuel</p>
                    </div>
                  </div>

                  {/* Véhicules */}
                  {rapportImmobilisations.vehicules.length > 0 && (
                    <div style={{marginBottom: '2rem'}}>
                      <h3 style={{marginBottom: '1rem'}}>🚒 Véhicules (Âge moyen: {rapportImmobilisations.statistiques.age_moyen_vehicules} ans)</h3>
                      <div className="immobilisations-grid">
                        {rapportImmobilisations.vehicules.map(vehicule => (
                          <div key={vehicule.id} className="immobilisation-card">
                            <h4>{vehicule.nom}</h4>
                            <div className="immobilisation-details">
                              <p><strong>Acquisition:</strong> {new Date(vehicule.date_acquisition).toLocaleDateString('fr-FR')}</p>
                              <p><strong>Âge:</strong> {vehicule.age_annees} ans</p>
                              <p><strong>État:</strong> <span className={`badge ${vehicule.etat}`}>{vehicule.etat}</span></p>
                              <p><strong>Coût:</strong> ${vehicule.cout_acquisition.toLocaleString()}</p>
                              <p><strong>Entretien:</strong> ${vehicule.cout_entretien_annuel.toLocaleString()}/an</p>
                              {vehicule.date_remplacement_prevue && (
                                <p><strong>Remplacement prévu:</strong> {new Date(vehicule.date_remplacement_prevue).toLocaleDateString('fr-FR')}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Équipements */}
                  {rapportImmobilisations.equipements.length > 0 && (
                    <div>
                      <h3 style={{marginBottom: '1rem'}}>🔧 Équipements (Âge moyen: {rapportImmobilisations.statistiques.age_moyen_equipements} ans)</h3>
                      <div className="immobilisations-grid">
                        {rapportImmobilisations.equipements.map(equip => (
                          <div key={equip.id} className="immobilisation-card">
                            <h4>{equip.nom}</h4>
                            <div className="immobilisation-details">
                              <p><strong>Acquisition:</strong> {new Date(equip.date_acquisition).toLocaleDateString('fr-FR')}</p>
                              <p><strong>Âge:</strong> {equip.age_annees} ans</p>
                              <p><strong>État:</strong> <span className={`badge ${equip.etat}`}>{equip.etat}</span></p>
                              <p><strong>Coût:</strong> ${equip.cout_acquisition.toLocaleString()}</p>
                              <p><strong>Entretien:</strong> ${equip.cout_entretien_annuel.toLocaleString()}/an</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{marginTop: '2rem', display: 'flex', gap: '1rem'}}>
                    <Button onClick={() => handleExportPDF('immobilisations')}>📄 Export PDF</Button>
                    <Button variant="outline" onClick={() => handleExportExcel('immobilisations')}>📊 Export Excel</Button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p>Aucune immobilisation. Cliquez sur "Ajouter Immobilisation" pour commencer.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal Budget */}
      {showBudgetModal && (
        <div className="modal-overlay" onClick={() => setShowBudgetModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>➕ Ajouter un Budget</h2>
              <Button variant="ghost" onClick={() => setShowBudgetModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div>
                  <Label>Année</Label>
                  <Input type="number" value={budgetForm.annee} onChange={e => setBudgetForm({...budgetForm, annee: parseInt(e.target.value)})} />
                </div>
                <div>
                  <Label>Catégorie</Label>
                  <select 
                    className="form-select" 
                    value={budgetForm.categorie} 
                    onChange={e => setBudgetForm({...budgetForm, categorie: e.target.value})}
                  >
                    <option value="salaires">Salaires</option>
                    <option value="formations">Formations</option>
                    <option value="equipements">Équipements</option>
                    <option value="carburant">Carburant</option>
                    <option value="entretien">Entretien</option>
                    <option value="autres">Autres</option>
                  </select>
                </div>
                <div>
                  <Label>Budget Alloué ($)</Label>
                  <Input type="number" value={budgetForm.budget_alloue} onChange={e => setBudgetForm({...budgetForm, budget_alloue: parseFloat(e.target.value)})} />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input value={budgetForm.notes} onChange={e => setBudgetForm({...budgetForm, notes: e.target.value})} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="outline" onClick={() => setShowBudgetModal(false)}>Annuler</Button>
              <Button onClick={handleSaveBudget}>Enregistrer</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Immobilisation */}
      {showImmobilisationModal && (
        <div className="modal-overlay" onClick={() => setShowImmobilisationModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>➕ Ajouter une Immobilisation</h2>
              <Button variant="ghost" onClick={() => setShowImmobilisationModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div>
                  <Label>Type</Label>
                  <select 
                    className="form-select" 
                    value={immobilisationForm.type_immobilisation} 
                    onChange={e => setImmobilisationForm({...immobilisationForm, type_immobilisation: e.target.value})}
                  >
                    <option value="vehicule">Véhicule</option>
                    <option value="equipement_majeur">Équipement Majeur</option>
                  </select>
                </div>
                <div>
                  <Label>Nom</Label>
                  <Input 
                    value={immobilisationForm.nom} 
                    onChange={e => setImmobilisationForm({...immobilisationForm, nom: e.target.value})} 
                    placeholder="Ex: Camion-citerne 2024"
                  />
                </div>
                <div>
                  <Label>Date d'acquisition</Label>
                  <Input 
                    type="date" 
                    value={immobilisationForm.date_acquisition} 
                    onChange={e => setImmobilisationForm({...immobilisationForm, date_acquisition: e.target.value})} 
                  />
                </div>
                <div>
                  <Label>Coût d'acquisition ($)</Label>
                  <Input 
                    type="number" 
                    value={immobilisationForm.cout_acquisition} 
                    onChange={e => setImmobilisationForm({...immobilisationForm, cout_acquisition: parseFloat(e.target.value)})} 
                  />
                </div>
                <div>
                  <Label>Coût entretien annuel ($)</Label>
                  <Input 
                    type="number" 
                    value={immobilisationForm.cout_entretien_annuel} 
                    onChange={e => setImmobilisationForm({...immobilisationForm, cout_entretien_annuel: parseFloat(e.target.value)})} 
                  />
                </div>
                <div>
                  <Label>État</Label>
                  <select 
                    className="form-select" 
                    value={immobilisationForm.etat} 
                    onChange={e => setImmobilisationForm({...immobilisationForm, etat: e.target.value})}
                  >
                    <option value="bon">Bon</option>
                    <option value="moyen">Moyen</option>
                    <option value="mauvais">Mauvais</option>
                  </select>
                </div>
                <div style={{gridColumn: 'span 2'}}>
                  <Label>Notes</Label>
                  <Input 
                    value={immobilisationForm.notes} 
                    onChange={e => setImmobilisationForm({...immobilisationForm, notes: e.target.value})} 
                    placeholder="Notes additionnelles..."
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="outline" onClick={() => setShowImmobilisationModal(false)}>Annuler</Button>
              <Button onClick={handleSaveImmobilisation}>Enregistrer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Import Bâtiments Component - Support CSV, Excel et HTML

export default Rapports;
