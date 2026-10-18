# Discord設定手順

## 1. アプリケーションとBotを作成

1. [Discord Developer Portal](https://discord.com/developers/applications)で **New Application** を選ぶ。
2. **Bot** → **Add Bot** を実行する。
3. **Reset Token** でトークンを発行し、`.env` の `DISCORD_TOKEN` に設定する。トークンは他人へ送らず、Gitへコミットしない。
4. **General Information** の **Application ID** を `CLIENT_ID` に設定する。
5. 動作確認対象サーバーのIDを開発者モードでコピーし、`GUILD_ID` に設定する。

## 2. Privileged Intent

**Bot → Privileged Gateway Intents** で次を有効にする。

- **Message Content Intent**：自動読み上げの投稿本文取得に必須

## 3. Botをサーバーへ招待

OAuth2 URL Generatorで次を選択する。

- Scopes：`bot`、`applications.commands`
- Bot Permissions：`View Channels`、`Send Messages`、`Embed Links`、`Connect`、`Speak`

生成したURLで対象サーバーへ招待する。`Embed Links`がない場合、コマンドの埋め込み表示が通常テキストへ正しく表示されないことがある。

## 4. コマンド登録

ギルドコマンドとして登録するため、`.env` の `CLIENT_ID` と `GUILD_ID` を設定してから実行する。

```bash
npm run deploy
```

登録先を変えた場合は、再度 `npm run deploy` を実行する。`/setchannel` と `/nickname` はDiscord側でもサーバー管理権限が必要なコマンドとして表示される。

## 5. 動作確認

1. `/join`：実行者自身が参加しているボイスチャンネルへ接続
2. `/voices`：VOICEVOXが返す話者スタイル一覧を表示
3. `/voice speaker_id:3`：話者を設定
4. `/setchannel channel:#読み上げ対象`：管理者が対象チャンネルを設定
5. 対象チャンネルへ投稿：自動読み上げ
6. `/say text:こんにちは`：手動読み上げ
7. `/queue`、`/skip`、`/stop`：キュー操作
