const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getActiveEventsByGuild, getSignups } = require('../db/db');

const data = new SlashCommandBuilder()
  .setName('list')
  .setDescription('查詢目前有哪些揪團');

function buildEventLine(event, signupCount) {
  return `**${event.title}（${event.session}場）** ${event.start_time}｜${signupCount}/${event.capacity}｜開團主：<@${event.creator_id}>｜<#${event.thread_id}>`;
}

async function execute(interaction, db) {
  const events = getActiveEventsByGuild(db, interaction.guildId);

  if (events.length === 0) {
    await interaction.reply({ content: '目前沒有進行中的揪團', ephemeral: true });
    return;
  }

  const description = events
    .map((event) => buildEventLine(event, getSignups(db, event.id).length))
    .join('\n');

  await interaction.reply({ embeds: [new EmbedBuilder().setDescription(description)], ephemeral: true });
}

module.exports = { data, execute, buildEventLine };
