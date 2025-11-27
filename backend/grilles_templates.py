# Grilles d'Inspection Préformées - Code de Sécurité du Québec
# Structure: Tronc Commun + Modules Spécifiques par Catégorie

GRILLES_TEMPLATES = [
    {
        "nom": "Grille Groupe A - Établissements de Réunion",
        "groupe_occupation": "A",
        "description": "Salles de spectacles, écoles, restaurants, lieux de culte",
        "version": "1.0",
        "sections": [
            # ============ TRONC COMMUN ============
            {
                "titre": "Tronc Commun - Extérieur et Accès",
                "ordre": 1,
                "questions": [
                    {
                        "id": "tc_ext_001",
                        "texte": "Adresse civique bien visible de la rue?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": False,
                            "champs": [
                                {"label": "Préciser le problème", "type": "textarea"}
                            ]
                        }
                    },
                    {
                        "id": "tc_ext_002",
                        "texte": "Voies d'accès pompiers dégagées (déneigement, obstacles)?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Type d'obstacle", "type": "text"},
                                {"label": "Localisation précise", "type": "textarea"}
                            ]
                        }
                    },
                    {
                        "id": "tc_ext_003",
                        "texte": "Raccord siamois (si applicable): signalisé, dégagé, bouchons en place?",
                        "type": "checkbox",
                        "obligatoire": False,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Quel problème?", "type": "select", "options": ["Non signalisé", "Obstrué", "Bouchons manquants", "Autre"]},
                                {"label": "Précisions", "type": "textarea"}
                            ]
                        }
                    },
                    {
                        "id": "tc_ext_004",
                        "texte": "Poteau d'incendie (borne-fontaine): dégagé (1,5m), accessible?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Distance au bâtiment (m)", "type": "number"},
                                {"label": "Problème identifié", "type": "textarea"}
                            ]
                        }
                    }
                ]
            },
            {
                "titre": "Tronc Commun - Moyens d'Évacuation",
                "ordre": 2,
                "questions": [
                    {
                        "id": "tc_evac_001",
                        "texte": "Éclairage d'urgence fonctionnel (Test 30 sec)?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Localisation des défauts", "type": "textarea"},
                                {"label": "Nombre d'unités défectueuses", "type": "number"}
                            ]
                        }
                    },
                    {
                        "id": "tc_evac_002",
                        "texte": "Enseignes de sortie éclairées et visibles?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Quelle(s) sortie(s)?", "type": "textarea"}
                            ]
                        }
                    },
                    {
                        "id": "tc_evac_003",
                        "texte": "Portes de sortie: fonctionnelles, non barrées, ouvrent dans le sens de l'évacuation?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Porte(s) problématique(s)", "type": "textarea"},
                                {"label": "Nature du problème", "type": "select", "options": ["Barrée", "Mauvais sens", "Bloquée", "Défectueuse"]}
                            ]
                        }
                    },
                    {
                        "id": "tc_evac_004",
                        "texte": "Corridors et escaliers: libres de tout entreposage?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Localisation", "type": "textarea"},
                                {"label": "Type d'encombrement", "type": "textarea"}
                            ]
                        }
                    }
                ]
            },
            {
                "titre": "Tronc Commun - Protection Incendie",
                "ordre": 3,
                "questions": [
                    {
                        "id": "tc_prot_001",
                        "texte": "Extincteurs portatifs: présents, bonne classe, inspectés (date < 1 an), accrochés?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Numéro(s) extincteur", "type": "text"},
                                {"label": "Problème", "type": "select", "options": ["Absent", "Mauvaise classe", "Inspection expirée", "Non accroché", "Autre"]},
                                {"label": "Précisions", "type": "textarea"}
                            ]
                        }
                    },
                    {
                        "id": "tc_prot_002",
                        "texte": "Système d'alarme: panneau sans trouble, inspection annuelle à jour?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Type de trouble", "type": "text"},
                                {"label": "Date dernière inspection", "type": "date"}
                            ]
                        }
                    },
                    {
                        "id": "tc_prot_003",
                        "texte": "Registre de sécurité: présent et à jour?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": False,
                            "champs": [
                                {"label": "Problème identifié", "type": "select", "options": ["Absent", "Incomplet", "Non à jour"]},
                                {"label": "Observations", "type": "textarea"}
                            ]
                        }
                    }
                ]
            },
            {
                "titre": "Tronc Commun - Électricité et Chauffage",
                "ordre": 4,
                "questions": [
                    {
                        "id": "tc_elec_001",
                        "texte": "Salle électrique/mécanique: aucun entreposage (dégagement 1m devant panneaux)?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Type de matériel entreposé", "type": "textarea"}
                            ]
                        }
                    },
                    {
                        "id": "tc_elec_002",
                        "texte": "Pas de rallonges électriques utilisées comme câblage permanent?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Localisation", "type": "textarea"},
                                {"label": "Nombre approximatif", "type": "number"}
                            ]
                        }
                    },
                    {
                        "id": "tc_elec_003",
                        "texte": "Panneaux électriques fermés (pas de fils à nu)?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Localisation du panneau", "type": "text"},
                                {"label": "Gravité", "type": "select", "options": ["Faible", "Moyenne", "Élevée", "Critique"]}
                            ]
                        }
                    }
                ]
            },
            # ============ MODULES SPÉCIFIQUES GROUPE A ============
            {
                "titre": "Groupe A - Capacité et Occupation",
                "ordre": 5,
                "questions": [
                    {
                        "id": "ga_cap_001",
                        "texte": "Capacité d'occupation maximale affichée bien en vue?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Capacité réelle calculée", "type": "number"},
                                {"label": "Localisation où devrait être affiché", "type": "text"}
                            ]
                        }
                    },
                    {
                        "id": "ga_cap_002",
                        "texte": "Dispositifs anti-panique (barres panique) fonctionnels sur les portes?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Porte(s) concernée(s)", "type": "textarea"},
                                {"label": "Problème", "type": "select", "options": ["Absent", "Défectueux", "Bloqué"]}
                            ]
                        }
                    }
                ]
            },
            {
                "titre": "Groupe A - Décorations et Aménagement",
                "ordre": 6,
                "questions": [
                    {
                        "id": "ga_deco_001",
                        "texte": "Rideaux, tentures et décorations: ignifugés (certificat de traitement requis)?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Type de matériau", "type": "text"},
                                {"label": "Localisation", "type": "textarea"},
                                {"label": "Certificat présent?", "type": "select", "options": ["Non", "Expiré", "N/A"]}
                            ]
                        }
                    }
                ]
            },
            {
                "titre": "Groupe A - Cuisines Commerciales (NFPA 96)",
                "ordre": 7,
                "condition": "si_cuisine_commerciale",
                "questions": [
                    {
                        "id": "ga_cuis_001",
                        "texte": "Hotte propre (pas de graisse)?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Niveau d'accumulation", "type": "select", "options": ["Léger", "Modéré", "Important", "Critique"]},
                                {"label": "Date dernier nettoyage", "type": "date"}
                            ]
                        }
                    },
                    {
                        "id": "ga_cuis_002",
                        "texte": "Système d'extinction fixe inspecté (6 mois)?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Date dernière inspection", "type": "date"},
                                {"label": "Vignette présente?", "type": "select", "options": ["Oui", "Non", "Expirée"]}
                            ]
                        }
                    },
                    {
                        "id": "ga_cuis_003",
                        "texte": "Extincteur classe K présent?",
                        "type": "checkbox",
                        "obligatoire": True,
                        "si_non_conforme": {
                            "photo_requise": True,
                            "champs": [
                                {"label": "Type d'extincteur présent", "type": "text"},
                                {"label": "Action requise", "type": "textarea"}
                            ]
                        }
                    }
                ]
            }
        ]
    }
]
