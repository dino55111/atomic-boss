function createInteractionHandler({
  commands,
  db,
  handleCreateEventModal,
  handleJoinModal,
  handleSignupButton,
  handleClassChoiceButton,
  handleCancelButton,
}) {
  return async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      const [action] = interaction.customId.split(':');
      if (action === 'signup') await handleSignupButton(interaction);
      if (action === 'class-choice') await handleClassChoiceButton(interaction);
      if (action === 'cancel') await handleCancelButton(interaction, db);
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'create-event-modal') {
        await handleCreateEventModal(interaction, db);
        return;
      }
      if (interaction.customId.startsWith('join-modal:')) {
        await handleJoinModal(interaction, db);
      }
    }
  };
}

module.exports = { createInteractionHandler };
