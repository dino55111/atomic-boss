function createInteractionHandler({
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
}) {
  return async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (command) await command.execute(interaction, db);
      return;
    }

    if (interaction.isUserSelectMenu()) {
      const [action] = interaction.customId.split(':');
      if (action === 'assist-user-select') await handleAssistUserSelect(interaction);
      return;
    }

    if (interaction.isButton()) {
      const [action] = interaction.customId.split(':');
      if (action === 'signup') await handleSignupButton(interaction);
      if (action === 'class-choice') await handleClassChoiceButton(interaction);
      if (action === 'title-choice') await handleTitleChoiceButton(interaction);
      if (action === 'session-choice') await handleSessionChoiceButton(interaction);
      if (action === 'cancel') await handleCancelButton(interaction, db);
      if (action === 'cancel-select') await handleCancelSelectButton(interaction, db);
      if (action === 'assist') await handleAssistButton(interaction);
      if (action === 'assist-external') await handleAssistExternalButton(interaction);
      if (action === 'assist-class-choice') await handleAssistClassChoiceButton(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('create-event-modal:')) {
        await handleCreateEventModal(interaction, db);
        return;
      }
      if (interaction.customId.startsWith('join-modal:')) {
        await handleJoinModal(interaction, db);
        return;
      }
      if (interaction.customId.startsWith('assist-join-modal:')) {
        await handleAssistJoinModal(interaction, db);
      }
    }
  };
}

module.exports = { createInteractionHandler };
