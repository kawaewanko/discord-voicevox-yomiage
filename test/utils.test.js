const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createSettingsStore, normalizeText, sanitizeSettings } = require("../src/utils");

test("normalizeText removes mentions, URLs and excessive whitespace", () => {
  assert.equal(
    normalizeText("  こんにちは   <@123> https://example.com  "),
    "こんにちは メンション URL",
  );
});

test("normalizeText caps input length", () => {
  assert.equal(normalizeText("a".repeat(1100)).length, 1000);
});

test("sanitizeSettings restores invalid persisted values", () => {
  assert.deepEqual(sanitizeSettings({ speakerId: -1, readNickname: "yes" }, 3), {
    textChannelId: null,
    speakerId: 3,
    readNickname: true,
  });
});

test("settings store persists guild settings atomically", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "voicevox-test-"));
  const filePath = path.join(directory, "settings.json");
  const first = createSettingsStore(filePath, 3);
  await first.load();
  first.get("guild-1").speakerId = 8;
  await first.save();

  const second = createSettingsStore(filePath, 3);
  await second.load();
  assert.equal(second.get("guild-1").speakerId, 8);
  await fs.rm(directory, { recursive: true, force: true });
});
