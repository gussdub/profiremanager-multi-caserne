import React, { useState, useEffect, useCallback } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { AlertTriangle, CheckCircle, Replace, Merge, X, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

const API_BASE = process.env.REACT_APP_BACKEND_URL;

const ImportDuplicatesManager = ({ tenantSlug }) => {
  const { toast } = useToast();
  const [duplicates, setDuplicates] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState({});
  const [expandedId, setExpandedId] = useState(null);

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
      case 'merge': return 'Fusionner';
      case 'replace': return 'Remplacer';
      case 'ignore': return 'Ignorer';
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
    };
    return labels[type] || type;
  };

  const getFieldLabel = (key) => {
    const labels = {
      address_full: 'Adresse', municipality: 'Ville', type_intervention: 'Nature',
      code_feu: 'Code feu', xml_time_call_received: 'Date appel',
      officer_in_charge_xml: 'Officier', caserne: 'Caserne', notes: 'Notes',
      caller_name: 'Appelant', caller_phone: 'Tél. appelant',
      adresse_civique: 'Adresse', ville: 'Ville', nom_etablissement: 'Établissement',
      nom: 'Nom', prenom: 'Prénom', matricule: 'Matricule',
    };
    return labels[key] || key;
  };

  const summarizeExisting = (dup) => {
    const d = dup.existing_data || {};
    if (dup.entity_type === 'Intervention') {
      return `${d.external_call_id || '?'} — ${d.address_full || '?'}, ${d.municipality || '?'}`;
    }
    if (dup.entity_type === 'DossierAdresse') {
      return `${d.adresse_civique || '?'}, ${d.ville || '?'}`;
    }
    return d.nom || d.external_id || d.matricule || JSON.stringify(d).substring(0, 60);
  };

  const getComparisonFields = (dup) => {
    const existing = dup.existing_data || {};
    const newRec = dup.new_record || {};
    const fields = [];
    const keysToCompare = dup.entity_type === 'Intervention'
      ? ['address_full', 'municipality', 'type_intervention', 'code_feu', 'xml_time_call_received', 'officer_in_charge_xml', 'caserne', 'notes', 'caller_name']
      : dup.entity_type === 'DossierAdresse'
      ? ['adresse_civique', 'ville', 'nom_etablissement', 'annee_construction', 'nombre_etages']
      : ['nom', 'prenom', 'matricule', 'adresse', 'ville'];

    for (const key of keysToCompare) {
      const oldVal = existing[key] || '';
      // Pour le nouveau, chercher dans le record brut avec deep paths
      let newVal = newRec[key] || '';
      if (!newVal && dup.entity_type === 'Intervention') {
        const lieu = newRec.lieu_interv || {};
        if (key === 'address_full') newVal = lieu.desc_lieu || '';
        if (key === 'municipality') newVal = lieu.ville || '';
        const chrono = newRec.chronologie || {};
        if (key === 'xml_time_call_received') newVal = chrono.appel || newRec.date_activite || '';
        const cr = newRec.compte_rendu || {};
        if (key === 'notes') newVal = (typeof cr === 'object' ? cr.description : cr) || '';
      }
      const oldStr = typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal || '-');
      const newStr = typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal || '-');
      const changed = oldStr !== newStr && newStr !== '-';
      fields.push({ key, label: getFieldLabel(key), old: oldStr.substring(0, 100), new: newStr.substring(0, 100), changed });
    }
    return fields;
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
            data-testid="resolve-all-merge">
            {resolving._all === 'merge' ? <RefreshCw className="animate-spin mr-1" size={14} /> : null}
            Tout fusionner
          </Button>
          <Button size="sm" variant="outline" onClick={() => resolveAll('replace')} disabled={!!resolving._all}
            data-testid="resolve-all-replace">
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
                  {isResolving === 'merge' ? <RefreshCw className="animate-spin" size={14} /> : 'Fusionner'}
                </Button>
                <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={(e) => { e.stopPropagation(); resolveDuplicate(dup.id, 'replace'); }}
                  disabled={!!isResolving} data-testid={`replace-${dup.id}`}>
                  {isResolving === 'replace' ? <RefreshCw className="animate-spin" size={14} /> : 'Remplacer'}
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
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="pb-2 pr-3 font-medium text-gray-500 w-1/5">Champ</th>
                      <th className="pb-2 pr-3 font-medium text-gray-500 w-2/5">Existant</th>
                      <th className="pb-2 font-medium text-gray-500 w-2/5">Nouveau</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getComparisonFields(dup).map(({ key, label, old: oldVal, new: newVal, changed }) => (
                      <tr key={key} className={changed ? 'bg-amber-50' : ''}>
                        <td className="py-1.5 pr-3 text-gray-600 font-medium text-xs">{label}</td>
                        <td className="py-1.5 pr-3 text-gray-700 text-xs break-all">{oldVal}</td>
                        <td className={`py-1.5 text-xs break-all ${changed ? 'text-amber-700 font-medium' : 'text-gray-700'}`}>
                          {newVal}
                          {changed && <span className="ml-1 text-amber-500">(modifié)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 p-2 bg-white rounded border text-xs text-gray-500">
                  <strong>Fusionner</strong> = garde les données existantes, ajoute les nouvelles si un champ est vide &nbsp;|&nbsp;
                  <strong>Remplacer</strong> = écrase tout avec les nouvelles données &nbsp;|&nbsp;
                  <strong>Ignorer</strong> = aucune modification
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
