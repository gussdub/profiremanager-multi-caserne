import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const SectionSinistre = ({ intervention, tenantSlug, user, getToken, toast, canEdit }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    // Propriétaire
    owner_name: '',
    owner_phone: '',
    owner_email: '',
    owner_address: '',
    // Assurance
    insurance_company: '',
    policy_number: '',
    insurance_broker: '',
    insurance_phone: '',
    // Pertes
    estimated_loss_building: 0,
    estimated_loss_content: 0,
    loss_notes: ''
  });
  
  const API = `${BACKEND_URL}/api/${tenantSlug}`;
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`${API}/interventions/${intervention.id}/sinistre`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.sinistre) {
            setFormData({
              owner_name: data.sinistre.owner_name || '',
              owner_phone: data.sinistre.owner_phone || '',
              owner_email: data.sinistre.owner_email || '',
              owner_address: data.sinistre.owner_address || '',
              insurance_company: data.sinistre.insurance_company || '',
              policy_number: data.sinistre.policy_number || '',
              insurance_broker: data.sinistre.insurance_broker || '',
              insurance_phone: data.sinistre.insurance_phone || '',
              estimated_loss_building: data.sinistre.estimated_loss_building || 0,
              estimated_loss_content: data.sinistre.estimated_loss_content || 0,
              loss_notes: data.sinistre.loss_notes || ''
            });
          }
        }
      } catch (error) {
        console.error('Erreur chargement sinistre:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [intervention.id, tenantSlug]);
  
  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API}/interventions/${intervention.id}/sinistre`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      
      if (response.ok) {
        toast?.({ title: '✅ Données du sinistré enregistrées', variant: 'success' });
      } else {
        const error = await response.json();
        toast?.({ title: error.detail || 'Erreur', variant: 'destructive' });
      }
    } catch (error) {
      toast?.({ title: 'Erreur de connexion', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-CA', { 
      style: 'currency', 
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };
  
  const totalLoss = (formData.estimated_loss_building || 0) + (formData.estimated_loss_content || 0);
  
  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div></div>;
  }
  
  return (
    <div className="space-y-6">
      {/* Données propriétaire */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          👤 Informations du propriétaire / sinistré
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Nom complet *</Label>
            <Input 
              value={formData.owner_name}
              onChange={(e) => setFormData({...formData, owner_name: e.target.value})}
              placeholder="Nom du propriétaire"
              disabled={!canEdit}
            />
          </div>
          <div>
            <Label>Téléphone</Label>
            <Input 
              type="tel"
              value={formData.owner_phone}
              onChange={(e) => setFormData({...formData, owner_phone: e.target.value})}
              placeholder="(XXX) XXX-XXXX"
              disabled={!canEdit}
            />
          </div>
          <div>
            <Label>Courriel</Label>
            <Input 
              type="email"
              value={formData.owner_email}
              onChange={(e) => setFormData({...formData, owner_email: e.target.value})}
              placeholder="courriel@exemple.com"
              disabled={!canEdit}
            />
          </div>
          <div>
            <Label>Adresse de correspondance</Label>
            <Input 
              value={formData.owner_address}
              onChange={(e) => setFormData({...formData, owner_address: e.target.value})}
              placeholder="Adresse si différente du lieu du sinistre"
              disabled={!canEdit}
            />
          </div>
        </div>
      </div>
      
      {/* Données assurance */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-blue-800 flex items-center gap-2">
          🛡️ Informations d'assurance
          <span className="text-xs font-normal bg-blue-100 px-2 py-1 rounded">Crucial pour le rapport MSP</span>
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Compagnie d'assurance *</Label>
            <Input 
              value={formData.insurance_company}
              onChange={(e) => setFormData({...formData, insurance_company: e.target.value})}
              placeholder="Ex: Desjardins, Intact, La Capitale"
              disabled={!canEdit}
            />
          </div>
          <div>
            <Label>Numéro de police</Label>
            <Input 
              value={formData.policy_number}
              onChange={(e) => setFormData({...formData, policy_number: e.target.value})}
              placeholder="Numéro de la police d'assurance"
              disabled={!canEdit}
            />
          </div>
          <div>
            <Label>Courtier / Agent</Label>
            <Input 
              value={formData.insurance_broker}
              onChange={(e) => setFormData({...formData, insurance_broker: e.target.value})}
              placeholder="Nom du courtier"
              disabled={!canEdit}
            />
          </div>
          <div>
            <Label>Téléphone assurance</Label>
            <Input 
              type="tel"
              value={formData.insurance_phone}
              onChange={(e) => setFormData({...formData, insurance_phone: e.target.value})}
              placeholder="(XXX) XXX-XXXX"
              disabled={!canEdit}
            />
          </div>
        </div>
      </div>
      
      {/* Estimation des pertes */}
      <div className="bg-amber-50 rounded-lg border border-amber-200 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-amber-800 flex items-center gap-2">
          💰 Estimation des pertes
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Pertes - Bâtiment ($)</Label>
            <Input 
              type="number"
              min="0"
              step="1000"
              value={formData.estimated_loss_building}
              onChange={(e) => setFormData({...formData, estimated_loss_building: parseFloat(e.target.value) || 0})}
              placeholder="0"
              disabled={!canEdit}
            />
            <p className="text-xs text-gray-500 mt-1">Structure, toiture, murs, etc.</p>
          </div>
          <div>
            <Label>Pertes - Contenu ($)</Label>
            <Input 
              type="number"
              min="0"
              step="1000"
              value={formData.estimated_loss_content}
              onChange={(e) => setFormData({...formData, estimated_loss_content: parseFloat(e.target.value) || 0})}
              placeholder="0"
              disabled={!canEdit}
            />
            <p className="text-xs text-gray-500 mt-1">Meubles, électroménagers, biens personnels</p>
          </div>
        </div>
        
        {/* Total */}
        <div className="bg-white rounded-lg p-4 flex justify-between items-center">
          <span className="font-medium text-gray-700">Total estimé des pertes:</span>
          <span className="text-2xl font-bold text-amber-700">{formatCurrency(totalLoss)}</span>
        </div>
        
        <div>
          <Label>Notes sur les pertes</Label>
          <textarea
            value={formData.loss_notes}
            onChange={(e) => setFormData({...formData, loss_notes: e.target.value})}
            disabled={!canEdit}
            rows={3}
            className="w-full p-2 border rounded-md resize-none"
            placeholder="Détails supplémentaires sur les dommages observés..."
          />
        </div>
      </div>
      
      {/* Bouton sauvegarder */}
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Enregistrement...' : '💾 Enregistrer les données du sinistré'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default SectionSinistre;
