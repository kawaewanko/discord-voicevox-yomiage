require("dotenv").config();

const http = require("node:http");
const path = require("node:path");
const {
  Client,
  GatewayIntentBits,
  Events,
  MessageFlags,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  NoSubscriberBehavior,
  StreamType,
} = require("@discordjs/voice");
const { Readable } = require("node:stream");
const prism = require("prism-media");
const { MAX_QUEUE_LENGTH, createSettingsStore, normalizeText } = require("./utils");

const TOKEN = process.env.DISCORD_TOKEN;
const VOICEVOX_URL = (process.env.VOICEVOX_URL || "http://127.0.0.1:50021").replace(/\/$/, "");
const DEFAULT_SPEAKER = Number.parseInt(process.env.DEFAULT_SPEAKER || "3", 10);
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "guild-settings.json");

if (!TOKEN) throw new Error(".env に DISCORD_TOKEN を設定してください。");
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535)
  throw new Error("PORT は0〜65535の整数にしてください。");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});
const settingsStore = createSettingsStore(SETTINGS_FILE, DEFAULT_SPEAKER);
const guildQueues = new Map();
const guildPlayers = new Map();
const processingGuilds = new Set();
const queueGenerations = new Map();
let httpServer;

function getSettings(guildId) {
  return settingsStore.get(guildId);
}
function getQueue(guildId) {
  if (!guildQueues.has(guildId)) guildQueues.set(guildId, []);
  return guildQueues.get(guildId);
}
function getPlayer(guildId) {
  if (!guildPlayers.has(guildId)) {
    guildPlayers.set(
      guildId,
      createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Stop } }),
    );
  }
  return guildPlayers.get(guildId);
}
function getQueueGeneration(guildId) {
  return queueGenerations.get(guildId) || 0;
}
function invalidateQueue(guildId) {
  queueGenerations.set(guildId, getQueueGeneration(guildId) + 1);
}
function getUserVoiceChannel(interaction) {
  return interaction.member?.voice?.channel ?? null;
}

async function connectToChannel(channel) {
  const old = getVoiceConnection(channel.guild.id);
  if (old) old.destroy();
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
  });
  connection.on("error", (error) => console.error("Voice connection error:", error));
  connection.on("stateChange", async (_oldState, newState) => {
    if (newState.status !== VoiceConnectionStatus.Disconnected) return;
    try {
      await entersState(connection, VoiceConnectionStatus.Signalling, 5_000);
    } catch {
      connection.destroy();
      invalidateQueue(channel.guild.id);
      getPlayer(channel.guild.id).stop(true);
    }
  });
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch {
    connection.destroy();
    throw new Error("ボイスチャンネルへの接続に失敗しました。Botの権限を確認してください。");
  }
  connection.subscribe(getPlayer(channel.guild.id));
  return connection;
}

async function synthesize(text, speakerId) {
  const queryResponse = await fetch(
    `${VOICEVOX_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
    { method: "POST", signal: AbortSignal.timeout(15_000) },
  );
  if (!queryResponse.ok)
    throw new Error(`VOICEVOX audio_query error: HTTP ${queryResponse.status}`);
  const query = await queryResponse.json();
  const synthesisResponse = await fetch(`${VOICEVOX_URL}/synthesis?speaker=${speakerId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
    signal: AbortSignal.timeout(30_000),
  });
  if (!synthesisResponse.ok)
    throw new Error(`VOICEVOX synthesis error: HTTP ${synthesisResponse.status}`);
  return Buffer.from(await synthesisResponse.arrayBuffer());
}

function waitUntilIdle(player) {
  if (player.state.status === AudioPlayerStatus.Idle) return Promise.resolve();
  return new Promise((resolve) => {
    const cleanup = () => {
      player.off(AudioPlayerStatus.Idle, onIdle);
      player.off("error", onError);
    };
    const onIdle = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      console.error("Audio player error:", error);
      cleanup();
      resolve();
    };
    player.once(AudioPlayerStatus.Idle, onIdle);
    player.once("error", onError);
  });
}

async function processQueue(guildId) {
  if (processingGuilds.has(guildId)) return;
  processingGuilds.add(guildId);
  const queue = getQueue(guildId);
  const player = getPlayer(guildId);
  try {
    while (queue.length > 0) {
      const job = queue.shift();
      const generation = getQueueGeneration(guildId);
      const connection = getVoiceConnection(guildId);
      if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
        queue.unshift(job);
        break;
      }
      try {
        const wav = await synthesize(job.text, job.speakerId);
        if (generation !== getQueueGeneration(guildId) || !getVoiceConnection(guildId)) continue;
        const ffmpeg = new prism.FFmpeg({
          args: [
            "-analyzeduration",
            "0",
            "-loglevel",
            "0",
            "-f",
            "wav",
            "-i",
            "pipe:0",
            "-f",
            "s16le",
            "-ar",
            "48000",
            "-ac",
            "2",
            "pipe:1",
          ],
        });
        Readable.from([wav]).pipe(ffmpeg);
        player.play(
          createAudioResource(ffmpeg, { inputType: StreamType.Raw, metadata: { text: job.text } }),
        );
        await waitUntilIdle(player);
        if (generation !== getQueueGeneration(guildId)) continue;
      } catch (error) {
        console.error("読み上げに失敗しました:", error);
      }
    }
  } finally {
    processingGuilds.delete(guildId);
    if (queue.length > 0 && getVoiceConnection(guildId))
      setImmediate(() => void processQueue(guildId));
  }
}

