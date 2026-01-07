import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useTenant } from '../contexts/TenantContext';
import { apiGet } from '../utils/api';

// ==================== MODALS ====================

const Modal = ({ mode, type, formData, setFormData, onSubmit, onClose }) => {
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleBackdropClick = (e) => {
    // Cliquer sur le backdrop (fond) soumet le formulaire
    if (e.target === e.currentTarget) {
      // Créer un événement de soumission factice
      const fakeEvent = { preventDefault: () => {} };
      onSubmit(fakeEvent);
    }
  };

  return (
    <div 
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '30px',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto'
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          {mode === 'create' ? 'Ajouter' : 'Modifier'} {type === 'vehicules' ? 'un véhicule' : 'une borne'}
        </h2>
        
        <form onSubmit={onSubmit}>
          {type === 'vehicules' ? (
            <VehiculeForm formData={formData} handleChange={handleChange} />
          ) : (
            <BorneForm formData={formData} handleChange={handleChange} />
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#95a5a6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: 'bold'
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: 'bold'
              }}
            >
              {mode === 'create' ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const VehiculeForm = ({ formData, handleChange }) => (
  <>
    <FormField
      label="Nom du véhicule *"
      name="nom"
      value={formData.nom || ''}
      onChange={handleChange}
      required
      placeholder="Ex: Autopompe 391, Citerne 301"
    />

    <FormField
      label="Type de véhicule"
      name="type_vehicule"
      type="select"
      value={formData.type_vehicule || 'Autopompe'}
      onChange={handleChange}
      options={[
        { value: 'Autopompe', label: 'Autopompe' },
        { value: 'Citerne', label: 'Citerne' },
        { value: 'Échelle', label: 'Échelle' },
        { value: 'Pick-up', label: 'Pick-up' },
        { value: 'VUS', label: 'VUS' },
        { value: 'Autre', label: 'Autre' }
      ]}
    />

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
      <FormField
        label="Marque"
        name="marque"
        value={formData.marque || ''}
        onChange={handleChange}
        placeholder="Ex: Freightliner, Ford"
      />
      <FormField
        label="Modèle"
        name="modele"
        value={formData.modele || ''}
        onChange={handleChange}
        placeholder="Ex: M2 106, F-550"
      />
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
      <FormField
        label="Année"
        name="annee"
        type="number"
        value={formData.annee || ''}
        onChange={handleChange}
        placeholder="2020"
      />
      <FormField
        label="Statut"
        name="statut"
        type="select"
        value={formData.statut || 'actif'}
        onChange={handleChange}
        options={[
          { value: 'actif', label: 'En service' },
          { value: 'maintenance', label: 'En maintenance' },
          { value: 'retraite', label: 'Retraité' }
        ]}
      />
    </div>

    <FormField
      label="VIN (Numéro d'identification)"
      name="vin"
      value={formData.vin || ''}
      onChange={handleChange}
      placeholder="17 caractères"
    />

    <FormField
      label="Notes"
      name="notes"
      type="textarea"
      value={formData.notes || ''}
      onChange={handleChange}
      rows={3}
    />
  </>
);

const BorneForm = ({ formData, handleChange }) => (
  <>
    <FormField
      label="Nom de la borne *"
      name="nom"
      value={formData.nom || ''}
      onChange={handleChange}
      required
      placeholder="Ex: Allen, Borne Wallace"
    />

    <FormField
      label="Type de borne *"
      name="type_borne"
      type="select"
      value={formData.type_borne || 'seche'}
      onChange={handleChange}
      required
      options={[
        { value: 'seche', label: 'Borne sèche' },
        { value: 'fontaine', label: 'Borne fontaine' },
        { value: 'point_eau_statique', label: 'Point d\'eau statique' }
      ]}
    />

    <FormField
      label="Municipalité"
      name="municipalite"
      value={formData.municipalite || ''}
      onChange={handleChange}
      placeholder="Ex: Canton de Shefford"
    />

    <FormField
      label="Adresse"
      name="adresse"
      value={formData.adresse || ''}
      onChange={handleChange}
    />

    <FormField
      label="Transversale"
      name="transversale"
      value={formData.transversale || ''}
      onChange={handleChange}
      placeholder="Ex: Chemin Wallace"
    />

    <FormField
      label="Débit"
      name="debit"
      value={formData.debit || ''}
      onChange={handleChange}
      placeholder="Ex: 1000 GPM"
    />

    <FormField
      label="Lien Google Maps"
      name="lien_maps"
      value={formData.lien_maps || ''}
      onChange={handleChange}
      placeholder="https://maps.app.goo.gl/..."
    />

    <FormField
      label="Statut"
      name="statut"
      type="select"
      value={formData.statut || 'operationnelle'}
      onChange={handleChange}
      options={[
        { value: 'operationnelle', label: 'Opérationnelle' },
        { value: 'hors_service', label: 'Hors service' },
        { value: 'a_verifier', label: 'À vérifier' }
      ]}
    />

    <FormField
      label="Notes importantes"
      name="notes_importantes"
      type="textarea"
      value={formData.notes_importantes || ''}
      onChange={handleChange}
      rows={3}
      placeholder="Ex: Allumer vos gyrophares, attention aux petites roches..."
    />
  </>
);

const FormField = ({ label, name, value, onChange, type = 'text', required = false, placeholder = '', options = [], rows = 3 }) => (
  <div style={{ marginBottom: '20px' }}>
    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#2c3e50' }}>
      {label}
    </label>
    {type === 'textarea' ? (
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        rows={rows}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '10px',
          border: '1px solid #ddd',
          borderRadius: '6px',
          fontSize: '14px',
          fontFamily: 'inherit'
        }}
      />
    ) : type === 'select' ? (
      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        style={{
          width: '100%',
          padding: '10px',
          border: '1px solid #ddd',
          borderRadius: '6px',
          fontSize: '14px'
        }}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    ) : (
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '10px',
          border: '1px solid #ddd',
          borderRadius: '6px',
          fontSize: '14px'
        }}
      />
    )}
  </div>
);

