const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { TITLE_NOTES, TITLE_EMOJIS } = require('../commands/create-event');
const { isAlreadyGoneError } = require('../discord-errors');

function buildEventEmbed(event, signups) {
  const roster = signups.length === 0
    ? '目前尚無人報名'
    : signups
        .map((s, i) => {
          const nameSegment = s.is_external ? `**${s.display_name}**` : `<@${s.user_id}>`;
          const noteSegment = s.note ? `／備註：${s.note}` : '';
          const assistSegment = s.added_by_user_id ? `／代報名：<@${s.added_by_user_id}>` : '';
          return `${i + 1}. ${nameSegment}（職業：${s.class}／等級：${s.level}／ID：${s.game_id}${noteSegment}${assistSegment}）`;
        })
        .join('\n');

  const notes = TITLE_NOTES[event.title];
  const emoji = TITLE_EMOJIS[event.title];
  const displayTitle = emoji ? `${emoji} ${event.title}` : event.title;
  const fields = [
    { name: '時間', value: event.start_time, inline: true },
    { name: '場次', value: `${event.session}場`, inline: true },
    { name: '人數', value: `${signups.length} / ${event.capacity}`, inline: true },
    { name: '開團主', value: `<@${event.creator_id}>`, inline: true },
    ...(notes ? [{ name: '注意事項', value: notes }] : []),
    { name: '名單', value: roster },
  ];

  return new EmbedBuilder()
    .setTitle(displayTitle)
    .addFields(fields)
    .setColor(signups.length >= event.capacity ? 0xe74c3c : 0x2ecc71);
}

function buildActionRow(event, signupCount) {
  const isFull = signupCount >= event.capacity;

  const signupButton = new ButtonBuilder()
    .setCustomId(`signup:${event.id}`)
    .setLabel('報名')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(isFull);

  const assistButton = new ButtonBuilder()
    .setCustomId(`assist:${event.id}`)
    .setLabel('代報名')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(isFull);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`cancel:${event.id}`)
    .setLabel('取消報名')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(signupButton, assistButton, cancelButton);
}

// The scheduled cleanup (or a human) can delete the announcement message
// while its thread survives, leaving a stale signup card behind whose
// buttons still look clickable. Fetching/editing it then 404s with Unknown
// Message (or Unknown Channel, if the whole channel is gone) — that's not a
// bug the caller needs to recover from, just nothing left to update, so it's
// swallowed here instead of aborting the signup/cancellation that triggered it.
async function updateEventAnnouncement(channel, event, signups) {
  const embed = buildEventEmbed(event, signups);
  const row = buildActionRow(event, signups.length);

  try {
    const message = await channel.messages.fetch(event.message_id);
    await message.edit({ embeds: [embed], components: [row] });
  } catch (error) {
    if (!isAlreadyGoneError(error)) {
      throw error;
    }
  }
}

module.exports = { buildEventEmbed, buildActionRow, updateEventAnnouncement };