function enqueue(guildId, text, speakerId) {
  const clean = normalizeText(text);
  if (!clean) return { added: false, reason: "empty" };
  const queue = getQueue(guildId);
  if (queue.length >= MAX_QUEUE_LENGTH) return { added: false, reason: "full" };
  queue.push({ text: clean, speakerId });
  void processQueue(guildId);
  return { added: true, size: queue.length };
}

async function fetchVoices() {
  const response = await fetch(`${VOICEVOX_URL}/speakers`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`VOICEVOX speakers error: HTTP ${response.status}`);
  return response.json();
}

function canManageGuild(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}
function makeEmbed(title, description, color = 0x5865f2) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}
function embedReply(interaction, title, description, options = {}) {
  return interaction.reply({
    embeds: [makeEmbed(title, description, options.color)],
    ...(options.ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
  });
}
function embedEdit(interaction, title, description, color) {
  return interaction.editReply({ embeds: [makeEmbed(title, description, color)] });
}
function publicError() {
  return "処理に失敗しました。VOICEVOXが起動しているか、Botの権限を確認してください。";
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`ログインしました: ${readyClient.user.tag}`);
  console.log(`VOICEVOX API: ${VOICEVOX_URL}`);
  console.log(`設定ファイル: ${SETTINGS_FILE}`);
});

