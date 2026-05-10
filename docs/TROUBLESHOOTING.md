# Troubleshooting

**Если панель не открывается на сервере:**
```bash
./diagnose.sh  # Автоматическая диагностика проблем
```

**Если забыли пароль:**
```bash
./reset-password.sh  # Сброс учетных данных
```

## Общие проблемы

### Ошибка "No such file or directory: 'docker'"

**Причина:** Docker socket не смонтирован в backend контейнер.

**Решение:**
Проверьте `docker-compose.yml`:
```yaml
services:
  backend:
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

### Ошибка генерации Room ID

**Причина:** OlcRTC образ не собран.

**Решение:**
```bash
cd olcrtc
docker build -t olcrtc:latest .
```

Проверьте что образ существует:
```bash
docker images | grep olcrtc
```

### Логи не отображаются

**Причина:** Контейнер инстанса не запущен.

**Решение:**
```bash
docker ps | grep olcrtc-
```

Если контейнер не запущен, проверьте логи backend:
```bash
docker-compose logs backend
```

### 401 Unauthorized

**Причина:** JWT токен истек или невалиден.

**Решение:**
1. Выйдите из панели
2. Войдите снова с правильными учетными данными
3. Токен обновится автоматически

### Порты заняты

**Причина:** Порты 80 или 3001 уже используются.

**Решение:**
Проверьте какой процесс использует порт:
```bash
# Linux/macOS
lsof -i :80
lsof -i :3001

# Или измените порты в docker-compose.yml
```

### Backend не запускается

**Причина:** Ошибка при установке зависимостей.

**Решение:**
Пересоберите backend:
```bash
docker compose down
docker compose build backend --no-cache
docker compose up -d
```

### Frontend показывает белый экран

**Причина:** Ошибка сборки React приложения.

**Решение:**
Проверьте логи frontend:
```bash
docker compose logs frontend
```

Пересоберите frontend:
```bash
docker compose build frontend --no-cache
docker compose up -d
```

### Инстанс не запускается

**Причина:** Неверные параметры или конфликт портов.

**Решение:**
1. Проверьте логи инстанса в панели
2. Проверьте что Room ID и Encryption Key корректны
3. Убедитесь что DNS доступен

### Docker socket permission denied

**Причина:** Недостаточно прав для доступа к Docker socket.

**Решение (Linux):**
```bash
sudo usermod -aG docker $USER
# Перелогиньтесь
```

Или запустите с sudo:
```bash
sudo docker-compose up -d
```

## Логи и отладка

### Просмотр всех логов
```bash
docker compose logs -f
```

### Логи конкретного сервиса
```bash
docker compose logs -f backend
docker compose logs -f frontend
```

### Логи OlcRTC инстанса
```bash
docker logs olcrtc-<uid>
```

### Проверка статуса контейнеров
```bash
docker compose ps
```

### Перезапуск сервисов
```bash
docker compose restart
```

### Полная переустановка
```bash
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

## Производительность

### Высокая нагрузка CPU

**Причина:** Много запущенных инстансов.

**Решение:**
- Остановите неиспользуемые инстансы
- Увеличьте ресурсы сервера
- Настройте лимиты в docker-compose.yml

### Высокое потребление RAM

**Причина:** Утечка памяти или много инстансов.

**Решение:**
```bash
# Проверьте использование памяти
docker stats

# Перезапустите сервисы
docker compose restart
```

## Получение помощи

Если проблема не решена:
1. Проверьте [Issues](https://github.com/Weizing/OlcPanel/issues)
2. Создайте новый issue с:
   - Версией OlcPanel
   - Версией Docker
   - Шагами для воспроизведения
   - Логами ошибки
