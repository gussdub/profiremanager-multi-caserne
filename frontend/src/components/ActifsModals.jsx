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
        zIndex: 100000
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
            <VehiculeForm formData={formData} handleChange={handleChange} setFormData={setFormData} />
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

const VehiculeForm = ({ formData, handleChange, setFormData }) => {
  const { tenantSlug } = useTenant();
  const [formulairesDisponibles, setFormulairesDisponibles] = useState([]);
  const [loadingFormulaires, setLoadingFormulaires] = useState(false);

  // Charger les formulaires d'inspection avec la catégorie "vehicule"
  useEffect(() => {
    const fetchFormulaires = async () => {
      if (!tenantSlug) return;
      try {
        setLoadingFormulaires(true);
        const allFormulaires = await apiGet(tenantSlug, '/formulaires-inspection');
        // Filtrer les formulaires ayant la catégorie "vehicule"
        const vehiculeFormulaires = (allFormulaires || []).filter(f => 
          f.est_actif !== false && f.categorie_ids?.includes('vehicule')
        );
        setFormulairesDisponibles(vehiculeFormulaires);
      } catch (error) {
        console.error('Erreur chargement formulaires:', error);
      } finally {
        setLoadingFormulaires(false);
      }
    };
    fetchFormulaires();
  }, [tenantSlug]);

  const handleFormulaireChange = (e) => {
    const value = e.target.value;
    if (setFormData) {
      setFormData(prev => ({ ...prev, modele_inventaire_id: value }));
    } else {
      handleChange({ target: { name: 'modele_inventaire_id', value } });
    }
  };

  return (
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

      {/* Section SAAQ / Classification */}
      <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#fef3c7', borderRadius: '8px', border: '1px solid #fcd34d' }}>
        <Label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', color: '#92400e' }}>
          🚒 Classification SAAQ
        </Label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div>
            <Label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem' }}>
              Poids PNBV (kg)
            </Label>
            <Input
              type="number"
              name="poids_pnbv"
              value={formData.poids_pnbv || ''}
              onChange={handleChange}
              placeholder="Ex: 4500"
            />
            {formData.poids_pnbv && (
              <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: formData.poids_pnbv > 4500 ? '#dc2626' : '#16a34a' }}>
                {formData.poids_pnbv > 4500 ? '⚠️ > 4500 kg : Inspection annuelle obligatoire' : '✓ ≤ 4500 kg'}
              </p>
            )}
          </div>
          <div>
            <Label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem' }}>
              Classification
            </Label>
            <select
              name="classification_saaq"
              value={formData.classification_saaq || ''}
              onChange={handleChange}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
            >
              <option value="">-- Sélectionner --</option>
              <option value="urgence">🚨 Véhicule d'urgence</option>
              <option value="soutien">🚗 Véhicule de soutien/admin</option>
            </select>
          </div>
        </div>
      </div>

      {/* Section Vignette / PEP */}
      <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#fee2e2', borderRadius: '8px', border: '1px solid #fca5a5' }}>
        <Label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', color: '#991b1b' }}>
          📋 Vignette / Inspection Mécanique (PEP)
        </Label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '12px' }}>
          <div>
            <Label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem' }}>
              Numéro de vignette
            </Label>
            <Input
              type="text"
              name="vignette_numero"
              value={formData.vignette_numero || ''}
              onChange={handleChange}
              placeholder="Séquence numérique"
            />
          </div>
          <div>
            <Label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem' }}>
              Statut
            </Label>
            <select
              name="vignette_statut"
              value={formData.vignette_statut || 'conforme'}
              onChange={handleChange}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}
            >
              <option value="conforme">✅ Conforme</option>
              <option value="remise">🔄 Remisé</option>
              <option value="rancart">❌ Au rancart</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div>
            <Label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem' }}>
              Date d'inspection
            </Label>
            <Input
              type="date"
              name="vignette_date_inspection"
              value={formData.vignette_date_inspection || ''}
              onChange={handleChange}
            />
          </div>
          <div>
            <Label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem' }}>
              Date d'expiration (mois/année)
            </Label>
            <Input
              type="month"
              name="vignette_date_expiration"
              value={formData.vignette_date_expiration || ''}
              onChange={handleChange}
            />
            <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#6b7280' }}>
              Valide jusqu'à la fin du mois indiqué
            </p>
          </div>
        </div>
      </div>

      {/* Section Entretien périodique */}
      <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#dbeafe', borderRadius: '8px', border: '1px solid #93c5fd' }}>
        <Label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', color: '#1e40af' }}>
          🔧 Entretien périodique (Vidange/Lubrification)
        </Label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '12px' }}>
          <div>
            <Label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem' }}>
              Intervalle (mois)
            </Label>
            <Input
              type="number"
              name="entretien_intervalle_mois"
              value={formData.entretien_intervalle_mois || ''}
              onChange={handleChange}
              placeholder="Ex: 6"
            />
          </div>
          <div>
            <Label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem' }}>
              Intervalle (km)
            </Label>
            <Input
              type="number"
              name="entretien_intervalle_km"
              value={formData.entretien_intervalle_km || ''}
              onChange={handleChange}
              placeholder="Ex: 10000"
            />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div>
            <Label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem' }}>
              Dernière vidange (date)
            </Label>
            <Input
              type="date"
              name="derniere_vidange_date"
              value={formData.derniere_vidange_date || ''}
              onChange={handleChange}
            />
          </div>
          <div>
            <Label style={{ display: 'block', marginBottom: '4px', fontSize: '0.875rem' }}>
              Dernière vidange (km)
            </Label>
            <Input
              type="number"
              name="derniere_vidange_km"
              value={formData.derniere_vidange_km || ''}
              onChange={handleChange}
              placeholder="Kilométrage"
            />
          </div>
        </div>
      </div>

      {/* Sélection du formulaire d'inspection */}
      <div style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac' }}>
        <Label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#166534' }}>
          📋 Formulaire d'inventaire assigné
        </Label>
        <select
          name="modele_inventaire_id"
          value={formData.modele_inventaire_id || ''}
          onChange={handleFormulaireChange}
          style={{
            width: '100%',
            padding: '12px',
            border: '1px solid #86efac',
            borderRadius: '8px',
            fontSize: '15px',
            backgroundColor: 'white'
          }}
        >
          <option value="">-- Sélectionner un formulaire --</option>
          {formulairesDisponibles.map(f => (
            <option key={f.id} value={f.id}>{f.nom}</option>
          ))}
        </select>
        {loadingFormulaires && (
          <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: '#6b7280' }}>Chargement...</p>
        )}
        {!loadingFormulaires && formulairesDisponibles.length === 0 && (
          <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: '#dc2626' }}>
            ⚠️ Aucun formulaire avec la catégorie "Véhicules" n'a été trouvé. Créez-en un dans Paramètres → Formulaires.
          </p>
        )}
        {formulairesDisponibles.length > 0 && (
          <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: '#166534' }}>
            💡 Ce formulaire sera utilisé pour l'inventaire de ce véhicule.
          </p>
        )}
      </div>

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
};

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
    zIndex: 100000
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

