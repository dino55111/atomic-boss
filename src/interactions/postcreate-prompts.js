// Ephemeral prompts posted during the postcreate pre-fill flow (the initial
// "要先幫人卡位嗎" prompt, and each "要繼續加人嗎" follow-up) are only
// useful while that flow is still in progress — once the creator publishes,
// they're just clutter. Discord has no way to delete another interaction's
// ephemeral message without that interaction's own token/webhook, so each
// one is tracked here by event id as it's created (see create-event-modal.js
// and assist-signup.js), then swept in one go once the event is published.
// This process stays up for the whole pre-fill flow — a few minutes at
// most, well inside Discord's ~15 minute token lifetime — so there's no
// need to persist this anywhere else.
const promptsByEventId = new Map();

function registerPostCreatePrompt(eventId, message) {
  const prompts = promptsByEventId.get(eventId) || [];
  prompts.push(message);
  promptsByEventId.set(eventId, prompts);
}

async function deletePostCreatePrompts(eventId) {
  const prompts = promptsByEventId.get(eventId) || [];
  promptsByEventId.delete(eventId);

  await Promise.all(prompts.map(async (message) => {
    try {
      await message.delete();
    } catch (error) {
      // Best-effort: an expired token or an already-dismissed message
      // shouldn't stop the rest from being cleaned up.
    }
  }));
}

module.exports = { registerPostCreatePrompt, deletePostCreatePrompts };
