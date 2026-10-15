require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("join")
    .setDescription("自分が参加しているボイスチャンネルにBotを接続します"),
  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Botをボイスチャンネルから退出させます"),
  new SlashCommandBuilder()
    .setName("say")
    .setDescription("指定した文章を読み上げます")
    .addStringOption(option =>
      option.setName("text").setDescription("読み上げる文章").setRequired(true).setMaxLength(1000)),
  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("現在の読み上げをスキップします"),
  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("現在の音声と待機中の読み上げを停止・消去します"),
  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("待機中の読み上げを確認します"),
  new SlashCommandBuilder()
    .setName("voice")
    .setDescription("VOICEVOXの話者IDを設定します")
    .addIntegerOption(option =>
      option.setName("speaker_id").setDescription("VOICEVOXの話者ID（/voices で確認）").setRequired(true).setMinValue(0)),
  new SlashCommandBuilder()
    .setName("voices")
    .setDescription("VOICEVOXで利用できる話者とスタイルIDを表示します"),
  new SlashCommandBuilder()
    .setName("setchannel")
    .setDescription("自動読み上げの対象テキストチャンネルを設定します")
    .addChannelOption(option =>
      option.setName("channel").setDescription("対象チャンネル").addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder()
    .setName("nickname")
    .setDescription("投稿者の表示名を読み上げるか切り替えます")
    .addBooleanOption(option =>
      option.setName("enabled").setDescription("trueなら名前を読み上げる").setRequired(true))
].map(command => command.toJSON());

async function main() {
  const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
  if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
    throw new Error(".env に DISCORD_TOKEN、CLIENT_ID、GUILD_ID を設定してください。");
  }

  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log("スラッシュコマンドをテスト用サーバーに登録しました。");
}

main().catch(error => {
  console.error("コマンド登録に失敗しました:", error);
  process.exitCode = 1;
});
