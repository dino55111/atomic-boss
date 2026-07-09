const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function buildEventEmbed(event, signups) {
  const roster = signups.length === 0
    ? '目前尚無人報名'
    : signups
        .map((s, i) => {
          const noteSegment = s.note ? `／備註：${s.note}` : '';
          return `${i + 1}. <@${s.user_id}>（職業：${s.class}／等級：${s.level}／ID：${s.game_id}${noteSegment}）`;
        })
        .join('\n');

  return new EmbedBuilder()
    .setTitle(event.title)
    .addFields(
      { name: '時間', value: event.start_time, inline: true },
      { name: '人數', value: `${signups.length} / ${event.capacity}`, inline: true },
      { name: '名單', value: roster },
    )
    .setColor(signups.length >= event.capacity ? 0xe74c3c : 0x2ecc71);
}

function buildActionRow(event, signupCount) {
  const isFull = signupCount >= event.capacity;

  const signupButton = new ButtonBuilder()
    .setCustomId(`signup:${event.id}`)
    .setLabel('報名')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(isFull);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`cancel:${event.id}`)
    .setLabel('取消報名')
    .setStyle(ButtonStyle.Secondary);

  return new ActionRowBuilder().addComponents(signupButton, cancelButton);
}

module.exports = { buildEventEmbed, buildActionRow };
