# Test Credentials

## Tenant: demo
- **Admin**: gussdub@gmail.com / 230685Juin+ (role: admin, full access)
- **Employé**: info@profiremanager.ca / 230685Juin+ (role: employe, limited access - default)
- **Login endpoint**: `POST /api/demo/auth/login`
- **Body**: `{"email": "...", "mot_de_passe": "..."}`
- **Token field**: `access_token`

## Tenant: shefford
- **Note**: Le compte admin gussdub@gmail.com n'existe PAS sur ce tenant actuellement
- **Flow connexion**: Page d'accueil → saisir "shefford" comme code caserne → Valider → Formulaire login
- **Login endpoint**: `POST /api/shefford/auth/login`

## Employés importés PFM (tous tenants)
- **Mot de passe par défaut**: Pompier@2024
- **Note**: Les employés importés depuis PFM Transfer n'ont pas nécessairement d'email
