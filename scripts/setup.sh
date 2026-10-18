#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

usage() {
  cat <<'EOF'
使い方: ./scripts/setup.sh [--no-start]

  --no-start  .envの作成と検証だけ行い、コンテナは起動しない
EOF
}

start_after_setup=true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-start) start_after_setup=false ;;
    -h|--help) usage; exit 0 ;;
    *) echo "不明なオプションです: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Dockerが見つかりません。Docker DesktopまたはDocker Engineを先にインストールしてください。" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
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

prompt_value() {
  local key="$1"
  local label="$2"
  local secret="${3:-false}"
  local current
  local value

  current=$(get_env_value "$key")
  if [[ -n "$current" ]]; then return; fi

  if [[ "$secret" == true ]]; then
    read -r -s -p "$label: " value
    printf '\n'
  else
    read -r -p "$label: " value
  fi
  if [[ -z "$value" ]]; then
    echo "${key}は必須です。" >&2
    exit 1
  fi
  set_env_value "$key" "$value"
}

prompt_value DISCORD_TOKEN "Discord Botトークン" true
prompt_value CLIENT_ID "Discord Application ID"
prompt_value GUILD_ID "テスト用DiscordサーバーID"

docker compose config --quiet
echo "設定を検証しました: .env"

if [[ "$start_after_setup" == true ]]; then
  exec "$PWD/scripts/start.sh"
fi

echo "セットアップを完了しました。起動するには ./scripts/start.sh を実行してください。"
