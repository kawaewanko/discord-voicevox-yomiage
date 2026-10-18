const fs = require("node:fs/promises");
const path = require("node:path");

const MAX_TEXT_LENGTH = 1000;
const MAX_QUEUE_LENGTH = 50;

function normalizeText(value) {
  return String(value || "")
    .replace(/<@!?\d+>/g, "メンション")
    .replace(/<#\d+>/g, "チャンネル")
    .replace(/<@&\d+>/g, "ロール")
    .replace(/https?:\/\/\S+/gi, "URL")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

function createDefaultSettings(defaultSpeaker) {
  return {
    textChannelId: null,
    speakerId: Number.isFinite(defaultSpeaker) ? defaultSpeaker : 3,
    readNickname: true,
  };
}

function sanitizeSettings(value, defaultSpeaker) {
  const defaults = createDefaultSettings(defaultSpeaker);
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;

  return {
    textChannelId: typeof value.textChannelId === "string" ? value.textChannelId : null,
    speakerId:
      Number.isSafeInteger(value.speakerId) && value.speakerId >= 0
        ? value.speakerId
        : defaults.speakerId,
    readNickname:
      typeof value.readNickname === "boolean" ? value.readNickname : defaults.readNickname,
  };
}

function createSettingsStore(filePath, defaultSpeaker) {
  const settings = new Map();
  let loaded = false;
  let writePromise = Promise.resolve();

  async function load() {
    if (loaded) return;
    loaded = true;

    try {
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("設定ファイルのルートはオブジェクトである必要があります");
      }
      for (const [guildId, value] of Object.entries(parsed)) {
        settings.set(guildId, sanitizeSettings(value, defaultSpeaker));
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.warn(`設定ファイルを読み込めませんでした: ${error.message}`);
      }
    }
  }

  function get(guildId) {
    if (!settings.has(guildId)) {
      settings.set(guildId, createDefaultSettings(defaultSpeaker));
    }
    return settings.get(guildId);
  }

  function save() {
    const data = Object.fromEntries(settings);
    writePromise = writePromise
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const temporary = `${filePath}.tmp`;
        await fs.writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
        await fs.rename(temporary, filePath);
      });
    return writePromise;
  }

  return { load, get, save };
}

module.exports = {
  MAX_QUEUE_LENGTH,
  MAX_TEXT_LENGTH,
  createDefaultSettings,
  createSettingsStore,
  normalizeText,
  sanitizeSettings,
};
