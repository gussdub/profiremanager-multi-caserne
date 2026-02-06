import React from 'react';

// Tab navigation buttons
export const TabButton = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-t-lg font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
      active
        ? 'bg-red-600 text-white'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`}
  >
    {label}
  </button>
);

export const MobileTabButton = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      width: '100%',
      padding: '14px 16px',
      backgroundColor: active ? '#fee2e2' : 'white',
      color: active ? '#e74c3c' : '#333',
      border: 'none',
      borderBottom: '1px solid #eee',
      cursor: 'pointer',
      fontSize: '15px',
      fontWeight: active ? 'bold' : 'normal',
      textAlign: 'left',
      transition: 'all 0.2s'
    }}
  >
    {label}
  </button>
);

export const ActionButton = ({ label, color, onClick, small = false }) => (
  <button
    onClick={onClick}
    style={{
      flex: 1,
      padding: small ? '6px' : '10px',
      backgroundColor: color,
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: small ? '12px' : '14px',
      fontWeight: small ? 'normal' : 'bold',
      transition: 'opacity 0.2s'
    }}
    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
  >
    {label}
  </button>
);

// Card pour un véhicule individuel
const VehiculeCard = ({ vehicule, onEdit, onDelete, onGenerateQR, onViewFicheVie, onViewInspections, onCreateInspection, onCreateInventaire, onViewHistoriqueInventaires, onViewReparations, canManageActifs }) => {
  const getStatusColor = (status) => {
    switch(status) {
      case 'actif': return '#27ae60';
      case 'maintenance': return '#f39c12';
      case 'retraite': return '#95a5a6';
      default: return '#95a5a6';
    }
  };

  const getStatusLabel = (status) => {
    switch(status) {
      case 'actif': return 'En service';
      case 'maintenance': return 'Maintenance';
      case 'retraite': return 'Retraité';
      default: return status;
    }
  };

  return (
    <div style={{
      border: '1px solid #e0e0e0',
      borderRadius: '12px',
      padding: '20px',
      backgroundColor: 'white',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      transition: 'transform 0.2s, box-shadow 0.2s',
      cursor: 'pointer'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-4px)';
      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
    }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '20px' }}>{vehicule.nom}</h3>
        <span style={{
          padding: '6px 12px',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: 'bold',
          backgroundColor: getStatusColor(vehicule.statut),
          color: 'white'
        }}>
          {getStatusLabel(vehicule.statut)}
        </span>
      </div>
      
      <div style={{ marginBottom: '15px', color: '#555', lineHeight: '1.8' }}>
        {vehicule.type_vehicule && (
          <p style={{ margin: '5px 0' }}>
            <strong>Type:</strong> {vehicule.type_vehicule}
          </p>
        )}
        {vehicule.marque && (
          <p style={{ margin: '5px 0' }}>
            <strong>Marque:</strong> {vehicule.marque} {vehicule.modele}
          </p>
        )}
        {vehicule.annee && (
          <p style={{ margin: '5px 0' }}>
            <strong>Année:</strong> {vehicule.annee}
          </p>
        )}
        {vehicule.vin && (
          <p style={{ margin: '5px 0', fontSize: '13px' }}>
            <strong>VIN:</strong> {vehicule.vin}
          </p>
        )}
        {vehicule.derniere_inspection_date && (
          <p style={{ margin: '5px 0', color: '#27ae60' }}>
            <strong>✅ Dernière inspection:</strong> {new Date(vehicule.derniere_inspection_date).toLocaleDateString('fr-CA')}
          </p>
        )}
      </div>

      {vehicule.qr_code && (
        <div style={{ 
          textAlign: 'center', 
          padding: '10px', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '8px',
          marginBottom: '15px'
        }}>
          <img 
            src={vehicule.qr_code} 
            alt="QR Code" 
            style={{ width: '100px', height: '100px' }}
          />
          <p style={{ fontSize: '11px', color: '#666', margin: '5px 0 0 0' }}>
            Scanner pour accéder à la fiche
          </p>
        </div>
      )}

      {canManageActifs && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <ActionButton label="✏️ Modifier" color="#3498db" onClick={() => onEdit(vehicule)} />
          <ActionButton label="📋 Fiche de vie" color="#9b59b6" onClick={() => onViewFicheVie(vehicule)} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <ActionButton label="📝 Historique rondes de sécurité" color="#16a085" onClick={() => onViewInspections(vehicule)} small />
        <ActionButton label="✅ Nouvelle ronde de sécurité" color="#27ae60" onClick={() => onCreateInspection(vehicule)} small />
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <ActionButton label="📦 Inventaire" color="#8e44ad" onClick={() => onCreateInventaire(vehicule)} small />
        {canManageActifs && (
          <ActionButton label="📋 Historique inventaires" color="#9b59b6" onClick={() => onViewHistoriqueInventaires(vehicule)} small />
        )}
      </div>

      {canManageActifs && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <ActionButton label="🔧 Réparations & Entretiens" color="#dc2626" onClick={() => onViewReparations(vehicule)} small />
        </div>
      )}

      {canManageActifs && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <ActionButton label="📱 QR Code" color="#f39c12" onClick={() => onGenerateQR(vehicule)} small />
          <ActionButton label="🗑️ Supprimer" color="#e74c3c" onClick={() => onDelete(vehicule.id)} small />
        </div>
      )}
    </div>
  );
};

// Tab avec la liste des véhicules
export const VehiculesTab = ({ vehicules, onEdit, onDelete, onGenerateQR, onViewFicheVie, onViewInspections, onCreateInspection, onCreateInventaire, onViewHistoriqueInventaires, onViewReparations, canManageActifs }) => {
  if (vehicules.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666', backgroundColor: '#f8f9fa', borderRadius: '12px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚗</div>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem' }}>Aucun véhicule enregistré</h3>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>Commencez par ajouter votre premier véhicule</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '16px' }}>
      {vehicules.map(vehicule => (
        <VehiculeCard 
          key={vehicule.id}
          vehicule={vehicule}
          onEdit={onEdit}
          onDelete={onDelete}
          onGenerateQR={onGenerateQR}
          onViewFicheVie={onViewFicheVie}
          onViewInspections={onViewInspections}
          onCreateInspection={onCreateInspection}
          onCreateInventaire={onCreateInventaire}
          onViewHistoriqueInventaires={onViewHistoriqueInventaires}
          onViewReparations={onViewReparations}
          canManageActifs={canManageActifs}
        />
      ))}
    </div>
  );
};

// Tab avec la liste des bornes
const BorneCard = ({ borne, onEdit, onDelete, onGenerateQR }) => {
  const getStatusColor = (status) => {
    switch(status) {
      case 'operationnelle': return '#27ae60';
      case 'hors_service': return '#e74c3c';
      case 'a_verifier': return '#f39c12';
      default: return '#95a5a6';
    }
  };

  return (
    <div style={{
      border: '1px solid #e0e0e0',
      borderRadius: '12px',
      padding: '20px',
      backgroundColor: 'white',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, color: '#2c3e50' }}>{borne.nom}</h3>
        <span style={{
          padding: '6px 12px',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: 'bold',
          backgroundColor: getStatusColor(borne.statut),
          color: 'white'
        }}>
          {borne.statut}
        </span>
      </div>
      
      <div style={{ marginBottom: '15px', color: '#555' }}>
        <p><strong>Type:</strong> {
          borne.type_borne === 'seche' ? 'Borne sèche' : 
          borne.type_borne === 'fontaine' ? 'Borne fontaine' : 
          "Point d'eau statique"
        }</p>
        {borne.municipalite && <p><strong>Municipalité:</strong> {borne.municipalite}</p>}
        {borne.adresse && <p><strong>Adresse:</strong> {borne.adresse}</p>}
        {borne.transversale && <p><strong>Transversale:</strong> {borne.transversale}</p>}
        {borne.debit && <p><strong>Débit:</strong> {borne.debit}</p>}
        {borne.lien_maps && (
          <p>
            <a href={borne.lien_maps} target="_blank" rel="noopener noreferrer" style={{ color: '#3498db' }}>
              📍 Voir sur la carte
            </a>
          </p>
        )}
      </div>

      {borne.qr_code && (
        <div style={{ 
          textAlign: 'center', 
          padding: '10px', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '8px',
          marginBottom: '15px'
        }}>
          <img 
            src={borne.qr_code} 
            alt="QR Code" 
            style={{ width: '100px', height: '100px' }}
          />
          <p style={{ fontSize: '11px', color: '#666', margin: '5px 0 0 0' }}>
            Scanner pour accéder à la fiche
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '15px' }}>
        <ActionButton label="✏️ Modifier" color="#3498db" onClick={() => onEdit(borne)} />
        <ActionButton label="📱 QR Code" color="#f39c12" onClick={() => onGenerateQR(borne)} small />
        <ActionButton label="🗑️ Supprimer" color="#e74c3c" onClick={() => onDelete(borne.id)} small />
      </div>
    </div>
  );
};

export const BornesTab = ({ bornes, onEdit, onDelete, onGenerateQR }) => {
  if (bornes.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: '#666', backgroundColor: '#f8f9fa', borderRadius: '12px' }}>
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>💧</div>
        <h3>Aucune borne d&apos;incendie enregistrée</h3>
        <p>Commencez par ajouter votre première borne</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
      {bornes.map(borne => (
        <BorneCard
          key={borne.id}
          borne={borne}
          onEdit={onEdit}
          onDelete={onDelete}
          onGenerateQR={onGenerateQR}
        />
      ))}
    </div>
  );
};
