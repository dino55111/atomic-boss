const { getEventById, addSignup, getSignups, ADD_SIGNUP_FULL, ADD_SIGNUP_DUPLICATE } = require('../db/db');
const { buildEventEmbed, buildActionRow } = require('../embeds/event-embed');

async function handleJoinModal(interaction, db) {
  const [, eventIdRaw, className] = interaction.customId.split(':');
  const eventId = Number.parseInt(eventIdRaw, 10);
  const event = getEventById(db, eventId);

  // Deleting the class-picker message this modal was launched from requires
  // claiming it via deferUpdate() first, then deleteReply(); after that,
  // every further response must go through followUp() instead of reply().
  await interaction.deferUpdate();
  await interaction.deleteReply();

  if (!event) {
    await interaction.followUp({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true });
    return;
  }

  const level = interaction.fields.getTextInputValue('level');
  const gameId = interaction.fields.getTextInputValue('game_id');

  const result = addSignup(db, event, {
    userId: interaction.user.id,
    displayName: interaction.user.username,
    className,
    level,
    gameId,
  });

  if (result === ADD_SIGNUP_DUPLICATE) {
    await interaction.followUp({ content: '你已經報名囉', ephemeral: true });
    return;
  }
  if (result === ADD_SIGNUP_FULL) {
    await interaction.followUp({ content: '已經額滿了', ephemeral: true });
    return;
  }

  const signups = getSignups(db, event.id);
  const embed = buildEventEmbed(event, signups);
  const row = buildActionRow(event, signups.length);

  const message = await interaction.channel.messages.fetch(event.message_id);
  await message.edit({ embeds: [embed], components: [row] });

  const thread = await interaction.client.channels.fetch(event.thread_id);
  await thread.send(`<@${interaction.user.id}> 已報名（職業：${className}／等級：${level}／ID：${gameId}）`);
}

module.exports = { handleJoinModal };
