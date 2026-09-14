const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { TITLE_NOTES, TITLE_EMOJIS, TITLE_COLORS } = require('../commands/create-event');
const { isAlreadyGoneError } = require('../discord-errors');

const DEFAULT_COLOR = 0x2ecc71;
const FULL_COLOR = 0x7f8c8d;

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

  const isFull = signups.length >= event.capacity;
  const color = isFull ? FULL_COLOR : (TITLE_COLORS[event.title] ?? DEFAULT_COLOR);

  return new EmbedBuilder()
    .setTitle(displayTitle)
    .addFields(fields)
    .setColor(color);
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

function buildManagementRow(eventId) {
  const editTimeButton = new ButtonBuilder()
    .setCustomId(`edit-time:${eventId}`)
    .setLabel('⏰ 改時間')
    .setStyle(ButtonStyle.Secondary);

  const cancelEventButton = new ButtonBuilder()
    .setCustomId(`cancel-event:${eventId}`)
    .setLabel('🗑️ 取消揪團')
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(editTimeButton, cancelEventButton);
}

// The scheduled cleanup (or a human) can delete the announcement message
// while its thread survives, leaving a stale signup card behind whose
// buttons still look clickable. Fetching/editing it then 404s with Unknown
// Message (or Unknown Channel, if the whole channel is gone) — that's not a
// bug the caller needs to recover from, just nothing left to update, so it's
// swallowed here instead of aborting the signup/cancellation that triggered it.
async function editIfPresent(fetchAndEdit) {
  try {
    await fetchAndEdit();
  } catch (error) {
    if (!isAlreadyGoneError(error)) {
      throw error;
    }
  }
}

// The signup card's embed lives in the main-channel announcement; the event's
// thread only gets a copy of the buttons (no embed — the main channel copy
// already shows it) so they're clickable from inside the thread too (Discord
// doesn't reliably let you click the buttons on a thread's starter message
// from within the thread itself). An interaction can come from either copy,
// so which channel triggered the update is not a reliable way to find "the"
// announcement — both are always looked up by id from the client instead,
// and updated independently so one being deleted doesn't stop the other from
// staying in sync.
async function updateEventAnnouncement(client, event, signups) {
  const embed = buildEventEmbed(event, signups);
  const row = buildActionRow(event, signups.length);
  const managementRow = buildManagementRow(event.id);
  const channelPayload = { embeds: [embed], components: [row, managementRow] };
  // embeds must be passed explicitly as [] here: Discord leaves a message's
  // existing embeds untouched on edit unless the field is present.
  const threadPayload = { embeds: [], components: [row, managementRow] };

  await editIfPresent(async () => {
    const channel = await client.channels.fetch(event.channel_id);
    const message = await channel.messages.fetch(event.message_id);
    await message.edit(channelPayload);
  });

  if (event.thread_id && event.thread_message_id) {
    await editIfPresent(async () => {
      const thread = await client.channels.fetch(event.thread_id);
      const message = await thread.messages.fetch(event.thread_message_id);
      await message.edit(threadPayload);
    });
  }
}

module.exports = { buildEventEmbed, buildActionRow, buildManagementRow, updateEventAnnouncement };
