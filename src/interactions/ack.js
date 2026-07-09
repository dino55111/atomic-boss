// deferUpdate()/deleteReply() can fail with "Unknown interaction" if Discord's
// 3-second ack window is missed. Since the class/title-picker cleanup and the
// interaction's own follow-up replies depend on it, callers use the returned
// boolean to skip those without losing the underlying signup/event mutation,
// which doesn't depend on this interaction's token at all.
async function tryAcknowledgeAndDeleteReply(interaction) {
  try {
    await interaction.deferUpdate();
    await interaction.deleteReply();
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = { tryAcknowledgeAndDeleteReply };
