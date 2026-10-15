require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Events,
  MessageFlags,
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

const TOKEN = process.env.DISCORD_TOKEN;
const VOICEVOX_URL = (process.env.VOICEVOX_URL || "http://127.0.0.1:50021").replace(/\/$/, "");
const DEFAULT_SPEAKER = Number.parseInt(process.env.DEFAULT_SPEAKER || "3", 10);

if (!TOKEN) {
  throw new Error(".env に DISCORD_TOKEN を設定してください。");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// 設定はメモリ上に保持されます。Bot再起動後は初期値に戻ります。
const guildSettings = new Map();
const guildQueues = new Map();
const guildPlayers = new Map();
const processingGuilds = new Set();

function getSettings(guildId) {
  if (!guildSettings.has(guildId)) {
    guildSettings.set(guildId, {
      textChannelId: null,
      speakerId: Number.isFinite(DEFAULT_SPEAKER) ? DEFAULT_SPEAKER : 3,
      readNickname: true,
    });
  }
  return guildSettings.get(guildId);
}

function getQueue(guildId) {
  if (!guildQueues.has(guildId)) guildQueues.set(guildId, []);
  return guildQueues.get(guildId);
}

function getPlayer(guildId) {
  if (!guildPlayers.has(guildId)) {
    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Stop },
    });
    guildPlayers.set(guildId, player);
  }
  return guildPlayers.get(guildId);
}

function getUserVoiceChannel(interaction) {
  return interaction.member?.voice?.channel ?? null;
}

async function connectToChannel(channel) {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  connection.on("error", error => console.error("Voice connection error:", error));
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (error) {
    connection.destroy();
    throw new Error("ボイスチャンネルへの接続に失敗しました。Botの権限を確認してください。");
  }

  const player = getPlayer(channel.guild.id);
  connection.subscribe(player);
  return connection;
}

async function synthesize(text, speakerId) {
  // VOICEVOXに文章から音声クエリを作らせる
  const queryResponse = await fetch(
    `${VOICEVOX_URL}/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
    { method: "POST" }
  );
  if (!queryResponse.ok) {
    throw new Error(`VOICEVOX audio_query error: HTTP ${queryResponse.status}`);
  }
  const query = await queryResponse.json();

  const synthesisResponse = await fetch(
    `${VOICEVOX_URL}/synthesis?speaker=${speakerId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    }
  );
  if (!synthesisResponse.ok) {
    throw new Error(`VOICEVOX synthesis error: HTTP ${synthesisResponse.status}`);
  }

  const arrayBuffer = await synthesisResponse.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function waitUntilIdle(player) {
  if (player.state.status === AudioPlayerStatus.Idle) return Promise.resolve();
  return new Promise(resolve => {
    const onIdle = () => {
      cleanup();
      resolve();
    };
    const onError = error => {
      console.error("Audio player error:", error);
      cleanup();
      resolve();
    };
    const cleanup = () => {
      player.off(AudioPlayerStatus.Idle, onIdle);
      player.off("error", onError);
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
      const connection = getVoiceConnection(guildId);
      if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
        queue.unshift(job);
        break;
      }

      try {
        const wav = await synthesize(job.text, job.speakerId);
        // VOICEVOXのWAVをFFmpegでDiscord voice向けの48 kHz・ステレオPCMに変換する。
        const ffmpeg = new prism.FFmpeg({
          args: [
            "-analyzeduration", "0",
            "-loglevel", "0",
            "-f", "wav",
            "-i", "pipe:0",
            "-f", "s16le",
            "-ar", "48000",
            "-ac", "2",
            "pipe:1",
          ],
        });
        Readable.from([wav]).pipe(ffmpeg);
        const resource = createAudioResource(ffmpeg, {
          inputType: StreamType.Raw,
          metadata: { text: job.text },
        });
        player.play(resource);
        await waitUntilIdle(player);
      } catch (error) {
        console.error("読み上げに失敗しました:", error);
      }
    }
  } finally {
    processingGuilds.delete(guildId);
    // 処理中に追加されたキューを取りこぼさない
    if (queue.length > 0 && getVoiceConnection(guildId)) {
      setImmediate(() => processQueue(guildId));
    }
  }
}

function enqueue(guildId, text, speakerId) {
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 1000);
  if (!clean) return false;
  getQueue(guildId).push({ text: clean, speakerId });
  void processQueue(guildId);
  return true;
}

async function fetchVoices() {
  const response = await fetch(`${VOICEVOX_URL}/speakers`);
  if (!response.ok) throw new Error(`VOICEVOX speakers error: HTTP ${response.status}`);
  return response.json();
}

client.once(Events.ClientReady, readyClient => {
  console.log(`ログインしました: ${readyClient.user.tag}`);
  console.log(`VOICEVOX API: ${VOICEVOX_URL}`);
});

