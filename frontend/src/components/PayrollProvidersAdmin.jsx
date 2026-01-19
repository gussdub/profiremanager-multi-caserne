import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, GripVertical, Save, X, ChevronDown, ChevronUp } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PayrollProvidersAdmin = ({ token }) => {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [expandedProvider, setExpandedProvider] = useState(null);
  const [columns, setColumns] = useState([]);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [editingColumn, setEditingColumn] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    export_format: 'xlsx',
    delimiter: ';',
    encoding: 'utf-8',
    date_format: '%Y-%m-%d',
    decimal_separator: '.',
    include_header: true,
    is_active: true
  });

  const [columnForm, setColumnForm] = useState({
    position: 1,
    header_name: '',
    data_source_type: 'employee_attribute',
    static_value: '',
    internal_field_reference: '',
    default_value: '',
    format_pattern: ''
  });

  const dataSourceTypes = [
    { value: 'fixed_value', label: 'Valeur fixe' },
    { value: 'employee_attribute', label: 'Attribut employé' },
    { value: 'mapped_code', label: 'Code mappé (paie)' },
    { value: 'calculated_value', label: 'Valeur calculée' }
  ];

  const employeeFields = [
    { value: 'employee_matricule', label: 'Matricule' },
    { value: 'employee_nom', label: 'Nom' },
    { value: 'employee_prenom', label: 'Prénom' },
    { value: 'employee_email', label: 'Email' },
    { value: 'employee_grade', label: 'Grade' },
    { value: 'employee_type_emploi', label: 'Type emploi' }
  ];

  const calculatedFields = [
    { value: 'hours', label: 'Heures' },
    { value: 'amount', label: 'Montant' },
    { value: 'rate', label: 'Taux' },
    { value: 'date', label: 'Date' },
    { value: 'description', label: 'Description' },
    { value: 'periode_debut', label: 'Début période' },
    { value: 'periode_fin', label: 'Fin période' }
  ];

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/super-admin/payroll-providers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setProviders(data.providers || []);
      }
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchColumns = useCallback(async (providerId) => {
    try {
      const response = await fetch(`${API_URL}/api/super-admin/payroll-providers/${providerId}/columns`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setColumns(data.columns || []);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  useEffect(() => {
    if (expandedProvider) {
      fetchColumns(expandedProvider);
    }
  }, [expandedProvider, fetchColumns]);

  const handleSaveProvider = async () => {
    if (!formData.name) {
      toast.error('Le nom est requis');
      return;
    }

    setLoading(true);
    try {
      const url = editingProvider 
        ? `${API_URL}/api/super-admin/payroll-providers/${editingProvider.id}`
        : `${API_URL}/api/super-admin/payroll-providers`;
      
      const response = await fetch(url, {
        method: editingProvider ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success(editingProvider ? 'Fournisseur mis à jour' : 'Fournisseur créé');
        setShowModal(false);
        setEditingProvider(null);
        resetForm();
        fetchProviders();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProvider = async (providerId) => {
    if (!window.confirm('Supprimer ce fournisseur et toutes ses colonnes ?')) return;

    try {
      const response = await fetch(`${API_URL}/api/super-admin/payroll-providers/${providerId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('Fournisseur supprimé');
        fetchProviders();
        if (expandedProvider === providerId) {
          setExpandedProvider(null);
          setColumns([]);
        }
      }
    } catch (error) {
      toast.error('Erreur');
    }
  };

  const handleSaveColumn = async () => {
    if (!columnForm.header_name) {
      toast.error('Le nom de colonne est requis');
      return;
    }

    try {
      const url = editingColumn
        ? `${API_URL}/api/super-admin/payroll-providers/${expandedProvider}/columns/${editingColumn.id}`
        : `${API_URL}/api/super-admin/payroll-providers/${expandedProvider}/columns`;

      const response = await fetch(url, {
        method: editingColumn ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(columnForm)
      });

      if (response.ok) {
        toast.success(editingColumn ? 'Colonne mise à jour' : 'Colonne ajoutée');
        setShowColumnModal(false);
        setEditingColumn(null);
        resetColumnForm();
        fetchColumns(expandedProvider);
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur');
      }
    } catch (error) {
      toast.error('Erreur');
    }
  };

  const handleDeleteColumn = async (columnId) => {
    if (!window.confirm('Supprimer cette colonne ?')) return;

    try {
      const response = await fetch(`${API_URL}/api/super-admin/payroll-providers/${expandedProvider}/columns/${columnId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        toast.success('Colonne supprimée');
        fetchColumns(expandedProvider);
      }
    } catch (error) {
      toast.error('Erreur');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      export_format: 'xlsx',
      delimiter: ';',
      encoding: 'utf-8',
      date_format: '%Y-%m-%d',
      decimal_separator: '.',
      include_header: true,
      is_active: true
    });
  };

  const resetColumnForm = () => {
    setColumnForm({
      position: columns.length + 1,
      header_name: '',
      data_source_type: 'employee_attribute',
      static_value: '',
      internal_field_reference: '',
      default_value: '',
      format_pattern: ''
    });
  };

  const openEditProvider = (provider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name || '',
      description: provider.description || '',
      export_format: provider.export_format || 'xlsx',
      delimiter: provider.delimiter || ';',
      encoding: provider.encoding || 'utf-8',
      date_format: provider.date_format || '%Y-%m-%d',
      decimal_separator: provider.decimal_separator || '.',
      include_header: provider.include_header !== false,
      is_active: provider.is_active !== false
    });
    setShowModal(true);
  };

  const openEditColumn = (column) => {
    setEditingColumn(column);
    setColumnForm({
      position: column.position || 1,
      header_name: column.header_name || '',
      data_source_type: column.data_source_type || 'employee_attribute',
      static_value: column.static_value || '',
      internal_field_reference: column.internal_field_reference || '',
      default_value: column.default_value || '',
      format_pattern: column.format_pattern || ''
    });
    setShowColumnModal(true);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1e293b' }}>
          💰 Fournisseurs de paie ({providers.length})
        </h2>
        <Button
          onClick={() => {
            setEditingProvider(null);
            resetForm();
            setShowModal(true);
          }}
          style={{ background: '#10b981' }}
        >
          <Plus size={16} /> Ajouter un fournisseur
        </Button>
      </div>

      <p style={{ color: '#64748b', marginBottom: '20px', fontSize: '0.875rem' }}>
        Configurez les fournisseurs de paie (Nethris, Employeur D, etc.) et définissez la structure des fichiers d'export.
        Les clients pourront ensuite simplement sélectionner leur fournisseur.
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Chargement...</div>
      ) : providers.length === 0 ? (
        <Card>
          <CardContent style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            Aucun fournisseur de paie configuré. Cliquez sur "Ajouter un fournisseur" pour commencer.
          </CardContent>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {providers.map((provider) => (
            <Card key={provider.id} style={{ overflow: 'hidden' }}>
              <CardHeader 
                style={{ 
                  padding: '16px', 
                  cursor: 'pointer',
                  background: expandedProvider === provider.id ? '#f0fdf4' : 'white'
                }}
                onClick={() => setExpandedProvider(expandedProvider === provider.id ? null : provider.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {expandedProvider === provider.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    <div>
                      <CardTitle style={{ fontSize: '1rem', margin: 0 }}>{provider.name}</CardTitle>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                        Format: {provider.export_format?.toUpperCase()} • 
                        {provider.is_active ? (
                          <span style={{ color: '#10b981' }}> Actif</span>
                        ) : (
                          <span style={{ color: '#ef4444' }}> Inactif</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => openEditProvider(provider)}>
                      <Edit2 size={16} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteProvider(provider.id)}>
                      <Trash2 size={16} style={{ color: '#ef4444' }} />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {expandedProvider === provider.id && (
                <CardContent style={{ padding: '16px', borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600' }}>
                      Colonnes du fichier ({columns.length})
                    </h4>
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingColumn(null);
                        resetColumnForm();
                        setShowColumnModal(true);
                      }}
                    >
                      <Plus size={14} /> Ajouter colonne
                    </Button>
                  </div>

                  {columns.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
                      Aucune colonne définie. Ajoutez des colonnes pour définir la structure du fichier d'export.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '8px', textAlign: 'center', width: '50px' }}>#</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>En-tête</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Type de donnée</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Valeur/Référence</th>
                          <th style={{ padding: '8px', textAlign: 'center', width: '100px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {columns.sort((a, b) => a.position - b.position).map((col) => (
                          <tr key={col.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '8px', textAlign: 'center', fontWeight: '600', color: '#10b981' }}>
                              {col.position}
                            </td>
                            <td style={{ padding: '8px', fontWeight: '500' }}>{col.header_name}</td>
                            <td style={{ padding: '8px' }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                background: col.data_source_type === 'fixed_value' ? '#fef3c7' :
                                           col.data_source_type === 'employee_attribute' ? '#dbeafe' :
                                           col.data_source_type === 'mapped_code' ? '#f3e8ff' : '#d1fae5'
                              }}>
                                {dataSourceTypes.find(t => t.value === col.data_source_type)?.label || col.data_source_type}
                              </span>
                            </td>
                            <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                              {col.data_source_type === 'fixed_value' ? col.static_value :
                               col.internal_field_reference || col.default_value || '-'}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              <Button variant="ghost" size="sm" onClick={() => openEditColumn(col)}>
                                <Edit2 size={14} />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteColumn(col.id)}>
                                <Trash2 size={14} style={{ color: '#ef4444' }} />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal Fournisseur */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{editingProvider ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</h3>
              <Button variant="ghost" onClick={() => setShowModal(false)}><X size={20} /></Button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Nom *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Ex: Nethris, Employeur D"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Description</label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Description optionnelle"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Format d'export</label>
                  <select
                    value={formData.export_format}
                    onChange={(e) => setFormData({...formData, export_format: e.target.value})}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                  >
                    <option value="xlsx">Excel (XLSX)</option>
                    <option value="csv">CSV</option>
                    <option value="txt">Texte (TXT)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Délimiteur (CSV)</label>
                  <select
                    value={formData.delimiter}
                    onChange={(e) => setFormData({...formData, delimiter: e.target.value})}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                  >
                    <option value=";">Point-virgule (;)</option>
                    <option value=",">Virgule (,)</option>
                    <option value="\t">Tabulation</option>
                    <option value="|">Pipe (|)</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Format de date</label>
                  <select
                    value={formData.date_format}
                    onChange={(e) => setFormData({...formData, date_format: e.target.value})}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                  >
                    <option value="%Y-%m-%d">AAAA-MM-JJ (2024-01-15)</option>
                    <option value="%d/%m/%Y">JJ/MM/AAAA (15/01/2024)</option>
                    <option value="%m/%d/%Y">MM/JJ/AAAA (01/15/2024)</option>
                    <option value="%Y%m%d">AAAAMMJJ (20240115)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Séparateur décimal</label>
                  <select
                    value={formData.decimal_separator}
                    onChange={(e) => setFormData({...formData, decimal_separator: e.target.value})}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                  >
                    <option value=".">Point (.)</option>
                    <option value=",">Virgule (,)</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '24px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.include_header}
                    onChange={(e) => setFormData({...formData, include_header: e.target.checked})}
                  />
                  <span>Inclure les en-têtes</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                  />
                  <span>Actif</span>
                </label>
              </div>
            </div>
            <div style={{ padding: '16px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setShowModal(false)}>Annuler</Button>
              <Button onClick={handleSaveProvider} disabled={loading}>
                <Save size={16} /> {editingProvider ? 'Mettre à jour' : 'Créer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Colonne */}
      {showColumnModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001
        }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '90%', maxWidth: '500px', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{editingColumn ? 'Modifier la colonne' : 'Nouvelle colonne'}</h3>
              <Button variant="ghost" onClick={() => setShowColumnModal(false)}><X size={20} /></Button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Position</label>
                  <Input
                    type="number"
                    min="1"
                    value={columnForm.position}
                    onChange={(e) => setColumnForm({...columnForm, position: parseInt(e.target.value)})}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Nom de l'en-tête *</label>
                  <Input
                    value={columnForm.header_name}
                    onChange={(e) => setColumnForm({...columnForm, header_name: e.target.value})}
                    placeholder="Ex: Matricule, Heures, Code"
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Type de donnée</label>
                <select
                  value={columnForm.data_source_type}
                  onChange={(e) => setColumnForm({...columnForm, data_source_type: e.target.value, internal_field_reference: ''})}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                >
                  {dataSourceTypes.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {columnForm.data_source_type === 'fixed_value' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Valeur fixe</label>
                  <Input
                    value={columnForm.static_value}
                    onChange={(e) => setColumnForm({...columnForm, static_value: e.target.value})}
                    placeholder="Ex: R, 001, COMPANY"
                  />
                </div>
              )}

              {columnForm.data_source_type === 'employee_attribute' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Champ employé</label>
                  <select
                    value={columnForm.internal_field_reference}
                    onChange={(e) => setColumnForm({...columnForm, internal_field_reference: e.target.value})}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                  >
                    <option value="">-- Sélectionner --</option>
                    {employeeFields.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {columnForm.data_source_type === 'calculated_value' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Valeur calculée</label>
                  <select
                    value={columnForm.internal_field_reference}
                    onChange={(e) => setColumnForm({...columnForm, internal_field_reference: e.target.value})}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                  >
                    <option value="">-- Sélectionner --</option>
                    {calculatedFields.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {columnForm.data_source_type === 'mapped_code' && (
                <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', fontSize: '0.875rem' }}>
                  <strong>Code mappé</strong><br/>
                  Cette colonne utilisera le code de paie défini par le client dans son mapping.
                  Le système cherchera automatiquement la correspondance selon le type d'événement.
                </div>
              )}

              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Valeur par défaut</label>
                <Input
                  value={columnForm.default_value}
                  onChange={(e) => setColumnForm({...columnForm, default_value: e.target.value})}
                  placeholder="Si la valeur n'est pas trouvée"
                />
              </div>
            </div>
            <div style={{ padding: '16px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setShowColumnModal(false)}>Annuler</Button>
              <Button onClick={handleSaveColumn}>
                <Save size={16} /> {editingColumn ? 'Mettre à jour' : 'Ajouter'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollProvidersAdmin;
