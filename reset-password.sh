#!/bin/bash

# OlcPanel Password Reset Script
# Сброс пароля администратора

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   OlcPanel Password Reset                 ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════╝${NC}"
echo ""

CONFIG_FILE="backend/data/config.json"

# Check if config exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}✗${NC} Файл конфигурации не найден: $CONFIG_FILE"
    echo "Создайте конфигурацию с помощью ./deploy.sh"
    exit 1
fi

echo -e "${GREEN}✓${NC} Найден файл конфигурации"
echo ""

# Show current username
CURRENT_USER=$(grep -o '"username": *"[^"]*"' "$CONFIG_FILE" | cut -d'"' -f4)
echo -e "Текущий логин: ${CYAN}$CURRENT_USER${NC}"
echo ""

# Ask for new credentials
read -p "Новый логин [$CURRENT_USER]: " NEW_USER
# Strip any escape codes and whitespace
NEW_USER=$(echo "$NEW_USER" | sed 's/\x1b\[[0-9;]*m//g' | xargs)
NEW_USER=${NEW_USER:-$CURRENT_USER}

while true; do
    read -s -p "Новый пароль: " NEW_PASS
    echo
    # Strip any escape codes and whitespace
    NEW_PASS=$(echo "$NEW_PASS" | sed 's/\x1b\[[0-9;]*m//g' | xargs)
    if [ -z "$NEW_PASS" ]; then
        echo -e "${YELLOW}⚠${NC} Пароль не может быть пустым"
        continue
    fi
    read -s -p "Повторите пароль: " NEW_PASS2
    echo
    NEW_PASS2=$(echo "$NEW_PASS2" | sed 's/\x1b\[[0-9;]*m//g' | xargs)
    if [ "$NEW_PASS" = "$NEW_PASS2" ]; then
        break
    else
        echo -e "${YELLOW}⚠${NC} Пароли не совпадают, попробуйте снова"
    fi
done

# Backup config
cp "$CONFIG_FILE" "$CONFIG_FILE.backup"
echo -e "${GREEN}✓${NC} Создана резервная копия: $CONFIG_FILE.backup"

# Read current config and strip escape codes
DNS=$(grep -o '"dns": *"[^"]*"' "$CONFIG_FILE" | cut -d'"' -f4 | sed 's/\x1b\[[0-9;]*m//g')
DEBUG=$(grep -o '"debug": *[^,}]*' "$CONFIG_FILE" | awk '{print $2}' | sed 's/\x1b\[[0-9;]*m//g')

# Write new config
cat > "$CONFIG_FILE" << EOF
{
  "username": "$NEW_USER",
  "password": "$NEW_PASS",
  "dns": "$DNS",
  "debug": $DEBUG
}
EOF

chmod 600 "$CONFIG_FILE"

echo -e "${GREEN}✓${NC} Конфигурация обновлена"
echo ""

# Detect Docker Compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo -e "${YELLOW}⚠${NC} Docker Compose не найден"
    echo "Перезапустите backend вручную для применения изменений"
    exit 0
fi

# Restart backend
echo "Перезапуск backend для применения изменений..."
$DOCKER_COMPOSE restart backend

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Пароль успешно изменен!                ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Новые учетные данные:${NC}"
echo -e "  Логин:  ${GREEN}$NEW_USER${NC}"
echo -e "  Пароль: ${GREEN}[установленный вами]${NC}"
echo ""
echo "Войдите в панель с новыми учетными данными"
