#!/bin/sh
# Изолированный e2e-прогон: эфемерный стек (compose.e2e.yaml, порты 8001/8081),
# демо-сид в его пустую БД, playwright против :8081, снос стека с томами (down -v).
# Live-стенд :8080 не участвует — e2e не оставляет следов в его БД по построению.
# Образы переиспользуются из live-сборки; если их нет — прогони
# `cd ../perf-review-tool-api && docker compose build` (DOCKER_BUILDKIT=0, полный путь
# докера — см. docs/DEVELOPMENT.md).
set -e
cd "$(dirname "$0")/.."

DOCKER=/Applications/Docker.app/Contents/Resources/bin/docker
command -v docker >/dev/null 2>&1 && DOCKER=$(command -v docker)
API_DIR=../perf-review-tool-api
E2E_PROJECT=prtool-e2e
PY=$API_DIR/.venv/bin/python

if ! $DOCKER image inspect perf-review-tool-api-api:latest >/dev/null 2>&1 \
   || ! $DOCKER image inspect perf-review-tool-api-front:latest >/dev/null 2>&1; then
  echo "Образы api/front не найдены — собери live-стек: (cd $API_DIR && DOCKER_BUILDKIT=0 $DOCKER compose build)" >&2
  exit 1
fi

cleanup() {
  echo "== снос e2e-стека (down -v: БД умирает вместе с ним) =="
  $DOCKER compose -p $E2E_PROJECT -f $API_DIR/compose.e2e.yaml down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "== подъём e2e-стека (:8001/:8081) =="
$DOCKER compose -p $E2E_PROJECT -f $API_DIR/compose.e2e.yaml up -d --quiet-pull
for i in $(seq 1 60); do
  curl -fsS http://localhost:8001/healthz >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS http://localhost:8001/healthz >/dev/null || { echo "e2e api не поднялся" >&2; exit 1; }

echo "== демо-сид мира (scripts/seed_demo.py) =="
$PY $API_DIR/scripts/seed_demo.py --base-url http://localhost:8001

echo "== playwright против :8081 =="
E2E_BASE_URL=http://localhost:8081 npx playwright test "$@"
