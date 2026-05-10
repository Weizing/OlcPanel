# API Документация

## Аутентификация

Все endpoints (кроме `/api/login`) требуют JWT токен в заголовке:
```
Authorization: Bearer <token>
```

Токены действительны 7 дней.

## Endpoints

### POST /api/login
Аутентификация пользователя.

**Request:**
```json
{
  "username": "admin",
  "password": "admin"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### GET /api/status
Получить статус всех инстансов и сервера.

**Response:**
```json
{
  "users": [
    {
      "uid": "user123",
      "carrier": "wbstream",
      "transport": "datachannel",
      "mode": "srv",
      "status": "running",
      "container_id": "abc123..."
    }
  ],
  "server": {
    "cpu_percent": 45.2,
    "ram_percent": 62.8
  }
}
```

### GET /api/carriers
Список доступных carriers.

**Response:**
```json
{
  "carriers": ["wbstream", "jazz", "telemost"]
}
```

### GET /api/transports
Список доступных transports.

**Response:**
```json
{
  "transports": ["datachannel", "vp8channel", "seichannel", "videochannel"]
}
```

### GET /api/transport-params/:transport
Получить параметры для конкретного транспорта.

**Response (datachannel):**
```json
{
  "params": {
    "ordered": {"type": "boolean", "default": true},
    "maxRetransmits": {"type": "number", "default": 0}
  }
}
```

### POST /api/users/add
Добавить новый инстанс.

**Request:**
```json
{
  "uid": "user123",
  "carrier": "wbstream",
  "transport": "datachannel",
  "mode": "srv",
  "room_id": "generated-room-id",
  "encryption_key": "generated-key",
  "dns": "1.1.1.1:53",
  "mimo": "ProfileName",
  "transport_params": {
    "ordered": true,
    "maxRetransmits": 0
  }
}
```

**Response:**
```json
{
  "success": true,
  "uid": "user123"
}
```

### POST /api/users/start/:uid
Запустить инстанс.

**Response:**
```json
{
  "success": true,
  "container_id": "abc123..."
}
```

### POST /api/users/stop/:uid
Остановить инстанс.

**Response:**
```json
{
  "success": true
}
```

### POST /api/users/delete/:uid
Удалить инстанс.

**Response:**
```json
{
  "success": true
}
```

### GET /api/users/logs/:uid
Получить логи инстанса.

**Response:**
```json
{
  "logs": "2026-05-09 21:44:45 [INFO] Starting OlcRTC...\n..."
}
```

### POST /api/generate-room-ids
Генерация Room ID через `-mode gen`.

**Request:**
```json
{
  "count": 5
}
```

**Response:**
```json
{
  "room_ids": [
    "room-id-1",
    "room-id-2",
    "room-id-3",
    "room-id-4",
    "room-id-5"
  ]
}
```

### GET /api/generate-uri/:uid
Генерация URI для инстанса.

**Response:**
```json
{
  "uri": "olcrtc://wbstream?datachannel&ordered=true&maxRetransmits=0@room-id#encryption-key%client-id$ProfileName"
}
```

## Коды ошибок

- `401 Unauthorized` - Токен отсутствует, истек или невалиден
- `404 Not Found` - Инстанс не найден
- `500 Internal Server Error` - Ошибка сервера
