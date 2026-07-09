const { getEventById, addSignup, getSignups, ADD_SIGNUP_FULL, ADD_SIGNUP_DUPLICATE } = require('../db/db');
const { buildEventEmbed, buildActionRow } = require('../embeds/event-embed');

async function handleJoinModal(interaction, db) {
  const [, eventIdRaw, className] = interaction.customId.split(':');
  const eventId = Number.parseInt(eventIdRaw, 10);
  const event = getEventById(db, eventId);

  if (!event) {
    await interaction.reply({ content: '找不到這個揪團，可能已經被刪除了', ephemeral: true });
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
    await interaction.reply({ content: '你已經報名囉', ephemeral: true });
    return;
  }
  if (result === ADD_SIGNUP_FULL) {
    await interaction.reply({ content: '已經額滿了', ephemeral: true });
    return;
  }

  const signups = getSignups(db, event.id);
  const embed = buildEventEmbed(event, signups);
  const row = buildActionRow(event, signups.length);

  const announcementChannel = await interaction.client.channels.fetch(event.channel_id);
  const announcementMessage = await announcementChannel.messages.fetch(event.message_id);
  await announcementMessage.edit({ embeds: [embed] });

  const controlMessage = await interaction.channel.messages.fetch(event.thread_message_id);
  await controlMessage.edit({ components: [row] });

  await interaction.channel.send(`<@${interaction.user.id}> 已報名（職業：${className}／等級：${level}／ID：${gameId}）`);

  await interaction.reply({ content: '報名成功！', ephemeral: true });
}

module.exports = { handleJoinModal };
