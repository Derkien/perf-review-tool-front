#!/usr/bin/env bash
# Регенерация src/api/types.ts из OpenAPI-схемы (openspec: openapi-contract-codegen).
# Источник по умолчанию — sibling api-репо (схема уже без префикса /api/v1 — он срезан
# на стороне api скриптом export_openapi.py); OPENAPI_SRC переопределяет: путь или URL стенда.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="${OPENAPI_SRC:-../perf-review-tool-api/openapi.front.json}"
if [[ "$SRC" == http* ]]; then
  curl -fsS "$SRC" -o openapi.json
  SRC=openapi.json
fi
if [[ ! -f "$SRC" ]]; then
  echo "Схема не найдена: $SRC" >&2
  echo "Укажи OPENAPI_SRC (путь к openapi.front.json или URL стенда) или проверь соседство репо." >&2
  exit 1
fi
node_modules/.bin/openapi-typescript "$SRC" -o src/api/types.ts
echo "types updated from $SRC"
