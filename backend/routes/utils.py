"""
Routes utilitaires et de démonstration
Contient les endpoints pour:
- Réparation des mots de passe demo
- Nettoyage des duplicatas
- Initialisation des données de démonstration
"""

from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone, timedelta
import uuid
import logging

router = APIRouter(tags=["Utils"])


def get_db():
    """Import db from server to avoid circular imports"""
    from server import db
    return db


def get_password_hash(password: str) -> str:
    """Import get_password_hash from server"""
    from server import get_password_hash as _get_password_hash
    return _get_password_hash(password)


def get_current_user():
    """Import get_current_user from server"""
    from server import get_current_user as _get_current_user
    return _get_current_user


# ==================== REPAIR PASSWORDS ====================

@router.post("/repair-demo-passwords")
async def repair_demo_passwords():
    """Répare les mots de passe des comptes de démonstration"""
    db = get_db()
    try:
        password_fixes = [
            ("admin@firemanager.ca", "admin123"),
            ("superviseur@firemanager.ca", "superviseur123"),
            ("employe@firemanager.ca", "employe123"),
            ("partiel@firemanager.ca", "partiel123")
        ]
        
        fixed_count = 0
        for email, password in password_fixes:
            user = await db.users.find_one({"email": email})
            if user:
                new_hash = get_password_hash(password)
                await db.users.update_one(
                    {"email": email},
                    {"$set": {"mot_de_passe_hash": new_hash}}
                )
                fixed_count += 1
                print(f"Fixed password for {email}")
        
        return {"message": f"{fixed_count} mots de passe démo réparés"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.post("/fix-all-passwords")
async def fix_all_passwords():
    """Répare tous les mots de passe des comptes de démonstration"""
    db = get_db()
    try:
        password_fixes = [
            ("admin@firemanager.ca", "admin123"),
            ("superviseur@firemanager.ca", "superviseur123"),
            ("employe@firemanager.ca", "employe123"),
            ("partiel@firemanager.ca", "partiel123")
        ]
        
        fixed_count = 0
        for email, password in password_fixes:
            user = await db.users.find_one({"email": email})
            if user:
                new_hash = get_password_hash(password)
                await db.users.update_one(
                    {"email": email},
                    {"$set": {"mot_de_passe_hash": new_hash}}
                )
                fixed_count += 1
                print(f"Fixed password for {email}")
        
        return {"message": f"{fixed_count} mots de passe réparés"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.post("/fix-admin-password")
async def fix_admin_password():
    """Répare le mot de passe du compte admin"""
    db = get_db()
    try:
        admin_user = await db.users.find_one({"email": "admin@firemanager.ca"})
        if admin_user:
            new_password_hash = get_password_hash("admin123")
            await db.users.update_one(
                {"email": "admin@firemanager.ca"},
                {"$set": {"mot_de_passe_hash": new_password_hash}}
            )
            return {"message": "Mot de passe admin réparé"}
        else:
            return {"message": "Compte admin non trouvé"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


# ==================== CLEANUP ====================

@router.post("/cleanup-duplicates")
async def cleanup_duplicates():
    """Nettoie les formations et types de garde en double"""
    db = get_db()
    try:
        # Clean formations duplicates - keep only unique ones by name
        formations = await db.formations.find().to_list(1000)
        unique_formations = {}
        
        for formation in formations:
            name = formation['nom']
            if name not in unique_formations:
                unique_formations[name] = formation
        
        # Delete all formations and re-insert unique ones
        await db.formations.delete_many({})
        
        if unique_formations:
            formations_to_insert = []
            for formation in unique_formations.values():
                formation.pop('_id', None)
                formations_to_insert.append(formation)
            
            await db.formations.insert_many(formations_to_insert)
        
        # Clean types garde duplicates
        types_garde = await db.types_garde.find().to_list(1000)
        unique_types = {}
        
        for type_garde in types_garde:
            key = f"{type_garde['nom']}_{type_garde['heure_debut']}_{type_garde['heure_fin']}"
            if key not in unique_types:
                unique_types[key] = type_garde
        
        # Delete all types garde and re-insert unique ones
        await db.types_garde.delete_many({})
        
        if unique_types:
            types_to_insert = []
            for type_garde in unique_types.values():
                type_garde.pop('_id', None)
                types_to_insert.append(type_garde)
            
            await db.types_garde.insert_many(types_to_insert)
        
        formations_count = len(unique_formations)
        types_count = len(unique_types)
        
        return {
            "message": f"Nettoyage terminé: {formations_count} formations uniques, {types_count} types de garde uniques"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors du nettoyage: {str(e)}")


# ==================== DEMO DATA INITIALIZATION ====================

@router.post("/init-demo-data-realiste")
async def init_demo_data_realiste():
    """Crée des données de démonstration réalistes avec historique"""
    db = get_db()
    from server import User, Formation, Assignation
    
    try:
        # Clear existing data
        await db.users.delete_many({})
        await db.types_garde.delete_many({})
        await db.assignations.delete_many({})
        await db.planning.delete_many({})
        await db.demandes_remplacement.delete_many({})
        await db.formations.delete_many({})
        await db.sessions_formation.delete_many({})
        await db.disponibilites.delete_many({})
        
        # Créer utilisateurs réalistes
        demo_users = [
            {
                "nom": "Dupont", "prenom": "Jean", "email": "admin@firemanager.ca",
                "telephone": "514-111-2233", "contact_urgence": "514-999-1111",
                "grade": "Directeur", "fonction_superieur": False, "type_emploi": "temps_plein",
                "heures_max_semaine": 40, "role": "admin", "numero_employe": "ADM001",
                "date_embauche": "14/01/2020", "formations": [], "mot_de_passe": "admin123"
            },
            {
                "nom": "Dubois", "prenom": "Sophie", "email": "superviseur@firemanager.ca",
                "telephone": "514-444-5566", "contact_urgence": "514-888-2222",
                "grade": "Directeur", "fonction_superieur": False, "type_emploi": "temps_plein",
                "heures_max_semaine": 40, "role": "superviseur", "numero_employe": "POM001",
                "date_embauche": "07/01/2022", "formations": [], "mot_de_passe": "superviseur123"
            },
            {
                "nom": "Bernard", "prenom": "Pierre", "email": "employe@firemanager.ca",
                "telephone": "418-555-9999", "contact_urgence": "418-777-3333",
                "grade": "Capitaine", "fonction_superieur": False, "type_emploi": "temps_plein",
                "heures_max_semaine": 40, "role": "employe", "numero_employe": "POM002",
                "date_embauche": "21/09/2019", "formations": [], "mot_de_passe": "employe123"
            },
            {
                "nom": "Garcia", "prenom": "Claire", "email": "partiel@firemanager.ca",
                "telephone": "514-888-9900", "contact_urgence": "514-666-4444",
                "grade": "Pompier", "fonction_superieur": False, "type_emploi": "temps_partiel",
                "heures_max_semaine": 25, "role": "employe", "numero_employe": "POM005",
                "date_embauche": "02/11/2020", "formations": [], "mot_de_passe": "partiel123"
            },
            {
                "nom": "Tremblay", "prenom": "Marc", "email": "marc.tremblay@firemanager.ca",
                "telephone": "418-222-3333", "contact_urgence": "418-999-4444",
                "grade": "Lieutenant", "fonction_superieur": False, "type_emploi": "temps_plein",
                "heures_max_semaine": 40, "role": "employe", "numero_employe": "POM003",
                "date_embauche": "15/03/2021", "formations": [], "mot_de_passe": "TempPass123!"
            },
            {
                "nom": "Martin", "prenom": "Sarah", "email": "sarah.martin@firemanager.ca",
                "telephone": "514-333-4444", "contact_urgence": "514-777-8888",
                "grade": "Pompier", "fonction_superieur": True, "type_emploi": "temps_partiel",
                "heures_max_semaine": 20, "role": "employe", "numero_employe": "POM006",
                "date_embauche": "10/08/2023", "formations": [], "mot_de_passe": "TempPass123!"
            }
        ]
        
        # Créer formations
        demo_formations = [
            {"nom": "Classe 4A", "description": "Formation de conduite véhicules lourds", "duree_heures": 40, "validite_mois": 60, "obligatoire": False},
            {"nom": "Désincarcération", "description": "Techniques de désincarcération", "duree_heures": 24, "validite_mois": 36, "obligatoire": True},
            {"nom": "Pompier 1", "description": "Formation de base pompier niveau 1", "duree_heures": 200, "validite_mois": 24, "obligatoire": True},
            {"nom": "Officier 2", "description": "Formation officier niveau 2", "duree_heures": 120, "validite_mois": 36, "obligatoire": False},
            {"nom": "Premiers Répondants", "description": "Formation premiers secours", "duree_heures": 16, "validite_mois": 12, "obligatoire": True},
            {"nom": "Sauvetage Aquatique", "description": "Techniques de sauvetage en milieu aquatique", "duree_heures": 32, "validite_mois": 24, "obligatoire": False}
        ]
        
        formation_ids = {}
        for formation_data in demo_formations:
            formation_obj = Formation(**formation_data)
            await db.formations.insert_one(formation_obj.dict())
            formation_ids[formation_data["nom"]] = formation_obj.id
        
        # Assigner formations aux utilisateurs
        demo_users[0]["formations"] = [formation_ids["Officier 2"], formation_ids["Pompier 1"]]
        demo_users[1]["formations"] = [formation_ids["Pompier 1"], formation_ids["Premiers Répondants"]]
        demo_users[2]["formations"] = [formation_ids["Classe 4A"], formation_ids["Désincarcération"], formation_ids["Premiers Répondants"]]
        demo_users[3]["formations"] = [formation_ids["Pompier 1"]]
        demo_users[4]["formations"] = [formation_ids["Désincarcération"], formation_ids["Premiers Répondants"], formation_ids["Sauvetage Aquatique"]]
        demo_users[5]["formations"] = [formation_ids["Pompier 1"], formation_ids["Premiers Répondants"]]
        
        # Créer utilisateurs
        user_ids = {}
        for user_data in demo_users:
            user_dict = user_data.copy()
            user_dict["mot_de_passe_hash"] = get_password_hash(user_dict.pop("mot_de_passe"))
            user_dict["statut"] = "Actif"
            user_obj = User(**user_dict)
            await db.users.insert_one(user_obj.dict())
            user_ids[user_data["email"]] = user_obj.id
        
        # Créer assignations historiques (3 mois)
        assignations_created = 0
        for week_offset in range(-12, 1):
            week_start = datetime.now(timezone.utc).date() + timedelta(weeks=week_offset)
            week_start = week_start - timedelta(days=week_start.weekday())
            
            for day_offset in range(7):
                date_assignation = week_start + timedelta(days=day_offset)
                date_str = date_assignation.strftime("%Y-%m-%d")
                
                if assignations_created % 3 == 0:
                    assignation_obj = Assignation(
                        user_id=user_ids["employe@firemanager.ca"],
                        type_garde_id="garde-interne-am",
                        date=date_str,
                        assignation_type="auto"
                    )
                    await db.assignations.insert_one(assignation_obj.dict())
                    assignations_created += 1
        
        return {"message": f"Données de démonstration réalistes créées : {len(demo_users)} utilisateurs, {len(demo_formations)} formations, {assignations_created} assignations historiques"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.post("/init-demo-data")
async def init_demo_data():
    """Initialise les données de démonstration de base"""
    db = get_db()
    from server import User, TypeGarde
    
    # Clear existing data
    await db.users.delete_many({})
    await db.types_garde.delete_many({})
    await db.assignations.delete_many({})
    await db.planning.delete_many({})
    await db.demandes_remplacement.delete_many({})
    
    # Create demo users
    demo_users = [
        {
            "nom": "Dupont", "prenom": "Jean", "email": "admin@firemanager.ca",
            "telephone": "514-111-2233", "contact_urgence": "514-999-1111",
            "grade": "Directeur", "type_emploi": "temps_plein",
            "heures_max_semaine": 40, "role": "admin", "numero_employe": "ADM001",
            "date_embauche": "14/01/2020", "formations": [], "mot_de_passe": "admin123"
        },
        {
            "nom": "Dubois", "prenom": "Sophie", "email": "superviseur@firemanager.ca",
            "telephone": "514-444-5566", "contact_urgence": "514-888-2222",
            "grade": "Directeur", "type_emploi": "temps_plein",
            "heures_max_semaine": 40, "role": "superviseur", "numero_employe": "POM001",
            "date_embauche": "07/01/2022", "formations": [], "mot_de_passe": "superviseur123"
        },
        {
            "nom": "Bernard", "prenom": "Pierre", "email": "employe@firemanager.ca",
            "telephone": "418-555-9999", "contact_urgence": "418-777-3333",
            "grade": "Capitaine", "type_emploi": "temps_plein",
            "heures_max_semaine": 40, "role": "employe", "numero_employe": "POM002",
            "date_embauche": "21/09/2019", "formations": [], "mot_de_passe": "employe123"
        },
        {
            "nom": "Garcia", "prenom": "Claire", "email": "partiel@firemanager.ca",
            "telephone": "514-888-9900", "contact_urgence": "514-666-4444",
            "grade": "Pompier", "type_emploi": "temps_partiel",
            "heures_max_semaine": 25, "role": "employe", "numero_employe": "POM005",
            "date_embauche": "02/11/2020", "formations": [], "mot_de_passe": "partiel123"
        }
    ]
    
    # Create users
    for user_data in demo_users:
        user_dict = user_data.copy()
        user_dict["mot_de_passe_hash"] = get_password_hash(user_dict.pop("mot_de_passe"))
        user_dict["statut"] = "Actif"
        user_obj = User(**user_dict)
        await db.users.insert_one(user_obj.dict())
    
    # Create types de garde
    demo_types_garde = [
        {"nom": "Garde Interne Nuit", "heure_debut": "18:00", "heure_fin": "06:00", "heures": 12, "couleur": "#6B21A8"},
        {"nom": "Garde Interne Jour", "heure_debut": "06:00", "heure_fin": "18:00", "heures": 12, "couleur": "#2563EB"},
        {"nom": "Garde Externe", "heure_debut": "08:00", "heure_fin": "16:00", "heures": 8, "couleur": "#059669"},
        {"nom": "Formation", "heure_debut": "09:00", "heure_fin": "17:00", "heures": 8, "couleur": "#D97706"}
    ]
    
    for type_garde_data in demo_types_garde:
        type_garde_obj = TypeGarde(**type_garde_data)
        await db.types_garde.insert_one(type_garde_obj.dict())
    
    return {
        "message": f"Données de démonstration créées: {len(demo_users)} utilisateurs, {len(demo_types_garde)} types de garde"
    }


# ==================== DEBUG: TEST JOB RAPPEL INSPECTION EPI ====================

@router.post("/debug/test-job-rappel-inspection-epi/{tenant_slug}")
async def test_job_rappel_inspection_epi(tenant_slug: str):
    """
    Endpoint de TEST pour déclencher manuellement le job de rappel d'inspection EPI.
    Cet endpoint permet de tester la logique sans attendre le scheduler.
    
    ATTENTION: Cet endpoint crée réellement des notifications et peut envoyer des emails!
    """
    db = get_db()
    
    try:
        from datetime import datetime, timezone
        
        # Trouver le tenant
        tenant = await db.tenants.find_one({"slug": tenant_slug}, {"_id": 0})
        if not tenant:
            raise HTTPException(status_code=404, detail=f"Tenant '{tenant_slug}' non trouvé")
        
        tenant_id = tenant.get("id")
        tenant_nom = tenant.get("nom", "Unknown")
        
        # Récupérer les paramètres EPI depuis tenant.parametres directement
        parametres = tenant.get("parametres", {})
        
        if not parametres:
            return {
                "success": False,
                "message": "Aucun paramètre configuré pour ce tenant",
                "tenant": tenant_nom,
                "parametres": None
            }
        
        alerte_activee = parametres.get("epi_alerte_inspection_mensuelle", False)
        jour_alerte = parametres.get("epi_jour_alerte_inspection_mensuelle", 20)
        envoyer_email = parametres.get("epi_envoyer_rappel_email", False)
        
        if not alerte_activee:
            return {
                "success": False,
                "message": "Les alertes d'inspection EPI ne sont pas activées pour ce tenant",
                "tenant": tenant_nom,
                "parametres": {
                    "epi_alerte_inspection_mensuelle": alerte_activee,
                    "epi_jour_alerte_inspection_mensuelle": jour_alerte,
                    "epi_envoyer_rappel_email": envoyer_email
                }
            }
        
        today = datetime.now(timezone.utc)
        mois_actuel = today.month
        annee_actuelle = today.year
        
        # Récupérer les pompiers actifs
        pompiers = await db.users.find({
            "tenant_id": tenant_id,
            "statut": "actif"
        }).to_list(None)
        
        # Récupérer les EPI assignés
        epis_assignes = await db.epis.find({
            "tenant_id": tenant_id,
            "user_id": {"$ne": None, "$ne": ""}
        }).to_list(None)
        
        # Grouper par user
        epis_par_user = {}
        for epi in epis_assignes:
            user_id = epi.get("user_id")
            if user_id:
                if user_id not in epis_par_user:
                    epis_par_user[user_id] = []
                epis_par_user[user_id].append(epi)
        
        # Calculer la période du mois
        debut_mois = datetime(annee_actuelle, mois_actuel, 1, tzinfo=timezone.utc)
        if mois_actuel == 12:
            fin_mois = datetime(annee_actuelle + 1, 1, 1, tzinfo=timezone.utc)
        else:
            fin_mois = datetime(annee_actuelle, mois_actuel + 1, 1, tzinfo=timezone.utc)
        
        resultats = {
            "pompiers_analyses": 0,
            "pompiers_avec_epi": 0,
            "pompiers_inspection_faite": 0,
            "pompiers_sans_inspection": 0,
            "notifications_creees": 0,
            "details": []
        }
        
        for pompier in pompiers:
            pompier_id = pompier.get("id")
            pompier_nom = f"{pompier.get('prenom', '')} {pompier.get('nom', '')}"
            pompier_email = pompier.get("email")
            
            resultats["pompiers_analyses"] += 1
            
            # Vérifier si ce pompier a des EPI
            if pompier_id not in epis_par_user:
                resultats["details"].append({
                    "nom": pompier_nom,
                    "statut": "pas_epi",
                    "message": "Aucun EPI assigné"
                })
                continue
            
            resultats["pompiers_avec_epi"] += 1
            epis_pompier = epis_par_user[pompier_id]
            nb_epi = len(epis_pompier)
            
            # Vérifier si le pompier a fait une inspection ce mois-ci
            inspection_ce_mois = await db.inspections_epi.find_one({
                "tenant_id": tenant_id,
                "inspecteur_id": pompier_id,
                "date_inspection": {
                    "$gte": debut_mois.isoformat(),
                    "$lt": fin_mois.isoformat()
                }
            })
            
            if inspection_ce_mois:
                resultats["pompiers_inspection_faite"] += 1
                resultats["details"].append({
                    "nom": pompier_nom,
                    "statut": "inspection_ok",
                    "message": f"Inspection déjà faite ce mois ({nb_epi} EPI)",
                    "date_inspection": inspection_ce_mois.get("date_inspection")
                })
                continue
            
            # Créer la notification
            resultats["pompiers_sans_inspection"] += 1
            
            notif_id = str(uuid.uuid4())
            notification = {
                "id": notif_id,
                "tenant_id": tenant_id,
                "destinataire_id": pompier_id,
                "type": "rappel_inspection_epi",
                "titre": "🔔 Rappel: Inspection EPI mensuelle (TEST)",
                "message": f"Vous n'avez pas encore effectué votre inspection mensuelle des EPI ce mois-ci. Vous avez {nb_epi} EPI à inspecter.",
                "lien": "/mes-epi",
                "data": {"nb_epi": nb_epi, "mois": mois_actuel, "annee": annee_actuelle},
                "statut": "non_lu",
                "date_creation": datetime.now(timezone.utc).isoformat()
            }
            
            await db.notifications.insert_one(notification)
            resultats["notifications_creees"] += 1
            
            resultats["details"].append({
                "nom": pompier_nom,
                "email": pompier_email,
                "statut": "notification_envoyee",
                "message": f"Notification créée ({nb_epi} EPI à inspecter)",
                "notification_id": notif_id,
                "email_sera_envoye": envoyer_email and bool(pompier_email)
            })
        
        return {
            "success": True,
            "tenant": tenant_nom,
            "parametres": {
                "epi_alerte_inspection_mensuelle": alerte_activee,
                "epi_jour_alerte_inspection_mensuelle": jour_alerte,
                "epi_envoyer_rappel_email": envoyer_email
            },
            "periode": {
                "mois": mois_actuel,
                "annee": annee_actuelle,
                "debut_mois": debut_mois.isoformat(),
                "fin_mois": fin_mois.isoformat()
            },
            "resultats": resultats
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")