const QRCodeModal = ({ qrCodeData, onClose }) => (
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  }}>
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '40px',
      maxWidth: '500px',
      textAlign: 'center'
    }}>
      <h2 style={{ marginTop: 0 }}>📱 QR Code - {qrCodeData.item_name}</h2>
      <img 
        src={qrCodeData.qr_code} 
        alt="QR Code" 
        style={{ width: '300px', height: '300px', margin: '20px 0' }}
      />
      <p style={{ fontSize: '13px', color: '#666', wordBreak: 'break-all' }}>
        {qrCodeData.qr_code_url}
      </p>
      <button
        onClick={onClose}
        style={{
          marginTop: '20px',
          padding: '12px 30px',
          backgroundColor: '#3498db',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '15px',
          fontWeight: 'bold'
        }}
      >
        Fermer
      </button>
    </div>
  </div>
);

const FicheVieModal = ({ ficheVieData, onClose }) => (
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  }}>
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '30px',
      maxWidth: '700px',
      width: '90%',
      maxHeight: '80vh',
      overflow: 'auto'
    }}>
      <h2 style={{ marginTop: 0 }}>📋 Fiche de vie - {ficheVieData.vehicle_name}</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        {ficheVieData.vehicle_type} • Créé le {new Date(ficheVieData.created_at).toLocaleString('fr-CA')}
      </p>

      {ficheVieData.logs && ficheVieData.logs.length > 0 ? (
        <div style={{ marginTop: '20px' }}>
          {ficheVieData.logs.map((log, index) => (
            <div key={index} style={{
              padding: '15px',
              backgroundColor: '#f8f9fa',
              borderLeft: '4px solid #3498db',
              marginBottom: '10px',
              borderRadius: '4px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <strong style={{ color: '#2c3e50' }}>{log.action}</strong>
                <span style={{ fontSize: '13px', color: '#7f8c8d' }}>
                  {new Date(log.date).toLocaleString('fr-CA')}
                </span>
              </div>
              <p style={{ margin: '5px 0', color: '#555' }}>{log.details}</p>
              <p style={{ margin: '5px 0', fontSize: '13px', color: '#7f8c8d' }}>
                Par: {log.user_name}
              </p>
              {log.gps && (
                <p style={{ margin: '5px 0', fontSize: '12px', color: '#95a5a6' }}>
                  📍 GPS: {log.gps[1]}, {log.gps[0]}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
          Aucune entrée dans la fiche de vie
        </p>
      )}

      <button
        onClick={onClose}
        style={{
          marginTop: '20px',
          padding: '12px',
          width: '100%',
          backgroundColor: '#3498db',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '15px',
          fontWeight: 'bold'
        }}
      >
        Fermer
      </button>
    </div>
  </div>
);

const InspectionHistoryModal = ({ vehicle, inspections, onClose }) => (
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  }}>
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '30px',
      maxWidth: '800px',
      width: '90%',
      maxHeight: '80vh',
      overflow: 'auto'
    }}>
      <h2 style={{ marginTop: 0 }}>📝 Historique des inspections - {vehicle.nom}</h2>

      {inspections && inspections.length > 0 ? (
        <div style={{ marginTop: '20px' }}>
          {inspections.map((insp, index) => (
            <div key={index} style={{
              padding: '20px',
              backgroundColor: insp.passed ? '#f0fdf4' : '#fee2e2',
              borderLeft: `4px solid ${insp.passed ? '#27ae60' : '#e74c3c'}`,
              marginBottom: '15px',
              borderRadius: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <strong style={{ fontSize: '16px' }}>
                  {insp.passed ? '✅ Inspection réussie' : '❌ Défaut(s) détecté(s)'}
                </strong>
                <span style={{ fontSize: '13px', color: '#666' }}>
                  {new Date(insp.inspection_date).toLocaleString('fr-CA')}
                </span>
              </div>
              
              <p style={{ margin: '5px 0' }}>
                <strong>Inspecteur:</strong> {insp.inspector_name}
                {insp.inspector_matricule && ` (${insp.inspector_matricule})`}
              </p>
              
              {insp.comments && (
                <p style={{ margin: '10px 0', fontStyle: 'italic', color: '#555' }}>
                  "{insp.comments}"
                </p>
              )}

              {insp.defects && insp.defects.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <strong>Défectuosités:</strong>
                  <ul style={{ marginTop: '5px' }}>
                    {insp.defects.map((defect, i) => (
                      <li key={i} style={{ 
                        color: defect.severity === 'majeure' ? '#c0392b' : '#f39c12',
                        marginBottom: '5px'
                      }}>
                        <strong>{defect.item}</strong> ({defect.severity}): {defect.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
          Aucune inspection enregistrée pour ce véhicule
        </p>
      )}

      <button
        onClick={onClose}
        style={{
          marginTop: '20px',
          padding: '12px',
          width: '100%',
          backgroundColor: '#3498db',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '15px',
          fontWeight: 'bold'
        }}
      >
        Fermer
      </button>
    </div>
  </div>
);



export { Modal, VehiculeForm, BorneForm, FormField, QRCodeModal, FicheVieModal, InspectionHistoryModal };
export default Modal;
