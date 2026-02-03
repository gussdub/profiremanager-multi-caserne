import React, { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "./ui/dialog.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.jsx";
import { 
  FileText, Plus, Edit2, Trash2, RefreshCw, Save, AlertTriangle, 
  Clock, Download, Filter, Search, BookOpen, CheckCircle2
} from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "../utils/api";

/**
 * ParametresRefViolations - Gestion du référentiel des articles de loi
 * Permet de configurer les codes d'infraction avec leurs délais et sévérités
 */
const ParametresRefViolations = ({ tenantSlug, toast }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [violations, setViolations] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // Filtres
  const [filterCategorie, setFilterCategorie] = useState("");
  const [filterSeverite, setFilterSeverite] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedViolation, setSelectedViolation] = useState(null);
  
  // Formulaire
  const [formData, setFormData] = useState({
    code_article: "",
    description_standard: "",
    delai_jours: 30,
    severite: "majeure",
    categorie: "",
    actif: true
  });

  // Options de sévérité
  const SEVERITES = [
    { value: "mineure", label: "Mineure", color: "#eab308", description: "Délai 30+ jours" },
    { value: "majeure", label: "Majeure", color: "#f97316", description: "Délai 14-30 jours" },
    { value: "urgente", label: "Urgente", color: "#dc2626", description: "Délai < 14 jours" }
  ];

  // Catégories suggérées
  const CATEGORIES_SUGGEREES = [
    "Extincteurs",
    "Éclairage Urgence",
    "Entreposage",
    "Municipal",
    "Structure",
    "Détection",
    "Moyens d'évacuation",
    "Alarme",
    "Plans",
    "Électricité",
    "Gicleurs",
    "Ventilation",
    "Chauffage"
  ];

  // Charger les données
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [violationsData, categoriesData] = await Promise.all([
        apiGet(tenantSlug, "/prevention/ref-violations?actif=null"),
        apiGet(tenantSlug, "/prevention/ref-violations/categories").catch(() => [])
      ]);
      setViolations(violationsData || []);
      setCategories(categoriesData || []);
    } catch (error) {
      console.error("Erreur chargement:", error);
      // Si pas de données, proposer l'initialisation
      if (error.status === 404 || violations.length === 0) {
        setViolations([]);
      }
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Initialiser avec les données par défaut
  const handleInitDefault = async () => {
    if (!window.confirm("Voulez-vous initialiser le référentiel avec les articles par défaut du CNPI ?")) {
      return;
    }
    
    try {
      setSaving(true);
      const result = await apiPost(tenantSlug, "/prevention/ref-violations/init", {});
      toast({
        title: "Succès",
        description: result.message
      });
      loadData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible d'initialiser",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  // Réinitialiser le formulaire
  const resetForm = () => {
    setFormData({
      code_article: "",
      description_standard: "",
      delai_jours: 30,
      severite: "majeure",
      categorie: "",
      actif: true
    });
  };

  // Ouvrir modal création
  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  // Ouvrir modal édition
  const openEditModal = (violation) => {
    setSelectedViolation(violation);
    setFormData({
      code_article: violation.code_article,
      description_standard: violation.description_standard,
      delai_jours: violation.delai_jours,
      severite: violation.severite,
      categorie: violation.categorie || "",
      actif: violation.actif
    });
    setShowEditModal(true);
  };

  // Créer un article
  const handleCreate = async () => {
    if (!formData.code_article.trim() || !formData.description_standard.trim()) {
      toast({ title: "Erreur", description: "Code et description requis", variant: "destructive" });
      return;
    }
    
    try {
      setSaving(true);
      await apiPost(tenantSlug, "/prevention/ref-violations", formData);
      toast({ title: "Succès", description: `Article ${formData.code_article} créé` });
      setShowCreateModal(false);
      loadData();
    } catch (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Modifier un article
  const handleUpdate = async () => {
    if (!selectedViolation) return;
    
    try {
      setSaving(true);
      await apiPut(tenantSlug, `/prevention/ref-violations/${selectedViolation.id}`, formData);
      toast({ title: "Succès", description: `Article ${formData.code_article} mis à jour` });
      setShowEditModal(false);
      setSelectedViolation(null);
      loadData();
    } catch (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Supprimer un article
  const handleDelete = async () => {
    if (!selectedViolation) return;
    
    try {
      setSaving(true);
      await apiDelete(tenantSlug, `/prevention/ref-violations/${selectedViolation.id}`);
      toast({ title: "Succès", description: "Article supprimé" });
      setShowDeleteConfirm(false);
      setSelectedViolation(null);
      loadData();
    } catch (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Filtrer les violations
  const filteredViolations = violations.filter(v => {
    if (filterCategorie && v.categorie !== filterCategorie) return false;
    if (filterSeverite && v.severite !== filterSeverite) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        v.code_article.toLowerCase().includes(query) ||
        v.description_standard.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Obtenir la couleur de sévérité
  const getSeveriteColor = (severite) => {
    const s = SEVERITES.find(x => x.value === severite);
    return s?.color || "#6b7280";
  };

  // Rendu du formulaire
  const renderForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Code de l'article *</Label>
          <Input
            value={formData.code_article}
            onChange={(e) => setFormData(prev => ({ ...prev, code_article: e.target.value.toUpperCase() }))}
            placeholder="Ex: CNPI 2.4.1.1"
          />
          <p className="text-xs text-gray-500 mt-1">Format: CODE + Numéro (ex: CNPI 2.1.5.1, RM-2024 Art. 12)</p>
        </div>
        <div>
          <Label>Catégorie</Label>
          <div className="flex gap-2">
            <Input
              value={formData.categorie}
              onChange={(e) => setFormData(prev => ({ ...prev, categorie: e.target.value }))}
              placeholder="Ex: Extincteurs"
              list="categories-list"
            />
            <datalist id="categories-list">
              {CATEGORIES_SUGGEREES.map(cat => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>
        </div>
      </div>
      
      <div>
        <Label>Description standard *</Label>
        <textarea
          value={formData.description_standard}
          onChange={(e) => setFormData(prev => ({ ...prev, description_standard: e.target.value }))}
          placeholder="Le texte légal qui apparaîtra sur l'avis..."
          className="w-full min-h-[100px] p-3 border rounded-md text-sm"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Délai de correction (jours) *</Label>
          <Input
            type="number"
            min="1"
            max="365"
            value={formData.delai_jours}
            onChange={(e) => setFormData(prev => ({ ...prev, delai_jours: parseInt(e.target.value) || 30 }))}
          />
          <p className="text-xs text-gray-500 mt-1">Nombre de jours accordés pour corriger l'infraction</p>
        </div>
        <div>
          <Label>Sévérité *</Label>
          <Select
            value={formData.severite}
            onValueChange={(v) => setFormData(prev => ({ ...prev, severite: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITES.map(s => (
                <SelectItem key={s.value} value={s.value}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                    <span>{s.label}</span>
                    <span className="text-xs text-gray-400">- {s.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="actif"
          checked={formData.actif}
          onChange={(e) => setFormData(prev => ({ ...prev, actif: e.target.checked }))}
          className="rounded"
        />
        <Label htmlFor="actif">Article actif (visible lors de la création d'avis)</Label>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span>Chargement du référentiel...</span>
      </div>
    );
  }

  return (
    <div className="parametres-ref-violations space-y-6" data-testid="parametres-ref-violations">
      {/* En-tête */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6" />
            Référentiel des infractions
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Catalogue des articles de loi pour les avis de non-conformité
          </p>
        </div>
        <div className="flex gap-2">
          {violations.length === 0 && (
            <Button variant="outline" onClick={handleInitDefault} disabled={saving}>
              <RefreshCw className={`w-4 h-4 mr-2 ${saving ? 'animate-spin' : ''}`} />
              Initialiser par défaut
            </Button>
          )}
          <Button onClick={openCreateModal} data-testid="create-violation-btn">
            <Plus className="w-4 h-4 mr-2" />
            Nouvel article
          </Button>
        </div>
      </div>

      {/* Statistiques */}
      {violations.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{violations.length}</div>
              <div className="text-sm text-gray-500">Articles total</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-600">
                {violations.filter(v => v.severite === 'urgente').length}
              </div>
              <div className="text-sm text-gray-500">Urgentes</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-orange-600">
                {violations.filter(v => v.severite === 'majeure').length}
              </div>
              <div className="text-sm text-gray-500">Majeures</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-yellow-600">
                {violations.filter(v => v.severite === 'mineure').length}
              </div>
              <div className="text-sm text-gray-500">Mineures</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtres */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par code ou description..."
              className="pl-10"
            />
          </div>
        </div>
        <Select value={filterCategorie || "all"} onValueChange={(v) => setFilterCategorie(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Toutes catégories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes catégories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSeverite || "all"} onValueChange={(v) => setFilterSeverite(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Toute sévérité" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toute sévérité</SelectItem>
            {SEVERITES.map(s => (
              <SelectItem key={s.value} value={s.value}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filterCategorie || filterSeverite || searchQuery) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterCategorie("");
              setFilterSeverite("");
              setSearchQuery("");
            }}
          >
            Réinitialiser
          </Button>
        )}
      </div>

      {/* Liste des articles */}
      {violations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">Aucun article dans le référentiel</p>
            <p className="text-sm">Cliquez sur "Initialiser par défaut" pour ajouter les articles du CNPI</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredViolations.map(violation => (
            <Card 
              key={violation.id} 
              className={`${!violation.actif ? 'opacity-60 bg-gray-50' : ''} hover:shadow-md transition-shadow`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span 
                        className="font-mono font-bold text-sm px-2 py-1 rounded"
                        style={{ 
                          backgroundColor: getSeveriteColor(violation.severite) + '20',
                          color: getSeveriteColor(violation.severite)
                        }}
                      >
                        {violation.code_article}
                      </span>
                      {violation.categorie && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          {violation.categorie}
                        </span>
                      )}
                      <span 
                        className="text-xs font-medium px-2 py-1 rounded"
                        style={{ 
                          backgroundColor: getSeveriteColor(violation.severite) + '15',
                          color: getSeveriteColor(violation.severite)
                        }}
                      >
                        {violation.severite.toUpperCase()}
                      </span>
                      {!violation.actif && (
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                          Inactif
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 mb-2">
                      {violation.description_standard}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Délai: {violation.delai_jours} jours
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditModal(violation)}
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedViolation(violation);
                        setShowDeleteConfirm(true);
                      }}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          {filteredViolations.length === 0 && violations.length > 0 && (
            <div className="text-center py-8 text-gray-500">
              <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Aucun article ne correspond aux filtres</p>
            </div>
          )}
        </div>
      )}

      {/* Modal Création */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Nouvel article de référence
            </DialogTitle>
            <DialogDescription>
              Ajoutez un nouvel article de loi au référentiel des infractions
            </DialogDescription>
          </DialogHeader>
          {renderForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Édition */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5" />
              Modifier l'article
            </DialogTitle>
          </DialogHeader>
          {renderForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Sauvegarder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Suppression */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Supprimer l'article
            </DialogTitle>
          </DialogHeader>
          <p>
            Êtes-vous sûr de vouloir supprimer l'article{' '}
            <strong>{selectedViolation?.code_article}</strong> ?
          </p>
          <p className="text-sm text-gray-500">
            Cette action est irréversible. Les avis existants référençant cet article ne seront pas affectés.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ParametresRefViolations;
