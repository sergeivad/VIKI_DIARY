#!/bin/sh

set -eu

echo "Applying Prisma migrations..."
npx prisma migrate deploy

echo "Starting application..."
exec node dist/index.js
