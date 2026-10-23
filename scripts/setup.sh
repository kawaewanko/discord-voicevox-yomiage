#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

usage() {
  cat <<'EOF'
使い方: ./scripts/setup.sh [--no-start] [--guild-id ID]

  --no-start  .envの作成と検証だけ行い、コンテナは起動しない
  --guild-id  コマンド登録先を指定（省略時はBot参加サーバーから選択）
EOF
}

start_after_setup=true
guild_id_argument=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-start) start_after_setup=false ;;
    --guild-id)
      shift
      [[ $# -gt 0 ]] || { echo "--guild-id には値が必要です。" >&2; exit 2; }
      guild_id_argument="$1"
      ;;
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

prompt_guild_id() {
  local current choice
  if [[ -n "$guild_id_argument" ]]; then
    if [[ ! "$guild_id_argument" =~ ^[0-9]{17,20}$ ]]; then
      echo "--guild-id は Discord の数値 ID（17〜20桁）で指定してください。" >&2
      exit 2
    fi
    set_env_value GUILD_ID "$guild_id_argument"
    echo "Guild IDを引数から設定しました。"
    return
  fi

  current=$(get_env_value GUILD_ID)
  if [[ -n "$current" ]]; then
    if [[ "$current" =~ ^[0-9]{17,20}$ ]]; then return; fi
    echo ".env の GUILD_ID が不正なため、再設定します。" >&2
    set_env_value GUILD_ID ""
  fi

  echo "Botが参加しているサーバーをDiscord APIから取得しています..."
  local response
  response=$(curl -fsS --connect-timeout 5 --max-time 15 \
    -H "Authorization: Bot $(get_env_value DISCORD_TOKEN)" \
    -H "User-Agent: discord-voicevox-yomiage-setup" \
    https://discord.com/api/v10/users/@me/guilds 2>/dev/null || true)

  local -a guilds=()
  if [[ -n "$response" ]] && command -v python3 >/dev/null 2>&1; then
    mapfile -t guilds < <(GUILD_JSON="$response" python3 - <<'PY'
import json
import os

try:
    guilds = json.loads(os.environ["GUILD_JSON"])
except (KeyError, json.JSONDecodeError):
    guilds = []

if isinstance(guilds, list):
    for guild in guilds:
        if isinstance(guild, dict) and guild.get("id") and guild.get("name"):
            name = " ".join(str(guild["name"]).split())
            print(f'{name}\t{guild["id"]}')
PY
    )
  fi

  if ((${#guilds[@]} > 0)); then
    echo "検出したサーバー（番号を入力、または Guild ID を直接入力）:"
    local index=1 entry name id
    for entry in "${guilds[@]}"; do
      name=${entry%%$'\t'*}
      id=${entry##*$'\t'}
      printf '  %d) %s (%s)\n' "$index" "$name" "$id"
      ((index += 1))
    done
    read -r -p "登録先 [1-${#guilds[@]}/Guild ID/空欄でスキップ]: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && ((choice >= 1 && choice <= ${#guilds[@]})); then
      entry=${guilds[choice-1]}
      set_env_value GUILD_ID "${entry##*$'\t'}"
      echo "Guild IDを検出結果から設定しました。"
      return
    fi
    if [[ "$choice" =~ ^[0-9]{17,20}$ ]]; then
      set_env_value GUILD_ID "$choice"
      echo "Guild IDを直接指定しました。"
      return
    fi
  else
    echo "サーバーを自動検出できませんでした。"
    read -r -p "登録先 Guild ID（省略可）: " choice
    if [[ "$choice" =~ ^[0-9]{17,20}$ ]]; then set_env_value GUILD_ID "$choice"; fi
  fi
}

prompt_value DISCORD_TOKEN "Discord Botトークン" true
prompt_value CLIENT_ID "Discord Application ID"
prompt_guild_id

docker compose config --quiet
echo "設定を検証しました: .env"

if [[ "$start_after_setup" == true ]]; then
  exec "$PWD/scripts/start.sh"
fi

echo "セットアップを完了しました。起動するには ./scripts/start.sh を実行してください。"
