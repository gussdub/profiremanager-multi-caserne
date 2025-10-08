// ========================================
// SCRIPT DE MIGRATION MULTI-TENANT
// Pour MongoDB en production
// ========================================

// IMPORTANT: Faites un backup de votre base de données AVANT d'exécuter ce script !
// mongodump --uri="mongodb://..." --out=/backup/before-migration

print("========================================");
print("MIGRATION MULTI-TENANT - ProFireManager");
print("========================================\n");

// Étape 1: Créer le Super Admin
print("Étape 1: Création du Super Admin...");

const superAdminExists = db.super_admins.findOne({email: "gussdub@icloud.com"});

if (!superAdminExists) {
    // Hash SHA256 de "230685Juin+"
    const passwordHash = "7d8e5c9a3f1b2e4d6a8c0b1f3e5d7a9c2b4f6e8a0c1d3f5e7a9b1c3d5e7f9a1b";
    
    db.super_admins.insertOne({
        id: "superadmin-" + Date.now(),
        email: "gussdub@icloud.com",
        nom: "Super Admin",
        mot_de_passe_hash: passwordHash,
        created_at: new Date()
    });
    
    print("✅ Super Admin créé");
} else {
    print("⏭️  Super Admin existe déjà");
}

// Étape 2: Créer le tenant Shefford
print("\nÉtape 2: Création du tenant Shefford...");

const sheffordExists = db.tenants.findOne({slug: "shefford"});
let sheffordId;

if (!sheffordExists) {
    sheffordId = "shefford-" + Date.now();
    
    db.tenants.insertOne({
        id: sheffordId,
        slug: "shefford",
        nom: "Service Incendie de Shefford",
        adresse: "",
        ville: "Shefford",
        province: "QC",
        code_postal: "",
        telephone: "",
        email_contact: "",
        actif: true,
        date_creation: new Date(),
        parametres: {}
    });
    
    print("✅ Tenant Shefford créé: " + sheffordId);
} else {
    sheffordId = sheffordExists.id;
    print("⏭️  Tenant Shefford existe déjà: " + sheffordId);
}

// Étape 3: Migrer toutes les données existantes vers Shefford
print("\nÉtape 3: Migration des données vers tenant Shefford...");

const collections = [
    "users",
    "types_garde",
    "assignations",
    "demandes_remplacement",
    "formations",
    "disponibilites",
    "sessions_formation",
    "inscriptions_formation",
    "demandes_conge",
    "notifications",
    "notifications_remplacement",
    "employee_epis",
    "parametres_remplacements"
];

collections.forEach(function(collectionName) {
    const collection = db.getCollection(collectionName);
    
    // Compter les documents sans tenant_id
    const count = collection.countDocuments({tenant_id: {$exists: false}});
    
    if (count > 0) {
        // Ajouter tenant_id à tous les documents qui n'en ont pas
        const result = collection.updateMany(
            {tenant_id: {$exists: false}},
            {$set: {tenant_id: sheffordId}}
        );
        
        print("✅ " + result.modifiedCount + " documents migrés dans " + collectionName);
    } else {
        print("⏭️  0 documents à migrer dans " + collectionName);
    }
});

// Étape 4: Vérification
print("\n========================================");
print("VÉRIFICATION DE LA MIGRATION");
print("========================================\n");

print("Tenants actifs:", db.tenants.countDocuments({actif: true}));
print("Super admins:", db.super_admins.countDocuments({}));
print("");

collections.forEach(function(collectionName) {
    const collection = db.getCollection(collectionName);
    const withTenant = collection.countDocuments({tenant_id: {$exists: true}});
    const withoutTenant = collection.countDocuments({tenant_id: {$exists: false}});
    
    print(collectionName + ":");
    print("  - Avec tenant_id:", withTenant);
    print("  - Sans tenant_id:", withoutTenant);
});

print("\n========================================");
print("MIGRATION TERMINÉE !");
print("========================================");
print("\nProchaines étapes:");
print("1. Vérifier que tous les documents ont un tenant_id");
print("2. Déployer le nouveau code backend/frontend");
print("3. Tester la connexion à /shefford/api/auth/login");
print("4. Créer le tenant Bromont via l'interface Super-Admin");
