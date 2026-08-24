const {
  getEventById,
  addSignup,
  getSignups,
  getSignupByEventAndUser,
  ADD_SIGNUP_FULL,
  ADD_SIGNUP_DUPLICATE,
} = require('../db/db');
const { buildEventEmbed, buildActionRow } = require('../embeds/event-embed');
const { tryAcknowledgeAndDeleteReply } = require('./ack');

// An optional TextInput left blank is omitted from the modal submission
// entirely, so ModalSubmitFields#getTextInputValue throws for it instead
// of returning an empty string. This reads it safely.
function getOptionalTextInputValue(fields, customId) {
  const field = fields.fields.get(customId);
  return field ? field.value : '';
}

async function handleJoinModal(interaction, db) {
  const [, eventIdRaw, className] = interaction.customId.split(':');
  const eventId = Number.parseInt(eventIdRaw, 10);
  const event = getEventById(db, eventId);

  // If the ack fails (stale interaction), we can no longer message the user
  // via this interaction, but the signup itself must still be recorded and
  // the roster still updated — those don't depend on this interaction's token.
  const acked = await tryAcknowledgeAndDeleteReply(interaction);

  if (!event) {
    if (acked) {
      await interaction.followUp({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true });
    }
    return;
  }

  const level = interaction.fields.getTextInputValue('level');
  const gameId = interaction.fields.getTextInputValue('game_id');
  const note = getOptionalTextInputValue(interaction.fields, 'note');

  const result = addSignup(db, event, {
    userId: interaction.user.id,
    displayName: interaction.user.username,
    className,
    level,
    gameId,
    note,
  });

  if (result === ADD_SIGNUP_DUPLICATE) {
    if (acked) {
      const existing = getSignupByEventAndUser(db, event.id, interaction.user.id);
      if (existing.added_by_user_id) {
        await interaction.followUp({
          content: `你已經被 <@${existing.added_by_user_id}> 代報名了，如需修改請先「取消報名」再重新填寫`,
          ephemeral: true,
        });
      }
    }
    return;
  }
  if (result === ADD_SIGNUP_FULL) {
    if (acked) {
      await interaction.followUp({ content: '已經額滿了', ephemeral: true });
    }
    return;
  }

  const signups = getSignups(db, event.id);
  const embed = buildEventEmbed(event, signups);
  const row = buildActionRow(event, signups.length);

  const message = await interaction.channel.messages.fetch(event.message_id);
  await message.edit({ embeds: [embed], components: [row] });

  const noteSegment = note ? `／備註：${note}` : '';
  const thread = await interaction.client.channels.fetch(event.thread_id);
  await thread.send({
    content: `<@${interaction.user.id}> 已報名（職業：${className}／等級：${level}／ID：${gameId}${noteSegment}）`,
    allowedMentions: { users: [interaction.user.id] },
  });
}

module.exports = { handleJoinModal, getOptionalTextInputValue };
