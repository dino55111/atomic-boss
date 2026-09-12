const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getActiveEventsByGuild, getSignups } = require('../db/db');

const data = new SlashCommandBuilder()
  .setName('list')
  .setDescription('查詢目前有哪些揪團');

// Ephemeral, so only the caller sees it — this just tidies it up after
// they've had time to read it, well within Discord's 15-minute interaction
// token lifetime that deleteReply() needs.
const LIST_REPLY_TTL_MS = 5 * 60 * 1000;

function buildEventLine(event, signupCount) {
  return `**${event.title}（${event.session}場）** ${event.start_time}｜${signupCount}/${event.capacity}｜開團主：<@${event.creator_id}>｜<#${event.thread_id}>`;
}

async function execute(interaction, db) {
  const events = getActiveEventsByGuild(db, interaction.guildId);

  if (events.length === 0) {
    await interaction.reply({ content: '目前沒有進行中的揪團', ephemeral: true });
  } else {
    const description = events
      .map((event) => buildEventLine(event, getSignups(db, event.id).length))
      .join('\n');

    await interaction.reply({ embeds: [new EmbedBuilder().setDescription(description)], ephemeral: true });
  }

  // unref() so this pending timer never keeps the process (or a test
  // runner) alive on its own.
  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, LIST_REPLY_TTL_MS).unref();
}

module.exports = { data, execute, buildEventLine, LIST_REPLY_TTL_MS };
