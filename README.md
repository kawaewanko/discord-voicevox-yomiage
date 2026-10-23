# 🔊 Discord VOICEVOX 読み上げBot

Discordの投稿をVOICEVOXで読み上げるBotです。**Docker ComposeでBotとVOICEVOX Engineをまとめて起動**でき、ギルドごとの設定永続化、読み上げキュー、話者切り替え、Embed表示、ヘルスチェック、複数Bot運用に対応しています。

## 🚀 まず動かす（Docker Compose推奨）

### 🧰 前提

- Docker Engine
- Docker Compose v2（`docker compose version`で確認）
- Discordアプリケーション / Bot
- Dockerが動作するx86_64またはARM64環境

### 🛠️ 初回セットアップ

```bash
git clone https://github.com/kawaewanko/discord-voicevox-yomiage.git
cd discord-voicevox-yomiage
./scripts/setup.sh
```

`setup.sh`が`.env`を対話式に作成します。Botトークン入力後、Discord APIからBotが参加しているサーバーを半自動検出し、番号選択でGuild IDを設定できます。Botトークンは画面に表示されません。検出できない場合はGuild IDの直接入力または省略も可能です。その後、DockerイメージをビルドしてBotとVOICEVOXを起動します。

```bash
# 対話設定（サーバー選択後に起動）
./scripts/setup.sh

# 起動せず設定だけ行う
./scripts/setup.sh --no-start

# Guild IDを直接指定
./scripts/setup.sh --guild-id 123456789012345678 --no-start
```

設定ファイルだけ作成して起動しない場合は、次を実行します。

```bash
./scripts/setup.sh --no-start
./scripts/start.sh
```

Discord側の設定は[Discord設定手順](docs/DISCORD_SETUP.md)を参照してください。

手動で設定したい場合は、次の方法も使えます。

```bash
cp .env.example .env
chmod 600 .env
# .envへDISCORD_TOKEN、CLIENT_IDを設定（GUILD_IDは任意）
```

`start.sh`は、`.env`の必須項目検証、Compose設定検証、BotとVOICEVOXのイメージビルド、VOICEVOXの起動待ち、Bot起動、最大120秒のヘルスチェックまで自動で行います。

VOICEVOXは公式のCPUイメージをベースに、ヘルスチェック用の`curl`を追加したローカルイメージとしてビルドします。ARM64環境では`.env`の`VOICEVOX_BASE_IMAGE`を`voicevox/voicevox_engine:cpu-arm64-latest`へ変更してください。

### 🤖 複数Botを起動（1〜10体）

複数Bot用の対話設定と起動には、次を使用します。Botごとにトークン、Application ID、Guild ID、ヘルスポートを設定し、設定ファイルとデータボリュームを分離します。

```bash
# 3体分を対話設定して起動
./scripts/setup-multi.sh 3

# 設定だけ作成
./scripts/setup-multi.sh 3 --no-start

# 既存設定で5体を起動
./scripts/start-multi.sh 5

# 各BotのGuildへコマンドを一括登録
./scripts/deploy-multi.sh 5
```

Composeのプロファイル`bot-1`〜`bot-10`と、ホストポート`3001`〜`3010`を使用します。各Botのデータは個別ボリュームへ保存され、メンテナンス状態だけは共通ボリュームで共有されます。

### 📋 コマンドを登録

Compose環境では次のコマンドでギルドコマンドを登録します。

```bash
docker compose run --rm --no-deps bot node src/deploy-commands.js
```

登録先は引数または`.env`の`GUILD_ID`で指定できます。

```bash
docker compose run --rm --no-deps bot node src/deploy-commands.js 123456789012345678
```

引数を省略した場合は`.env`の`GUILD_ID`を使用します。ギルドコマンドは反映が速く、動作確認に向いています。

### ✅ Discordで動作確認

1. `/join`を実行し、Botを自分のボイスチャンネルへ接続する。
2. `/voices`でVOICEVOXの話者スタイルIDを確認する。
3. `/voice speaker_id:3`などで話者を設定する。
4. サーバー管理者が`/setchannel channel:#読み上げ対象`を実行する。
5. 対象チャンネルへ投稿するか、`/say text:こんにちは`を実行する。

コマンドの応答は見やすいDiscord Embedで表示されます。Embed表示にはBotの`Embed Links`権限が必要です。

## 📖 コマンド一覧

| コマンド                       | 説明                                   | 権限・公開範囲                |
| ------------------------------ | -------------------------------------- | ----------------------------- |
| `/help`                        | コマンド一覧と稼働状態を表示           | 通常、本人のみのEmbed         |
| `/maintenance enabled:...`     | 全Botのメンテナンス状態を切り替え      | サーバー管理、本人のみのEmbed |
| `/join`                        | 実行者が参加中のボイスチャンネルへ接続 | 通常、公開Embed               |
| `/leave`                       | 切断し、待機中の読み上げを消去         | 通常、公開Embed               |
| `/say text:...`                | 文章をキューへ追加                     | 通常、本人のみのEmbed         |
| `/skip`                        | 現在の読み上げだけをスキップ           | 通常、公開Embed               |
| `/stop`                        | 再生と待機中の読み上げを停止・消去     | 通常、公開Embed               |
| `/queue`                       | 再生状態と待機キューを表示             | 通常、本人のみのEmbed         |
| `/voices`                      | VOICEVOXの話者・スタイル一覧           | 通常、本人のみのEmbed         |
| `/voice speaker_id:...`        | 使用話者を変更                         | 通常、本人のみのEmbed         |
| `/setchannel channel:#...`     | 自動読み上げ対象を設定                 | サーバー管理、公開Embed       |
| `/nickname enabled:true/false` | 投稿者名の読み上げを設定               | サーバー管理、公開Embed       |

