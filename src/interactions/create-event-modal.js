const { createEvent, updateEventMessageId, updateEventThreadId } = require('../db/db');
const { buildEventEmbed, buildActionRow } = require('../embeds/event-embed');
const { TITLE_CAPACITIES } = require('../commands/create-event');

async function handleCreateEventModal(interaction, db) {
  const title = interaction.customId.split(':')[1];
  const startTime = interaction.fields.getTextInputValue('start_time');
  const capacity = TITLE_CAPACITIES[title];

  // Deleting the title-picker message this modal was launched from requires
  // claiming it via deferUpdate() first, then deleteReply(); after that,
  // every further response must go through followUp() instead of reply().
  await interaction.deferUpdate();
  await interaction.deleteReply();

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

  const message = await interaction.followUp({ embeds: [embed], components: [row] });
  updateEventMessageId(db, event.id, message.id);

  const thread = await message.startThread({ name: title.slice(0, 100) });
  updateEventThreadId(db, event.id, thread.id);
}

module.exports = { handleCreateEventModal };
