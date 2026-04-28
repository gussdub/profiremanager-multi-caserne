import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { useTenant } from '../contexts/TenantContext';
import { apiGet, apiPost } from '../utils/api';

/**
 * Page Bibliothèque de Référentiels Globaux
 * Permet d'activer/désactiver les référentiels par tenant
 */
const BibliothequeReferentiels = () => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [referentiels, setReferentiels] = useState({ by_code: {}, all: [] });
  const [selectedRef, setSelectedRef] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newReglementForm, setNewReglementForm] = useState({
    code_source: '',
    article: '',
    titre: '',
    description: '',
    gravite: 'Majeure',
    delai_correction: 30,
    categorie: 'Municipal'
  });
  
  // Charger les référentiels
  useEffect(() => {
    if (tenantSlug) {
      loadReferentiels();
    }
  }, [tenantSlug]);
  
  const loadReferentiels = async () => {
    try {
      setLoading(true);
      console.log('🔍 Loading referentiels for tenant:', tenantSlug);
      const data = await apiGet(tenantSlug, '/prevention/referentiels-globaux');
      console.log('✅ Referentiels loaded:', data);
      setReferentiels(data);
    } catch (error) {
      console.error('❌ Erreur chargement référentiels:', error);
      toast({
        title: "Erreur",
        description: `Impossible de charger les référentiels: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Toggle un seul référentiel
  const toggleReferentiel = async (refId, currentActif) => {
    try {
      await apiPost(tenantSlug, `/prevention/referentiels-globaux/${refId}/toggle`, {
        actif: !currentActif
      });
      
      // Mettre à jour localement
      setReferentiels(prev => ({
        ...prev,
        all: prev.all.map(ref => 
          ref.id === refId ? { ...ref, actif: !currentActif } : ref
        ),
        by_code: Object.fromEntries(
          Object.entries(prev.by_code).map(([code, refs]) => [
            code,
            refs.map(ref => ref.id === refId ? { ...ref, actif: !currentActif } : ref)
          ])
        )
      }));
      
      toast({
        title: !currentActif ? "✅ Référentiel activé" : "☐ Référentiel désactivé",
        description: `${!currentActif ? 'Activé' : 'Désactivé'} avec succès`
      });
    } catch (error) {
      console.error('Erreur toggle:', error);
      toast({
        title: "Erreur",
        description: "Impossible de modifier le référentiel",
        variant: "destructive"
      });
    }
  };
  
  // Toggle tous les référentiels d'un code
  const toggleAllByCode = async (codeSource, actif) => {
    try {
      await apiPost(tenantSlug, '/prevention/referentiels-globaux/toggle-all', {
        code_source: codeSource,
        actif: actif
      });
      
      // Mettre à jour localement
      setReferentiels(prev => ({
        ...prev,
        all: prev.all.map(ref => 
          ref.code_source === codeSource ? { ...ref, actif } : ref
        ),
        by_code: {
          ...prev.by_code,
          [codeSource]: prev.by_code[codeSource].map(ref => ({ ...ref, actif }))
        }
      }));
      
      toast({
        title: actif ? "✅ Code activé" : "☐ Code désactivé",
        description: `${codeSource}: ${actif ? 'Tous les articles activés' : 'Tous les articles désactivés'}`
      });
    } catch (error) {
      console.error('Erreur toggle all:', error);
      toast({
        title: "Erreur",
        description: "Impossible de modifier les référentiels",
        variant: "destructive"
      });
    }
  };
  
  // Ouvrir modal de détails
  const openModal = (ref) => {
    setSelectedRef(ref);
    setShowModal(true);
  };
  
  // Créer un nouveau règlement municipal (custom)
  const handleCreateReglement = async () => {
    if (!newReglementForm.code_source || !newReglementForm.article || !newReglementForm.titre) {
      toast({
        title: "Validation",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive"
      });
      return;
    }
    
    try {
      // Pour l'instant, créer en tant que référentiel custom du tenant
      // (Plus tard, on pourra ajouter l'option de créer un global partagé)
      const payload = {
        ...newReglementForm,
        global: false
      };
      
      await apiPost(tenantSlug, '/prevention/referentiels-custom', payload);
      
      toast({
        title: "✅ Règlement créé",
        description: "Votre règlement municipal a été ajouté avec succès"
      });
      
      setShowCreateModal(false);
      setNewReglementForm({
        code_source: '',
        article: '',
        titre: '',
        description: '',
        gravite: 'Majeure',
        delai_correction: 30,
        categorie: 'Municipal'
      });
      
      // Recharger les référentiels
      loadReferentiels();
    } catch (error) {
      console.error('Erreur création règlement:', error);
      toast({
        title: "Erreur",
        description: "Impossible de créer le règlement",
        variant: "destructive"
      });
    }
  };

  // Obtenir les codes sources uniques
  const codeSources = Object.keys(referentiels.by_code).sort();
  
  // Descriptions des abréviations
  const codeDescriptions = {
    'CNB-2005': 'Code National du Bâtiment - Canada 2005',
    'CNB-1995': 'Code National du Bâtiment - Canada 1995',
    'CNB-1990': 'Code National du Bâtiment - Canada 1990',
    'CNB-1985': 'Code National du Bâtiment - Canada 1985',
    'CNPI-2005': 'Code National de Prévention des Incendies - Canada 2005',
    'CNPI-1995': 'Code National de Prévention des Incendies - Canada 1995',
    'CEQ-2024': 'Code de l\'Électricité du Québec 2024 (Édition 2024)',
    'NFPA-10': 'NFPA 10 - Norme sur les extincteurs portatifs',
    'NFPA-13': 'NFPA 13 - Norme sur l\'installation des systèmes de gicleurs',
    'NFPA-25': 'NFPA 25 - Norme sur l\'inspection, l\'essai et l\'entretien des systèmes de protection incendie à base d\'eau',
    'NFPA-72': 'NFPA 72 - Code national des alarmes incendie et de signalisation',
    'NFPA-96': 'NFPA 96 - Norme sur le contrôle de la ventilation et la protection contre les incendies des opérations de cuisson commerciale',
    'NFPA-101': 'NFPA 101 - Code de sécurité humaine (Life Safety Code)',
    'NFPA-1': 'NFPA 1 - Code uniforme de prévention des incendies',
    'NFPA-30': 'NFPA 30 - Code des liquides inflammables et combustibles',
    'NFPA-54': 'NFPA 54 - Code national du gaz combustible',
    'NFPA-58': 'NFPA 58 - Code du gaz de pétrole liquéfié',
    'NFPA-110': 'NFPA 110 - Norme pour les systèmes d\'alimentation électrique de secours et de réserve',
    'S3-R4': 'Règlement sur la sécurité dans les édifices publics (Loi sur la sécurité dans les édifices publics - Québec)',
    'RVQ-2241': 'Règlement de la Ville de Québec R.V.Q. 2241 sur la prévention des incendies dans les maisons de chambres'
  };
  
  // Filtrer les codes selon la catégorie sélectionnée
  const getFilteredCodes = () => {
    if (filterCategory === 'all') return codeSources;
    
    const categoryMap = {
      'cnb': ['CNB-2005', 'CNB-1995', 'CNB-1990', 'CNB-1985'],
      'cnpi': ['CNPI-2005', 'CNPI-1995'],
      'nfpa': codeSources.filter(c => c.startsWith('NFPA-')),
      'electricite': ['CEQ-2024'],
      'municipal': ['S3-R4', 'RVQ-2241']
    };
    
    return categoryMap[filterCategory] || [];
  };
  
  const filteredCodes = getFilteredCodes();
  
  // Icônes par code
  const getCodeIcon = (code) => {
    if (code.startsWith('CNB')) return '🏗️';
    if (code.startsWith('CNPI')) return '🔥';
    if (code.startsWith('NFPA')) return '🧯';
    if (code.startsWith('CEQ')) return '⚡';
    if (code === 'S3-R4') return '🏛️';
    if (code === 'RVQ-2241') return '🏢';
    return '📋';
  };
  
  // Badge de gravité
  const renderGraviteBadge = (gravite) => {
    const colors = {
      'Majeure': 'bg-red-100 text-red-800 border-red-300',
      'Mineure': 'bg-yellow-100 text-yellow-800 border-yellow-300'
    };
    
    return (
      <span style={{
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: '600',
        border: '1px solid'
      }} className={colors[gravite] || 'bg-gray-100 text-gray-800 border-gray-300'}>
        {gravite}
      </span>
    );
  };
  
  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '1.25rem' }}>⏳ Chargement des référentiels...</div>
        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
          Tenant: {tenantSlug || 'Non défini'}
        </div>
      </div>
    );
  }
  
  // Afficher un message si pas de données ET pas d'erreur
  if (referentiels.total === 0 && !loading) {
    return (
      <div style={{ padding: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '1rem' }}>
          📚 Bibliothèque de Référentiels
        </h1>
        <div style={{ 
          padding: '2rem',
          backgroundColor: '#fef3c7',
          borderRadius: '12px',
          border: '1px solid #f59e0b'
        }}>
          <div style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
            ⚠️ Aucun référentiel trouvé
          </div>
          <div style={{ fontSize: '0.875rem', color: '#92400e' }}>
            Tenant actuel: <strong>{tenantSlug || 'Non défini'}</strong>
          </div>
          <div style={{ fontSize: '0.875rem', color: '#92400e', marginTop: '0.25rem' }}>
            Vérifiez la console navigateur (F12) pour plus de détails.
          </div>
          <Button
            onClick={loadReferentiels}
            style={{ marginTop: '1rem' }}
          >
            🔄 Réessayer
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>
          📚 Bibliothèque de Référentiels
        </h1>
        <p style={{ color: '#6b7280', fontSize: '1rem' }}>
          Gérez les codes et règlements utilisés pour vos inspections. 
          Total: <strong>{referentiels.total}</strong> articles disponibles.
        </p>
      </div>
      
      {/* Filtres */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        marginBottom: '2rem',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Button
            size="sm"
            variant={filterCategory === 'all' ? 'default' : 'outline'}
            onClick={() => setFilterCategory('all')}
          >
            📋 Tout
          </Button>
          <Button
            size="sm"
            variant={filterCategory === 'cnb' ? 'default' : 'outline'}
            onClick={() => setFilterCategory('cnb')}
          >
            🏗️ CNB
          </Button>
          <Button
            size="sm"
            variant={filterCategory === 'cnpi' ? 'default' : 'outline'}
            onClick={() => setFilterCategory('cnpi')}
          >
            🔥 CNPI
          </Button>
          <Button
            size="sm"
            variant={filterCategory === 'nfpa' ? 'default' : 'outline'}
            onClick={() => setFilterCategory('nfpa')}
          >
            🧯 NFPA
          </Button>
          <Button
            size="sm"
            variant={filterCategory === 'electricite' ? 'default' : 'outline'}
            onClick={() => setFilterCategory('electricite')}
          >
            ⚡ Électricité
          </Button>
          <Button
            size="sm"
            variant={filterCategory === 'municipal' ? 'default' : 'outline'}
            onClick={() => setFilterCategory('municipal')}
          >
            🏛️ Municipal
          </Button>
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Input
            placeholder="🔍 Rechercher un article..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '300px' }}
          />
          
          {/* Bouton Ajouter règlement municipal - Visible quand filtre Municipal */}
          {filterCategory === 'municipal' && (
            <Button
              onClick={() => setShowCreateModal(true)}
              style={{ backgroundColor: '#10b981', color: 'white', whiteSpace: 'nowrap' }}
            >
              ➕ Ajouter règlement municipal
            </Button>
          )}
        </div>
      </div>
      
      {/* Liste des codes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {filteredCodes.map(codeSource => {
          const refs = referentiels.by_code[codeSource] || [];
          const activeCount = refs.filter(r => r.actif).length;
          const allActive = activeCount === refs.length;
          
          // Filtrer par recherche
          const filteredRefs = searchQuery 
            ? refs.filter(r => 
                r.article.toLowerCase().includes(searchQuery.toLowerCase()) ||
                r.titre.toLowerCase().includes(searchQuery.toLowerCase()) ||
                r.description.toLowerCase().includes(searchQuery.toLowerCase())
              )
            : refs;
          
          if (filteredRefs.length === 0 && searchQuery) return null;
          
          return (
            <div
              key={codeSource}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '1.5rem',
                backgroundColor: '#ffffff'
              }}
            >
              {/* Header du code */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '1rem',
                paddingBottom: '1rem',
                borderBottom: '2px solid #f3f4f6'
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: '600', margin: 0 }}>
                      {getCodeIcon(codeSource)} {codeSource}
                    </h3>
                    {codeDescriptions[codeSource] && (
                      <span 
                        title={codeDescriptions[codeSource]}
                        style={{ 
                          cursor: 'help',
                          fontSize: '0.875rem',
                          color: '#6b7280',
                          backgroundColor: '#f3f4f6',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}
                      >
                        ℹ️
                      </span>
                    )}
                  </div>
                  {codeDescriptions[codeSource] && (
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>
                      {codeDescriptions[codeSource]}
                    </p>
                  )}
                  <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {activeCount} / {refs.length} articles activés
                  </p>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  {!allActive && (
                    <Button
                      size="sm"
                      onClick={() => toggleAllByCode(codeSource, true)}
                    >
                      ✅ Activer tout
                    </Button>
                  )}
                  {allActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleAllByCode(codeSource, false)}
                    >
                      ☐ Désactiver tout
                    </Button>
                  )}
                </div>
              </div>
              
              {/* Liste des articles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {filteredRefs.map(ref => (
                  <div
                    key={ref.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '1rem',
                      padding: '0.75rem',
                      backgroundColor: ref.actif ? '#f9fafb' : '#fef3c7',
                      borderRadius: '8px',
                      border: `1px solid ${ref.actif ? '#e5e7eb' : '#fbbf24'}`,
                      transition: 'all 0.2s'
                    }}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={ref.actif}
                      onChange={() => toggleReferentiel(ref.id, ref.actif)}
                      style={{
                        marginTop: '0.25rem',
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer'
                      }}
                    />
                    
                    {/* Contenu */}
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '1rem'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            marginBottom: '0.25rem'
                          }}>
                            <span style={{ 
                              fontWeight: '600',
                              fontSize: '0.875rem',
                              color: '#1f2937'
                            }}>
                              {ref.article}
                            </span>
                            {renderGraviteBadge(ref.gravite)}
                            {ref.frequence_utilisation > 0 && (
                              <span style={{
                                fontSize: '0.75rem',
                                color: '#6b7280',
                                backgroundColor: '#eff6ff',
                                padding: '2px 6px',
                                borderRadius: '8px'
                              }}>
                                📊 {ref.frequence_utilisation}×
                              </span>
                            )}
                          </div>
                          
                          <div style={{ 
                            fontSize: '0.875rem',
                            color: '#374151',
                            marginBottom: '0.25rem',
                            fontWeight: '500'
                          }}>
                            {ref.titre}
                          </div>
                          
                          <div style={{ 
                            fontSize: '0.75rem',
                            color: '#6b7280',
                            lineHeight: '1.4'
                          }}>
                            {ref.description.substring(0, 150)}
                            {ref.description.length > 150 && '...'}
                          </div>
                        </div>
                        
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openModal(ref)}
                        >
                          👁️ Détails
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        
        {filteredCodes.length === 0 && (
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem',
            color: '#6b7280'
          }}>
            Aucun référentiel trouvé pour cette catégorie.
          </div>
        )}
      </div>
      
      {/* Modal de détails */}
      {showModal && selectedRef && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              padding: '2rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '0.5rem'
              }}>
                <span style={{ fontSize: '2rem' }}>
                  {getCodeIcon(selectedRef.code_source)}
                </span>
                <div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {selectedRef.code_source}
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700' }}>
                    {selectedRef.article}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Titre */}
            <div style={{ marginBottom: '1.5rem' }}>
              <Label style={{ fontSize: '0.75rem', color: '#6b7280' }}>TITRE</Label>
              <div style={{ fontSize: '1.125rem', fontWeight: '600', marginTop: '0.25rem' }}>
                {selectedRef.titre}
              </div>
            </div>
            
            {/* Description */}
            <div style={{ marginBottom: '1.5rem' }}>
              <Label style={{ fontSize: '0.75rem', color: '#6b7280' }}>DESCRIPTION</Label>
              <div style={{ 
                fontSize: '0.875rem',
                lineHeight: '1.6',
                color: '#374151',
                marginTop: '0.5rem',
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderRadius: '8px'
              }}>
                {selectedRef.description}
              </div>
            </div>
            
            {/* Infos */}
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div>
                <Label style={{ fontSize: '0.75rem', color: '#6b7280' }}>GRAVITÉ</Label>
                <div style={{ marginTop: '0.5rem' }}>
                  {renderGraviteBadge(selectedRef.gravite)}
                </div>
              </div>
              
              <div>
                <Label style={{ fontSize: '0.75rem', color: '#6b7280' }}>DÉLAI DE CORRECTION</Label>
                <div style={{ fontSize: '0.875rem', fontWeight: '600', marginTop: '0.5rem' }}>
                  {selectedRef.delai_correction === 0 
                    ? 'Immédiat' 
                    : `${selectedRef.delai_correction} jours`}
                </div>
              </div>
              
              <div>
                <Label style={{ fontSize: '0.75rem', color: '#6b7280' }}>CATÉGORIE</Label>
                <div style={{ fontSize: '0.875rem', fontWeight: '600', marginTop: '0.5rem' }}>
                  {selectedRef.categorie}
                </div>
              </div>
              
              <div>
                <Label style={{ fontSize: '0.75rem', color: '#6b7280' }}>FRÉQUENCE D'UTILISATION</Label>
                <div style={{ fontSize: '0.875rem', fontWeight: '600', marginTop: '0.5rem' }}>
                  📊 {selectedRef.frequence_utilisation || 0} fois
                </div>
              </div>
            </div>
            
            {/* Statut */}
            <div style={{ 
              padding: '1rem',
              backgroundColor: selectedRef.actif ? '#d1fae5' : '#fef3c7',
              borderRadius: '8px',
              marginBottom: '1.5rem'
            }}>
              <div style={{ 
                fontSize: '0.875rem',
                color: selectedRef.actif ? '#065f46' : '#92400e',
                fontWeight: '600'
              }}>
                {selectedRef.actif ? '✅ Activé pour votre organisation' : '☐ Désactivé pour votre organisation'}
              </div>
            </div>
            
            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button
                variant="outline"
                onClick={() => setShowModal(false)}
              >
                Fermer
              </Button>
              <Button
                onClick={() => {
                  toggleReferentiel(selectedRef.id, selectedRef.actif);
                  setShowModal(false);
                }}
              >
                {selectedRef.actif ? 'Désactiver' : 'Activer'}
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de création de règlement municipal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              maxWidth: '700px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '2rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>
              ➕ Ajouter un Règlement Municipal
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Code source */}
              <div>
                <Label>Code source *</Label>
                <Input
                  value={newReglementForm.code_source}
                  onChange={(e) => setNewReglementForm({...newReglementForm, code_source: e.target.value})}
                  placeholder="Ex: MUNICIPAL-MONTRÉAL, MUNICIPAL-GATINEAU"
                  style={{ marginTop: '0.25rem' }}
                />
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  💡 Format recommandé: MUNICIPAL-[NOM_VILLE]
                </div>
              </div>
              
              {/* Article */}
              <div>
                <Label>Article / Numéro *</Label>
                <Input
                  value={newReglementForm.article}
                  onChange={(e) => setNewReglementForm({...newReglementForm, article: e.target.value})}
                  placeholder="Ex: Art. 42, Règl. 2024-15"
                  style={{ marginTop: '0.25rem' }}
                />
              </div>
              
              {/* Titre */}
              <div>
                <Label>Titre *</Label>
                <Input
                  value={newReglementForm.titre}
                  onChange={(e) => setNewReglementForm({...newReglementForm, titre: e.target.value})}
                  placeholder="Ex: Détecteurs de fumée obligatoires"
                  style={{ marginTop: '0.25rem' }}
                />
              </div>
              
              {/* Description */}
              <div>
                <Label>Description</Label>
                <textarea
                  value={newReglementForm.description}
                  onChange={(e) => setNewReglementForm({...newReglementForm, description: e.target.value})}
                  placeholder="Description complète du règlement..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem',
                    marginTop: '0.25rem',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* Gravité */}
                <div>
                  <Label>Gravité</Label>
                  <select
                    value={newReglementForm.gravite}
                    onChange={(e) => setNewReglementForm({...newReglementForm, gravite: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      fontSize: '0.875rem',
                      marginTop: '0.25rem'
                    }}
                  >
                    <option value="Majeure">Majeure</option>
                    <option value="Mineure">Mineure</option>
                  </select>
                </div>
                
                {/* Délai correction */}
                <div>
                  <Label>Délai de correction (jours)</Label>
                  <Input
                    type="number"
                    value={newReglementForm.delai_correction}
                    onChange={(e) => setNewReglementForm({...newReglementForm, delai_correction: parseInt(e.target.value) || 0})}
                    style={{ marginTop: '0.25rem' }}
                  />
                </div>
              </div>
              
              {/* Info */}
              <div style={{
                padding: '1rem',
                backgroundColor: '#eff6ff',
                borderRadius: '8px',
                fontSize: '0.875rem',
                color: '#1e40af'
              }}>
                <strong>ℹ️ Note:</strong> Ce règlement sera spécifique à votre organisation et n'apparaîtra pas dans les autres villes/municipalités.
              </div>
            </div>
            
            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <Button
                variant="outline"
                onClick={() => setShowCreateModal(false)}
              >
                Annuler
              </Button>
              <Button
                onClick={handleCreateReglement}
                style={{ backgroundColor: '#10b981', color: 'white' }}
              >
                ✅ Créer le règlement
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BibliothequeReferentiels;
