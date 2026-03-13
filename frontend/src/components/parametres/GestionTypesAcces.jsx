import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { 
  Plus, Edit, Trash2, Users, Shield, ChevronDown, ChevronRight, 
  Check, X, Eye, PenLine, FilePlus, FileX, Download, FileSignature,
  CheckCircle, ThumbsUp, ThumbsDown
} from 'lucide-react';
import { apiGet, apiPost, apiPut, apiDelete } from '../../utils/api';

// Icônes pour les actions
const ACTION_ICONS = {
  voir: Eye,
  creer: FilePlus,
  modifier: PenLine,
  supprimer: FileX,
  exporter: Download,
  signer: FileSignature,
  valider: CheckCircle,
  approuver: ThumbsUp,
  accepter: Check,
  refuser: ThumbsDown,
  voir_anciens: Users
};

const ACTION_LABELS = {
  voir: "Voir",
  creer: "Créer",
  modifier: "Modifier",
  supprimer: "Supprimer",
  exporter: "Exporter",
  signer: "Signer",
  valider: "Valider",
  approuver: "Approuver",
  accepter: "Accepter",
  refuser: "Refuser",
  voir_anciens: "Voir anciens"
};

const GestionTypesAcces = ({ tenantSlug, toast }) => {
  const [loading, setLoading] = useState(true);
  const [modulesStructure, setModulesStructure] = useState({});
  const [accessTypes, setAccessTypes] = useState({ base_roles: [], custom_types: [] });
  const [selectedType, setSelectedType] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedModules, setExpandedModules] = useState({});
  
  // Form state pour création/édition
  const [formData, setFormData] = useState({
    nom: '',
    description: '',
    role_base: 'employe',
    permissions: { modules: {} }
  });

  // Charger la structure des modules et les types d'accès
  useEffect(() => {
    loadData();
  }, [tenantSlug]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [structureRes, typesRes] = await Promise.all([
        apiGet(tenantSlug, '/access-types/modules-structure'),
        apiGet(tenantSlug, '/access-types')
      ]);
      setModulesStructure(structureRes.modules || {});
      setAccessTypes(typesRes);
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les types d'accès",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Sélectionner un type d'accès pour voir/éditer
  const handleSelectType = (type) => {
    setSelectedType(type);
    setIsEditing(false);
    
    // Initialiser le formulaire avec les permissions existantes
    setFormData({
      nom: type.nom,
      description: type.description || '',
      role_base: type.role_base || 'employe',
      permissions: type.permissions || { modules: {} }
    });
    
    // Ouvrir tous les modules par défaut
    const expanded = {};
    Object.keys(modulesStructure).forEach(moduleId => {
      expanded[moduleId] = true;
    });
    setExpandedModules(expanded);
  };

  // Créer un nouveau type d'accès
  const handleCreate = async () => {
    if (!formData.nom.trim()) {
      toast({ title: "Erreur", description: "Le nom est requis", variant: "destructive" });
      return;
    }

    try {
      const res = await apiPost(tenantSlug, '/access-types', formData);
      toast({ title: "Succès", description: `Type d'accès "${formData.nom}" créé` });
      setShowCreateModal(false);
      loadData();
      handleSelectType(res.access_type);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de créer le type d'accès",
        variant: "destructive"
      });
    }
  };

  // Sauvegarder les modifications
  const handleSave = async () => {
    if (!selectedType || selectedType.is_system) return;

    try {
      await apiPut(tenantSlug, `/access-types/${selectedType.id}`, {
        nom: formData.nom,
        description: formData.description,
        permissions: formData.permissions
      });
      toast({ title: "Succès", description: "Type d'accès mis à jour" });
      setIsEditing(false);
      loadData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de sauvegarder",
        variant: "destructive"
      });
    }
  };

  // Supprimer un type d'accès
  const handleDelete = async (typeId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce type d'accès ?")) return;

    try {
      await apiDelete(tenantSlug, `/access-types/${typeId}`);
      toast({ title: "Succès", description: "Type d'accès supprimé" });
      setSelectedType(null);
      loadData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de supprimer",
        variant: "destructive"
      });
    }
  };

  // Toggle expansion d'un module
  const toggleModule = (moduleId) => {
    setExpandedModules(prev => ({
      ...prev,
      [moduleId]: !prev[moduleId]
    }));
  };

  // Gérer le changement d'accès à un module
  const handleModuleAccessChange = (moduleId, checked) => {
    setFormData(prev => {
      const newPermissions = { ...prev.permissions };
      if (!newPermissions.modules) newPermissions.modules = {};
      
      if (!newPermissions.modules[moduleId]) {
        newPermissions.modules[moduleId] = { access: false, actions: [], tabs: {} };
      }
      
      newPermissions.modules[moduleId].access = checked;
      
      // Si on désactive le module, on vide les actions et tabs
      if (!checked) {
        newPermissions.modules[moduleId].actions = [];
        newPermissions.modules[moduleId].tabs = {};
      }
      
      return { ...prev, permissions: newPermissions };
    });
  };

  // Gérer le changement d'action au niveau module
  const handleModuleActionChange = (moduleId, action, checked) => {
    setFormData(prev => {
      const newPermissions = { ...prev.permissions };
      if (!newPermissions.modules) newPermissions.modules = {};
      if (!newPermissions.modules[moduleId]) {
        newPermissions.modules[moduleId] = { access: true, actions: [], tabs: {} };
      }
      
      const currentActions = newPermissions.modules[moduleId].actions || [];
      
      if (checked) {
        if (!currentActions.includes(action)) {
          newPermissions.modules[moduleId].actions = [...currentActions, action];
        }
      } else {
        newPermissions.modules[moduleId].actions = currentActions.filter(a => a !== action);
        
        // Propager la désactivation aux tabs
        const tabs = newPermissions.modules[moduleId].tabs || {};
        Object.keys(tabs).forEach(tabId => {
          if (tabs[tabId].actions) {
            tabs[tabId].actions = tabs[tabId].actions.filter(a => a !== action);
          }
        });
      }
      
      return { ...prev, permissions: newPermissions };
    });
  };

  // Gérer l'accès à un onglet
  const handleTabAccessChange = (moduleId, tabId, checked) => {
    setFormData(prev => {
      const newPermissions = { ...prev.permissions };
      if (!newPermissions.modules[moduleId]) return prev;
      if (!newPermissions.modules[moduleId].tabs) {
        newPermissions.modules[moduleId].tabs = {};
      }
      
      if (!newPermissions.modules[moduleId].tabs[tabId]) {
        newPermissions.modules[moduleId].tabs[tabId] = { access: false, actions: [] };
      }
      
      newPermissions.modules[moduleId].tabs[tabId].access = checked;
      
      if (!checked) {
        newPermissions.modules[moduleId].tabs[tabId].actions = [];
      }
      
      return { ...prev, permissions: newPermissions };
    });
  };

  // Gérer une action sur un onglet
  const handleTabActionChange = (moduleId, tabId, action, checked) => {
    setFormData(prev => {
      const newPermissions = { ...prev.permissions };
      if (!newPermissions.modules[moduleId]?.tabs?.[tabId]) return prev;
      
      const currentActions = newPermissions.modules[moduleId].tabs[tabId].actions || [];
      
      if (checked) {
        if (!currentActions.includes(action)) {
          newPermissions.modules[moduleId].tabs[tabId].actions = [...currentActions, action];
        }
      } else {
        newPermissions.modules[moduleId].tabs[tabId].actions = currentActions.filter(a => a !== action);
      }
      
      return { ...prev, permissions: newPermissions };
    });
  };

  // Vérifier si une action est autorisée au niveau module
  const isModuleActionEnabled = (moduleId, action) => {
    const modulePerms = formData.permissions?.modules?.[moduleId];
    return modulePerms?.actions?.includes(action) || false;
  };

  // Vérifier si un onglet est accessible
  const isTabAccessible = (moduleId, tabId) => {
    const modulePerms = formData.permissions?.modules?.[moduleId];
    return modulePerms?.tabs?.[tabId]?.access || false;
  };

  // Vérifier si une action d'onglet est activée
  const isTabActionEnabled = (moduleId, tabId, action) => {
    const modulePerms = formData.permissions?.modules?.[moduleId];
    return modulePerms?.tabs?.[tabId]?.actions?.includes(action) || false;
  };

  // Obtenir le badge de rôle
  const getRoleBadge = (role) => {
    const badges = {
      admin: { icon: '👑', label: 'Admin', color: '#dc2626' },
      superviseur: { icon: '🎖️', label: 'Superviseur', color: '#2563eb' },
      employe: { icon: '👤', label: 'Employé', color: '#16a34a' }
    };
    return badges[role] || badges.employe;
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Chargement...</div>;
  }

  return (
    <div style={{ display: 'flex', gap: '24px', minHeight: '600px' }}>
      {/* Liste des types d'accès */}
      <div style={{ 
        width: '320px', 
        flexShrink: 0,
        background: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden'
      }}>
        <div style={{ 
          padding: '16px', 
          borderBottom: '1px solid #e5e7eb',
          background: '#f8fafc',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
            <Shield size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
            Types d'accès
          </h3>
          <Button 
            size="sm" 
            onClick={() => {
              setFormData({ nom: '', description: '', role_base: 'employe', permissions: { modules: {} } });
              setShowCreateModal(true);
            }}
            disabled={accessTypes.count_custom >= accessTypes.max_custom_types}
          >
            <Plus size={14} /> Nouveau
          </Button>
        </div>

        <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
          {/* Rôles de base */}
          <div style={{ padding: '8px', borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', padding: '4px 8px', fontWeight: '600' }}>
              RÔLES DE BASE
            </div>
            {accessTypes.base_roles?.map(role => (
              <div
                key={role.id}
                onClick={() => handleSelectType(role)}
                style={{
                  padding: '12px',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  marginBottom: '4px',
                  background: selectedType?.id === role.id ? '#fef2f2' : 'transparent',
                  border: selectedType?.id === role.id ? '2px solid #dc2626' : '2px solid transparent',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.2rem' }}>{getRoleBadge(role.id).icon}</span>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{role.nom}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{role.description}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Types personnalisés */}
          <div style={{ padding: '8px' }}>
            <div style={{ 
              fontSize: '0.75rem', 
              color: '#64748b', 
              padding: '4px 8px', 
              fontWeight: '600',
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span>TYPES PERSONNALISÉS</span>
              <span>{accessTypes.count_custom}/{accessTypes.max_custom_types}</span>
            </div>
            
            {accessTypes.custom_types?.length === 0 ? (
              <div style={{ 
                padding: '20px', 
                textAlign: 'center', 
                color: '#94a3b8',
                fontSize: '0.875rem'
              }}>
                Aucun type personnalisé créé
              </div>
            ) : (
              accessTypes.custom_types?.map(type => (
                <div
                  key={type.id}
                  onClick={() => handleSelectType(type)}
                  style={{
                    padding: '12px',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    marginBottom: '4px',
                    background: selectedType?.id === type.id ? '#fef2f2' : 'transparent',
                    border: selectedType?.id === type.id ? '2px solid #dc2626' : '2px solid transparent',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.2rem' }}>🔧</span>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{type.nom}</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          Basé sur: {type.role_base}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleDelete(type.id); }}
                      style={{ color: '#ef4444' }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Panneau de détail/édition */}
      <div style={{ 
        flex: 1,
        background: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        overflow: 'hidden'
      }}>
        {selectedType ? (
          <>
            {/* Header */}
            <div style={{ 
              padding: '16px 20px', 
              borderBottom: '1px solid #e5e7eb',
              background: '#f8fafc',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>
                  {selectedType.is_system ? (
                    <span>{getRoleBadge(selectedType.id).icon} {selectedType.nom}</span>
                  ) : (
                    isEditing ? (
                      <Input
                        value={formData.nom}
                        onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                        style={{ maxWidth: '250px' }}
                      />
                    ) : (
                      <span>🔧 {selectedType.nom}</span>
                    )
                  )}
                </h3>
                {!selectedType.is_system && (
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                    Hérite de: <strong>{selectedType.role_base}</strong>
                  </div>
                )}
              </div>
              
              {!selectedType.is_system && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {isEditing ? (
                    <>
                      <Button variant="outline" onClick={() => setIsEditing(false)}>
                        <X size={14} /> Annuler
                      </Button>
                      <Button onClick={handleSave}>
                        <Check size={14} /> Enregistrer
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => setIsEditing(true)}>
                      <Edit size={14} /> Modifier
                    </Button>
                  )}
                </div>
              )}
              
              {selectedType.is_system && selectedType.id !== 'admin' && (
                <div style={{ 
                  padding: '6px 12px', 
                  background: '#fef3c7', 
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  color: '#92400e'
                }}>
                  Rôle système (lecture seule)
                </div>
              )}
            </div>

            {/* Contenu - Permissions */}
            <div style={{ padding: '20px', maxHeight: '600px', overflowY: 'auto' }}>
              {selectedType.id === 'admin' ? (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '40px',
                  background: '#f0fdf4',
                  borderRadius: '12px'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>👑</div>
                  <h4 style={{ margin: '0 0 8px 0' }}>Accès Administrateur</h4>
                  <p style={{ color: '#64748b', margin: 0 }}>
                    L'administrateur a un accès complet et illimité à tous les modules et fonctionnalités.
                    Ces permissions ne peuvent pas être modifiées.
                  </p>
                </div>
              ) : (
                <div>
                  {/* Description */}
                  {isEditing && !selectedType.is_system && (
                    <div style={{ marginBottom: '20px' }}>
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                        Description
                      </label>
                      <Input
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Description du type d'accès..."
                      />
                    </div>
                  )}

                  {/* Liste des modules */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {Object.entries(modulesStructure).map(([moduleId, moduleConfig]) => {
                      const modulePerms = formData.permissions?.modules?.[moduleId];
                      const hasAccess = modulePerms?.access || false;
                      const hasTabs = Object.keys(moduleConfig.tabs || {}).length > 0;
                      const isExpanded = expandedModules[moduleId];
                      const canEdit = isEditing && !selectedType.is_system;

                      return (
                        <div 
                          key={moduleId}
                          style={{ 
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            opacity: hasAccess ? 1 : 0.6
                          }}
                        >
                          {/* Header du module */}
                          <div 
                            style={{ 
                              padding: '12px 16px',
                              background: hasAccess ? '#f0fdf4' : '#f8fafc',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              cursor: hasTabs ? 'pointer' : 'default'
                            }}
                            onClick={() => hasTabs && toggleModule(moduleId)}
                          >
                            {hasTabs && (
                              isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                            )}
                            
                            {canEdit && (
                              <input
                                type="checkbox"
                                checked={hasAccess}
                                onChange={(e) => handleModuleAccessChange(moduleId, e.target.checked)}
                                onClick={(e) => e.stopPropagation()}
                                style={{ width: '18px', height: '18px', accentColor: '#dc2626' }}
                              />
                            )}
                            
                            <span style={{ fontSize: '1.2rem' }}>{moduleConfig.icon}</span>
                            <span style={{ fontWeight: '600', flex: 1 }}>{moduleConfig.label}</span>
                            
                            {/* Actions du module */}
                            {hasAccess && (
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {moduleConfig.actions.map(action => {
                                  const ActionIcon = ACTION_ICONS[action] || Eye;
                                  const isEnabled = isModuleActionEnabled(moduleId, action);
                                  
                                  return (
                                    <label
                                      key={action}
                                      onClick={(e) => e.stopPropagation()}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        background: isEnabled ? '#dcfce7' : '#f1f5f9',
                                        cursor: canEdit ? 'pointer' : 'default',
                                        fontSize: '0.75rem'
                                      }}
                                    >
                                      {canEdit && (
                                        <input
                                          type="checkbox"
                                          checked={isEnabled}
                                          onChange={(e) => handleModuleActionChange(moduleId, action, e.target.checked)}
                                          style={{ width: '14px', height: '14px' }}
                                        />
                                      )}
                                      <ActionIcon size={12} />
                                      <span>{ACTION_LABELS[action]}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Onglets du module */}
                          {hasTabs && isExpanded && hasAccess && (
                            <div style={{ 
                              padding: '12px 16px',
                              background: 'white',
                              borderTop: '1px solid #e5e7eb'
                            }}>
                              {Object.entries(moduleConfig.tabs).map(([tabId, tabConfig]) => {
                                const tabAccessible = isTabAccessible(moduleId, tabId);
                                
                                return (
                                  <div 
                                    key={tabId}
                                    style={{ 
                                      padding: '8px 12px',
                                      marginBottom: '8px',
                                      borderRadius: '6px',
                                      background: tabAccessible ? '#fafafa' : '#f8fafc',
                                      border: '1px solid #e5e7eb'
                                    }}
                                  >
                                    <div style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: '8px',
                                      marginBottom: tabAccessible ? '8px' : 0
                                    }}>
                                      {canEdit && (
                                        <input
                                          type="checkbox"
                                          checked={tabAccessible}
                                          onChange={(e) => handleTabAccessChange(moduleId, tabId, e.target.checked)}
                                          style={{ width: '16px', height: '16px' }}
                                        />
                                      )}
                                      <span style={{ 
                                        fontWeight: '500', 
                                        fontSize: '0.875rem',
                                        color: tabAccessible ? '#1e293b' : '#94a3b8'
                                      }}>
                                        {tabConfig.label}
                                      </span>
                                    </div>
                                    
                                    {/* Actions de l'onglet */}
                                    {tabAccessible && (
                                      <div style={{ 
                                        display: 'flex', 
                                        gap: '6px', 
                                        flexWrap: 'wrap',
                                        marginLeft: canEdit ? '24px' : 0
                                      }}>
                                        {tabConfig.actions.map(action => {
                                          const ActionIcon = ACTION_ICONS[action] || Eye;
                                          const isEnabled = isTabActionEnabled(moduleId, tabId, action);
                                          const moduleHasAction = isModuleActionEnabled(moduleId, action) || action === 'voir';
                                          
                                          // L'action n'est disponible que si le module l'autorise
                                          const canEnable = moduleHasAction || action === 'voir' || 
                                            ['signer', 'valider', 'approuver', 'accepter', 'refuser'].includes(action);
                                          
                                          return (
                                            <label
                                              key={action}
                                              style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '3px 6px',
                                                borderRadius: '4px',
                                                background: isEnabled ? '#dbeafe' : '#f1f5f9',
                                                cursor: canEdit && canEnable ? 'pointer' : 'not-allowed',
                                                fontSize: '0.7rem',
                                                opacity: canEnable ? 1 : 0.5
                                              }}
                                              title={!canEnable ? `Action "${action}" non autorisée au niveau module` : ''}
                                            >
                                              {canEdit && (
                                                <input
                                                  type="checkbox"
                                                  checked={isEnabled}
                                                  disabled={!canEnable}
                                                  onChange={(e) => handleTabActionChange(moduleId, tabId, action, e.target.checked)}
                                                  style={{ width: '12px', height: '12px' }}
                                                />
                                              )}
                                              <ActionIcon size={10} />
                                              <span>{ACTION_LABELS[action]}</span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center',
            height: '100%',
            padding: '40px',
            color: '#64748b'
          }}>
            <Shield size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <p>Sélectionnez un type d'accès pour voir ou modifier ses permissions</p>
          </div>
        )}
      </div>

      {/* Modal de création */}
      {showCreateModal && (
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
            padding: '24px',
            width: '400px',
            maxWidth: '90vw'
          }}>
            <h3 style={{ margin: '0 0 20px 0' }}>Nouveau type d'accès</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Nom *
              </label>
              <Input
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                placeholder="Ex: Superviseur Logistique"
              />
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Description
              </label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description du rôle..."
              />
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Hériter de
              </label>
              <select
                value={formData.role_base}
                onChange={(e) => setFormData({ ...formData, role_base: e.target.value })}
                style={{ 
                  width: '100%', 
                  padding: '8px 12px', 
                  borderRadius: '8px', 
                  border: '1px solid #d1d5db' 
                }}
              >
                <option value="employe">👤 Employé (permissions minimales)</option>
                <option value="superviseur">🎖️ Superviseur (permissions étendues)</option>
                <option value="admin">👑 Administrateur (toutes permissions)</option>
              </select>
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                Le nouveau type héritera des permissions de base du rôle sélectionné.
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Annuler
              </Button>
              <Button onClick={handleCreate}>
                <Plus size={14} /> Créer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestionTypesAcces;
