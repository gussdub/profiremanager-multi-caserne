import React from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Check, RefreshCw } from 'lucide-react';

const TabMatricules = ({ context }) => {
  const {
    employes, matriculesEmployes, setMatriculesEmployes,
    selectedProvider, handleSaveMatricule, handleSaveAllMatricules, loading
  } = context;

  const providerName = selectedProvider?.name || 'votre système de paie';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          👥 Association des numéros de matricule
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '8px' }}>
          Pour chacun de vos employés, inscrivez le numéro de matricule utilisé dans {providerName}.
        </p>
        <p style={{ color: '#f59e0b', fontSize: '0.8rem', marginBottom: '16px', background: '#fffbeb', padding: '8px 12px', borderRadius: '6px' }}>
          ⚠️ <strong>Important:</strong> Si vous laissez une case vide pour un employé, aucune information ne sera exportée pour cet employé.
          Assurez-vous de ne pas avoir deux matricules identiques pour deux employés différents.
        </p>

        <div style={{ marginBottom: '16px' }}>
          <Button onClick={handleSaveAllMatricules} disabled={loading} data-testid="save-all-matricules-btn">
            {loading ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
            <span style={{ marginLeft: '8px' }}>Enregistrer tous les matricules</span>
          </Button>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Employé</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Grade</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Type d'emploi</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', width: '200px' }}>
                  Matricule {selectedProvider?.name || ''}
                  <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 'normal', color: '#64748b' }}>
                    (Numéro d'employé)
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {employes.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                    Aucun employé actif
                  </td>
                </tr>
              ) : (
                employes.map(emp => (
                  <tr key={emp.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: '500' }}>{emp.prenom} {emp.nom}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{emp.email}</div>
                    </td>
                    <td style={{ padding: '12px' }}>{emp.grade || '-'}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        background: emp.type_emploi === 'temps_plein' ? '#dbeafe' : '#fef3c7',
                        color: emp.type_emploi === 'temps_plein' ? '#1e40af' : '#92400e'
                      }}>
                        {emp.type_emploi === 'temps_plein' ? 'Temps plein' : 
                         emp.type_emploi === 'temps_partiel' ? 'Temps partiel' : 
                         emp.type_emploi || 'Non spécifié'}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <Input
                        type="text"
                        value={matriculesEmployes[emp.id] || ''}
                        onChange={(e) => setMatriculesEmployes(prev => ({
                          ...prev, 
                          [emp.id]: e.target.value
                        }))}
                        placeholder="Ex: 000003246"
                        style={{ fontFamily: 'monospace', maxWidth: '150px' }}
                        data-testid={`matricule-input-${emp.id}`}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selectedProvider?.name && (
          <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '16px' }}>
            💡 Consultez la documentation de {selectedProvider.name} pour trouver les matricules de vos employés.
          </p>
        )}
      </div>
    </div>
  );
  );
};

export default TabMatricules;