client.on(Events.MessageCreate, (message) => {
  if (!message.guild || message.author.bot) return;
  const settings = getSettings(message.guild.id);
  if (
    !settings.textChannelId ||
    message.channel.id !== settings.textChannelId ||
    !getVoiceConnection(message.guild.id)
  )
    return;
  const content = normalizeText(message.content);
  if (!content) return;
  const text = settings.readNickname
    ? `${normalizeText(message.member?.displayName || message.author.username)}：${content}`
    : content;
  const result = enqueue(message.guild.id, text, settings.speakerId);
  if (!result.added)
    console.warn(`キューが満杯のため投稿を破棄しました: guild=${message.guild.id}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.guildId) return;
  const guildId = interaction.guildId;
  const settings = getSettings(guildId);
  try {
    switch (interaction.commandName) {
      case "join": {
        const channel = getUserVoiceChannel(interaction);
        if (!channel)
          return embedReply(interaction, "接続できません", "先にボイスチャンネルへ参加してね。", {
            ephemeral: true,
            color: 0xed4245,
          });
        await interaction.deferReply();
        await connectToChannel(channel);
        return interaction.editReply({
          embeds: [
            makeEmbed(
              "ボイスチャンネルに接続しました",
              `🔊 **${channel.name}** で読み上げを開始できます。`,
              0x57f287,
            ),
          ],
        });
      }
      case "leave": {
        invalidateQueue(guildId);
        getVoiceConnection(guildId)?.destroy();
        getQueue(guildId).length = 0;
        getPlayer(guildId).stop(true);
        return embedReply(
          interaction,
          "退出しました",
          "👋 ボイスチャンネルから退出し、待機中のキューを消去しました。",
          { color: 0xfee75c },
        );
      }
      case "say": {
        if (!getVoiceConnection(guildId))
          return embedReply(interaction, "読み上げできません", "先に `/join` でBotを接続してね。", {
            ephemeral: true,
            color: 0xed4245,
          });
        const result = enqueue(
          guildId,
          interaction.options.getString("text", true),
          settings.speakerId,
        );
        if (!result.added && result.reason === "full")
          return embedReply(
            interaction,
            "キューが満杯です",
            `現在の上限は${MAX_QUEUE_LENGTH}件です。再生が進んでからもう一度実行してください。`,
            { ephemeral: true, color: 0xed4245 },
          );
        if (!result.added)
          return embedReply(interaction, "文章が空です", "読み上げる文章を入力してください。", {
            ephemeral: true,
            color: 0xed4245,
          });
        return embedReply(
          interaction,
          "読み上げキューに追加しました",
          `📥 待機中: **${result.size}件**`,
          { ephemeral: true, color: 0x57f287 },
        );
      }
      case "skip": {
        const player = getPlayer(guildId);
        if (player.state.status === AudioPlayerStatus.Idle && !processingGuilds.has(guildId))
          return embedReply(
            interaction,
            "読み上げ中ではありません",
            "現在再生中の音声はありません。",
            { ephemeral: true },
          );
        invalidateQueue(guildId);
        player.stop(true);
        return embedReply(
          interaction,
          "スキップしました",
          "⏭️ 現在の読み上げをスキップしました。",
          { color: 0xfee75c },
        );
      }
      case "stop":
        invalidateQueue(guildId);
        getQueue(guildId).length = 0;
        getPlayer(guildId).stop(true);
        return embedReply(
          interaction,
          "読み上げを停止しました",
          "⏹️ 再生中の音声と待機キューを停止・消去しました。",
          { color: 0xfee75c },
        );
      case "queue": {
        const queue = getQueue(guildId);
        const current =
          getPlayer(guildId).state.status === AudioPlayerStatus.Idle &&
          !processingGuilds.has(guildId)
            ? "現在、再生中の音声はありません。"
            : "現在、音声を再生中です。";
        const lines = queue.slice(0, 10).map((job, i) => `${i + 1}. ${job.text.slice(0, 120)}`);
        const description =
          [current, ...lines].join("\n") +
          (queue.length > 10 ? `\nほか ${queue.length - 10} 件` : "");
        return embedReply(interaction, "読み上げキュー", description, { ephemeral: true });
      }
      case "voice": {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const speakerId = interaction.options.getInteger("speaker_id", true);
        const speakers = await fetchVoices();
        const match = speakers.find((speaker) =>
          speaker.styles.some((style) => style.id === speakerId),
        );
        if (!match)
          return embedEdit(
            interaction,
            "話者が見つかりません",
            `話者ID **${speakerId}** が見つかりません。まず \/voices で確認してね。`,
            0xed4245,
          );
        settings.speakerId = speakerId;
        await settingsStore.save();
        return embedEdit(
          interaction,
          "話者を変更しました",
          `🎙️ **${match.name}（${speakerId}）** を使用します。`,
          0x57f287,
        );
      }
      case "voices": {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const speakers = await fetchVoices();
        const lines = speakers.flatMap((speaker) =>
          speaker.styles.map(
            (style) => `• **${speaker.name} / ${style.name}** — ID: \`${style.id}\``,
          ),
        );
        return interaction.editReply({
          embeds: [
            makeEmbed(
              "VOICEVOX話者一覧",
              (lines.slice(0, 35).join("\n") || "話者が見つかりませんでした。") +
                (lines.length > 35 ? `\n\n（先頭35件 / 全${lines.length}件）` : ""),
            ),
          ],
        });
      }
      case "setchannel": {
        if (!canManageGuild(interaction))
          return embedReply(
            interaction,
            "権限がありません",
            "この設定にはサーバー管理権限が必要です。",
            { ephemeral: true, color: 0xed4245 },
          );
        settings.textChannelId = interaction.options.getChannel("channel", true).id;
        await settingsStore.save();
        return embedReply(
          interaction,
          "自動読み上げを設定しました",
          `📣 対象チャンネル: <#${settings.textChannelId}>`,
          { color: 0x57f287 },
        );
      }
      case "nickname": {
        if (!canManageGuild(interaction))
          return embedReply(
            interaction,
            "権限がありません",
            "この設定にはサーバー管理権限が必要です。",
            { ephemeral: true, color: 0xed4245 },
          );
        settings.readNickname = interaction.options.getBoolean("enabled", true);
        await settingsStore.save();
        return embedReply(
          interaction,
          "名前読み上げ設定を更新しました",
          settings.readNickname
            ? "👤 投稿者の表示名も読み上げます。"
            : "👤 投稿者の表示名は読み上げません。",
          { color: 0x57f287 },
        );
      }
      default:
        return undefined;
    }
  } catch (error) {
    console.error(`/${interaction.commandName} failed:`, error);
    const content = publicError();
    if (interaction.replied || interaction.deferred)
      await interaction
        .editReply({ embeds: [makeEmbed("処理に失敗しました", content, 0xed4245)] })
        .catch(() => {});
    else
      await embedReply(interaction, "処理に失敗しました", content, {
        ephemeral: true,
        color: 0xed4245,
      }).catch(() => {});
  }
});

httpServer = http.createServer((request, response) => {
  const pathname = new URL(request.url || "/", "http://localhost").pathname;
  if (pathname !== "/health") {
    response.writeHead(404);
    return response.end("not found\n");
  }
  const ready = client.isReady();
  response.writeHead(ready ? 200 : 503, { "Content-Type": "application/json; charset=utf-8" });
  response.end(
    JSON.stringify({ status: ready ? "ok" : "starting", discord: ready ? "ready" : "offline" }),
  );
});

async function shutdown(signal) {
  console.log(`${signal} を受信しました。終了します。`);
  for (const [guildId] of guildPlayers) {
    getPlayer(guildId).stop(true);
    getVoiceConnection(guildId)?.destroy();
  }
  client.destroy();
  await settingsStore.save().catch((error) => console.error("設定保存に失敗しました:", error));
  await new Promise((resolve) => httpServer.close(resolve));
  process.exit(0);
}

(async () => {
  await settingsStore.load();
  httpServer.listen(PORT, () => console.log(`Health endpoint: http://127.0.0.1:${PORT}/health`));
  await client.login(TOKEN);
})();
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
