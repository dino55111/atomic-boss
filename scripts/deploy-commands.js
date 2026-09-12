require('dotenv').config();
const { REST, Routes } = require('discord.js');
const createEventCommand = require('../src/commands/create-event');
const listEventsCommand = require('../src/commands/list-events');

const commands = [createEventCommand.data.toJSON(), listEventsCommand.data.toJSON()];

const rest = new REST().setToken(process.env.BOT_TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands },
  );
  console.log('Slash commands registered.');
})();
