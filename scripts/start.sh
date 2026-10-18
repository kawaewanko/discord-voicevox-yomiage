#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Dockerが見つかりません。Docker EngineとCompose v2をインストールしてください。" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2が必要です。" >&2
  exit 1
fi
if [[ ! -f .env ]]; then
  echo ".env がありません。先に cp .env.example .env を実行して値を設定してください。" >&2
  exit 1
fi

for required in DISCORD_TOKEN CLIENT_ID GUILD_ID; do
  value=$(grep -E "^${required}=" .env | tail -n1 | cut -d= -f2- || true)
  if [[ -z "$value" ]]; then
    echo ".env の ${required} が未設定です。" >&2
    exit 1
  fi
done

docker compose config --quiet

mkdir -p data
chmod 700 data

echo "[1/3] イメージをビルドします..."
docker compose build --pull bot voicevox
echo "[2/3] VOICEVOXとBotを起動します..."
docker compose up -d voicevox bot
echo "[3/3] サービス状態を確認します..."
docker compose ps

for attempt in {1..60}; do
  if "$PWD/scripts/healthcheck.sh"; then
    exit 0
  fi
  if (( attempt < 60 )); then
    echo "ヘルスチェック待機中 (${attempt}/60)..."
    sleep 2
  fi
done

echo "ヘルスチェックがタイムアウトしました。ログを確認してください。" >&2
docker compose logs --tail=100 bot voicevox >&2
exit 1
