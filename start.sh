#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Starting portfolio dashboard..."
docker compose down --remove-orphans >/dev/null 2>&1 || true
docker compose up --build -d

echo
docker compose ps
echo
echo "Dashboard: http://localhost:8080"
