#!/bin/bash

# OlcPanel Auto-Deploy Script
# Автоматическая установка и развертывание панели

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Banner
echo -e "${CYAN}"
cat << "EOF"
╔═══════════════════════════════════════════╗
║                                           ║
║         OlcPanel Auto-Deploy v1.0         ║
║                                           ║
╚═══════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Functions
print_step() {
    echo -e "\n${BLUE}▶${NC} ${CYAN}$1${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    print_warning "Не рекомендуется запускать от root. Используйте обычного пользователя с sudo."
    read -p "Продолжить? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Step 1: Check prerequisites
print_step "Шаг 1/7: Проверка зависимостей"

if ! command -v docker &> /dev/null; then
    print_error "Docker не установлен"
    echo "Установите Docker: https://docs.docker.com/engine/install/"
    exit 1
fi
print_success "Docker установлен: $(docker --version)"

# Detect Docker Compose command (v1 or v2)
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
    print_success "Docker Compose v2 установлен: $(docker compose version)"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
    print_success "Docker Compose v1 установлен: $(docker-compose --version)"
else
    print_error "Docker Compose не установлен"
    echo "Установите Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

# Check Docker socket
if [ ! -S /var/run/docker.sock ]; then
    print_error "Docker socket не найден"
    exit 1
fi
print_success "Docker socket доступен"

# Step 2: Configuration
print_step "Шаг 2/7: Настройка конфигурации"

# Generate random secret key
SECRET_KEY=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1)

# Ask for credentials
echo ""
read -p "Введите логин администратора [admin]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}

while true; do
    read -s -p "Введите пароль администратора: " ADMIN_PASS
    echo
    if [ -z "$ADMIN_PASS" ]; then
        print_warning "Пароль не может быть пустым"
        continue
    fi
    read -s -p "Повторите пароль: " ADMIN_PASS2
    echo
    if [ "$ADMIN_PASS" = "$ADMIN_PASS2" ]; then
        break
    else
        print_warning "Пароли не совпадают, попробуйте снова"
    fi
done

# Ask for DNS
read -p "DNS сервер [1.1.1.1:53]: " DNS_SERVER
DNS_SERVER=${DNS_SERVER:-1.1.1.1:53}

# Ask for ports
read -p "Порт для веб-интерфейса [80]: " WEB_PORT
WEB_PORT=${WEB_PORT:-80}

read -p "Порт для API [3001]: " API_PORT
API_PORT=${API_PORT:-3001}

# Ask for debug mode
read -p "Включить debug режим? (y/n) [n]: " DEBUG_MODE
if [[ $DEBUG_MODE =~ ^[Yy]$ ]]; then
    DEBUG_MODE=true
else
    DEBUG_MODE=false
fi

# Ask for HTTPS setup
echo ""
read -p "Настроить HTTPS через Caddy? (y/n) [n]: " SETUP_HTTPS
if [[ $SETUP_HTTPS =~ ^[Yy]$ ]]; then
    ENABLE_HTTPS=true
    read -p "Введите домен (например, panel.example.com): " DOMAIN
    if [ -z "$DOMAIN" ]; then
        print_error "Домен не может быть пустым"
        exit 1
    fi
    read -p "Email для Let's Encrypt: " LETSENCRYPT_EMAIL
    if [ -z "$LETSENCRYPT_EMAIL" ]; then
        print_error "Email не может быть пустым"
        exit 1
    fi
    WEB_PORT=443
    print_success "HTTPS будет настроен для домена: $DOMAIN"
else
    ENABLE_HTTPS=false
fi

print_success "Конфигурация создана"

# Step 3: Create backend config
print_step "Шаг 3/7: Создание config.json"

mkdir -p backend/data

cat > backend/data/config.json << EOF
{
  "username": "$ADMIN_USER",
  "password": "$ADMIN_PASS",
  "dns": "$DNS_SERVER",
  "debug": $DEBUG_MODE
}
EOF

chmod 600 backend/data/config.json
print_success "backend/data/config.json создан"

# Step 4: Create/update docker-compose.yml
print_step "Шаг 4/7: Настройка docker-compose.yml"

# Backup existing docker-compose.yml if exists
if [ -f docker-compose.yml ]; then
    cp docker-compose.yml docker-compose.yml.backup
    print_success "Создана резервная копия: docker-compose.yml.backup"
fi

if [ "$ENABLE_HTTPS" = true ]; then
    # Generate docker-compose with Caddy
    cat > docker-compose.yml << EOF
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: olcpanel-backend
    environment:
      - NODE_ENV=production
      - PORT=3001
      - SECRET_KEY=$SECRET_KEY
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./backend/data:/app/data
    restart: unless-stopped
    networks:
      - olcpanel-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: olcpanel-frontend
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - olcpanel-network

  caddy:
    image: caddy:2-alpine
    container_name: olcpanel-caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - frontend
      - backend
    restart: unless-stopped
    networks:
      - olcpanel-network

