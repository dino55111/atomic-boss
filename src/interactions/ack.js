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

// For modals opened straight from a public message's button (e.g. the card's
// "改時間"): the interaction's reply IS that message, so deleteReply() would
// delete the card itself. Only ack, leaving the message untouched.
async function tryAcknowledgeKeepMessage(interaction) {
  try {
    await interaction.deferUpdate();
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = { tryAcknowledgeAndDeleteReply, tryAcknowledgeKeepMessage };
