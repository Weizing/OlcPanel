#!/bin/bash

# OlcPanel Diagnostics Script
# Быстрая диагностика проблем с развертыванием

echo "╔════════════════════════════════════════╗"
echo "║   OlcPanel Diagnostics v1.0            ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check functions
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Проверка Docker"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v docker &> /dev/null; then
    check_pass "Docker установлен: $(docker --version)"
else
    check_fail "Docker не установлен"
    exit 1
fi

# Detect Docker Compose command (v1 or v2)
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
    check_pass "Docker Compose v2 установлен: $(docker compose version --short 2>/dev/null || echo 'v2')"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
    check_pass "Docker Compose v1 установлен: $(docker-compose --version)"
else
    check_fail "Docker Compose не установлен"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2. Статус контейнеров"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -q "olcpanel"; then
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep "olcpanel"

    if docker ps | grep -q "olcpanel-backend.*Up"; then
        check_pass "Backend контейнер запущен"
    else
        check_fail "Backend контейнер не запущен"
    fi

    if docker ps | grep -q "olcpanel-frontend.*Up"; then
        check_pass "Frontend контейнер запущен"
    else
        check_fail "Frontend контейнер не запущен"
    fi
else
    check_fail "Контейнеры OlcPanel не найдены"
    echo "Запустите: docker-compose up -d"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3. Проверка портов"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v netstat &> /dev/null; then
    PORT_CMD="netstat -tulpn"
elif command -v ss &> /dev/null; then
    PORT_CMD="ss -tulpn"
else
    check_warn "netstat/ss не найдены, пропускаем проверку портов"
    PORT_CMD=""
fi

if [ -n "$PORT_CMD" ]; then
    if sudo $PORT_CMD 2>/dev/null | grep -q ":80 "; then
        PORT_80=$(sudo $PORT_CMD 2>/dev/null | grep ":80 " | awk '{print $NF}')
        if echo "$PORT_80" | grep -q "docker"; then
            check_pass "Порт 80 используется Docker"
        else
            check_warn "Порт 80 занят процессом: $PORT_80"
        fi
    else
        check_fail "Порт 80 не прослушивается"
    fi

    if sudo $PORT_CMD 2>/dev/null | grep -q ":3001 "; then
        PORT_3001=$(sudo $PORT_CMD 2>/dev/null | grep ":3001 " | awk '{print $NF}')
        if echo "$PORT_3001" | grep -q "docker"; then
            check_pass "Порт 3001 используется Docker"
        else
            check_warn "Порт 3001 занят процессом: $PORT_3001"
        fi
    else
        check_fail "Порт 3001 не прослушивается"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4. Docker socket"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -S /var/run/docker.sock ]; then
    check_pass "Docker socket существует"
    ls -la /var/run/docker.sock

    if [ -r /var/run/docker.sock ] && [ -w /var/run/docker.sock ]; then
        check_pass "Docker socket доступен для чтения/записи"
    else
        check_warn "Недостаточно прав для Docker socket"
        echo "Выполните: sudo chmod 666 /var/run/docker.sock"
    fi
else
    check_fail "Docker socket не найден"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5. Проверка доступности сервисов"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Backend health check
if curl -s -f http://localhost:3001/api/health > /dev/null 2>&1; then
    HEALTH=$(curl -s http://localhost:3001/api/health)
    check_pass "Backend отвечает: $HEALTH"
else
    check_fail "Backend не отвечает на http://localhost:3001/api/health"
fi

# Frontend check
if curl -s -f -I http://localhost > /dev/null 2>&1; then
    check_pass "Frontend отвечает на http://localhost"
else
    check_fail "Frontend не отвечает на http://localhost"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6. Docker network"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if docker network ls | grep -q "olcpanel-network"; then
    check_pass "Сеть olcpanel-network существует"

    BACKEND_IN_NET=$(docker network inspect olcpanel-network 2>/dev/null | grep -c "olcpanel-backend")
    FRONTEND_IN_NET=$(docker network inspect olcpanel-network 2>/dev/null | grep -c "olcpanel-frontend")

    if [ "$BACKEND_IN_NET" -gt 0 ]; then
        check_pass "Backend подключен к сети"
    else
        check_fail "Backend не подключен к сети"
    fi

    if [ "$FRONTEND_IN_NET" -gt 0 ]; then
        check_pass "Frontend подключен к сети"
    else
        check_fail "Frontend не подключен к сети"
    fi
else
    check_fail "Сеть olcpanel-network не найдена"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "7. Firewall (если применимо)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check ufw
if command -v ufw &> /dev/null; then
    if sudo ufw status 2>/dev/null | grep -q "Status: active"; then
        check_warn "UFW активен"
        if sudo ufw status | grep -q "80.*ALLOW"; then
            check_pass "Порт 80 разрешен в UFW"
        else
            check_fail "Порт 80 не разрешен в UFW"
            echo "Выполните: sudo ufw allow 80/tcp"
        fi
        if sudo ufw status | grep -q "3001.*ALLOW"; then
            check_pass "Порт 3001 разрешен в UFW"
        else
            check_warn "Порт 3001 не разрешен в UFW (опционально)"
        fi
    else
        check_pass "UFW неактивен"
    fi
fi

# Check firewalld
if command -v firewall-cmd &> /dev/null; then
    if sudo firewall-cmd --state 2>/dev/null | grep -q "running"; then
        check_warn "firewalld активен"
        if sudo firewall-cmd --list-ports 2>/dev/null | grep -q "80/tcp"; then
            check_pass "Порт 80 разрешен в firewalld"
        else
            check_fail "Порт 80 не разрешен в firewalld"
            echo "Выполните: sudo firewall-cmd --permanent --add-port=80/tcp && sudo firewall-cmd --reload"
        fi
    else
        check_pass "firewalld неактивен"
    fi
fi

# Check iptables
if command -v iptables &> /dev/null; then
    if sudo iptables -L -n 2>/dev/null | grep -q "DROP\|REJECT"; then
        check_warn "iptables содержит правила блокировки"
        echo "Проверьте правила: sudo iptables -L -n"
    fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "8. Последние логи"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "Backend (последние 10 строк):"
$DOCKER_COMPOSE logs --tail=10 backend 2>/dev/null || echo "Не удалось получить логи backend"

echo ""
echo "Frontend (последние 10 строк):"
$DOCKER_COMPOSE logs --tail=10 frontend 2>/dev/null || echo "Не удалось получить логи frontend"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "9. Системная информация"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "ОС: $(uname -s)"
echo "Ядро: $(uname -r)"
echo "Архитектура: $(uname -m)"

if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "Дистрибутив: $NAME $VERSION"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "10. Рекомендации"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "Если панель не открывается:"
echo "1. Проверьте, что контейнеры запущены: $DOCKER_COMPOSE ps"
echo "2. Проверьте логи: $DOCKER_COMPOSE logs -f"
echo "3. Проверьте firewall вашего облачного провайдера (AWS Security Groups, GCP Firewall, etc.)"
echo "4. Убедитесь, что порты 80 и 3001 открыты"
echo "5. См. полную документацию: docs/SERVER_DEPLOYMENT.md"
echo ""
echo "Для перезапуска:"
echo "  $DOCKER_COMPOSE restart"
echo ""
echo "Для полной переустановки:"
echo "  $DOCKER_COMPOSE down -v"
echo "  $DOCKER_COMPOSE build --no-cache"
echo "  $DOCKER_COMPOSE up -d"
echo ""

echo "╔════════════════════════════════════════╗"
echo "║   Диагностика завершена                ║"
echo "╚════════════════════════════════════════╝"
