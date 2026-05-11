<div align="center">

<a href="https://github.com/atrium-archive/AtriLauncher/">
    <img src="docs/logo.png" alt="Logo" width="150" height="150">
  </a>

### OlcPanel

Веб-панель управления для протокола [OlcRTC](https://github.com/openlibrecommunity/olcrtc)

[Установка](docs/INSTALLATION.md) · [Конфигурация](docs/CONFIGURATION.md)  · [Troubleshooting](docs/TROUBLESHOOTING.md) · [API](docs/API.md)

![License](https://img.shields.io/badge/license-MIT-0D1117?style=flat-square&logo=open-source-initiative&logoColor=green&labelColor=0D1117)
![Docker](https://img.shields.io/badge/docker-ready-0D1117?style=flat-square&logo=docker&logoColor=2496ED&labelColor=0D1117)
![Python](https://img.shields.io/badge/python-3.11-0D1117?style=flat-square&logo=python&logoColor=3776AB&labelColor=0D1117)
![React](https://img.shields.io/badge/react-18-0D1117?style=flat-square&logo=react&logoColor=61DAFB&labelColor=0D1117)

</div>

---

## О проекте

OlcPanel — это Docker-based веб-панель для управления инстансами [OlcRTC](https://github.com/openlibrecommunity/olcrtc) протокола. Поддерживает управлением множеством инстансов в одном месте, генерацию Room ID, мониторинг в реальном времени и JWT аутентификацию.

**Возможности:**
- Управление инстансами OlcRTC через Docker
- Генерация Room ID и Encryption Key
- URI генерация в формате `olcrtc://`
- Логи и мониторинг CPU/RAM в реальном времени
- JWT аутентификация

## Технологии

**Backend:** Python 3.11, Flask, Docker SDK, JWT, psutil  
**Frontend:** React 18, Axios, CSS3  
**DevOps:** Docker, Docker Compose, Caddy

## Roadmap

- [ ] Автообновление ядра и панели
- [ ] Сохранение и автозапуск инстансов при запуске панели
- [ ] Графики трафика
- [ ] Экспорт/импорт конфигураций
- [ ] Watchdog для автоматического перезапуска
- [ ] API ключи

## Лицензия

MIT License — см. [LICENSE](LICENSE)

## Благодарности

- [OlcRTC](https://github.com/openlibrecommunity/olcrtc) — основной протокол
