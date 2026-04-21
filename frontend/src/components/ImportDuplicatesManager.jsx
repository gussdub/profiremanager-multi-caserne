import React, { useState, useEffect, useCallback } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { AlertTriangle, CheckCircle, Replace, Merge, X, ChevronDown, ChevronUp, RefreshCw, Plus, ArrowRight, Minus } from 'lucide-react';

const API_BASE = process.env.REACT_APP_BACKEND_URL;

const ImportDuplicatesManager = ({ tenantSlug }) => {
  const { toast } = useToast();
  const [duplicates, setDuplicates] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [previewMode, setPreviewMode] = useState({}); // 'merge' | 'replace' | null pour chaque dup.id

  const getToken = () => localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  const API = `${API_BASE}/api/${tenantSlug}`;

  const fetchDuplicates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/import/duplicates?limit=50`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDuplicates(data.duplicates || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Erreur chargement doublons:', err);
    } finally {
      setLoading(false);
    }
  }, [API]);

  useEffect(() => { fetchDuplicates(); }, [fetchDuplicates]);

  const resolveDuplicate = async (dupId, action) => {
    setResolving(prev => ({ ...prev, [dupId]: action }));
    try {
      const res = await fetch(`${API}/import/duplicates/${dupId}/resolve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        toast({ title: actionLabel(action), description: data.message });
        setDuplicates(prev => prev.filter(d => d.id !== dupId));
        setTotal(prev => prev - 1);
        setPreviewMode(prev => ({ ...prev, [dupId]: null }));
      }
    } catch (err) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally {
      setResolving(prev => ({ ...prev, [dupId]: null }));
    }
  };

  const resolveAll = async (action) => {
    setResolving({ _all: action });
    try {
      const res = await fetch(`${API}/import/duplicates/resolve-all`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        toast({ title: `${data.resolved} doublon(s) résolus`, description: `Action: ${actionLabel(action)}` });
        fetchDuplicates();
      }
    } catch (err) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally {
      setResolving({});
    }
  };

  const actionLabel = (action) => {
    switch (action) {
      case 'merge': return 'Fusionné';
      case 'replace': return 'Remplacé';
      case 'ignore': return 'Ignoré';
      default: return action;
    }
  };

  const entityLabel = (type) => {
    const labels = {
      'Intervention': 'Intervention',
      'DossierAdresse': 'Bâtiment',
      'Prevention': 'Prévention',
      'RCCI': 'RCCI',
      'Employe': 'Employé',
      'BorneIncendie': 'Borne fontaine',
      'BorneSeche': 'Borne sèche',
      'PointEau': "Point d'eau",
      'Vehicule': 'Véhicule',
      'EquipExist': 'Équipement',
    };
    return labels[type] || type;
  };

  const getFieldLabel = (key) => {
    const labels = {
      // Interventions
      address_full: 'Adresse', municipality: 'Ville', type_intervention: 'Nature',
      code_feu: 'Code feu', xml_time_call_received: 'Date appel',
      officer_in_charge_xml: 'Officier', caserne: 'Caserne', notes: 'Notes',
      caller_name: 'Appelant', caller_phone: 'Tél. appelant',
      // Bâtiments
      adresse_civique: 'Adresse', ville: 'Ville', nom_etablissement: 'Établissement',
      cadastre_matricule: 'Cadastre', annee_construction: 'Année construction',
      nombre_etages: 'Étages', proprietaire_nom: 'Propriétaire',
      // Personnel
      nom: 'Nom', prenom: 'Prénom', matricule: 'Matricule', email: 'Email',
      telephone: 'Téléphone', grade: 'Grade', date_embauche: 'Date embauche',
      // Équipements
      numero_serie: 'N° série', description: 'Description', type: 'Type',
    };
    return labels[key] || key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  };

  const summarizeExisting = (dup) => {
    const d = dup.existing_data || {};
    if (dup.entity_type === 'Intervention') {
      return `${d.external_call_id || '?'} — ${d.address_full || '?'}, ${d.municipality || '?'}`;
    }
    if (dup.entity_type === 'DossierAdresse') {
      return `${d.nom_etablissement || d.adresse_civique || '?'}, ${d.ville || '?'}`;
    }
    if (dup.entity_type === 'Employe') {
      return `${d.prenom || ''} ${d.nom || ''} (${d.matricule || '?'})`;
    }
    return d.nom || d.external_id || d.matricule || d.numero_serie || JSON.stringify(d).substring(0, 60);
  };

  // Récupère les champs pertinents selon le type d'entité
  const getKeysToCompare = (entityType) => {
    switch (entityType) {
      case 'Intervention':
        return ['address_full', 'municipality', 'type_intervention', 'code_feu', 'xml_time_call_received', 'officer_in_charge_xml', 'caserne', 'notes', 'caller_name', 'caller_phone'];
      case 'DossierAdresse':
        return ['adresse_civique', 'ville', 'nom_etablissement', 'cadastre_matricule', 'annee_construction', 'nombre_etages', 'proprietaire_nom', 'code_postal'];
      case 'Employe':
        return ['nom', 'prenom', 'matricule', 'email', 'telephone', 'grade', 'date_embauche', 'adresse', 'ville'];
      case 'Prevention':
        return ['adresse', 'ville', 'date_inspection', 'inspecteur', 'resultat', 'notes'];
      default:
        return ['nom', 'description', 'adresse', 'ville', 'type'];
    }
  };

  // Extrait une valeur depuis le nouveau record (avec deep paths pour PFM)
  const extractNewValue = (newRec, key, entityType) => {
    if (newRec[key]) return newRec[key];
    
    if (entityType === 'Intervention') {
      const lieu = newRec.lieu_interv || {};
      const chrono = newRec.chronologie || {};
      const cr = newRec.compte_rendu || {};
      
      if (key === 'address_full') return lieu.desc_lieu || '';
      if (key === 'municipality') return lieu.ville || '';
      if (key === 'xml_time_call_received') return chrono.appel || newRec.date_activite || '';
      if (key === 'notes') return typeof cr === 'object' ? cr.description : (cr || '');
    }
    
    if (entityType === 'DossierAdresse') {
      const adresse = newRec.adresse?.adresse || newRec.adresse || {};
      if (key === 'adresse_civique' && typeof adresse === 'object') {
        return `${adresse.no_civ || ''} ${adresse.type_rue || ''} ${adresse.rue || ''}`.trim();
      }
      if (key === 'ville' && typeof adresse === 'object') return adresse.ville || '';
      if (key === 'code_postal' && typeof adresse === 'object') return adresse.code_post || '';
    }
    
    if (entityType === 'Employe') {
      // Parser l'adresse depuis l'objet PFM
      if (key === 'adresse') {
        const adresse = newRec.adresse?.adresse || newRec.adresse || {};
        if (typeof adresse === 'object' && (adresse.no_civ || adresse.rue)) {
          return `${adresse.no_civ || ''} ${adresse.type_rue || ''} ${adresse.rue || ''}`.trim();
        }
      }
      if (key === 'ville') {
        const adresse = newRec.adresse?.adresse || newRec.adresse || {};
        if (typeof adresse === 'object') return adresse.ville || '';
      }
    }
    
    return '';
  };

  // Formate une valeur pour l'affichage (dates, objets, etc.)
  const formatValue = (val, key) => {
    if (val == null || val === '') return '';
    
    // Si c'est un objet adresse, le parser
    if (typeof val === 'object') {
      // Adresse PFM format: {adresse: {no_civ, type_rue, rue, ville, code_post}}
      const adresse = val.adresse || val;
      if (adresse.no_civ || adresse.rue) {
        const parts = [
          adresse.no_civ,
          adresse.type_rue,
          adresse.rue
        ].filter(Boolean).join(' ');
        if (adresse.ville) {
          return `${parts}, ${adresse.ville}`.trim();
        }
        return parts;
      }
      return JSON.stringify(val);
    }
    
    // Si c'est une date avec T00:00:00, la raccourcir
    if (typeof val === 'string') {
      // Format ISO avec temps à minuit -> garder juste la date
      if (/^\d{4}-\d{2}-\d{2}T00:00:00/.test(val)) {
        return val.substring(0, 10);
      }
      // Format ISO complet -> garder juste la date
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
        return val.substring(0, 10);
      }
    }
    
    return String(val);
  };

  // Compare les données et retourne les champs avec leur statut
  const getComparisonData = (dup) => {
    const existing = dup.existing_data || {};
    const newRec = dup.new_record || {};
    const keysToCompare = getKeysToCompare(dup.entity_type);
    const fields = [];

    for (const key of keysToCompare) {
      const oldVal = existing[key];
      const newVal = extractNewValue(newRec, key, dup.entity_type) || newRec[key];
      
      // Formater les valeurs pour l'affichage
      const oldStr = formatValue(oldVal, key);
      const newStr = formatValue(newVal, key);
      
      // Comparer les valeurs formatées (pas les objets bruts)
      let changeType = 'unchanged';
      if (oldStr && !newStr) changeType = 'removed';
      else if (!oldStr && newStr) changeType = 'added';
      else if (oldStr !== newStr && newStr) changeType = 'modified';
      
      // Calculer le résultat de fusion (garde existant si présent, sinon prend nouveau)
      const mergeResult = oldStr || newStr;
      
      fields.push({
        key,
        label: getFieldLabel(key),
        existing: oldStr || '—',
        new: newStr || '—',
        mergeResult: mergeResult || '—',
        replaceResult: newStr || oldStr || '—',
        changeType,
        willChange: changeType !== 'unchanged'
      });
    }
    
    return fields;
  };

  // Compte les changements pour chaque action
  const countChanges = (fields, action) => {
    if (action === 'merge') {
      return fields.filter(f => !f.existing || f.existing === '—').filter(f => f.new && f.new !== '—').length;
    }
    if (action === 'replace') {
      return fields.filter(f => f.changeType === 'modified' || f.changeType === 'added').length;
    }
    return 0;
  };

  if (loading) {
    return <div className="flex items-center gap-2 py-8 justify-center text-gray-500"><RefreshCw className="animate-spin" size={18} /> Chargement...</div>;
  }

  if (total === 0) {
    return (
      <div className="text-center py-12" data-testid="no-duplicates">
        <CheckCircle size={48} className="mx-auto mb-3 text-green-500" />
        <h3 className="text-lg font-semibold text-gray-700">Aucun doublon en attente</h3>
        <p className="text-sm text-gray-500 mt-1">Tous les imports sont à jour.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="duplicates-manager">
      {/* Header avec actions groupées */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={20} className="text-amber-500" />
          <h3 className="text-lg font-semibold">{total} doublon(s) en attente</h3>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => resolveAll('merge')} disabled={!!resolving._all}
            className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
            data-testid="resolve-all-merge">
            {resolving._all === 'merge' ? <RefreshCw className="animate-spin mr-1" size={14} /> : <Merge size={14} className="mr-1" />}
            Tout fusionner
          </Button>
          <Button size="sm" variant="outline" onClick={() => resolveAll('replace')} disabled={!!resolving._all}
            className="text-blue-600 border-blue-200 hover:bg-blue-50"
            data-testid="resolve-all-replace">
            {resolving._all === 'replace' ? <RefreshCw className="animate-spin mr-1" size={14} /> : <Replace size={14} className="mr-1" />}
            Tout remplacer
          </Button>
          <Button size="sm" variant="ghost" onClick={() => resolveAll('ignore')} disabled={!!resolving._all}
            className="text-gray-500" data-testid="resolve-all-ignore">
            Tout ignorer
          </Button>
        </div>
      </div>

      {/* Liste des doublons */}
      {duplicates.map(dup => {
        const isExpanded = expandedId === dup.id;
        const isResolving = resolving[dup.id];
        const currentPreview = previewMode[dup.id];
        const comparisonFields = getComparisonData(dup);
        const mergeChanges = countChanges(comparisonFields, 'merge');
        const replaceChanges = countChanges(comparisonFields, 'replace');

        return (
          <Card key={dup.id} className="overflow-hidden" data-testid={`duplicate-${dup.id}`}>
            {/* En-tête compact */}
            <div className="p-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50"
                 onClick={() => setExpandedId(isExpanded ? null : dup.id)}>
              <div className="flex-shrink-0">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                  {entityLabel(dup.entity_type)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{summarizeExisting(dup)}</p>
                <p className="text-xs text-gray-500">{new Date(dup.created_at).toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                  onClick={(e) => { e.stopPropagation(); resolveDuplicate(dup.id, 'merge'); }}
                  disabled={!!isResolving} data-testid={`merge-${dup.id}`}>
                  {isResolving === 'merge' ? <RefreshCw className="animate-spin" size={14} /> : <>Fusionner {mergeChanges > 0 && <span className="ml-1 text-xs bg-emerald-100 px-1.5 rounded">+{mergeChanges}</span>}</>}
                </Button>
                <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={(e) => { e.stopPropagation(); resolveDuplicate(dup.id, 'replace'); }}
                  disabled={!!isResolving} data-testid={`replace-${dup.id}`}>
                  {isResolving === 'replace' ? <RefreshCw className="animate-spin" size={14} /> : <>Remplacer {replaceChanges > 0 && <span className="ml-1 text-xs bg-blue-100 px-1.5 rounded">{replaceChanges}</span>}</>}
                </Button>
                <Button size="sm" variant="ghost" className="text-gray-400 hover:text-gray-600"
                  onClick={(e) => { e.stopPropagation(); resolveDuplicate(dup.id, 'ignore'); }}
                  disabled={!!isResolving} data-testid={`ignore-${dup.id}`}>
                  {isResolving === 'ignore' ? <RefreshCw className="animate-spin" size={14} /> : <X size={16} />}
                </Button>
                {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </div>
            </div>

            {/* Détail comparatif (déplié) */}
            {isExpanded && (
              <div className="border-t bg-gray-50 p-4">
                {/* Onglets de prévisualisation */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setPreviewMode(prev => ({ ...prev, [dup.id]: currentPreview === 'merge' ? null : 'merge' }))}
                    data-testid={`preview-merge-${dup.id}`}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                      currentPreview === 'merge' 
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' 
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Merge size={14} /> Prévisualiser fusion
                  </button>
                  <button
                    onClick={() => setPreviewMode(prev => ({ ...prev, [dup.id]: currentPreview === 'replace' ? null : 'replace' }))}
                    data-testid={`preview-replace-${dup.id}`}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                      currentPreview === 'replace' 
                        ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Replace size={14} /> Prévisualiser remplacement
                  </button>
                </div>

                {/* Tableau de comparaison */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="pb-2 pr-3 font-semibold text-gray-600 w-[15%]">Champ</th>
                        <th className="pb-2 pr-3 font-semibold text-gray-600 w-[28%]">
                          <span className="flex items-center gap-1">Existant</span>
                        </th>
                        <th className="pb-2 pr-3 font-semibold text-gray-600 w-[28%]">
                          <span className="flex items-center gap-1">Nouveau (import)</span>
                        </th>
                        {currentPreview && (
                          <th className="pb-2 font-semibold w-[29%]" style={{ color: currentPreview === 'merge' ? '#059669' : '#2563eb' }}>
                            <span className="flex items-center gap-1">
                              <ArrowRight size={14} /> Résultat {currentPreview === 'merge' ? 'fusion' : 'remplacement'}
                            </span>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonFields.map(({ key, label, existing, new: newVal, mergeResult, replaceResult, changeType, willChange }) => {
                        const result = currentPreview === 'merge' ? mergeResult : replaceResult;
                        const isAddition = changeType === 'added';
                        const isModification = changeType === 'modified';
                        const isRemoval = changeType === 'removed';
                        
                        // Déterminer si cette ligne sera affectée par l'action choisie
                        const willBeAffected = currentPreview === 'merge' 
                          ? (existing === '—' && newVal !== '—') // Fusion n'ajoute que si existant vide
                          : (changeType !== 'unchanged'); // Remplacement change tout ce qui diffère
                        
                        return (
                          <tr key={key} className={`border-b border-gray-100 ${willBeAffected && currentPreview ? (currentPreview === 'merge' ? 'bg-emerald-50/50' : 'bg-blue-50/50') : ''}`}>
                            <td className="py-2 pr-3 text-gray-700 font-medium text-xs">{label}</td>
                            <td className={`py-2 pr-3 text-xs break-words ${currentPreview === 'replace' && isModification ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                              {existing}
                            </td>
                            <td className="py-2 pr-3 text-xs break-words">
                              <span className={`${isAddition ? 'text-emerald-600 font-medium' : isModification ? 'text-blue-600 font-medium' : 'text-gray-700'}`}>
                                {newVal}
                              </span>
                              {isAddition && <Plus size={12} className="inline ml-1 text-emerald-500" />}
                              {isModification && <span className="ml-1 text-xs text-blue-500">(modifié)</span>}
                            </td>
                            {currentPreview && (
                              <td className={`py-2 text-xs break-words font-medium ${
                                willBeAffected 
                                  ? (currentPreview === 'merge' ? 'text-emerald-700 bg-emerald-100/50' : 'text-blue-700 bg-blue-100/50')
                                  : 'text-gray-600'
                              }`}>
                                {result}
                                {willBeAffected && currentPreview === 'merge' && existing === '—' && (
                                  <span className="ml-1 text-emerald-500 text-xs">(ajouté)</span>
                                )}
                                {willBeAffected && currentPreview === 'replace' && isModification && (
                                  <span className="ml-1 text-blue-500 text-xs">(remplacé)</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Légende */}
                <div className="mt-4 p-3 bg-white rounded-lg border text-xs text-gray-600 space-y-1">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="flex items-center gap-1"><Merge size={12} className="text-emerald-600" /> <strong>Fusionner</strong> = Garde les données existantes, ajoute les nouvelles uniquement si le champ est vide</span>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="flex items-center gap-1"><Replace size={12} className="text-blue-600" /> <strong>Remplacer</strong> = Écrase toutes les données existantes avec les nouvelles valeurs</span>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="flex items-center gap-1"><X size={12} className="text-gray-500" /> <strong>Ignorer</strong> = Aucune modification, le doublon est supprimé de la file</span>
                  </div>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default ImportDuplicatesManager;
