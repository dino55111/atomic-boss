// Plain chat clutters the announcement channel and there's no Discord
// permission combo that blocks typing while still allowing slash commands
// (Discord ties both to the Send Messages permission) — button/select
// interactions are unaffected by it though, so this only needs to catch
// genuinely typed messages, never a command or component interaction.
const REMINDER_TTL_MS = 8 * 1000;

function createMessageCreateHandler(commandOnlyChannelId) {
  return async function handleMessageCreate(message) {
    if (!commandOnlyChannelId || message.channelId !== commandOnlyChannelId || message.author.bot) {
      return;
    }

    await message.delete().catch(() => {});

    const reminder = await message.channel
      .send({
        content: `<@${message.author.id}> 本頻道只能使用指令或按鈕，訊息已自動刪除`,
        allowedMentions: { users: [message.author.id] },
      })
      .catch(() => {});

    if (reminder) {
      // unref() so this pending timer never keeps the process (or a test
      // runner) alive on its own.
      setTimeout(() => {
        reminder.delete().catch(() => {});
      }, REMINDER_TTL_MS).unref();
    }
  };
}

module.exports = { createMessageCreateHandler, REMINDER_TTL_MS };
