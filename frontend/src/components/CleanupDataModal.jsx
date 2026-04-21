import React, { useState } from 'react';
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ChevronDown, ChevronRight, Trash2, CheckSquare, Square } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Définition des groupes et de leurs tables MongoDB
const GROUPS = [
  {
    id: 'batiments',
    label: 'Bâtiments',
    icon: '🏢',
    description: 'Bâtiments, historique, dossiers adresses, plans',
    tables: [
      { name: 'batiments', label: 'Bâtiments' },
      { name: 'batiments_historique', label: 'Historique bâtiments' },
      { name: 'import_dossier_adresses', label: 'Dossiers adresses (import PFM)' },
      { name: 'dependances_batiments', label: 'Dépendances' },
      { name: 'plans_intervention', label: 'Plans d\'intervention' },
      { name: 'import_duplicates', label: 'Doublons import' },
      { name: 'symboles_personnalises', label: 'Symboles personnalisés' },
      { name: 'secteurs_geographiques', label: 'Secteurs géographiques' },
    ],
  },
  {
    id: 'inspections',
    label: 'Préventions / Inspections',
    icon: '📋',
    description: 'Inspections, préventions, bornes, grilles, points d\'eau',
    tables: [
      { name: 'inspections', label: 'Inspections prévention' },
      { name: 'inspections_visuelles', label: 'Inspections visuelles' },
      { name: 'inspections_bornes_seches', label: 'Inspections bornes sèches' },
      { name: 'inspections_unifiees', label: 'Inspections unifiées' },
      { name: 'inspections_bornes', label: 'Inspections bornes' },
      { name: 'inspections_saaq', label: 'Inspections SAAQ' },
      { name: 'inspections_inventaire', label: 'Inspections inventaire' },
      { name: 'grilles_inspection', label: 'Grilles d\'inspection' },
      { name: 'avis_non_conformite', label: 'Avis de non-conformité' },
      { name: 'points_eau', label: 'Points d\'eau' },
      { name: 'maintenance_bornes', label: 'Maintenance bornes' },
      { name: 'travaux', label: 'Travaux' },
    ],
  },
  {
    id: 'users',
    label: 'Personnel',
    icon: '👤',
    description: 'Utilisateurs (sauf super-admins)',
    tables: [
      { id: 'users_all', name: 'users', label: 'Tous les utilisateurs' },
      { id: 'users_pfm', name: 'users', label: 'Utilisateurs PFM uniquement', filter: 'pfm_only', badge: '🔄 Import PFM' },
      { id: 'imported_personnel', name: 'imported_personnel', label: 'Personnel importé (cache PFM)' },
    ],
  },
  {
    id: 'equipements',
    label: 'EPI / Équipements',
    icon: '🧯',
    description: 'Équipements, inventaire, maintenance',
    tables: [
      { name: 'equipements', label: 'Équipements' },
      { name: 'inventaire_epi', label: 'Inventaire EPI' },
      { name: 'maintenance_equipements', label: 'Maintenance équipements' },
    ],
  },
  {
    id: 'interventions',
    label: 'Interventions',
    icon: '🚒',
    description: 'Interventions, historique, RCCI',
    tables: [
      { name: 'interventions', label: 'Interventions' },
      { name: 'interventions_historique', label: 'Historique interventions' },
      { name: 'rcci', label: 'Rapports RCCI' },
    ],
  },
  {
    id: 'formations',
    label: 'Formations',
    icon: '📚',
    description: 'Sessions de formation et inscriptions',
    tables: [
      { name: 'formations', label: 'Formations' },
      { name: 'sessions_formation', label: 'Sessions' },
      { name: 'inscriptions_formation', label: 'Inscriptions' },
    ],
  },
  {
    id: 'disponibilites',
    label: 'Disponibilités',
    icon: '📅',
    description: 'Disponibilités et congés du personnel',
    tables: [
      { name: 'disponibilites', label: 'Disponibilités' },
      { name: 'conges', label: 'Congés' },
    ],
  },
  {
    id: 'remplacements',
    label: 'Remplacements',
    icon: '🔄',
    description: 'Demandes et tentatives de remplacement',
    tables: [
      { name: 'demandes_remplacement', label: 'Demandes de remplacement' },
      { name: 'tentatives_remplacement', label: 'Tentatives de remplacement' },
    ],
  },
  {
    id: 'files',
    label: 'Fichiers',
    icon: '📎',
    description: 'Documents et fichiers stockés',
    tables: [
      { name: 'stored_files', label: 'Fichiers stockés (Azure)' },
    ],
  },
];

