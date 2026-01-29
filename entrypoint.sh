#!/bin/sh
set -e

echo "Running database migrations..."
bunx prisma migrate deploy

echo "Starting Autoply Bot..."
exec bun run src/index.ts
