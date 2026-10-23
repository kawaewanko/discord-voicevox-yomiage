#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

usage() {
  cat <<'EOF'
使い方: ./scripts/deploy-multi.sh [BOT_COUNT]

  BOT_COUNT  登録するBot数（1〜10、既定値: 2）
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
if [[ ! -f .env ]]; then
  echo ".env がありません。先に ./scripts/setup-multi.sh を実行してください。" >&2
  exit 1
fi

for index in $(seq 1 "$count"); do
  guild=$(grep -E "^BOT_${index}_GUILD_ID=" .env | tail -n1 | cut -d= -f2- || true)
  if [[ -z "$guild" ]]; then
    echo "BOT_${index}_GUILD_ID が未設定のため bot-${index} をスキップします。" >&2
    continue
  fi
  echo "bot-${index} のコマンドを Guild ${guild} へ登録します。"
  docker compose --profile "bot-${index}" run --rm --no-deps "bot-${index}" \
    node src/deploy-commands.js "$guild"
done
