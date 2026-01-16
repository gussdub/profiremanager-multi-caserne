import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "../hooks/use-toast";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { fr } from "date-fns/locale";
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';

const Formations = () => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('formations');
  const [anneeSelectionnee, setAnneeSelectionnee] = useState(new Date().getFullYear());
  
  const [formations, setFormations] = useState([]);
  const [competences, setCompetences] = useState([]);
  const [inscriptions, setInscriptions] = useState([]);
  const [selectedFormation, setSelectedFormation] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [rapportConformite, setRapportConformite] = useState(null);
  const [monTauxPresence, setMonTauxPresence] = useState(null);
  const [filtreNom, setFiltreNom] = useState('');
  const [triPresence, setTriPresence] = useState('desc');
  
  // États pour les rapports avancés
  const [rapportTab, setRapportTab] = useState('presence');  // 'presence' ou 'competences'
  const [typeFormation, setTypeFormation] = useState('toutes');  // 'obligatoires' ou 'toutes'
  const [rapportCompetences, setRapportCompetences] = useState(null);
  const [filtrePersonne, setFiltrePersonne] = useState('');  // ID de la personne ou vide pour tous
  const [personnel, setPersonnel] = useState([]);
  
  const [showFormationModal, setShowFormationModal] = useState(false);
  const [showInscriptionsModal, setShowInscriptionsModal] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [showValidateCompetenceModal, setShowValidateCompetenceModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newValidation, setNewValidation] = useState({
    competence_id: '',
    justification: '',
    date_validation: new Date().toISOString().split('T')[0]
  });
  
  const [formationForm, setFormationForm] = useState({
    nom: '',
    competence_id: '',
    description: '',
    date_debut: '',
    date_fin: '',
    heure_debut: '09:00',
    heure_fin: '17:00',
    duree_heures: 8,
    lieu: '',
    instructeur: '',
    places_max: 20,
    obligatoire: false,
    annee: new Date().getFullYear()
  });
  
  useEffect(() => {
    if (tenantSlug) loadData();
  }, [tenantSlug, anneeSelectionnee]);
  
  useEffect(() => {
    if (tenantSlug && activeTab === 'rapports' && rapportTab === 'competences') {
      loadRapportCompetences();
    }
  }, [tenantSlug, activeTab, rapportTab, anneeSelectionnee, filtrePersonne]);
  
  const loadData = async () => {
    setLoading(true);
    try {
      if (['employe', 'pompier'].includes(user?.role)) {
        const [formationsData, competencesData, tauxData] = await Promise.all([
          apiGet(tenantSlug, `/formations?annee=${anneeSelectionnee}`),
          apiGet(tenantSlug, '/competences'),
          apiGet(tenantSlug, `/formations/mon-taux-presence?annee=${anneeSelectionnee}`)
        ]);
        setFormations(formationsData || []);
        setCompetences(competencesData || []);
        setMonTauxPresence(tauxData);
      } else {
        const [formationsData, competencesData, dashData, rapportData, personnelData] = await Promise.all([
          apiGet(tenantSlug, `/formations?annee=${anneeSelectionnee}`),
          apiGet(tenantSlug, '/competences'),
          apiGet(tenantSlug, `/formations/rapports/dashboard?annee=${anneeSelectionnee}`),
          apiGet(tenantSlug, `/formations/rapports/conformite?annee=${anneeSelectionnee}`),
          apiGet(tenantSlug, '/users')
        ]);
        setFormations(formationsData || []);
        setCompetences(competencesData || []);
        setDashboardData(dashData);
        setRapportConformite(rapportData);
        setPersonnel(personnelData || []);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
    setLoading(false);
  };
  
  const loadRapportCompetences = async () => {
    try {
      const params = filtrePersonne ? `?annee=${anneeSelectionnee}&user_id=${filtrePersonne}` : `?annee=${anneeSelectionnee}`;
      const data = await apiGet(tenantSlug, `/formations/rapports/competences${params}`);
      setRapportCompetences(data);
    } catch (error) {
      console.error('Erreur chargement rapport compétences:', error);
    }
  };
  
  const handleExportPresence = async (format) => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL;
      const token = localStorage.getItem(`${tenantSlug}_token`);
      
      const url = `${backendUrl}/api/${tenantSlug}/formations/rapports/export-presence?format=${format}&type_formation=${typeFormation}&annee=${anneeSelectionnee}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Erreur lors de l\'export');
      
      const blob = await response.blob();
      
      if (format === 'pdf') {
        // Pour les PDF, ouvrir directement le dialogue d'impression
        const pdfUrl = window.URL.createObjectURL(blob);
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = pdfUrl;
        document.body.appendChild(iframe);
        
        iframe.onload = function() {
          iframe.contentWindow.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
            window.URL.revokeObjectURL(pdfUrl);
          }, 100);
        };
      } else {
        // Pour les Excel, télécharger directement
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `rapport_presence_${typeFormation}_${anneeSelectionnee}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
      }
      
      toast({ title: "Succès", description: `Rapport ${format.toUpperCase()} ${format === 'pdf' ? 'prêt à imprimer' : 'téléchargé'}` });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de télécharger le rapport", variant: "destructive" });
    }
  };
  
  const handleValidateCompetence = async () => {
    if (!newValidation.competence_id || !newValidation.justification) {
      toast({
        title: "Champs requis",
        description: "Veuillez sélectionner une compétence et fournir une justification",
        variant: "destructive"
      });
      return;
    }

    try {
      const validation = {
        user_id: selectedUser.id,
        competence_id: newValidation.competence_id,
        justification: newValidation.justification,
        date_validation: newValidation.date_validation
      };

      await apiPost(tenantSlug, '/validations-competences', validation);

      toast({
        title: "Succès",
        description: "Rattrapage enregistré avec succès",
        variant: "success"
      });

      // Réinitialiser le formulaire
      setNewValidation({
        competence_id: '',
        justification: '',
        date_validation: new Date().toISOString().split('T')[0]
      });
      setShowValidateCompetenceModal(false);
      
      // Recharger les données du rapport
      loadData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.detail || error.message || "Impossible d'enregistrer le rattrapage",
        variant: "destructive"
      });
    }
  };
  
  const handleExportCompetences = async (format) => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL;
      const token = localStorage.getItem(`${tenantSlug}_token`);
      
      const userParam = filtrePersonne ? `&user_id=${filtrePersonne}` : '';
      const url = `${backendUrl}/api/${tenantSlug}/formations/rapports/export-competences?format=${format}&annee=${anneeSelectionnee}${userParam}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Erreur lors de l\'export');
      
      const blob = await response.blob();
      
      if (format === 'pdf') {
        // Pour les PDF, ouvrir directement le dialogue d'impression
        const pdfUrl = window.URL.createObjectURL(blob);
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = pdfUrl;
        document.body.appendChild(iframe);
        
        iframe.onload = function() {
          iframe.contentWindow.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
            window.URL.revokeObjectURL(pdfUrl);
          }, 100);
        };
      } else {
        // Pour les Excel, télécharger directement
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `rapport_competences_${anneeSelectionnee}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
      }
      
      toast({ title: "Succès", description: `Rapport ${format.toUpperCase()} téléchargé` });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de télécharger le rapport", variant: "destructive" });
    }
  };
  
  const handleSaveFormation = async () => {
    // Validation frontend
    if (!formationForm.nom || !formationForm.nom.trim()) {
      toast({ 
        title: "Erreur", 
        description: "Le nom de la formation est obligatoire", 
        variant: "destructive" 
      });
      return;
    }
    
    if (!formationForm.competence_id) {
      toast({ 
        title: "Erreur", 
        description: "Veuillez sélectionner une compétence associée", 
        variant: "destructive" 
      });
      return;
    }
    
    if (!formationForm.date_debut) {
      toast({ 
        title: "Erreur", 
        description: "La date de début est obligatoire", 
        variant: "destructive" 
      });
      return;
    }
    
    // CALCUL AUTOMATIQUE de la durée depuis heure_debut et heure_fin
    let formDataToSend = {...formationForm};
    if (formationForm.heure_debut && formationForm.heure_fin) {
      try {
        const [debutH, debutM] = formationForm.heure_debut.split(':').map(Number);
        const [finH, finM] = formationForm.heure_fin.split(':').map(Number);
        const dureeCalculee = (finH + finM/60) - (debutH + debutM/60);
        formDataToSend.duree_heures = Math.round(dureeCalculee * 100) / 100; // Arrondi à 2 décimales
      } catch (error) {
        console.error('Erreur calcul durée:', error);
      }
    }
    
    try {
      if (selectedFormation) {
        await apiPut(tenantSlug, `/formations/${selectedFormation.id}`, formDataToSend);
        toast({ title: "Succès", description: "Formation modifiée" });
      } else {
        await apiPost(tenantSlug, '/formations', formDataToSend);
        toast({ title: "Succès", description: "Formation créée" });
      }
      setShowFormationModal(false);
      loadData();
    } catch (error) {
      toast({ title: "Erreur", description: error.response?.data?.detail || "Erreur lors de la sauvegarde", variant: "destructive" });
    }
  };

  // Charger les compétences à l'ouverture du modal
  useEffect(() => {
    if (showFormationModal && tenantSlug) {
      const refreshCompetences = async () => {
        try {
          const competencesData = await apiGet(tenantSlug, '/competences');
          setCompetences(competencesData || []);
        } catch (error) {
          console.error('Erreur chargement compétences:', error);
        }
      };
      refreshCompetences();
    }
  }, [showFormationModal, tenantSlug]);
  
  const handleInscrire = async (formationId) => {
    try {
      const result = await apiPost(tenantSlug, `/formations/${formationId}/inscription`, {});
      toast({
        title: "Succès",
        description: result.statut === 'inscrit' ? 'Inscription confirmée' : 'Ajouté à la liste d\'attente'
      });
      loadData();
    } catch (error) {
      toast({ title: "Erreur", description: error.response?.data?.detail || "Erreur", variant: "destructive" });
    }
  };
  
  const handleDesinscrire = async (formationId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir vous désinscrire de cette formation?")) {
      return;
    }
    
    try {
      await apiDelete(tenantSlug, `/formations/${formationId}/inscription`);
      toast({
        title: "Succès",
        description: "Désinscription réussie"
      });
      loadData();
    } catch (error) {
      toast({ title: "Erreur", description: error.response?.data?.detail || "Erreur", variant: "destructive" });
    }
  };
  
  const handleValiderPresence = async (userId, statut) => {
    try {
      await apiPut(tenantSlug, `/formations/${selectedFormation.id}/presence/${userId}`, { statut, notes: '' });
      toast({ title: "Succès", description: "Présence validée" });
      loadInscriptions(selectedFormation.id);
    } catch (error) {
      toast({ title: "Erreur", description: error.response?.data?.detail || "Erreur", variant: "destructive" });
    }
  };
  
  const handleDeleteFormation = async (formationId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette formation ? Cette action est irréversible.")) {
      return;
    }
    
    try {
      await apiDelete(tenantSlug, `/formations/${formationId}`);
      toast({ 
        title: "Succès", 
        description: "Formation supprimée avec succès",
        variant: "success"
      });
      loadData();
    } catch (error) {
      toast({ 
        title: "Erreur", 
        description: error.response?.data?.detail || "Impossible de supprimer la formation", 
        variant: "destructive" 
      });
    }
  };
  
  const loadInscriptions = async (formationId) => {
    try {
      const data = await apiGet(tenantSlug, `/formations/${formationId}/inscriptions`);
      setInscriptions(data || []);
    } catch (error) {
      console.error('Erreur:', error);
    }
  };
  
  const getCompetenceName = (id) => competences.find(c => c.id === id)?.nom || 'N/A';
  
  const getPompiersFiltreTri = () => {
    if (!rapportConformite) return [];
    let pompiers = [...rapportConformite.pompiers];
    if (filtreNom) {
      pompiers = pompiers.filter(p => `${p.prenom} ${p.nom}`.toLowerCase().includes(filtreNom.toLowerCase()));
    }
    pompiers.sort((a, b) => {
      const tauxA = a.taux_presence || 0;
      const tauxB = b.taux_presence || 0;
      return triPresence === 'desc' ? tauxB - tauxA : tauxA - tauxB;
    });
    return pompiers;
  };
  
  if (loading) {
    return <div className="module-container"><div className="loading-spinner"></div><p>Chargement...</p></div>;
  }
  
  return (
    <div className="module-formations-nfpa">
      <div className="module-header">
        <div>
          <h1>📚 Formations - NFPA 1500</h1>
          <p>Gestion des formations et conformité réglementaire</p>
        </div>
        <div className="header-controls">
          <select className="form-select" value={anneeSelectionnee} onChange={e => setAnneeSelectionnee(parseInt(e.target.value))}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      
      {['employe', 'pompier'].includes(user?.role) && monTauxPresence && (
        <div className="mon-kpi-presence">
          <h2>📊 Mon Taux de Présence {anneeSelectionnee}</h2>
          <div className="kpi-personnel-grid">
            <div className="kpi-card-large">
              <div className="kpi-circle" style={{background: `conic-gradient(${monTauxPresence.conforme ? '#10B981' : '#EF4444'} ${monTauxPresence.taux_presence * 3.6}deg, #E5E7EB 0deg)`}}>
                <div className="kpi-circle-inner">
                  <h2>{monTauxPresence.taux_presence}%</h2>
                  <p>Présence</p>
                </div>
              </div>
              <div className="kpi-details">
                <p><strong>Présences:</strong> {monTauxPresence.presences_validees}</p>
                <p><strong>Absences:</strong> {monTauxPresence.absences}</p>
                <p><strong>Total:</strong> {monTauxPresence.formations_passees}</p>
              </div>
            </div>
            <div className={`statut-conformite ${monTauxPresence.conforme ? 'conforme' : 'non-conforme'}`}>
              {monTauxPresence.conforme ? <><h3>✅ Conforme</h3><p>Taux de présence conforme</p></> : <><h3>❌ Non Conforme</h3><p>Améliorez votre présence</p></>}
            </div>
          </div>
        </div>
      )}
      
      {!['employe', 'pompier'].includes(user?.role) && dashboardData && (
        <div className="formations-dashboard">
          <div className="kpi-grid">
            <div className="kpi-card"><h3>{dashboardData.heures_planifiees}h</h3><p>Heures planifiées</p></div>
            <div className="kpi-card" style={{background: '#D1FAE5'}}><h3>{dashboardData.heures_effectuees}h</h3><p>Heures effectuées</p></div>
            <div className="kpi-card" style={{background: '#DBEAFE'}}><h3>{dashboardData.pourcentage_realisation}%</h3><p>Taux réalisation</p></div>
            <div className="kpi-card" style={{background: '#FEF3C7'}}><h3>{dashboardData.pompiers_formes}/{dashboardData.total_pompiers}</h3><p>Pompiers formés</p></div>
            <div className="kpi-card" style={{background: '#E0E7FF'}}><h3>{dashboardData.pourcentage_pompiers}%</h3><p>% Pompiers</p></div>
          </div>
        </div>
      )}
      
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2 flex-wrap">
        <button 
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'formations' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => setActiveTab('formations')}
        >
          📋 Formations ({formations.length})
        </button>
        {!['employe', 'pompier'].includes(user?.role) && (
          <button 
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
              activeTab === 'rapports' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            onClick={() => setActiveTab('rapports')}
          >
            📊 Rapports
          </button>
        )}
      </div>
      
      {activeTab === 'formations' && (
        <div className="formations-content">
          {!['employe', 'pompier'].includes(user?.role) && (
            <div className="formations-actions"><Button onClick={() => { setSelectedFormation(null); setFormationForm({...formationForm, annee: anneeSelectionnee}); setShowFormationModal(true); }}>➕ Nouvelle Formation</Button></div>
          )}
          <div className="formations-grid">
            {formations.map(f => (
              <div key={f.id} className="formation-card">
                <div className="formation-header">
                  <h3>{f.nom}</h3>
                  <span className={`statut-badge ${f.statut}`}>{f.statut}</span>
                </div>
                <div className="formation-body">
                  <p><strong>📅 Date:</strong> {(() => {
                    // Parser la date comme locale sans conversion timezone
                    const [year, month, day] = f.date_debut.split('-');
                    const date = new Date(year, month - 1, day);
                    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                  })()}</p>
                  <p><strong>🕐 Horaire:</strong> {f.heure_debut && f.heure_fin ? `${f.heure_debut} - ${f.heure_fin}` : 'Non précisé'}</p>
                  <p><strong>📍 Lieu:</strong> {f.lieu || 'Non précisé'}</p>
                  <p><strong>👨‍🏫 Instructeur:</strong> {f.instructeur || 'Non précisé'}</p>
                  <p style={{fontSize: '0.9rem', color: '#6B7280'}}><strong>Compétence:</strong> {getCompetenceName(f.competence_id)}</p>
                  
                  {/* Barre visuelle des places */}
                  <div style={{marginTop: '0.75rem'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.85rem'}}>
                      <span><strong>Places:</strong></span>
                      <span style={{color: f.places_restantes === 0 ? '#DC2626' : '#059669'}}>
                        {f.places_max - f.places_restantes}/{f.places_max}
                      </span>
                    </div>
                    <div style={{
                      width: '100%', 
                      height: '8px', 
                      background: '#F3F4F6', 
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${((f.places_max - f.places_restantes) / f.places_max) * 100}%`,
                        height: '100%',
                        background: f.places_restantes === 0 ? '#DC2626' : '#10B981',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                </div>
                <div className="formation-actions" style={{display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem 1.5rem'}}>
                  {/* Bouton principal pour TOUS */}
                  {f.user_inscrit ? (
                    <Button 
                      variant="outline" 
                      onClick={() => handleDesinscrire(f.id)}
                      style={{width: '100%', fontSize: '0.95rem', padding: '0.75rem'}}
                    >
                      ❌ Je me désinscris
                    </Button>
                  ) : (
                    <Button 
                      onClick={() => handleInscrire(f.id)} 
                      disabled={f.places_restantes === 0}
                      style={{width: '100%', fontSize: '0.95rem', padding: '0.75rem'}}
                    >
                      {f.places_restantes === 0 ? '🔒 Formation complète' : '✅ Je m\'inscris'}
                    </Button>
                  )}
                  
                  {/* Boutons de gestion pour admin/superviseur */}
                  {!['employe', 'pompier'].includes(user?.role) && (
                    <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={async () => { 
                          setSelectedFormation(f); 
                          await loadInscriptions(f.id); 
                          setShowInscriptionsModal(true); 
                        }}
                        style={{flex: '1 1 calc(50% - 0.25rem)'}}
                      >
                        👥 Inscrits ({f.places_max - f.places_restantes})
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={async () => { 
                          setSelectedFormation(f); 
                          await loadInscriptions(f.id); 
                          setShowValidationModal(true); 
                        }}
                        style={{flex: '1 1 calc(50% - 0.25rem)'}}
                      >
                        ✅ Présences
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => { 
                          setSelectedFormation(f); 
                          setFormationForm({
                            nom: f.nom,
                            competence_id: f.competence_id,
                            description: f.description,
                            date_debut: f.date_debut,
                            heure_debut: f.heure_debut,
                            heure_fin: f.heure_fin,
                            duree_heures: f.duree_heures,
                            lieu: f.lieu,
                            instructeur: f.instructeur,
                            places_max: f.places_max,
                            obligatoire: f.obligatoire,
                            annee: f.annee
                          }); 
                          setShowFormationModal(true); 
                        }}
                        style={{flex: '1 1 calc(50% - 0.25rem)'}}
                      >
                        ✏️ Modifier
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={() => handleDeleteFormation(f.id)}
                        style={{flex: '1 1 calc(50% - 0.25rem)'}}
                      >
                        🗑️ Supprimer
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {formations.length === 0 && <div className="empty-state"><p>Aucune formation pour {anneeSelectionnee}</p></div>}
        </div>
      )}
      
      {activeTab === 'rapports' && rapportConformite && (
        <div className="formations-rapports">
          {/* Sous-onglets Rapports */}
          <div className="rapports-sub-tabs" style={{display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '2px solid #E5E7EB'}}>
            <button 
              className={rapportTab === 'presence' ? 'active-sub-tab' : 'sub-tab'} 
              onClick={() => setRapportTab('presence')}
              style={{
                padding: '0.75rem 1.5rem',
                background: rapportTab === 'presence' ? '#FCA5A5' : 'transparent',
                color: rapportTab === 'presence' ? 'white' : '#6B7280',
                border: 'none',
                borderRadius: '8px 8px 0 0',
                cursor: 'pointer',
                fontWeight: rapportTab === 'presence' ? 'bold' : 'normal',
                fontSize: '1rem'
              }}
            >
              📊 Taux de Présence
            </button>
            <button 
              className={rapportTab === 'competences' ? 'active-sub-tab' : 'sub-tab'} 
              onClick={() => setRapportTab('competences')}
              style={{
                padding: '0.75rem 1.5rem',
                background: rapportTab === 'competences' ? '#FCA5A5' : 'transparent',
                color: rapportTab === 'competences' ? 'white' : '#6B7280',
                border: 'none',
                borderRadius: '8px 8px 0 0',
                cursor: 'pointer',
                fontWeight: rapportTab === 'competences' ? 'bold' : 'normal',
                fontSize: '1rem'
              }}
            >
              📈 Par Compétences
            </button>
          </div>
          
          {/* TAB TAUX DE PRÉSENCE */}
          {rapportTab === 'presence' && (
            <div>
              <h2>📊 Conformité NFPA 1500 - {anneeSelectionnee}</h2>
              
              {/* Boutons d'export */}
              <div style={{display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap'}}>
                <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                  <Label style={{minWidth: '120px'}}>Type formations:</Label>
                  <select 
                    className="form-select" 
                    value={typeFormation} 
                    onChange={e => setTypeFormation(e.target.value)}
                    style={{padding: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB'}}
                  >
                    <option value="toutes">Toutes</option>
                    <option value="obligatoires">Obligatoires uniquement</option>
                  </select>
                </div>
                <div style={{display: 'flex', gap: '0.5rem', marginLeft: 'auto'}}>
                  <Button onClick={() => handleExportPresence('pdf')} variant="outline" style={{background: '#EF4444', color: 'white'}}>
                    📄 Export PDF
                  </Button>
                  <Button onClick={() => handleExportPresence('excel')} variant="outline" style={{background: '#10B981', color: 'white'}}>
                    📊 Export Excel
                  </Button>
                </div>
              </div>
              
              <div className="conformite-stats">
                <div className="stat-card"><h3>{rapportConformite.total_pompiers}</h3><p>Total Pompiers</p></div>
                <div className="stat-card" style={{background: '#D1FAE5', border: '2px solid #10B981'}}><h3>{rapportConformite.conformes}</h3><p>✅ Conformes</p></div>
                <div className="stat-card" style={{background: '#FEE2E2', border: '2px solid #EF4444'}}><h3>{rapportConformite.non_conformes}</h3><p>❌ Non Conformes</p></div>
                <div className="stat-card" style={{background: '#DBEAFE'}}><h3>{rapportConformite.pourcentage_conformite}%</h3><p>% Conformité</p></div>
              </div>
              
              <div className="rapports-controls" style={{marginTop: '2rem'}}>
                <div className="filtres-grid">
                  <div><Label>Rechercher</Label><Input placeholder="Nom..." value={filtreNom} onChange={e => setFiltreNom(e.target.value)} /></div>
                  <div><Label>Tri</Label><select className="form-select" value={triPresence} onChange={e => setTriPresence(e.target.value)}><option value="desc">Meilleur en premier</option><option value="asc">Faible en premier</option></select></div>
                  <div style={{display: 'flex', alignItems: 'flex-end'}}>
                    <Button 
                      onClick={() => window.location.reload()} 
                      variant="outline"
                      style={{height: 'fit-content'}}
                    >
                      🔄 Rafraîchir
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="pompiers-list">
                {getPompiersFiltreTri().map(p => (
                  <div key={p.id} className={`pompier-card ${p.conforme ? 'conforme' : 'non-conforme'}`}>
                    <div className="pompier-info"><h4>{p.prenom} {p.nom}</h4><p>{p.grade}</p></div>
                    <div className="pompier-heures">
                      <div className="heures-bar">
                        <div 
                          className="heures-progress" 
                          style={{
                            width: `${Math.min(p.pourcentage, 100)}%`, 
                            background: p.conforme ? '#10B981' : '#EF4444'
                          }} 
                        />
                      </div>
                      <p><strong>{p.total_heures}h</strong> / {p.heures_requises}h ({p.pourcentage}%)</p>
                      <p style={{fontSize: '0.85rem', color: '#666'}}>Présence: {p.taux_presence}%</p>
                      {p.formations_obligatoires_ratees && p.formations_obligatoires_ratees.length > 0 && (
                        <p style={{fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem'}}>
                          ⚠️ Formation(s) obligatoire(s) ratée(s): {p.formations_obligatoires_ratees.join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="pompier-statut" style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                      {p.conforme ? (
                        <span className="badge-conforme">✅ Conforme</span>
                      ) : (
                        <span className="badge-non-conforme">❌ Non conforme</span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          console.log('🎖️ Clic Rattrapage - User ID:', p.id);
                          const userToSelect = personnel.find(u => u.id === p.id);
                          console.log('👤 User trouvé:', userToSelect);
                          console.log('📚 Competences disponibles:', competences.length);
                          setSelectedUser(userToSelect);
                          console.log('✅ setSelectedUser appelé');
                          setShowValidateCompetenceModal(true);
                          console.log('🚪 Modal ouvert:', true);
                        }}
                        title="Enregistrer un rattrapage de formation"
                      >
                        🎖️ Rattrapage
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* TAB RAPPORTS PAR COMPÉTENCES */}
          {rapportTab === 'competences' && (
            <div>
              <h2>📈 Rapports par Compétences - {anneeSelectionnee}</h2>
              
              {/* Filtres et exports */}
              <div style={{display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap'}}>
                <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                  <Label style={{minWidth: '120px'}}>Filtrer par personne:</Label>
                  <select 
                    className="form-select" 
                    value={filtrePersonne} 
                    onChange={e => setFiltrePersonne(e.target.value)}
                    style={{padding: '0.5rem', borderRadius: '6px', border: '1px solid #D1D5DB', minWidth: '200px'}}
                  >
                    <option value="">Tous les pompiers</option>
                    {personnel.map(p => (
                      <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>
                    ))}
                  </select>
                </div>
                <div style={{display: 'flex', gap: '0.5rem', marginLeft: 'auto'}}>
                  <Button onClick={() => handleExportCompetences('pdf')} variant="outline" style={{background: '#EF4444', color: 'white'}}>
                    📄 Export PDF
                  </Button>
                  <Button onClick={() => handleExportCompetences('excel')} variant="outline" style={{background: '#10B981', color: 'white'}}>
                    📊 Export Excel
                  </Button>
                </div>
              </div>
              
              {/* Statistiques globales */}
              {rapportCompetences && (
                <>
                  <div className="conformite-stats" style={{marginBottom: '2rem'}}>
                    <div className="stat-card">
                      <h3>{rapportCompetences.competences.length}</h3>
                      <p>Compétences</p>
                    </div>
                    <div className="stat-card" style={{background: '#D1FAE5'}}>
                      <h3>{rapportCompetences.competences.reduce((sum, c) => sum + c.total_formations, 0)}</h3>
                      <p>Formations</p>
                    </div>
                    <div className="stat-card" style={{background: '#DBEAFE'}}>
                      <h3>{rapportCompetences.competences.reduce((sum, c) => sum + c.total_heures_planifiees, 0)}h</h3>
                      <p>Heures totales</p>
                    </div>
                    <div className="stat-card" style={{background: '#FEF3C7'}}>
                      <h3>
                        {rapportCompetences.competences.reduce((sum, c) => sum + c.total_inscriptions, 0) > 0
                          ? Math.round(
                              (rapportCompetences.competences.reduce((sum, c) => sum + c.presences, 0) /
                                rapportCompetences.competences.reduce((sum, c) => sum + c.total_inscriptions, 0)) *
                                100
                            )
                          : 0}
                        %
                      </h3>
                      <p>Taux présence moyen</p>
                    </div>
                  </div>
                  
                  {/* Liste des compétences */}
                  <div className="competences-rapport-list">
                    {rapportCompetences.competences.map(comp => (
                      <div key={comp.competence_id} className="competence-rapport-card" style={{
                        background: 'white',
                        border: '1px solid #E5E7EB',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        marginBottom: '1rem',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                      }}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem'}}>
                          <div>
                            <h3 style={{fontSize: '1.25rem', fontWeight: 'bold', color: '#1F2937', marginBottom: '0.5rem'}}>
                              {comp.competence_nom}
                            </h3>
                            <p style={{color: '#6B7280', fontSize: '0.9rem'}}>
                              {comp.total_formations} formation{comp.total_formations > 1 ? 's' : ''} • {comp.total_heures_planifiees}h planifiées
                            </p>
                          </div>
                          <div style={{textAlign: 'right'}}>
                            <div style={{
                              fontSize: '1.5rem',
                              fontWeight: 'bold',
                              color: comp.taux_presence >= 80 ? '#10B981' : '#EF4444'
                            }}>
                              {comp.taux_presence}%
                            </div>
                            <p style={{fontSize: '0.8rem', color: '#6B7280'}}>Taux présence</p>
                          </div>
                        </div>
                        
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                          gap: '1rem',
                          marginTop: '1rem'
                        }}>
                          <div style={{padding: '0.75rem', background: '#F9FAFB', borderRadius: '8px'}}>
                            <p style={{fontSize: '0.85rem', color: '#6B7280', marginBottom: '0.25rem'}}>Inscrits</p>
                            <p style={{fontSize: '1.25rem', fontWeight: 'bold', color: '#1F2937'}}>{comp.total_inscrits}</p>
                          </div>
                          <div style={{padding: '0.75rem', background: '#F9FAFB', borderRadius: '8px'}}>
                            <p style={{fontSize: '0.85rem', color: '#6B7280', marginBottom: '0.25rem'}}>Présences</p>
                            <p style={{fontSize: '1.25rem', fontWeight: 'bold', color: '#10B981'}}>{comp.presences}</p>
                          </div>
                          <div style={{padding: '0.75rem', background: '#F9FAFB', borderRadius: '8px'}}>
                            <p style={{fontSize: '0.85rem', color: '#6B7280', marginBottom: '0.25rem'}}>Absences</p>
                            <p style={{fontSize: '1.25rem', fontWeight: 'bold', color: '#EF4444'}}>{comp.absences}</p>
                          </div>
                          <div style={{padding: '0.75rem', background: '#F9FAFB', borderRadius: '8px'}}>
                            <p style={{fontSize: '0.85rem', color: '#6B7280', marginBottom: '0.25rem'}}>Heures effectuées</p>
                            <p style={{fontSize: '1.25rem', fontWeight: 'bold', color: '#3B82F6'}}>{comp.heures_effectuees}h</p>
                          </div>
                        </div>
                        
                        {/* Barre de progression */}
                        <div style={{marginTop: '1rem'}}>
                          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#6B7280', marginBottom: '0.25rem'}}>
                            <span>Réalisation</span>
                            <span>{comp.taux_realisation}%</span>
                          </div>
                          <div style={{
                            width: '100%',
                            height: '8px',
                            background: '#E5E7EB',
                            borderRadius: '4px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${Math.min(comp.taux_realisation, 100)}%`,
                              height: '100%',
                              background: comp.taux_realisation >= 80 ? '#10B981' : comp.taux_realisation >= 50 ? '#F59E0B' : '#EF4444',
                              transition: 'width 0.3s ease'
                            }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {rapportCompetences.competences.length === 0 && (
                    <div className="empty-state">
                      <p>Aucune donnée de compétence pour {anneeSelectionnee}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
      
      {showFormationModal && (
        <div className="modal-overlay" onClick={() => setShowFormationModal(false)}>
          <div className="modal-content large-modal formation-modal-modern" onClick={e => e.stopPropagation()}>
            <div className="modal-header modal-header-modern">
              <h2 style={{margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                {selectedFormation ? '✏️ Modifier la Formation' : '➕ Nouvelle Formation'}
              </h2>
              <Button variant="ghost" onClick={() => setShowFormationModal(false)} style={{fontSize: '1.5rem'}}>✕</Button>
            </div>
            <div className="modal-body modal-body-modern">
              <div className="form-grid form-grid-modern">
                <div className="form-field-modern">
                  <Label>Nom de la formation *</Label>
                  <Input 
                    value={formationForm.nom} 
                    onChange={e => setFormationForm({...formationForm, nom: e.target.value})} 
                    placeholder="Ex: Formation incendie niveau 1"
                  />
                </div>
                <div className="form-field-modern">
                  <Label>Compétence associée *</Label>
                  <select 
                    className="form-select form-select-modern" 
                    value={formationForm.competence_id} 
                    onChange={e => setFormationForm({...formationForm, competence_id: e.target.value})}
                  >
                    <option value="">Sélectionner une compétence...</option>
                    {competences.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                
                <div className="form-row-full">
                  <div className="form-field-modern">
                    <Label>Date de la formation *</Label>
                    <Input 
                      type="date" 
                      value={formationForm.date_debut} 
                      onChange={e => setFormationForm({...formationForm, date_debut: e.target.value})} 
                    />
                  </div>
                  <div className="form-field-modern">
                    <Label>Heure de début</Label>
                    <Input 
                      type="time" 
                      value={formationForm.heure_debut} 
                      onChange={e => setFormationForm({...formationForm, heure_debut: e.target.value})} 
                    />
                  </div>
                  <div className="form-field-modern">
                    <Label>Heure de fin</Label>
                    <Input 
                      type="time" 
                      value={formationForm.heure_fin} 
                      onChange={e => setFormationForm({...formationForm, heure_fin: e.target.value})} 
                    />
                  </div>
                </div>
                
                <div className="form-field-modern">
                  <Label>Nombre de places *</Label>
                  <Input 
                    type="number" 
                    value={formationForm.places_max} 
                    onChange={e => setFormationForm({...formationForm, places_max: parseInt(e.target.value) || 20})} 
                    min="1"
                  />
                </div>
                <div className="form-field-modern">
                  <Label>Lieu</Label>
                  <Input 
                    value={formationForm.lieu} 
                    onChange={e => setFormationForm({...formationForm, lieu: e.target.value})} 
                    placeholder="Ex: Caserne principale"
                  />
                </div>
                <div className="form-field-modern">
                  <Label>Instructeur</Label>
                  <Input 
                    value={formationForm.instructeur} 
                    onChange={e => setFormationForm({...formationForm, instructeur: e.target.value})} 
                    placeholder="Nom de l'instructeur"
                  />
                </div>
                
                <div style={{gridColumn: '1 / -1'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: '#FEF2F2', borderRadius: '8px', cursor: 'pointer'}}>
                    <input 
                      type="checkbox" 
                      checked={formationForm.obligatoire} 
                      onChange={e => setFormationForm({...formationForm, obligatoire: e.target.checked})} 
                      style={{width: '20px', height: '20px', cursor: 'pointer'}} 
                    />
                    <strong style={{color: '#991B1B'}}>Formation obligatoire (NFPA 1500)</strong>
                  </label>
                </div>
              </div>
              
              <div style={{marginTop: '1.5rem'}}>
                <Label>Description</Label>
                <textarea 
                  className="form-textarea form-textarea-modern" 
                  rows="4" 
                  value={formationForm.description} 
                  onChange={e => setFormationForm({...formationForm, description: e.target.value})} 
                  placeholder="Décrivez le contenu et les objectifs de la formation..."
                />
              </div>
            </div>
            <div className="modal-actions modal-actions-modern">
              <Button variant="outline" onClick={() => setShowFormationModal(false)}>
                Annuler
              </Button>
              <Button onClick={handleSaveFormation} style={{background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)', color: 'white'}}>
                {selectedFormation ? '💾 Sauvegarder' : '✅ Créer la formation'}
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {showInscriptionsModal && selectedFormation && (
        <div className="modal-overlay" onClick={() => setShowInscriptionsModal(false)}>
          <div className="modal-content large-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>👥 Inscrits - {selectedFormation.nom}</h2>
              <Button variant="ghost" onClick={() => setShowInscriptionsModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div style={{marginBottom: '1.5rem', padding: '1rem', background: '#F9FAFB', borderRadius: '8px'}}>
                <div style={{display: 'flex', gap: '2rem', justifyContent: 'center'}}>
                  <div style={{textAlign: 'center'}}>
                    <div style={{fontSize: '2rem', fontWeight: '700', color: '#10B981'}}>
                      {inscriptions.filter(i => i.statut === 'inscrit').length}
                    </div>
                    <div style={{fontSize: '0.875rem', color: '#6B7280'}}>Inscrits confirmés</div>
                  </div>
                  <div style={{textAlign: 'center'}}>
                    <div style={{fontSize: '2rem', fontWeight: '700', color: '#F59E0B'}}>
                      {inscriptions.filter(i => i.statut === 'en_attente').length}
                    </div>
                    <div style={{fontSize: '0.875rem', color: '#6B7280'}}>En attente</div>
                  </div>
                  <div style={{textAlign: 'center'}}>
                    <div style={{fontSize: '2rem', fontWeight: '700', color: '#6B7280'}}>
                      {selectedFormation.places_restantes}
                    </div>
                    <div style={{fontSize: '0.875rem', color: '#6B7280'}}>Places restantes</div>
                  </div>
                </div>
              </div>

              {inscriptions.length > 0 ? (
                <div className="inscriptions-list" style={{maxHeight: '400px', overflowY: 'auto'}}>
                  {inscriptions.map(insc => (
                    <div key={insc.id} className="inscription-item" style={{
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '1rem',
                      borderBottom: '1px solid #E5E7EB',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div>
                        <div style={{fontWeight: '600', fontSize: '0.95rem'}}>{insc.user_nom}</div>
                        <div style={{fontSize: '0.813rem', color: '#6B7280', marginTop: '0.25rem'}}>
                          Inscrit le {new Date(insc.created_at).toLocaleDateString('fr-FR')}
                        </div>
                      </div>
                      <span className={`badge-${insc.statut}`} style={{
                        padding: '0.4rem 0.8rem',
                        borderRadius: '6px',
                        fontSize: '0.813rem',
                        fontWeight: '600'
                      }}>
                        {insc.statut === 'inscrit' ? '✅ Inscrit' : 
                         insc.statut === 'en_attente' ? '⏳ En attente' : 
                         insc.statut === 'present' ? '✅ Présent' : '❌ Absent'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{textAlign: 'center', padding: '3rem', color: '#9CA3AF'}}>
                  <div style={{fontSize: '3rem', marginBottom: '1rem'}}>👥</div>
                  <p style={{fontSize: '1rem'}}>Aucun inscrit pour cette formation</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {showValidationModal && selectedFormation && (
        <div className="modal-overlay" onClick={() => setShowValidationModal(false)}>
          <div className="modal-content large-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2>✅ Validation Présences - {selectedFormation.nom}</h2><Button variant="ghost" onClick={() => setShowValidationModal(false)}>✕</Button></div>
            <div className="modal-body">
              <p style={{marginBottom: '1.5rem'}}>Validez la présence. Seuls les présents seront crédités de {selectedFormation.duree_heures}h.</p>
              <div className="validation-list">
                {inscriptions.filter(i => i.statut === 'inscrit' || i.statut === 'present' || i.statut === 'absent').map(insc => (
                  <div key={insc.id} className="validation-item">
                    <div><strong>{insc.user_nom}</strong><p>{insc.user_grade}</p></div>
                    <div className="validation-buttons">
                      <Button size="sm" variant={insc.statut === 'present' ? 'default' : 'outline'} onClick={() => handleValiderPresence(insc.user_id, 'present')}>✅ Présent</Button>
                      <Button size="sm" variant={insc.statut === 'absent' ? 'destructive' : 'outline'} onClick={() => handleValiderPresence(insc.user_id, 'absent')}>❌ Absent</Button>
                    </div>
                    {insc.heures_creditees > 0 && <span className="heures-creditees">{insc.heures_creditees}h</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de validation de compétence / rattrapage */}
      {showValidateCompetenceModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowValidateCompetenceModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h3>🎖️ Enregistrer un Rattrapage</h3>
              <Button variant="ghost" onClick={() => setShowValidateCompetenceModal(false)}>✕</Button>
            </div>
            
            <div className="modal-body">
              <p style={{ marginBottom: '1rem', color: '#64748b' }}>
                Employé: <strong>{selectedUser.prenom} {selectedUser.nom}</strong>
              </p>
              
              <div className="form-field">
                <Label>Compétence</Label>
                <select
                  value={newValidation.competence_id}
                  onChange={(e) => setNewValidation({...newValidation, competence_id: e.target.value})}
                  className="form-select"
                >
                  <option value="">Sélectionner une compétence</option>
                  {competences.map(comp => (
                    <option key={comp.id} value={comp.id}>{comp.nom}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-field">
                <Label>Justification</Label>
                <textarea
                  value={newValidation.justification}
                  onChange={(e) => setNewValidation({...newValidation, justification: e.target.value})}
                  placeholder="Expliquez pourquoi cette compétence doit être validée manuellement..."
                  rows="4"
                  className="form-input"
                />
              </div>
              
              <div className="form-field">
                <Label>Date de validation</Label>
                <Input
                  type="date"
                  value={newValidation.date_validation}
                  onChange={(e) => setNewValidation({...newValidation, date_validation: e.target.value})}
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <Button variant="outline" onClick={() => setShowValidateCompetenceModal(false)}>
                Annuler
              </Button>
              <Button onClick={handleValidateCompetence}>
                ✅ Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default Formations;
