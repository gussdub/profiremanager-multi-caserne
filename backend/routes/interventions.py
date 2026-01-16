"""
Routes API pour le module Gestion des Interventions
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import List, Optional
from datetime import datetime, timezone
import xml.etree.ElementTree as ET
import uuid
import logging
import re

from models.intervention import (
    Intervention, InterventionStatus, InterventionResource, InterventionVehicle,
    InterventionAssistance, InterventionModuleSettings, MappingCode911,
    InterventionCreate, InterventionUpdate, InterventionValidation,
    NatureIntervention, CauseProbable, SourceChaleur, MateriauEnflamme,
    RoleOnScene
)

router = APIRouter()

# ==================== HELPER FUNCTIONS ====================

def parse_xml_datetime(date_str: str, time_str: str) -> Optional[datetime]:
    """Parse date et heure du XML en datetime UTC"""
    if not date_str or not time_str or time_str == "00:00:00":
        return None
    try:
        dt_str = f"{date_str} {time_str}"
        dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
        return dt
    except:
        try:
            dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
            return dt
        except:
            return None


def parse_xml_timestamp(timestamp_str: str) -> Optional[datetime]:
    """Parse timestamp complet du XML"""
    if not timestamp_str:
        return None
    try:
        return datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
    except:
        return None


def calculate_response_time(dispatch_time: datetime, arrival_time: datetime) -> Optional[int]:
    """Calcule le temps de réponse en secondes"""
    if not dispatch_time or not arrival_time:
        return None
    delta = arrival_time - dispatch_time
    return int(delta.total_seconds())


async def get_intervention_routes(db, get_current_user):
    """Factory function to create routes with database access"""
    
    # ==================== INTERVENTIONS CRUD ====================
    
    @router.get("/{tenant_slug}/interventions")
    async def list_interventions(
        tenant_slug: str,
        status: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        current_user = Depends(get_current_user)
    ):
        """Liste les interventions avec filtres"""
        tenant = await db.tenants.find_one({"slug": tenant_slug})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant non trouvé")
        
        query = {"tenant_id": tenant["id"]}
        
        if status:
            query["status"] = status
        
        if date_from:
            query["created_at"] = {"$gte": datetime.fromisoformat(date_from)}
        if date_to:
            if "created_at" in query:
                query["created_at"]["$lte"] = datetime.fromisoformat(date_to)
            else:
                query["created_at"] = {"$lte": datetime.fromisoformat(date_to)}
        
        total = await db.interventions.count_documents(query)
        
        interventions = await db.interventions.find(
            query, {"_id": 0}
        ).sort("created_at", -1).skip(offset).limit(limit).to_list(limit)
        
        return {
            "interventions": interventions,
            "total": total,
            "limit": limit,
            "offset": offset
        }
    
    
    @router.get("/{tenant_slug}/interventions/dashboard")
    async def get_interventions_dashboard(
        tenant_slug: str,
        current_user = Depends(get_current_user)
    ):
        """Retourne les interventions groupées par statut pour le dashboard"""
        tenant = await db.tenants.find_one({"slug": tenant_slug})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant non trouvé")
        
        pipeline = [
            {"$match": {"tenant_id": tenant["id"]}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]
        
        status_counts = {}
        async for doc in db.interventions.aggregate(pipeline):
            status_counts[doc["_id"]] = doc["count"]
        
        # Récupérer les interventions par catégorie
        new_interventions = await db.interventions.find(
            {"tenant_id": tenant["id"], "status": "new"}, {"_id": 0}
        ).sort("created_at", -1).limit(20).to_list(20)
        
        draft_interventions = await db.interventions.find(
            {"tenant_id": tenant["id"], "status": {"$in": ["draft", "revision"]}}, {"_id": 0}
        ).sort("updated_at", -1).limit(20).to_list(20)
        
        review_interventions = await db.interventions.find(
            {"tenant_id": tenant["id"], "status": "review"}, {"_id": 0}
        ).sort("updated_at", -1).limit(20).to_list(20)
        
        return {
            "counts": status_counts,
            "new": new_interventions,
            "drafts": draft_interventions,
            "review": review_interventions
        }
    
    
    @router.get("/{tenant_slug}/interventions/{intervention_id}")
    async def get_intervention(
        tenant_slug: str,
        intervention_id: str,
        current_user = Depends(get_current_user)
    ):
        """Récupère une intervention avec ses ressources"""
        tenant = await db.tenants.find_one({"slug": tenant_slug})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant non trouvé")
        
        intervention = await db.interventions.find_one(
            {"id": intervention_id, "tenant_id": tenant["id"]}, {"_id": 0}
        )
        if not intervention:
            raise HTTPException(status_code=404, detail="Intervention non trouvée")
        
        # Récupérer les ressources
        resources = await db.intervention_resources.find(
            {"intervention_id": intervention_id}, {"_id": 0}
        ).to_list(100)
        
        vehicles = await db.intervention_vehicles.find(
            {"intervention_id": intervention_id}, {"_id": 0}
        ).to_list(50)
        
        assistance = await db.intervention_assistance.find(
            {"intervention_id": intervention_id}, {"_id": 0}
        ).to_list(20)
        
        # Calculer les délais
        response_time = None
        if intervention.get("xml_time_dispatch") and intervention.get("xml_time_arrival_1st"):
            dispatch = intervention["xml_time_dispatch"]
            arrival = intervention["xml_time_arrival_1st"]
            if isinstance(dispatch, str):
                dispatch = datetime.fromisoformat(dispatch)
            if isinstance(arrival, str):
                arrival = datetime.fromisoformat(arrival)
            response_time = int((arrival - dispatch).total_seconds())
        
        return {
            "intervention": intervention,
            "resources": resources,
            "vehicles": vehicles,
            "assistance": assistance,
            "response_time_seconds": response_time
        }
    
    
    @router.put("/{tenant_slug}/interventions/{intervention_id}")
    async def update_intervention(
        tenant_slug: str,
        intervention_id: str,
        update_data: InterventionUpdate,
        current_user = Depends(get_current_user)
    ):
        """Met à jour une intervention"""
        tenant = await db.tenants.find_one({"slug": tenant_slug})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant non trouvé")
        
        intervention = await db.interventions.find_one(
            {"id": intervention_id, "tenant_id": tenant["id"]}
        )
        if not intervention:
            raise HTTPException(status_code=404, detail="Intervention non trouvée")
        
        # Vérifier si l'intervention est signée
        if intervention.get("status") == "signed":
            # Log dans l'audit trail
            audit_entry = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "user_id": current_user.id,
                "user_name": f"{current_user.prenom} {current_user.nom}",
                "action": "modification_post_signature",
                "changes": update_data.model_dump(exclude_unset=True)
            }
            await db.interventions.update_one(
                {"id": intervention_id},
                {"$push": {"audit_log": audit_entry}}
            )
        
        update_dict = update_data.model_dump(exclude_unset=True)
        update_dict["updated_at"] = datetime.now(timezone.utc)
        update_dict["last_modified_by"] = current_user.id
        update_dict["last_modified_at"] = datetime.now(timezone.utc)
        
        await db.interventions.update_one(
            {"id": intervention_id},
            {"$set": update_dict}
        )
        
        updated = await db.interventions.find_one(
            {"id": intervention_id}, {"_id": 0}
        )
        
        return {"success": True, "intervention": updated}
    
    
    @router.post("/{tenant_slug}/interventions/{intervention_id}/validate")
    async def validate_intervention(
        tenant_slug: str,
        intervention_id: str,
        validation: InterventionValidation,
        current_user = Depends(get_current_user)
    ):
        """Valide ou retourne une intervention"""
        # Vérifier les permissions
        if current_user.role not in ["admin", "superviseur"]:
            raise HTTPException(status_code=403, detail="Permission refusée")
        
        tenant = await db.tenants.find_one({"slug": tenant_slug})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant non trouvé")
        
        intervention = await db.interventions.find_one(
            {"id": intervention_id, "tenant_id": tenant["id"]}
        )
        if not intervention:
            raise HTTPException(status_code=404, detail="Intervention non trouvée")
        
        update_data = {
            "updated_at": datetime.now(timezone.utc),
            "last_modified_by": current_user.id,
            "last_modified_at": datetime.now(timezone.utc)
        }
        
        if validation.action == "validate":
            # Passer en review (en attente de signature)
            update_data["status"] = "review"
            
        elif validation.action == "return_for_revision":
            update_data["status"] = "revision"
            # Ajouter le commentaire
            if validation.comment:
                audit_entry = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "user_id": current_user.id,
                    "user_name": f"{current_user.prenom} {current_user.nom}",
                    "action": "return_for_revision",
                    "comment": validation.comment
                }
                await db.interventions.update_one(
                    {"id": intervention_id},
                    {"$push": {"audit_log": audit_entry}}
                )
                
        elif validation.action == "sign":
            # Vérifier les champs obligatoires pour incendie
            if "incendie" in (intervention.get("type_intervention") or "").lower():
                settings = await db.intervention_settings.find_one(
                    {"tenant_id": tenant["id"]}
                )
                if settings and settings.get("require_dsi_for_fire"):
                    required_fields = ["cause_id", "source_heat_id"]
                    missing = [f for f in required_fields if not intervention.get(f)]
                    if missing:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Champs DSI obligatoires manquants: {', '.join(missing)}"
                        )
            
            update_data["status"] = "signed"
            update_data["signed_at"] = datetime.now(timezone.utc)
            update_data["signed_by"] = current_user.id
        
        await db.interventions.update_one(
            {"id": intervention_id},
            {"$set": update_data}
        )
        
        updated = await db.interventions.find_one(
            {"id": intervention_id}, {"_id": 0}
        )
        
        return {"success": True, "intervention": updated}
    
    
    # ==================== XML IMPORT ====================
    
    @router.post("/{tenant_slug}/interventions/import-xml")
    async def import_xml_files(
        tenant_slug: str,
        files: List[UploadFile] = File(...),
        current_user = Depends(get_current_user)
    ):
        """Importe des fichiers XML de la centrale 911"""
        if current_user.role not in ["admin", "superviseur"]:
            raise HTTPException(status_code=403, detail="Permission refusée")
        
        tenant = await db.tenants.find_one({"slug": tenant_slug})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant non trouvé")
        
        results = {
            "imported": [],
            "updated": [],
            "errors": [],
            "unmapped_codes": []
        }
        
        # Grouper les fichiers par carte d'appel
        files_by_call = {}
        
        for file in files:
            filename = file.filename
            # Extraire le numéro de carte d'appel du nom de fichier
            # Format: SERVICE_GUIDMUN_NOCARTE_TYPE.xml
            match = re.search(r'_(\d+)_([^_]+)\.xml$', filename)
            if match:
                call_number = match.group(1)
                file_type = match.group(2).lower()
                
                if call_number not in files_by_call:
                    files_by_call[call_number] = {}
                
                content = await file.read()
                files_by_call[call_number][file_type] = content
        
        # Traiter chaque carte d'appel
        for call_number, call_files in files_by_call.items():
            try:
                # Vérifier si l'intervention existe déjà
                existing = await db.interventions.find_one({
                    "tenant_id": tenant["id"],
                    "external_call_id": call_number
                })
                
                # Parser le fichier Details (principal)
                if 'details' in call_files:
                    details_xml = ET.fromstring(call_files['details'])
                    table = details_xml.find('.//Table')
                    
                    if table is not None:
                        intervention_data = {
                            "tenant_id": tenant["id"],
                            "external_call_id": call_number,
                            "guid_carte": table.findtext('idCarteAppel'),
                            "guid_municipalite": table.findtext('guidMun'),
                            "no_sequentiel": int(table.findtext('noSequentiel') or 0),
                            
                            # Adresse
                            "address_civic": table.findtext('noPorte'),
                            "address_street": table.findtext('rue'),
                            "address_apartment": table.findtext('noAppart'),
                            "address_city": table.findtext('villePourQui'),
                            
                            # Appelant
                            "caller_name": table.findtext('deQui'),
                            "caller_phone": table.findtext('telDeQui'),
                            "for_whom": table.findtext('pourQui'),
                            "for_whom_phone": table.findtext('telPourQui'),
                            
                            # Type
                            "type_intervention": table.findtext('typeIntervention'),
                            "code_feu": table.findtext('codeFeu'),
                            "niveau_risque": table.findtext('niveauRisque'),
                            "officer_in_charge_xml": table.findtext('officierCharge'),
                            
                            # Timestamps
                            "xml_time_call_received": parse_xml_datetime(
                                table.findtext('dateAppel'),
                                table.findtext('heureAppel')
                            ),
                            "xml_time_911": parse_xml_datetime(
                                table.findtext('dateHeure911'),
                                table.findtext('heure911')
                            ),
                            "xml_time_dispatch": parse_xml_datetime(
                                table.findtext('dateAlerte'),
                                table.findtext('heureAlerte')
                            ),
                            "xml_time_en_route": parse_xml_datetime(
                                table.findtext('date1016_1'),
                                table.findtext('depCaserne')
                            ),
                            "xml_time_arrival_1st": parse_xml_datetime(
                                table.findtext('date1018'),
                                table.findtext('hre1018') or table.findtext('arrLieux')
                            ),
                            "xml_time_under_control": parse_xml_datetime(
                                table.findtext('dateSousControle'),
                                table.findtext('sousControle')
                            ),
                            "xml_time_1022": parse_xml_datetime(
                                table.findtext('date1022'),
                                table.findtext('heure1022')
                            ),
                            "xml_time_departure": parse_xml_datetime(
                                table.findtext('dateDepLieux'),
                                table.findtext('depLieux')
                            ),
                            "xml_time_terminated": parse_xml_datetime(
                                table.findtext('dateDispFinale'),
                                table.findtext('dispFinale')
                            ),
                            
                            "imported_at": datetime.now(timezone.utc),
                            "imported_by": current_user.id
                        }
                        
                        # Construire l'adresse complète
                        addr_parts = []
                        if intervention_data.get("address_civic"):
                            addr_parts.append(intervention_data["address_civic"])
                        if intervention_data.get("address_street"):
                            addr_parts.append(intervention_data["address_street"])
                        if intervention_data.get("address_city"):
                            addr_parts.append(intervention_data["address_city"])
                        intervention_data["address_full"] = ", ".join(addr_parts)
                        
                        if existing:
                            # Ne pas écraser si déjà signé
                            if existing.get("status") == "signed":
                                results["errors"].append({
                                    "call_number": call_number,
                                    "error": "Intervention déjà signée, mise à jour ignorée"
                                })
                                continue
                            
                            # Mettre à jour
                            intervention_data["updated_at"] = datetime.now(timezone.utc)
                            await db.interventions.update_one(
                                {"id": existing["id"]},
                                {"$set": intervention_data}
                            )
                            intervention_id = existing["id"]
                            results["updated"].append(call_number)
                        else:
                            # Créer
                            intervention_data["id"] = str(uuid.uuid4())
                            intervention_data["status"] = "new"
                            intervention_data["created_at"] = datetime.now(timezone.utc)
                            await db.interventions.insert_one(intervention_data)
                            intervention_id = intervention_data["id"]
                            results["imported"].append(call_number)
                
                # Parser les Ressources (véhicules)
                if 'ressources' in call_files and intervention_id:
                    resources_xml = ET.fromstring(call_files['ressources'])
                    
                    # Supprimer les anciennes ressources
                    await db.intervention_vehicles.delete_many({
                        "intervention_id": intervention_id
                    })
                    
                    vehicles_processed = set()
                    for table in resources_xml.findall('.//Table'):
                        vehicle_number = table.findtext('noRessource')
                        if vehicle_number and vehicle_number not in vehicles_processed:
                            vehicle_data = {
                                "id": str(uuid.uuid4()),
                                "intervention_id": intervention_id,
                                "tenant_id": tenant["id"],
                                "xml_vehicle_number": vehicle_number,
                                "xml_vehicle_id": table.findtext('idRessource'),
                                "xml_status": table.findtext('disponibilite'),
                                "crew_count": int(table.findtext('nbPompier') or 0),
                                "created_at": datetime.now(timezone.utc)
                            }
                            
                            # Essayer de mapper au véhicule interne
                            mapping = await db.intervention_code_mappings.find_one({
                                "tenant_id": tenant["id"],
                                "type_mapping": "vehicule",
                                "code_externe": vehicle_number
                            })
                            if mapping and mapping.get("code_interne"):
                                vehicle_data["vehicle_id"] = mapping["code_interne"]
                            else:
                                # Code non mappé
                                results["unmapped_codes"].append({
                                    "type": "vehicule",
                                    "code": vehicle_number
                                })
                            
                            await db.intervention_vehicles.insert_one(vehicle_data)
                            vehicles_processed.add(vehicle_number)
                
                # Parser les Commentaires
                if 'commentaires' in call_files and intervention_id:
                    comments_xml = ET.fromstring(call_files['commentaires'])
                    comments = []
                    for table in comments_xml.findall('.//Table'):
                        comment = {
                            "id": table.findtext('idCommentaire'),
                            "timestamp": table.findtext('timestampDetail'),
                            "detail": table.findtext('detail'),
                            "type": table.findtext('type'),
                            "repartiteur": table.findtext('repartiteur')
                        }
                        comments.append(comment)
                    
                    await db.interventions.update_one(
                        {"id": intervention_id},
                        {"$set": {"xml_comments": comments}}
                    )
                
                # Parser l'Assistance (entraide)
                if 'assistance' in call_files and intervention_id:
                    assistance_xml = ET.fromstring(call_files['assistance'])
                    
                    await db.intervention_assistance.delete_many({
                        "intervention_id": intervention_id
                    })
                    
                    for table in assistance_xml.findall('.//Table'):
                        assistance_data = {
                            "id": str(uuid.uuid4()),
                            "intervention_id": intervention_id,
                            "tenant_id": tenant["id"],
                            "xml_assistance_id": table.findtext('idAssistance'),
                            "no_carte_entraide": table.findtext('noCarteEntraide'),
                            "municipalite": table.findtext('municipalite'),
                            "type_equipement": table.findtext('typeEquipement'),
                            "time_called": parse_xml_datetime(
                                table.findtext('dateAppel'),
                                table.findtext('heureAppel')
                            ),
                            "time_en_route": parse_xml_datetime(
                                table.findtext('dateDirection'),
                                table.findtext('heureDirection')
                            ),
                            "time_on_scene": parse_xml_datetime(
                                table.findtext('dateLieux'),
                                table.findtext('heureLieux')
                            ),
                            "time_released": parse_xml_datetime(
                                table.findtext('dateLiberee'),
                                table.findtext('heureLiberee')
                            ),
                            "created_at": datetime.now(timezone.utc)
                        }
                        await db.intervention_assistance.insert_one(assistance_data)
                        
            except Exception as e:
                logging.error(f"Erreur import XML {call_number}: {e}")
                results["errors"].append({
                    "call_number": call_number,
                    "error": str(e)
                })
        
        return results
    
    
    # ==================== REFERENCE DATA ====================
    
    @router.get("/{tenant_slug}/interventions/reference-data")
    async def get_reference_data(
        tenant_slug: str,
        current_user = Depends(get_current_user)
    ):
        """Récupère les données de référence (natures, causes, etc.)"""
        natures = await db.intervention_natures.find(
            {"actif": True}, {"_id": 0}
        ).to_list(200)
        
        causes = await db.intervention_causes.find(
            {"actif": True}, {"_id": 0}
        ).to_list(200)
        
        sources = await db.intervention_sources_chaleur.find(
            {"actif": True}, {"_id": 0}
        ).to_list(200)
        
        materiaux = await db.intervention_materiaux.find(
            {"actif": True}, {"_id": 0}
        ).to_list(200)
        
        categories = await db.intervention_categories_batiment.find(
            {"actif": True}, {"_id": 0}
        ).to_list(200)
        
        return {
            "natures": natures,
            "causes": causes,
            "sources_chaleur": sources,
            "materiaux": materiaux,
            "categories_batiment": categories
        }
    
    
    # ==================== CODE MAPPINGS ====================
    
    @router.get("/{tenant_slug}/interventions/mappings")
    async def get_code_mappings(
        tenant_slug: str,
        type_mapping: Optional[str] = None,
        current_user = Depends(get_current_user)
    ):
        """Liste les mappings de codes 911"""
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Accès admin requis")
        
        tenant = await db.tenants.find_one({"slug": tenant_slug})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant non trouvé")
        
        query = {"tenant_id": tenant["id"]}
        if type_mapping:
            query["type_mapping"] = type_mapping
        
        mappings = await db.intervention_code_mappings.find(
            query, {"_id": 0}
        ).to_list(500)
        
        return {"mappings": mappings}
    
    
    @router.post("/{tenant_slug}/interventions/mappings")
    async def create_or_update_mapping(
        tenant_slug: str,
        mapping_data: dict,
        current_user = Depends(get_current_user)
    ):
        """Crée ou met à jour un mapping de code"""
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Accès admin requis")
        
        tenant = await db.tenants.find_one({"slug": tenant_slug})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant non trouvé")
        
        existing = await db.intervention_code_mappings.find_one({
            "tenant_id": tenant["id"],
            "type_mapping": mapping_data["type_mapping"],
            "code_externe": mapping_data["code_externe"]
        })
        
        if existing:
            await db.intervention_code_mappings.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "code_interne": mapping_data.get("code_interne"),
                    "libelle_interne": mapping_data.get("libelle_interne"),
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            return {"success": True, "action": "updated"}
        else:
            new_mapping = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant["id"],
                "type_mapping": mapping_data["type_mapping"],
                "code_externe": mapping_data["code_externe"],
                "libelle_externe": mapping_data.get("libelle_externe", ""),
                "code_interne": mapping_data.get("code_interne"),
                "libelle_interne": mapping_data.get("libelle_interne"),
                "auto_mapped": False,
                "created_at": datetime.now(timezone.utc)
            }
            await db.intervention_code_mappings.insert_one(new_mapping)
            return {"success": True, "action": "created"}
    
    
    # ==================== MODULE SETTINGS ====================
    
    @router.get("/{tenant_slug}/interventions/settings")
    async def get_module_settings(
        tenant_slug: str,
        current_user = Depends(get_current_user)
    ):
        """Récupère les paramètres du module"""
        tenant = await db.tenants.find_one({"slug": tenant_slug})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant non trouvé")
        
        settings = await db.intervention_settings.find_one(
            {"tenant_id": tenant["id"]}, {"_id": 0}
        )
        
        if not settings:
            # Créer les paramètres par défaut
            settings = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant["id"],
                "supervisors_can_validate": True,
                "auto_assign_officer": True,
                "require_dsi_for_fire": True,
                "require_narrative": True,
                "alert_response_time_threshold": 480,
                "alert_on_import": True,
                "auto_archive_after_days": 365,
                "created_at": datetime.now(timezone.utc)
            }
            await db.intervention_settings.insert_one(settings)
            del settings["_id"]
        
        return {"settings": settings}
    
    
    @router.put("/{tenant_slug}/interventions/settings")
    async def update_module_settings(
        tenant_slug: str,
        settings_data: dict,
        current_user = Depends(get_current_user)
    ):
        """Met à jour les paramètres du module"""
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Accès admin requis")
        
        tenant = await db.tenants.find_one({"slug": tenant_slug})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant non trouvé")
        
        settings_data["updated_at"] = datetime.now(timezone.utc)
        
        await db.intervention_settings.update_one(
            {"tenant_id": tenant["id"]},
            {"$set": settings_data},
            upsert=True
        )
        
        return {"success": True}
    
    
    # ==================== RESOURCES MANAGEMENT ====================
    
    @router.post("/{tenant_slug}/interventions/{intervention_id}/resources")
    async def add_resource(
        tenant_slug: str,
        intervention_id: str,
        resource_data: dict,
        current_user = Depends(get_current_user)
    ):
        """Ajoute une ressource humaine à l'intervention"""
        tenant = await db.tenants.find_one({"slug": tenant_slug})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant non trouvé")
        
        intervention = await db.interventions.find_one({
            "id": intervention_id,
            "tenant_id": tenant["id"]
        })
        if not intervention:
            raise HTTPException(status_code=404, detail="Intervention non trouvée")
        
        resource = {
            "id": str(uuid.uuid4()),
            "intervention_id": intervention_id,
            "tenant_id": tenant["id"],
            "user_id": resource_data.get("user_id"),
            "role_on_scene": resource_data.get("role_on_scene", "Pompier"),
            "datetime_start": resource_data.get("datetime_start"),
            "datetime_end": resource_data.get("datetime_end"),
            "is_remunerated": resource_data.get("is_remunerated", True),
            "is_manually_added": True,
            "created_at": datetime.now(timezone.utc)
        }
        
        await db.intervention_resources.insert_one(resource)
        
        return {"success": True, "resource": resource}
    
    
    @router.delete("/{tenant_slug}/interventions/{intervention_id}/resources/{resource_id}")
    async def remove_resource(
        tenant_slug: str,
        intervention_id: str,
        resource_id: str,
        current_user = Depends(get_current_user)
    ):
        """Supprime une ressource de l'intervention"""
        result = await db.intervention_resources.delete_one({
            "id": resource_id,
            "intervention_id": intervention_id
        })
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Ressource non trouvée")
        
        return {"success": True}
    
    
    # ==================== ASSIGNED REPORTERS ====================
    
    @router.put("/{tenant_slug}/interventions/{intervention_id}/assign-reporters")
    async def assign_reporters(
        tenant_slug: str,
        intervention_id: str,
        reporters_data: dict,
        current_user = Depends(get_current_user)
    ):
        """Assigne des personnes pour remplir le rapport"""
        if current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Accès admin requis")
        
        tenant = await db.tenants.find_one({"slug": tenant_slug})
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant non trouvé")
        
        user_ids = reporters_data.get("user_ids", [])
        
        await db.interventions.update_one(
            {"id": intervention_id, "tenant_id": tenant["id"]},
            {"$set": {
                "assigned_reporters": user_ids,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        return {"success": True}
    
    
    return router
