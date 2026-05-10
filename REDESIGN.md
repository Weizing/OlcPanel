# Переход на новый дизайн (shadcn/ui)

## Что изменилось

- Заменён vaporwave дизайн на современный UI в стиле shadcn/ui
- Добавлен Tailwind CSS вместо кастомного CSS
- Использованы компоненты: Button, Card, Input, Label, Select, Badge, Dialog
- Добавлены иконки из lucide-react
- Улучшена читаемость и UX

## Установка на сервере

```bash
cd /path/to/OlcPanel

# Пересоберите frontend с новыми зависимостями
docker compose build frontend --no-cache

# Перезапустите
docker compose up -d

# Проверьте логи
docker compose logs -f frontend
```

## Откат на старый дизайн

Если новый дизайн не понравился:

```bash
cd /path/to/OlcPanel/frontend/src

# Восстановите старые файлы
mv App.js.backup App.js
mv App.css.backup App.css

# Удалите новые зависимости из package.json
# Верните старую версию package.json из git

# Пересоберите
docker compose build frontend --no-cache
docker compose up -d
```

## Возможные проблемы

1. **Ошибка сборки npm**: Убедитесь что в package.json добавлены все зависимости
2. **Белый экран**: Проверьте логи `docker compose logs frontend`
3. **Компоненты не работают**: Убедитесь что все файлы в `src/components/ui/` созданы

## Новые возможности

- Адаптивный дизайн (responsive)
- Тёмная тема (dark mode) - готова к использованию
- Лучшая доступность (accessibility)
- Современные анимации
- Улучшенная типографика
