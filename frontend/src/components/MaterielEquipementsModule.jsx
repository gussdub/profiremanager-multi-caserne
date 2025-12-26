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
  const [selectedCategorie, setSelectedCategorie] = useState(null);
  const [selectedEquipement, setSelectedEquipement] = useState(null);
  const [selectedEquipementAPRIA, setSelectedEquipementAPRIA] = useState(null);
  const [modalMode, setModalMode] = useState('create');
  
  // Filtres
  const [filtreCategorie, setFiltreCategorie] = useState('');
  const [filtreEtat, setFiltreEtat] = useState('');
  const [filtreRecherche, setFiltreRecherche] = useState('');

  // Vérifier si un équipement est un APRIA
  const isAPRIA = (equipement) => {
    const categorieAPRIA = categories.find(c => c.nom?.toUpperCase().includes('APRIA'));
    if (categorieAPRIA && equipement.categorie_id === categorieAPRIA.id) return true;
    if (equipement.nom?.toUpperCase().includes('APRIA')) return true;
    if (equipement.description?.toUpperCase().includes('APRIA')) return true;
    return false;
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
  // Pour les pompiers : uniquement les APRIA
  // Pour admin/superviseur : tout l'inventaire
  const isPompier = user?.role === 'pompier';
  
  const equipementsFiltres = equipements.filter(e => {
    // Si c'est un pompier, ne montrer que les APRIA
    if (isPompier && !isAPRIA(e)) return false;
    
    if (filtreCategorie && e.categorie_id !== filtreCategorie) return false;
    if (filtreEtat && e.etat !== filtreEtat) return false;
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
            🔧 Matériel & Équipements
          </h2>
          {user?.role === 'admin' && categories.length === 0 && (
            <Button onClick={handleInitialiserCategories} disabled={loading}>
              📦 Initialiser les catégories
            </Button>
          )}
        </div>

        {/* Stats Cards */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <StatCard label="Total" value={stats.total} icon="📊" color="#3b82f6" />
            <StatCard label="En bon état" value={stats.par_etat?.bon || 0} icon="✅" color="#22c55e" />
            <StatCard label="À réparer" value={stats.par_etat?.a_reparer || 0} icon="🔧" color="#f59e0b" />
            <StatCard label="Hors service" value={stats.par_etat?.hors_service || 0} icon="❌" color="#ef4444" />
            <StatCard label="Alertes" value={stats.alertes?.total || 0} icon="⚠️" color="#dc2626" />
          </div>
        )}
      </div>

      {/* Sous-onglets */}
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

      {/* Contenu selon sous-onglet */}
      {activeSubTab === 'equipements' ? (
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
          isAPRIA={isAPRIA}
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
    </div>
  );
};

// ===== Composants utilitaires =====
const StatCard = ({ label, value, icon, color }) => (
  <div style={{
    background: 'white',
    borderRadius: '0.5rem',
    padding: '1rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    borderLeft: `4px solid ${color}`
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ fontSize: '1.5rem' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color }}>{value}</div>
        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{label}</div>
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
  isAPRIA,
  user
}) => {
  return (
    <div>
      {/* Barre d'actions et filtres */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
        {(user?.role === 'admin' || user?.role === 'superviseur') && (
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
          style={{ width: '200px' }}
        />
        
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
              isAPRIA={isAPRIA && isAPRIA(equip)}
              canEdit={user?.role === 'admin' || user?.role === 'superviseur'}
              canDelete={user?.role === 'admin'}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ===== Carte Équipement =====
const EquipementCard = ({ equipement, onEdit, onDelete, onMaintenance, onInspectionAPRIA, onHistoriqueAPRIA, isAPRIA, canEdit, canDelete }) => {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div style={{
      background: 'white',
      borderRadius: '0.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      overflow: 'hidden',
      border: isAPRIA ? '2px solid #f97316' : 'none'
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontWeight: 'bold', color: '#1f2937' }}>{equipement.code_unique}</span>
            <EtatBadge etat={equipement.etat} />
            {equipement.alerte_maintenance && <span title="Maintenance requise">⚠️</span>}
            {isAPRIA && <span title="Équipement APRIA" style={{ backgroundColor: '#fed7aa', padding: '0.125rem 0.5rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: '600', color: '#9a3412' }}>APRIA</span>}
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
          {/* Boutons APRIA */}
          {isAPRIA && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onInspectionAPRIA && onInspectionAPRIA(); }}
                style={{ padding: '0.5rem', background: '#f97316', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
                title="Inspecter APRIA"
              >
                🫁
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
          {canEdit && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onMaintenance(); }}
                style={{ padding: '0.5rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
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
          {canDelete && (
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
                padding: '1rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
                    {cat.icone} <span style={{ fontWeight: 'bold' }}>{cat.nom}</span>
                  </div>
                  {cat.description && (
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                      {cat.description}
                    </p>
                  )}
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {cat.norme_reference && <span style={{ marginRight: '1rem' }}>📜 {cat.norme_reference}</span>}
                    {cat.frequence_inspection && <span>🔄 {cat.frequence_inspection}</span>}
                  </div>
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                    <span style={{
                      background: '#dbeafe',
                      color: '#1e40af',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem'
                    }}>
                      {countByCategorie[cat.id] || 0} équipement(s)
                    </span>
                    {cat.permet_assignation_employe && (
                      <span style={{
                        background: '#fce7f3',
                        color: '#be185d',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem'
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
                        fontSize: '0.75rem'
                      }}>
                        🔒 Système
                      </span>
                    )}
                  </div>
                </div>
                
                {user?.role === 'admin' && !cat.est_predefinit && (
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      onClick={() => onEditCategorie(cat)}
                      style={{ padding: '0.25rem 0.5rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => onDeleteCategorie(cat)}
                      style={{ padding: '0.25rem 0.5rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.75rem' }}
                    >
                      🗑️
                    </button>
                  </div>
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
    permet_assignation_employe: categorie?.permet_assignation_employe || false
  });
  const [loading, setLoading] = useState(false);

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
    emplacement_type: equipement?.emplacement_type || '',
    emplacement_nom: equipement?.emplacement_nom || '',
    vehicule_id: equipement?.vehicule_id || '',
    employe_id: equipement?.employe_id || '',
    norme_reference: equipement?.norme_reference || '',
    frequence_maintenance: equipement?.frequence_maintenance || '',
    date_achat: equipement?.date_achat || '',
    prix_achat: equipement?.prix_achat || 0,
    notes: equipement?.notes || '',
    champs_personnalises: equipement?.champs_personnalises || {}
  });
  const [loading, setLoading] = useState(false);
  const [vehicules, setVehicules] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [selectedCategorie, setSelectedCategorie] = useState(null);

  // Charger véhicules et employés
  useEffect(() => {
    const loadData = async () => {
      try {
        const [vehiculesData, employesData] = await Promise.all([
          apiGet(tenantSlug, '/actifs/vehicules').catch(() => []),
          apiGet(tenantSlug, '/users').catch(() => [])
        ]);
        setVehicules(vehiculesData || []);
        setEmployes(employesData || []);
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
      <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        {mode === 'edit' ? '✏️ Modifier l\'équipement' : '➕ Nouvel équipement'}
      </h2>
      
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gap: '1rem', maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
          {/* Informations de base */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <Label>Code unique *</Label>
              <Input
                value={formData.code_unique}
                onChange={(e) => setFormData({ ...formData, code_unique: e.target.value.toUpperCase() })}
                placeholder="Ex: TUY-001"
                required
              />
            </div>
            <div>
              <Label>Catégorie</Label>
              <select
                value={formData.categorie_id}
                onChange={(e) => setFormData({ ...formData, categorie_id: e.target.value })}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.375rem', border: '1px solid #d1d5db' }}
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
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }}
    onClick={onClose}
  >
    <div
      style={{
        background: 'white',
        borderRadius: '0.5rem',
        padding: '1.5rem',
        width: large ? '800px' : '500px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        overflow: 'auto'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  </div>
);

export default MaterielEquipementsModule;
