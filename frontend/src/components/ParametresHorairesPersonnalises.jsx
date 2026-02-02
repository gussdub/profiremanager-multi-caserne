import React, { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.jsx";
import { 
  Calendar, Clock, Users, Plus, Edit2, Trash2, Copy, Eye, 
  Save, RefreshCw, ChevronLeft, ChevronRight, Check, X
} from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "../utils/api";

/**
 * ParametresHorairesPersonnalises - Module de création d'horaires de rotation
 * 
 * Permet de créer et gérer des horaires personnalisés pour:
 * - Le planning des gardes (internes/externes)
 * - Le module disponibilité/indisponibilité
 * - La rotation des équipes
 */
const ParametresHorairesPersonnalises = ({ tenantSlug, toast }) => {
  // États principaux
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [horaires, setHoraires] = useState([]);
  const [selectedHoraire, setSelectedHoraire] = useState(null);
  
  // États modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // État du formulaire
  const [formData, setFormData] = useState({
    nom: "",
    description: "",
    duree_cycle: 28,
    nombre_equipes: 4,
    date_reference: new Date().toISOString().split('T')[0],
    type_quart: "24h",
    heures_quart: {
      jour_debut: "08:00",
      jour_fin: "20:00",
      nuit_debut: "20:00",
      nuit_fin: "08:00"
    },
    equipes: []
  });
  
  // État du calendrier d'édition (28 jours)
  const [calendrierEdition, setCalendrierEdition] = useState([]);
  const [equipeSelectionnee, setEquipeSelectionnee] = useState(1);
  
  // État aperçu
  const [apercu, setApercu] = useState(null);
  const [apercuDateDebut, setApercuDateDebut] = useState(new Date().toISOString().split('T')[0]);
  
  // Couleurs par défaut pour les équipes
  const COULEURS_DEFAUT = [
    "#22C55E", // Vert
    "#3B82F6", // Bleu
    "#EAB308", // Jaune
    "#EF4444", // Rouge
    "#8B5CF6", // Violet
    "#EC4899", // Rose
    "#14B8A6", // Turquoise
    "#F97316"  // Orange
  ];
  
  const NOMS_EQUIPES_DEFAUT = ["Vert", "Bleu", "Jaune", "Rouge", "Violet", "Rose", "Turquoise", "Orange"];

  // Charger les horaires
  const loadHoraires = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiGet(tenantSlug, "/horaires-personnalises");
      setHoraires(response.horaires || []);
    } catch (error) {
      console.error("Erreur chargement horaires:", error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les horaires",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, toast]);

  useEffect(() => {
    loadHoraires();
  }, [loadHoraires]);

  // Initialiser les équipes selon le nombre choisi
  const initEquipes = (nombre) => {
    const equipes = [];
    for (let i = 0; i < nombre; i++) {
      equipes.push({
        numero: i + 1,
        nom: NOMS_EQUIPES_DEFAUT[i] || `Équipe ${i + 1}`,
        couleur: COULEURS_DEFAUT[i] || "#6B7280",
        jours_travail: []
      });
    }
    return equipes;
  };

  // Initialiser le calendrier d'édition vide
  const initCalendrier = (duree) => {
    const cal = [];
    for (let i = 1; i <= duree; i++) {
      cal.push({
        jour: i,
        equipe: null // Aucune équipe assignée par défaut
      });
    }
    return cal;
  };

  // Ouvrir le modal de création
  const openCreateModal = () => {
    const nbEquipes = 4;
    const dureeCycle = 28;
    setFormData({
      nom: "",
      description: "",
      duree_cycle: dureeCycle,
      nombre_equipes: nbEquipes,
      date_reference: new Date().toISOString().split('T')[0],
      type_quart: "24h",
      heures_quart: {
        jour_debut: "08:00",
        jour_fin: "20:00",
        nuit_debut: "20:00",
        nuit_fin: "08:00"
      },
      equipes: initEquipes(nbEquipes)
    });
    setCalendrierEdition(initCalendrier(dureeCycle));
    setEquipeSelectionnee(1);
    setShowCreateModal(true);
  };

  // Ouvrir le modal d'édition
  const openEditModal = (horaire) => {
    if (horaire.predefini) {
      toast({
        title: "Information",
        description: "Les horaires prédéfinis ne peuvent pas être modifiés. Utilisez 'Dupliquer' pour créer une copie modifiable.",
        variant: "default"
      });
      return;
    }
    
    setSelectedHoraire(horaire);
    setFormData({
      nom: horaire.nom,
      description: horaire.description || "",
      duree_cycle: horaire.duree_cycle,
      nombre_equipes: horaire.nombre_equipes,
      date_reference: horaire.date_reference,
      type_quart: horaire.type_quart || "24h",
      heures_quart: horaire.heures_quart || {},
      equipes: horaire.equipes || []
    });
    
    // Reconstruire le calendrier à partir des équipes
    const cal = initCalendrier(horaire.duree_cycle);
    horaire.equipes?.forEach(eq => {
      eq.jours_travail?.forEach(jour => {
        if (jour >= 1 && jour <= horaire.duree_cycle) {
          cal[jour - 1].equipe = eq.numero;
        }
      });
    });
    setCalendrierEdition(cal);
    setEquipeSelectionnee(1);
    setShowEditModal(true);
  };

  // Mettre à jour le nombre d'équipes
  const handleNombreEquipesChange = (newCount) => {
    const count = parseInt(newCount);
    if (count < 1 || count > 8) return;
    
    let newEquipes = [...formData.equipes];
    
    if (count > newEquipes.length) {
      // Ajouter des équipes
      for (let i = newEquipes.length; i < count; i++) {
        newEquipes.push({
          numero: i + 1,
          nom: NOMS_EQUIPES_DEFAUT[i] || `Équipe ${i + 1}`,
          couleur: COULEURS_DEFAUT[i] || "#6B7280",
          jours_travail: []
        });
      }
    } else {
      // Réduire les équipes
      newEquipes = newEquipes.slice(0, count);
      // Nettoyer le calendrier des équipes supprimées
      setCalendrierEdition(prev => prev.map(j => ({
        ...j,
        equipe: j.equipe && j.equipe > count ? null : j.equipe
      })));
    }
    
    setFormData(prev => ({
      ...prev,
      nombre_equipes: count,
      equipes: newEquipes
    }));
  };

  // Mettre à jour la durée du cycle
  const handleDureeCycleChange = (newDuree) => {
    const duree = parseInt(newDuree);
    if (duree < 7 || duree > 56) return;
    
    setFormData(prev => ({ ...prev, duree_cycle: duree }));
    setCalendrierEdition(initCalendrier(duree));
  };

  // Cliquer sur un jour du calendrier pour assigner/désassigner une équipe
  const handleJourClick = (jour) => {
    setCalendrierEdition(prev => {
      const newCal = [...prev];
      const idx = jour - 1;
      
      if (newCal[idx].equipe === equipeSelectionnee) {
        // Désassigner si déjà assigné à cette équipe
        newCal[idx].equipe = null;
      } else {
        // Assigner l'équipe sélectionnée
        newCal[idx].equipe = equipeSelectionnee;
      }
      
      return newCal;
    });
  };

  // Mettre à jour une équipe
  const updateEquipe = (index, field, value) => {
    setFormData(prev => {
      const newEquipes = [...prev.equipes];
      newEquipes[index] = { ...newEquipes[index], [field]: value };
      return { ...prev, equipes: newEquipes };
    });
  };

  // Construire les données finales avec les jours de travail
  const buildFinalData = () => {
    // Calculer les jours de travail pour chaque équipe à partir du calendrier
    const equipesAvecJours = formData.equipes.map(eq => ({
      ...eq,
      jours_travail: calendrierEdition
        .filter(j => j.equipe === eq.numero)
        .map(j => j.jour)
    }));
    
    return {
      ...formData,
      equipes: equipesAvecJours
    };
  };

  // Sauvegarder un nouvel horaire
  const handleCreate = async () => {
    if (!formData.nom.trim()) {
      toast({
        title: "Erreur",
        description: "Le nom de l'horaire est requis",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setSaving(true);
      const data = buildFinalData();
      await apiPost(tenantSlug, "/horaires-personnalises", data);
      
      toast({
        title: "Succès",
        description: `Horaire "${formData.nom}" créé avec succès`
      });
      
      setShowCreateModal(false);
      loadHoraires();
    } catch (error) {
      console.error("Erreur création:", error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de créer l'horaire",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  // Mettre à jour un horaire
  const handleUpdate = async () => {
    if (!selectedHoraire) return;
    
    try {
      setSaving(true);
      const data = buildFinalData();
      await apiPut(tenantSlug, `/horaires-personnalises/${selectedHoraire.id}`, data);
      
      toast({
        title: "Succès",
        description: `Horaire "${formData.nom}" mis à jour`
      });
      
      setShowEditModal(false);
      setSelectedHoraire(null);
      loadHoraires();
    } catch (error) {
      console.error("Erreur mise à jour:", error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de mettre à jour l'horaire",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  // Supprimer un horaire
  const handleDelete = async () => {
    if (!selectedHoraire || selectedHoraire.predefini) return;
    
    try {
      setSaving(true);
      await apiDelete(tenantSlug, `/horaires-personnalises/${selectedHoraire.id}`);
      
      toast({
        title: "Succès",
        description: `Horaire "${selectedHoraire.nom}" supprimé`
      });
      
      setShowDeleteConfirm(false);
      setSelectedHoraire(null);
      loadHoraires();
    } catch (error) {
      console.error("Erreur suppression:", error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de supprimer l'horaire",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  // Dupliquer un horaire
  const handleDuplicate = async (horaire) => {
    try {
      setSaving(true);
      const result = await apiPost(tenantSlug, `/horaires-personnalises/${horaire.id}/dupliquer`, {});
      
      toast({
        title: "Succès",
        description: `Horaire dupliqué: ${result.nom}`
      });
      
      loadHoraires();
    } catch (error) {
      console.error("Erreur duplication:", error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de dupliquer l'horaire",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  // Charger l'aperçu d'un horaire
  const handlePreview = async (horaire) => {
    try {
      setSelectedHoraire(horaire);
      const result = await apiGet(
        tenantSlug, 
        `/horaires-personnalises/${horaire.id}/apercu?date_debut=${apercuDateDebut}&nb_jours=28`
      );
      setApercu(result);
      setShowPreviewModal(true);
    } catch (error) {
      console.error("Erreur aperçu:", error);
      toast({
        title: "Erreur",
        description: "Impossible de charger l'aperçu",
        variant: "destructive"
      });
    }
  };

  // Rendu du calendrier d'édition
  const renderCalendrierEdition = () => {
    const semaines = [];
    for (let i = 0; i < calendrierEdition.length; i += 7) {
      semaines.push(calendrierEdition.slice(i, i + 7));
    }
    
    return (
      <div className="space-y-4">
        {/* Sélecteur d'équipe */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">Peindre avec :</span>
          {formData.equipes.map((eq, idx) => (
            <button
              key={eq.numero}
              onClick={() => setEquipeSelectionnee(eq.numero)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                equipeSelectionnee === eq.numero 
                  ? 'ring-2 ring-offset-2 ring-gray-400 scale-105' 
                  : 'opacity-70 hover:opacity-100'
              }`}
              style={{ 
                backgroundColor: eq.couleur, 
                color: ['#EAB308', '#22C55E', '#14B8A6'].includes(eq.couleur) ? '#000' : '#fff'
              }}
            >
              {eq.nom}
            </button>
          ))}
          <button
            onClick={() => setEquipeSelectionnee(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 border-dashed transition-all ${
              equipeSelectionnee === null 
                ? 'ring-2 ring-offset-2 ring-gray-400 border-gray-400' 
                : 'border-gray-300 opacity-70 hover:opacity-100'
            }`}
          >
            ⬜ Repos
          </button>
        </div>
        
        {/* Grille du calendrier */}
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 bg-gray-100 text-center text-sm font-medium">
            {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(j => (
              <div key={j} className="py-2 border-r last:border-r-0">{j}</div>
            ))}
          </div>
          {semaines.map((semaine, sIdx) => (
            <div key={sIdx} className="grid grid-cols-7 border-t">
              {semaine.map((jour, jIdx) => {
                const equipe = jour.equipe ? formData.equipes.find(e => e.numero === jour.equipe) : null;
                return (
                  <button
                    key={jour.jour}
                    onClick={() => handleJourClick(jour.jour)}
                    className="aspect-square flex flex-col items-center justify-center border-r last:border-r-0 hover:bg-gray-50 transition-colors relative"
                    style={equipe ? { 
                      backgroundColor: equipe.couleur + '40',
                      borderColor: equipe.couleur
                    } : {}}
                  >
                    <span className="text-xs text-gray-500">J{jour.jour}</span>
                    {equipe && (
                      <span 
                        className="text-xs font-bold mt-0.5 px-1 rounded"
                        style={{ 
                          backgroundColor: equipe.couleur,
                          color: ['#EAB308', '#22C55E', '#14B8A6'].includes(equipe.couleur) ? '#000' : '#fff'
                        }}
                      >
                        {equipe.nom.substring(0, 3)}
                      </span>
                    )}
                  </button>
                );
              })}
              {/* Remplir les jours manquants de la dernière semaine */}
              {semaine.length < 7 && Array(7 - semaine.length).fill(null).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square border-r last:border-r-0 bg-gray-50" />
              ))}
            </div>
          ))}
        </div>
        
        {/* Résumé des jours assignés */}
        <div className="flex flex-wrap gap-2 text-sm">
          {formData.equipes.map(eq => {
            const nbJours = calendrierEdition.filter(j => j.equipe === eq.numero).length;
            return (
              <span 
                key={eq.numero}
                className="px-2 py-1 rounded"
                style={{ backgroundColor: eq.couleur + '30' }}
              >
                {eq.nom}: {nbJours} jour{nbJours > 1 ? 's' : ''}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  // Rendu de l'aperçu
  const renderApercu = () => {
    if (!apercu) return null;
    
    const semaines = [];
    for (let i = 0; i < apercu.apercu.length; i += 7) {
      semaines.push(apercu.apercu.slice(i, i + 7));
    }
    
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Label>Afficher à partir du :</Label>
          <Input
            type="date"
            value={apercuDateDebut}
            onChange={(e) => setApercuDateDebut(e.target.value)}
            className="w-auto"
          />
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => selectedHoraire && handlePreview(selectedHoraire)}
          >
            <RefreshCw className="w-4 h-4 mr-1" /> Actualiser
          </Button>
        </div>
        
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 bg-gray-100 text-center text-sm font-medium">
            {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(j => (
              <div key={j} className="py-2 border-r last:border-r-0">{j}</div>
            ))}
          </div>
          {semaines.map((semaine, sIdx) => (
            <div key={sIdx} className="grid grid-cols-7 border-t">
              {semaine.map((jour, jIdx) => (
                <div
                  key={jour.date}
                  className="p-2 border-r last:border-r-0 min-h-[80px]"
                  style={jour.equipe ? { 
                    backgroundColor: jour.equipe.couleur + '30'
                  } : {}}
                >
                  <div className="text-xs text-gray-500">
                    {new Date(jour.date).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })}
                  </div>
                  <div className="text-xs text-gray-400">J{jour.jour_cycle}</div>
                  {jour.equipe && (
                    <div 
                      className="mt-1 text-xs font-bold px-1 py-0.5 rounded text-center"
                      style={{ 
                        backgroundColor: jour.equipe.couleur,
                        color: ['#EAB308', '#22C55E', '#14B8A6'].includes(jour.equipe.couleur) ? '#000' : '#fff'
                      }}
                    >
                      {jour.equipe.nom}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span>Chargement des horaires...</span>
      </div>
    );
  }

  return (
    <div className="horaires-personnalises-tab" data-testid="parametres-horaires">
      <div className="tab-header mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Horaires de Rotation
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Créez et gérez les horaires de rotation pour le planning et les disponibilités
          </p>
        </div>
        <Button onClick={openCreateModal} data-testid="btn-create-horaire">
          <Plus className="w-4 h-4 mr-2" />
          Nouvel horaire
        </Button>
      </div>

      {/* Liste des horaires */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {horaires.map(horaire => (
          <Card key={horaire.id} className={horaire.predefini ? 'border-blue-200 bg-blue-50/30' : ''}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {horaire.nom}
                    {horaire.predefini && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        Prédéfini
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    {horaire.description || `Cycle de ${horaire.duree_cycle} jours`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Équipes */}
              <div className="flex flex-wrap gap-1 mb-3">
                {horaire.equipes?.map(eq => (
                  <span
                    key={eq.numero}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ 
                      backgroundColor: eq.couleur,
                      color: ['#EAB308', '#22C55E', '#14B8A6'].includes(eq.couleur) ? '#000' : '#fff'
                    }}
                  >
                    {eq.nom}
                  </span>
                ))}
              </div>
              
              {/* Infos */}
              <div className="text-xs text-gray-500 space-y-1 mb-3">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Type: {horaire.type_quart === '24h' ? 'Quarts de 24h' : 'Jour/Nuit'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  <span>{horaire.nombre_equipes} équipes</span>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handlePreview(horaire)}
                  data-testid={`btn-preview-${horaire.id}`}
                >
                  <Eye className="w-3 h-3 mr-1" /> Aperçu
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleDuplicate(horaire)}
                  data-testid={`btn-duplicate-${horaire.id}`}
                >
                  <Copy className="w-3 h-3 mr-1" /> Dupliquer
                </Button>
                {!horaire.predefini && (
                  <>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => openEditModal(horaire)}
                      data-testid={`btn-edit-${horaire.id}`}
                    >
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setSelectedHoraire(horaire);
                        setShowDeleteConfirm(true);
                      }}
                      className="text-red-600 hover:text-red-700"
                      data-testid={`btn-delete-${horaire.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal Création */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Créer un nouvel horaire
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Informations de base */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nom de l'horaire *</Label>
                <Input
                  value={formData.nom}
                  onChange={(e) => setFormData(prev => ({ ...prev, nom: e.target.value }))}
                  placeholder="Ex: Horaire Granby"
                  data-testid="input-horaire-nom"
                />
              </div>
              <div>
                <Label>Date de référence *</Label>
                <Input
                  type="date"
                  value={formData.date_reference}
                  onChange={(e) => setFormData(prev => ({ ...prev, date_reference: e.target.value }))}
                  data-testid="input-horaire-date-ref"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Date où l'équipe 1 commence le jour 1 du cycle
                </p>
              </div>
            </div>
            
            <div>
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Description optionnelle"
              />
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Durée du cycle (jours)</Label>
                <Input
                  type="number"
                  min="7"
                  max="56"
                  value={formData.duree_cycle}
                  onChange={(e) => handleDureeCycleChange(e.target.value)}
                  data-testid="input-horaire-duree"
                />
              </div>
              <div>
                <Label>Nombre d'équipes</Label>
                <Input
                  type="number"
                  min="1"
                  max="8"
                  value={formData.nombre_equipes}
                  onChange={(e) => handleNombreEquipesChange(e.target.value)}
                  data-testid="input-horaire-nb-equipes"
                />
              </div>
              <div>
                <Label>Type de quart</Label>
                <Select
                  value={formData.type_quart}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, type_quart: v }))}
                >
                  <SelectTrigger data-testid="select-type-quart">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24 heures</SelectItem>
                    <SelectItem value="12h_jour_nuit">12h Jour/Nuit</SelectItem>
                    <SelectItem value="8h">8 heures</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Configuration des heures si jour/nuit */}
            {formData.type_quart === '12h_jour_nuit' && (
              <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <Label className="text-xs">Début jour</Label>
                  <Input
                    type="time"
                    value={formData.heures_quart.jour_debut || '08:00'}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      heures_quart: { ...prev.heures_quart, jour_debut: e.target.value }
                    }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Fin jour</Label>
                  <Input
                    type="time"
                    value={formData.heures_quart.jour_fin || '20:00'}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      heures_quart: { ...prev.heures_quart, jour_fin: e.target.value }
                    }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Début nuit</Label>
                  <Input
                    type="time"
                    value={formData.heures_quart.nuit_debut || '20:00'}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      heures_quart: { ...prev.heures_quart, nuit_debut: e.target.value }
                    }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Fin nuit</Label>
                  <Input
                    type="time"
                    value={formData.heures_quart.nuit_fin || '08:00'}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      heures_quart: { ...prev.heures_quart, nuit_fin: e.target.value }
                    }))}
                  />
                </div>
              </div>
            )}
            
            {/* Configuration des équipes */}
            <div>
              <Label className="mb-2 block">Configuration des équipes</Label>
              <div className="space-y-2">
                {formData.equipes.map((eq, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={eq.couleur}
                      onChange={(e) => updateEquipe(idx, 'couleur', e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                    />
                    <Input
                      value={eq.nom}
                      onChange={(e) => updateEquipe(idx, 'nom', e.target.value)}
                      className="flex-1"
                      placeholder={`Équipe ${idx + 1}`}
                    />
                    <span className="text-xs text-gray-500 w-20">
                      #{eq.numero}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Calendrier d'édition */}
            <div>
              <Label className="mb-2 block">
                Calendrier du cycle ({formData.duree_cycle} jours)
              </Label>
              <p className="text-xs text-gray-500 mb-3">
                Cliquez sur les jours pour assigner l'équipe sélectionnée. Cliquez à nouveau pour désassigner.
              </p>
              {renderCalendrierEdition()}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Créer l'horaire
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Édition - similaire au modal création */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5" />
              Modifier l'horaire
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Mêmes champs que création */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nom de l'horaire *</Label>
                <Input
                  value={formData.nom}
                  onChange={(e) => setFormData(prev => ({ ...prev, nom: e.target.value }))}
                />
              </div>
              <div>
                <Label>Date de référence *</Label>
                <Input
                  type="date"
                  value={formData.date_reference}
                  onChange={(e) => setFormData(prev => ({ ...prev, date_reference: e.target.value }))}
                />
              </div>
            </div>
            
            <div>
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Durée du cycle (jours)</Label>
                <Input
                  type="number"
                  min="7"
                  max="56"
                  value={formData.duree_cycle}
                  onChange={(e) => handleDureeCycleChange(e.target.value)}
                />
              </div>
              <div>
                <Label>Nombre d'équipes</Label>
                <Input
                  type="number"
                  min="1"
                  max="8"
                  value={formData.nombre_equipes}
                  onChange={(e) => handleNombreEquipesChange(e.target.value)}
                />
              </div>
              <div>
                <Label>Type de quart</Label>
                <Select
                  value={formData.type_quart}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, type_quart: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">24 heures</SelectItem>
                    <SelectItem value="12h_jour_nuit">12h Jour/Nuit</SelectItem>
                    <SelectItem value="8h">8 heures</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {formData.type_quart === '12h_jour_nuit' && (
              <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <Label className="text-xs">Début jour</Label>
                  <Input
                    type="time"
                    value={formData.heures_quart.jour_debut || '08:00'}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      heures_quart: { ...prev.heures_quart, jour_debut: e.target.value }
                    }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Fin jour</Label>
                  <Input
                    type="time"
                    value={formData.heures_quart.jour_fin || '20:00'}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      heures_quart: { ...prev.heures_quart, jour_fin: e.target.value }
                    }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Début nuit</Label>
                  <Input
                    type="time"
                    value={formData.heures_quart.nuit_debut || '20:00'}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      heures_quart: { ...prev.heures_quart, nuit_debut: e.target.value }
                    }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Fin nuit</Label>
                  <Input
                    type="time"
                    value={formData.heures_quart.nuit_fin || '08:00'}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      heures_quart: { ...prev.heures_quart, nuit_fin: e.target.value }
                    }))}
                  />
                </div>
              </div>
            )}
            
            <div>
              <Label className="mb-2 block">Configuration des équipes</Label>
              <div className="space-y-2">
                {formData.equipes.map((eq, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="color"
                      value={eq.couleur}
                      onChange={(e) => updateEquipe(idx, 'couleur', e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                    />
                    <Input
                      value={eq.nom}
                      onChange={(e) => updateEquipe(idx, 'nom', e.target.value)}
                      className="flex-1"
                    />
                    <span className="text-xs text-gray-500 w-20">#{eq.numero}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <Label className="mb-2 block">Calendrier du cycle</Label>
              {renderCalendrierEdition()}
            </div>
          </div>
          
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

      {/* Modal Aperçu */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Aperçu: {selectedHoraire?.nom}
            </DialogTitle>
          </DialogHeader>
          
          {renderApercu()}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreviewModal(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Confirmation Suppression */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Confirmer la suppression
            </DialogTitle>
          </DialogHeader>
          
          <p>
            Êtes-vous sûr de vouloir supprimer l'horaire <strong>"{selectedHoraire?.nom}"</strong> ?
          </p>
          <p className="text-sm text-gray-500">
            Cette action est irréversible.
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

export default ParametresHorairesPersonnalises;
