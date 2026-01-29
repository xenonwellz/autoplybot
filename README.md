# Autoply Bot

A Telegram bot that automates job applications using AI-generated emails and Gmail OAuth.

## Setup

1. Copy environment template:
   ```bash
   cp .env.example .env
   ```

2. Fill in all values in `.env`

3. Generate Prisma client:
   ```bash
   bun run db:generate
   ```

4. Push database schema:
   ```bash
   bun run db:push
   ```

5. Start the server:
   ```bash
   bun run dev
   ```

6. Set your Telegram webhook:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://autoplybot.xyz/webhook"
   ```

## Commands

- `/start` - Welcome message
- `/cv` - Check CV status
- `/connect` - Connect Gmail
- `/history` - View sent applications

## Docker Deployment

1. Copy environment template and fill in values:
   ```bash
   cp .env.example .env
   ```

2. Start the application:
   ```bash
   docker compose up -d
   ```

3. Run database migration (first time only):
   ```bash
   docker compose --profile migrate up migrate
   ```

4. Set your Telegram webhook:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://autoplybot.xyz/webhook"
   ```

### Docker Commands

```bash
# View logs
docker compose logs -f app

# Rebuild after changes
docker compose up -d --build

# Stop all services
docker compose down

# Stop and remove volumes
docker compose down -v
```
