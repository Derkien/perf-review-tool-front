#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
curl -fsS "${API_URL:-http://localhost:8000}/api/openapi.json" -o openapi.json
node_modules/.bin/openapi-typescript openapi.json -o src/api/types.ts
sed -i '' 's|"/api/v1/|"/|g' src/api/types.ts
echo "types updated"
