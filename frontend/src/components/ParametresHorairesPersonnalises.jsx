import React, { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.jsx";
import { 
  Calendar, Clock, Users, Plus, Edit2, Trash2, Copy, Eye, 
  Save, RefreshCw, Check, Sun, Moon
} from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "../utils/api";

/**
 * ParametresHorairesPersonnalises - Module de création d'horaires de rotation
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
      jour_debut: "07:00",
      jour_fin: "19:00",
      nuit_debut: "19:00",
      nuit_fin: "07:00"
    },
    equipes: []
  });
  
  // État du calendrier d'édition - chaque jour peut avoir des segments jour/nuit
  const [calendrierEdition, setCalendrierEdition] = useState([]);
  const [equipeSelectionnee, setEquipeSelectionnee] = useState(1);
  const [segmentSelectionne, setSegmentSelectionne] = useState("jour"); // "jour", "nuit", ou "24h"
  
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

  // Initialiser le calendrier d'édition avec segments jour/nuit
  const initCalendrier = (duree, typeQuart) => {
    const cal = [];
    for (let i = 1; i <= duree; i++) {
      if (typeQuart === "12h_jour_nuit") {
        cal.push({
          jour: i,
          segments: {
            jour: null,   // équipe assignée au jour (null = repos)
            nuit: null    // équipe assignée à la nuit (null = repos)
          }
        });
      } else if (typeQuart === "12h_jour_seulement") {
        // Mode jour seulement - la nuit est gérée par les gardes externes
        cal.push({
          jour: i,
          segments: {
            jour: null    // équipe assignée au jour uniquement
          }
        });
      } else if (typeQuart === "6h_demi_quarts") {
        // Mode demi-quarts (6h) - AM (6h-12h) et PM (12h-18h)
        cal.push({
          jour: i,
          segments: {
            am: null,    // équipe assignée au matin (6h-12h)
            pm: null     // équipe assignée à l'après-midi (12h-18h)
          }
        });
      } else {
        cal.push({
          jour: i,
          segments: {
            "24h": null   // équipe assignée sur 24h
          }
        });
      }
    }
    return cal;
  };

  // Ouvrir le modal de création
  const openCreateModal = () => {
    const nbEquipes = 4;
    const dureeCycle = 28;
    const typeQuart = "24h";
    setFormData({
      nom: "",
      description: "",
      duree_cycle: dureeCycle,
      nombre_equipes: nbEquipes,
      date_reference: new Date().toISOString().split('T')[0],
      type_quart: typeQuart,
      heures_quart: {
        jour_debut: "07:00",
        jour_fin: "19:00",
        nuit_debut: "19:00",
        nuit_fin: "07:00"
      },
      equipes: initEquipes(nbEquipes)
    });
    setCalendrierEdition(initCalendrier(dureeCycle, typeQuart));
    setEquipeSelectionnee(1);
    setSegmentSelectionne(typeQuart === "12h_jour_nuit" ? "jour" : "24h");
    setShowCreateModal(true);
  };

  // Ouvrir le modal d'édition
  const openEditModal = async (horaire) => {
    // Édition directe - plus de duplication automatique
    // Le backend gère automatiquement la création d'une version modifiée si c'est un prédéfini
    
    setSelectedHoraire(horaire);
    const typeQuart = horaire.type_quart || "24h";
    setFormData({
      nom: horaire.nom,
      description: horaire.description || "",
      duree_cycle: horaire.duree_cycle,
      nombre_equipes: horaire.nombre_equipes,
      date_reference: horaire.date_reference,
      type_quart: typeQuart,
      heures_quart: horaire.heures_quart || {
        jour_debut: "07:00",
        jour_fin: "19:00",
        nuit_debut: "19:00",
        nuit_fin: "07:00"
      },
      equipes: horaire.equipes || []
    });
    
    // Reconstruire le calendrier à partir des équipes
    const cal = initCalendrier(horaire.duree_cycle, typeQuart);
    horaire.equipes?.forEach(eq => {
      eq.jours_travail?.forEach(jourInfo => {
        if (typeof jourInfo === 'number') {
          // Ancien format: juste le numéro du jour
          const idx = jourInfo - 1;
          if (idx >= 0 && idx < cal.length) {
            if (typeQuart === "12h_jour_nuit") {
              cal[idx].segments.jour = eq.numero;
              cal[idx].segments.nuit = eq.numero;
            } else {
              cal[idx].segments["24h"] = eq.numero;
            }
          }
        } else if (typeof jourInfo === 'object') {
          // Nouveau format: {jour: 1, segment: "jour"} ou {jour: 1, segment: "24h"}
          const idx = jourInfo.jour - 1;
          if (idx >= 0 && idx < cal.length) {
            const seg = jourInfo.segment || "24h";
            if (cal[idx].segments[seg] !== undefined) {
              cal[idx].segments[seg] = eq.numero;
            }
          }
        }
      });
    });
    setCalendrierEdition(cal);
    setEquipeSelectionnee(1);
    setSegmentSelectionne(typeQuart === "12h_jour_nuit" ? "jour" : "24h");
    setShowEditModal(true);
  };

  // Mettre à jour le nombre d'équipes
  const handleNombreEquipesChange = (newCount) => {
    const count = parseInt(newCount);
    if (count < 1 || count > 8) return;
    
    let newEquipes = [...formData.equipes];
    
    if (count > newEquipes.length) {
      for (let i = newEquipes.length; i < count; i++) {
        newEquipes.push({
          numero: i + 1,
          nom: NOMS_EQUIPES_DEFAUT[i] || `Équipe ${i + 1}`,
          couleur: COULEURS_DEFAUT[i] || "#6B7280",
          jours_travail: []
        });
      }
    } else {
      newEquipes = newEquipes.slice(0, count);
      // Nettoyer le calendrier des équipes supprimées
      setCalendrierEdition(prev => prev.map(j => {
        const newSegments = { ...j.segments };
        Object.keys(newSegments).forEach(seg => {
          if (newSegments[seg] && newSegments[seg] > count) {
            newSegments[seg] = null;
          }
        });
        return { ...j, segments: newSegments };
      }));
    }
    
    setFormData(prev => ({
      ...prev,
      nombre_equipes: count,
      equipes: newEquipes
    }));
    
    if (equipeSelectionnee > count) {
      setEquipeSelectionnee(count);
    }
  };

  // Mettre à jour la durée du cycle
  const handleDureeCycleChange = (newDuree) => {
    const duree = parseInt(newDuree);
    if (duree < 7 || duree > 56) return;
    
    setFormData(prev => ({ ...prev, duree_cycle: duree }));
    setCalendrierEdition(initCalendrier(duree, formData.type_quart));
  };

  // Mettre à jour le type de quart
  const handleTypeQuartChange = (newType) => {
    setFormData(prev => ({ ...prev, type_quart: newType }));
    setCalendrierEdition(initCalendrier(formData.duree_cycle, newType));
    // Sélectionner le premier segment selon le type
    if (newType === "12h_jour_nuit" || newType === "12h_jour_seulement") {
      setSegmentSelectionne("jour");
    } else if (newType === "6h_demi_quarts") {
      setSegmentSelectionne("am");
    } else {
      setSegmentSelectionne("24h");
    }
  };

  // Cliquer sur un segment du calendrier
  const handleSegmentClick = (jour, segment) => {
    setCalendrierEdition(prev => {
      const newCal = [...prev];
      const idx = jour - 1;
      
      if (newCal[idx].segments[segment] === equipeSelectionnee) {
        // Désassigner si déjà assigné à cette équipe
        newCal[idx] = {
          ...newCal[idx],
          segments: { ...newCal[idx].segments, [segment]: null }
        };
      } else {
        // Assigner l'équipe sélectionnée
        newCal[idx] = {
          ...newCal[idx],
          segments: { ...newCal[idx].segments, [segment]: equipeSelectionnee }
        };
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
    const equipesAvecJours = formData.equipes.map(eq => {
      const joursData = [];
      calendrierEdition.forEach(jourData => {
        Object.keys(jourData.segments).forEach(seg => {
          if (jourData.segments[seg] === eq.numero) {
            joursData.push({ jour: jourData.jour, segment: seg });
          }
        });
      });
      return {
        ...eq,
        jours_travail: joursData
      };
    });
    
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

  // Obtenir la couleur d'une équipe
  const getEquipeCouleur = (numero) => {
    const eq = formData.equipes.find(e => e.numero === numero);
    return eq?.couleur || "#6B7280";
  };

  const getEquipeNom = (numero) => {
    const eq = formData.equipes.find(e => e.numero === numero);
    return eq?.nom || `Éq.${numero}`;
  };

  // Rendu du calendrier d'édition
  const renderCalendrierEdition = () => {
    const is12h = formData.type_quart === "12h_jour_nuit";
    const isJourSeulement = formData.type_quart === "12h_jour_seulement";
    const semaines = [];
    for (let i = 0; i < calendrierEdition.length; i += 7) {
      semaines.push(calendrierEdition.slice(i, i + 7));
    }
    
    return (
      <div className="space-y-4">
        {/* Sélecteur d'équipe */}
        <div className="p-4 bg-gray-50 rounded-lg space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">Peindre avec l'équipe :</span>
            {formData.equipes.map((eq) => (
              <button
                key={eq.numero}
                onClick={() => setEquipeSelectionnee(eq.numero)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  equipeSelectionnee === eq.numero 
                    ? 'ring-2 ring-offset-2 ring-gray-600 scale-105' 
                    : 'opacity-60 hover:opacity-100'
                }`}
                style={{ 
                  backgroundColor: eq.couleur, 
                  color: ['#EAB308', '#22C55E', '#14B8A6', '#F97316'].includes(eq.couleur) ? '#000' : '#fff'
                }}
              >
                {eq.nom}
              </button>
            ))}
            <button
              onClick={() => setEquipeSelectionnee(null)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 border-dashed transition-all ${
                equipeSelectionnee === null 
                  ? 'ring-2 ring-offset-2 ring-gray-600 border-gray-600 bg-gray-200' 
                  : 'border-gray-300 opacity-60 hover:opacity-100'
              }`}
            >
              ⬜ Repos
            </button>
          </div>
          
          {/* Info pour mode jour seulement */}
          {isJourSeulement && (
            <div className="flex items-center gap-2 pt-2 border-t text-sm text-blue-600 bg-blue-50 p-2 rounded">
              <Sun className="w-4 h-4" />
              <span>Mode jour seulement - Les nuits sont assurées par les gardes externes</span>
            </div>
          )}
          
          {/* Sélecteur de segment si 12h jour/nuit */}
          {is12h && (
            <div className="flex items-center gap-2 pt-2 border-t">
              <span className="text-sm font-medium">Segment :</span>
              <button
                onClick={() => setSegmentSelectionne("jour")}
                className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1 transition-all ${
                  segmentSelectionne === "jour"
                    ? 'bg-yellow-400 text-black ring-2 ring-offset-1 ring-yellow-600'
                    : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                }`}
              >
                <Sun className="w-4 h-4" /> Jour ({formData.heures_quart.jour_debut}-{formData.heures_quart.jour_fin})
              </button>
              <button
                onClick={() => setSegmentSelectionne("nuit")}
                className={`px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1 transition-all ${
                  segmentSelectionne === "nuit"
                    ? 'bg-indigo-600 text-white ring-2 ring-offset-1 ring-indigo-800'
                    : 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200'
                }`}
              >
                <Moon className="w-4 h-4" /> Nuit ({formData.heures_quart.nuit_debut}-{formData.heures_quart.nuit_fin})
              </button>
            </div>
          )}
        </div>
        
        {/* Instructions */}
        <p className="text-sm text-gray-600">
          👆 Cliquez sur les cases pour assigner l'équipe sélectionnée. Cliquez à nouveau pour retirer.
        </p>
        
        {/* Grille du calendrier */}
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 bg-gray-100 text-center text-sm font-medium">
            {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(j => (
              <div key={j} className="py-2 border-r last:border-r-0">{j}</div>
            ))}
          </div>
          {semaines.map((semaine, sIdx) => (
            <div key={sIdx} className="grid grid-cols-7 border-t">
              {semaine.map((jourData) => {
                if (is12h) {
                  // Mode 12h jour/nuit: afficher jour et nuit séparément
                  const jourEquipe = jourData.segments.jour;
                  const nuitEquipe = jourData.segments.nuit;
                  return (
                    <div
                      key={jourData.jour}
                      className="border-r last:border-r-0 flex flex-col"
                    >
                      <div className="text-xs text-gray-500 text-center py-1 bg-gray-50 border-b">
                        J{jourData.jour}
                      </div>
                      {/* Segment Jour */}
                      <button
                        onClick={() => handleSegmentClick(jourData.jour, "jour")}
                        className="flex-1 p-1 min-h-[40px] flex items-center justify-center transition-all hover:opacity-80 border-b"
                        style={jourEquipe ? { 
                          backgroundColor: getEquipeCouleur(jourEquipe),
                        } : { backgroundColor: '#fff' }}
                        title={`Jour: ${jourEquipe ? getEquipeNom(jourEquipe) : 'Repos'}`}
                      >
                        {jourEquipe ? (
                          <span 
                            className="text-xs font-bold px-1 rounded flex items-center gap-0.5"
                            style={{ color: ['#EAB308', '#22C55E', '#14B8A6', '#F97316'].includes(getEquipeCouleur(jourEquipe)) ? '#000' : '#fff' }}
                          >
                            <Sun className="w-3 h-3" />
                            {getEquipeNom(jourEquipe).substring(0, 2)}
                          </span>
                        ) : (
                          <Sun className="w-3 h-3 text-gray-300" />
                        )}
                      </button>
                      {/* Segment Nuit */}
                      <button
                        onClick={() => handleSegmentClick(jourData.jour, "nuit")}
                        className="flex-1 p-1 min-h-[40px] flex items-center justify-center transition-all hover:opacity-80"
                        style={nuitEquipe ? { 
                          backgroundColor: getEquipeCouleur(nuitEquipe),
                        } : { backgroundColor: '#1e293b' }}
                        title={`Nuit: ${nuitEquipe ? getEquipeNom(nuitEquipe) : 'Repos'}`}
                      >
                        {nuitEquipe ? (
                          <span 
                            className="text-xs font-bold px-1 rounded flex items-center gap-0.5"
                            style={{ color: ['#EAB308', '#22C55E', '#14B8A6', '#F97316'].includes(getEquipeCouleur(nuitEquipe)) ? '#000' : '#fff' }}
                          >
                            <Moon className="w-3 h-3" />
                            {getEquipeNom(nuitEquipe).substring(0, 2)}
                          </span>
                        ) : (
                          <Moon className="w-3 h-3 text-gray-500" />
                        )}
                      </button>
                    </div>
                  );
                } else if (isJourSeulement) {
                  // Mode jour seulement: afficher uniquement le jour (pas de nuit)
                  const jourEquipe = jourData.segments.jour;
                  return (
                    <div
                      key={jourData.jour}
                      className="border-r last:border-r-0 flex flex-col"
                    >
                      <div className="text-xs text-gray-500 text-center py-1 bg-gray-50 border-b">
                        J{jourData.jour}
                      </div>
                      {/* Segment Jour uniquement */}
                      <button
                        onClick={() => handleSegmentClick(jourData.jour, "jour")}
                        className="flex-1 p-1 min-h-[60px] flex items-center justify-center transition-all hover:opacity-80"
                        style={jourEquipe ? { 
                          backgroundColor: getEquipeCouleur(jourEquipe),
                        } : { backgroundColor: '#fff' }}
                        title={`Jour: ${jourEquipe ? getEquipeNom(jourEquipe) : 'Repos'}`}
                      >
                        {jourEquipe ? (
                          <span 
                            className="text-xs font-bold px-1 rounded flex items-center gap-0.5"
                            style={{ color: ['#EAB308', '#22C55E', '#14B8A6', '#F97316'].includes(getEquipeCouleur(jourEquipe)) ? '#000' : '#fff' }}
                          >
                            <Sun className="w-3 h-3" />
                            {getEquipeNom(jourEquipe).substring(0, 2)}
                          </span>
                        ) : (
                          <Sun className="w-3 h-3 text-gray-300" />
                        )}
                      </button>
                    </div>
                  );
                } else {
                  // Mode 24h
                  const equipe = jourData.segments["24h"];
                  return (
                    <button
                      key={jourData.jour}
                      onClick={() => handleSegmentClick(jourData.jour, "24h")}
                      className="aspect-square flex flex-col items-center justify-center border-r last:border-r-0 transition-all hover:opacity-80 cursor-pointer"
                      style={equipe ? { 
                        backgroundColor: getEquipeCouleur(equipe) + 'cc',
                      } : { backgroundColor: '#fff' }}
                      title={equipe ? getEquipeNom(equipe) : 'Repos'}
                    >
                      <span className="text-xs text-gray-500 mb-1">J{jourData.jour}</span>
                      {equipe && (
                        <span 
                          className="text-xs font-bold px-1.5 py-0.5 rounded"
                          style={{ 
                            backgroundColor: getEquipeCouleur(equipe),
                            color: ['#EAB308', '#22C55E', '#14B8A6', '#F97316'].includes(getEquipeCouleur(equipe)) ? '#000' : '#fff'
                          }}
                        >
                          {getEquipeNom(equipe).substring(0, 3)}
                        </span>
                      )}
                    </button>
                  );
                }
              })}
              {/* Remplir les jours manquants de la dernière semaine */}
              {semaine.length < 7 && Array(7 - semaine.length).fill(null).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square border-r last:border-r-0 bg-gray-100" />
              ))}
            </div>
          ))}
        </div>
        
        {/* Résumé des jours assignés */}
        <div className="flex flex-wrap gap-2 text-sm p-3 bg-gray-50 rounded-lg">
          <span className="font-medium">Résumé :</span>
          {formData.equipes.map(eq => {
            let nbJours = 0;
            calendrierEdition.forEach(j => {
              Object.values(j.segments).forEach(seg => {
                if (seg === eq.numero) nbJours++;
              });
            });
            return (
              <span 
                key={eq.numero}
                className="px-2 py-1 rounded font-medium"
                style={{ 
                  backgroundColor: eq.couleur + '40',
                  color: eq.couleur
                }}
              >
                {eq.nom}: {nbJours} {is12h || isJourSeulement ? 'segment(s)' : 'jour(s)'}
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
    
    const is12h = apercu.apercu[0]?.type_quart === "12h_jour_nuit";
    const isJourSeulementApercu = apercu.apercu[0]?.type_quart === "12h_jour_seulement";
    
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
              {semaine.map((jour) => {
                if (is12h) {
                  // Mode jour/nuit
                  return (
                    <div
                      key={jour.date}
                      className="border-r last:border-r-0 min-h-[100px] flex flex-col"
                    >
                      <div className="text-xs text-gray-500 p-1 bg-gray-50 border-b">
                        {new Date(jour.date).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })}
                        <span className="text-gray-400 ml-1">J{jour.jour_cycle}</span>
                      </div>
                      {/* Segment Jour */}
                      <div 
                        className="flex-1 flex items-center justify-center p-1"
                        style={jour.equipe_jour ? { 
                          backgroundColor: jour.equipe_jour.couleur + '40'
                        } : {}}
                      >
                        {jour.equipe_jour && (
                          <span 
                            className="text-xs font-bold px-1.5 py-0.5 rounded flex items-center gap-1"
                            style={{ 
                              backgroundColor: jour.equipe_jour.couleur,
                              color: ['#EAB308', '#22C55E', '#14B8A6', '#F97316'].includes(jour.equipe_jour.couleur) ? '#000' : '#fff'
                            }}
                          >
                            <Sun className="w-3 h-3" />
                            {jour.equipe_jour.nom}
                          </span>
                        )}
                      </div>
                      {/* Segment Nuit */}
                      <div 
                        className="flex-1 flex items-center justify-center p-1"
                        style={jour.equipe_nuit ? { 
                          backgroundColor: jour.equipe_nuit.couleur + '60'
                        } : { backgroundColor: '#1e293b20' }}
                      >
                        {jour.equipe_nuit && (
                          <span 
                            className="text-xs font-bold px-1.5 py-0.5 rounded flex items-center gap-1"
                            style={{ 
                              backgroundColor: jour.equipe_nuit.couleur,
                              color: ['#EAB308', '#22C55E', '#14B8A6', '#F97316'].includes(jour.equipe_nuit.couleur) ? '#000' : '#fff'
                            }}
                          >
                            <Moon className="w-3 h-3" />
                            {jour.equipe_nuit.nom}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                } else {
                  // Mode 24h
                  return (
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
                            color: ['#EAB308', '#22C55E', '#14B8A6', '#F97316'].includes(jour.equipe.couleur) ? '#000' : '#fff'
                          }}
                        >
                          {jour.equipe.nom}
                        </div>
                      )}
                    </div>
                  );
                }
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Formulaire commun pour création/édition
  const renderFormulaire = () => (
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
            onValueChange={handleTypeQuartChange}
          >
            <SelectTrigger data-testid="select-type-quart">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24 heures</SelectItem>
              <SelectItem value="12h_jour_nuit">Jour / Nuit (12h chaque)</SelectItem>
              <SelectItem value="12h_jour_seulement">Jour seulement (nuit = externe)</SelectItem>
              <SelectItem value="6h_demi_quarts">Demi-quarts (6h) - AM/PM</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Configuration des heures si jour/nuit */}
      {formData.type_quart === '12h_jour_nuit' && (
        <div className="grid grid-cols-4 gap-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <div>
            <Label className="text-xs flex items-center gap-1"><Sun className="w-3 h-3" /> Début jour</Label>
            <Input
              type="time"
              value={formData.heures_quart.jour_debut}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                heures_quart: { ...prev.heures_quart, jour_debut: e.target.value }
              }))}
            />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1"><Sun className="w-3 h-3" /> Fin jour</Label>
            <Input
              type="time"
              value={formData.heures_quart.jour_fin}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                heures_quart: { ...prev.heures_quart, jour_fin: e.target.value }
              }))}
            />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1"><Moon className="w-3 h-3" /> Début nuit</Label>
            <Input
              type="time"
              value={formData.heures_quart.nuit_debut}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                heures_quart: { ...prev.heures_quart, nuit_debut: e.target.value }
              }))}
            />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1"><Moon className="w-3 h-3" /> Fin nuit</Label>
            <Input
              type="time"
              value={formData.heures_quart.nuit_fin}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                heures_quart: { ...prev.heures_quart, nuit_fin: e.target.value }
              }))}
            />
          </div>
        </div>
      )}
      
      {/* Configuration des heures si jour seulement */}
      {formData.type_quart === '12h_jour_seulement' && (
        <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div>
            <Label className="text-xs flex items-center gap-1"><Sun className="w-3 h-3" /> Début du quart de jour</Label>
            <Input
              type="time"
              value={formData.heures_quart.jour_debut}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                heures_quart: { ...prev.heures_quart, jour_debut: e.target.value }
              }))}
            />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1"><Sun className="w-3 h-3" /> Fin du quart de jour</Label>
            <Input
              type="time"
              value={formData.heures_quart.jour_fin}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                heures_quart: { ...prev.heures_quart, jour_fin: e.target.value }
              }))}
            />
          </div>
          <div className="col-span-2 text-sm text-blue-600 flex items-center gap-2">
            <Moon className="w-4 h-4" />
            <span>Les quarts de nuit ne sont pas gérés dans ce mode - ils sont assurés par les gardes externes.</span>
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
                className="w-10 h-10 rounded cursor-pointer border-2 border-gray-300"
                style={{ padding: '2px' }}
              />
              <Input
                value={eq.nom}
                onChange={(e) => updateEquipe(idx, 'nom', e.target.value)}
                className="flex-1"
                placeholder={`Équipe ${idx + 1}`}
              />
              <span className="text-sm text-gray-500 w-16 text-center">
                #{eq.numero}
              </span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Calendrier d'édition */}
      <div>
        <Label className="mb-2 block text-lg font-semibold">
          📅 Calendrier du cycle ({formData.duree_cycle} jours)
        </Label>
        {renderCalendrierEdition()}
      </div>
    </div>
  );

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
      <div className="flex justify-between items-start mb-6">
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
                  <span>Type: {horaire.type_quart === '12h_jour_nuit' ? 'Jour/Nuit' : '24h'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  <span>{horaire.nombre_equipes} équipes • {horaire.duree_cycle} jours</span>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
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
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => openEditModal(horaire)}
                  disabled={saving}
                  data-testid={`btn-edit-${horaire.id}`}
                  title="Modifier cet horaire"
                >
                  <Edit2 className="w-3 h-3 mr-1" />
                  Modifier
                </Button>
                {!horaire.predefini && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setSelectedHoraire(horaire);
                      setShowDeleteConfirm(true);
                    }}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    data-testid={`btn-delete-${horaire.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
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
          
          {renderFormulaire()}
          
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

      {/* Modal Édition */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5" />
              Modifier l'horaire
            </DialogTitle>
          </DialogHeader>
          
          {renderFormulaire()}
          
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
