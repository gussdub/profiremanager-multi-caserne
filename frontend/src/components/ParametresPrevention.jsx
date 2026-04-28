import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { apiGet, apiPut, apiPost, apiDelete } from '../utils/api';
import { 
  Settings, FileText, Calendar, Users, BookOpen, 
  Save, RefreshCw, Plus, Edit2, Trash2, Clock, Search, Filter, AlertTriangle, ClipboardList
} from 'lucide-react';

// Lazy load des composants
const ParametresRefViolations = lazy(() => import('./ParametresRefViolations'));
const GrillesInspection = lazy(() => import('./GrillesInspectionComponents'));
const BibliothequeReferentiels = lazy(() => import('./BibliothequeReferentiels'));

/**
 * ParametresPrevention - Paramètres du module prévention
 * Style avec onglets rouges comme dans les autres paramètres de l'application
 */
const ParametresPrevention = ({ tenantSlug, currentUser, toast: toastProp }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  
  // Paramètres généraux
  const [parametres, setParametres] = useState({
    recurrence_inspections: 1,
    nombre_visites_requises: 1,
    superviseur_prevention_id: '',
    delai_rappel_inspection_jours: 30,
    auto_creation_avis: true
  });
  
  const [users, setUsers] = useState([]);
  const [preventionnistes, setPreventionnistes] = useState([]);
  const [inlineToast, setInlineToast] = useState(null);

  // Toast helper - fallback sans window.alert pour les environnements sandboxés
  const toast = toastProp || ((opts) => {
    console.log(opts.variant === 'destructive' ? '❌' : '✅', opts.title, opts.description);
    setInlineToast({
      type: opts.variant === 'destructive' ? 'error' : 'success',
      title: opts.title,
      description: opts.description
    });
    setTimeout(() => setInlineToast(null), 4000);
  });

  // Onglets disponibles
  const TABS = [
    { id: 'general', label: 'Paramètres généraux', icon: Settings, description: 'Configuration de base' },
    { id: 'bibliotheque', label: 'Bibliothèque de Référentiels', icon: BookOpen, description: 'Codes et règlements' },
    { id: 'referentiel', label: 'Référentiels Custom', icon: FileText, description: 'Vos articles personnalisés' },
    { id: 'grilles', label: 'Grilles d\'inspection', icon: ClipboardList, description: 'Modèles de formulaires' },
  ];

  useEffect(() => {
    fetchData();
  }, [tenantSlug]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const usersData = await apiGet(tenantSlug, '/users');
      setUsers(usersData);
      const prevData = usersData.filter(u => u.est_preventionniste === true);
      setPreventionnistes(prevData);
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await apiPut(tenantSlug, '/prevention/parametres', parametres);
      toast({ title: "Succès", description: "Paramètres sauvegardés" });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de sauvegarder", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setParametres(prev => ({ ...prev, [field]: value }));
  };

  // Vérifier si l'utilisateur est admin
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'superadmin') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>⚠️ Accès restreint</h2>
        <p>Seuls les administrateurs peuvent modifier les paramètres de prévention.</p>
      </div>
    );
  }

  // Rendu du contenu selon l'onglet actif
  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <>
            {/* Inline Toast Fallback */}
            {inlineToast && (
              <div 
                style={{
                  position: 'fixed',
                  bottom: '1rem',
                  right: '1rem',
                  padding: '1rem',
                  borderRadius: '8px',
                  backgroundColor: inlineToast.type === 'error' ? '#fef2f2' : '#f0fdf4',
                  border: `1px solid ${inlineToast.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
                  color: inlineToast.type === 'error' ? '#991b1b' : '#166534',
                  zIndex: 1000,
                  maxWidth: '300px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                }}
              >
                <div style={{ fontWeight: 600 }}>{inlineToast.title}</div>
                {inlineToast.description && (
                  <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>{inlineToast.description}</div>
                )}
              </div>
            )}

            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Récurrence des Inspections
                  </h3>
                
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Fréquence des inspections
                    </label>
                    <select
                      value={parametres.recurrence_inspections}
                      onChange={(e) => handleChange('recurrence_inspections', parseInt(e.target.value))}
                      className="w-full p-2.5 border border-gray-300 rounded-lg"
                    >
                      <option value={1}>Tous les ans</option>
                      <option value={2}>Tous les 2 ans</option>
                      <option value={3}>Tous les 3 ans</option>
                      <option value={5}>Tous les 5 ans</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Délai entre deux inspections d'un même bâtiment
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre de visites requises
                    </label>
                    <select
                      value={parametres.nombre_visites_requises}
                      onChange={(e) => handleChange('nombre_visites_requises', parseInt(e.target.value))}
                      className="w-full p-2.5 border border-gray-300 rounded-lg"
                    >
                      <option value={1}>1 visite</option>
                      <option value={2}>2 visites</option>
                      <option value={3}>3 visites</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Nombre de visites avant validation complète
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Rappel avant échéance (jours)
                    </label>
                    <input
                      type="number"
                      min={7}
                      max={90}
                      value={parametres.delai_rappel_inspection_jours || 30}
                      onChange={(e) => handleChange('delai_rappel_inspection_jours', parseInt(e.target.value))}
                      className="w-full p-2.5 border border-gray-300 rounded-lg"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Envoyer un rappel X jours avant la date d'échéance
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Responsable de la Prévention
                </h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Superviseur des inspections
                  </label>
                  <select
                    value={parametres.superviseur_prevention_id}
                    onChange={(e) => handleChange('superviseur_prevention_id', e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-lg"
                  >
                    <option value="">-- Sélectionner un superviseur --</option>
                    {preventionnistes.map(prev => (
                      <option key={prev.id} value={prev.id}>
                        {prev.prenom} {prev.nom} - {prev.grade || 'Préventionniste'}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Ce superviseur recevra les notifications et pourra valider les inspections
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Avis de Non-Conformité
                </h3>
                
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="auto_creation_avis"
                    checked={parametres.auto_creation_avis !== false}
                    onChange={(e) => handleChange('auto_creation_avis', e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="auto_creation_avis" className="text-sm">
                    Générer automatiquement un brouillon d'avis lors de la validation d'une inspection avec anomalies
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-2 ml-7">
                  Les anomalies détectées seront automatiquement liées aux articles du référentiel
                </p>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Sauvegarder les paramètres
              </Button>
            </div>
          </div>
          </>
        );

      case 'bibliotheque':
        return (
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              <span>Chargement de la bibliothèque...</span>
            </div>
          }>
            <BibliothequeReferentiels />
          </Suspense>
        );

      case 'referentiel':
        return (
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              <span>Chargement du référentiel...</span>
            </div>
          }>
            <ParametresRefViolations tenantSlug={tenantSlug} toast={toast} />
          </Suspense>
        );

      case 'grilles':
        return (
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              <span>Chargement des grilles...</span>
            </div>
          }>
            <GrillesInspection tenantSlug={tenantSlug} toast={toast} currentUser={currentUser} />
          </Suspense>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span>Chargement des paramètres...</span>
      </div>
    );
  }

  return (
    <div className="parametres-prevention">
      {/* Titre */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-7 h-7" />
          Paramètres - Prévention
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          Configurez les paramètres et le référentiel du module prévention
        </p>
      </div>

      {/* Navigation par onglets - Style onglets rouges */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`p-4 rounded-lg border-2 text-left transition-all ${
                isActive 
                  ? 'bg-red-600 border-red-600 text-white shadow-lg' 
                  : 'bg-white border-gray-200 hover:border-red-300 hover:bg-red-50'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <Icon className={`w-6 h-6 ${isActive ? 'text-white' : 'text-red-600'}`} />
              </div>
              <div className={`font-semibold ${isActive ? 'text-white' : 'text-gray-800'}`}>
                {tab.label}
              </div>
              <div className={`text-xs mt-1 ${isActive ? 'text-red-100' : 'text-gray-500'}`}>
                {tab.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* Contenu de l'onglet actif */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default ParametresPrevention;
