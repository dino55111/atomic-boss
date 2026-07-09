const { createEvent, updateEventMessageId, updateEventThreadId } = require('../db/db');
const { buildEventEmbed, buildActionRow } = require('../embeds/event-embed');

function parseCapacity(rawCapacity) {
  const capacity = Number.parseInt(rawCapacity, 10);
  if (!Number.isInteger(capacity) || capacity <= 0) {
    return null;
  }
  return capacity;
}

async function handleCreateEventModal(interaction, db) {
  const title = interaction.fields.getTextInputValue('title');
  const rawCapacity = interaction.fields.getTextInputValue('capacity');
  const startTime = interaction.fields.getTextInputValue('start_time');

  const capacity = parseCapacity(rawCapacity);
  if (capacity === null) {
    await interaction.reply({ content: '人數上限必須是正整數，請重新使用 /揪團 建立', ephemeral: true });
    return;
  }

  const event = createEvent(db, {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    messageId: 'pending',
    title,
    capacity,
    startTime,
    creatorId: interaction.user.id,
  });

  const embed = buildEventEmbed(event, []);
  const row = buildActionRow(event, 0);

  await interaction.reply({ embeds: [embed], components: [row] });
  const message = await interaction.fetchReply();
  updateEventMessageId(db, event.id, message.id);

  const thread = await message.startThread({ name: title.slice(0, 100) });
  updateEventThreadId(db, event.id, thread.id);
}

module.exports = { handleCreateEventModal, parseCapacity };
