/**
 * Utilitaires d'export PDF et Excel standardisés
 * Utilise la méthode blob + iframe pour les PDF (fenêtre d'impression)
 * et blob + téléchargement direct pour Excel
 */

/**
 * Exporte un PDF en ouvrant une fenêtre d'impression
 * @param {string} url - URL de l'endpoint d'export
 * @param {string} token - Token d'authentification
 * @param {string} filename - Nom du fichier (optionnel, pour fallback)
 * @returns {Promise<boolean>} - true si succès
 */
export const exportPdfWithPrint = async (url, token, filename = 'document.pdf') => {
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }
    
    const blob = await response.blob();
    const pdfUrl = window.URL.createObjectURL(blob);
    
    // Créer un iframe caché pour l'impression
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = pdfUrl;
    document.body.appendChild(iframe);
    
    iframe.onload = () => {
      try {
        iframe.contentWindow.print();
      } catch (e) {
        console.error('Erreur impression:', e);
        // Fallback: ouvrir dans un nouvel onglet
        window.open(pdfUrl, '_blank');
      }
      
      // Nettoyer après un délai
      setTimeout(() => {
        document.body.removeChild(iframe);
        window.URL.revokeObjectURL(pdfUrl);
      }, 1000);
    };
    
    return true;
  } catch (error) {
    console.error('Erreur export PDF:', error);
    throw error;
  }
};

/**
 * Exporte un fichier Excel en téléchargement direct
 * @param {string} url - URL de l'endpoint d'export
 * @param {string} token - Token d'authentification
 * @param {string} filename - Nom du fichier
 * @returns {Promise<boolean>} - true si succès
 */
export const exportExcelDownload = async (url, token, filename = 'document.xlsx') => {
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }
    
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Nettoyer
    setTimeout(() => {
      window.URL.revokeObjectURL(downloadUrl);
    }, 100);
    
    return true;
  } catch (error) {
    console.error('Erreur export Excel:', error);
    throw error;
  }
};

/**
 * Fonction générique d'export qui choisit la bonne méthode selon le type
 * @param {string} url - URL de l'endpoint
 * @param {string} token - Token d'authentification
 * @param {string} type - 'pdf' ou 'excel'
 * @param {string} filename - Nom du fichier
 * @returns {Promise<boolean>}
 */
export const handleExport = async (url, token, type, filename) => {
  if (type === 'pdf') {
    return exportPdfWithPrint(url, token, filename);
  } else {
    return exportExcelDownload(url, token, filename);
  }
};

export default {
  exportPdfWithPrint,
  exportExcelDownload,
  handleExport
};
