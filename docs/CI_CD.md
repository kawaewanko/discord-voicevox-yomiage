# 🔁 CI/CD

## 🧪 CI（継続的インテグレーション）

`.github/workflows/ci.yml`は、`main`へのpushとPull Requestで実行される。

CIでは次を確認する。

- Node.js 20と22で`npm ci`、`npm test`
- Prettierによる全ファイルの整形チェック
- JavaScript 3ファイルの構文チェック
- `scripts/*.sh`のShell構文チェック
- `git diff --check`
- CI用の`.env`を使った`docker compose config --quiet`
- Bot Dockerイメージのビルド

DiscordトークンやVOICEVOXへの接続はCIで行わない。テスト環境ファイルの値はダミーであり、GitHub Secretsも不要。

## 📦 CD（コンテナ公開）

`.github/workflows/cd.yml`は、`main`向けCIが成功した後、またはActions画面からの手動実行で動く。CIが失敗した場合はCDを実行しない。Botイメージだけをビルドし、GitHub Container Registry（GHCR）へ次のタグで公開する。

- `ghcr.io/<owner>/<repository>:latest`
- `ghcr.io/<owner>/<repository>:sha-<commit>`

`GITHUB_TOKEN`に`packages: write`権限を付与しているため、追加のレジストリパスワードは不要。GitHubリポジトリがPrivateの場合、運用ホストからGHCRへログインできるよう、読み取り権限を持つPersonal Access TokenまたはGitHub Appを用意する。

## 🖥️ GHCRイメージを使う運用ホスト

デフォルトの`start.sh`はBotイメージをローカルビルドする。CDで公開されたイメージを利用する場合は、次のように設定する。

```bash
export BOT_IMAGE=ghcr.io/kawaewanko/discord-voicevox-yomiage:latest
docker login ghcr.io
docker compose pull bot
docker compose up -d bot
./scripts/healthcheck.sh
```

VOICEVOXはホスト上でヘルスチェック用`curl`を追加したラッパーイメージとしてビルドするため、初回は次を実行する。

```bash
docker compose build --pull voicevox
docker compose up -d voicevox bot
```

実際の公開先は、リポジトリ所有者とイメージの可視性に合わせて`BOT_IMAGE`を置き換える。

### 🤖 複数Bot

同じイメージで最大10体まで起動できる。`./scripts/setup-multi.sh <1〜10>`でBotごとの環境変数を作成し、`./scripts/start-multi.sh <1〜10>`でComposeプロファイルを選択して起動する。各Botの設定データは個別ボリュームに保存され、メンテナンス状態だけは共通の`MAINTENANCE_STATE_VOLUME`で共有される。

コマンド登録は`./scripts/deploy-multi.sh <1〜10>`で各`BOT_N_GUILD_ID`へ一括実行できる。

## 🚫 本番自動デプロイについて

このリポジトリでは、接続先サーバーやSSH秘密鍵を持たない状態で勝手に本番デプロイしない。CDはまず検証済みのBotイメージをGHCRへ公開するところまでを自動化している。

SSHデプロイを追加する場合は、GitHub Actions Secretsへ次の値を登録し、対象ホスト側にDocker Compose環境を用意してから、別途`deploy`ジョブを追加する。

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PATH`
- `DEPLOY_KNOWN_HOSTS`

秘密鍵やDiscordトークンをworkflowのログへ出力しない。デプロイジョブでは`docker compose pull bot`、`docker compose up -d bot`、`./scripts/healthcheck.sh`を順番に実行し、失敗時に直前イメージへ戻せるようSHAタグを使う。