const FicheVieModal = ({ ficheVieData, onClose }) => {
  const [activeTab, setActiveTab] = useState('general');
  
  const formatMontant = (val) => {
    if (!val) return '0,00 $';
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(val);
  };

  const getTypeLabel = (type) => {
    const labels = {
      'entretien_preventif': '🔧 Entretien préventif',
      'reparation_mineure': '⚠️ Réparation mineure',
      'reparation_majeure': '🔴 Réparation majeure',
      'inspection_mecanique': '📋 Inspection mécanique',
      'autre': '📝 Autre'
    };
    return labels[type] || type;
  };

  return (
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
      zIndex: 100000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '900px',
        width: '95%',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#1e293b' }}>📋 Fiche de vie - {ficheVieData.vehicle_name}</h2>
            <p style={{ color: '#64748b', margin: '4px 0 0' }}>
              {ficheVieData.vehicle_type} • {ficheVieData.marque} {ficheVieData.modele} • {ficheVieData.annee}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            {ficheVieData.vignette_statut && (
              <span style={{
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '0.75rem',
                fontWeight: '600',
                backgroundColor: ficheVieData.vignette_statut === 'conforme' ? '#dcfce7' : '#fee2e2',
                color: ficheVieData.vignette_statut === 'conforme' ? '#166534' : '#991b1b'
              }}>
                {ficheVieData.vignette_statut === 'conforme' ? '✅ Conforme' : '❌ ' + ficheVieData.vignette_statut}
              </span>
            )}
            <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '8px 0 0' }}>
              VIN: {ficheVieData.vin || 'N/A'} • {ficheVieData.kilometrage ? `${ficheVieData.kilometrage.toLocaleString()} km` : ''}
            </p>
          </div>
        </div>

        {/* Onglets */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>
          {['general', 'reparations', 'rondes', 'historique'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '500',
                backgroundColor: activeTab === tab ? '#dc2626' : '#f1f5f9',
                color: activeTab === tab ? 'white' : '#475569'
              }}
            >
              {tab === 'general' && '📊 Général'}
              {tab === 'reparations' && `🔧 Réparations (${ficheVieData.reparations?.length || 0})`}
              {tab === 'rondes' && `🚗 Rondes (${ficheVieData.rondes_securite?.length || 0})`}
              {tab === 'historique' && `📜 Historique`}
            </button>
          ))}
        </div>

        {/* Contenu des onglets */}
        {activeTab === 'general' && (
          <div>
            {/* Infos SAAQ/PEP */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
              <div style={{ padding: '16px', backgroundColor: '#fef3c7', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: '600' }}>Classification SAAQ</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#78350f' }}>
                  {ficheVieData.classification_saaq === 'urgence' ? '🚨 Urgence' : ficheVieData.classification_saaq === 'soutien' ? '🚗 Soutien' : 'N/A'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#92400e' }}>
                  PNBV: {ficheVieData.poids_pnbv ? `${ficheVieData.poids_pnbv.toLocaleString()} kg` : 'N/A'}
                </div>
              </div>
              
              <div style={{ padding: '16px', backgroundColor: '#fee2e2', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: '600' }}>Vignette PEP</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#7f1d1d' }}>
                  #{ficheVieData.vignette_numero || 'N/A'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#991b1b' }}>
                  Expire: {ficheVieData.vignette_date_expiration || 'N/A'}
                </div>
              </div>
              
              <div style={{ padding: '16px', backgroundColor: '#dbeafe', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: '600' }}>Dernier entretien</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e3a8a' }}>
                  {ficheVieData.derniere_vidange_date || 'N/A'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#1e40af' }}>
                  {ficheVieData.derniere_vidange_km ? `${ficheVieData.derniere_vidange_km.toLocaleString()} km` : ''}
                </div>
              </div>
              
              <div style={{ padding: '16px', backgroundColor: '#dcfce7', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: '600' }}>Budget réparations (2 ans)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#14532d' }}>
                  {formatMontant(ficheVieData.stats_budget?.cout_total_2ans)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#166534' }}>
                  {ficheVieData.stats_budget?.nb_reparations || 0} intervention(s)
                </div>
              </div>
            </div>

            {/* Répartition des coûts par type */}
            {ficheVieData.stats_budget?.cout_par_type && Object.keys(ficheVieData.stats_budget.cout_par_type).length > 0 && (
              <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                <h4 style={{ margin: '0 0 12px', color: '#475569' }}>Répartition des coûts par type</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  {Object.entries(ficheVieData.stats_budget.cout_par_type).map(([type, cout]) => (
                    <div key={type} style={{ padding: '8px 12px', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{getTypeLabel(type)}</div>
                      <div style={{ fontWeight: '600' }}>{formatMontant(cout)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'reparations' && (
          <div>
            {ficheVieData.reparations && ficheVieData.reparations.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {ficheVieData.reparations.map((rep, idx) => (
                  <div key={idx} style={{
                    padding: '16px',
                    backgroundColor: rep.type_intervention === 'reparation_majeure' ? '#fee2e2' : '#f8fafc',
                    borderLeft: `4px solid ${rep.type_intervention === 'reparation_majeure' ? '#dc2626' : rep.type_intervention === 'reparation_mineure' ? '#f97316' : '#3b82f6'}`,
                    borderRadius: '8px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <strong>{getTypeLabel(rep.type_intervention)}</strong>
                      <span style={{ color: '#64748b', fontSize: '0.875rem' }}>{rep.date_reparation}</span>
                    </div>
                    <p style={{ margin: '0 0 8px', color: '#374151' }}>{rep.description}</p>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '0.875rem', color: '#64748b' }}>
                      {rep.cout && <span>💰 {formatMontant(rep.cout)}</span>}
                      {rep.fournisseur && <span>🏪 {rep.fournisseur}</span>}
                      {rep.kilometrage_actuel && <span>📍 {rep.kilometrage_actuel.toLocaleString()} km</span>}
                      {rep.numero_facture && <span>📄 #{rep.numero_facture}</span>}
                    </div>
                    {rep.pieces_remplacees && (
                      <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                        Pièces: {rep.pieces_remplacees}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
                Aucune réparation enregistrée
              </p>
            )}
          </div>
        )}

        {activeTab === 'rondes' && (
          <div>
            {ficheVieData.rondes_securite && ficheVieData.rondes_securite.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {ficheVieData.rondes_securite.map((ronde, idx) => (
                  <div key={idx} style={{
                    padding: '16px',
                    backgroundColor: ronde.resultat === 'conforme' ? '#f0fdf4' : '#fee2e2',
                    borderLeft: `4px solid ${ronde.resultat === 'conforme' ? '#22c55e' : '#ef4444'}`,
                    borderRadius: '8px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <strong>{ronde.resultat === 'conforme' ? '✅ Conforme' : '❌ Défectuosité'}</strong>
                      <span style={{ color: '#64748b', fontSize: '0.875rem' }}>{ronde.date_ronde}</span>
                    </div>
                    <p style={{ margin: '0', fontSize: '0.875rem', color: '#64748b' }}>
                      Par: {ronde.inspecteur_nom || 'N/A'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
                Aucune ronde de sécurité enregistrée
              </p>
            )}
          </div>
        )}

        {activeTab === 'historique' && (
          <div>
            {ficheVieData.logs && ficheVieData.logs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {ficheVieData.logs.slice().reverse().map((log, index) => (
                  <div key={index} style={{
                    padding: '12px 16px',
                    backgroundColor: '#f8fafc',
                    borderLeft: '3px solid #3b82f6',
                    borderRadius: '6px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <strong style={{ color: '#1e293b', fontSize: '0.875rem' }}>{log.action}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {new Date(log.date).toLocaleString('fr-CA')}
                      </span>
                    </div>
                    {log.details && <p style={{ margin: '0', color: '#475569', fontSize: '0.875rem' }}>{log.details}</p>}
                    <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                      Par: {log.user_nom || log.user_name || 'Système'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
                Aucune entrée dans l'historique
              </p>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            marginTop: '24px',
            padding: '12px',
            width: '100%',
            backgroundColor: '#dc2626',
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
};

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
    zIndex: 100000
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
