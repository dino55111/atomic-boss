require('dotenv').config();
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { initDb } = require('./db/db');
const createEventCommand = require('./commands/create-event');
const { handleCreateEventModal } = require('./interactions/create-event-modal');
const { handleJoinModal } = require('./interactions/join-modal');
const { handleSignupButton, handleClassChoiceButton, handleCancelButton } = require('./interactions/signup-button');
const { createInteractionHandler } = require('./interaction-router');

const db = initDb(path.join(__dirname, '..', 'data.db'));
const commands = new Map([[createEventCommand.data.name, createEventCommand]]);

const handleInteraction = createInteractionHandler({
  commands,
  db,
  handleCreateEventModal,
  handleJoinModal,
  handleSignupButton,
  handleClassChoiceButton,
  handleCancelButton,
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, (interaction) => {
  handleInteraction(interaction).catch((error) => {
    console.error('Error handling interaction:', error);
  });
});

client.login(process.env.BOT_TOKEN);