client.on(Events.MessageCreate, message => {
  if (!message.guild || message.author.bot) return;

  const settings = getSettings(message.guild.id);
  if (!settings.textChannelId || message.channel.id !== settings.textChannelId) return;
  if (!getVoiceConnection(message.guild.id)) return;

  const content = message.content?.trim();
  if (!content) return; // 添付ファイルだけの投稿は読み上げない

  const text = settings.readNickname
    ? `${message.member?.displayName || message.author.username}：${content}`
    : content;

  enqueue(message.guild.id, text, settings.speakerId);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() || !interaction.guildId) return;

  const guildId = interaction.guildId;
  const settings = getSettings(guildId);

  try {
    switch (interaction.commandName) {
      case "join": {
        const channel = getUserVoiceChannel(interaction);
        if (!channel) {
          await interaction.reply({ content: "先にボイスチャンネルへ参加してね。", flags: MessageFlags.Ephemeral });
          return;
        }
        await connectToChannel(channel);
        await interaction.reply(`🔊 **${channel.name}** に接続したよ！`);
        break;
      }

      case "leave": {
        const connection = getVoiceConnection(guildId);
        if (connection) connection.destroy();
        getQueue(guildId).length = 0;
        getPlayer(guildId).stop(true);
        await interaction.reply("👋 ボイスチャンネルから退出したよ。");
        break;
      }

      case "say": {
        const connection = getVoiceConnection(guildId);
        if (!connection) {
          await interaction.reply({ content: "先に `/join` でBotをボイスチャンネルに接続してね。", flags: MessageFlags.Ephemeral });
          return;
        }
        const text = interaction.options.getString("text", true);
        enqueue(guildId, text, settings.speakerId);
        await interaction.reply({ content: "📥 読み上げキューに追加したよ！", flags: MessageFlags.Ephemeral });
        break;
      }

      case "skip": {
        const player = getPlayer(guildId);
        if (player.state.status === AudioPlayerStatus.Idle) {
          await interaction.reply({ content: "今は読み上げ中じゃないよ。", flags: MessageFlags.Ephemeral });
          return;
        }
        player.stop(true);
        await interaction.reply("⏭️ 今の読み上げをスキップしたよ。");
        break;
      }

      case "stop": {
        getQueue(guildId).length = 0;
        getPlayer(guildId).stop(true);
        await interaction.reply("⏹️ 再生中の音声と待機キューを停止したよ。");
        break;
      }

      case "queue": {
        const queue = getQueue(guildId);
        const lines = queue.slice(0, 10).map((job, index) =>
          `${index + 1}. ${job.text.slice(0, 120)}`
        );
        const current = getPlayer(guildId).state.status === AudioPlayerStatus.Idle
          ? "現在、再生中の音声はありません。"
          : "現在、音声を再生中です。";
        const description = [current, ...lines].join("\n");
        await interaction.reply({
          content: `${description}${queue.length > 10 ? `\nほか ${queue.length - 10} 件` : ""}`,
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      case "voice": {
        const speakerId = interaction.options.getInteger("speaker_id", true);
        // 実在する話者IDか、VOICEVOX APIで確認する
        const speakers = await fetchVoices();
        const match = speakers.find(speaker =>
          speaker.styles.some(style => style.id === speakerId)
        );
        if (!match) {
          await interaction.reply({
            content: `話者ID **${speakerId}** が見つからなかったよ。まず \`/voices\` でIDを確認してね。`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        settings.speakerId = speakerId;
        await interaction.reply(`🎙️ 話者を **${match.name}（${speakerId}）** に設定したよ！`);
        break;
      }

      case "voices": {
        const speakers = await fetchVoices();
        const lines = speakers.flatMap(speaker =>
          speaker.styles.map(style => `• **${speaker.name} / ${style.name}** — ID: \`${style.id}\``)
        );
        const pages = [];
        for (let i = 0; i < lines.length; i += 35) pages.push(lines.slice(i, i + 35).join("\n"));
        await interaction.reply({
          content: (pages[0] || "話者が見つかりませんでした。") +
            (pages.length > 1 ? `\n\n（表示は先頭35件。VOICEVOXの話者一覧は ${lines.length} 件です）` : ""),
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      case "setchannel": {
        const channel = interaction.options.getChannel("channel", true);
        settings.textChannelId = channel.id;
        await interaction.reply(`📣 自動読み上げ対象を ${channel} に設定したよ！`);
        break;
      }

      case "nickname": {
        settings.readNickname = interaction.options.getBoolean("enabled", true);
        await interaction.reply(
          settings.readNickname
            ? "👤 投稿者の表示名も読み上げるようにしたよ。"
            : "👤 投稿者の表示名を読み上げない設定にしたよ。"
        );
        break;
      }
    }
  } catch (error) {
    console.error(`/${interaction.commandName} failed:`, error);
    const message = `処理に失敗しました: ${error.message || "不明なエラー"}。VOICEVOXが起動しているか確認してね。`;
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.login(TOKEN);
