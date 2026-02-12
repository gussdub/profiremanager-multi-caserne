import React, { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.jsx";
import { Checkbox } from "./ui/checkbox.jsx";
import { 
  FileText, AlertTriangle, Clock, Download, Send, User, Building2,
  Calendar, CheckCircle2, XCircle, Plus, Trash2, RefreshCw, Eye
} from "lucide-react";
import { apiGet, apiPost, apiPut } from "../utils/api";

/**
 * GenerateAvisModal - Modal de génération d'avis de non-conformité
 */
const GenerateAvisModal = ({ 
  show, 
  onClose, 
  inspection, 
  batiment, 
  tenantSlug, 
  toast,
  onAvisGenerated 
}) => {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refViolations, setRefViolations] = useState([]);
  const [selectedViolations, setSelectedViolations] = useState([]);
  const [destinataireType, setDestinataireType] = useState("proprietaire");
  const [notes, setNotes] = useState("");
  const [categories, setCategories] = useState([]);
  const [filterCategorie, setFilterCategorie] = useState("");
  
  // Charger le référentiel
  const loadRefViolations = useCallback(async () => {
    try {
      setLoading(true);
      const [violationsData, categoriesData] = await Promise.all([
        apiGet(tenantSlug, "/prevention/ref-violations"),
        apiGet(tenantSlug, "/prevention/ref-violations/categories").catch(() => [])
      ]);
      setRefViolations(violationsData || []);
      setCategories(categoriesData || []);
    } catch (error) {
      console.error("Erreur chargement référentiel:", error);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    if (show) {
      loadRefViolations();
      setSelectedViolations([]);
      setNotes("");
      setDestinataireType("proprietaire");
    }
  }, [show, loadRefViolations]);

  // Ajouter une violation
  const addViolation = (ref) => {
    if (selectedViolations.find(v => v.ref_violation_id === ref.id)) {
      return; // Déjà ajoutée
    }
    
    setSelectedViolations(prev => [...prev, {
      ref_violation_id: ref.id,
      code_article: ref.code_article,
      description: ref.description_standard,
      delai_jours: ref.delai_jours,
      severite: ref.severite,
      notes: ""
    }]);
  };

  // Retirer une violation
  const removeViolation = (refId) => {
    setSelectedViolations(prev => prev.filter(v => v.ref_violation_id !== refId));
  };

  // Modifier les notes d'une violation
  const updateViolationNotes = (refId, notes) => {
    setSelectedViolations(prev => prev.map(v => 
      v.ref_violation_id === refId ? { ...v, notes } : v
    ));
  };

  // Modifier la description personnalisée
  const updateViolationDescription = (refId, description) => {
    setSelectedViolations(prev => prev.map(v => 
      v.ref_violation_id === refId ? { ...v, description } : v
    ));
  };

  // Calculer la date limite
  const calculateDateLimite = (delaiJours) => {
    if (!inspection?.date_inspection) return "N/A";
    const dateInsp = new Date(inspection.date_inspection);
    dateInsp.setDate(dateInsp.getDate() + delaiJours);
    return dateInsp.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  // Générer l'avis
  const handleGenerate = async () => {
    if (selectedViolations.length === 0) {
      toast({
        title: "Erreur",
        description: "Sélectionnez au moins une violation",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setGenerating(true);
      
      const result = await apiPost(tenantSlug, `/prevention/inspections/${inspection.id}/generer-avis`, {
        violations: selectedViolations,
        destinataire_type: destinataireType,
        notes
      });
      
      toast({
        title: "Avis généré",
        description: `L'avis ${result.avis.numero_avis} a été créé avec succès`
      });
      
      if (onAvisGenerated) {
        onAvisGenerated(result.avis);
      }
      
      onClose();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de générer l'avis",
        variant: "destructive"
      });
    } finally {
      setGenerating(false);
    }
  };

  // Obtenir la couleur de sévérité
  const getSeveriteColor = (severite) => {
    const colors = {
      urgente: "#dc2626",
      majeure: "#f97316",
      mineure: "#eab308"
    };
    return colors[severite] || "#6b7280";
  };

  // Obtenir les infos du destinataire
  const getDestinataire = () => {
    if (!batiment) return { nom: "", adresse: "" };
    
    if (destinataireType === "gestionnaire") {
      return {
        nom: `${batiment.gestionnaire_prenom || ""} ${batiment.gestionnaire_nom || ""}`.trim() || "Gestionnaire",
        adresse: batiment.gestionnaire_adresse || batiment.adresse_civique || "",
        ville: batiment.gestionnaire_ville || batiment.ville || "",
        courriel: batiment.gestionnaire_courriel || ""
      };
    }
    
    return {
      nom: `${batiment.proprietaire_prenom || ""} ${batiment.proprietaire_nom || ""}`.trim() || "Propriétaire",
      adresse: batiment.proprietaire_adresse || batiment.adresse_civique || "",
      ville: batiment.proprietaire_ville || batiment.ville || "",
      courriel: batiment.proprietaire_courriel || ""
    };
  };

  const destinataire = getDestinataire();
  const filteredViolations = filterCategorie 
    ? refViolations.filter(v => v.categorie === filterCategorie)
    : refViolations;

  if (!show) return null;

  return (
    <Dialog open={show} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            Générer un avis de non-conformité
          </DialogTitle>
          <DialogDescription>
            Sélectionnez les violations constatées lors de l'inspection pour générer l'avis officiel
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            <span>Chargement du référentiel...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Informations de l'inspection */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <h4 className="font-semibold flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4" />
                  Bâtiment inspecté
                </h4>
                <p className="text-sm">{batiment?.nom_etablissement || "N/A"}</p>
                <p className="text-sm text-gray-600">{batiment?.adresse_civique}, {batiment?.ville}</p>
              </div>
              <div>
                <h4 className="font-semibold flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4" />
                  Date d'inspection
                </h4>
                <p className="text-sm">
                  {inspection?.date_inspection 
                    ? new Date(inspection.date_inspection).toLocaleDateString('fr-FR', { 
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
                      })
                    : "N/A"}
                </p>
              </div>
            </div>

            {/* Destinataire */}
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold flex items-center gap-2 mb-3">
                <User className="w-4 h-4" />
                Destinataire de l'avis
              </h4>
              <div className="flex gap-4 mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="destinataire"
                    checked={destinataireType === "proprietaire"}
                    onChange={() => setDestinataireType("proprietaire")}
                    className="w-4 h-4"
                  />
                  <span>Propriétaire</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="destinataire"
                    checked={destinataireType === "gestionnaire"}
                    onChange={() => setDestinataireType("gestionnaire")}
                    className="w-4 h-4"
                  />
                  <span>Gestionnaire</span>
                </label>
              </div>
              <div className="text-sm bg-blue-50 p-3 rounded">
                <p><strong>Nom:</strong> {destinataire.nom || "Non spécifié"}</p>
                <p><strong>Adresse:</strong> {destinataire.adresse || "Non spécifiée"}, {destinataire.ville}</p>
                {destinataire.courriel && <p><strong>Courriel:</strong> {destinataire.courriel}</p>}
              </div>
            </div>

            {/* Sélection des violations */}
            <div className="grid grid-cols-2 gap-4">
              {/* Référentiel */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold">Référentiel des infractions</h4>
                  <Select value={filterCategorie} onValueChange={setFilterCategorie}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Catégorie" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Toutes</SelectItem>
                      {categories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {refViolations.length === 0 ? (
                  <div className="text-center py-6 text-gray-500">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Aucun article dans le référentiel</p>
                    <p className="text-xs">Initialisez le référentiel dans les paramètres</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {filteredViolations.map(ref => {
                      const isSelected = selectedViolations.find(v => v.ref_violation_id === ref.id);
                      return (
                        <div
                          key={ref.id}
                          className={`p-2 rounded border cursor-pointer transition-all ${
                            isSelected 
                              ? 'bg-green-50 border-green-300' 
                              : 'hover:bg-gray-50 border-gray-200'
                          }`}
                          onClick={() => !isSelected && addViolation(ref)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span 
                                  className="font-mono text-xs px-1.5 py-0.5 rounded font-medium"
                                  style={{ 
                                    backgroundColor: getSeveriteColor(ref.severite) + '20',
                                    color: getSeveriteColor(ref.severite)
                                  }}
                                >
                                  {ref.code_article}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {ref.delai_jours}j
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 line-clamp-2">
                                {ref.description_standard}
                              </p>
                            </div>
                            {isSelected ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                            ) : (
                              <Plus className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Violations sélectionnées */}
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Violations à inclure ({selectedViolations.length})
                </h4>
                
                {selectedViolations.length === 0 ? (
                  <div className="text-center py-6 text-gray-500">
                    <XCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Aucune violation sélectionnée</p>
                    <p className="text-xs">Cliquez sur les articles à gauche pour les ajouter</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {selectedViolations.map(violation => (
                      <div
                        key={violation.ref_violation_id}
                        className="p-3 bg-red-50 border border-red-200 rounded-lg"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <span 
                            className="font-mono text-sm px-2 py-0.5 rounded font-bold"
                            style={{ 
                              backgroundColor: getSeveriteColor(violation.severite),
                              color: 'white'
                            }}
                          >
                            {violation.code_article}
                          </span>
                          <button
                            onClick={() => removeViolation(violation.ref_violation_id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <textarea
                          value={violation.description}
                          onChange={(e) => updateViolationDescription(violation.ref_violation_id, e.target.value)}
                          className="w-full text-xs p-2 border rounded mb-2 min-h-[60px]"
                          placeholder="Description (modifiable)"
                        />
                        
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 text-gray-600">
                            <Clock className="w-3 h-3" />
                            Échéance: <strong>{calculateDateLimite(violation.delai_jours)}</strong>
                          </span>
                          <span 
                            className="px-2 py-0.5 rounded uppercase font-bold"
                            style={{ 
                              color: getSeveriteColor(violation.severite)
                            }}
                          >
                            {violation.severite}
                          </span>
                        </div>
                        
                        <Input
                          value={violation.notes}
                          onChange={(e) => updateViolationNotes(violation.ref_violation_id, e.target.value)}
                          placeholder="Notes spécifiques (optionnel)"
                          className="text-xs mt-2"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Notes générales */}
            <div>
              <Label>Notes générales de l'avis (optionnel)</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observations supplémentaires, contexte particulier..."
                className="w-full min-h-[80px] p-3 border rounded-md text-sm mt-1"
              />
            </div>

            {/* Résumé */}
            {selectedViolations.length > 0 && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                  Résumé de l'avis
                </h4>
                <ul className="text-sm space-y-1">
                  <li>• <strong>{selectedViolations.length}</strong> violation(s) constatée(s)</li>
                  <li>
                    • Date d'échéance la plus proche: <strong>
                      {calculateDateLimite(Math.min(...selectedViolations.map(v => v.delai_jours)))}
                    </strong>
                  </li>
                  <li>
                    • Sévérité maximale: <strong style={{ color: getSeveriteColor(
                      selectedViolations.some(v => v.severite === 'urgente') ? 'urgente' :
                      selectedViolations.some(v => v.severite === 'majeure') ? 'majeure' : 'mineure'
                    ) }}>
                      {selectedViolations.some(v => v.severite === 'urgente') ? 'URGENTE' :
                       selectedViolations.some(v => v.severite === 'majeure') ? 'MAJEURE' : 'MINEURE'}
                    </strong>
                  </li>
                </ul>
                <p className="text-xs text-gray-600 mt-2">
                  ⚠️ La génération mettra automatiquement l'inspection en statut "En attente de réinspection" 
                  et créera une tâche de suivi.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button 
            onClick={handleGenerate} 
            disabled={generating || selectedViolations.length === 0}
            className="bg-red-600 hover:bg-red-700"
          >
            {generating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                Génération...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Générer l'avis ({selectedViolations.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


/**
 * ListeAvisNonConformite - Liste des avis générés
 */
const ListeAvisNonConformite = ({ tenantSlug, toast, batimentId = null }) => {
  const [loading, setLoading] = useState(true);
  const [avisList, setAvisList] = useState([]);
  const [selectedAvis, setSelectedAvis] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const loadAvis = useCallback(async () => {
    try {
      setLoading(true);
      let endpoint = "/prevention/avis-non-conformite";
      if (batimentId) {
        endpoint += `?batiment_id=${batimentId}`;
      }
      const data = await apiGet(tenantSlug, endpoint);
      setAvisList(data || []);
    } catch (error) {
      console.error("Erreur chargement avis:", error);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, batimentId]);

  useEffect(() => {
    loadAvis();
  }, [loadAvis]);

  const handleDownloadPdf = async (avisId, numeroAvis) => {
    try {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/prevention/avis-non-conformite/${avisId}/pdf`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem(`token_${tenantSlug}`)}`
          }
        }
      );
      
      if (!response.ok) throw new Error("Erreur téléchargement");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Utiliser iframe pour ouvrir la fenêtre d'impression
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        iframe.contentWindow.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          window.URL.revokeObjectURL(url);
        }, 1000);
      };
      
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de télécharger le PDF",
        variant: "destructive"
      });
    }
  };

  const getStatutBadge = (statut) => {
    const config = {
      genere: { label: "Généré", color: "#6b7280", bg: "#f3f4f6" },
      envoye: { label: "Envoyé", color: "#3b82f6", bg: "#eff6ff" },
      en_attente: { label: "En attente", color: "#f97316", bg: "#fff7ed" },
      cloture: { label: "Clôturé", color: "#10b981", bg: "#ecfdf5" }
    };
    const c = config[statut] || config.genere;
    return (
      <span 
        className="px-2 py-1 rounded text-xs font-medium"
        style={{ backgroundColor: c.bg, color: c.color }}
      >
        {c.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span>Chargement...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {avisList.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p>Aucun avis de non-conformité</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {avisList.map(avis => (
            <Card key={avis.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-mono font-bold text-red-600">
                        {avis.numero_avis}
                      </span>
                      {getStatutBadge(avis.statut)}
                    </div>
                    <p className="text-sm font-medium">{avis.batiment_nom || avis.batiment_adresse}</p>
                    <p className="text-xs text-gray-500">
                      {avis.batiment_adresse}, {avis.batiment_ville}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                      <span>📅 Inspection: {avis.date_inspection}</span>
                      <span>⚠️ {avis.violations?.length || 0} violation(s)</span>
                      <span>📬 Destinataire: {avis.destinataire_nom || "N/A"}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadPdf(avis.id, avis.numero_avis)}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedAvis(avis);
                        setShowDetailModal(true);
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal détail */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Détail de l'avis {selectedAvis?.numero_avis}</DialogTitle>
          </DialogHeader>
          {selectedAvis && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500">Bâtiment</Label>
                  <p className="font-medium">{selectedAvis.batiment_nom}</p>
                  <p className="text-sm text-gray-600">{selectedAvis.batiment_adresse}</p>
                </div>
                <div>
                  <Label className="text-gray-500">Destinataire</Label>
                  <p className="font-medium">{selectedAvis.destinataire_prenom} {selectedAvis.destinataire_nom}</p>
                  <p className="text-sm text-gray-600">{selectedAvis.destinataire_adresse}</p>
                </div>
              </div>
              
              <div>
                <Label className="text-gray-500">Violations ({selectedAvis.violations?.length})</Label>
                <div className="space-y-2 mt-2">
                  {selectedAvis.violations?.map((v, idx) => (
                    <div key={idx} className="p-2 bg-red-50 rounded text-sm">
                      <div className="flex justify-between">
                        <span className="font-mono font-bold">{v.code_article}</span>
                        <span className="text-gray-600">Échéance: {v.date_limite}</span>
                      </div>
                      <p className="text-gray-700 mt-1">{v.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailModal(false)}>
              Fermer
            </Button>
            {selectedAvis && (
              <Button onClick={() => handleDownloadPdf(selectedAvis.id, selectedAvis.numero_avis)}>
                <Download className="w-4 h-4 mr-2" />
                Télécharger PDF
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export { GenerateAvisModal, ListeAvisNonConformite };
export default ListeAvisNonConformite;
