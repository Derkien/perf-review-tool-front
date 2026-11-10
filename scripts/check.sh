#!/bin/sh
# Гейт перед коммитом (openspec: backend-ci-baseline + openapi-contract-codegen):
# codegen-дрейф типов → тайпчек → компонентные тесты.
set -e
cd "$(dirname "$0")/.."

echo "== api:types (дрейф контракта) =="
./scripts/gen-api-types.sh
git diff --exit-code src/api/types.ts \
  || { echo "ДРЕЙФ types.ts — схема новее типов: закоммить обновлённый src/api/types.ts"; exit 1; }

echo "== vue-tsc =="
node_modules/.bin/vue-tsc --noEmit

echo "== vitest =="
node_modules/.bin/vitest run

echo "GATE OK"
