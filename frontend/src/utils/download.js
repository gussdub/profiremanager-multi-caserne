/**
 * Utilitaire de téléchargement compatible avec les environnements iframe sandbox
 * 
 * Dans un iframe sandbox, les méthodes traditionnelles comme link.click() 
 * ou window.print() sont bloquées. Cette fonction ouvre le fichier dans 
 * un nouvel onglet à la place.
 */

/**
 * Télécharge un fichier de manière compatible iframe sandbox
 * @param {Blob} blob - Le blob du fichier à télécharger
 * @param {string} filename - Le nom du fichier suggéré
 * @param {Object} options - Options supplémentaires
 * @param {Function} options.onSuccess - Callback en cas de succès
 * @param {Function} options.onError - Callback en cas d'erreur
 * @param {Function} options.onPopupBlocked - Callback si le popup est bloqué
 */
export const downloadFile = (blob, filename, options = {}) => {
  const { onSuccess, onError, onPopupBlocked } = options;
  
  try {
    const blobUrl = window.URL.createObjectURL(blob);
    
    // Essayer d'ouvrir dans un nouvel onglet
    const newWindow = window.open(blobUrl, '_blank');
    
    if (!newWindow) {
      // Popup bloqué - créer un lien visible pour l'utilisateur
      if (onPopupBlocked) {
        onPopupBlocked(blobUrl, filename);
      } else {
        // Comportement par défaut : créer un lien temporaire visible
        createVisibleDownloadLink(blobUrl, filename);
      }
    } else {
      // Succès - nettoyer après un délai
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 10000);
      
      if (onSuccess) {
        onSuccess();
      }
    }
  } catch (error) {
    console.error('Erreur téléchargement:', error);
    if (onError) {
      onError(error);
    }
  }
};

/**
 * Crée un lien de téléchargement visible temporairement
 * @param {string} blobUrl - URL du blob
 * @param {string} filename - Nom du fichier
 */
export const createVisibleDownloadLink = (blobUrl, filename) => {
  // Supprimer tout lien existant
  const existingLink = document.getElementById('temp-download-link');
  if (existingLink) {
    existingLink.remove();
  }
  
  const overlay = document.createElement('div');
  overlay.id = 'temp-download-link';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100000;
  `;
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: white;
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    text-align: center;
    max-width: 400px;
  `;
  
  modal.innerHTML = `
    <p style="margin-bottom: 16px; color: #374151; font-size: 14px;">
      Le téléchargement automatique est bloqué dans cet environnement.
      <br/>Cliquez sur le lien ci-dessous pour ouvrir le fichier :
    </p>
    <a href="${blobUrl}" target="_blank" style="
      display: inline-block;
      padding: 12px 24px;
      background: #dc2626;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      margin-bottom: 12px;
    ">
      📥 Ouvrir ${filename || 'le fichier'}
    </a>
    <br/>
    <button onclick="this.closest('#temp-download-link').remove()" style="
      margin-top: 8px;
      padding: 8px 16px;
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      cursor: pointer;
      color: #374151;
    ">
      Fermer
    </button>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // Fermer en cliquant sur l'overlay
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      window.URL.revokeObjectURL(blobUrl);
    }
  });
  
  // Auto-fermer après 60 secondes
  setTimeout(() => {
    if (document.getElementById('temp-download-link')) {
      overlay.remove();
      window.URL.revokeObjectURL(blobUrl);
    }
  }, 60000);
};

/**
 * Télécharge un fichier depuis une URL avec authentification
 * @param {string} url - URL du fichier à télécharger
 * @param {string} filename - Nom du fichier suggéré
 * @param {string} token - Token d'authentification
 * @param {Object} options - Options supplémentaires
 */
export const downloadFromUrl = async (url, filename, token, options = {}) => {
  const { onSuccess, onError, onPopupBlocked, onStart } = options;
  
  try {
    if (onStart) onStart();
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }
    
    const blob = await response.blob();
    downloadFile(blob, filename, { onSuccess, onError, onPopupBlocked });
    
  } catch (error) {
    console.error('Erreur téléchargement depuis URL:', error);
    if (onError) {
      onError(error);
    }
  }
};

export default { downloadFile, downloadFromUrl, createVisibleDownloadLink };
