import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../ui/select';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const SectionFacturation = ({ formData, setFormData, editMode, tenantSlug, getToken, toast }) => {
  const [settings, setSettings] = useState(null);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [tenantInfo, setTenantInfo] = useState(null);
  const [personnalisation, setPersonnalisation] = useState(null);
  
  const API = `${BACKEND_URL}/api/${tenantSlug}`;
  
  // Charger les paramètres, grades et infos du tenant
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [settingsRes, gradesRes, persoRes] = await Promise.all([
          fetch(`${API}/interventions/settings`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
          fetch(`${API}/grades`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
          fetch(`${API}/personnalisation`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        ]);
        
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setSettings(data.settings);
        }
        if (gradesRes.ok) {
          const data = await gradesRes.json();
          setGrades(data || []);
        }
        if (persoRes.ok) {
          const data = await persoRes.json();
          setPersonnalisation(data);
        }
      } catch (e) {
        console.error('Erreur chargement paramètres facturation:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [tenantSlug]);
  
  // Déterminer si l'intervention est facturable
  const determinerFacturation = () => {
    if (!settings || !formData.municipality) return null;
    
    const municipalite = (formData.municipality || formData.xml_municipality || '').toLowerCase().trim();
    
    // 1. Vérifier si c'est une municipalité couverte par notre service (pas de facturation)
    const munCouvertes = (settings.municipalites_couvertes || []).map(m => m.toLowerCase().trim());
    if (munCouvertes.includes(municipalite)) {
      return { facturable: false, raison: 'Municipalité desservie par notre service' };
    }
    
    // 2. Chercher une entente qui couvre cette municipalité
    for (const entente of (settings.ententes_entraide || [])) {
      const munEntente = (entente.municipalites_couvertes || []).map(m => m.toLowerCase().trim());
      if (munEntente.includes(municipalite)) {
        return {
          facturable: true,
          entente: entente,
          municipalite_facturation: entente.municipalite_facturation,
          raison: `Couvert par l'entente "${entente.municipalite_facturation}"`
        };
      }
    }
    
    // 3. Aucune entente → facturer tout par défaut
    return {
      facturable: true,
      entente: null,
      municipalite_facturation: formData.municipality,
      raison: 'Aucune entente - Tarifs par défaut'
    };
  };
  
  // Calculer le montant de la facture
  const calculerFacture = () => {
    if (!settings) return null;
    
    const facturationInfo = determinerFacturation();
    if (!facturationInfo || !facturationInfo.facturable) return null;
    
    const entente = facturationInfo.entente;
    const tarifVehicules = settings.tarifs_vehicules || {};
    const tarifGrades = settings.tarifs_grades || {};
    const tarifSpecialites = settings.tarifs_specialites || {};
    
    // Calculer la durée en heures
    let dureeHeures = 0;
    if (formData.xml_time_call_received && (formData.xml_time_call_closed || formData.xml_time_terminated)) {
      const debut = new Date(formData.xml_time_call_received);
      const fin = new Date(formData.xml_time_call_closed || formData.xml_time_terminated);
      dureeHeures = Math.max(1, Math.ceil((fin - debut) / (1000 * 60 * 60) * 2) / 2); // Arrondi à 0.5h
    }
    
    const lignes = [];
    let total = 0;
    
    // Véhicules
    const factVehicules = entente ? (entente.facturer_vehicules ?? true) : true;
    if (factVehicules && formData.assigned_vehicles?.length > 0) {
      formData.assigned_vehicles.forEach(v => {
        const typeVehicule = (v.type || 'autre_vehicule').toLowerCase().replace(/[éè]/g, 'e').replace(/\s+/g, '_');
        const tarif = entente?.tarifs?.[typeVehicule] || tarifVehicules[typeVehicule] || tarifVehicules.autre_vehicule || 100;
        const montant = tarif * dureeHeures;
        lignes.push({
          description: `Véhicule ${v.numero_unite || v.numero || v.nom || 'N/A'} (${v.type || 'Autre'})`,
          quantite: `${dureeHeures}h`,
          tarif: `${tarif}$/h`,
          montant
        });
        total += montant;
      });
    }
    
    // Personnel
    const factPersonnel = entente ? (entente.facturer_personnel ?? true) : true;
    if (factPersonnel && formData.personnel_present?.length > 0) {
      formData.personnel_present.forEach(p => {
        // Trouver le grade et son tarif
        const gradeId = p.grade_id || p.grade;
        let tarif = 30; // Défaut
        
        // Chercher par ID ou par nom
        if (gradeId && tarifGrades[gradeId]) {
          tarif = tarifGrades[gradeId];
        } else if (p.grade) {
          const gradeObj = grades.find(g => g.nom === p.grade || g.id === p.grade);
          if (gradeObj && tarifGrades[gradeObj.id]) {
            tarif = tarifGrades[gradeObj.id];
          }
        }
        
        // Tarif spécifique de l'entente si présent
        if (entente?.tarifs?.pompier) {
          tarif = entente.tarifs.pompier;
        }
        
        const montant = tarif * dureeHeures;
        lignes.push({
          description: `${p.prenom || ''} ${p.nom || ''} (${p.grade || 'Pompier'})`,
          quantite: `${dureeHeures}h`,
          tarif: `${tarif}$/h`,
          montant
        });
        total += montant;
      });
    }
    
    // Cylindres / APRIA
    const factCylindres = entente ? (entente.facturer_cylindres ?? true) : true;
    if (factCylindres) {
      const cylindresUtilises = (formData.materiel_utilise || []).filter(m => 
        (m.nom || '').toLowerCase().includes('cylindre') || 
        (m.nom || '').toLowerCase().includes('apria') ||
        (m.nom || '').toLowerCase().includes('bouteille')
      );
      cylindresUtilises.forEach(c => {
        const tarif = entente?.tarifs?.remplissage_cylindre || tarifSpecialites.remplissage_cylindre || 25;
        const qte = c.quantite || 1;
        const montant = tarif * qte;
        lignes.push({
          description: `Remplissage ${c.nom || 'cylindre'}`,
          quantite: qte,
          tarif: `${tarif}$/unité`,
          montant
        });
        total += montant;
      });
    }
    
    // Consommables
    const factConsommables = entente ? (entente.facturer_consommables ?? true) : true;
    if (factConsommables) {
      const consommables = (formData.materiel_utilise || []).filter(m => 
        m.gerer_quantite && 
        !(m.nom || '').toLowerCase().includes('cylindre') &&
        !(m.nom || '').toLowerCase().includes('apria')
      );
      consommables.forEach(c => {
        // TODO: Récupérer le prix du consommable depuis les équipements
        const tarif = 10; // Prix par défaut
        const qte = c.quantite || 1;
        const montant = tarif * qte;
        lignes.push({
          description: `Consommable: ${c.nom || 'N/A'}`,
          quantite: qte,
          tarif: `${tarif}$/unité`,
          montant
        });
        total += montant;
      });
    }
    
    // Spécialités
    const factSpecialites = entente ? (entente.facturer_specialites ?? true) : true;
    if (factSpecialites && formData.specialites_utilisees?.length > 0) {
      formData.specialites_utilisees.forEach(s => {
        const key = s.type?.toLowerCase().replace(/\s+/g, '_') || 'autre_specialite';
        const tarif = tarifSpecialites[key] || tarifSpecialites.autre_specialite || 300;
        lignes.push({
          description: `Spécialité: ${s.nom || s.type || 'Autre'}`,
          quantite: 1,
          tarif: `${tarif}$/interv.`,
          montant: tarif
        });
        total += tarif;
      });
    }
    
    // Frais d'administration
    const factAdmin = entente ? (entente.facturer_frais_admin ?? true) : true;
    if (factAdmin && lignes.length > 0) {
      const fraisAdmin = tarifSpecialites.frais_admin || 50;
      lignes.push({
        description: "Frais d'administration",
        quantite: 1,
        tarif: `${fraisAdmin}$`,
        montant: fraisAdmin
      });
      total += fraisAdmin;
    }
    
    return {
      info: facturationInfo,
      lignes,
      total,
      duree_heures: dureeHeures
    };
  };
  
  const facturation = calculerFacture();
  const facturationInfo = determinerFacturation();
  const [generatingFacture, setGeneratingFacture] = useState(false);
  
  // Sauvegarder les données de facturation
  const sauvegarderFacturation = () => {
    if (facturation) {
      setFormData({
        ...formData,
        facturation: {
          municipalite_facturation: facturation.info.municipalite_facturation,
          entente_utilisee: facturation.info.entente?.municipalite_facturation || null,
          lignes: facturation.lignes,
          total: facturation.total,
          duree_heures: facturation.duree_heures,
          calculee_le: new Date().toISOString()
        }
      });
      toast({ title: "Succès", description: "Données de facturation enregistrées" });
    }
  };
  
  // Générer et enregistrer la facture officielle
  const genererFactureOfficielle = async () => {
    if (!facturation) return;
    
    setGeneratingFacture(true);
    try {
      const response = await fetch(`${API}/interventions/${formData.id}/facture-entraide`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          municipalite_facturation: facturation.info.municipalite_facturation,
          entente_utilisee: facturation.info.entente?.municipalite_facturation || null,
          lignes: facturation.lignes,
          total: facturation.total,
          duree_heures: facturation.duree_heures,
          coordonnees_facturation: facturation.info.entente ? {
            contact_nom: facturation.info.entente.contact_nom,
            contact_email: facturation.info.entente.contact_email,
            adresse: facturation.info.entente.adresse_facturation
          } : {}
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setFormData({
          ...formData,
          facture_entraide_id: data.facture.id,
          facture_entraide_numero: data.facture.numero_facture
        });
        toast({ title: "Succès", description: `Facture ${data.facture.numero_facture} générée avec succès` });
        return data.facture;
      } else {
        const error = await response.json();
        toast({ title: "Erreur", description: error.detail || "Erreur lors de la génération", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erreur", description: "Erreur de connexion", variant: "destructive" });
    } finally {
      setGeneratingFacture(false);
    }
    return null;
  };
  
  // Générer le PDF de la facture
  const genererPDF = async () => {
    let facture = formData.facture_entraide_numero ? { numero_facture: formData.facture_entraide_numero } : null;
    
    // Si pas encore de facture officielle, en générer une
    if (!facture) {
      facture = await genererFactureOfficielle();
      if (!facture) return;
    }
    
    const numeroFacture = facture.numero_facture || formData.facture_entraide_numero;
    const nomService = personnalisation?.nom_service || 'Service de Sécurité Incendie';
    const logoUrl = personnalisation?.logo_url || '';
    const adresseService = personnalisation?.adresse || '';
    const telService = personnalisation?.telephone || '';
    const emailService = personnalisation?.email || '';
    
    // Générer le HTML de la facture avec logo et infos du tenant
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Facture ${numeroFacture}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 30px; max-width: 800px; margin: 0 auto; color: #333; font-size: 12px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #dc2626; padding-bottom: 20px; }
          .header-left { display: flex; align-items: center; gap: 15px; }
          .logo-img { max-height: 70px; max-width: 150px; object-fit: contain; }
          .logo-placeholder { width: 60px; height: 60px; background: linear-gradient(135deg, #dc2626, #f97316); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 30px; }
          .service-info { }
          .service-name { font-size: 18px; font-weight: bold; color: #dc2626; margin-bottom: 3px; }
          .service-details { font-size: 10px; color: #666; line-height: 1.4; }
          .facture-info { text-align: right; }
          .facture-titre { font-size: 24px; font-weight: bold; color: #dc2626; }
          .facture-numero { font-size: 16px; color: #333; margin-top: 5px; }
          .facture-date { font-size: 11px; color: #666; margin-top: 3px; }
          .section { margin-bottom: 20px; }
          .section-title { font-size: 11px; font-weight: bold; color: #666; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
          .client-box { background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #dc2626; }
          .client-name { font-size: 14px; font-weight: bold; color: #333; margin-bottom: 5px; }
          .intervention-box { background: #fff8e1; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; }
          .intervention-title { font-weight: bold; color: #92400e; margin-bottom: 8px; }
          .intervention-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
          .intervention-item { font-size: 11px; }
          .intervention-label { color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background: #1f2937; color: white; padding: 10px 8px; text-align: left; font-size: 11px; text-transform: uppercase; }
          th.text-center { text-align: center; }
          th.text-right { text-align: right; }
          td { padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
          td.text-center { text-align: center; }
          td.text-right { text-align: right; }
          tbody tr:nth-child(even) { background: #f9fafb; }
          .total-row { background: #dc2626 !important; color: white; font-weight: bold; }
          .total-row td { padding: 12px 8px; font-size: 14px; border: none; }
          .footer { margin-top: 30px; padding-top: 15px; border-top: 2px solid #e5e7eb; }
          .footer-thanks { text-align: center; font-style: italic; color: #666; margin-bottom: 15px; }
          .footer-info { display: flex; justify-content: space-between; font-size: 10px; color: #999; }
          @media print { 
            body { padding: 15px; } 
            @page { margin: 1cm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            ${logoUrl ? `<img src="${logoUrl}" class="logo-img" alt="Logo"/>` : '<div class="logo-placeholder">🚒</div>'}
            <div class="service-info">
              <div class="service-name">${nomService}</div>
              <div class="service-details">
                ${adresseService ? adresseService + '<br/>' : ''}
                ${telService ? 'Tél: ' + telService : ''} ${emailService ? ' | ' + emailService : ''}
              </div>
            </div>
          </div>
          <div class="facture-info">
            <div class="facture-titre">FACTURE</div>
            <div class="facture-numero">${numeroFacture}</div>
            <div class="facture-date">Date: ${new Date().toLocaleDateString('fr-CA')}</div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Facturé à</div>
          <div class="client-box">
            <div class="client-name">${facturation.info.municipalite_facturation}</div>
            ${facturation.info.entente?.adresse_facturation ? `<div>${facturation.info.entente.adresse_facturation}</div>` : ''}
            ${facturation.info.entente?.contact_nom ? `<div>Att: ${facturation.info.entente.contact_nom}</div>` : ''}
            ${facturation.info.entente?.contact_email ? `<div>Courriel: ${facturation.info.entente.contact_email}</div>` : ''}
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Détails de l'intervention</div>
          <div class="intervention-box">
            <div class="intervention-title">Dossier #${formData.external_call_id}</div>
            <div class="intervention-grid">
              <div class="intervention-item"><span class="intervention-label">Type:</span> ${formData.type_intervention || 'N/A'}</div>
              <div class="intervention-item"><span class="intervention-label">Durée:</span> ${facturation.duree_heures} heure(s)</div>
              <div class="intervention-item"><span class="intervention-label">Adresse:</span> ${formData.address_full || 'N/A'}</div>
              <div class="intervention-item"><span class="intervention-label">Municipalité:</span> ${formData.municipality || ''}</div>
              <div class="intervention-item" style="grid-column: span 2;"><span class="intervention-label">Date:</span> ${formData.xml_time_call_received ? new Date(formData.xml_time_call_received).toLocaleString('fr-CA') : 'N/A'}</div>
            </div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Détail des services rendus</div>
          <table>
            <thead>
              <tr>
                <th style="width: 50%;">Description</th>
                <th class="text-center" style="width: 15%;">Quantité</th>
                <th class="text-right" style="width: 17%;">Tarif</th>
                <th class="text-right" style="width: 18%;">Montant</th>
              </tr>
            </thead>
            <tbody>
              ${facturation.lignes.map(l => `
                <tr>
                  <td>${l.description}</td>
                  <td class="text-center">${l.quantite}</td>
                  <td class="text-right">${l.tarif}</td>
                  <td class="text-right">${l.montant.toFixed(2)} $</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="3" class="text-right">TOTAL À PAYER</td>
                <td class="text-right">${facturation.total.toFixed(2)} $</td>
              </tr>
            </tfoot>
          </table>
        </div>
        
        <div class="footer">
          <div class="footer-thanks">Merci pour votre collaboration dans le cadre de l'entraide municipale.</div>
          <div class="footer-info">
            <div>${nomService}</div>
            <div>Facture générée le ${new Date().toLocaleString('fr-CA')}</div>
          </div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };
  
  // Exporter en Excel avec mise en page
  const exporterExcel = async () => {
    if (!facturation) return;
    
    let numeroFacture = formData.facture_entraide_numero;
    
    // Si pas encore de facture officielle, en générer une
    if (!numeroFacture) {
      const facture = await genererFactureOfficielle();
      if (!facture) return;
      numeroFacture = facture.numero_facture;
    }
    
    const nomService = personnalisation?.nom_service || 'Service de Sécurité Incendie';
    
    // Charger dynamiquement xlsx
    const XLSX = await import('xlsx');
    
    // Créer les données pour Excel avec meilleure mise en page
    const wsData = [
      [nomService],
      ['FACTURE D\'ENTRAIDE MUNICIPALE'],
      [],
      ['N° Facture:', numeroFacture, '', 'Date:', new Date().toLocaleDateString('fr-CA')],
      [],
      ['═══════════════════════════════════════════════════════════════════════════'],
      ['FACTURÉ À'],
      ['═══════════════════════════════════════════════════════════════════════════'],
      ['Municipalité:', facturation.info.municipalite_facturation],
      ['Contact:', facturation.info.entente?.contact_nom || '-'],
      ['Courriel:', facturation.info.entente?.contact_email || '-'],
      ['Adresse:', facturation.info.entente?.adresse_facturation || '-'],
      [],
      ['═══════════════════════════════════════════════════════════════════════════'],
      ['INTERVENTION'],
      ['═══════════════════════════════════════════════════════════════════════════'],
      ['N° Dossier:', formData.external_call_id],
      ['Type:', formData.type_intervention || '-'],
      ['Adresse:', formData.address_full || '-'],
      ['Municipalité:', formData.municipality || '-'],
      ['Date/Heure:', formData.xml_time_call_received ? new Date(formData.xml_time_call_received).toLocaleString('fr-CA') : '-'],
      ['Durée totale:', facturation.duree_heures + ' heure(s)'],
      [],
      ['═══════════════════════════════════════════════════════════════════════════'],
      ['DÉTAIL DES SERVICES RENDUS'],
      ['═══════════════════════════════════════════════════════════════════════════'],
      [],
      ['Description', 'Quantité', 'Tarif unitaire', 'Montant'],
      ['───────────────────────────────────────', '─────────', '─────────────', '─────────'],
      ...facturation.lignes.map(l => [l.description, l.quantite, l.tarif, l.montant.toFixed(2) + ' $']),
      ['───────────────────────────────────────', '─────────', '─────────────', '─────────'],
      [],
      ['', '', 'TOTAL À PAYER:', facturation.total.toFixed(2) + ' $'],
      [],
      ['═══════════════════════════════════════════════════════════════════════════'],
      [],
      ['Merci pour votre collaboration dans le cadre de l\'entraide municipale.'],
      [],
      ['Facture générée le ' + new Date().toLocaleString('fr-CA')],
      [nomService]
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Ajuster les largeurs de colonnes
    ws['!cols'] = [{ wch: 45 }, { wch: 15 }, { wch: 18 }, { wch: 15 }];
    
    // Fusionner les cellules pour le titre
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, // Nom du service
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }, // Titre facture
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Facture');
    
    // Télécharger le fichier
    XLSX.writeFile(wb, `Facture_${numeroFacture}_${formData.external_call_id}.xlsx`);
    
    toast({ title: "Succès", description: "Fichier Excel téléchargé" });
  };
  
  if (loading) {
    return <div className="text-center py-8">Chargement des paramètres de facturation...</div>;
  }
  
  return (
    <div className="space-y-4">
      {/* Info sur la facturation */}
      <Card>
        <CardHeader className={facturationInfo?.facturable ? 'bg-green-50' : 'bg-gray-50'}>
          <CardTitle className="text-lg flex items-center gap-2">
            🧾 Facturation Entraide
            {facturationInfo?.facturable ? (
              <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">Facturable</span>
            ) : (
              <span className="text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded">Non facturable</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="mb-4">
            <p className="text-sm text-gray-600">
              <strong>Municipalité de l'intervention:</strong> {formData.municipality || formData.xml_municipality || 'Non définie'}
            </p>
            <p className="text-sm text-gray-600">
              <strong>Statut:</strong> {facturationInfo?.raison || 'En attente de calcul'}
            </p>
            {facturationInfo?.facturable && facturationInfo?.municipalite_facturation && (
              <p className="text-sm font-medium text-green-700 mt-2">
                💰 À facturer à: <strong>{facturationInfo.municipalite_facturation}</strong>
              </p>
            )}
          </div>
          
          {/* Données de facturation sauvegardées */}
          {formData.facturation && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
              <p className="text-sm text-blue-800">
                ✅ Facturation calculée le {new Date(formData.facturation.calculee_le).toLocaleString('fr-CA')}
              </p>
              <p className="text-sm text-blue-800">
                Total: <strong>{formData.facturation.total?.toFixed(2)} $</strong>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Détail de la facture */}
      {facturationInfo?.facturable && facturation && (
        <Card>
          <CardHeader className="bg-purple-50">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <CardTitle className="text-lg">📋 Détail de la facture</CardTitle>
              <div className="flex gap-2 flex-wrap">
                {editMode && (
                  <Button onClick={sauvegarderFacturation} size="sm" variant="outline">
                    💾 Sauvegarder
                  </Button>
                )}
                <Button onClick={genererPDF} size="sm" disabled={generatingFacture} className="bg-red-600 hover:bg-red-700">
                  {generatingFacture ? '⏳' : '📄'} PDF
                </Button>
                <Button onClick={exporterExcel} size="sm" disabled={generatingFacture} className="bg-green-600 hover:bg-green-700">
                  {generatingFacture ? '⏳' : '📊'} Excel
                </Button>
              </div>
            </div>
            {formData.facture_entraide_numero && (
              <p className="text-sm text-purple-700 mt-2">
                ✅ Facture officielle: <strong>{formData.facture_entraide_numero}</strong>
              </p>
            )}
          </CardHeader>
          <CardContent className="pt-4">
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <p className="text-sm"><strong>Durée de l'intervention:</strong> {facturation.duree_heures}h</p>
              {facturation.info.entente && (
                <p className="text-sm"><strong>Entente appliquée:</strong> {facturation.info.entente.municipalite_facturation}</p>
              )}
            </div>
            
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left p-2 border">Description</th>
                  <th className="text-center p-2 border">Quantité</th>
                  <th className="text-right p-2 border">Tarif</th>
                  <th className="text-right p-2 border">Montant</th>
                </tr>
              </thead>
              <tbody>
                {facturation.lignes.map((ligne, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="p-2 border">{ligne.description}</td>
                    <td className="p-2 border text-center">{ligne.quantite}</td>
                    <td className="p-2 border text-right">{ligne.tarif}</td>
                    <td className="p-2 border text-right font-medium">{ligne.montant.toFixed(2)} $</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-purple-100 font-bold">
                  <td colSpan={3} className="p-2 border text-right">TOTAL</td>
                  <td className="p-2 border text-right text-lg">{facturation.total.toFixed(2)} $</td>
                </tr>
              </tfoot>
            </table>
            
            {/* Coordonnées de facturation */}
            {facturation.info.entente && (
              <div className="mt-4 p-3 bg-gray-50 rounded">
                <h4 className="font-medium mb-2">📬 Coordonnées de facturation</h4>
                {facturation.info.entente.contact_nom && (
                  <p className="text-sm">Contact: {facturation.info.entente.contact_nom}</p>
                )}
                {facturation.info.entente.contact_email && (
                  <p className="text-sm">Courriel: {facturation.info.entente.contact_email}</p>
                )}
                {facturation.info.entente.adresse_facturation && (
                  <p className="text-sm">Adresse: {facturation.info.entente.adresse_facturation}</p>
                )}
              </div>
            )}
            
            {/* Spécialités (à ajouter si nécessaire) */}
            {editMode && (
              <div className="mt-4 border-t pt-4">
                <h4 className="font-medium mb-2">⭐ Ajouter une spécialité utilisée</h4>
                <div className="flex gap-2">
                  <select 
                    className="border rounded p-2 flex-1"
                    onChange={(e) => {
                      if (e.target.value) {
                        const specialites = formData.specialites_utilisees || [];
                        if (!specialites.find(s => s.type === e.target.value)) {
                          setFormData({
                            ...formData,
                            specialites_utilisees: [...specialites, { type: e.target.value, nom: e.target.value }]
                          });
                        }
                        e.target.value = '';
                      }
                    }}
                  >
                    <option value="">-- Sélectionner une spécialité --</option>
                    <option value="sauvetage_hauteur">Sauvetage en hauteur</option>
                    <option value="espace_clos">Espace clos</option>
                    <option value="nautique">Sauvetage nautique</option>
                    <option value="sumi">SUMI - Matières dangereuses</option>
                    <option value="autre_specialite">Autre spécialité</option>
                  </select>
                </div>
                {(formData.specialites_utilisees || []).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.specialites_utilisees.map((s, idx) => (
                      <span key={idx} className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm flex items-center gap-1">
                        ⭐ {s.nom || s.type}
                        <button 
                          onClick={() => setFormData({
                            ...formData,
                            specialites_utilisees: formData.specialites_utilisees.filter((_, i) => i !== idx)
                          })}
                          className="text-yellow-600 hover:text-red-600"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Non facturable */}
      {!facturationInfo?.facturable && (
        <Card>
          <CardContent className="pt-4">
            <div className="text-center py-8 text-gray-500">
              <p className="text-4xl mb-2">🏠</p>
              <p>Cette intervention n'est pas facturable car elle concerne une municipalité desservie par votre service.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SectionFacturation;
