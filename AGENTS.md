# perf-review-tool-front — agent instructions

Vue 3 + Vite + TypeScript + PrimeVue (Aura) + ECharts. Типы API генерируются из OpenAPI бэкенда (`types.ts`) — руками их не писать.

## Команды

- Docker: `cd ../perf-review-tool-api && docker compose up -d` → http://localhost:8080
- Локально: `npm run dev` (:5173, `/api` проксируется на :8000), `npm run build` (типы + прод-сборка), `npm run test`

## Обязательно

Стиль работы и все гайды проекта живут уровнем выше — читай перед задачей:
- `../AGENTS.md` — ponytail-режим и карта документов
- `../docs/SESSION-HANDOFF.md` — статус, долги, решения
- `../docs/standards/*.md` — обязательные стандарты кода
