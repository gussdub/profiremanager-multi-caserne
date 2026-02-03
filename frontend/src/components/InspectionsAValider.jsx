import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Button } from "./ui/button.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";
import { 
  CheckCircle2, XCircle, Clock, AlertTriangle, Building2, Calendar,
  User, Eye, Edit2, RefreshCw, Filter, MapPin, FileText, Send, ChevronRight
} from "lucide-react";
import { apiGet, apiPost } from "../utils/api";

// Lazy load du modal de validation avec aperçu PDF
const ValidationInspectionModal = lazy(() => import('./ValidationInspectionModal'));

/**
 * InspectionsAValider - Vue pour le préventionniste
 * Affiche les inspections soumises par les pompiers en attente de validation
 */
const InspectionsAValider = ({ tenantSlug, toast, currentUser }) => {
  const [loading, setLoading] = useState(true);
  const [inspections, setInspections] = useState([]);
  const [secteurs, setSecteurs] = useState([]);
  const [filterSecteur, setFilterSecteur] = useState("all");
  
  // Modals
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [showRejetModal, setShowRejetModal] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [selectedBatiment, setSelectedBatiment] = useState(null);
  const [nonConformites, setNonConformites] = useState([]);
  const [motifRejet, setMotifRejet] = useState("");
  const [processing, setProcessing] = useState(false);

  // Charger les données
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Charger les inspections à valider
      let endpoint = "/prevention/inspections-visuelles/a-valider";
      if (filterSecteur && filterSecteur !== "all") {
        endpoint += `?secteur_id=${filterSecteur}`;
      }
      
      const [inspectionsData, secteursData] = await Promise.all([
        apiGet(tenantSlug, endpoint),
        apiGet(tenantSlug, "/secteurs").catch(() => [])
      ]);
      
      setInspections(inspectionsData || []);
      setSecteurs(secteursData || []);
      
    } catch (error) {
      console.error("Erreur chargement:", error);
      toast?.({
        title: "Erreur",
        description: "Impossible de charger les inspections",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, filterSecteur, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Ouvrir le modal de validation
  const openValidationModal = async (inspection) => {
    setSelectedInspection(inspection);
    setSelectedBatiment(inspection.batiment);
    
    // Charger les non-conformités de l'inspection
    try {
      const ncData = await apiGet(tenantSlug, `/prevention/non-conformites-visuelles?inspection_id=${inspection.id}`);
      setNonConformites(ncData || []);
    } catch (error) {
      setNonConformites([]);
    }
    
    setShowValidationModal(true);
  };

  // Ouvrir le modal de rejet
  const openRejetModal = (inspection) => {
    setSelectedInspection(inspection);
    setMotifRejet("");
    setShowRejetModal(true);
  };

  // Valider l'inspection (sans avis - si conforme)
  const handleValiderSansAvis = async () => {
    if (!selectedInspection) return;
    
    try {
      setProcessing(true);
      
      await apiPost(tenantSlug, `/prevention/inspections-visuelles/${selectedInspection.id}/valider`, {
        commentaires: ""
      });
      
      toast?.({
        title: "Inspection validée",
        description: "L'inspection a été validée avec succès"
      });
      
      setShowValidationModal(false);
      loadData();
      
    } catch (error) {
      toast?.({
        title: "Erreur",
        description: error.message || "Impossible de valider",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  // Rejeter l'inspection
  const handleRejeter = async () => {
    if (!selectedInspection || !motifRejet.trim()) {
      toast?.({
        title: "Erreur",
        description: "Le motif de rejet est requis",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setProcessing(true);
      
      await apiPost(tenantSlug, `/prevention/inspections-visuelles/${selectedInspection.id}/rejeter`, {
        motif: motifRejet
      });
      
      toast?.({
        title: "Inspection rejetée",
        description: "L'inspection a été renvoyée pour corrections"
      });
      
      setShowRejetModal(false);
      loadData();
      
    } catch (error) {
      toast?.({
        title: "Erreur",
        description: error.message || "Impossible de rejeter",
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  // Callback après validation avec avis
  const handleAvisGenerated = (avis) => {
    toast?.({
      title: "Avis généré",
      description: `L'avis ${avis.numero_avis} a été créé`
    });
    loadData();
  };

  // Formater la date
  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span>Chargement des inspections à valider...</span>
      </div>
    );
  }

  return (
    <div className="inspections-a-valider space-y-6">
      {/* En-tête */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Clock className="w-6 h-6 text-orange-600" />
            Inspections à valider
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {inspections.length} inspection(s) en attente de validation
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Filtre par secteur */}
          <Select value={filterSecteur} onValueChange={setFilterSecteur}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Tous les secteurs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les secteurs</SelectItem>
              {secteurs.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.couleur || '#3b82f6' }} />
                    {s.nom}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button variant="outline" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Liste des inspections */}
      {inspections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500 opacity-50" />
            <p className="text-gray-600 font-medium">Aucune inspection en attente</p>
            <p className="text-sm text-gray-500">Toutes les inspections ont été traitées</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {inspections.map(inspection => (
            <Card key={inspection.id} className="hover:shadow-md transition-shadow border-l-4 border-l-orange-500">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  {/* Infos principales */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Building2 className="w-5 h-5 text-gray-600" />
                      <span className="font-semibold text-lg">
                        {inspection.batiment?.nom_etablissement || inspection.batiment?.adresse_civique || "Bâtiment"}
                      </span>
                      {inspection.nb_non_conformites > 0 && (
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                          {inspection.nb_non_conformites} non-conformité(s)
                        </span>
                      )}
                      {inspection.nb_non_conformites === 0 && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          Conforme
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {inspection.batiment?.adresse_civique}, {inspection.batiment?.ville}
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Inspectée le {formatDate(inspection.date_inspection)}
                      </div>
                      <div className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        {inspection.participants?.length || 0} participant(s)
                      </div>
                    </div>
                    
                    {inspection.notes_terrain && (
                      <p className="mt-2 text-sm text-gray-500 italic">
                        "{inspection.notes_terrain.substring(0, 100)}{inspection.notes_terrain.length > 100 ? '...' : ''}"
                      </p>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openRejetModal(inspection)}
                    >
                      <XCircle className="w-4 h-4 mr-1 text-red-600" />
                      Rejeter
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => openValidationModal(inspection)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      {inspection.nb_non_conformites > 0 ? "Valider & Générer avis" : "Valider"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de validation avec aperçu PDF */}
      <Suspense fallback={null}>
        {showValidationModal && selectedInspection && (
          nonConformites.length > 0 ? (
            <ValidationInspectionModal
              show={showValidationModal}
              onClose={() => setShowValidationModal(false)}
              inspection={selectedInspection}
              batiment={selectedBatiment}
              nonConformites={nonConformites}
              tenantSlug={tenantSlug}
              toast={toast}
              onValidated={handleAvisGenerated}
            />
          ) : (
            // Si pas de non-conformités, modal simple de confirmation
            <Dialog open={showValidationModal} onOpenChange={setShowValidationModal}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="w-5 h-5" />
                    Valider l'inspection
                  </DialogTitle>
                  <DialogDescription>
                    Cette inspection est conforme - aucune non-conformité détectée
                  </DialogDescription>
                </DialogHeader>
                
                <div className="py-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-600" />
                    <p className="text-green-700 font-medium">Inspection conforme</p>
                    <p className="text-sm text-green-600">
                      Aucun avis de non-conformité ne sera généré
                    </p>
                  </div>
                  
                  <div className="mt-4 text-sm text-gray-600">
                    <p><strong>Bâtiment:</strong> {selectedBatiment?.nom_etablissement || selectedBatiment?.adresse_civique}</p>
                    <p><strong>Date:</strong> {formatDate(selectedInspection?.date_inspection)}</p>
                  </div>
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowValidationModal(false)}>
                    Annuler
                  </Button>
                  <Button 
                    onClick={handleValiderSansAvis}
                    disabled={processing}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {processing ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Confirmer la validation
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )
        )}
      </Suspense>

      {/* Modal de rejet */}
      <Dialog open={showRejetModal} onOpenChange={setShowRejetModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="w-5 h-5" />
              Rejeter l'inspection
            </DialogTitle>
            <DialogDescription>
              L'inspection sera renvoyée au pompier pour corrections
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
              <p><strong>Bâtiment:</strong> {selectedInspection?.batiment?.nom_etablissement || selectedInspection?.batiment?.adresse_civique}</p>
              <p><strong>Date:</strong> {formatDate(selectedInspection?.date_inspection)}</p>
            </div>
            
            <Label>Motif du rejet *</Label>
            <textarea
              value={motifRejet}
              onChange={(e) => setMotifRejet(e.target.value)}
              placeholder="Expliquez pourquoi l'inspection doit être corrigée..."
              className="w-full mt-2 p-3 border rounded-lg min-h-[100px]"
            />
            <p className="text-xs text-gray-500 mt-1">
              Ce message sera visible par le pompier qui a effectué l'inspection
            </p>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejetModal(false)}>
              Annuler
            </Button>
            <Button 
              variant="destructive"
              onClick={handleRejeter}
              disabled={processing || !motifRejet.trim()}
            >
              {processing ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
              Rejeter l'inspection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InspectionsAValider;
