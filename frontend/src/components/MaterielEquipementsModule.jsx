import React, { useState, useEffect, useCallback } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { apiGet, apiPost, apiPut, apiDelete, getTenantToken } from '../utils/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import InspectionAPRIAModal from './InspectionAPRIAModal';
import HistoriqueInspectionsAPRIA from './HistoriqueInspectionsAPRIA';
import InspectionEquipementWrapper from './InspectionEquipementWrapper';
import HistoriqueInspectionsUnifiees from './HistoriqueInspectionsUnifiees';

// ===== Composant principal =====
const MaterielEquipementsModule = ({ user }) => {
  const { tenantSlug } = useTenant();
  const [activeSubTab, setActiveSubTab] = useState('equipements');
  const [categories, setCategories] = useState([]);
  const [equipements, setEquipements] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // États pour les modals
  const [showCategorieModal, setShowCategorieModal] = useState(false);
  const [showEquipementModal, setShowEquipementModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [showInspectionAPRIAModal, setShowInspectionAPRIAModal] = useState(false);
  const [showHistoriqueAPRIAModal, setShowHistoriqueAPRIAModal] = useState(false);
  const [showInspectionEquipementModal, setShowInspectionEquipementModal] = useState(false);
  const [showHistoriqueEquipementModal, setShowHistoriqueEquipementModal] = useState(false);
  const [selectedCategorie, setSelectedCategorie] = useState(null);
  const [selectedEquipement, setSelectedEquipement] = useState(null);
  const [selectedEquipementAPRIA, setSelectedEquipementAPRIA] = useState(null);
  const [selectedEquipementInspection, setSelectedEquipementInspection] = useState(null);
  const [modalMode, setModalMode] = useState('create');
  
  // Filtres
  const [filtreCategorie, setFiltreCategorie] = useState('');
  const [filtreEtat, setFiltreEtat] = useState('');
  const [filtreRecherche, setFiltreRecherche] = useState('');
  const [filtreKPI, setFiltreKPI] = useState(''); // Filtre actif via les cartes KPI

  // Fonction pour gérer le clic sur une carte KPI (toggle)
  const handleKPIClick = (filterType) => {
    if (filtreKPI === filterType) {
      // Si on clique sur le même filtre, on le désactive
      setFiltreKPI('');
      setFiltreEtat('');
    } else {
      // Sinon on active le nouveau filtre
      setFiltreKPI(filterType);
      if (filterType === 'alertes') {
        setFiltreEtat(''); // Les alertes ont une logique spéciale
      } else if (filterType === 'total') {
        setFiltreEtat('');
      } else {
        setFiltreEtat(filterType);
      }
    }
  };

  // Vérifier si un équipement est un APRIA
  const isAPRIA = (equipement) => {
    const categorieAPRIA = categories.find(c => c.nom?.toUpperCase().includes('APRIA'));
    if (categorieAPRIA && equipement.categorie_id === categorieAPRIA.id) return true;
    if (equipement.nom?.toUpperCase().includes('APRIA')) return true;
    if (equipement.description?.toUpperCase().includes('APRIA')) return true;
    return false;
  };

  // Vérifier si un équipement a un formulaire d'inspection assigné
  const hasInspectionForm = (equipement) => {
    return !!equipement.modele_inspection_id;
  };

  // Vérifier si un équipement est inspectable (APRIA ou a un formulaire assigné)
  const isInspectable = (equipement) => {
    return isAPRIA(equipement) || hasInspectionForm(equipement);
  };

  // Charger les données
  const fetchData = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    setError(null);
    try {
      const [categoriesData, equipementsData, statsData] = await Promise.all([
        apiGet(tenantSlug, '/equipements/categories'),
        apiGet(tenantSlug, '/equipements'),
        apiGet(tenantSlug, '/equipements/stats/resume')
      ]);
      setCategories(categoriesData || []);
      setEquipements(equipementsData || []);
      setStats(statsData);
    } catch (err) {
      console.error('Erreur chargement données:', err);
      setError(err.message || 'Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Initialiser les catégories par défaut
  const handleInitialiserCategories = async () => {
    try {
      setLoading(true);
      const result = await apiPost(tenantSlug, '/equipements/categories/initialiser');
      alert(`✅ ${result.message}`);
      fetchData();
    } catch (err) {
      alert('❌ Erreur: ' + (err.message || 'Erreur inconnue'));
    } finally {
      setLoading(false);
    }
  };

  // Filtrer les équipements
  // Pour les employés (pompiers) : uniquement les équipements inspectables (APRIA ou avec formulaire)
  // Pour admin/superviseur : tout l'inventaire
  const isEmploye = ['employe', 'pompier'].includes(user?.role);
  
  const equipementsFiltres = equipements.filter(e => {
    // Si c'est un employé, ne montrer que les équipements inspectables
    if (isEmploye && !isInspectable(e)) return false;
    
    // Filtre par KPI (cartes cliquables)
    if (filtreKPI === 'alertes') {
      // Montrer uniquement les équipements avec des alertes
      if (!e.alerte_maintenance && !e.alerte_expiration && !e.alerte_fin_vie) return false;
    } else if (filtreKPI && filtreKPI !== 'total') {
      // Filtre par état depuis les cartes KPI
      if (e.etat !== filtreKPI) return false;
    }
    
    // Filtre par catégorie (dropdown)
    if (filtreCategorie && e.categorie_id !== filtreCategorie) return false;
    
    // Filtre par état (dropdown) - seulement si pas de filtre KPI actif
    if (!filtreKPI && filtreEtat && e.etat !== filtreEtat) return false;
    
    // Filtre par recherche
    if (filtreRecherche) {
      const search = filtreRecherche.toLowerCase();
      return (
        e.nom?.toLowerCase().includes(search) ||
        e.code_unique?.toLowerCase().includes(search) ||
        e.description?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  // Handlers pour les modals
  const openCreateCategorie = () => {
    setSelectedCategorie(null);
    setModalMode('create');
    setShowCategorieModal(true);
  };

  const openEditCategorie = (cat) => {
    setSelectedCategorie(cat);
    setModalMode('edit');
    setShowCategorieModal(true);
  };

  const openCreateEquipement = () => {
    setSelectedEquipement(null);
    setModalMode('create');
    setShowEquipementModal(true);
  };

  const openEditEquipement = (equip) => {
    setSelectedEquipement(equip);
    setModalMode('edit');
    setShowEquipementModal(true);
  };

  const openMaintenance = (equip) => {
    setSelectedEquipement(equip);
    setShowMaintenanceModal(true);
  };

  // Handler suppression
  const handleDeleteEquipement = async (equip) => {
    if (!window.confirm(`Voulez-vous vraiment supprimer "${equip.nom}" ?`)) return;
    try {
      await apiDelete(tenantSlug, `/equipements/${equip.id}`);
      fetchData();
    } catch (err) {
      alert('❌ Erreur: ' + (err.message || 'Impossible de supprimer'));
    }
  };

  const handleDeleteCategorie = async (cat) => {
    if (!window.confirm(`Voulez-vous vraiment supprimer la catégorie "${cat.nom}" ?`)) return;
    try {
      await apiDelete(tenantSlug, `/equipements/categories/${cat.id}`);
      fetchData();
    } catch (err) {
      alert('❌ ' + (err.response?.data?.detail || err.message || 'Impossible de supprimer'));
    }
  };

  if (loading && !equipements.length) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        <p style={{ marginTop: '1rem', color: '#6b7280' }}>Chargement...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem' }}>
      {/* En-tête avec statistiques */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isEmploye ? '📝 Inspections APRIA' : '🔧 Matériel & Équipements'}
          </h2>
          {user?.role === 'admin' && categories.length === 0 && (
            <Button onClick={handleInitialiserCategories} disabled={loading}>
              📦 Initialiser les catégories
            </Button>
          )}
        </div>

        {/* Stats Cards - Masqués pour les pompiers */}
        {stats && !isEmploye && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <StatCard 
              label="Total" 
              value={stats.total} 
              icon="📊" 
              color="#3b82f6" 
              onClick={() => handleKPIClick('total')}
              active={filtreKPI === 'total'}
            />
            <StatCard 
              label="En bon état" 
              value={stats.par_etat?.bon || 0} 
              icon="✅" 
              color="#22c55e" 
              onClick={() => handleKPIClick('bon')}
              active={filtreKPI === 'bon'}
            />
            <StatCard 
              label="À réparer" 
              value={stats.par_etat?.a_reparer || 0} 
              icon="🔧" 
              color="#f59e0b" 
              onClick={() => handleKPIClick('a_reparer')}
              active={filtreKPI === 'a_reparer'}
            />
            <StatCard 
              label="Hors service" 
              value={stats.par_etat?.hors_service || 0} 
              icon="❌" 
              color="#ef4444" 
              onClick={() => handleKPIClick('hors_service')}
              active={filtreKPI === 'hors_service'}
            />
            <StatCard 
              label="Alertes" 
              value={stats.alertes?.total || 0} 
              icon="⚠️" 
              color="#dc2626" 
              onClick={() => handleKPIClick('alertes')}
              active={filtreKPI === 'alertes'}
            />
          </div>
        )}
        
        {/* Indicateur de filtre actif */}
        {filtreKPI && !isEmploye && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            marginBottom: '1rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#f3f4f6',
            borderRadius: '0.5rem',
            fontSize: '0.875rem'
          }}>
            <span>🔍 Filtre actif :</span>
            <span style={{ fontWeight: '600' }}>
              {filtreKPI === 'total' && 'Tous les équipements'}
              {filtreKPI === 'bon' && 'En bon état'}
              {filtreKPI === 'a_reparer' && 'À réparer'}
              {filtreKPI === 'hors_service' && 'Hors service'}
              {filtreKPI === 'alertes' && 'Alertes'}
            </span>
            <button
              onClick={() => { setFiltreKPI(''); setFiltreEtat(''); }}
              style={{
                marginLeft: 'auto',
                padding: '0.25rem 0.75rem',
                backgroundColor: '#e5e7eb',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                fontSize: '0.75rem'
              }}
            >
              ✕ Effacer
            </button>
          </div>
        )}
        
        {/* Message pour les pompiers */}
        {isEmploye && (
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            Sélectionnez un équipement ci-dessous pour effectuer une inspection ou consulter l'historique.
          </p>
        )}
      </div>

      {/* Sous-onglets - Masqués pour les pompiers */}
      {!isEmploye && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem' }}>
          <SubTabButton 
            label="📋 Équipements" 
            active={activeSubTab === 'equipements'} 
            onClick={() => setActiveSubTab('equipements')} 
          />
          <SubTabButton 
            label="📁 Catégories" 
            active={activeSubTab === 'categories'} 
            onClick={() => setActiveSubTab('categories')} 
          />
        </div>
      )}

      {/* Contenu selon sous-onglet */}
      {(activeSubTab === 'equipements' || isEmploye) ? (
        <EquipementsTab
          equipements={equipementsFiltres}
          categories={categories}
          filtreCategorie={filtreCategorie}
          setFiltreCategorie={setFiltreCategorie}
          filtreEtat={filtreEtat}
          setFiltreEtat={setFiltreEtat}
          filtreRecherche={filtreRecherche}
          setFiltreRecherche={setFiltreRecherche}
          onCreateEquipement={openCreateEquipement}
          onEditEquipement={openEditEquipement}
          onDeleteEquipement={handleDeleteEquipement}
          onMaintenance={openMaintenance}
          onInspectionAPRIA={(equip) => {
            setSelectedEquipementAPRIA(equip);
            setShowInspectionAPRIAModal(true);
          }}
          onHistoriqueAPRIA={(equip) => {
            setSelectedEquipementAPRIA(equip);
            setShowHistoriqueAPRIAModal(true);
          }}
          onInspectionEquipement={(equip) => {
            setSelectedEquipementInspection(equip);
            setShowInspectionEquipementModal(true);
          }}
          onHistoriqueEquipement={(equip) => {
            setSelectedEquipementInspection(equip);
            setShowHistoriqueEquipementModal(true);
          }}
          isAPRIA={isAPRIA}
          hasInspectionForm={hasInspectionForm}
          isEmploye={isEmploye}
          user={user}
        />
      ) : (
        <CategoriesTab
          categories={categories}
          equipements={equipements}
          onCreateCategorie={openCreateCategorie}
          onEditCategorie={openEditCategorie}
          onDeleteCategorie={handleDeleteCategorie}
          user={user}
        />
      )}

      {/* Modals */}
      {showCategorieModal && (
        <CategorieModal
          mode={modalMode}
          categorie={selectedCategorie}
          tenantSlug={tenantSlug}
          onClose={() => setShowCategorieModal(false)}
          onSuccess={() => {
            setShowCategorieModal(false);
            fetchData();
          }}
        />
      )}

      {showEquipementModal && (
        <EquipementModal
          mode={modalMode}
          equipement={selectedEquipement}
          categories={categories}
          tenantSlug={tenantSlug}
          onClose={() => setShowEquipementModal(false)}
          onSuccess={() => {
            setShowEquipementModal(false);
            fetchData();
          }}
        />
      )}

      {showMaintenanceModal && selectedEquipement && (
        <MaintenanceModal
          equipement={selectedEquipement}
          tenantSlug={tenantSlug}
          onClose={() => setShowMaintenanceModal(false)}
          onSuccess={() => {
            setShowMaintenanceModal(false);
            fetchData();
          }}
        />
      )}

      {/* Modal Inspection APRIA */}
      {showInspectionAPRIAModal && (
        <InspectionAPRIAModal
          isOpen={showInspectionAPRIAModal}
          onClose={() => {
            setShowInspectionAPRIAModal(false);
            setSelectedEquipementAPRIA(null);
          }}
          tenantSlug={tenantSlug}
          user={user}
          equipementPreselectionne={selectedEquipementAPRIA}
          onInspectionCreated={() => {
            fetchData();
          }}
        />
      )}

      {/* Modal Historique APRIA */}
      {showHistoriqueAPRIAModal && (
        <HistoriqueInspectionsAPRIA
          isOpen={showHistoriqueAPRIAModal}
          onClose={() => {
            setShowHistoriqueAPRIAModal(false);
            setSelectedEquipementAPRIA(null);
          }}
          tenantSlug={tenantSlug}
          equipementId={selectedEquipementAPRIA?.id}
        />
      )}

      {/* Modal Inspection Équipement (formulaire assigné) */}
      {showInspectionEquipementModal && selectedEquipementInspection && (
        <InspectionEquipementWrapper
          isOpen={showInspectionEquipementModal}
          onClose={() => {
            setShowInspectionEquipementModal(false);
            setSelectedEquipementInspection(null);
          }}
          tenantSlug={tenantSlug}
          user={user}
          equipement={selectedEquipementInspection}
          onSuccess={() => {
            setShowInspectionEquipementModal(false);
            setSelectedEquipementInspection(null);
            fetchData();
          }}
        />
      )}

      {/* Modal Historique Inspections Équipement */}
      {showHistoriqueEquipementModal && selectedEquipementInspection && (
        <HistoriqueInspectionsUnifiees
          isOpen={showHistoriqueEquipementModal}
          onClose={() => {
            setShowHistoriqueEquipementModal(false);
            setSelectedEquipementInspection(null);
          }}
          tenantSlug={tenantSlug}
          assetId={selectedEquipementInspection.id}
          assetType="equipement"
          assetName={selectedEquipementInspection.nom}
        />
      )}
    </div>
  );
};

// ===== Composants utilitaires =====
const StatCard = ({ label, value, icon, color, onClick, active }) => (
  <div 
    onClick={onClick}
    style={{
      background: active ? color : 'white',
      borderRadius: '0.5rem',
      padding: '1rem',
      boxShadow: active ? `0 4px 12px ${color}40` : '0 1px 3px rgba(0,0,0,0.1)',
      borderLeft: `4px solid ${color}`,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.2s ease',
      transform: active ? 'scale(1.02)' : 'scale(1)'
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ fontSize: '1.5rem' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: active ? 'white' : color }}>{value}</div>
        <div style={{ fontSize: '0.75rem', color: active ? 'rgba(255,255,255,0.9)' : '#6b7280' }}>{label}</div>
      </div>
    </div>
  </div>
);

const SubTabButton = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: '0.5rem 1rem',
      background: active ? '#3b82f6' : 'transparent',
      color: active ? 'white' : '#4b5563',
      border: 'none',
      borderRadius: '0.375rem',
      cursor: 'pointer',
      fontWeight: active ? '600' : '400',
      transition: 'all 0.2s'
    }}
  >
    {label}
  </button>
);

