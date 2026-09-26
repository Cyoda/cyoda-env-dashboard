#!/bin/bash

# Setup Environment from Template
# This script helps you create .env files from templates with different presets

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  Environment Setup from Template${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Function to create env file from template with preset
create_env_from_template() {
    local package_path=$1
    local preset=$2
    local template_file="${package_path}/.env.template"
    local env_file="${package_path}/.env.development.local"
    
    if [ ! -f "$template_file" ]; then
        echo -e "${YELLOW}⚠ Template not found: ${template_file}${NC}"
        return
    fi
    
    echo -e "${YELLOW}Creating ${env_file}...${NC}"
    
    # Copy template
    cp "$template_file" "$env_file"
    
    # Apply preset
    case $preset in
        "local")
            # Local development preset
            sed -i.bak 's|^VITE_APP_API_BASE=.*|VITE_APP_API_BASE=http://localhost:8082/api|' "$env_file"
            sed -i.bak 's|^VITE_APP_API_BASE_PROCESSING=.*|VITE_APP_API_BASE_PROCESSING=http://localhost:8081/processing|' "$env_file"
            sed -i.bak 's|^VITE_APP_BASE_URL=.*|VITE_APP_BASE_URL=http://localhost:8081/|' "$env_file"
            sed -i.bak 's|^VITE_APP_DEBUG=.*|VITE_APP_DEBUG=true|' "$env_file"
            ;;
        "remote")
            # Remote development preset (cyoda-develop)
            sed -i.bak 's|^VITE_APP_API_BASE=.*|VITE_APP_API_BASE=https://cyoda-develop.kube.cyoda.org/api|' "$env_file"
            sed -i.bak 's|^VITE_APP_API_BASE_PROCESSING=.*|VITE_APP_API_BASE_PROCESSING=https://cyoda-develop.kube.cyoda.org/processing|' "$env_file"
            sed -i.bak 's|^VITE_APP_BASE_URL=.*|VITE_APP_BASE_URL=https://cyoda-develop.kube.cyoda.org|' "$env_file"
            sed -i.bak 's|^VITE_APP_DEBUG=.*|VITE_APP_DEBUG=true|' "$env_file"
            ;;
        "custom")
            # Keep template as-is for manual editing
            ;;
    esac
    
    # Remove backup file
    rm -f "${env_file}.bak"
    
    echo -e "${GREEN}✓ Created ${env_file}${NC}"
}

# Check if preset is provided
PRESET=${1:-"interactive"}

if [ "$PRESET" = "local" ]; then
    echo -e "${GREEN}Setting up LOCAL development environment...${NC}"
    echo ""
    echo -e "${CYAN}Configuration:${NC}"
    echo "  API Base:        http://localhost:8082/api"
    echo "  Processing Base: http://localhost:8081/processing"
    echo "  Base URL:        http://localhost:8081/"
    echo ""
    
elif [ "$PRESET" = "remote" ]; then
    echo -e "${GREEN}Setting up REMOTE development environment (cyoda-develop)...${NC}"
    echo ""
    echo -e "${CYAN}Configuration:${NC}"
    echo "  API Base:        https://cyoda-develop.kube.cyoda.org/api"
    echo "  Processing Base: https://cyoda-develop.kube.cyoda.org/processing"
    echo "  Base URL:        https://cyoda-develop.kube.cyoda.org"
    echo ""
    
elif [ "$PRESET" = "custom" ]; then
    echo -e "${GREEN}Creating environment files from templates...${NC}"
    echo -e "${YELLOW}You will need to manually edit the files after creation.${NC}"
    echo ""
    
elif [ "$PRESET" = "interactive" ]; then
    echo -e "${CYAN}Choose environment preset:${NC}"
    echo ""
    echo "  1) Local Development (localhost:8081, localhost:8082)"
    echo "  2) Remote Development (cyoda-develop.kube.cyoda.org)"
    echo "  3) Custom (copy templates for manual editing)"
    echo ""
    read -p "Enter choice [1-3]: " choice
    
    case $choice in
        1)
            PRESET="local"
            echo ""
            echo -e "${GREEN}Setting up LOCAL development environment...${NC}"
            ;;
        2)
            PRESET="remote"
            echo ""
            echo -e "${GREEN}Setting up REMOTE development environment...${NC}"
            ;;
        3)
            PRESET="custom"
            echo ""
            echo -e "${GREEN}Creating templates for manual editing...${NC}"
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            exit 1
            ;;
    esac
else
    echo -e "${RED}Invalid preset: ${PRESET}${NC}"
    echo "Usage: $0 [local|remote|custom|interactive]"
    exit 1
fi

echo ""
read -p "Continue? [Y/n]: " confirm
if [[ $confirm =~ ^[Nn]$ ]]; then
    echo "Setup cancelled"
    exit 0
fi

echo ""
echo -e "${BLUE}Creating environment files...${NC}"
echo ""

# List of packages with templates
PACKAGES=(
    "packages/cobi-react"
    "packages/processing-manager-react"
)

# Create env files for packages with templates
for package in "${PACKAGES[@]}"; do
    if [ -d "$package" ]; then
        create_env_from_template "$package" "$PRESET"
    else
        echo -e "${YELLOW}⚠ Package not found: ${package}${NC}"
    fi
done

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Setup Complete! ✓${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""

if [ "$PRESET" = "custom" ]; then
    echo -e "${YELLOW}Next Steps:${NC}"
    echo ""
    echo "1. Edit the .env.development.local files in each package"
    echo "2. Configure the API URLs and other settings"
    echo "3. Start the development server:"
    echo -e "   ${CYAN}npm run dev${NC}"
else
    echo -e "${BLUE}Configuration Applied:${NC}"
    echo ""
    if [ "$PRESET" = "local" ]; then
        echo "  ✓ Local development environment"
        echo "  ✓ API: http://localhost:8082/api"
        echo "  ✓ Processing: http://localhost:8081/processing"
    elif [ "$PRESET" = "remote" ]; then
        echo "  ✓ Remote development environment"
        echo "  ✓ API: https://cyoda-develop.kube.cyoda.org/api"
        echo "  ✓ Processing: https://cyoda-develop.kube.cyoda.org/processing"
    fi
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo ""
    echo "1. Start the development server:"
    echo -e "   ${CYAN}npm run dev${NC}"
    echo ""
    echo "2. Or start a specific package:"
    echo -e "   ${CYAN}cd packages/cobi-react && npm run dev${NC}"
fi

echo ""
echo -e "${YELLOW}Note: You can edit .env.development.local files to customize settings${NC}"
echo ""

