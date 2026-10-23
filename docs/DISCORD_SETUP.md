# 🎮 Discord設定手順

## 1. 🤖 アプリケーションとBotを作成

1. [Discord Developer Portal](https://discord.com/developers/applications)で **New Application** を選ぶ。
2. **Bot** → **Add Bot** を実行する。
3. **Reset Token** でトークンを発行し、`.env` の `DISCORD_TOKEN` に設定する。トークンは他人へ送らず、Gitへコミットしない。
4. **General Information** の **Application ID** を `CLIENT_ID` に設定する。
5. `setup.sh` の対話設定で、Discord APIから検出されたサーバーを選択する。手動の場合は対象サーバーのIDを開発者モードでコピーし、`GUILD_ID` に設定する。

## 2. 🔐 Privileged Intent

**Bot → Privileged Gateway Intents** で次を有効にする。

- **Message Content Intent**：自動読み上げの投稿本文取得に必須

## 3. 📨 Botをサーバーへ招待

OAuth2 URL Generatorで次を選択する。

- Scopes：`bot`、`applications.commands`
- Bot Permissions：`View Channels`、`Send Messages`、`Embed Links`、`Connect`、`Speak`

生成したURLで対象サーバーへ招待する。`Embed Links`がない場合、コマンドの埋め込み表示が通常テキストへ正しく表示されないことがある。

## 4. 📋 コマンド登録

ギルドコマンドとして登録するため、`.env` の `CLIENT_ID` と登録先 Guild ID を指定して実行する。Guild ID は引数で直接指定できる。

```bash
npm run deploy -- 123456789012345678
```

引数を省略した場合は `.env` の `GUILD_ID` を使用する。登録先を変えた場合は、変更先のIDを引数にして再度実行する。`/setchannel` と `/nickname` は Discord 側でもサーバー管理権限が必要なコマンドとして表示される。

## 5. ✅ 動作確認

1. `/join`：実行者自身が参加しているボイスチャンネルへ接続
2. `/voices`：VOICEVOXが返す話者スタイル一覧を表示
3. `/voice speaker_id:3`：話者を設定
4. `/setchannel channel:#読み上げ対象`：管理者が対象チャンネルを設定
5. 対象チャンネルへ投稿：自動読み上げ
6. `/say text:こんにちは`：手動読み上げ
7. `/queue`、`/skip`、`/stop`：キュー操作

Botがオンラインになると、Discordのプレゼンスに「視聴中 /help | {遅延} ms | v{バージョン}」と表示されます。

## 6. 🛠️ メンテナンスモード

メンテナンス中は `.env` の次の値を設定してBotを再起動します。

```env
MAINTENANCE_MODE=true
MAINTENANCE_MESSAGE=現在メンテナンス中です。しばらくお待ちください。
```

メンテナンス中は `/help` 以外のコマンド、自動読み上げ、ボイス接続、設定変更を停止します。作業完了後は `MAINTENANCE_MODE=false` に戻して再起動してください。

同一ホスト上の複数Botを同時に切り替える場合は、全Botの `.env` に同じ `MAINTENANCE_STATE_VOLUME` を設定し、いずれかのBotで次を実行します。

```text
/maintenance enabled:true message:メンテナンスを開始します
/maintenance enabled:false
```

共有状態ファイルを各Botが約5秒間隔で確認するため、全Botへ順次反映されます。実行にはサーバー管理権限が必要です。

## 7. 🤖 複数Botの起動

1〜10体を同一ホストで起動する場合は、BotごとのトークンとApplication IDを対話式に設定します。

```bash
./scripts/setup-multi.sh 3
```

設定済みのBotを起動する場合は次を実行します。

```bash
./scripts/start-multi.sh 3
```

`bot-1`〜`bot-10`のComposeプロファイルと、既定のヘルスポート`3001`〜`3010`が割り当てられます。各Botでコマンド登録が必要なため、対象Guildごとに`npm run deploy -- <Guild ID>`を実行してください。

各Botの`BOT_N_GUILD_ID`を設定済みなら、Compose経由で一括登録できます。

```bash
./scripts/deploy-multi.sh 3
```
