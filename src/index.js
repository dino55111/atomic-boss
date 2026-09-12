require('dotenv').config();
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { initDb } = require('./db/db');
const createEventCommand = require('./commands/create-event');
const listEventsCommand = require('./commands/list-events');
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
const { checkAndCleanupEvents, CLEANUP_POLL_INTERVAL_MS } = require('./cleanup');

// DB_PATH lets a deployment point the SQLite file at a mounted persistent
// volume (e.g. Fly.io's /data) instead of the repo-relative default used
// for local development.
const db = initDb(process.env.DB_PATH || path.join(__dirname, '..', 'data.db'));
const commands = new Map([
  [createEventCommand.data.name, createEventCommand],
  [listEventsCommand.data.name, listEventsCommand],
]);

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

let reminderPollInFlight = false;
let cleanupPollInFlight = false;

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  setInterval(() => {
    if (reminderPollInFlight) return;
    reminderPollInFlight = true;
    checkAndSendReminders(client, db)
      .catch((error) => {
        console.error('Error checking event reminders:', error);
      })
      .finally(() => {
        reminderPollInFlight = false;
      });
  }, REMINDER_POLL_INTERVAL_MS);
  setInterval(() => {
    if (cleanupPollInFlight) return;
    cleanupPollInFlight = true;
    checkAndCleanupEvents(client, db)
      .catch((error) => {
        console.error('Error cleaning up finished events:', error);
      })
      .finally(() => {
        cleanupPollInFlight = false;
      });
  }, CLEANUP_POLL_INTERVAL_MS);
});

client.on(Events.InteractionCreate, (interaction) => {
  handleInteraction(interaction).catch((error) => {
    console.error('Error handling interaction:', error);
  });
});

client.login(process.env.BOT_TOKEN);
