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
    .setName("help")
    .setDescription("利用できるコマンドと現在の状態を表示します"),
  new SlashCommandBuilder()
    .setName("maintenance")
    .setDescription("全Botのメンテナンス状態を変更します")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((option) =>
      option.setName("enabled").setDescription("trueで開始、falseで終了").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("message").setDescription("メンテナンス中に表示する案内文").setMaxLength(500),
    ),
  new SlashCommandBuilder()
    .setName("join")
    .setDescription("自分が参加中のボイスチャンネルへBotを接続します"),
  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Botを切断し、待機中の読み上げを消去します"),
  new SlashCommandBuilder()
    .setName("say")
    .setDescription("指定した文章を読み上げます")
    .addStringOption((option) =>
      option.setName("text").setDescription("読み上げる文章").setRequired(true).setMaxLength(1000),
    ),
  new SlashCommandBuilder().setName("skip").setDescription("現在の読み上げだけをスキップします"),
  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("再生中の音声と待機中の読み上げを停止・消去します"),
  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("再生状態と待機中の読み上げを確認します"),
  new SlashCommandBuilder()
    .setName("voice")
    .setDescription("VOICEVOXの話者IDを設定します")
    .addIntegerOption((option) =>
      option
        .setName("speaker_id")
        .setDescription("VOICEVOXの話者ID（/voices で確認できます）")
        .setRequired(true)
        .setMinValue(0),
    ),
  new SlashCommandBuilder()
    .setName("voices")
    .setDescription("VOICEVOXで利用できる話者とスタイルIDを表示します"),
  new SlashCommandBuilder()
    .setName("setchannel")
    .setDescription("自動読み上げの対象テキストチャンネルを設定します")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("対象チャンネル")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("nickname")
    .setDescription("投稿者の表示名を読み上げるか設定します")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((option) =>
      option.setName("enabled").setDescription("trueなら名前を読み上げる").setRequired(true),
    ),
].map((command) => command.toJSON());

async function main() {
  const { DISCORD_TOKEN, CLIENT_ID } = process.env;
  const guildId = process.argv[2] || process.env.GUILD_ID;
  if (!DISCORD_TOKEN || !CLIENT_ID || !guildId) {
    throw new Error(
      "DISCORD_TOKEN と CLIENT_ID を設定し、Guild ID を引数または .env の GUILD_ID で指定してください。",
    );
  }
  if (!/^\d{17,20}$/.test(guildId)) {
    throw new Error("Guild ID は Discord の数値 ID（17〜20桁）で指定してください。");
  }

  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
  console.log(`スラッシュコマンドを Guild ${guildId} に登録しました。`);
}

main().catch((error) => {
  console.error("コマンド登録に失敗しました:", error);
  process.exitCode = 1;
});
