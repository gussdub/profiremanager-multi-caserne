import React, { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog.jsx";
import { Card, CardContent } from "./ui/card.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";
import { 
  FileText, AlertTriangle, Clock, Download, Send, User, Building2,
  Calendar, CheckCircle2, XCircle, RefreshCw, Eye, Printer, Mail,
  ChevronRight, Edit2, Save, ExternalLink
} from "lucide-react";
import { apiGet, apiPost, apiPut } from "../utils/api";

/**
 * ValidationInspectionModal - Modal de validation d'une inspection par le préventionniste
 * Génère automatiquement l'avis de non-conformité avec aperçu PDF
 */
const ValidationInspectionModal = ({ 
  show, 
  onClose, 
  inspection, 
  batiment, 
  nonConformites = [],
  tenantSlug, 
  toast,
  onValidated 
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1); // 1: Révision, 2: Aperçu PDF, 3: Envoi
  
  // Données
  const [refViolations, setRefViolations] = useState([]);
  const [linkedViolations, setLinkedViolations] = useState([]); // Violations liées aux anomalies
  const [destinataireType, setDestinataireType] = useState("proprietaire");
  const [notes, setNotes] = useState("");
  const [avisGenere, setAvisGenere] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  
  // Mode envoi
  const [modeEnvoi, setModeEnvoi] = useState("courriel");
  const [emailDestinataire, setEmailDestinataire] = useState("");
  const [sending, setSending] = useState(false);

  // Charger les données
  const loadData = useCallback(async () => {
    if (!show || !inspection) return;
    
    try {
      setLoading(true);
      
      // Charger le référentiel des violations
      const violations = await apiGet(tenantSlug, "/prevention/ref-violations");
      setRefViolations(violations || []);
      
      // Initialiser les liens entre anomalies et violations
      const initialLinks = nonConformites.map(nc => {
        // Essayer de trouver une violation correspondante automatiquement
        const matched = violations.find(v => 
          v.categorie?.toLowerCase() === nc.categorie?.toLowerCase() ||
          nc.titre?.toLowerCase().includes(v.code_article?.toLowerCase())
        );
        
        return {
          non_conformite_id: nc.id,
          non_conformite_titre: nc.titre,
          non_conformite_categorie: nc.categorie,
          ref_violation_id: matched?.id || "",
          code_article: matched?.code_article || "",
          description: nc.description || nc.titre,
          delai_jours: matched?.delai_jours || 30,
          severite: matched?.severite || "majeure",
          notes: ""
        };
      });
      
      setLinkedViolations(initialLinks);
      
      // Initialiser l'email du destinataire
      if (batiment) {
        const email = destinataireType === "gestionnaire" 
          ? batiment.gestionnaire_courriel 
          : batiment.proprietaire_courriel;
        setEmailDestinataire(email || "");
      }
      
    } catch (error) {
      console.error("Erreur chargement:", error);
      toast?.({
        title: "Erreur",
        description: "Impossible de charger les données",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [show, inspection, nonConformites, tenantSlug, toast, batiment, destinataireType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Mettre à jour l'email quand le type de destinataire change
  useEffect(() => {
    if (batiment) {
      const email = destinataireType === "gestionnaire" 
        ? batiment.gestionnaire_courriel 
        : batiment.proprietaire_courriel;
      setEmailDestinataire(email || "");
    }
  }, [destinataireType, batiment]);

  // Lier une anomalie à une violation
  const linkViolation = (index, violationId) => {
    const violation = refViolations.find(v => v.id === violationId);
    if (violation) {
      setLinkedViolations(prev => prev.map((lv, i) => 
        i === index ? {
          ...lv,
          ref_violation_id: violation.id,
          code_article: violation.code_article,
          delai_jours: violation.delai_jours,
          severite: violation.severite
        } : lv
      ));
    }
  };

  // Modifier la description personnalisée
  const updateDescription = (index, description) => {
    setLinkedViolations(prev => prev.map((lv, i) => 
      i === index ? { ...lv, description } : lv
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
  const handleGenererAvis = async () => {
    // Vérifier que toutes les anomalies ont un article lié
    const violationsAvecArticle = linkedViolations.filter(v => v.ref_violation_id);
    
    if (violationsAvecArticle.length === 0 && nonConformites.length > 0) {
      toast?.({
        title: "Attention",
        description: "Veuillez lier au moins une anomalie à un article de loi",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setSaving(true);
      
      // Préparer les violations
      const violationsData = violationsAvecArticle.map(v => ({
        ref_violation_id: v.ref_violation_id,
        code_article: v.code_article,
        description: v.description,
        delai_jours: v.delai_jours,
        severite: v.severite,
        notes: v.notes
      }));
      
      // Générer l'avis
      const result = await apiPost(tenantSlug, `/prevention/inspections/${inspection.id}/generer-avis`, {
        violations: violationsData,
        destinataire_type: destinataireType,
        notes
      });
      
      setAvisGenere(result.avis);
      
      // Générer l'URL du PDF pour l'aperçu
      const pdfEndpoint = `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/prevention/avis-non-conformite/${result.avis.id}/pdf`;
      setPdfUrl(pdfEndpoint);
      
      toast?.({
        title: "Avis généré",
        description: `Numéro: ${result.avis.numero_avis}`
      });
      
      // Passer à l'étape aperçu
      setStep(2);
      
    } catch (error) {
      toast?.({
        title: "Erreur",
        description: error.message || "Impossible de générer l'avis",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  // Télécharger le PDF
  const handleDownloadPdf = async () => {
    if (!avisGenere) return;
    
    try {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/prevention/avis-non-conformite/${avisGenere.id}/pdf`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem(`token_${tenantSlug}`)}`
          }
        }
      );
      
      if (!response.ok) throw new Error("Erreur téléchargement");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `avis_${avisGenere.numero_avis}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (error) {
      toast?.({
        title: "Erreur",
        description: "Impossible de télécharger le PDF",
        variant: "destructive"
      });
    }
  };

  // Envoyer par courriel
  const handleEnvoyerCourriel = async () => {
    if (!avisGenere || !emailDestinataire) {
      toast?.({
        title: "Erreur",
        description: "Adresse courriel requise",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setSending(true);
      
      await apiPost(tenantSlug, `/prevention/avis-non-conformite/${avisGenere.id}/envoyer`, {
        email: emailDestinataire,
        mode: "courriel"
      });
      
      // Mettre à jour le statut de l'avis
      await apiPut(tenantSlug, `/prevention/avis-non-conformite/${avisGenere.id}`, {
        statut: "envoye",
        date_envoi: new Date().toISOString().split('T')[0],
        mode_envoi: "courriel"
      });
      
      toast?.({
        title: "Envoyé",
        description: `L'avis a été envoyé à ${emailDestinataire}`
      });
      
      if (onValidated) {
        onValidated(avisGenere);
      }
      
      onClose();
      
    } catch (error) {
      toast?.({
        title: "Erreur",
        description: error.message || "Impossible d'envoyer le courriel",
        variant: "destructive"
      });
    } finally {
      setSending(false);
    }
  };

  // Valider sans envoyer
  const handleValiderSansEnvoi = async () => {
    if (onValidated && avisGenere) {
      onValidated(avisGenere);
    }
    onClose();
  };

  // Obtenir les infos du destinataire
  const getDestinataire = () => {
    if (!batiment) return { nom: "", adresse: "", email: "" };
    
    if (destinataireType === "gestionnaire") {
      return {
        nom: `${batiment.gestionnaire_prenom || ""} ${batiment.gestionnaire_nom || ""}`.trim() || "Gestionnaire",
        adresse: batiment.gestionnaire_adresse || batiment.adresse_civique || "",
        ville: batiment.gestionnaire_ville || batiment.ville || "",
        email: batiment.gestionnaire_courriel || ""
      };
    }
    
    return {
      nom: `${batiment.proprietaire_prenom || ""} ${batiment.proprietaire_nom || ""}`.trim() || "Propriétaire",
      adresse: batiment.proprietaire_adresse || batiment.adresse_civique || "",
      ville: batiment.proprietaire_ville || batiment.ville || "",
      email: batiment.proprietaire_courriel || ""
    };
  };

  const destinataire = getDestinataire();

  // Couleurs de sévérité
  const getSeveriteColor = (severite) => {
    const colors = {
      urgente: "#dc2626",
      majeure: "#f97316",
      mineure: "#eab308"
    };
    return colors[severite] || "#6b7280";
  };

  if (!show) return null;

  return (
    <Dialog open={show} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 1 && <><CheckCircle2 className="w-5 h-5 text-green-600" /> Valider l'inspection</>}
            {step === 2 && <><Eye className="w-5 h-5 text-blue-600" /> Aperçu de l'avis</>}
            {step === 3 && <><Send className="w-5 h-5 text-purple-600" /> Envoyer l'avis</>}
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Vérifiez et liez les anomalies aux articles du référentiel"}
            {step === 2 && "Vérifiez l'avis avant envoi au propriétaire/gestionnaire"}
            {step === 3 && "Choisissez le mode d'envoi de l'avis"}
          </DialogDescription>
        </DialogHeader>

        {/* Indicateur d'étapes */}
        <div className="flex items-center justify-center gap-2 py-3 border-b">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${step >= 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            <span className="w-5 h-5 rounded-full bg-current text-white flex items-center justify-center text-xs" style={{ backgroundColor: step >= 1 ? '#22c55e' : '#9ca3af' }}>1</span>
            Révision
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${step >= 2 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
            <span className="w-5 h-5 rounded-full text-white flex items-center justify-center text-xs" style={{ backgroundColor: step >= 2 ? '#3b82f6' : '#9ca3af' }}>2</span>
            Aperçu
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${step >= 3 ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
            <span className="w-5 h-5 rounded-full text-white flex items-center justify-center text-xs" style={{ backgroundColor: step >= 3 ? '#9333ea' : '#9ca3af' }}>3</span>
            Envoi
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              <span>Chargement...</span>
            </div>
          ) : (
            <>
              {/* ÉTAPE 1: Révision des anomalies */}
              {step === 1 && (
                <div className="space-y-6">
                  {/* Infos inspection */}
                  <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                    <div>
                      <h4 className="font-semibold flex items-center gap-2 mb-2">
                        <Building2 className="w-4 h-4" /> Bâtiment
                      </h4>
                      <p className="text-sm">{batiment?.nom_etablissement || "N/A"}</p>
                      <p className="text-sm text-gray-600">{batiment?.adresse_civique}, {batiment?.ville}</p>
                    </div>
                    <div>
                      <h4 className="font-semibold flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4" /> Inspection
                      </h4>
                      <p className="text-sm">
                        {inspection?.date_inspection 
                          ? new Date(inspection.date_inspection).toLocaleDateString('fr-FR')
                          : "N/A"}
                      </p>
                      <p className="text-sm text-gray-600">
                        Score: {inspection?.score_conformite || 0}% - {inspection?.statut_global || "N/A"}
                      </p>
                    </div>
                  </div>

                  {/* Destinataire */}
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold flex items-center gap-2 mb-3">
                      <User className="w-4 h-4" /> Destinataire de l'avis
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
                      <p><strong>Adresse:</strong> {destinataire.adresse}, {destinataire.ville}</p>
                      {destinataire.email && <p><strong>Courriel:</strong> {destinataire.email}</p>}
                    </div>
                  </div>

                  {/* Anomalies à lier */}
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-600" />
                      Anomalies détectées ({nonConformites.length})
                    </h4>
                    
                    {nonConformites.length === 0 ? (
                      <div className="text-center py-8 bg-green-50 rounded-lg">
                        <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-600" />
                        <p className="text-green-700 font-medium">Aucune anomalie détectée</p>
                        <p className="text-sm text-green-600">L'inspection est conforme</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {linkedViolations.map((lv, index) => (
                          <Card key={index} className="border-l-4" style={{ borderLeftColor: getSeveriteColor(lv.severite) }}>
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <p className="font-medium">{lv.non_conformite_titre}</p>
                                  <p className="text-xs text-gray-500">{lv.non_conformite_categorie}</p>
                                </div>
                                {lv.code_article && (
                                  <span 
                                    className="px-2 py-1 rounded text-xs font-bold"
                                    style={{ backgroundColor: getSeveriteColor(lv.severite), color: 'white' }}
                                  >
                                    {lv.code_article}
                                  </span>
                                )}
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-xs">Article de référence</Label>
                                  <Select
                                    value={lv.ref_violation_id}
                                    onValueChange={(v) => linkViolation(index, v)}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue placeholder="Sélectionner un article..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {refViolations.map(v => (
                                        <SelectItem key={v.id} value={v.id}>
                                          <span className="font-mono">{v.code_article}</span> - {v.description_standard.substring(0, 50)}...
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">Délai / Date limite</Label>
                                  <p className="mt-2 text-sm">
                                    <Clock className="w-3 h-3 inline mr-1" />
                                    {lv.delai_jours} jours → <strong>{calculateDateLimite(lv.delai_jours)}</strong>
                                  </p>
                                </div>
                              </div>
                              
                              <div className="mt-3">
                                <Label className="text-xs">Description (modifiable)</Label>
                                <textarea
                                  value={lv.description}
                                  onChange={(e) => updateDescription(index, e.target.value)}
                                  className="w-full mt-1 p-2 text-sm border rounded min-h-[60px]"
                                />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <Label>Notes générales (optionnel)</Label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Observations particulières..."
                      className="w-full mt-1 p-3 border rounded min-h-[80px]"
                    />
                  </div>
                </div>
              )}

              {/* ÉTAPE 2: Aperçu PDF */}
              {step === 2 && avisGenere && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-green-700">✅ Avis généré avec succès</p>
                      <p className="text-sm text-green-600">Numéro: {avisGenere.numero_avis}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
                        <Download className="w-4 h-4 mr-1" /> Télécharger
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => window.open(pdfUrl, '_blank')}>
                        <ExternalLink className="w-4 h-4 mr-1" /> Ouvrir
                      </Button>
                    </div>
                  </div>
                  
                  {/* Aperçu du PDF dans un iframe */}
                  <div className="border rounded-lg overflow-hidden" style={{ height: '500px' }}>
                    <iframe
                      src={`${pdfUrl}#toolbar=0`}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                      title="Aperçu de l'avis"
                    />
                  </div>
                  
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
                    <p className="text-yellow-800">
                      💡 <strong>Astuce:</strong> Vérifiez le contenu de l'avis avant de l'envoyer. 
                      Vous pouvez revenir à l'étape précédente pour modifier les informations.
                    </p>
                  </div>
                </div>
              )}

              {/* ÉTAPE 3: Envoi */}
              {step === 3 && avisGenere && (
                <div className="space-y-6">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-semibold mb-4">Mode d'envoi de l'avis</h4>
                    
                    <div className="space-y-3">
                      <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-white transition-colors">
                        <input
                          type="radio"
                          name="modeEnvoi"
                          checked={modeEnvoi === "courriel"}
                          onChange={() => setModeEnvoi("courriel")}
                          className="mt-1"
                        />
                        <div>
                          <p className="font-medium flex items-center gap-2">
                            <Mail className="w-4 h-4" /> Envoyer par courriel
                          </p>
                          <p className="text-sm text-gray-600">L'avis sera envoyé directement à l'adresse du destinataire</p>
                        </div>
                      </label>
                      
                      <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-white transition-colors">
                        <input
                          type="radio"
                          name="modeEnvoi"
                          checked={modeEnvoi === "impression"}
                          onChange={() => setModeEnvoi("impression")}
                          className="mt-1"
                        />
                        <div>
                          <p className="font-medium flex items-center gap-2">
                            <Printer className="w-4 h-4" /> Imprimer / Courrier
                          </p>
                          <p className="text-sm text-gray-600">Téléchargez le PDF pour impression et envoi postal</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {modeEnvoi === "courriel" && (
                    <div className="p-4 border rounded-lg">
                      <Label>Adresse courriel du destinataire</Label>
                      <Input
                        type="email"
                        value={emailDestinataire}
                        onChange={(e) => setEmailDestinataire(e.target.value)}
                        placeholder="exemple@domaine.com"
                        className="mt-2"
                      />
                      {!emailDestinataire && (
                        <p className="text-xs text-orange-600 mt-1">
                          ⚠️ Aucune adresse courriel enregistrée pour ce {destinataireType}
                        </p>
                      )}
                    </div>
                  )}

                  {modeEnvoi === "impression" && (
                    <div className="p-4 border rounded-lg text-center">
                      <Printer className="w-10 h-10 mx-auto mb-3 text-gray-400" />
                      <p className="text-gray-600 mb-3">Téléchargez le PDF pour l'imprimer</p>
                      <Button onClick={handleDownloadPdf}>
                        <Download className="w-4 h-4 mr-2" /> Télécharger le PDF
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          {step === 1 && (
            <>
              <Button variant="outline" onClick={onClose}>Annuler</Button>
              <Button 
                onClick={handleGenererAvis} 
                disabled={saving || (nonConformites.length > 0 && linkedViolations.filter(v => v.ref_violation_id).length === 0)}
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
                {nonConformites.length > 0 ? "Générer l'avis" : "Valider l'inspection"}
              </Button>
            </>
          )}
          
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>← Retour</Button>
              <Button onClick={() => setStep(3)}>
                Continuer vers l'envoi <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </>
          )}
          
          {step === 3 && (
            <>
              <Button variant="outline" onClick={() => setStep(2)}>← Retour</Button>
              <Button variant="outline" onClick={handleValiderSansEnvoi}>
                Terminer sans envoyer
              </Button>
              {modeEnvoi === "courriel" ? (
                <Button 
                  onClick={handleEnvoyerCourriel} 
                  disabled={sending || !emailDestinataire}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {sending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                  Envoyer par courriel
                </Button>
              ) : (
                <Button onClick={handleValiderSansEnvoi} className="bg-green-600 hover:bg-green-700">
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Marquer comme imprimé
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ValidationInspectionModal;
