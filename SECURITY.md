# Security
⚠️ **ВАЖНО:** Перед развертыванием на production:

1. **Измените SECRET_KEY**
   ```bash
   # Сгенерируйте случайный ключ
   python3 -c "import secrets; print(secrets.token_hex(32))"
   ```
   
   Добавьте в `.env`:
   ```
   SECRET_KEY=your-generated-secret-key
   ```

2. **Измените учетные данные**
   
   Отредактируйте `backend/data/config.json`:
   ```json
   {
     "username": "your_secure_username",
     "password": "your_secure_password",
     "dns": "1.1.1.1:53",
     "debug": false
   }
   ```

3. **Настройте HTTPS**
   
   Используйте reverse proxy (nginx, traefik, caddy):
   ```nginx
   server {
       listen 443 ssl http2;
       server_name your-domain.com;
       
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       
       location / {
           proxy_pass http://localhost:80;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
       
       location /api {
           proxy_pass http://localhost:3001;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

4. **Настройте firewall**
   ```bash
   # Разрешите только необходимые порты
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw enable
   ```

5. **Ограничьте доступ к Docker socket**
   
   В production рассмотрите использование Docker API через TCP с TLS.

6. **Регулярные обновления**
   ```bash
   # Обновляйте образы
   docker-compose pull
   docker-compose up -d
   ```

7. **Мониторинг логов**
   ```bash
   docker-compose logs -f
   ```

8. **Backup данных**
   ```bash
   # Регулярно делайте backup
   tar -czf backup-$(date +%Y%m%d).tar.gz backend/data/
   ```
