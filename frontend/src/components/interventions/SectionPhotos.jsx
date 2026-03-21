import React, { useState, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Trash2, Camera, Upload, X, ZoomIn } from 'lucide-react';

const MAX_PHOTOS = 10;
const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

// Fonction pour compresser une image
const compressImage = (file, maxSizeMB = 10) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        
        // Réduire la taille si nécessaire
        const maxDimension = 1920;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = (height / width) * maxDimension;
            width = maxDimension;
          } else {
            width = (width / height) * maxDimension;
            height = maxDimension;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Commencer avec une qualité élevée et réduire si nécessaire
        let quality = 0.9;
        let result = canvas.toDataURL('image/jpeg', quality);
        
        // Réduire la qualité jusqu'à ce que la taille soit acceptable
        while (result.length > maxSizeMB * 1024 * 1024 * 1.37 && quality > 0.1) {
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality);
        }
        
        resolve(result);
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const SectionPhotos = ({ 
  intervention, 
  setIntervention, 
  tenantSlug, 
  user, 
  getToken, 
  toast, 
  canEdit,
  readOnly 
}) => {
  const [uploading, setUploading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const fileInputRef = useRef(null);
  
  const photos = intervention?.photos || [];
  const isValidated = intervention?.status === 'signed' || intervention?.status === 'validated';
  const canDelete = canEdit && !isValidated && !readOnly;
  const canUpload = canEdit && !readOnly && photos.length < MAX_PHOTOS;

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    
    // Vérifier la limite de photos
    const remainingSlots = MAX_PHOTOS - photos.length;
    if (files.length > remainingSlots) {
      toast({
        title: "Limite atteinte",
        description: `Vous pouvez ajouter maximum ${remainingSlots} photo(s) (limite: ${MAX_PHOTOS})`,
        variant: "destructive"
      });
      return;
    }
    
    setUploading(true);
    
    try {
      const newPhotos = [];
      
      for (const file of files) {
        // Vérifier que c'est une image
        if (!file.type.startsWith('image/')) {
          toast({
            title: "Format non supporté",
            description: `${file.name} n'est pas une image valide`,
            variant: "destructive"
          });
          continue;
        }
        
        let base64;
        
        // Compresser si trop grande
        if (file.size > MAX_SIZE_BYTES) {
          toast({
            title: "Compression en cours",
            description: `${file.name} est trop grande, compression automatique...`,
          });
          base64 = await compressImage(file, MAX_SIZE_MB);
        } else {
          // Lire directement
          base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }
        
        newPhotos.push({
          id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          data: base64,
          uploadedAt: new Date().toISOString(),
          uploadedBy: user?.id || 'unknown',
          uploadedByName: user?.prenom && user?.nom ? `${user.prenom} ${user.nom}` : user?.email || 'Inconnu'
        });
      }
      
      if (newPhotos.length > 0) {
        setIntervention(prev => ({
          ...prev,
          photos: [...(prev.photos || []), ...newPhotos]
        }));
        
        toast({
          title: "Succès",
          description: `${newPhotos.length} photo(s) ajoutée(s)`,
        });
      }
    } catch (error) {
      console.error('Erreur upload photo:', error);
      toast({
        title: "Erreur",
        description: "Impossible d'ajouter la photo",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
      // Reset l'input pour permettre de re-sélectionner le même fichier
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeletePhoto = (photoId) => {
    if (!canDelete) {
      toast({
        title: "Action non autorisée",
        description: "Les photos ne peuvent plus être supprimées une fois le rapport validé",
        variant: "destructive"
      });
      return;
    }
    
    setIntervention(prev => ({
      ...prev,
      photos: (prev.photos || []).filter(p => p.id !== photoId)
    }));
    
    toast({
      title: "Photo supprimée",
      description: "La photo a été retirée du rapport",
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-CA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Photos de l'intervention ({photos.length}/{MAX_PHOTOS})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Zone d'upload */}
        {canUpload && (
          <div className="mb-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
              id="photo-upload"
            />
            <label
              htmlFor="photo-upload"
              className={`
                flex flex-col items-center justify-center w-full h-32 
                border-2 border-dashed rounded-lg cursor-pointer
                ${uploading ? 'bg-gray-100 border-gray-300' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}
                transition-colors
              `}
            >
              {uploading ? (
                <div className="flex flex-col items-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                  <span className="text-sm text-gray-500">Traitement en cours...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <Upload className="h-10 w-10 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-600 font-medium">
                    Cliquez ou glissez des photos ici
                  </span>
                  <span className="text-xs text-gray-400 mt-1">
                    Maximum {MAX_PHOTOS} photos, {MAX_SIZE_MB}MB par photo (compression auto)
                  </span>
                </div>
              )}
            </label>
          </div>
        )}

        {/* Message si limite atteinte */}
        {!canUpload && photos.length >= MAX_PHOTOS && !readOnly && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
            Limite de {MAX_PHOTOS} photos atteinte
          </div>
        )}

        {/* Message si rapport validé */}
        {isValidated && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
            Le rapport étant validé, les photos ne peuvent plus être modifiées
          </div>
        )}

        {/* Grille de photos */}
        {photos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {photos.map((photo, index) => (
              <div 
                key={photo.id || index} 
                className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200"
              >
                <img
                  src={photo.data || photo}
                  alt={`Photo ${index + 1}`}
                  className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                  onClick={() => setSelectedPhoto(photo)}
                />
                
                {/* Overlay avec actions */}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => setSelectedPhoto(photo)}
                    className="p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
                    title="Agrandir"
                  >
                    <ZoomIn className="h-4 w-4 text-gray-700" />
                  </button>
                  
                  {canDelete && (
                    <button
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="p-2 bg-red-500 rounded-full shadow-lg hover:bg-red-600 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="h-4 w-4 text-white" />
                    </button>
                  )}
                </div>
                
                {/* Info de la photo */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="truncate">{photo.uploadedByName || 'Inconnu'}</div>
                  <div>{formatDate(photo.uploadedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Camera className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>Aucune photo pour cette intervention</p>
            {canUpload && (
              <p className="text-sm mt-1">Cliquez sur la zone ci-dessus pour ajouter des photos</p>
            )}
          </div>
        )}

        {/* Modal de visualisation plein écran */}
        {selectedPhoto && (
          <div 
            className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4"
            onClick={() => setSelectedPhoto(null)}
          >
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
            >
              <X className="h-6 w-6 text-white" />
            </button>
            
            <img
              src={selectedPhoto.data || selectedPhoto}
              alt="Photo agrandie"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            
            {/* Info en bas */}
            <div className="absolute bottom-4 left-4 right-4 text-center text-white text-sm">
              <span className="bg-black/50 px-3 py-1 rounded">
                Ajoutée par {selectedPhoto.uploadedByName || 'Inconnu'} le {formatDate(selectedPhoto.uploadedAt)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SectionPhotos;
