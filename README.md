# Discord VOICEVOX 読み上げBot

Discordの投稿をVOICEVOXで読み上げるBotです。**Docker ComposeでBotとVOICEVOX Engineをまとめて起動**でき、ギルドごとの設定永続化、読み上げキュー、話者切り替え、Embed表示、ヘルスチェックに対応しています。

## まず動かす（Docker Compose推奨）

### 前提

- Docker Engine
- Docker Compose v2（`docker compose version`で確認）
- Discordアプリケーション / Bot
- Dockerが動作するx86_64またはARM64環境

### 初回セットアップ

```bash
git clone https://github.com/kawaewanko/discord-voicevox-yomiage.git
cd discord-voicevox-yomiage
./scripts/setup.sh
```

`setup.sh`が`.env`を作成し、Discord Botトークン、Application ID、テスト用サーバーIDを対話式に尋ねます。Botトークンは画面に表示されません。その後、DockerイメージをビルドしてBotとVOICEVOXを起動します。

対話なしで設定ファイルだけ作成する場合は、次を実行します。

```bash
./scripts/setup.sh --no-start
./scripts/start.sh
```

Discord側の設定は[Discord設定手順](docs/DISCORD_SETUP.md)を参照してください。

手動で設定したい場合は、次の方法も使えます。

```bash
cp .env.example .env
chmod 600 .env
# .envへDISCORD_TOKEN、CLIENT_ID、GUILD_IDを設定
```

`start.sh`は、`.env`の必須項目検証、Compose設定検証、BotとVOICEVOXのイメージビルド、VOICEVOXの起動待ち、Bot起動、最大120秒のヘルスチェックまで自動で行います。

VOICEVOXは公式のCPUイメージをベースに、ヘルスチェック用の`curl`を追加したローカルイメージとしてビルドします。ARM64環境では`.env`の`VOICEVOX_BASE_IMAGE`を`voicevox/voicevox_engine:cpu-arm64-latest`へ変更してください。

### コマンドを登録

Compose環境では次のコマンドでギルドコマンドを登録します。

```bash
docker compose run --rm --no-deps bot node src/deploy-commands.js
```

登録先は`.env`の`CLIENT_ID`と`GUILD_ID`です。ギルドコマンドは反映が速く、動作確認に向いています。

### Discordで動作確認

1. `/join`を実行し、Botを自分のボイスチャンネルへ接続する。
2. `/voices`でVOICEVOXの話者スタイルIDを確認する。
3. `/voice speaker_id:3`などで話者を設定する。
4. サーバー管理者が`/setchannel channel:#読み上げ対象`を実行する。
5. 対象チャンネルへ投稿するか、`/say text:こんにちは`を実行する。

コマンドの応答は見やすいDiscord Embedで表示されます。Embed表示にはBotの`Embed Links`権限が必要です。

## コマンド一覧

| コマンド                       | 説明                                   | 権限・公開範囲          |
| ------------------------------ | -------------------------------------- | ----------------------- |
| `/join`                        | 実行者が参加中のボイスチャンネルへ接続 | 通常、公開Embed         |
| `/leave`                       | 切断し、待機キューを消去               | 通常、公開Embed         |
| `/say text:...`                | 文章をキューへ追加                     | 通常、本人のみのEmbed   |
| `/skip`                        | 現在の音声をスキップ                   | 通常、公開Embed         |
| `/stop`                        | 音声とキューを停止・消去               | 通常、公開Embed         |
| `/queue`                       | 再生状態と待機キューを表示             | 通常、本人のみのEmbed   |
| `/voices`                      | VOICEVOXの話者・スタイル一覧           | 通常、本人のみのEmbed   |
| `/voice speaker_id:...`        | 使用話者を変更                         | 通常、本人のみのEmbed   |
| `/setchannel channel:#...`     | 自動読み上げ対象を設定                 | サーバー管理、公開Embed |
| `/nickname enabled:true/false` | 投稿者名の読み上げを設定               | サーバー管理、公開Embed |

`/voice`と`/voices`はVOICEVOX APIの応答待ちを先に保留するため、Discordの3秒応答期限を超えにくくなっています。

## Composeの運用

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

## CI/CD

GitHub Actionsを設定済みです。

- `CI`：Node.js 20/22の自動テスト、JavaScript構文、Shell構文、Compose設定、Botイメージビルド
- `CD`：`main`向けCI成功後にBotイメージをGHCRへ`latest`とコミットSHAタグで公開

GHCRイメージの利用方法や、本番ホストへの接続を追加する場合のSecrets設計は[CI/CD手順](docs/CI_CD.md)を参照してください。

## ヘルスチェック

Botは内部HTTPサーバーで`/health`を公開しています。Composeではホストの`HEALTH_PORT`（初期値3000）へ公開します。

```bash
curl -i http://127.0.0.1:3000/health
```

Discord Gatewayに接続済みならHTTP 200、起動中または未接続ならHTTP 503です。コンテナが`running`でもGateway接続済みとは限らないため、`/health`とBotログの両方を確認してください。

## ローカルNode.js実行（Composeを使わない場合）

VOICEVOX EngineとFFmpegをホストへ別途インストールする場合は、次の手順でも起動できます。

```bash
npm ci
cp .env.example .env
# .envのVOICEVOX_URLを実行中のVOICEVOXへ設定
npm test
npm run deploy
npm start
```

ローカル実行時の設定保存先は`DATA_DIR`（初期値`./data`）です。

## Discord設定の要点

- Bot招待スコープ：`bot`、`applications.commands`
- 必須Bot権限：`View Channels`、`Send Messages`、`Embed Links`、`Connect`、`Speak`
- Developer Portalで **Message Content Intent** を有効化
- Botトークンは`.env`だけに保存し、Git・ログ・Issueへ書かない

詳細は[Discord設定手順](docs/DISCORD_SETUP.md)を参照してください。

## トラブルシューティング

### Botコンテナが起動しない

```bash
docker compose ps
docker compose logs --tail=100 bot
```

`.env`の`DISCORD_TOKEN`、`CLIENT_ID`、`GUILD_ID`が空でないか確認してください。トークンを再発行した場合は`.env`を更新して`./scripts/start.sh`を再実行します。

### VOICEVOXが起動しない

```bash
docker compose logs --tail=100 voicevox
docker compose restart voicevox
```

VOICEVOX初回起動には時間がかかるため、Composeはヘルスチェックが通るまでBotを起動しません。

### コマンドが表示されない

```bash
docker compose run --rm --no-deps bot node src/deploy-commands.js
```

`CLIENT_ID`、`GUILD_ID`、Botの`applications.commands`招待スコープを確認してください。

### 音声が再生されない

Botがボイスチャンネルへ接続できているか、`Connect`と`Speak`権限があるか、VOICEVOXログにエラーがないかを確認してください。

## 開発者向け

```bash
npm ci
npm test
node --check src/index.js
node --check src/deploy-commands.js
git diff --check
```

音声依存パッケージには上流由来の`npm audit`警告が出る場合があります。ネイティブ音声スタックの互換性を検証せずに強制更新しないでください。

## 注意事項

- 同じDiscord Botトークンで複数のBotコンテナを起動しないでください。
- 読み上げキューは最大50件、入力は最大1000文字です。
- メンションやURLは読み上げ時に安全な文字列へ置換します。
- VOICEVOXの音声ライブラリ・キャラクターごとの利用規約とクレジット要件を確認してください。
