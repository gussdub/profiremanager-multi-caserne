import React from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { 
  Calendar, Check, RefreshCw, Plus, Edit, Trash2, CheckCircle, XCircle
} from 'lucide-react';
import { categoriesHeures } from './utils';

const TabParametres = ({ context }) => {
  const {
    parametres, setParametres, eventTypes, newEventType, setNewEventType,
    showEventTypeForm, setShowEventTypeForm, editingEventType, setEditingEventType,
    handleSaveParametres, handleAddEventType, handleDeleteEventType,
    handleSaveEditEventType, handleEditEventType, loading
  } = context;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Période de paie */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          <Calendar size={20} /> Période de paie
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Durée de la période (jours)
            </label>
            <select
              value={parametres?.periode_paie_jours || 14}
              onChange={(e) => setParametres({...parametres, periode_paie_jours: parseInt(e.target.value)})}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
            >
              <option value={7}>7 jours (hebdomadaire)</option>
              <option value={14}>14 jours (bi-hebdomadaire)</option>
              <option value={30}>30 jours (mensuel)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Rappel / Interventions */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          🚨 Rappel & Interventions (hors garde interne)
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '16px' }}>
          Lorsqu&apos;un pompier intervient en garde externe ou est rappelé, il est payé un minimum d&apos;heures selon la source de l&apos;appel.
          Activez uniquement les sources d&apos;appel applicables à votre caserne.
        </p>
        
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
            Taux multiplicateur
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={parametres?.rappel_taux_text !== undefined ? parametres.rappel_taux_text : (parametres?.rappel_taux || '1')}
            onChange={(e) => {
              const textValue = e.target.value;
              const numValue = parseFloat(textValue.replace(',', '.'));
              setParametres({
                ...parametres, 
                rappel_taux_text: textValue,
                rappel_taux: isNaN(numValue) ? 1 : numValue
              });
            }}
            placeholder="1,0"
            style={{ maxWidth: '200px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
          />
        </div>

        {/* Sources d'appel */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
          gap: '16px'
        }}>
          {/* CAUCA */}
          <div style={{ 
            background: parametres?.activer_cauca !== false ? '#fef2f2' : '#f8fafc', 
            padding: '16px', 
            borderRadius: '8px',
            border: parametres?.activer_cauca !== false ? '2px solid #ef4444' : '2px solid #e2e8f0',
            opacity: parametres?.activer_cauca !== false ? 1 : 0.7
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem' }}>🚒</span>
                <div>
                  <div style={{ fontWeight: '600', color: parametres?.activer_cauca !== false ? '#dc2626' : '#64748b' }}>Appels CAUCA</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Incendie, alarme, désincarcération, etc.
                  </div>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={parametres?.activer_cauca !== false}
                  onChange={(e) => setParametres({...parametres, activer_cauca: e.target.checked})}
                  style={{ width: '18px', height: '18px', accentColor: '#ef4444' }}
                />
                <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>Actif</span>
              </label>
            </div>
            {parametres?.activer_cauca !== false && (
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                  Heures minimum payées
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={parametres?.minimum_heures_cauca_text !== undefined ? parametres.minimum_heures_cauca_text : (parametres?.minimum_heures_cauca || '3')}
                  onChange={(e) => {
                    const textValue = e.target.value;
                    const numValue = parseFloat(textValue.replace(',', '.'));
                    setParametres({
                      ...parametres, 
                      minimum_heures_cauca_text: textValue,
                      minimum_heures_cauca: isNaN(numValue) ? 3 : numValue
                    });
                  }}
                  placeholder="3"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Dossier SFTP: intervention_cauca
                </span>
              </div>
            )}
          </div>

          {/* Urgence Santé / PR */}
          <div style={{ 
            background: parametres?.activer_urgence_sante ? '#eff6ff' : '#f8fafc', 
            padding: '16px', 
            borderRadius: '8px',
            border: parametres?.activer_urgence_sante ? '2px solid #3b82f6' : '2px solid #e2e8f0',
            opacity: parametres?.activer_urgence_sante ? 1 : 0.7
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem' }}>🏥</span>
                <div>
                  <div style={{ fontWeight: '600', color: parametres?.activer_urgence_sante ? '#2563eb' : '#64748b' }}>Appels Urgence Santé</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Premiers répondants (PR)
                  </div>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={parametres?.activer_urgence_sante || false}
                  onChange={(e) => setParametres({...parametres, activer_urgence_sante: e.target.checked})}
                  style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }}
                />
                <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>Actif</span>
              </label>
            </div>
            {parametres?.activer_urgence_sante && (
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                  Heures minimum payées
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={parametres?.minimum_heures_urgence_sante_text !== undefined ? parametres.minimum_heures_urgence_sante_text : (parametres?.minimum_heures_urgence_sante || '2')}
                  onChange={(e) => {
                    const textValue = e.target.value;
                    const numValue = parseFloat(textValue.replace(',', '.'));
                    setParametres({
                      ...parametres, 
                      minimum_heures_urgence_sante_text: textValue,
                      minimum_heures_urgence_sante: isNaN(numValue) ? 2 : numValue
                    });
                  }}
                  placeholder="2"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Dossier SFTP: intervention_urgence_sante
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Formations */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          📚 Formations
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Taux multiplicateur
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={parametres?.formation_taux_text !== undefined ? parametres.formation_taux_text : (parametres?.formation_taux || '1')}
              onChange={(e) => {
                const textValue = e.target.value;
                const numValue = parseFloat(textValue.replace(',', '.'));
                setParametres({
                  ...parametres, 
                  formation_taux_text: textValue,
                  formation_taux: isNaN(numValue) ? 1 : numValue
                });
              }}
              placeholder="1,0"
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
            />
          </div>
        </div>
      </div>

      {/* Prime fonction supérieure */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          ⬆️ Prime fonction supérieure
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '16px' }}>
          Lorsqu&apos;un employé avec &quot;fonction supérieure&quot; cochée dans sa fiche occupe un poste de grade supérieur 
          (ex: Pompier → Lieutenant, Lieutenant → Capitaine), son taux horaire est majoré de ce pourcentage.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Pourcentage de majoration (%)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={parametres?.prime_fonction_superieure_pct_text !== undefined ? parametres.prime_fonction_superieure_pct_text : (parametres?.prime_fonction_superieure_pct || '10')}
              onChange={(e) => {
                const textValue = e.target.value;
                const numValue = parseFloat(textValue.replace(',', '.'));
                setParametres({
                  ...parametres, 
                  prime_fonction_superieure_pct_text: textValue,
                  prime_fonction_superieure_pct: isNaN(numValue) ? 10 : numValue
                });
              }}
              placeholder="10"
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
            />
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Ex: 10 = +10% sur le taux horaire</span>
          </div>
        </div>
      </div>

      {/* Heures supplémentaires */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          ⏰ Heures supplémentaires
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '16px' }}>
          Actives uniquement si cochées dans Paramètres &gt; Planning &gt; Attribution.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Seuil hebdomadaire (heures)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={parametres?.heures_sup_seuil_hebdo_text !== undefined ? parametres.heures_sup_seuil_hebdo_text : (parametres?.heures_sup_seuil_hebdo || '40')}
              onChange={(e) => {
                const textValue = e.target.value;
                const numValue = parseInt(textValue.replace(',', '.'));
                setParametres({
                  ...parametres, 
                  heures_sup_seuil_hebdo_text: textValue,
                  heures_sup_seuil_hebdo: isNaN(numValue) ? 40 : numValue
                });
              }}
              placeholder="40"
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Taux multiplicateur
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={parametres?.heures_sup_taux_text !== undefined ? parametres.heures_sup_taux_text : (parametres?.heures_sup_taux || '1.5')}
              onChange={(e) => {
                const textValue = e.target.value;
                const numValue = parseFloat(textValue.replace(',', '.'));
                setParametres({
                  ...parametres, 
                  heures_sup_taux_text: textValue,
                  heures_sup_taux: isNaN(numValue) ? 1.5 : numValue
                });
              }}
              placeholder="1,5"
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
            />
          </div>
        </div>
      </div>

      {/* Types d&apos;heures personnalisés */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
            📋 Types d&apos;heures personnalisés
          </h3>
          <Button size="sm" onClick={() => setShowEventTypeForm(!showEventTypeForm)} data-testid="add-event-type-btn">
            <Plus size={16} /> Ajouter
          </Button>
        </div>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '16px' }}>
          Créez vos propres types d&apos;heures, primes ou frais pour les associer aux codes de gains de votre logiciel de paie.
        </p>

        {/* Formulaire d'ajout */}
        {showEventTypeForm && (
          <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                  Code *
                </label>
                <Input
                  value={newEventType.code}
                  onChange={(e) => setNewEventType({...newEventType, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_')})}
                  placeholder="Ex: KILOMETRAGE"
                  style={{ fontFamily: 'monospace' }}
                  data-testid="new-event-code"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                  Libellé *
                </label>
                <Input
                  value={newEventType.label}
                  onChange={(e) => setNewEventType({...newEventType, label: e.target.value})}
                  placeholder="Ex: Kilométrage"
                  data-testid="new-event-label"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                  Catégorie
                </label>
                <select
                  value={newEventType.category}
                  onChange={(e) => setNewEventType({...newEventType, category: e.target.value})}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                >
                  <option value="heures">Heures travaillées</option>
                  <option value="prime">Prime / Bonus</option>
                  <option value="frais">Frais / Remboursement</option>
                  <option value="deduction">Déduction</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                  Unité
                </label>
                <select
                  value={newEventType.unit || 'heures'}
                  onChange={(e) => setNewEventType({...newEventType, unit: e.target.value})}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                >
                  <option value="heures">Heures (h)</option>
                  <option value="km">Kilomètres (km)</option>
                  <option value="montant">Montant ($)</option>
                  <option value="quantite">Quantité</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                  {newEventType.unit === 'heures' ? 'Multiplicateur du taux horaire' : 'Taux unitaire'}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={newEventType.default_rate_text !== undefined ? newEventType.default_rate_text : (newEventType.default_rate || (newEventType.unit === 'heures' ? '1' : '0'))}
                  onChange={(e) => {
                    // Garder la valeur texte pour permettre la saisie de virgule/point
                    const textValue = e.target.value;
                    // Convertir pour stockage (virgule -> point)
                    const numValue = parseFloat(textValue.replace(',', '.'));
                    setNewEventType({
                      ...newEventType, 
                      default_rate_text: textValue,
                      default_rate: isNaN(numValue) ? 0 : numValue
                    });
                  }}
                  placeholder={newEventType.unit === 'km' ? '0,65' : newEventType.unit === 'montant' ? '25,00' : newEventType.unit === 'heures' ? '1,5' : '10,00'}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {newEventType.unit === 'km' ? '$/km (ex: 0,65)' : 
                   newEventType.unit === 'montant' ? 'Montant fixe $' : 
                   newEventType.unit === 'quantite' ? '$/unité' : 
                   'Ex: 1,0 = 100% du taux horaire employé, 1,5 = 150%'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button size="sm" onClick={handleAddEventType} data-testid="save-event-type-btn">
                <Check size={14} /> Enregistrer
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowEventTypeForm(false)}>
                Annuler
              </Button>
            </div>
          </div>
        )}

        {/* Liste des types d&apos;heures */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Code</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Libellé</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Catégorie</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Unité</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }} title="Pour heures: multiplicateur du taux horaire employé. Pour km/$: taux unitaire">Taux/Multi.</th>
                <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '120px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {eventTypes.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                    Aucun type configuré. Cliquez sur "Ajouter" pour en créer.
                  </td>
                </tr>
              ) : (
                eventTypes.map(et => (
                  <tr key={et.id || et.code} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: '600', color: '#2563eb' }}>{et.code}</td>
                    <td style={{ padding: '10px' }}>
                      {editingEventType && (editingEventType.id === et.id || editingEventType.code === et.code) ? (
                        <Input
                          value={editingEventType.label || ''}
                          onChange={(e) => setEditingEventType({...editingEventType, label: e.target.value})}
                          style={{ padding: '4px', fontSize: '0.8rem' }}
                        />
                      ) : et.label}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {editingEventType && (editingEventType.id === et.id || editingEventType.code === et.code) ? (
                        <select
                          value={editingEventType.category || 'heures'}
                          onChange={(e) => setEditingEventType({...editingEventType, category: e.target.value})}
                          style={{ padding: '4px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.75rem' }}
                        >
                          <option value="heures">Heures</option>
                          <option value="prime">Prime</option>
                          <option value="frais">Frais</option>
                          <option value="deduction">Déduction</option>
                        </select>
                      ) : (
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          background: et.category === 'heures' ? '#dbeafe' : 
                                     et.category === 'prime' ? '#fef3c7' : 
                                     et.category === 'deduction' ? '#fee2e2' : '#dcfce7',
                          color: et.category === 'heures' ? '#1e40af' : 
                                 et.category === 'prime' ? '#92400e' : 
                                 et.category === 'deduction' ? '#991b1b' : '#166534'
                        }}>
                          {et.category === 'heures' ? 'Heures' : 
                           et.category === 'prime' ? 'Prime' : 
                           et.category === 'deduction' ? 'Déduction' : 'Frais'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px', color: '#64748b', fontSize: '0.8rem' }}>
                      {editingEventType && (editingEventType.id === et.id || editingEventType.code === et.code) ? (
                        <select
                          value={editingEventType.unit || 'heures'}
                          onChange={(e) => setEditingEventType({...editingEventType, unit: e.target.value})}
                          style={{ padding: '4px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.75rem' }}
                        >
                          <option value="heures">h</option>
                          <option value="km">km</option>
                          <option value="montant">$</option>
                          <option value="quantite">qté</option>
                        </select>
                      ) : (
                        et.unit === 'km' ? 'km' : 
                        et.unit === 'montant' ? '$' : 
                        et.unit === 'quantite' ? 'qté' : 'h'
                      )}
                    </td>
                    <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '0.8rem', color: et.default_rate ? '#059669' : '#9ca3af' }}>
                      {editingEventType && (editingEventType.id === et.id || editingEventType.code === et.code) ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editingEventType.default_rate_text !== undefined ? editingEventType.default_rate_text : (editingEventType.default_rate ?? (et.unit === 'heures' ? '1' : '0'))}
                          onChange={(e) => {
                            // Garder la valeur texte pour permettre la saisie
                            const textValue = e.target.value;
                            const numValue = parseFloat(textValue.replace(',', '.'));
                            setEditingEventType({
                              ...editingEventType, 
                              default_rate_text: textValue,
                              default_rate: isNaN(numValue) ? 0 : numValue
                            });
                          }}
                          placeholder="0,65"
                          style={{ width: '80px', padding: '4px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
                        />
                      ) : (
                        et.default_rate ? 
                          (et.unit === 'heures' ? `×${et.default_rate.toFixed(2)}` : 
                           et.unit === 'km' ? `${et.default_rate.toFixed(2)}$/km` : 
                           et.unit === 'montant' ? `${et.default_rate.toFixed(2)}$` : 
                           `${et.default_rate.toFixed(2)}$/u`)
                          : (et.unit === 'heures' ? '×1.00' : '-')
                      )}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        {editingEventType && (editingEventType.id === et.id || editingEventType.code === et.code) ? (
                          <>
                            <Button variant="ghost" size="sm" onClick={handleSaveEditEventType} title="Enregistrer">
                              <Check size={14} style={{ color: '#16a34a' }} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditingEventType(null)} title="Annuler">
                              <XCircle size={14} style={{ color: '#64748b' }} />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleEditEventType(et)} title="Modifier">
                              <Edit size={14} style={{ color: '#2563eb' }} />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteEventType(et.id || et.code)} title="Supprimer">
                              <Trash2 size={14} style={{ color: '#ef4444' }} />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Button onClick={handleSaveParametres} disabled={loading} style={{ alignSelf: 'flex-start' }}>
        {loading ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
        <span style={{ marginLeft: '8px' }}>Enregistrer les paramètres</span>
      </Button>
    </div>
  );
};

export default TabParametres;
