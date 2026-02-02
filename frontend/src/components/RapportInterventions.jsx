import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { 
  BarChart3, Users, Clock, MapPin, TrendingUp, TrendingDown, 
  Download, RefreshCw, Plus, Calendar, FileText, AlertTriangle
} from 'lucide-react';
import { apiGet, apiPost } from '../utils/api';

// Chart dynamique
const Chart = lazy(() => import("react-apexcharts"));

/**
 * RapportInterventions - Rapport statistique des interventions
 * 
 * Affiche:
 * - Statistiques globales par période
 * - Répartition par nature d'incident
 * - Statistiques par pompier (taux de présence)
 * - Comparaison année par année
 */
const RapportInterventions = ({ tenantSlug, toast }) => {
  // États
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('global'); // 'global', 'pompiers', 'comparaison', 'historique'
  
  // Données
  const [statsGlobales, setStatsGlobales] = useState(null);
  const [statsPompiers, setStatsPompiers] = useState(null);
  const [comparaisonAnnees, setComparaisonAnnees] = useState(null);
  const [historiques, setHistoriques] = useState([]);
  
  // Filtres
  const [anneeSelectionnee, setAnneeSelectionnee] = useState(new Date().getFullYear());
  const [dateDebut, setDateDebut] = useState(`${new Date().getFullYear()}-01-01`);
  const [dateFin, setDateFin] = useState(new Date().toISOString().split('T')[0]);
  const [anneesComparaison, setAnneesComparaison] = useState([new Date().getFullYear() - 1, new Date().getFullYear()]);
  
  // Modal import historique
  const [showImportModal, setShowImportModal] = useState(false);
  const [importForm, setImportForm] = useState({
    annee: new Date().getFullYear() - 1,
    total_interventions: 0,
    temps_reponse_moyen: null,
    notes: '',
    par_mois: Array(12).fill(0)
  });

  // Années disponibles pour les filtres
  const anneesDisponibles = [];
  for (let i = new Date().getFullYear(); i >= 2015; i--) {
    anneesDisponibles.push(i);
  }

  // Charger les statistiques globales
  const loadStatsGlobales = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, `/rapports/interventions/statistiques?annee=${anneeSelectionnee}`);
      setStatsGlobales(data);
    } catch (error) {
      console.error('Erreur chargement stats:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les statistiques",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Charger les stats par pompier
  const loadStatsPompiers = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, `/rapports/interventions/par-pompier?annee=${anneeSelectionnee}`);
      setStatsPompiers(data);
    } catch (error) {
      console.error('Erreur chargement stats pompiers:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les statistiques par pompier",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Charger la comparaison
  const loadComparaison = async () => {
    if (anneesComparaison.length < 2) return;
    
    try {
      setLoading(true);
      const anneesStr = anneesComparaison.sort().join(',');
      const data = await apiGet(tenantSlug, `/rapports/interventions/comparaison-annees?annees=${anneesStr}`);
      setComparaisonAnnees(data);
    } catch (error) {
      console.error('Erreur chargement comparaison:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger la comparaison",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Charger l'historique
  const loadHistorique = async () => {
    try {
      const data = await apiGet(tenantSlug, `/rapports/interventions/historique`);
      setHistoriques(data || []);
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    }
  };

  // Sauvegarder l'historique
  const handleSaveHistorique = async () => {
    try {
      setLoading(true);
      await apiPost(tenantSlug, '/rapports/interventions/import-historique', importForm);
      toast({
        title: "Succès",
        description: `Données historiques pour ${importForm.annee} enregistrées`
      });
      setShowImportModal(false);
      loadHistorique();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible d'enregistrer",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Charger les données au changement d'onglet ou d'année
  useEffect(() => {
    if (activeSubTab === 'global') {
      loadStatsGlobales();
    } else if (activeSubTab === 'pompiers') {
      loadStatsPompiers();
    } else if (activeSubTab === 'comparaison') {
      loadComparaison();
    } else if (activeSubTab === 'historique') {
      loadHistorique();
    }
  }, [activeSubTab, anneeSelectionnee]);

  // Ajouter/retirer une année de la comparaison
  const toggleAnneeComparaison = (annee) => {
    if (anneesComparaison.includes(annee)) {
      setAnneesComparaison(anneesComparaison.filter(a => a !== annee));
    } else {
      setAnneesComparaison([...anneesComparaison, annee]);
    }
  };

  // Noms des mois
  const MOIS_NOMS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

  // Rendu des statistiques globales
  const renderStatsGlobales = () => {
    if (!statsGlobales) {
      return (
        <div className="text-center py-8 text-gray-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Cliquez sur "Générer" pour afficher les statistiques</p>
        </div>
      );
    }

    const chartParNature = {
      options: {
        chart: { type: 'donut' },
        labels: Object.keys(statsGlobales.par_nature || {}),
        colors: ['#dc2626', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'],
        legend: { position: 'bottom' }
      },
      series: Object.values(statsGlobales.par_nature || {})
    };

    const chartParMois = {
      options: {
        chart: { type: 'bar' },
        xaxis: { 
          categories: (statsGlobales.par_mois || []).map(m => {
            const [annee, mois] = m.mois.split('-');
            return MOIS_NOMS[parseInt(mois) - 1] || m.mois;
          })
        },
        colors: ['#dc2626'],
        dataLabels: { enabled: true }
      },
      series: [{
        name: 'Interventions',
        data: (statsGlobales.par_mois || []).map(m => m.count)
      }]
    };

    return (
      <div className="space-y-6">
        {/* Cartes de résumé */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total interventions</p>
                  <p className="text-2xl font-bold">{statsGlobales.total_interventions}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-full">
                  <Clock className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Temps réponse moyen</p>
                  <p className="text-2xl font-bold">
                    {statsGlobales.temps_reponse_moyen_minutes 
                      ? `${statsGlobales.temps_reponse_moyen_minutes} min`
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-full">
                  <Clock className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Durée moyenne</p>
                  <p className="text-2xl font-bold">
                    {statsGlobales.duree_moyenne_minutes 
                      ? `${statsGlobales.duree_moyenne_minutes} min`
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-full">
                  <MapPin className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Secteurs actifs</p>
                  <p className="text-2xl font-bold">
                    {Object.keys(statsGlobales.par_secteur || {}).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Graphiques */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Répartition par nature d'incident
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(statsGlobales.par_nature || {}).length > 0 ? (
                <Suspense fallback={<div className="h-64 flex items-center justify-center">Chargement...</div>}>
                  <Chart
                    options={chartParNature.options}
                    series={chartParNature.series}
                    type="donut"
                    height={300}
                  />
                </Suspense>
              ) : (
                <p className="text-center text-gray-500 py-8">Aucune donnée disponible</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Évolution mensuelle
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(statsGlobales.par_mois || []).length > 0 ? (
                <Suspense fallback={<div className="h-64 flex items-center justify-center">Chargement...</div>}>
                  <Chart
                    options={chartParMois.options}
                    series={chartParMois.series}
                    type="bar"
                    height={300}
                  />
                </Suspense>
              ) : (
                <p className="text-center text-gray-500 py-8">Aucune donnée disponible</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tableau par secteur */}
        {Object.keys(statsGlobales.par_secteur || {}).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Répartition par secteur/zone
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(statsGlobales.par_secteur).map(([secteur, count]) => (
                  <div key={secteur} className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">{secteur}</p>
                    <p className="text-xl font-bold">{count}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  // Rendu des statistiques par pompier
  const renderStatsPompiers = () => {
    if (!statsPompiers) {
      return (
        <div className="text-center py-8 text-gray-500">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Cliquez sur "Générer" pour afficher les statistiques par pompier</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Résumé */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-red-600">{statsPompiers.total_interventions}</p>
              <p className="text-sm text-gray-500">Interventions totales</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-blue-600">{statsPompiers.nb_pompiers}</p>
              <p className="text-sm text-gray-500">Pompiers actifs</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-green-600">
                {statsPompiers.nb_pompiers > 0 
                  ? Math.round(statsPompiers.total_interventions / statsPompiers.nb_pompiers)
                  : 0}
              </p>
              <p className="text-sm text-gray-500">Moyenne par pompier</p>
            </CardContent>
          </Card>
        </div>

        {/* Tableau des pompiers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Détail par pompier</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3">Pompier</th>
                    <th className="text-center p-3">Matricule</th>
                    <th className="text-center p-3">Interventions</th>
                    <th className="text-center p-3">Taux global</th>
                    <th className="text-center p-3">Taux (gardes)</th>
                    <th className="text-center p-3">H. Garde Int.</th>
                    <th className="text-center p-3">H. Garde Ext.</th>
                    <th className="text-center p-3">Total heures</th>
                  </tr>
                </thead>
                <tbody>
                  {(statsPompiers.pompiers || []).map((p, idx) => (
                    <tr key={p.user_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="p-3 font-medium">{p.nom_complet}</td>
                      <td className="p-3 text-center text-gray-500">{p.matricule || '-'}</td>
                      <td className="p-3 text-center font-bold">{p.nb_interventions}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-1 rounded ${
                          p.taux_presence_global >= 10 ? 'bg-green-100 text-green-700' :
                          p.taux_presence_global >= 5 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {p.taux_presence_global}%
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-1 rounded ${
                          p.taux_presence_garde >= 50 ? 'bg-green-100 text-green-700' :
                          p.taux_presence_garde >= 25 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {p.taux_presence_garde}%
                        </span>
                      </td>
                      <td className="p-3 text-center">{p.heures_garde_interne}h</td>
                      <td className="p-3 text-center">{p.heures_garde_externe}h</td>
                      <td className="p-3 text-center font-bold">{p.total_heures_garde}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Rendu de la comparaison année par année
  const renderComparaison = () => {
    return (
      <div className="space-y-6">
        {/* Sélection des années */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sélectionner les années à comparer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {anneesDisponibles.slice(0, 10).map(annee => (
                <button
                  key={annee}
                  onClick={() => toggleAnneeComparaison(annee)}
                  className={`px-4 py-2 rounded-lg border transition-all ${
                    anneesComparaison.includes(annee)
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-red-300'
                  }`}
                >
                  {annee}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <Button onClick={loadComparaison} disabled={anneesComparaison.length < 2 || loading}>
                {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <BarChart3 className="w-4 h-4 mr-2" />}
                Comparer ({anneesComparaison.length} années)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Résultats de la comparaison */}
        {comparaisonAnnees && (
          <>
            {/* Graphique de comparaison */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Évolution du nombre d'interventions</CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-64 flex items-center justify-center">Chargement...</div>}>
                  <Chart
                    options={{
                      chart: { type: 'bar' },
                      xaxis: { categories: comparaisonAnnees.resultats.map(r => r.annee.toString()) },
                      colors: ['#dc2626'],
                      dataLabels: { enabled: true }
                    }}
                    series={[{
                      name: 'Interventions',
                      data: comparaisonAnnees.resultats.map(r => r.total_interventions)
                    }]}
                    type="bar"
                    height={300}
                  />
                </Suspense>
              </CardContent>
            </Card>

            {/* Tableau comparatif */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Détail par année</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-3">Année</th>
                        <th className="text-center p-3">Total</th>
                        <th className="text-center p-3">Variation</th>
                        <th className="text-center p-3">Moy. mensuelle</th>
                        <th className="text-center p-3">Temps réponse moy.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparaisonAnnees.resultats.map((r, idx) => (
                        <tr key={r.annee} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="p-3 font-bold">{r.annee}</td>
                          <td className="p-3 text-center font-bold text-lg">{r.total_interventions}</td>
                          <td className="p-3 text-center">
                            {r.variation_pct !== null ? (
                              <span className={`flex items-center justify-center gap-1 ${
                                r.variation_pct > 0 ? 'text-red-600' : 
                                r.variation_pct < 0 ? 'text-green-600' : 'text-gray-500'
                              }`}>
                                {r.variation_pct > 0 ? <TrendingUp className="w-4 h-4" /> : 
                                 r.variation_pct < 0 ? <TrendingDown className="w-4 h-4" /> : null}
                                {r.variation_pct > 0 ? '+' : ''}{r.variation_pct}%
                              </span>
                            ) : '-'}
                          </td>
                          <td className="p-3 text-center">{r.moyenne_mensuelle}</td>
                          <td className="p-3 text-center">
                            {r.temps_reponse_moyen ? `${r.temps_reponse_moyen} min` : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Graphique par mois comparatif */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Comparaison mensuelle</CardTitle>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div className="h-64 flex items-center justify-center">Chargement...</div>}>
                  <Chart
                    options={{
                      chart: { type: 'line' },
                      xaxis: { categories: MOIS_NOMS },
                      stroke: { curve: 'smooth', width: 2 },
                      colors: ['#dc2626', '#3b82f6', '#22c55e', '#f97316', '#8b5cf6'],
                      legend: { position: 'top' }
                    }}
                    series={comparaisonAnnees.resultats.map(r => ({
                      name: r.annee.toString(),
                      data: r.par_mois || Array(12).fill(0)
                    }))}
                    type="line"
                    height={300}
                  />
                </Suspense>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  };

  // Rendu de l'historique
  const renderHistorique = () => {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold">Données historiques</h3>
            <p className="text-sm text-gray-500">
              Importez les statistiques des années précédentes pour les comparaisons
            </p>
          </div>
          <Button onClick={() => setShowImportModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Ajouter une année
          </Button>
        </div>

        {historiques.length > 0 ? (
          <Card>
            <CardContent className="pt-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3">Année</th>
                    <th className="text-center p-3">Total interventions</th>
                    <th className="text-center p-3">Temps réponse moy.</th>
                    <th className="text-left p-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {historiques.map((h, idx) => (
                    <tr key={h.annee} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="p-3 font-bold">{h.annee}</td>
                      <td className="p-3 text-center font-bold">{h.total_interventions}</td>
                      <td className="p-3 text-center">
                        {h.temps_reponse_moyen ? `${h.temps_reponse_moyen} min` : 'N/A'}
                      </td>
                      <td className="p-3 text-gray-500">{h.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Aucune donnée historique importée</p>
              <p className="text-sm">Cliquez sur "Ajouter une année" pour commencer</p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div className="rapport-interventions space-y-6" data-testid="rapport-interventions">
      {/* En-tête avec filtres */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            Rapport Interventions
          </h3>
          <p className="text-sm text-gray-500">Statistiques et analyses des interventions</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div>
            <Label className="text-xs">Année</Label>
            <Select value={anneeSelectionnee.toString()} onValueChange={(v) => setAnneeSelectionnee(parseInt(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anneesDisponibles.map(a => (
                  <SelectItem key={a} value={a.toString()}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Button 
            onClick={() => {
              if (activeSubTab === 'global') loadStatsGlobales();
              else if (activeSubTab === 'pompiers') loadStatsPompiers();
            }}
            disabled={loading}
          >
            {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Générer
          </Button>
          
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Exporter
          </Button>
        </div>
      </div>

      {/* Sous-onglets */}
      <div className="flex gap-2 border-b pb-2">
        {[
          { id: 'global', label: 'Vue globale', icon: BarChart3 },
          { id: 'pompiers', label: 'Par pompier', icon: Users },
          { id: 'comparaison', label: 'Comparaison années', icon: TrendingUp },
          { id: 'historique', label: 'Historique', icon: FileText }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2 rounded-t-lg flex items-center gap-2 transition-all ${
              activeSubTab === tab.id
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenu selon l'onglet actif */}
      {activeSubTab === 'global' && renderStatsGlobales()}
      {activeSubTab === 'pompiers' && renderStatsPompiers()}
      {activeSubTab === 'comparaison' && renderComparaison()}
      {activeSubTab === 'historique' && renderHistorique()}

      {/* Modal Import Historique */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Importer des données historiques</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Année</Label>
              <Input
                type="number"
                value={importForm.annee}
                onChange={(e) => setImportForm({...importForm, annee: parseInt(e.target.value)})}
                min="2000"
                max={new Date().getFullYear() - 1}
              />
            </div>
            
            <div>
              <Label>Nombre total d'interventions</Label>
              <Input
                type="number"
                value={importForm.total_interventions}
                onChange={(e) => setImportForm({...importForm, total_interventions: parseInt(e.target.value) || 0})}
                min="0"
              />
            </div>
            
            <div>
              <Label>Temps de réponse moyen (minutes)</Label>
              <Input
                type="number"
                value={importForm.temps_reponse_moyen || ''}
                onChange={(e) => setImportForm({...importForm, temps_reponse_moyen: parseFloat(e.target.value) || null})}
                placeholder="Optionnel"
                step="0.1"
              />
            </div>
            
            <div>
              <Label>Notes</Label>
              <Input
                value={importForm.notes}
                onChange={(e) => setImportForm({...importForm, notes: e.target.value})}
                placeholder="Notes optionnelles..."
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleSaveHistorique} disabled={loading}>
              {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RapportInterventions;
