#!/bin/bash

# Script de build pour les applications natives iOS et Android
# Usage: ./scripts/build-native.sh [ios|android|all]

set -e

echo "🚀 ProFireManager - Build Native"
echo "================================"

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Vérifier qu'on est dans le bon dossier
if [ ! -f "package.json" ]; then
    echo -e "${RED}Erreur: Exécutez ce script depuis le dossier frontend${NC}"
    exit 1
fi

# Fonction pour le build web
build_web() {
    echo -e "${YELLOW}📦 Construction du build web...${NC}"
    npm run build || yarn build
    echo -e "${GREEN}✅ Build web terminé${NC}"
}

# Fonction pour synchroniser Capacitor
sync_capacitor() {
    echo -e "${YELLOW}🔄 Synchronisation Capacitor...${NC}"
    npx cap sync
    echo -e "${GREEN}✅ Synchronisation terminée${NC}"
}

# Fonction pour iOS
build_ios() {
    echo -e "${YELLOW}🍎 Préparation iOS...${NC}"
    
    # Vérifier qu'on est sur Mac
    if [[ "$OSTYPE" != "darwin"* ]]; then
        echo -e "${RED}Erreur: iOS nécessite macOS${NC}"
        return 1
    fi
    
    npx cap sync ios
    echo -e "${GREEN}✅ iOS synchronisé${NC}"
    echo -e "${YELLOW}📱 Ouverture dans Xcode...${NC}"
    npx cap open ios
}

# Fonction pour Android
build_android() {
    echo -e "${YELLOW}🤖 Préparation Android...${NC}"
    npx cap sync android
    echo -e "${GREEN}✅ Android synchronisé${NC}"
    echo -e "${YELLOW}📱 Ouverture dans Android Studio...${NC}"
    npx cap open android
}

# Menu principal
case "$1" in
    ios)
        build_web
        build_ios
        ;;
    android)
        build_web
        build_android
        ;;
    all)
        build_web
        sync_capacitor
        echo -e "${GREEN}✅ Build complet terminé!${NC}"
        echo ""
        echo "Prochaines étapes:"
        echo "  - iOS:     npx cap open ios"
        echo "  - Android: npx cap open android"
        ;;
    sync)
        sync_capacitor
        ;;
    *)
        echo "Usage: $0 [ios|android|all|sync]"
        echo ""
        echo "  ios     - Build web + sync + ouvre Xcode"
        echo "  android - Build web + sync + ouvre Android Studio"
        echo "  all     - Build web + sync tous les projets"
        echo "  sync    - Synchronise Capacitor seulement"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}🎉 Terminé!${NC}"