networks:
  olcpanel-network:
    driver: bridge

volumes:
  caddy_data:
  caddy_config:
EOF

    # Create Caddyfile
    cat > Caddyfile << EOF
$DOMAIN {
    reverse_proxy frontend:80

    handle /api/* {
        reverse_proxy backend:3001
    }

    encode gzip

    tls $LETSENCRYPT_EMAIL
}
EOF

    print_success "Caddyfile создан для домена $DOMAIN"
else
    # Generate docker-compose without Caddy
    cat > docker-compose.yml << EOF
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: olcpanel-backend
    ports:
      - "$API_PORT:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - SECRET_KEY=$SECRET_KEY
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./backend/data:/app/data
    restart: unless-stopped
    networks:
      - olcpanel-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: olcpanel-frontend
    ports:
      - "$WEB_PORT:80"
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - olcpanel-network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  olcpanel-network:
    driver: bridge
EOF
fi

print_success "docker-compose.yml настроен"

# Step 5: Check ports availability
print_step "Шаг 5/7: Проверка доступности портов"

check_port() {
    local port=$1
    if command -v netstat &> /dev/null; then
        if sudo netstat -tuln 2>/dev/null | grep -q ":$port "; then
            return 1
        fi
    elif command -v ss &> /dev/null; then
        if sudo ss -tuln 2>/dev/null | grep -q ":$port "; then
            return 1
        fi
    fi
    return 0
}

if ! check_port $WEB_PORT; then
    print_warning "Порт $WEB_PORT уже используется"
    read -p "Продолжить? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    print_success "Порт $WEB_PORT свободен"
fi

if ! check_port $API_PORT; then
    print_warning "Порт $API_PORT уже используется"
    read -p "Продолжить? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    print_success "Порт $API_PORT свободен"
fi

# Step 6: Build OlcRTC image
print_step "Шаг 6/7: Сборка OlcRTC образа"

if [ -d "olcrtc" ]; then
    echo "Сборка OlcRTC образа (это может занять несколько минут)..."
    docker build -f olcrtc/Dockerfile -t olcrtc:latest ./olcrtc
    print_success "OlcRTC образ собран"
else
    print_warning "Директория olcrtc не найдена, пропускаем сборку"
    print_warning "Генерация Room ID не будет работать без образа olcrtc:latest"
fi

# Step 7: Deploy
print_step "Шаг 7/7: Развертывание панели"

# Stop existing containers
if docker ps -a | grep -q "olcpanel"; then
    print_warning "Найдены существующие контейнеры, останавливаем..."
    $DOCKER_COMPOSE down
fi

# Build and start
echo "Сборка образов (это может занять несколько минут)..."
$DOCKER_COMPOSE build --no-cache

echo "Запуск контейнеров..."
$DOCKER_COMPOSE up -d

# Wait for services to be ready
echo "Ожидание запуска сервисов..."
sleep 5

# Check if containers are running
if docker ps | grep -q "olcpanel-backend.*Up" && docker ps | grep -q "olcpanel-frontend.*Up"; then
    print_success "Контейнеры запущены"
else
    print_error "Ошибка запуска контейнеров"
    echo "Проверьте логи: $DOCKER_COMPOSE logs"
    exit 1
fi

# Test backend
if curl -s -f http://localhost:$API_PORT/api/health > /dev/null 2>&1; then
    print_success "Backend работает"
else
    print_warning "Backend не отвечает, проверьте логи: $DOCKER_COMPOSE logs backend"
fi

# Test frontend
if curl -s -f -I http://localhost:$WEB_PORT > /dev/null 2>&1; then
    print_success "Frontend работает"
else
    print_warning "Frontend не отвечает, проверьте логи: $DOCKER_COMPOSE logs frontend"
fi

# Final summary
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                           ║${NC}"
echo -e "${GREEN}║     Установка завершена успешно! 🎉       ║${NC}"
echo -e "${GREEN}║                                           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
echo ""

# Detect public IP
PUBLIC_IP=$(curl -s -4 ifconfig.me 2>/dev/null || curl -s -4 icanhazip.com 2>/dev/null || echo "")

echo -e "${CYAN}Информация для доступа:${NC}"
if [ "$ENABLE_HTTPS" = true ]; then
    echo -e "  URL:      ${GREEN}https://$DOMAIN${NC}"
    echo -e "  HTTP:     ${YELLOW}http://$DOMAIN${NC} (будет перенаправлен на HTTPS)"
    if [ -n "$PUBLIC_IP" ]; then
        echo -e "  IP:       ${YELLOW}$PUBLIC_IP${NC}"
    fi
else
    if [ -n "$PUBLIC_IP" ]; then
        echo -e "  URL:      ${GREEN}http://$PUBLIC_IP:$WEB_PORT${NC}"
        echo -e "  Локально: ${YELLOW}http://localhost:$WEB_PORT${NC}"
    else
        echo -e "  URL:      ${GREEN}http://localhost:$WEB_PORT${NC}"
    fi
fi
echo -e "  Логин:    ${GREEN}$ADMIN_USER${NC}"
echo -e "  Пароль:   ${GREEN}[установленный вами]${NC}"
echo ""
if [ "$ENABLE_HTTPS" = false ]; then
    echo -e "${CYAN}API:${NC}"
    echo -e "  URL:      ${GREEN}http://localhost:$API_PORT${NC}"
    echo ""
fi
echo -e "${CYAN}Полезные команды:${NC}"
echo -e "  Статус:           ${YELLOW}$DOCKER_COMPOSE ps${NC}"
echo -e "  Логи:             ${YELLOW}$DOCKER_COMPOSE logs -f${NC}"
echo -e "  Перезапуск:       ${YELLOW}$DOCKER_COMPOSE restart${NC}"
echo -e "  Остановка:        ${YELLOW}$DOCKER_COMPOSE down${NC}"
echo -e "  Диагностика:      ${YELLOW}./diagnose.sh${NC}"
echo ""
echo -e "${CYAN}Конфигурация сохранена в:${NC}"
echo -e "  ${YELLOW}backend/data/config.json${NC}"
echo -e "  ${YELLOW}docker-compose.yml${NC}"
if [ "$ENABLE_HTTPS" = true ]; then
    echo -e "  ${YELLOW}Caddyfile${NC}"
fi
echo ""

# Firewall reminder
if [ "$ENABLE_HTTPS" = false ]; then
    if command -v ufw &> /dev/null || command -v firewall-cmd &> /dev/null; then
        echo -e "${YELLOW}⚠ Напоминание:${NC}"
        echo -e "  Если панель не открывается извне, откройте порты в firewall:"
        if command -v ufw &> /dev/null; then
            echo -e "    ${YELLOW}sudo ufw allow $WEB_PORT/tcp${NC}"
        fi
        if command -v firewall-cmd &> /dev/null; then
            echo -e "    ${YELLOW}sudo firewall-cmd --permanent --add-port=$WEB_PORT/tcp${NC}"
            echo -e "    ${YELLOW}sudo firewall-cmd --reload${NC}"
        fi
        echo ""
    fi

    # Cloud provider reminder
    echo -e "${YELLOW}⚠ Для облачных серверов (AWS, GCP, Azure):${NC}"
    echo -e "  Откройте порт $WEB_PORT в Security Groups / Firewall Rules"
    echo ""
else
    echo -e "${YELLOW}⚠ Для работы HTTPS:${NC}"
    echo -e "  1. Убедитесь что домен $DOMAIN указывает на IP этого сервера"
    echo -e "  2. Откройте порты 80 и 443 в firewall:"
    if command -v ufw &> /dev/null; then
        echo -e "     ${YELLOW}sudo ufw allow 80/tcp${NC}"
        echo -e "     ${YELLOW}sudo ufw allow 443/tcp${NC}"
    fi
    if command -v firewall-cmd &> /dev/null; then
        echo -e "     ${YELLOW}sudo firewall-cmd --permanent --add-port=80/tcp${NC}"
        echo -e "     ${YELLOW}sudo firewall-cmd --permanent --add-port=443/tcp${NC}"
        echo -e "     ${YELLOW}sudo firewall-cmd --reload${NC}"
    fi
    echo -e "  3. Для облачных серверов откройте порты 80 и 443 в Security Groups"
    echo -e "  4. Caddy автоматически получит SSL сертификат от Let's Encrypt"
    echo ""
fi

echo -e "${CYAN}Документация:${NC}"
echo -e "  ${YELLOW}docs/SERVER_DEPLOYMENT.md${NC} - Решение проблем"
echo -e "  ${YELLOW}docs/CONFIGURATION.md${NC}     - Настройка"
echo -e "  ${YELLOW}docs/API.md${NC}               - API документация"
echo ""

if [ "$ENABLE_HTTPS" = true ]; then
    print_success "Готово! Откройте https://$DOMAIN в браузере"
    if [ -n "$PUBLIC_IP" ]; then
        echo -e "${CYAN}Публичный IP сервера:${NC} $PUBLIC_IP"
    fi
    echo ""
    echo -e "${CYAN}Примечание:${NC} Первый запуск может занять 1-2 минуты для получения SSL сертификата"
else
    if [ -n "$PUBLIC_IP" ]; then
        print_success "Готово! Откройте http://$PUBLIC_IP:$WEB_PORT в браузере"
    else
        print_success "Готово! Откройте http://localhost:$WEB_PORT в браузере"
    fi
fi