`/voice`と`/voices`はVOICEVOX APIの応答待ちを先に保留するため、Discordの3秒応答期限を超えにくくなっています。

BotがDiscordへ接続すると、プレゼンスは**「視聴中 /help | {遅延} ms | v{バージョン}」**に設定されます。遅延は30秒ごとに更新され、バージョンは`package.json`の`version`を使用します。

### 🛠️ メンテナンスモード

`.env`の`MAINTENANCE_MODE=true`にしてBotを再起動すると、プレゼンスが**「視聴中 メンテナンス中 | /help | v{バージョン}」**に変わります。メンテナンス中は自動読み上げ、`/join`、`/say`、`/leave`、`/skip`、`/stop`、設定変更系コマンドを停止し、実行者にはメンテナンス専用メッセージを返します。`/help`は状態確認用に利用できます。

案内文を変更する場合は`.env`の`MAINTENANCE_MESSAGE`を設定してください。作業完了後は`MAINTENANCE_MODE=false`に戻してBotを再起動します。

複数Botを同一ホストで運用する場合は、全Botの`.env`で`MAINTENANCE_STATE_VOLUME`を同じ名前にします。いずれかのBotで次を実行すると、共有状態ファイルを通じて全Botが約5秒以内に切り替わります。

```text
/maintenance enabled:true message:メンテナンスを開始します
/maintenance enabled:false
```

このコマンドにはサーバー管理権限が必要です。

## ⚙️ Composeの運用

```bash
# 状態とヘルスチェック
docker compose ps
./scripts/healthcheck.sh

# ログ
docker compose logs -f bot
docker compose logs -f voicevox

# 停止（設定ボリュームは保持）
./scripts/stop.sh

# 完全削除（ギルド設定も削除されるため注意）
docker compose down -v
```

ギルド設定は`bot-data`ボリュームへ保存されます。バックアップ、更新、障害対応は[運用手順](docs/OPERATIONS.md)にまとめています。

## 🔁 CI/CD

GitHub Actionsを設定済みです。

- `CI`：Node.js 20/22の自動テスト、JavaScript構文、Shell構文、Compose設定、Botイメージビルド
- `CD`：`main`向けCI成功後にBotイメージをGHCRへ`latest`とコミットSHAタグで公開

GHCRイメージの利用方法や、本番ホストへの接続を追加する場合のSecrets設計は[CI/CD手順](docs/CI_CD.md)を参照してください。

## ❤️ ヘルスチェック

Botは内部HTTPサーバーで`/health`を公開しています。Composeではホストの`HEALTH_PORT`（初期値3000）へ公開します。複数Botでは既定で`3001`〜`3010`を使用します。

```bash
curl -i http://127.0.0.1:3000/health
```

Discord Gatewayに接続済みならHTTP 200、起動中または未接続ならHTTP 503です。コンテナが`running`でもGateway接続済みとは限らないため、`/health`とBotログの両方を確認してください。

## 💻 ローカルNode.js実行（Composeを使わない場合）

VOICEVOX EngineとFFmpegをホストへ別途インストールする場合は、次の手順でも起動できます。

```bash
npm ci
cp .env.example .env
# .envのVOICEVOX_URLを実行中のVOICEVOXへ設定
npm test
npm run deploy -- 123456789012345678
npm start
```

ローカル実行時の設定保存先は`DATA_DIR`（初期値`./data`）です。

## 🔐 Discord設定の要点

- Bot招待スコープ：`bot`、`applications.commands`
- 必須Bot権限：`View Channels`、`Send Messages`、`Embed Links`、`Connect`、`Speak`
- Developer Portalで**Message Content Intent**を有効化
- Botトークンは`.env`だけに保存し、Git・ログ・Issueへ書かない

詳細は[Discord設定手順](docs/DISCORD_SETUP.md)を参照してください。

## 🆘 トラブルシューティング

### Botコンテナが起動しない

```bash
docker compose ps
docker compose logs --tail=100 bot
```

`.env`の`DISCORD_TOKEN`、`CLIENT_ID`が空でないか確認してください。コマンドが表示されない場合は対象Guild IDを指定してコマンド登録を再実行してください。トークンを再発行した場合は`.env`を更新して`./scripts/start.sh`を再実行します。

### VOICEVOXが起動しない

```bash
docker compose logs --tail=100 voicevox
docker compose restart voicevox
```

VOICEVOX初回起動には時間がかかるため、Composeはヘルスチェックが通るまでBotを起動しません。

### コマンドが表示されない

```bash
docker compose run --rm --no-deps bot node src/deploy-commands.js <Guild ID>
```

複数Botの場合は次を使います。

```bash
./scripts/deploy-multi.sh 3
```

`CLIENT_ID`、指定したGuild ID、Botの`applications.commands`招待スコープを確認してください。

### 音声が再生されない

Botがボイスチャンネルへ接続できているか、`Connect`と`Speak`権限があるか、VOICEVOXログにエラーがないかを確認してください。

## 👨‍💻 開発者向け

```bash
npm ci
npm test
node --check src/index.js
node --check src/deploy-commands.js
node --check src/utils.js
bash -n scripts/*.sh
git diff --check
```

音声依存パッケージには上流由来の`npm audit`警告が出る場合があります。ネイティブ音声スタックの互換性を検証せずに強制更新しないでください。

## ⚠️ 注意事項

- 同じDiscord Botトークンで複数のBotコンテナを起動しないでください。
- 読み上げキューは最大50件、入力は最大1000文字です。
- メンションやURLは読み上げ時に安全な文字列へ置換します。
- VOICEVOXの音声ライブラリ・キャラクターごとの利用規約とクレジット要件を確認してください。
