# Discord VOICEVOX 読み上げBot

discord.js v14 と VOICEVOX Engine を使った、日本語読み上げBotのサンプルです。

## 機能

- `/join` — 自分が参加しているボイスチャンネルにBotを接続
- `/leave` — Botを退出させる
- `/say text:...` — 指定した文章を読み上げる
- `/skip` — 現在の読み上げをスキップ
- `/stop` — 再生中の音声と待機キューを停止・消去
- `/queue` — 再生状態と待機中の文章を確認
- `/voices` — VOICEVOXの話者スタイルID一覧
- `/voice speaker_id:...` — 使用する話者スタイルを変更
- `/setchannel channel:#チャンネル` — 自動読み上げ対象を設定
- `/nickname enabled:true|false` — 投稿者の表示名を読み上げるか設定

設定はメモリ上に保持されます。Botを再起動すると、対象チャンネル・話者・名前読み上げ設定は初期値に戻ります。

## 1. 必要なもの

- Node.js 20以上
- Discordアプリケーション / Bot
- VOICEVOX Engine
- FFmpeg（環境によって音声処理に必要）
- Discord Botに必要な権限：View Channels、Send Messages、Connect、Speak

## 2. Discord側の設定

1. Discord Developer Portalでアプリケーションを作成し、Botを追加します。
2. Botトークンを発行します。トークンは秘密情報なので共有しないでください。
3. **Privileged Gateway Intents** の `Message Content Intent` を有効にします。
4. OAuth2 URL Generatorで `bot` と `applications.commands` を選び、Botをサーバーに招待します。必要なBot権限は View Channels、Send Messages、Connect、Speak です。
5. アプリケーションIDと、コマンドを登録するテストサーバーのIDを控えます。

## 3. VOICEVOXを起動

VOICEVOX Engineをインストールし、起動してください。標準設定では `http://127.0.0.1:50021` でAPIにアクセスできます。

ブラウザで `http://127.0.0.1:50021/speakers` を開き、話者一覧が返ることを確認してください。Dockerなど別ホストで起動する場合は `.env` の `VOICEVOX_URL` を変更します。

## 4. Botをセットアップ

プロジェクトのルートで実行します。

```bash
npm install
```

`.env.example` を `.env` にコピーし、値を設定します。

```env
DISCORD_TOKEN=Botトークン
CLIENT_ID=アプリケーションID
GUILD_ID=テストサーバーID
VOICEVOX_URL=http://127.0.0.1:50021
DEFAULT_SPEAKER=3
```

`DEFAULT_SPEAKER` はVOICEVOXの `/speakers` で確認したスタイルIDに変更できます。

## 5. スラッシュコマンドを登録

```bash
npm run deploy
```

このサンプルは指定したテストサーバーにギルドコマンドを登録します。サーバーIDを間違えていないか確認してください。

## 6. Botを起動

```bash
npm start
```

Discordで `/join` を実行してから `/setchannel` で対象テキストチャンネルを指定します。対象チャンネルへの新しい投稿が自動で読み上げられます。手動読み上げは `/say` を使います。

## トラブルシューティング

- **コマンドが出てこない**：`npm run deploy` を再実行し、`CLIENT_ID` と `GUILD_ID` を確認。
- **メッセージを検知しない**：Developer Portalで Message Content Intent を有効化し、Botを再起動。
- **読み上げが始まらない**：VOICEVOX Engineが起動しているか、`VOICEVOX_URL` にアクセスできるか確認。
- **接続できない**：Botに View Channels、Connect、Speak 権限があるか確認。
- **音声が再生されない**：Node.jsの対応バージョン、`@discordjs/opus` のインストール、FFmpegの導入を確認。
- **キューが空なのに処理が止まったように見える**：Botのコンソールにエラーが出ていないか確認。

## 注意点

- 音声合成はVOICEVOX Engineが動作する環境で実行されます。
- 自動読み上げは、Botがボイスチャンネルに接続中で、かつ設定したテキストチャンネルに新しいメッセージが投稿された場合のみ動きます。
- 現在の実装では、画像・添付ファイルだけの投稿は読み上げません。
- `/queue` は待機中の文章を表示します。合成・再生中の文章は待機キューには含まれません。
- サーバーごとの設定はメモリ上のみです。再起動後も保持したい場合はSQLiteなどへの保存を追加してください。
- VOICEVOXを利用する際は、各音声ライブラリ・キャラクターの利用規約とクレジット要件を確認してください。
