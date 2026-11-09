// The sign-up template mixes full-width and half-width colons (「遊戲UID: 」
// uses a half-width colon while the other fields use full-width 「：」), so
// every field has to accept either.
const GAME_NAME_PATTERN = /遊戲名稱[:：]\s*(.+)/;
const GAME_UID_PATTERN = /遊戲UID[:：]\s*(.+)/;
const CLASS_PATTERN = /職業[:：]\s*(.+)/;
const ACTIVE_TIME_PATTERN = /最常出沒時間[:：]\s*(.+)/;

function parseVerificationMessage(content) {
  if (typeof content !== 'string') {
    return null;
  }

  const nameMatch = content.match(GAME_NAME_PATTERN);
  const uidMatch = content.match(GAME_UID_PATTERN);
  const classMatch = content.match(CLASS_PATTERN);
  const timeMatch = content.match(ACTIVE_TIME_PATTERN);
  if (!nameMatch || !uidMatch || !classMatch || !timeMatch) {
    return null;
  }

  const gameName = nameMatch[1].trim();
  if (!gameName) {
    return null;
  }

  return { gameName };
}

function createVerificationMessageHandler(channelId, roleId) {
  return async function handleVerificationMessage(message) {
    if (!channelId || !roleId) {
      console.log('[verification] skipped: channelId or roleId not configured');
      return;
    }
    if (message.channelId !== channelId || message.author.bot) {
      return;
    }

    const parsed = parseVerificationMessage(message.content);
    if (!parsed) {
      console.log(`[verification] message did not match the format: ${JSON.stringify(message.content)}`);
      return;
    }

    const member = message.member;
    if (!member) {
      console.log(`[verification] skipped: no resolved member for author ${message.author.id}`);
      return;
    }

    console.log(`[verification] matched, gameName=${parsed.gameName}, member=${member.id}`);
    await member.roles
      .remove(roleId)
      .then(() => console.log(`[verification] removed role ${roleId} from ${member.id}`))
      .catch((error) => console.error(`[verification] failed to remove role from ${member.id}:`, error));
    await member
      .setNickname(parsed.gameName)
      .then(() => console.log(`[verification] set nickname for ${member.id} to ${parsed.gameName}`))
      .catch((error) => console.error(`[verification] failed to set nickname for ${member.id}:`, error));
  };
}

module.exports = { createVerificationMessageHandler, parseVerificationMessage };
