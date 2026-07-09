const { createEvent, updateEventMessageId, updateEventThreadId } = require('../db/db');
const { buildEventEmbed, buildActionRow } = require('../embeds/event-embed');
const { TITLE_CAPACITIES } = require('../commands/create-event');

const START_TIME_PATTERN = /^(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/;

function isValidStartTime(rawStartTime) {
  const match = START_TIME_PATTERN.exec(rawStartTime);
  if (!match) {
    return false;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const hour = Number(match[3]);
  const minute = Number(match[4]);

  return month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

async function handleCreateEventModal(interaction, db) {
  const title = interaction.customId.split(':')[1];
  const startTime = interaction.fields.getTextInputValue('start_time');
  const capacity = TITLE_CAPACITIES[title];

  // Deleting the title-picker message this modal was launched from requires
  // claiming it via deferUpdate() first, then deleteReply(); after that,
  // every further response must go through followUp() instead of reply().
  await interaction.deferUpdate();
  await interaction.deleteReply();

  if (!isValidStartTime(startTime)) {
    await interaction.followUp({
      content: '時間格式錯誤，請用「月/日 時:分」的格式重新使用 /揪團 建立，例如 7/12 20:00',
      ephemeral: true,
    });
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

  const message = await interaction.followUp({ embeds: [embed], components: [row] });
  updateEventMessageId(db, event.id, message.id);

  const thread = await message.startThread({ name: title.slice(0, 100) });
  updateEventThreadId(db, event.id, thread.id);
}

module.exports = { handleCreateEventModal, isValidStartTime };
