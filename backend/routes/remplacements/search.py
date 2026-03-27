"""
Fonctions de recherche de remplaçants
=====================================

Algorithme de tri multi-niveaux pour trouver les meilleurs remplaçants:
- N0: Filtres absolus (compétences, conflits, indisponibilités)
- N1: Filtres secondaires (statut actif)
- N2-N5: Niveaux de priorité avec sous-tri par grade/fonction/équitabilité
"""

from typing import List, Dict, Any
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


async def trouver_remplacants_potentiels(
    db,
    tenant_id: str,
    type_garde_id: str,
    date_garde: str,
    demandeur_id: str,
    exclus_ids: List[str] = []
) -> List[Dict[str, Any]]:
    """
    Trouve les remplaçants potentiels selon la MÊME logique que le Planning:
    
    N0: Filtres absolus
        - Compétences requises
        - Pas d'assignation en conflit
        - Pas d'indisponibilité
        
    N1: Filtres secondaires
        - Statut actif
        
    Pour chaque niveau (N2, N3, N4, N5):
        Sous-tri par:
        1. Grade équivalent → équitabilité → équipe (si actif) → ancienneté
        2. Fonction supérieure → équitabilité → équipe (si actif) → ancienneté
        3. Autres → équitabilité → équipe (si actif) → ancienneté
    """
    try:
        # ==================== CHARGEMENT DES PARAMÈTRES ====================
        
        # Paramètres de remplacements
        parametres = await db.parametres_remplacements.find_one({"tenant_id": tenant_id})
        
        # Tenant pour les équipes de garde
        tenant = await db.tenants.find_one({"id": tenant_id})
        tenant_params = tenant.get("parametres", {}) if tenant else {}
        
        # IMPORTANT: Pour les remplacements, TOUS les niveaux sont TOUJOURS actifs
        # (contrairement au planning qui respecte les paramètres de tenant)
        niveau_2_actif = True  # Temps partiel DISPONIBLES
        niveau_3_actif = True  # Temps partiel STAND-BY
        niveau_4_actif = True  # Temps plein INCOMPLETS
        niveau_5_actif = True  # Heures supplémentaires
        
        # Paramètres équipe de garde
        params_equipes_garde = await db.parametres_equipes_garde.find_one({"tenant_id": tenant_id})
        equipes_garde_actif = params_equipes_garde.get("actif", False) if params_equipes_garde else False
        privilegier_equipe_garde = False
        if equipes_garde_actif and params_equipes_garde:
            config_temps_partiel = params_equipes_garde.get("temps_partiel", {})
            privilegier_equipe_garde = config_temps_partiel.get("privilegier_equipe_garde", False)
        
        logger.info(f"⚙️ Remplacements: Tous niveaux actifs (N2, N3, N4, N5 = True)")
        logger.info(f"⚙️ Équipe de garde - actif:{equipes_garde_actif}, prioriser:{privilegier_equipe_garde}")
        
        # Paramètres de remplacements
        competences_egales = parametres.get("competences_egales", False) if parametres else False
        
        # ==================== RÉCUPÉRATION DES DONNÉES ====================
        
        # Type de garde
        type_garde_data = await db.types_garde.find_one({"id": type_garde_id, "tenant_id": tenant_id})
        if not type_garde_data:
            logger.error(f"Type de garde non trouvé: {type_garde_id}")
            return []
        
        competences_requises = type_garde_data.get("competences_requises", [])
        duree_garde = type_garde_data.get("duree_heures", 8)
        est_garde_externe = type_garde_data.get("est_garde_externe", False)
        officier_obligatoire = type_garde_data.get("officier_obligatoire", False)
        heure_debut_garde = type_garde_data.get("heure_debut", "00:00")
        heure_fin_garde = type_garde_data.get("heure_fin", "23:59")
        
        # Fonction pour vérifier si deux plages horaires se chevauchent
        def plages_se_chevauchent(debut1: str, fin1: str, debut2: str, fin2: str) -> bool:
            """
            Vérifie si deux plages horaires se chevauchent.
            Format des heures: "HH:MM"
            Gère les gardes qui passent minuit (fin < début)
            """
            def heure_to_minutes(h: str) -> int:
                try:
                    parts = h.split(":")
                    return int(parts[0]) * 60 + int(parts[1])
                except:
                    return 0
            
            d1, f1 = heure_to_minutes(debut1), heure_to_minutes(fin1)
            d2, f2 = heure_to_minutes(debut2), heure_to_minutes(fin2)
            
            # Gestion des gardes qui passent minuit
            # Si fin < début, c'est une garde de nuit (ex: 22:00 - 06:00)
            if f1 < d1:
                f1 += 24 * 60  # Ajouter 24h
            if f2 < d2:
                f2 += 24 * 60
            
            # Deux plages se chevauchent si le début de l'une est avant la fin de l'autre
            return d1 < f2 and d2 < f1
        
        logger.info(f"🕐 Type de garde demandé: {type_garde_data.get('nom')} ({heure_debut_garde} - {heure_fin_garde})")
        
        # ==================== RÉCUPÉRATION DES GRADES ====================
        grades_list = await db.grades.find({"tenant_id": tenant_id}).to_list(100)
        grades_map = {g.get("nom"): g for g in grades_list}
        
        def est_officier_grade(grade_nom: str) -> bool:
            """Vérifie si un grade est considéré comme officier"""
            grade_info = grades_map.get(grade_nom, {})
            return grade_info.get("est_officier", False) == True
        
        def est_eligible_fonction_superieure(user_data: dict) -> bool:
            """Vérifie si l'utilisateur peut opérer en fonction supérieure"""
            return user_data.get("fonction_superieur", False) == True
        
        # Demandeur
        demandeur = await db.users.find_one({"id": demandeur_id, "tenant_id": tenant_id})
        demandeur_grade = demandeur.get("grade", "pompier") if demandeur else "pompier"
        demandeur_grade_lower = demandeur_grade.lower() if demandeur_grade else "pompier"
        demandeur_competences = set(demandeur.get("competences", [])) if demandeur else set()
        
        # ==================== RÈGLE OFFICIER ====================
        # La règle officier s'applique SEULEMENT si:
        # 1. Le type de garde nécessite un officier (officier_obligatoire = True)
        # 2. Le demandeur est officier
        # 3. ET il n'y a PAS d'autre officier déjà assigné à cette garde à cette date
        #
        # Si un autre officier est déjà assigné, la règle est respectée même si le remplaçant n'est pas officier
        
        demandeur_est_officier = est_officier_grade(demandeur_grade)
        besoin_officier_remplacement = False
        
        if officier_obligatoire and demandeur_est_officier:
            # Vérifier s'il y a d'autres officiers assignés à cette garde à cette date
            autres_assignations = await db.assignations.find({
                "tenant_id": tenant_id,
                "type_garde_id": type_garde_id,
                "date": date_garde,
                "user_id": {"$ne": demandeur_id}  # Exclure le demandeur
            }).to_list(100)
            
            # Vérifier si au moins un des autres assignés est officier
            autre_officier_present = False
            for assignation in autres_assignations:
                autre_user = await db.users.find_one({"id": assignation["user_id"], "tenant_id": tenant_id})
                if autre_user:
                    autre_grade = autre_user.get("grade", "")
                    if est_officier_grade(autre_grade):
                        autre_officier_present = True
                        logger.info(f"🎖️ Autre officier trouvé sur cette garde: {autre_user.get('prenom', '')} {autre_user.get('nom', '')} ({autre_grade})")
                        break
            
            # La règle s'applique SEULEMENT s'il n'y a pas d'autre officier
            besoin_officier_remplacement = not autre_officier_present
            
            if besoin_officier_remplacement:
                logger.info(f"🎖️ RÈGLE OFFICIER ACTIVE: Le remplaçant doit être officier ou éligible")
                logger.info(f"🎖️ Le demandeur {demandeur.get('prenom', '')} {demandeur.get('nom', '')} est le SEUL officier sur cette garde")
            else:
                logger.info(f"🎖️ Règle officier NON ACTIVE: Un autre officier est déjà présent sur cette garde")
        
        logger.info(f"🎖️ officier_obligatoire={officier_obligatoire}, demandeur_est_officier={demandeur_est_officier}, besoin_officier_remplacement={besoin_officier_remplacement}")
        
        # Hiérarchie des grades (fallback si pas en DB)
        grades_hierarchie = {
            "pompier": 1,
            "lieutenant": 2,
            "capitaine": 3,
            "chef": 4,
            "chef aux opérations": 5,
            "directeur": 6,
            "eligible": 2,
            "éligible": 2
        }
        
        def get_niveau_hierarchique(grade_nom: str) -> int:
            """Retourne le niveau hiérarchique d'un grade (depuis DB ou fallback)"""
            grade_info = grades_map.get(grade_nom, {})
            niveau_db = grade_info.get("niveau_hierarchique")
            if niveau_db is not None:
                return niveau_db
            return grades_hierarchie.get(grade_nom.lower() if grade_nom else "", 1)
        
        demandeur_grade_niveau = get_niveau_hierarchique(demandeur_grade)
        
        # Tous les utilisateurs actifs
        exclus_ids_set = set(exclus_ids + [demandeur_id])
        users_cursor = db.users.find({
            "tenant_id": tenant_id,
            "id": {"$nin": list(exclus_ids_set)},
            "statut": "Actif"
        })
        users_list = await users_cursor.to_list(length=None)
        
        # ==================== FILTRE MULTI-CASERNES ====================
        # Si le type de garde est "par_caserne" et que le multi-casernes est actif,
        # ne chercher des remplacants que parmi les employes de la meme caserne
        mode_caserne = type_garde_data.get("mode_caserne", "global")
        if mode_caserne == "par_caserne":
            tenant_mc = await db.tenants.find_one({"id": tenant_id}, {"_id": 0, "multi_casernes_actif": 1})
            if tenant_mc and tenant_mc.get("multi_casernes_actif", False):
                # Trouver la caserne de l'assignation originale
                assignation_originale = await db.assignations.find_one({
                    "tenant_id": tenant_id,
                    "user_id": demandeur_id,
                    "type_garde_id": type_garde_id,
                    "date": date_garde
                }, {"_id": 0, "caserne_id": 1})
                
                caserne_id_filtre = assignation_originale.get("caserne_id") if assignation_originale else None
                
                if caserne_id_filtre:
                    nb_avant = len(users_list)
                    users_list = [
                        u for u in users_list
                        if caserne_id_filtre in (u.get("caserne_ids") or [])
                    ]
                    caserne_info = await db.casernes.find_one({"id": caserne_id_filtre}, {"_id": 0, "nom": 1})
                    caserne_nom = caserne_info.get("nom", caserne_id_filtre[:8]) if caserne_info else caserne_id_filtre[:8]
                    logger.info(f"🏢 [MULTI-CASERNES] Remplacements filtres par caserne '{caserne_nom}': {len(users_list)}/{nb_avant} candidats")
                else:
                    # Fallback: utiliser les casernes du demandeur
                    demandeur_casernes = demandeur.get("caserne_ids", []) if demandeur else []
                    if demandeur_casernes:
                        nb_avant = len(users_list)
                        users_list = [
                            u for u in users_list
                            if any(cid in (u.get("caserne_ids") or []) for cid in demandeur_casernes)
                        ]
                        logger.info(f"🏢 [MULTI-CASERNES] Remplacements filtres par casernes du demandeur: {len(users_list)}/{nb_avant} candidats")
        
        logger.info(f"🔍 Recherche remplacants pour date={date_garde}, type_garde={type_garde_id}")
        logger.info(f"🔍 {len(users_list)} employes actifs (excluant {len(exclus_ids)} deja contactes + demandeur)")
        if exclus_ids:
            logger.info(f"🔍 IDs exclus (déjà contactés): {exclus_ids}")
        
        # Calculer les heures mensuelles pour l'équitabilité
        debut_mois = datetime.strptime(date_garde, "%Y-%m-%d").replace(day=1)
        fin_mois = (debut_mois + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        
        user_monthly_hours = {}
        for user in users_list:
            assignations_mois = await db.assignations.find({
                "user_id": user["id"],
                "tenant_id": tenant_id,
                "date": {
                    "$gte": debut_mois.strftime("%Y-%m-%d"),
                    "$lte": fin_mois.strftime("%Y-%m-%d")
                }
            }).to_list(1000)
            user_monthly_hours[user["id"]] = sum(8 for _ in assignations_mois)
        
        # Calculer l'équipe de garde du jour si actif
        equipe_garde_du_jour = None
        if privilegier_equipe_garde and params_equipes_garde:
            config_tp = params_equipes_garde.get("temps_partiel", {})
            if config_tp.get("rotation_active"):
                from routes.equipes_garde import get_equipe_garde_du_jour_sync
                equipe_garde_du_jour = get_equipe_garde_du_jour_sync(
                    type_rotation=config_tp.get("type_rotation", "hebdomadaire"),
                    date_reference=config_tp.get("date_reference", date_garde),
                    date_cible=date_garde,
                    nombre_equipes=config_tp.get("nombre_equipes", 2),
                    pattern_mode=config_tp.get("pattern_mode", "hebdomadaire"),
                    pattern_personnalise=config_tp.get("pattern_personnalise", []),
                    duree_cycle=config_tp.get("duree_cycle", 14),
                    jour_rotation=config_tp.get("jour_rotation") or "monday",
                    heure_rotation=config_tp.get("heure_rotation") or "18:00",
                    heure_actuelle="12:00"
                )
                logger.info(f"📊 Équipe de garde du jour: {equipe_garde_du_jour}")
        
        # ==================== CLASSIFICATION DES CANDIDATS ====================
        
        # Structure: niveau -> liste de candidats
        candidats_par_niveau = {2: [], 3: [], 4: [], 5: []}
        
        for user in users_list:
            user_name = f"{user.get('prenom', '')} {user.get('nom', '')}"
            user_id = user["id"]
            user_grade = user.get("grade", "pompier")
            user_grade_lower = user_grade.lower() if user_grade else "pompier"
            user_grade_niveau = get_niveau_hierarchique(user_grade)
            user_fonction_superieure = user.get("fonction_superieur", False)
            user_type_emploi = user.get("type_emploi", "temps_partiel")
            user_heures_max = user.get("heures_max_semaine", 40)
            date_embauche = user.get("date_embauche", "2999-12-31")
            user_equipe_garde = user.get("equipe_garde")
            
            # ========== N0: FILTRE COMPÉTENCES ==========
            # Normaliser les compétences (lowercase, strip) pour comparaison insensible à la casse
            def normalize_competences(comp_list):
                return set(c.lower().strip() for c in comp_list if c)
            
            if competences_egales:
                user_competences_norm = normalize_competences(user.get("competences", []))
                demandeur_competences_norm = normalize_competences(list(demandeur_competences))
                if demandeur_competences_norm and not demandeur_competences_norm.issubset(user_competences_norm):
                    manquantes = demandeur_competences_norm - user_competences_norm
                    logger.info(f"❌ {user_name} - N0: Compétences insuffisantes (manque: {manquantes})")
                    continue
            
            if competences_requises:
                user_competences_norm = normalize_competences(user.get("competences", []))
                competences_requises_norm = normalize_competences(competences_requises)
                if not competences_requises_norm.issubset(user_competences_norm):
                    manquantes = competences_requises_norm - user_competences_norm
                    logger.info(f"❌ {user_name} - N0: Compétences garde insuffisantes (requises: {list(competences_requises_norm)}, a: {list(user_competences_norm)}, manque: {list(manquantes)})")
                    continue
            
            # ========== N0: FILTRE INDISPONIBILITÉ ==========
            indispo = await db.disponibilites.find_one({
                "user_id": user_id,
                "tenant_id": tenant_id,
                "date": date_garde,
                "statut": "indisponible"
            })
            if indispo:
                logger.info(f"❌ {user_name} - N0: Indisponible déclaré pour {date_garde}")
                continue
            
            # ========== N0: FILTRE RÈGLE OFFICIER ==========
            # Si la règle officier est active, seuls les officiers ou éligibles peuvent remplacer
            if besoin_officier_remplacement:
                user_est_officier = est_officier_grade(user_grade)
                user_est_eligible = est_eligible_fonction_superieure(user)
                
                if not user_est_officier and not user_est_eligible:
                    logger.info(f"❌ {user_name} - N0: Règle officier - n'est pas officier ni éligible (grade={user_grade})")
                    continue
                else:
                    officier_tag = "OFFICIER" if user_est_officier else "ÉLIGIBLE"
                    logger.info(f"✅ {user_name} - Règle officier OK [{officier_tag}]")
            
            # ========== N1: FILTRE ASSIGNATION EN CONFLIT (avec chevauchement horaire) ==========
            # On vérifie si le candidat a une assignation qui CHEVAUCHE les horaires de la garde demandée
            assignations_ce_jour = await db.assignations.find({
                "user_id": user_id,
                "tenant_id": tenant_id,
                "date": date_garde
            }).to_list(10)
            
            conflit_horaire = False
            garde_en_conflit = None
            for assignation in assignations_ce_jour:
                # Récupérer le type de garde de cette assignation
                type_garde_assignation = await db.types_garde.find_one({
                    "id": assignation.get("type_garde_id"),
                    "tenant_id": tenant_id
                })
                if type_garde_assignation:
                    heure_debut_existante = type_garde_assignation.get("heure_debut", "00:00")
                    heure_fin_existante = type_garde_assignation.get("heure_fin", "23:59")
                    
                    # Vérifier si les horaires se chevauchent
                    if plages_se_chevauchent(heure_debut_garde, heure_fin_garde, heure_debut_existante, heure_fin_existante):
                        conflit_horaire = True
                        garde_en_conflit = f"{type_garde_assignation.get('nom', 'Inconnu')} ({heure_debut_existante}-{heure_fin_existante})"
                        break
                    else:
                        logger.info(f"ℹ️ {user_name} - Assigné à {type_garde_assignation.get('nom')} ({heure_debut_existante}-{heure_fin_existante}) mais PAS de chevauchement avec {heure_debut_garde}-{heure_fin_garde}")
            
            if conflit_horaire:
                logger.info(f"❌ {user_name} - N1: Conflit horaire avec {garde_en_conflit}")
                continue
            
            # ========== CALCULS COMMUNS ==========
            
            # Disponibilité déclarée
            dispo = await db.disponibilites.find_one({
                "user_id": user_id,
                "tenant_id": tenant_id,
                "date": date_garde,
                "statut": "disponible"
            })
            has_disponibilite = dispo is not None
            
            # Heures de la semaine
            semaine_debut = datetime.strptime(date_garde, "%Y-%m-%d")
            while semaine_debut.weekday() != 0:
                semaine_debut -= timedelta(days=1)
            semaine_fin = semaine_debut + timedelta(days=6)
            
            assignations_semaine = await db.assignations.find({
                "user_id": user_id,
                "tenant_id": tenant_id,
                "date": {
                    "$gte": semaine_debut.strftime("%Y-%m-%d"),
                    "$lte": semaine_fin.strftime("%Y-%m-%d")
                }
            }).to_list(1000)
            
            heures_travaillees = sum(8 for _ in assignations_semaine)
            depasserait_max = (heures_travaillees + duree_garde) > user_heures_max
            
            # Grade équivalent ou fonction supérieure
            est_grade_equivalent = user_grade_niveau == demandeur_grade_niveau
            est_fonction_superieure = user_fonction_superieure and user_grade_niveau == demandeur_grade_niveau - 1
            
            # Priorité grade: 1=équivalent, 2=fonction sup, 3=autre
            if est_grade_equivalent:
                grade_priorite = 1
            elif est_fonction_superieure:
                grade_priorite = 2
            else:
                grade_priorite = 3
            
            # Priorité équipe de garde: 0=membre équipe garde, 1=autre
            equipe_priorite = 1
            if privilegier_equipe_garde and equipe_garde_du_jour and est_garde_externe:
                if user_equipe_garde == equipe_garde_du_jour:
                    equipe_priorite = 0
            
            # Équitabilité (heures mensuelles)
            heures_mois = user_monthly_hours.get(user_id, 0)
            
            # Données du candidat
            candidat_data = {
                "user_id": user_id,
                "nom_complet": user_name,
                "email": user.get("email", ""),
                "telephone": user.get("telephone", ""),
                "grade": user_grade,
                "date_embauche": date_embauche,
                "has_disponibilite": has_disponibilite,
                "formations": list(set(user.get("competences", []))),
                "type_emploi": user_type_emploi,
                "heures_travaillees": heures_travaillees,
                "heures_max": user_heures_max,
                "heures_mois": heures_mois,
                "fonction_superieure": user_fonction_superieure,
                "equipe_garde": user_equipe_garde,
                # Clés de tri
                "grade_priorite": grade_priorite,
                "equipe_priorite": equipe_priorite
            }
            
            # ========== CLASSIFICATION PAR NIVEAU ==========
            
            # N2: Temps partiel DISPONIBLES
            if niveau_2_actif and user_type_emploi in ["temps_partiel", "temporaire"] and has_disponibilite and not depasserait_max:
                candidat_data["niveau"] = 2
                candidat_data["raison"] = f"N2 - TP Dispo (grade_prio:{grade_priorite}, équité:{heures_mois}h)"
                candidats_par_niveau[2].append(candidat_data.copy())
                logger.info(f"✅ {user_name} → N2")
                continue
            
            # N3: Temps partiel STAND-BY
            if niveau_3_actif and user_type_emploi in ["temps_partiel", "temporaire"] and not has_disponibilite and not depasserait_max:
                candidat_data["niveau"] = 3
                candidat_data["raison"] = f"N3 - TP Stand-by (grade_prio:{grade_priorite}, équité:{heures_mois}h)"
                candidats_par_niveau[3].append(candidat_data.copy())
                logger.info(f"✅ {user_name} → N3")
                continue
            
            # N4: Temps plein INCOMPLETS
            if niveau_4_actif and user_type_emploi == "temps_plein" and not depasserait_max:
                candidat_data["niveau"] = 4
                candidat_data["raison"] = f"N4 - TP Incomplet (grade_prio:{grade_priorite}, équité:{heures_mois}h)"
                candidats_par_niveau[4].append(candidat_data.copy())
                logger.info(f"✅ {user_name} → N4")
                continue
            
            # N5: Heures supplémentaires
            if niveau_5_actif and depasserait_max:
                # Temps partiel doit avoir une dispo pour heures sup
                if user_type_emploi in ["temps_partiel", "temporaire"]:
                    if not has_disponibilite:
                        logger.debug(f"❌ {user_name} - N5: TP sans dispo")
                        continue
                
                candidat_data["niveau"] = 5
                candidat_data["raison"] = f"N5 - Heures sup (grade_prio:{grade_priorite}, équité:{heures_mois}h)"
                candidats_par_niveau[5].append(candidat_data.copy())
                logger.info(f"✅ {user_name} → N5")
                continue
            
            logger.info(f"⚠️ {user_name} exclu - type:{user_type_emploi}, dispo:{has_disponibilite}, depasseMax:{depasserait_max}, N2:{niveau_2_actif}, N3:{niveau_3_actif}, N4:{niveau_4_actif}, N5:{niveau_5_actif}")
        
        # ==================== TRI ET ASSEMBLAGE FINAL ====================
        # Ordre de tri:
        # 1. Grade priorité (1=équivalent, 2=fonction sup, 3=autre)
        # 2. Équipe de garde (0=membre équipe, 1=autre) - privilégié mais pas restrictif
        # 3. Équitabilité (heures_mois - moins d'heures = priorité)
        # 4. Ancienneté (date_embauche - plus ancien = priorité)
        
        def sort_key(candidat):
            return (
                candidat.get("grade_priorite", 3),      # 1=grade equiv, 2=fonction sup, 3=autre
                candidat.get("equipe_priorite", 1),     # 0=membre équipe garde, 1=autre
                candidat.get("heures_mois", 999),       # Équitabilité: moins d'heures = priorité
                candidat.get("date_embauche", "2999-12-31")  # Ancienneté: plus ancien = priorité
            )
        
        remplacants_potentiels = []
        
        # Log de résumé par niveau
        logger.info(f"📊 Résumé par niveau: N2={len(candidats_par_niveau[2])}, N3={len(candidats_par_niveau[3])}, N4={len(candidats_par_niveau[4])}, N5={len(candidats_par_niveau[5])}")
        
        for niveau in [2, 3, 4, 5]:
            candidats = candidats_par_niveau[niveau]
            candidats_tries = sorted(candidats, key=sort_key)
            remplacants_potentiels.extend(candidats_tries)
        
        logger.info(f"✅ Trouvé {len(remplacants_potentiels)} remplaçants potentiels (tri: grade → équipe → équité → ancienneté):")
        for i, c in enumerate(remplacants_potentiels[:15]):
            equipe_info = f", équipe:{c.get('equipe_garde')}" if c.get('equipe_garde') else ""
            logger.info(f"   {i+1}. {c['nom_complet']} - N{c.get('niveau')} - grade_prio:{c.get('grade_priorite')}, {c.get('heures_mois')}h/mois{equipe_info}")
        
        return remplacants_potentiels
        
    except Exception as e:
        logger.error(f"❌ Erreur lors de la recherche de remplaçants: {e}", exc_info=True)
        return []
