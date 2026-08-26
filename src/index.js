require('dotenv').config();
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { initDb } = require('./db/db');
const createEventCommand = require('./commands/create-event');
const { handleCreateEventModal } = require('./interactions/create-event-modal');
const { handleJoinModal } = require('./interactions/join-modal');
const {
  handleSignupButton,
  handleClassChoiceButton,
  handleCancelButton,
  handleCancelSelectButton,
} = require('./interactions/signup-button');
const { handleTitleChoiceButton, handleSessionChoiceButton } = require('./interactions/title-choice-button');
const {
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
  handleAssistJoinModal,
} = require('./interactions/assist-signup');
const { createInteractionHandler } = require('./interaction-router');
const { checkAndSendReminders, REMINDER_POLL_INTERVAL_MS } = require('./reminders');

const db = initDb(path.join(__dirname, '..', 'data.db'));
const commands = new Map([[createEventCommand.data.name, createEventCommand]]);

const handleInteraction = createInteractionHandler({
  commands,
  db,
  handleCreateEventModal,
  handleJoinModal,
  handleSignupButton,
  handleClassChoiceButton,
  handleTitleChoiceButton,
  handleSessionChoiceButton,
  handleCancelButton,
  handleCancelSelectButton,
  handleAssistButton,
  handleAssistUserSelect,
  handleAssistExternalButton,
  handleAssistClassChoiceButton,
  handleAssistJoinModal,
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  setInterval(() => {
    checkAndSendReminders(client, db).catch((error) => {
      console.error('Error checking event reminders:', error);
    });
  }, REMINDER_POLL_INTERVAL_MS);
});

client.on(Events.InteractionCreate, (interaction) => {
  handleInteraction(interaction).catch((error) => {
    console.error('Error handling interaction:', error);
  });
});

client.login(process.env.BOT_TOKEN);
