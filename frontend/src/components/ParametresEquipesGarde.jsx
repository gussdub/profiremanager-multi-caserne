import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";
import { Switch } from "./ui/switch.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.jsx";
import { Users, Calendar, Settings, RefreshCw, Save, Info } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * ParametresEquipesGarde - Configuration des équipes de garde
 * Permet de définir les rotations pour temps plein et temps partiel
 */
const ParametresEquipesGarde = ({ tenantSlug, toast }) => {
  const API = `${BACKEND_URL}/api/${tenantSlug}`;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [params, setParams] = useState({
    actif: false,
    temps_plein: {
      rotation_active: false,
      type_rotation: "montreal",
      nombre_equipes: 4,
      duree_cycle: 28,
      pattern_mode: "hebdomadaire",
      pattern_personnalise: [],
      equipes_config: [
        { numero: 1, nom: "Équipe 1", couleur: "#22C55E" },
        { numero: 2, nom: "Équipe 2", couleur: "#3B82F6" },
        { numero: 3, nom: "Équipe 3", couleur: "#EAB308" },
        { numero: 4, nom: "Équipe 4", couleur: "#EF4444" }
      ],
      pre_remplissage_auto: true,
      privilegier_equipe_garde: false
    },
    temps_partiel: {
      rotation_active: false,
      type_rotation: "personnalisee",
      date_reference: "",
      nombre_equipes: 2,
      duree_cycle: 14,
      pattern_mode: "hebdomadaire",
      pattern_personnalise: [],
      equipes_config: [
        { numero: 1, nom: "Équipe A", couleur: "#3B82F6" },
        { numero: 2, nom: "Équipe B", couleur: "#EF4444" }
      ],
      pre_remplissage_auto: false,
      privilegier_equipe_garde: true
    }
  });

  useEffect(() => {
    fetchParams();
  }, [API]);

  const fetchParams = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API}/parametres/equipes-garde`);
      if (response.data) {
        setParams(response.data);
      }
    } catch (error) {
      console.error("Erreur chargement paramètres équipes de garde:", error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les paramètres",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await axios.put(`${API}/parametres/equipes-garde`, params);
      toast({
        title: "Succès",
        description: "Paramètres des équipes de garde sauvegardés",
        variant: "success"
      });
    } catch (error) {
      console.error("Erreur sauvegarde:", error);
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder les paramètres",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const updateTempsPlein = (field, value) => {
    setParams(prev => ({
      ...prev,
      temps_plein: { ...prev.temps_plein, [field]: value }
    }));
  };

  const updateTempsPartiel = (field, value) => {
    setParams(prev => ({
      ...prev,
      temps_partiel: { ...prev.temps_partiel, [field]: value }
    }));
  };

  const updateEquipeConfig = (type, index, field, value) => {
    setParams(prev => {
      const config = [...prev[type].equipes_config];
      config[index] = { ...config[index], [field]: value };
      return {
        ...prev,
        [type]: { ...prev[type], equipes_config: config }
      };
    });
  };

  const updateNombreEquipes = (type, newCount) => {
    const currentConfig = params[type].equipes_config;
    let newConfig = [...currentConfig];
    
    const defaultColors = ["#22C55E", "#3B82F6", "#EAB308", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];
    const defaultNames = type === "temps_plein" 
      ? ["Vert", "Bleu", "Jaune", "Rouge", "Violet", "Rose", "Turquoise", "Orange"]
      : ["Équipe A", "Équipe B", "Équipe C", "Équipe D", "Équipe E", "Équipe F", "Équipe G", "Équipe H"];

    if (newCount > currentConfig.length) {
      for (let i = currentConfig.length; i < newCount; i++) {
        newConfig.push({
          numero: i + 1,
          nom: defaultNames[i] || `Équipe ${i + 1}`,
          couleur: defaultColors[i] || "#6B7280"
        });
      }
    } else {
      newConfig = newConfig.slice(0, newCount);
    }

    const updateFn = type === "temps_plein" ? updateTempsPlein : updateTempsPartiel;
    updateFn("nombre_equipes", newCount);
    
    setParams(prev => ({
      ...prev,
      [type]: { ...prev[type], nombre_equipes: newCount, equipes_config: newConfig }
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span>Chargement des paramètres...</span>
      </div>
    );
  }

  return (
    <div className="equipes-garde-tab" data-testid="parametres-equipes-garde">
      <div className="tab-header">
        <div>
          <h2>Équipes de Garde</h2>
          <p>Configuration des rotations et équipes pour le planning automatique</p>
        </div>
        <Button onClick={handleSave} disabled={saving} data-testid="save-equipes-garde-btn">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Sauvegarder
        </Button>
      </div>

      {/* Activation globale */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Activation du système d&apos;équipes de garde
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Activer le système d&apos;équipes de garde</p>
              <p className="text-sm text-gray-500">
                Permet d&apos;assigner des employés à des équipes et d&apos;automatiser le planning
              </p>
            </div>
            <Switch
              checked={params.actif}
              onCheckedChange={(checked) => setParams(prev => ({ ...prev, actif: checked }))}
              data-testid="toggle-equipes-garde-actif"
            />
          </div>
        </CardContent>
      </Card>

      {params.actif && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configuration Temps Plein */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-green-600" />
                Temps Plein
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Rotation active</Label>
                <Switch
                  checked={params.temps_plein.rotation_active}
                  onCheckedChange={(checked) => updateTempsPlein("rotation_active", checked)}
                  data-testid="toggle-rotation-temps-plein"
                />
              </div>

              {params.temps_plein.rotation_active && (
                <>
                  <div>
                    <Label>Type de rotation</Label>
                    <Select
                      value={params.temps_plein.type_rotation}
                      onValueChange={(value) => updateTempsPlein("type_rotation", value)}
                    >
                      <SelectTrigger data-testid="select-rotation-temps-plein">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="montreal">Montréal (4 équipes, 28 jours)</SelectItem>
                        <SelectItem value="quebec">Québec (4 équipes, 4 jours)</SelectItem>
                        <SelectItem value="longueuil">Longueuil 7/24</SelectItem>
                        <SelectItem value="personnalisee">Personnalisée</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {params.temps_plein.type_rotation === "personnalisee" && (
                    <>
                      <div>
                        <Label>Date de référence</Label>
                        <Input
                          type="date"
                          value={params.temps_plein.date_reference || ""}
                          onChange={(e) => updateTempsPlein("date_reference", e.target.value)}
                          data-testid="input-date-ref-temps-plein"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Date où l&apos;équipe 1 commence un nouveau cycle
                        </p>
                      </div>
                      <div>
                        <Label>Nombre d&apos;équipes</Label>
                        <Input
                          type="number"
                          min="2"
                          max="8"
                          value={params.temps_plein.nombre_equipes}
                          onChange={(e) => updateNombreEquipes("temps_plein", parseInt(e.target.value))}
                          data-testid="input-nb-equipes-temps-plein"
                        />
                      </div>
                      <div>
                        <Label>Durée du cycle (jours)</Label>
                        <Input
                          type="number"
                          min="7"
                          max="56"
                          value={params.temps_plein.duree_cycle}
                          onChange={(e) => updateTempsPlein("duree_cycle", parseInt(e.target.value))}
                          data-testid="input-duree-cycle-temps-plein"
                        />
                      </div>
                      <div>
                        <Label>Mode de rotation</Label>
                        <Select
                          value={params.temps_plein.pattern_mode || "hebdomadaire"}
                          onValueChange={(value) => updateTempsPlein("pattern_mode", value)}
                        >
                          <SelectTrigger data-testid="select-pattern-mode-temps-plein">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hebdomadaire">Hebdomadaire (change chaque semaine)</SelectItem>
                            <SelectItem value="quotidien">Quotidien (change chaque jour)</SelectItem>
                            <SelectItem value="deux_jours">Aux 2 jours</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500 mt-1">
                          {params.temps_plein.pattern_mode === "quotidien" && "L'équipe de garde change chaque jour"}
                          {params.temps_plein.pattern_mode === "deux_jours" && "L'équipe de garde change aux 2 jours"}
                          {(!params.temps_plein.pattern_mode || params.temps_plein.pattern_mode === "hebdomadaire") && "L'équipe de garde change chaque semaine (7 jours)"}
                        </p>
                      </div>
                    </>
                  )}

                  <div className="bg-gray-50 p-3 rounded-lg">
                    <Label className="mb-2 block">Configuration des équipes</Label>
                    <div className="space-y-2">
                      {params.temps_plein.equipes_config.map((equipe, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="color"
                            value={equipe.couleur}
                            onChange={(e) => updateEquipeConfig("temps_plein", idx, "couleur", e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer"
                            data-testid={`color-equipe-tp-${idx}`}
                          />
                          <Input
                            value={equipe.nom}
                            onChange={(e) => updateEquipeConfig("temps_plein", idx, "nom", e.target.value)}
                            className="flex-1"
                            placeholder={`Équipe ${idx + 1}`}
                            data-testid={`input-nom-equipe-tp-${idx}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Pré-remplissage automatique</Label>
                      <p className="text-xs text-gray-500">Assigner automatiquement les quarts selon l&apos;équipe</p>
                    </div>
                    <Switch
                      checked={params.temps_plein.pre_remplissage_auto}
                      onCheckedChange={(checked) => updateTempsPlein("pre_remplissage_auto", checked)}
                      data-testid="toggle-preremplissage-temps-plein"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Configuration Temps Partiel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                Temps Partiel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Rotation active</Label>
                <Switch
                  checked={params.temps_partiel.rotation_active}
                  onCheckedChange={(checked) => updateTempsPartiel("rotation_active", checked)}
                  data-testid="toggle-rotation-temps-partiel"
                />
              </div>

              {params.temps_partiel.rotation_active && (
                <>
                  <div>
                    <Label>Type de rotation</Label>
                    <Select
                      value={params.temps_partiel.type_rotation}
                      onValueChange={(value) => updateTempsPartiel("type_rotation", value)}
                    >
                      <SelectTrigger data-testid="select-rotation-temps-partiel">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="montreal">Montréal (4 équipes, 28 jours)</SelectItem>
                        <SelectItem value="quebec">Québec (4 équipes, 4 jours)</SelectItem>
                        <SelectItem value="longueuil">Longueuil 7/24</SelectItem>
                        <SelectItem value="personnalisee">Personnalisée</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {params.temps_partiel.type_rotation === "personnalisee" && (
                    <>
                      <div>
                        <Label>Date de référence</Label>
                        <Input
                          type="date"
                          value={params.temps_partiel.date_reference}
                          onChange={(e) => updateTempsPartiel("date_reference", e.target.value)}
                          data-testid="input-date-ref-temps-partiel"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Date où l&apos;équipe 1 commence un nouveau cycle
                        </p>
                      </div>
                      <div>
                        <Label>Nombre d&apos;équipes</Label>
                        <Input
                          type="number"
                          min="2"
                          max="8"
                          value={params.temps_partiel.nombre_equipes}
                          onChange={(e) => updateNombreEquipes("temps_partiel", parseInt(e.target.value))}
                          data-testid="input-nb-equipes-temps-partiel"
                        />
                      </div>
                      <div>
                        <Label>Durée du cycle (jours)</Label>
                        <Input
                          type="number"
                          min="7"
                          max="56"
                          value={params.temps_partiel.duree_cycle}
                          onChange={(e) => updateTempsPartiel("duree_cycle", parseInt(e.target.value))}
                          data-testid="input-duree-cycle-temps-partiel"
                        />
                      </div>
                    </>
                  )}

                  <div className="bg-gray-50 p-3 rounded-lg">
                    <Label className="mb-2 block">Configuration des équipes</Label>
                    <div className="space-y-2">
                      {params.temps_partiel.equipes_config.map((equipe, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="color"
                            value={equipe.couleur}
                            onChange={(e) => updateEquipeConfig("temps_partiel", idx, "couleur", e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer"
                            data-testid={`color-equipe-tpa-${idx}`}
                          />
                          <Input
                            value={equipe.nom}
                            onChange={(e) => updateEquipeConfig("temps_partiel", idx, "nom", e.target.value)}
                            className="flex-1"
                            placeholder={`Équipe ${idx + 1}`}
                            data-testid={`input-nom-equipe-tpa-${idx}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Privilégier l&apos;équipe de garde</Label>
                      <p className="text-xs text-gray-500">Bonus de score pour l&apos;attribution automatique</p>
                    </div>
                    <Switch
                      checked={params.temps_partiel.privilegier_equipe_garde}
                      onCheckedChange={(checked) => updateTempsPartiel("privilegier_equipe_garde", checked)}
                      data-testid="toggle-privilegier-temps-partiel"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Note explicative */}
      <Card className="mt-6 bg-blue-50 border-blue-200">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Comment ça fonctionne ?</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li><strong>Temps plein</strong> : Le planning peut être pré-rempli automatiquement selon la rotation de l&apos;équipe de chaque employé.</li>
                <li><strong>Temps partiel</strong> : Les membres de l&apos;équipe de garde reçoivent un bonus de priorité lors de l&apos;attribution automatique des quarts.</li>
                <li>Assignez chaque employé à son équipe dans sa fiche personnelle (module Personnel).</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ParametresEquipesGarde;
