# Установка

## Требования

- Docker и Docker Compose
- Порты 80 и 3001 свободны
- Docker socket доступен (`/var/run/docker.sock`)

## Автоматическая установка (рекомендуется)

Используйте скрипт `deploy.sh` для автоматической установки:

```bash
git clone https://github.com/Weizing/OlcPanel.git
cd OlcPanel
./deploy.sh
```

**Скрипт выполнит:**
1. Проверку зависимостей (Docker, Docker Compose)
2. Интерактивную настройку:
   - Логин и пароль администратора
   - DNS сервер
   - Порты для веб-интерфейса и API
   - Debug режим
3. Создание `backend/data/config.json` с вашими настройками
4. Генерацию SECRET_KEY для JWT
5. Настройку `docker-compose.yml`
6. Проверку доступности портов
7. Сборку OlcRTC образа
8. Развертывание панели
9. Проверку работоспособности

**Преимущества:**
- Безопасные учетные данные с первого запуска
- Автоматическая проверка конфликтов портов
- Валидация конфигурации
- Готовая к production настройка

## Ручная установка

Если предпочитаете ручную установку:

1. Клонируйте репозиторий:
```bash
git clone https://github.com/Weizing/OlcPanel.git
cd OlcPanel
```

2. Соберите OlcRTC образ:
```bash
cd olcrtc
docker build -t olcrtc:latest .
cd ..
```

3. Создайте конфигурацию (опционально):
```bash
mkdir -p backend/data
cat > backend/data/config.json << EOF
{
  "username": "admin",
  "password": "your-secure-password",
  "dns": "1.1.1.1:53",
  "debug": false
}
EOF
chmod 600 backend/data/config.json
```

4. Запустите панель:
```bash
docker-compose up -d
```

5. Откройте браузер:
```
http://localhost
```

**Учетные данные по умолчанию (если не создали config.json):**
- Логин: `admin`
- Пароль: `admin`

⚠️ **ВАЖНО:** Измените пароль перед развертыванием на сервер!

## Production развертывание

Для production используйте:
```bash
docker-compose up -d
```

**Если панель не открывается на сервере:**
См. [SERVER_DEPLOYMENT.md](SERVER_DEPLOYMENT.md) для полной диагностики проблем с доступом.

**Безопасность:**
См. [SECURITY.md](../SECURITY.md) для настройки безопасности.