const EtatBadge = ({ etat }) => {
  const config = {
    neuf: { label: 'Neuf', color: '#10b981', bg: '#d1fae5' },
    bon: { label: 'Bon', color: '#22c55e', bg: '#dcfce7' },
    a_reparer: { label: 'À réparer', color: '#f59e0b', bg: '#fef3c7' },
    en_reparation: { label: 'En réparation', color: '#3b82f6', bg: '#dbeafe' },
    hors_service: { label: 'Hors service', color: '#ef4444', bg: '#fee2e2' }
  };
  const c = config[etat] || { label: etat, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span style={{
      padding: '0.25rem 0.5rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: '500',
      color: c.color,
      background: c.bg
    }}>
      {c.label}
    </span>
  );
};

// ===== Tab Équipements =====
const EquipementsTab = ({
  equipements,
  categories,
  filtreCategorie,
  setFiltreCategorie,
  filtreEtat,
  setFiltreEtat,
  filtreRecherche,
  setFiltreRecherche,
  onCreateEquipement,
  onEditEquipement,
  onDeleteEquipement,
  onMaintenance,
  onInspectionAPRIA,
  onHistoriqueAPRIA,
  onInspectionEquipement,
  onHistoriqueEquipement,
  isAPRIA,
  hasInspectionForm,
  isEmploye,
  user
}) => {
  return (
    <div>
      {/* Barre d'actions et filtres */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
        {!isEmploye && (user?.role === 'admin' || user?.role === 'superviseur') && (
          <>
            <Button onClick={onCreateEquipement} style={{ background: '#22c55e' }}>
              ➕ Ajouter un équipement
            </Button>
            
            <Button 
              onClick={async () => {
                try {
                  const API_URL = process.env.REACT_APP_BACKEND_URL;
                  const tenantSlug = window.location.pathname.split('/')[1];
                  const token = getTenantToken();
                  
                  if (!token) {
                    alert('Erreur: Vous devez être connecté');
                    return;
                  }
                  
                  const params = new URLSearchParams();
                  if (filtreCategorie) params.append('categorie_id', filtreCategorie);
                  if (filtreEtat) params.append('etat', filtreEtat);
                  
                  const url = `${API_URL}/api/${tenantSlug}/equipements/export-csv?${params.toString()}`;
                  
                  const response = await fetch(url, {
                    headers: { 
                      'Authorization': `Bearer ${token}`
                    }
                  });
                  
                  if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ detail: 'Erreur inconnue' }));
                    throw new Error(errorData.detail || 'Erreur lors de l\'export');
                  }
                  
                  const blob = await response.blob();
                  const downloadUrl = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = downloadUrl;
                  a.download = `equipements_${new Date().toISOString().split('T')[0]}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(downloadUrl);
                } catch (err) {
                  console.error('Erreur export CSV:', err);
                  alert('Erreur export CSV: ' + err.message);
                }
              }}
              variant="outline"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              📊 Export CSV
            </Button>
            
            <Button 
              onClick={async () => {
                try {
                  const API_URL = process.env.REACT_APP_BACKEND_URL;
                  const tenantSlug = window.location.pathname.split('/')[1];
                  const token = getTenantToken();
                  
                  if (!token) {
                    alert('Erreur: Vous devez être connecté');
                    return;
                  }
                  
                  const params = new URLSearchParams();
                  if (filtreCategorie) params.append('categorie_id', filtreCategorie);
                  if (filtreEtat) params.append('etat', filtreEtat);
                  
                  const url = `${API_URL}/api/${tenantSlug}/equipements/export-pdf?${params.toString()}`;
                  
                  const response = await fetch(url, {
                    headers: { 
                      'Authorization': `Bearer ${token}`
                    }
                  });
                  
                  if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ detail: 'Erreur inconnue' }));
                    throw new Error(errorData.detail || 'Erreur lors de l\'export');
                  }
                  
                  const blob = await response.blob();
                  const downloadUrl = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = downloadUrl;
                  a.download = `equipements_${new Date().toISOString().split('T')[0]}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(downloadUrl);
                } catch (err) {
                  console.error('Erreur export PDF:', err);
                  alert('Erreur export PDF: ' + err.message);
                }
              }}
              variant="outline"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#DC2626', color: 'white', border: 'none' }}
            >
              📄 Export PDF
            </Button>
          </>
        )}
        
        <Input
          placeholder="🔍 Rechercher..."
          value={filtreRecherche}
          onChange={(e) => setFiltreRecherche(e.target.value)}
          style={{ minWidth: '150px', flex: '1 1 auto', maxWidth: '300px' }}
        />
        
        {/* Filtres par catégorie et état - masqués pour les pompiers */}
        {!isEmploye && (
          <>
            <select
              value={filtreCategorie}
              onChange={(e) => setFiltreCategorie(e.target.value)}
              style={{
                padding: '0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                background: 'white'
              }}
            >
              <option value="">Toutes catégories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.icone} {cat.nom}</option>
              ))}
            </select>
            
            <select
              value={filtreEtat}
              onChange={(e) => setFiltreEtat(e.target.value)}
              style={{
                padding: '0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                background: 'white'
              }}
            >
              <option value="">Tous états</option>
              <option value="neuf">Neuf</option>
              <option value="bon">Bon</option>
              <option value="a_reparer">À réparer</option>
              <option value="en_reparation">En réparation</option>
              <option value="hors_service">Hors service</option>
            </select>
          </>
        )}
      </div>

      {/* Liste des équipements */}
      {equipements.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
          <p>Aucun équipement trouvé</p>
          {categories.length === 0 && (
            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Commencez par initialiser les catégories
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {equipements.map(equip => (
            <EquipementCard
              key={equip.id}
              equipement={equip}
              onEdit={() => onEditEquipement(equip)}
              onDelete={() => onDeleteEquipement(equip)}
              onMaintenance={() => onMaintenance(equip)}
              onInspectionAPRIA={() => onInspectionAPRIA && onInspectionAPRIA(equip)}
              onHistoriqueAPRIA={() => onHistoriqueAPRIA && onHistoriqueAPRIA(equip)}
              onInspectionEquipement={() => onInspectionEquipement && onInspectionEquipement(equip)}
              onHistoriqueEquipement={() => onHistoriqueEquipement && onHistoriqueEquipement(equip)}
              isAPRIA={isAPRIA && isAPRIA(equip)}
              hasInspectionForm={hasInspectionForm && hasInspectionForm(equip)}
              canEdit={user?.role === 'admin' || user?.role === 'superviseur'}
              canDelete={user?.role === 'admin'}
              isEmploye={isEmploye}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ===== Carte Équipement =====
const EquipementCard = ({ equipement, onEdit, onDelete, onMaintenance, onInspectionAPRIA, onHistoriqueAPRIA, onInspectionEquipement, onHistoriqueEquipement, isAPRIA, hasInspectionForm, canEdit, canDelete, isEmploye }) => {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div style={{
      background: 'white',
      borderRadius: '0.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      border: isAPRIA ? '2px solid #f97316' : (hasInspectionForm ? '2px solid #3b82f6' : 'none')
    }}>
      {/* En-tête */}
      <div 
        style={{
          padding: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          cursor: 'pointer'
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 'bold', color: '#1f2937' }}>{equipement.code_unique}</span>
            <EtatBadge etat={equipement.etat} />
            {equipement.alerte_maintenance && <span title="Maintenance requise">⚠️</span>}
            {isAPRIA && <span title="Équipement APRIA" style={{ backgroundColor: '#fed7aa', padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: '600', color: '#9a3412' }}>APRIA</span>}
            {hasInspectionForm && !isAPRIA && <span title="Inspection requise" style={{ backgroundColor: '#dbeafe', padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: '600', color: '#1e40af' }}>📝 Inspectable</span>}
          </div>
          <div style={{ fontSize: '1rem', color: '#374151' }}>{equipement.nom}</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
            {equipement.categorie_nom && <span style={{ marginRight: '1rem' }}>📁 {equipement.categorie_nom}</span>}
            {equipement.emplacement_nom && <span style={{ marginRight: '1rem' }}>📍 {equipement.emplacement_nom}</span>}
            {equipement.vehicule_nom && <span style={{ marginRight: '1rem' }}>🚒 {equipement.vehicule_nom}</span>}
            {equipement.employe_nom && <span>👤 {equipement.employe_nom}</span>}
          </div>
          {/* Info dernière inspection APRIA */}
          {isAPRIA && equipement.derniere_inspection && (
            <div style={{ fontSize: '0.7rem', color: equipement.derniere_inspection.conforme ? '#16a34a' : '#dc2626', marginTop: '0.25rem' }}>
              Dernière inspection: {new Date(equipement.derniere_inspection.date_inspection).toLocaleDateString('fr-CA')} 
              {equipement.derniere_inspection.conforme ? ' ✅' : ' ❌'}
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Boutons APRIA - accessibles à tous */}
          {isAPRIA && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onInspectionAPRIA && onInspectionAPRIA(); }}
                style={{ padding: '0.5rem', background: '#f97316', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
                title="Inspecter APRIA"
              >
                📝
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onHistoriqueAPRIA && onHistoriqueAPRIA(); }}
                style={{ padding: '0.5rem', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
                title="Historique inspections"
              >
                📋
              </button>
            </>
          )}
          
          {/* Boutons Inspection équipement avec formulaire assigné - accessibles à tous */}
          {hasInspectionForm && !isAPRIA && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onInspectionEquipement && onInspectionEquipement(); }}
                style={{ padding: '0.5rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
                title="Inspecter"
              >
                📝
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onHistoriqueEquipement && onHistoriqueEquipement(); }}
                style={{ padding: '0.5rem', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
                title="Historique inspections"
              >
                📋
              </button>
            </>
          )}
          
          {/* Boutons admin/superviseur uniquement */}
          {canEdit && !isEmploye && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onMaintenance(); }}
                style={{ padding: '0.5rem', background: '#059669', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
                title="Maintenance"
              >
                🔧
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                style={{ padding: '0.5rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
                title="Modifier"
              >
                ✏️
              </button>
            </>
          )}
          {canDelete && !isEmploye && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              style={{ padding: '0.5rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
              title="Supprimer"
            >
              🗑️
            </button>
          )}
          <span style={{ color: '#9ca3af' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Détails (accordéon) */}
      {expanded && (
        <div style={{ padding: '1rem', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {/* Quantité - Toujours afficher */}
            <div>
              <Label style={{ fontSize: '0.75rem', color: '#6b7280' }}>Quantité en stock</Label>
              <p style={{ color: '#374151', fontWeight: 'bold', fontSize: '1.125rem' }}>
                {equipement.quantite || 0}
                {equipement.quantite_minimum > 0 && equipement.quantite <= equipement.quantite_minimum && (
                  <span style={{ color: '#dc2626', marginLeft: '0.5rem', fontSize: '0.75rem' }}>⚠️ Stock bas</span>
                )}
              </p>
            </div>
            {/* Gérer les quantités */}
            <div>
              <Label style={{ fontSize: '0.75rem', color: '#6b7280' }}>Type d'équipement</Label>
              <p style={{ color: '#374151' }}>
                {equipement.gerer_quantite ? (
                  <span style={{ background: '#dcfce7', color: '#166534', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.875rem' }}>
                    📦 Consommable (stock géré)
                  </span>
                ) : (
                  <span style={{ background: '#f3f4f6', color: '#6b7280', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.875rem' }}>
                    🔧 Non-consommable
                  </span>
                )}
              </p>
            </div>
            {equipement.description && (
              <div>
                <Label style={{ fontSize: '0.75rem', color: '#6b7280' }}>Description</Label>
                <p style={{ color: '#374151' }}>{equipement.description}</p>
              </div>
            )}
            {equipement.date_derniere_maintenance && (
              <div>
                <Label style={{ fontSize: '0.75rem', color: '#6b7280' }}>Dernière maintenance</Label>
                <p style={{ color: '#374151' }}>{equipement.date_derniere_maintenance}</p>
              </div>
            )}
            {equipement.date_prochaine_maintenance && (
              <div>
                <Label style={{ fontSize: '0.75rem', color: '#6b7280' }}>Prochaine maintenance</Label>
                <p style={{ color: '#374151' }}>{equipement.date_prochaine_maintenance}</p>
              </div>
            )}
            {equipement.norme_reference && (
              <div>
                <Label style={{ fontSize: '0.75rem', color: '#6b7280' }}>Norme de référence</Label>
                <p style={{ color: '#374151' }}>{equipement.norme_reference}</p>
              </div>
            )}
            {equipement.prix_achat > 0 && (
              <div>
                <Label style={{ fontSize: '0.75rem', color: '#6b7280' }}>Prix d'achat</Label>
                <p style={{ color: '#374151' }}>{equipement.prix_achat.toFixed(2)} $</p>
              </div>
            )}
            {equipement.notes && (
              <div style={{ gridColumn: '1 / -1' }}>
                <Label style={{ fontSize: '0.75rem', color: '#6b7280' }}>Notes</Label>
                <p style={{ color: '#374151' }}>{equipement.notes}</p>
              </div>
            )}
            {/* Champs personnalisés */}
            {equipement.champs_personnalises && Object.keys(equipement.champs_personnalises).length > 0 && (
              <div style={{ gridColumn: '1 / -1' }}>
                <Label style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem', display: 'block' }}>
                  Champs personnalisés
                </Label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {Object.entries(equipement.champs_personnalises).map(([key, value]) => (
                    <span key={key} style={{
                      background: '#e5e7eb',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.875rem'
                    }}>
                      <strong>{key}:</strong> {String(value)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ===== Tab Catégories =====
const CategoriesTab = ({ categories, equipements, onCreateCategorie, onEditCategorie, onDeleteCategorie, user }) => {
  // Compter les équipements par catégorie
  const countByCategorie = {};
  equipements.forEach(e => {
    countByCategorie[e.categorie_id] = (countByCategorie[e.categorie_id] || 0) + 1;
  });

  return (
    <div>
      {/* Barre d'actions */}
      {user?.role === 'admin' && (
        <div style={{ marginBottom: '1rem' }}>
          <Button onClick={onCreateCategorie} style={{ background: '#22c55e' }}>
            ➕ Créer une catégorie
          </Button>
        </div>
      )}

      {/* Grille des catégories */}
      {categories.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
          <p>Aucune catégorie</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Cliquez sur "Initialiser les catégories" pour commencer
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {categories.map(cat => (
            <div
              key={cat.id}
              style={{
                background: 'white',
                borderRadius: '0.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                borderLeft: `4px solid ${cat.couleur || '#6366f1'}`,
                padding: '1rem',
                overflow: 'hidden'
              }}
            >
              {/* En-tête avec titre et boutons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {cat.icone} {cat.nom}
                </div>
                {user?.role === 'admin' && (
                  <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                    <button
                      onClick={() => onEditCategorie(cat)}
                      style={{ padding: '0.25rem 0.5rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.75rem' }}
                      title="Modifier la catégorie"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => {
                        if (cat.est_predefinit) {
                          if (window.confirm(`⚠️ Attention : "${cat.nom}" est une catégorie système.\n\nÊtes-vous sûr de vouloir la supprimer ?`)) {
                            onDeleteCategorie(cat);
                          }
                        } else {
                          onDeleteCategorie(cat);
                        }
                      }}
                      style={{ padding: '0.25rem 0.5rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.75rem' }}
                      title="Supprimer la catégorie"
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>
              
              {/* Description */}
              {cat.description && (
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem', lineHeight: '1.3' }}>
                  {cat.description}
                </p>
              )}
              
              {/* Infos norme et fréquence */}
              <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                {cat.norme_reference && <span style={{ marginRight: '0.75rem' }}>📜 {cat.norme_reference}</span>}
                {cat.frequence_inspection && <span>🔄 {cat.frequence_inspection}</span>}
              </div>
              
              {/* Badges */}
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                <span style={{
                  background: '#dbeafe',
                  color: '#1e40af',
                  padding: '0.125rem 0.5rem',
                  borderRadius: '9999px',
                  fontSize: '0.7rem',
                  whiteSpace: 'nowrap'
                }}>
                  {countByCategorie[cat.id] || 0} équipement(s)
                </span>
                {cat.permet_assignation_employe && (
                  <span style={{
                    background: '#fce7f3',
                    color: '#be185d',
                    padding: '0.125rem 0.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.7rem',
                    whiteSpace: 'nowrap'
                  }}>
                    👤 Assignable
                  </span>
                )}
                {cat.est_predefinit && (
                  <span style={{
                    background: '#f3f4f6',
                    color: '#6b7280',
                    padding: '0.125rem 0.5rem',
                    borderRadius: '9999px',
                    fontSize: '0.7rem',
                    whiteSpace: 'nowrap'
                  }}>
                    🔒 Système
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ===== Modal Catégorie =====
const CategorieModal = ({ mode, categorie, tenantSlug, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    nom: categorie?.nom || '',
    description: categorie?.description || '',
    norme_reference: categorie?.norme_reference || '',
    frequence_inspection: categorie?.frequence_inspection || '',
    couleur: categorie?.couleur || '#6366f1',
    icone: categorie?.icone || '📦',
    permet_assignation_employe: categorie?.permet_assignation_employe || false,
    // Support pour sélection multiple - tableau d'IDs et d'emails
    personnes_ressources: categorie?.personnes_ressources || [],
    // Garder les anciens champs pour compatibilité
    personne_ressource_id: categorie?.personne_ressource_id || '',
    personne_ressource_email: categorie?.personne_ressource_email || ''
  });
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);

  // Charger la liste de TOUS les utilisateurs
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersData = await apiGet(tenantSlug, '/users');
        // Trier par rôle puis par nom pour faciliter la sélection
        const sorted = (usersData || []).sort((a, b) => {
          // Ordre des rôles: admin > superviseur > employe (pompiers) > stagiaire
          const roleOrder = { admin: 0, superviseur: 1, employe: 2, pompier: 2, stagiaire: 3 };
          const roleCompare = (roleOrder[a.role] || 4) - (roleOrder[b.role] || 4);
          if (roleCompare !== 0) return roleCompare;
          return `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`);
        });
        setUsers(sorted);
      } catch (err) {
        console.error('Erreur chargement utilisateurs:', err);
      }
    };
    loadUsers();
  }, [tenantSlug]);

  // Initialiser personnes_ressources depuis l'ancien format si nécessaire
  useEffect(() => {
    if (categorie?.personne_ressource_id && (!formData.personnes_ressources || formData.personnes_ressources.length === 0)) {
      setFormData(prev => ({
        ...prev,
        personnes_ressources: [{
          id: categorie.personne_ressource_id,
          email: categorie.personne_ressource_email || ''
        }]
      }));
    }
  }, [categorie]);

  const handleTogglePersonne = (userId) => {
    const selectedUser = users.find(u => u.id === userId);
    if (!selectedUser) return;

    setFormData(prev => {
      const currentList = prev.personnes_ressources || [];
      const exists = currentList.some(p => p.id === userId);
      
      let newList;
      if (exists) {
        // Retirer
        newList = currentList.filter(p => p.id !== userId);
      } else {
        // Ajouter
        newList = [...currentList, { id: userId, email: selectedUser.email }];
      }
      
      return {
        ...prev,
        personnes_ressources: newList,
        // Mettre à jour les anciens champs pour compatibilité backend
        personne_ressource_id: newList.length > 0 ? newList[0].id : '',
        personne_ressource_email: newList.length > 0 ? newList[0].email : ''
      };
    });
  };

  const isPersonneSelected = (userId) => {
    return (formData.personnes_ressources || []).some(p => p.id === userId);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nom.trim()) {
      alert('Le nom est requis');
      return;
    }
    
    setLoading(true);
    try {
      if (mode === 'edit') {
        await apiPut(tenantSlug, `/equipements/categories/${categorie.id}`, formData);
      } else {
        await apiPost(tenantSlug, '/equipements/categories', formData);
      }
      onSuccess();
    } catch (err) {
      alert('❌ Erreur: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const icones = ['📦', '🔧', '🔴', '💧', '🏥', '🪜', '🫁', '🔵', '😷', '⚠️', '🟡', '🧯', '📻', '🎯', '⭐'];

  return (
    <ModalWrapper onClose={onClose}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        {mode === 'edit' ? '✏️ Modifier la catégorie' : '➕ Nouvelle catégorie'}
      </h2>
      
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <Label>Nom *</Label>
            <Input
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              required
            />
          </div>
          
          <div>
            <Label>Description</Label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <Label>Norme de référence</Label>
              <Input
                value={formData.norme_reference}
                onChange={(e) => setFormData({ ...formData, norme_reference: e.target.value })}
                placeholder="Ex: NFPA 1962"
              />
            </div>
            <div>
              <Label>Fréquence d'inspection</Label>
              <Input
                value={formData.frequence_inspection}
                onChange={(e) => setFormData({ ...formData, frequence_inspection: e.target.value })}
                placeholder="Ex: 1 an"
              />
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <Label>Couleur</Label>
              <input
                type="color"
                value={formData.couleur}
                onChange={(e) => setFormData({ ...formData, couleur: e.target.value })}
                style={{ width: '100%', height: '40px', cursor: 'pointer' }}
              />
            </div>
            <div>
              <Label>Icône</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {icones.map(ic => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setFormData({ ...formData, icone: ic })}
                    style={{
                      padding: '0.25rem 0.5rem',
                      border: formData.icone === ic ? '2px solid #3b82f6' : '1px solid #d1d5db',
                      borderRadius: '0.25rem',
                      background: formData.icone === ic ? '#dbeafe' : 'white',
                      cursor: 'pointer'
                    }}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              id="permet_assignation"
              checked={formData.permet_assignation_employe}
              onChange={(e) => setFormData({ ...formData, permet_assignation_employe: e.target.checked })}
            />
            <Label htmlFor="permet_assignation" style={{ cursor: 'pointer' }}>
              Permettre l'assignation aux employés
            </Label>
          </div>

          {/* Personnes ressources pour les alertes d'inspection - Sélection multiple */}
          <div style={{ 
            marginTop: '0.5rem',
            padding: '0.75rem',
            backgroundColor: '#FEF3C7',
            borderRadius: '8px',
            border: '1px solid #F59E0B'
          }}>
            <Label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#92400E' }}>
              👥 Personnes ressources (alertes inspections)
            </Label>
            <p style={{ fontSize: '0.75rem', color: '#B45309', marginBottom: '0.75rem' }}>
              Ces personnes recevront des notifications lorsque des équipements de cette catégorie nécessitent une inspection.
            </p>
            
            {/* Liste des personnes sélectionnées */}
            {formData.personnes_ressources?.length > 0 && (
              <div style={{ 
                marginBottom: '0.75rem', 
                padding: '0.5rem', 
                backgroundColor: '#D1FAE5', 
                borderRadius: '6px',
                border: '1px solid #10B981'
              }}>
                <span style={{ fontSize: '0.75rem', color: '#065F46', fontWeight: '600' }}>
                  ✅ {formData.personnes_ressources.length} personne(s) sélectionnée(s):
                </span>
                <div style={{ marginTop: '0.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                  {formData.personnes_ressources.map(p => {
                    const user = users.find(u => u.id === p.id);
                    return (
                      <span key={p.id} style={{
                        fontSize: '0.7rem',
                        padding: '0.15rem 0.4rem',
                        backgroundColor: '#10B981',
                        color: 'white',
                        borderRadius: '12px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        {user ? `${user.prenom} ${user.nom}` : p.email}
                        <button 
                          type="button"
                          onClick={() => handleTogglePersonne(p.id)}
                          style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }}
                        >×</button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Liste des utilisateurs avec checkboxes */}
            <div style={{ 
              maxHeight: '200px', 
              overflowY: 'auto', 
              border: '1px solid #D1D5DB', 
              borderRadius: '6px',
              backgroundColor: 'white'
            }}>
              {/* Admins */}
              {users.filter(u => u.role === 'admin').length > 0 && (
                <div>
                  <div style={{ padding: '0.35rem 0.5rem', backgroundColor: '#F3F4F6', fontWeight: '600', fontSize: '0.75rem', color: '#4B5563', borderBottom: '1px solid #E5E7EB' }}>
                    👑 Administrateurs
                  </div>
                  {users.filter(u => u.role === 'admin').map(user => (
                    <label key={user.id} style={{ 
                      display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', 
                      cursor: 'pointer', borderBottom: '1px solid #F3F4F6',
                      backgroundColor: isPersonneSelected(user.id) ? '#DBEAFE' : 'transparent'
                    }}>
                      <input 
                        type="checkbox" 
                        checked={isPersonneSelected(user.id)}
                        onChange={() => handleTogglePersonne(user.id)}
                      />
                      <span style={{ fontSize: '0.8rem' }}>{user.prenom} {user.nom}</span>
                      <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>({user.email})</span>
                    </label>
                  ))}
                </div>
              )}
              
              {/* Superviseurs */}
              {users.filter(u => u.role === 'superviseur').length > 0 && (
                <div>
                  <div style={{ padding: '0.35rem 0.5rem', backgroundColor: '#F3F4F6', fontWeight: '600', fontSize: '0.75rem', color: '#4B5563', borderBottom: '1px solid #E5E7EB' }}>
                    ⭐ Superviseurs
                  </div>
                  {users.filter(u => u.role === 'superviseur').map(user => (
                    <label key={user.id} style={{ 
                      display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', 
                      cursor: 'pointer', borderBottom: '1px solid #F3F4F6',
                      backgroundColor: isPersonneSelected(user.id) ? '#DBEAFE' : 'transparent'
                    }}>
                      <input 
                        type="checkbox" 
                        checked={isPersonneSelected(user.id)}
                        onChange={() => handleTogglePersonne(user.id)}
                      />
                      <span style={{ fontSize: '0.8rem' }}>{user.prenom} {user.nom}</span>
                      <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>({user.email})</span>
                    </label>
                  ))}
                </div>
              )}
              
              {/* Employés (Pompiers) */}
              {users.filter(u => ['employe', 'pompier'].includes(u.role)).length > 0 && (
                <div>
                  <div style={{ padding: '0.35rem 0.5rem', backgroundColor: '#F3F4F6', fontWeight: '600', fontSize: '0.75rem', color: '#4B5563', borderBottom: '1px solid #E5E7EB' }}>
                    🚒 Pompiers
                  </div>
                  {users.filter(u => ['employe', 'pompier'].includes(u.role)).map(user => (
                    <label key={user.id} style={{ 
                      display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', 
                      cursor: 'pointer', borderBottom: '1px solid #F3F4F6',
                      backgroundColor: isPersonneSelected(user.id) ? '#DBEAFE' : 'transparent'
                    }}>
                      <input 
                        type="checkbox" 
                        checked={isPersonneSelected(user.id)}
                        onChange={() => handleTogglePersonne(user.id)}
                      />
                      <span style={{ fontSize: '0.8rem' }}>{user.prenom} {user.nom}</span>
                      <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>({user.email})</span>
                    </label>
                  ))}
                </div>
              )}
              
              {/* Stagiaires */}
              {users.filter(u => u.role === 'stagiaire').length > 0 && (
                <div>
                  <div style={{ padding: '0.35rem 0.5rem', backgroundColor: '#F3F4F6', fontWeight: '600', fontSize: '0.75rem', color: '#4B5563', borderBottom: '1px solid #E5E7EB' }}>
                    📚 Stagiaires
                  </div>
                  {users.filter(u => u.role === 'stagiaire').map(user => (
                    <label key={user.id} style={{ 
                      display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', 
                      cursor: 'pointer', borderBottom: '1px solid #F3F4F6',
                      backgroundColor: isPersonneSelected(user.id) ? '#DBEAFE' : 'transparent'
                    }}>
                      <input 
                        type="checkbox" 
                        checked={isPersonneSelected(user.id)}
                        onChange={() => handleTogglePersonne(user.id)}
                      />
                      <span style={{ fontSize: '0.8rem' }}>{user.prenom} {user.nom}</span>
                      <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>({user.email})</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </ModalWrapper>
  );
};

// ===== Modal Équipement =====
const EquipementModal = ({ mode, equipement, categories, tenantSlug, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    nom: equipement?.nom || '',
    code_unique: equipement?.code_unique || '',
    categorie_id: equipement?.categorie_id || '',
    description: equipement?.description || '',
    etat: equipement?.etat || 'bon',
    quantite: equipement?.quantite || 1,
    gerer_quantite: equipement?.gerer_quantite || false,
    emplacement_type: equipement?.emplacement_type || '',
    emplacement_nom: equipement?.emplacement_nom || '',
    vehicule_id: equipement?.vehicule_id || '',
    employe_id: equipement?.employe_id || '',
    norme_reference: equipement?.norme_reference || '',
    frequence_maintenance: equipement?.frequence_maintenance || '',
    date_achat: equipement?.date_achat || '',
    prix_achat: equipement?.prix_achat || 0,
    notes: equipement?.notes || '',
    champs_personnalises: equipement?.champs_personnalises || {},
    modele_inspection_id: equipement?.modele_inspection_id || ''
  });
  const [loading, setLoading] = useState(false);
  const [vehicules, setVehicules] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [formulaires, setFormulaires] = useState([]);
  const [selectedCategorie, setSelectedCategorie] = useState(null);

  // Charger véhicules, employés et formulaires
  useEffect(() => {
    const loadData = async () => {
      try {
        const [vehiculesData, employesData, formulairesData] = await Promise.all([
          apiGet(tenantSlug, '/actifs/vehicules').catch(() => []),
          apiGet(tenantSlug, '/users').catch(() => []),
          apiGet(tenantSlug, '/formulaires-inspection').catch(() => [])
        ]);
        setVehicules(vehiculesData || []);
        setEmployes(employesData || []);
        // Filtrer les formulaires actifs qui ont la catégorie "equipement"
        // Ne PAS inclure les formulaires de type EPI ou autres catégories
        const formulairesEquipement = (formulairesData || []).filter(f => 
          f.est_actif !== false && 
          f.categorie_ids?.includes('equipement')
        );
        setFormulaires(formulairesEquipement);
      } catch (err) {
        console.error('Erreur chargement données:', err);
      }
    };
    loadData();
  }, [tenantSlug]);

  // Mettre à jour la catégorie sélectionnée
  useEffect(() => {
    if (formData.categorie_id) {
      const cat = categories.find(c => c.id === formData.categorie_id);
      setSelectedCategorie(cat);
      // Initialiser les champs personnalisés si nouvelle catégorie
      if (cat && cat.champs_supplementaires && mode === 'create') {
        const champsInit = {};
        cat.champs_supplementaires.forEach(champ => {
          champsInit[champ.nom] = '';
        });
        setFormData(prev => ({
          ...prev,
          norme_reference: cat.norme_reference || prev.norme_reference,
          frequence_maintenance: cat.frequence_inspection || prev.frequence_maintenance,
          champs_personnalises: { ...champsInit, ...prev.champs_personnalises }
        }));
      }
    } else {
      setSelectedCategorie(null);
    }
  }, [formData.categorie_id, categories, mode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nom.trim() || !formData.code_unique.trim()) {
      alert('Le nom et le code unique sont requis');
      return;
    }
    
    setLoading(true);
    try {
      if (mode === 'edit') {
        await apiPut(tenantSlug, `/equipements/${equipement.id}`, formData);
      } else {
        await apiPost(tenantSlug, '/equipements', formData);
      }
      onSuccess();
    } catch (err) {
      alert('❌ Erreur: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const updateChampPersonnalise = (nom, valeur) => {
    setFormData(prev => ({
      ...prev,
      champs_personnalises: {
        ...prev.champs_personnalises,
        [nom]: valeur
      }
    }));
  };

  return (
    <ModalWrapper onClose={onClose} large>
      <h2 style={{ fontSize: 'clamp(1rem, 4vw, 1.25rem)', fontWeight: 'bold', marginBottom: '1rem' }}>
        {mode === 'edit' ? '✏️ Modifier l\'équipement' : '➕ Nouvel équipement'}
      </h2>
      
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gap: '0.75rem', paddingRight: '0.25rem' }}>
          {/* Informations de base */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
            <div>
              <Label style={{ fontSize: '0.8rem' }}>Code unique *</Label>
              <Input
                value={formData.code_unique}
                onChange={(e) => setFormData({ ...formData, code_unique: e.target.value.toUpperCase() })}
                placeholder="Ex: TUY-001"
                required
                style={{ fontSize: '0.875rem' }}
              />
            </div>
            <div>
              <Label style={{ fontSize: '0.8rem' }}>Catégorie</Label>
              <select
                value={formData.categorie_id}
                onChange={(e) => setFormData({ ...formData, categorie_id: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.875rem' }}
              >
                <option value="">Sélectionner...</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.icone} {cat.nom}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div>
            <Label>Nom *</Label>
            <Input
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              required
            />
          </div>
          
          <div>
            <Label>Description</Label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
            />
          </div>
          
          {/* État et quantité */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <Label>État</Label>
              <select
                value={formData.etat}
                onChange={(e) => setFormData({ ...formData, etat: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
              >
                <option value="neuf">Neuf</option>
                <option value="bon">Bon</option>
                <option value="a_reparer">À réparer</option>
                <option value="en_reparation">En réparation</option>
                <option value="hors_service">Hors service</option>
              </select>
            </div>
            <div>
              <Label>Quantité</Label>
              <Input
                type="number"
                min="1"
                value={formData.quantite}
                onChange={(e) => setFormData({ ...formData, quantite: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div>
              <Label>Prix d'achat ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={formData.prix_achat}
                onChange={(e) => setFormData({ ...formData, prix_achat: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
          
          {/* Gestion des quantités */}
          <div style={{ 
            backgroundColor: '#f0fdf4', 
            border: '1px solid #bbf7d0', 
            borderRadius: '0.5rem', 
            padding: '0.75rem' 
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.gerer_quantite || false}
                onChange={(e) => setFormData({ ...formData, gerer_quantite: e.target.checked })}
                style={{ width: '1.25rem', height: '1.25rem' }}
              />
              <span style={{ fontWeight: '500' }}>📦 Gérer les quantités (consommable)</span>
            </label>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem', marginLeft: '1.75rem' }}>
              Si coché, la quantité sera automatiquement déduite lors de l'utilisation en intervention.
            </p>
          </div>
          
          {/* Localisation */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <Label>Type d'emplacement</Label>
              <select
                value={formData.emplacement_type}
                onChange={(e) => setFormData({ ...formData, emplacement_type: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
              >
                <option value="">Non spécifié</option>
                <option value="vehicule">Véhicule</option>
                <option value="caserne">Caserne</option>
                <option value="stock">Stock/Entrepôt</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            <div>
              <Label>Véhicule assigné</Label>
              <select
                value={formData.vehicule_id}
                onChange={(e) => setFormData({ ...formData, vehicule_id: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
              >
                <option value="">Aucun</option>
                {vehicules.map(v => (
                  <option key={v.id} value={v.id}>🚒 {v.numero || v.nom}</option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Assignation employé (si catégorie le permet) */}
          {selectedCategorie?.permet_assignation_employe && (
            <div>
              <Label>👤 Employé assigné</Label>
              <select
                value={formData.employe_id}
                onChange={(e) => setFormData({ ...formData, employe_id: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
              >
                <option value="">Aucun</option>
                {employes.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.prenom} {emp.nom}</option>
                ))}
              </select>
            </div>
          )}
          
          {/* Maintenance */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <Label>Norme de référence</Label>
              <Input
                value={formData.norme_reference}
                onChange={(e) => setFormData({ ...formData, norme_reference: e.target.value })}
                placeholder="Ex: NFPA 1962"
              />
            </div>
            <div>
              <Label>Fréquence de maintenance</Label>
              <Input
                value={formData.frequence_maintenance}
                onChange={(e) => setFormData({ ...formData, frequence_maintenance: e.target.value })}
                placeholder="Ex: 1 an"
              />
            </div>
          </div>
          
          <div>
            <Label>Date d'achat</Label>
            <Input
              type="date"
              value={formData.date_achat}
              onChange={(e) => setFormData({ ...formData, date_achat: e.target.value })}
            />
          </div>
          
          {/* Champs personnalisés de la catégorie */}
          {selectedCategorie?.champs_supplementaires?.length > 0 && (
            <div style={{ background: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem' }}>
              <h3 style={{ fontWeight: '600', marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                📋 Champs spécifiques ({selectedCategorie.nom})
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                {selectedCategorie.champs_supplementaires.map(champ => (
                  <div key={champ.nom}>
                    <Label style={{ fontSize: '0.75rem' }}>
                      {champ.nom} {champ.obligatoire && '*'}
                    </Label>
                    {champ.type === 'select' ? (
                      <select
                        value={formData.champs_personnalises[champ.nom] || ''}
                        onChange={(e) => updateChampPersonnalise(champ.nom, e.target.value)}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', fontSize: '0.875rem' }}
                        required={champ.obligatoire}
                      >
                        <option value="">Sélectionner...</option>
                        {champ.options?.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : champ.type === 'date' ? (
                      <Input
                        type="date"
                        value={formData.champs_personnalises[champ.nom] || ''}
                        onChange={(e) => updateChampPersonnalise(champ.nom, e.target.value)}
                        required={champ.obligatoire}
                        style={{ fontSize: '0.875rem' }}
                      />
                    ) : champ.type === 'number' ? (
                      <Input
                        type="number"
                        value={formData.champs_personnalises[champ.nom] || ''}
                        onChange={(e) => updateChampPersonnalise(champ.nom, e.target.value)}
                        required={champ.obligatoire}
                        style={{ fontSize: '0.875rem' }}
                      />
                    ) : (
                      <Input
                        value={formData.champs_personnalises[champ.nom] || ''}
                        onChange={(e) => updateChampPersonnalise(champ.nom, e.target.value)}
                        required={champ.obligatoire}
                        style={{ fontSize: '0.875rem' }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Formulaire d'inspection assigné (optionnel) */}
          <div style={{ background: '#EFF6FF', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #BFDBFE' }}>
            <Label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#1E40AF' }}>
              📝 Formulaire d'inspection (optionnel)
            </Label>
            <p style={{ fontSize: '0.75rem', color: '#3B82F6', marginBottom: '0.75rem' }}>
              Si un formulaire est assigné, un bouton "Inspecter" apparaîtra pour cet équipement.
            </p>
            <select
              value={formData.modele_inspection_id}
              onChange={(e) => setFormData({ ...formData, modele_inspection_id: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #93C5FD', fontSize: '0.875rem', backgroundColor: 'white' }}
            >
              <option value="">Aucun formulaire (pas d'inspection)</option>
              {formulaires.map(f => (
                <option key={f.id} value={f.id}>📋 {f.nom}</option>
              ))}
            </select>
          </div>
          
          <div>
            <Label>Notes</Label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
            />
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </ModalWrapper>
  );
};

// ===== Modal Maintenance =====
const MaintenanceModal = ({ equipement, tenantSlug, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    type_intervention: 'maintenance',
    date_intervention: new Date().toISOString().split('T')[0],
    description: '',
    cout: 0,
    resultats: '',
    prochaine_intervention: '',
    notes: ''
  });
  const [historique, setHistorique] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Charger l'historique
  useEffect(() => {
    const loadHistorique = async () => {
      try {
        const data = await apiGet(tenantSlug, `/equipements/${equipement.id}/maintenances`);
        setHistorique(data || []);
      } catch (err) {
        console.error('Erreur chargement historique:', err);
      }
    };
    loadHistorique();
  }, [tenantSlug, equipement.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.description.trim()) {
      alert('La description est requise');
      return;
    }
    
    setLoading(true);
    try {
      await apiPost(tenantSlug, `/equipements/${equipement.id}/maintenances`, formData);
      onSuccess();
    } catch (err) {
      alert('❌ Erreur: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalWrapper onClose={onClose} large>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        🔧 Maintenance - {equipement.code_unique}
      </h2>
      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>{equipement.nom}</p>

      {/* Bouton pour afficher le formulaire */}
      {!showForm ? (
        <Button onClick={() => setShowForm(true)} style={{ marginBottom: '1rem' }}>
          ➕ Ajouter une intervention
        </Button>
      ) : (
        <form onSubmit={handleSubmit} style={{ background: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
          <h3 style={{ fontWeight: '600', marginBottom: '0.75rem' }}>Nouvelle intervention</h3>
          
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <Label>Type d'intervention</Label>
                <select
                  value={formData.type_intervention}
                  onChange={(e) => setFormData({ ...formData, type_intervention: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
                >
                  <option value="maintenance">Maintenance préventive</option>
                  <option value="reparation">Réparation</option>
                  <option value="test">Test/Inspection</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={formData.date_intervention}
                  onChange={(e) => setFormData({ ...formData, date_intervention: e.target.value })}
                  required
                />
              </div>
            </div>
            
            <div>
              <Label>Description *</Label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                required
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
              />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <Label>Coût ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.cout}
                  onChange={(e) => setFormData({ ...formData, cout: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Prochaine intervention</Label>
                <Input
                  type="date"
                  value={formData.prochaine_intervention}
                  onChange={(e) => setFormData({ ...formData, prochaine_intervention: e.target.value })}
                />
              </div>
            </div>
            
            <div>
              <Label>Résultats</Label>
              <Input
                value={formData.resultats}
                onChange={(e) => setFormData({ ...formData, resultats: e.target.value })}
                placeholder="Ex: Test pression OK - 300 PSI"
              />
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* Historique */}
      <div>
        <h3 style={{ fontWeight: '600', marginBottom: '0.75rem' }}>📜 Historique des interventions</h3>
        
        {historique.length === 0 ? (
          <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
            Aucune intervention enregistrée
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
            {historique.map(maint => (
              <div
                key={maint.id}
                style={{
                  background: 'white',
                  padding: '0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #e5e7eb'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontWeight: '600' }}>{maint.date_intervention}</span>
                    <span style={{
                      marginLeft: '0.5rem',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      background: maint.type_intervention === 'maintenance' ? '#dbeafe' : 
                                  maint.type_intervention === 'reparation' ? '#fee2e2' : '#f3f4f6',
                      color: maint.type_intervention === 'maintenance' ? '#1e40af' :
                             maint.type_intervention === 'reparation' ? '#dc2626' : '#374151'
                    }}>
                      {maint.type_intervention}
                    </span>
                  </div>
                  {maint.cout > 0 && (
                    <span style={{ color: '#059669', fontWeight: '600' }}>{maint.cout.toFixed(2)} $</span>
                  )}
                </div>
                <p style={{ marginTop: '0.25rem', color: '#374151' }}>{maint.description}</p>
                {maint.resultats && (
                  <p style={{ marginTop: '0.25rem', color: '#6b7280', fontSize: '0.875rem' }}>
                    📊 {maint.resultats}
                  </p>
                )}
                {maint.effectue_par && (
                  <p style={{ marginTop: '0.25rem', color: '#9ca3af', fontSize: '0.75rem' }}>
                    Par: {maint.effectue_par}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div style={{ marginTop: '1rem', textAlign: 'right' }}>
        <Button variant="outline" onClick={onClose}>Fermer</Button>
      </div>
    </ModalWrapper>
  );
};

// ===== Modal Wrapper =====
const ModalWrapper = ({ children, onClose, large }) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      zIndex: 100000,
      padding: '0.5rem',
      overflowY: 'auto'
    }}
    onClick={onClose}
  >
    <div
      style={{
        background: 'white',
        borderRadius: '0.5rem',
        padding: '1rem',
        width: large ? '800px' : '500px',
        maxWidth: '95vw',
        maxHeight: 'calc(100vh - 2rem)',
        overflow: 'visible',
        marginTop: '1rem',
        marginBottom: '1rem',
        position: 'relative'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ maxHeight: 'calc(100vh - 4rem)', overflowY: 'auto', overflowX: 'hidden' }}>
        {children}
      </div>
    </div>
  </div>
);

export default MaterielEquipementsModule;
