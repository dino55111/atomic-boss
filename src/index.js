require('dotenv').config();
const path = require('path');
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { initDb } = require('./db/db');
const createEventCommand = require('./commands/create-event');
const listEventsCommand = require('./commands/list-events');
const { handleCreateEventModal, handlePostCreatePublishButton } = require('./interactions/create-event-modal');
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
  handleAssistRemoveButton,
  handleAssistRemoveSelect,
} = require('./interactions/assist-signup');
const {
  handleEditTimeButton,
  handleEditTimeModal,
  handleCancelEventButton,
  handleCancelEventConfirmButton,
  handleCancelEventAbortButton,
} = require('./interactions/manage-event');
const { createInteractionHandler } = require('./interaction-router');
const { checkAndSendReminders, REMINDER_POLL_INTERVAL_MS } = require('./reminders');
const { checkAndCleanupEvents, CLEANUP_POLL_INTERVAL_MS } = require('./cleanup');
const { createMessageCreateHandler } = require('./command-only-channel');
const { createGuildMemberAddHandler } = require('./welcome-member');
const { createVerificationMessageHandler } = require('./verification-message');

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
  handleAssistRemoveButton,
  handleAssistRemoveSelect,
  handleEditTimeButton,
  handleEditTimeModal,
  handleCancelEventButton,
  handleCancelEventConfirmButton,
  handleCancelEventAbortButton,
  handlePostCreatePublishButton,
});

// GuildMessages is only needed for the command-only-channel enforcement
// below (messageCreate); GuildMembers is needed to read a joining member's
// roles in the welcome handler below (requires the privileged "Server
// Members Intent" to be enabled for this bot in the Discord Developer
// Portal, or the client fails to log in). MessageContent is needed by the
// verification handler to read message.content — without it, Discord sends
// an empty content for guild messages that don't mention the bot (also a
// privileged intent that must be toggled on in the Developer Portal).
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});
const handleMessageCreate = createMessageCreateHandler(process.env.COMMAND_ONLY_CHANNEL_ID);
const handleGuildMemberAdd = createGuildMemberAddHandler(
  process.env.WELCOME_CHANNEL_ID,
  process.env.WELCOME_EXCLUDED_ROLE_ID,
);
const handleVerificationMessage = createVerificationMessageHandler(
  process.env.VERIFICATION_CHANNEL_ID,
  process.env.VERIFICATION_ROLE_ID,
);

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

client.on(Events.MessageCreate, (message) => {
  handleMessageCreate(message).catch((error) => {
    console.error('Error enforcing command-only channel:', error);
  });
  handleVerificationMessage(message).catch((error) => {
    console.error('Error handling verification message:', error);
  });
});

// A member can post the registration template, get it wrong, then edit it
// into shape — this catches that edit instead of forcing them to delete and
// repost just to trigger the handler.
client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
  handleVerificationMessage(newMessage).catch((error) => {
    console.error('Error handling verification message:', error);
  });
});

client.on(Events.GuildMemberAdd, (member) => {
  handleGuildMemberAdd(member).catch((error) => {
    console.error('Error sending welcome message:', error);
  });
});

client.login(process.env.BOT_TOKEN);
