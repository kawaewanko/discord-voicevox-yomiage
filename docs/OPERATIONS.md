# 運用手順

## 初回セットアップ（Docker Compose）

Docker EngineとDocker Compose v2がインストールされたLinuxホストで実行する。

```bash
git clone https://github.com/kawaewanko/discord-voicevox-yomiage.git
cd discord-voicevox-yomiage
./scripts/setup.sh
```

`setup.sh`は`.env`を作成し、Botトークン、Application ID、テスト用サーバーIDを対話式に設定する。Botトークンは画面に表示されない。設定だけ行う場合は`./scripts/setup.sh --no-start`を使う。

`start.sh`は、必須環境変数とCompose設定の検証、Botイメージのビルド、VOICEVOXのヘルスチェック完了待ち、Bot起動、最大120秒のBot `/health` 確認を順番に実行する。Botは`restart: unless-stopped`で自動再起動される。

VOICEVOXは公式のCPUイメージをベースに、ヘルスチェック用の`curl`を追加したイメージとしてビルドする。ARM64ホストでは`.env`の`VOICEVOX_BASE_IMAGE`を`voicevox/voicevox_engine:cpu-arm64-latest`へ変更する。

## 通常運用

```bash
# 状態確認
docker compose ps
./scripts/healthcheck.sh

# ログ確認（秘密情報を含む可能性があるため共有前に確認）
docker compose logs -f bot
docker compose logs -f voicevox

# 停止
./scripts/stop.sh
```

データボリュームを削除しない限り、ギルド設定は保持される。完全に削除する場合のみ、明示的に次を実行する。

```bash
docker compose down -v
```

## データのバックアップ

設定はComposeボリュームへ保存される。定期バックアップでは一時コンテナ経由でアーカイブする。

```bash
mkdir -p backups
docker run --rm \
  -v discord-voicevox-yomiage-data:/data:ro \
  -v "$PWD/backups":/backup \
  alpine:3.20 tar czf /backup/guild-settings-$(date +%Y%m%d-%H%M%S).tgz -C /data .
```

実際のボリューム名を変更した場合は、`docker volume ls`で確認して置き換える。バックアップにはギルドIDやチャンネルIDが含まれるため、アクセス権を制限する。

## 更新手順

```bash
git pull --ff-only
./scripts/start.sh
```

`start.sh`が新しいBotイメージをビルドして入れ替える。更新前に設定バックアップを取得する。ロールバックする場合は、既知のコミットへ戻してから再度`./scripts/start.sh`を実行する。

## 障害対応

### Botが起動しない

```bash
docker compose ps
docker compose logs --tail=100 bot
```

`.env`の`DISCORD_TOKEN`、`CLIENT_ID`、`GUILD_ID`が空でないこと、Botトークンを再発行した場合は新しい値を設定したことを確認する。

### VOICEVOXが起動しない

```bash
docker compose logs --tail=100 voicevox
docker compose restart voicevox
```

VOICEVOXの初回起動には時間がかかる。`compose.yaml`の`start_period`と`retries`はその待ち時間を考慮している。

### `/health`が503

Discord Gatewayへ接続できていない状態。BotログでIntent、トークン、ネットワークエラーを確認する。コンテナがrunningでもGateway接続が正常とは限らないため、必ず`/health`とログの両方を見る。

### コマンドが表示されない

```bash
npm run deploy
```

Compose運用では、一時的なBotコンテナで実行できる。

```bash
docker compose run --rm --no-deps bot node src/deploy-commands.js
```

登録後、Discordクライアントを再起動して確認する。

## セキュリティ

- `.env`は`chmod 600`にする。
- Botトークンをログ、Issue、チャット、イメージレイヤーへ出さない。
- 同じトークンで複数のBotコンテナを起動しない。
- `HEALTH_PORT`は外部公開せず、必要ならファイアウォールで監視元だけに制限する。
- VOICEVOXのライセンス、音声ライブラリ、キャラクターごとの利用規約とクレジット要件を確認する。
