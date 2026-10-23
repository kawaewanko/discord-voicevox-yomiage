#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

usage() {
  cat <<'EOF'
使い方: ./scripts/setup-multi.sh [BOT_COUNT] [--no-start]

  BOT_COUNT  設定するBot数（1〜10、既定値: 2）
  --no-start 設定だけ行い、Botを起動しない
EOF
}

count=2
start_after_setup=true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-start) start_after_setup=false ;;
    -h|--help) usage; exit 0 ;;
    [0-9]*) count="$1" ;;
    *) echo "不明なオプションです: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done
if [[ ! "$count" =~ ^[0-9]+$ ]] || ((count < 1 || count > 10)); then
  echo "BOT_COUNT は1〜10の整数で指定してください。" >&2
  exit 2
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2が必要です。" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  echo ".envを作成しました。"
fi

set_env_value() {
  local key="$1"
  local value="$2"
  local temporary
  temporary=$(mktemp)
  awk -v key="$key" -v value="$value" '
    $0 ~ "^" key "=" { print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' .env > "$temporary"
  mv "$temporary" .env
  chmod 600 .env
}

get_env_value() {
  local key="$1"
  grep -E "^${key}=" .env | tail -n1 | cut -d= -f2- || true
}

prompt_required() {
  local key="$1"
  local label="$2"
  local current value
  current=$(get_env_value "$key")
  if [[ -n "$current" ]]; then return; fi
  read -r -s -p "$label: " value
  printf '\n'
  [[ -n "$value" ]] || { echo "${key}は必須です。" >&2; exit 1; }
  set_env_value "$key" "$value"
}

prompt_optional() {
  local key="$1"
  local label="$2"
  local default_value="${3:-}"
  local current value
  current=$(get_env_value "$key")
  if [[ -n "$current" ]]; then return; fi
  if [[ -n "$default_value" ]]; then
    read -r -p "$label（空欄で${default_value}）: " value
    value="${value:-$default_value}"
  else
    read -r -p "$label（省略可）: " value
  fi
  set_env_value "$key" "$value"
}

for index in $(seq 1 "$count"); do
  echo "--- Bot ${index}/${count} ---"
  prompt_required "BOT_${index}_DISCORD_TOKEN" "Bot ${index} のDiscord Botトークン"
  prompt_required "BOT_${index}_CLIENT_ID" "Bot ${index} のApplication ID"
  prompt_optional "BOT_${index}_GUILD_ID" "Bot ${index} のGuild ID"
  prompt_optional "BOT_${index}_HEALTH_PORT" "Bot ${index} のヘルスポート" "$((3000 + index))"
  prompt_optional "BOT_${index}_MAINTENANCE_MODE" "Bot ${index} の起動時メンテナンスモード" "false"
done

profiles=()
for index in $(seq 1 "$count"); do profiles+=(--profile "bot-${index}"); done
docker compose "${profiles[@]}" config --quiet
echo "${count}体分の設定を検証しました。"

if [[ "$start_after_setup" == true ]]; then
  exec "$PWD/scripts/start-multi.sh" "$count"
fi

echo "起動するには ./scripts/start-multi.sh ${count} を実行してください。"