// Générer un ID unique pour chaque table (pour différencier users avec/sans filtre)
const getTableId = (table) => table.id || table.name;
const ALL_TABLE_IDS = GROUPS.flatMap(g => g.tables.map(t => getTableId(t)));

const CleanupDataModal = ({ isOpen, onClose }) => {
  const [selectedTables, setSelectedTables] = useState(new Set());
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [selectedTenant, setSelectedTenant] = useState('');
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  React.useEffect(() => {
    if (isOpen) {
      fetchTenants();
      setResults(null);
    }
  }, [isOpen]);

  const fetchTenants = async () => {
    try {
      const token = localStorage.getItem('admin_token') || localStorage.getItem('token');
      const response = await fetch(`${API}/admin/tenants`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const list = Array.isArray(data) ? data : (data.tenants || data.items || []);
        setTenants(list);
      }
    } catch (error) {
      console.error('Erreur chargement tenants:', error);
    }
  };

  // --- Helpers état des cases ---

  const toggleTable = (tableId) => {
    setSelectedTables(prev => {
      const next = new Set(prev);
      next.has(tableId) ? next.delete(tableId) : next.add(tableId);
      return next;
    });
  };

  const groupState = (group) => {
    const ids = group.tables.map(t => getTableId(t));
    const checked = ids.filter(id => selectedTables.has(id));
    if (checked.length === 0) return 'none';
    if (checked.length === ids.length) return 'all';
    return 'some';
  };

  const toggleGroup = (group) => {
    const state = groupState(group);
    setSelectedTables(prev => {
      const next = new Set(prev);
      if (state === 'all') {
        group.tables.forEach(t => next.delete(getTableId(t)));
      } else {
        group.tables.forEach(t => next.add(getTableId(t)));
      }
      return next;
    });
  };

  const toggleExpand = (groupId, e) => {
    e.stopPropagation();
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  const selectAll = () => setSelectedTables(new Set(ALL_TABLE_IDS));
  const deselectAll = () => setSelectedTables(new Set());

  // --- Soumission ---

  const handleCleanup = async () => {
    if (selectedTables.size === 0) {
      alert('Veuillez sélectionner au moins une table à nettoyer.');
      return;
    }

    // Construire la liste des tables avec leurs filtres
    const allTables = GROUPS.flatMap(g => g.tables);
    const selectedItems = [...selectedTables].map(tableId => {
      const tableConfig = allTables.find(t => getTableId(t) === tableId);
      return tableConfig ? {
        name: tableConfig.name,
        filter: tableConfig.filter || null,
        label: tableConfig.label
      } : null;
    }).filter(Boolean);

    const tenantLabel = selectedTenant
      ? tenants.find(t => t.id === selectedTenant)?.slug || selectedTenant
      : '⚠️ TOUS LES TENANTS';

    // Construire le message de confirmation avec les filtres
    const tableListFormatted = selectedItems.map(item => {
      if (item.filter === 'pfm_only') {
        return `  • ${item.name} (🔄 PFM Transfer seulement)`;
      }
      return `  • ${item.name}`;
    }).join('\n');

    const confirmed = window.confirm(
      `⚠️ SUPPRESSION DÉFINITIVE\n\n` +
      `Tenant : ${tenantLabel}\n` +
      `Tables (${selectedItems.length}) :\n` +
      tableListFormatted +
      `\n\nCette action est IRRÉVERSIBLE. Confirmez-vous ?`
    );

    if (!confirmed) return;

    setLoading(true);
    setResults(null);

    try {
      const token = localStorage.getItem('admin_token') || localStorage.getItem('token');
      
      // Construire le payload avec les filtres
      const tablesPayload = selectedItems.map(item => ({
        name: item.name,
        filter: item.filter
      }));

      const response = await fetch(`${API}/admin/cleanup-tables`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tables: tablesPayload,
          tenant_id: selectedTenant || null,
          confirm: true
        })
      });

      const data = await response.json();

      if (response.ok) {
        setResults(data.results);
      } else {
        alert(`❌ Erreur : ${data.detail || data.message}`);
      }
    } catch (error) {
      alert(`❌ Erreur de connexion : ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const totalSelected = selectedTables.size;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 99999, padding: '20px'
    }}>
      <Card style={{ maxWidth: '720px', width: '100%', maxHeight: '92vh', overflow: 'auto' }}>
        <CardHeader style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '16px' }}>
          <CardTitle style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Trash2 size={22} />
            Nettoyage des Données
          </CardTitle>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '6px' }}>
            Sélectionnez les tables à vider. Dépliez un groupe pour choisir table par table.
          </p>
        </CardHeader>

        <CardContent style={{ paddingTop: '20px' }}>

          {/* Sélecteur de tenant */}
          <div style={{
            marginBottom: '20px', padding: '14px',
            backgroundColor: '#fef3c7', border: '2px solid #fbbf24', borderRadius: '8px'
          }}>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#92400e', fontSize: '13px' }}>
              Caserne à nettoyer
            </label>
            <select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              style={{
                width: '100%', padding: '9px 12px',
                border: '1.5px solid #fbbf24', borderRadius: '6px',
                fontSize: '14px', backgroundColor: 'white', cursor: 'pointer'
              }}
            >
              <option value="">⚠️ TOUTES LES CASERNES (DANGER)</option>
              {tenants.map(tenant => (
                <option key={tenant.id || tenant.slug} value={tenant.id}>
                  {tenant.slug} — {tenant.nom || tenant.name || 'Service Incendie'}
                </option>
              ))}
            </select>
            {!selectedTenant && (
              <p style={{ marginTop: '6px', fontSize: '12px', color: '#dc2626', fontWeight: '600' }}>
                Aucune caserne sélectionnée = suppression pour TOUTES les casernes !
              </p>
            )}
          </div>

          {/* Barre de sélection rapide + compteur */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
            <Button onClick={selectAll} variant="outline" size="sm" style={{ fontSize: '12px' }}>
              Tout sélectionner
            </Button>
            <Button onClick={deselectAll} variant="outline" size="sm" style={{ fontSize: '12px' }}>
              Tout désélectionner
            </Button>
            <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
              {totalSelected} table{totalSelected !== 1 ? 's' : ''} sélectionnée{totalSelected !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Accordéon des groupes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
            {GROUPS.map(group => {
              const state = groupState(group);
              const isExpanded = expandedGroups.has(group.id);
              const borderColor = state === 'all' ? '#dc2626' : state === 'some' ? '#f59e0b' : '#e2e8f0';
              const bgColor = state === 'all' ? '#fef2f2' : state === 'some' ? '#fffbeb' : 'white';

              return (
                <div key={group.id} style={{
                  border: `2px solid ${borderColor}`,
                  borderRadius: '8px',
                  backgroundColor: bgColor,
                  overflow: 'hidden',
                  transition: 'border-color 0.2s, background-color 0.2s'
                }}>
                  {/* En-tête du groupe */}
                  <div
                    onClick={() => toggleGroup(group)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '12px 14px', cursor: 'pointer', userSelect: 'none'
                    }}
                  >
                    {/* Icône checkbox groupe */}
                    <div onClick={(e) => { e.stopPropagation(); toggleGroup(group); }}
                      style={{ flexShrink: 0 }}>
                      {state === 'all'
                        ? <CheckSquare size={20} color="#dc2626" />
                        : state === 'some'
                          ? <CheckSquare size={20} color="#f59e0b" />
                          : <Square size={20} color="#94a3b8" />
                      }
                    </div>

                    <span style={{ fontSize: '18px' }}>{group.icon}</span>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>{group.label}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {group.tables.filter(t => selectedTables.has(t.name)).length}/{group.tables.length} tables sélectionnées
                      </div>
                    </div>

                    {/* Bouton expand/collapse */}
                    <button
                      onClick={(e) => toggleExpand(group.id, e)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '4px', borderRadius: '4px', color: '#64748b',
                        display: 'flex', alignItems: 'center'
                      }}
                      title={isExpanded ? 'Réduire' : 'Déplier les tables'}
                    >
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                  </div>

                  {/* Tables individuelles (accordéon) */}
                  {isExpanded && (
                    <div style={{
                      borderTop: '1px solid #e2e8f0',
                      backgroundColor: 'rgba(255,255,255,0.7)',
                      padding: '8px 14px 12px 14px',
                      display: 'flex', flexDirection: 'column', gap: '6px'
                    }}>
                      {group.tables.map(table => {
                        const tableId = getTableId(table);
                        const isSelected = selectedTables.has(tableId);
                        const isPfmFilter = table.filter === 'pfm_only';
                        
                        return (
                          <label
                            key={tableId}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '7px 10px', borderRadius: '6px', cursor: 'pointer',
                              backgroundColor: isSelected 
                                ? (isPfmFilter ? '#fef3c7' : '#fef2f2') 
                                : '#f8fafc',
                              border: `1px solid ${isSelected 
                                ? (isPfmFilter ? '#fbbf24' : '#fca5a5') 
                                : '#e2e8f0'}`,
                              transition: 'all 0.15s'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleTable(tableId)}
                              style={{ 
                                width: '16px', height: '16px', cursor: 'pointer', 
                                accentColor: isPfmFilter ? '#f59e0b' : '#dc2626' 
                              }}
                            />
                            <span style={{ flex: 1, fontSize: '13px', fontWeight: '500' }}>
                              {table.label}
                              {table.badge && (
                                <span style={{
                                  marginLeft: '8px',
                                  fontSize: '10px',
                                  backgroundColor: '#fef3c7',
                                  color: '#92400e',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontWeight: '600'
                                }}>
                                  {table.badge}
                                </span>
                              )}
                            </span>
                            <code style={{
                              fontSize: '11px', color: '#94a3b8',
                              backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px',
                              fontFamily: 'monospace'
                            }}>
                              {table.name}{table.filter ? `:${table.filter}` : ''}
                            </code>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Résultats */}
          {results && (
            <div style={{
              padding: '14px', backgroundColor: '#f0fdf4',
              border: '2px solid #86efac', borderRadius: '8px', marginBottom: '16px'
            }}>
              <div style={{ fontWeight: '600', marginBottom: '8px', color: '#16a34a', fontSize: '14px' }}>
                ✅ Nettoyage terminé — {Object.values(results).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0)} document(s) supprimé(s)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {Object.entries(results).map(([table, count]) => (
                  <div key={table} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <code style={{ color: '#374151' }}>{table}</code>
                    <span style={{ fontWeight: '600', color: count > 0 ? '#dc2626' : '#94a3b8' }}>
                      {count > 0 ? `−${count}` : '0'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Boutons d'action */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
            {totalSelected > 0 && !loading && (
              <span style={{ fontSize: '12px', color: '#991b1b', flex: 1 }}>
                ⚠️ {totalSelected} table{totalSelected > 1 ? 's' : ''} — action irréversible
              </span>
            )}
            <Button onClick={onClose} variant="outline" disabled={loading}>
              Annuler
            </Button>
            <Button
              onClick={handleCleanup}
              disabled={loading || totalSelected === 0}
              style={{
                backgroundColor: '#dc2626',
                opacity: (loading || totalSelected === 0) ? 0.5 : 1
              }}
            >
              {loading ? '⏳ En cours...' : `Nettoyer (${totalSelected})`}
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
};

export default CleanupDataModal;
