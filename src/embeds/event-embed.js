const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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

  return new EmbedBuilder()
    .setTitle(event.title)
    .addFields(
      { name: '時間', value: event.start_time, inline: true },
      { name: '場次', value: `第${event.session}場`, inline: true },
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

module.exports = { buildEventEmbed, buildActionRow };
