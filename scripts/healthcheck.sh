#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

service_health() {
  local service="$1"
  local container_id
  local status

  container_id=$(docker compose ps -q "$service")
  if [[ -z "$container_id" ]]; then
    echo "${service}コンテナが見つかりません。" >&2
    return 1
  fi

  status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$container_id")
  if [[ "$status" != "healthy" ]]; then
    echo "${service}コンテナがhealthyではありません: ${status}" >&2
    return 1
  fi
}

service_health voicevox
service_health bot

health_port="${HEALTH_PORT:-3000}"
if [[ -f .env ]]; then
  # .envからHEALTH_PORTだけを読み取る。秘密情報は出力しない。
  value=$(grep -E '^HEALTH_PORT=' .env | tail -n1 | cut -d= -f2- || true)
  [[ -n "$value" ]] && health_port="$value"
fi

if ! curl --fail --silent --show-error "http://127.0.0.1:${health_port}/health" >/dev/null; then
  echo "Botの/healthが正常ではありません。" >&2
  docker compose logs --tail=80 bot >&2
  exit 1
fi

echo "OK: VOICEVOXとBotはhealthyです（health port: ${health_port}）。"
