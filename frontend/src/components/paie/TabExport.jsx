import React from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { 
  Link, Download, Check, RefreshCw, Zap, Plus, Trash2
} from 'lucide-react';

const TabExport = ({ context }) => {
  const {
    payrollConfig, setPayrollConfig, providersDisponibles, selectedProvider,
    apiCredentials, setApiCredentials, codeMappings, newMapping, setNewMapping,
    eventTypes, handleSavePayrollConfig, handleSaveApiCredentials,
    handleTestApiConnection, handleSendToApi, handleAddCodeMapping,
    handleDeleteCodeMapping, testingConnection, loading, feuilles
  } = context;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. Sélection fournisseur */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          <Link size={20} /> Fournisseur de paie
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '16px' }}>
          Sélectionnez votre logiciel de paie. Le format d'export sera automatiquement configuré.
        </p>
        <div style={{ maxWidth: '400px' }}>
          <select
            value={payrollConfig?.provider_id || ''}
            onChange={(e) => setPayrollConfig({...payrollConfig, provider_id: e.target.value || null})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '1rem' }}
            data-testid="provider-select"
          >
            <option value="">-- Sélectionner un fournisseur --</option>
            {providersDisponibles.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.export_format?.toUpperCase()}) {p.api_available && '⚡ API'}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={handleSavePayrollConfig} disabled={loading} style={{ marginTop: '16px' }} data-testid="save-provider-btn">
          <Check size={16} /> Enregistrer
        </Button>
      </div>

      {/* 2. Configuration Nethris - Numéro de compagnie (comme Agendrix) */}
      {selectedProvider?.name?.toLowerCase().includes('nethris') && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
            🏢 Numéro(s) de compagnie
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '16px' }}>
            Votre numéro de compagnie Nethris (affiché sur l'accueil de Nethris). 
            <strong style={{ color: '#dc2626' }}> Important: sans lettres</strong> (ex: PM123456 → 123456)
          </p>
          
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="company_mode"
                checked={payrollConfig?.company_number_mode !== 'per_branch'}
                onChange={() => setPayrollConfig({...payrollConfig, company_number_mode: 'single'})}
              />
              Un numéro pour l'ensemble de l'organisation
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="company_mode"
                checked={payrollConfig?.company_number_mode === 'per_branch'}
                onChange={() => setPayrollConfig({...payrollConfig, company_number_mode: 'per_branch'})}
              />
              Un numéro par succursale
            </label>
          </div>

          <div style={{ maxWidth: '300px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Numéro de compagnie *
            </label>
            <Input
              type="text"
              value={payrollConfig?.company_number || ''}
              onChange={(e) => setPayrollConfig({...payrollConfig, company_number: e.target.value.replace(/[^0-9]/g, '')})}
              placeholder="Ex: 00066573"
              style={{ fontFamily: 'monospace' }}
              data-testid="company-number-input"
            />
          </div>
        </div>
      )}

      {/* 3. Codes de gains standards (comme Agendrix) */}
      {selectedProvider?.name?.toLowerCase().includes('nethris') && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
            📋 Correspondance de champs
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '16px' }}>
            Inscrivez les codes de gains utilisés dans Nethris. Ces codes doivent avoir la mention <strong>"Hrs"</strong> (heures).
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Temps régulier
              </label>
              <Input
                type="text"
                value={payrollConfig?.code_gain_regulier || '1'}
                onChange={(e) => setPayrollConfig({...payrollConfig, code_gain_regulier: e.target.value})}
                placeholder="Ex: 1"
                style={{ fontFamily: 'monospace' }}
              />
              <small style={{ color: '#64748b' }}>Généralement le code "1"</small>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Temps supplémentaire
              </label>
              <Input
                type="text"
                value={payrollConfig?.code_gain_supplementaire || '43'}
                onChange={(e) => setPayrollConfig({...payrollConfig, code_gain_supplementaire: e.target.value})}
                placeholder="Ex: 43"
                style={{ fontFamily: 'monospace' }}
              />
              <small style={{ color: '#64748b' }}>Généralement le code "43"</small>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Formation régulière
              </label>
              <Input
                type="text"
                value={payrollConfig?.code_gain_formation_regulier || ''}
                onChange={(e) => setPayrollConfig({...payrollConfig, code_gain_formation_regulier: e.target.value})}
                placeholder="Ex: 2"
                style={{ fontFamily: 'monospace' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Formation supplémentaire
              </label>
              <Input
                type="text"
                value={payrollConfig?.code_gain_formation_sup || ''}
                onChange={(e) => setPayrollConfig({...payrollConfig, code_gain_formation_sup: e.target.value})}
                placeholder="Ex: 44"
                style={{ fontFamily: 'monospace' }}
              />
            </div>
          </div>
          
          <Button onClick={handleSavePayrollConfig} disabled={loading} style={{ marginTop: '16px' }}>
            <Check size={16} /> Enregistrer la configuration
          </Button>
        </div>
      )}

      {/* 4. Configuration API (si disponible pour le fournisseur sélectionné) */}
      {selectedProvider?.api_available && (
        <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', borderRadius: '12px', padding: '24px', border: '1px solid #86efac' }}>
          <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#166534' }}>
            <Zap size={20} /> Intégration API {selectedProvider.name}
          </h3>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            {payrollConfig?.api_connection_tested ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a' }}>
                <CheckCircle size={20} />
                <span style={{ fontWeight: '600' }}>Connexion vérifiée</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626' }}>
                <XCircle size={20} />
                <span style={{ fontWeight: '600' }}>Connexion non testée</span>
              </div>
            )}
            {payrollConfig?.api_last_test_result && (
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                ({payrollConfig.api_last_test_result})
              </span>
            )}
          </div>

          <p style={{ color: '#166534', fontSize: '0.875rem', marginBottom: '16px' }}>
            Entrez vos credentials API pour activer l'envoi direct des données de paie.
            {selectedProvider.api_documentation_url && (
              <a 
                href={selectedProvider.api_documentation_url} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ marginLeft: '8px', color: '#2563eb' }}
              >
                📖 Documentation
              </a>
            )}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            {selectedProvider.api_required_fields?.map((field) => (
              <div key={field.name}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                  {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                </label>
                <Input
                  type={field.type || 'text'}
                  value={apiCredentials[field.name] || ''}
                  onChange={(e) => setApiCredentials({...apiCredentials, [field.name]: e.target.value})}
                  placeholder={field.help_text}
                  style={{ background: 'white' }}
                />
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <Button onClick={handleSaveApiCredentials} disabled={loading}>
              <Check size={16} /> Enregistrer les credentials
            </Button>
            <Button 
              variant="outline" 
              onClick={handleTestApiConnection} 
              disabled={testingConnection}
              style={{ background: 'white' }}
            >
              {testingConnection ? <RefreshCw className="animate-spin" size={16} /> : <Zap size={16} />}
              <span style={{ marginLeft: '8px' }}>Tester la connexion</span>
            </Button>
          </div>
        </div>
      )}

      {/* 5. Associations des codes de gains (comme Agendrix) */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          🔗 Associations des codes de gains
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '8px' }}>
          Associez vos types d'heures aux codes de gains {selectedProvider?.name || 'de votre système de paie'} correspondants.
        </p>
        {selectedProvider?.name?.toLowerCase().includes('nethris') && (
          <p style={{ color: '#f59e0b', fontSize: '0.8rem', marginBottom: '16px', background: '#fffbeb', padding: '8px 12px', borderRadius: '6px' }}>
            ⚠️ Les codes de gains doivent avoir la mention <strong>"Hrs"</strong> (heures) dans Nethris. Les codes avec "$" ne sont pas compatibles.
          </p>
        )}
        
        {/* Formulaire d'ajout */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Type d'heures</label>
            <select
              value={newMapping.internal_event_type}
              onChange={(e) => setNewMapping({...newMapping, internal_event_type: e.target.value})}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
              data-testid="event-type-select"
            >
              <option value="">-- Sélectionner --</option>
              {eventTypes.map(et => (
                <option key={et.code} value={et.code}>{et.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1', minWidth: '150px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Code de gain {selectedProvider?.name || ''}</label>
            <Input
              value={newMapping.external_pay_code}
              onChange={(e) => setNewMapping({...newMapping, external_pay_code: e.target.value})}
              placeholder="Ex: 1, 43, 105"
              data-testid="pay-code-input"
            />
          </div>
          <div style={{ flex: '1', minWidth: '150px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Description</label>
            <Input
              value={newMapping.description}
              onChange={(e) => setNewMapping({...newMapping, description: e.target.value})}
              placeholder="Optionnel"
            />
          </div>
          <Button onClick={handleAddCodeMapping} data-testid="add-mapping-btn">
            <Plus size={16} /> Ajouter
          </Button>
        </div>

        {/* Liste des mappings */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Type d'heures</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Code de gain</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Description</th>
                <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '80px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {codeMappings.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                    Aucune association configurée. Ajoutez vos codes de gains pour activer l'export.
                  </td>
                </tr>
              ) : (
                codeMappings.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '10px' }}>
                      {eventTypes.find(et => et.code === m.internal_event_type)?.label || m.internal_event_type}
                    </td>
                    <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: '600', color: '#2563eb' }}>{m.external_pay_code}</td>
                    <td style={{ padding: '10px', color: '#64748b' }}>{m.description || '-'}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteCodeMapping(m.id)}>
                        <Trash2 size={16} style={{ color: '#ef4444' }} />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TabExport;
