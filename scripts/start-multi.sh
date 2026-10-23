#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

usage() {
  cat <<'EOF'
使い方: ./scripts/start-multi.sh [BOT_COUNT]

  BOT_COUNT  起動するBot数（1〜10、既定値: 2）
EOF
}

count="${1:-2}"
if [[ "$count" == "-h" || "$count" == "--help" ]]; then
  usage
  exit 0
fi
if [[ ! "$count" =~ ^[0-9]+$ ]] || ((count < 1 || count > 10)); then
  echo "BOT_COUNT は1〜10の整数で指定してください。" >&2
  usage >&2
  exit 2
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2が必要です。" >&2
  exit 1
fi
if [[ ! -f .env ]]; then
  echo ".env がありません。先に ./scripts/setup-multi.sh を実行してください。" >&2
  exit 1
fi

profiles=()
services=(voicevox)
for index in $(seq 1 "$count"); do
  for required in DISCORD_TOKEN CLIENT_ID; do
    key="BOT_${index}_${required}"
    value=$(grep -E "^${key}=" .env | tail -n1 | cut -d= -f2- || true)
    if [[ -z "$value" ]]; then
      echo ".env の ${key} が未設定です。" >&2
      exit 1
    fi
  done
  profiles+=(--profile "bot-${index}")
  services+=("bot-${index}")
done

docker compose "${profiles[@]}" config --quiet
docker compose "${profiles[@]}" up -d --build "${services[@]}"

echo "${count}体のBotを起動しました。"
for index in $(seq 1 "$count"); do
  port=$(grep -E "^BOT_${index}_HEALTH_PORT=" .env | tail -n1 | cut -d= -f2- || true)
  echo "  bot-${index}: health http://127.0.0.1:${port:-$((3000 + index))}/health"
done
