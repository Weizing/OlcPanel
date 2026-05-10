# Конфигурация

## Учетные данные

Отредактируйте `backend/data/config.json`:
```json
{
  "username": "your_username",
  "password": "your_secure_password",
  "dns": "1.1.1.1:53",
  "debug": false
}
```

## Переменные окружения

Создайте `.env` файл в корне проекта:
```env
SECRET_KEY=your-secret-key-here-change-me
```

Для генерации безопасного ключа:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

## DNS настройки

По умолчанию используется `1.1.1.1:53` (Cloudflare DNS).

Другие варианты:
- Google DNS: `8.8.8.8:53`
- Quad9: `9.9.9.9:53`
- Локальный: `127.0.0.1:53`

## Режим отладки

Для включения debug режима в `backend/data/config.json`:
```json
{
  "debug": true
}
```

В debug режиме выводятся дополнительные логи.

## Порты

По умолчанию:
- Frontend: `80`
- Backend API: `3001`

Для изменения портов отредактируйте `docker-compose.yml`:
```yaml
services:
  frontend:
    ports:
      - "8080:80"  # Изменить на нужный порт
  backend:
    ports:
      - "3002:3001"  # Изменить на нужный порт
```

## Docker настройки

### Лимиты ресурсов

Добавьте в `docker-compose.yml`:
```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

### Логирование

Настройка ротации логов:
```yaml
services:
  backend:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```
