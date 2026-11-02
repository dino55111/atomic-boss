// Ephemeral prompts posted during the postcreate pre-fill flow (the initial
// "要先幫人卡位嗎" prompt, and each "要繼續加人嗎" follow-up) are only
// useful while that flow is still in progress — once the creator publishes,
// they're just clutter. Each one is tracked here by event id as it's
// created (see create-event-modal.js and assist-signup.js), then swept in
// one go once the event is published.
//
// Deleting one later requires its OWN interaction's webhook: ephemeral
// interaction-response messages aren't regular channel messages, so
// Message#delete (which hits the channel's message-delete endpoint) 404s
// against them — only `webhook.deleteMessage(id)` (the same thing
// deleteReply() uses under the hood) reaches them. That webhook's token
// stays valid for ~15 minutes, well past how long pre-filling members
// realistically takes, so there's no need to persist this anywhere else —
// an in-memory registry for this process's lifetime is enough.
const promptsByEventId = new Map();

function registerPostCreatePrompt(eventId, webhook, messageId) {
  const prompts = promptsByEventId.get(eventId) || [];
  prompts.push({ webhook, messageId });
  promptsByEventId.set(eventId, prompts);
}

async function deletePostCreatePrompts(eventId) {
  const prompts = promptsByEventId.get(eventId) || [];
  promptsByEventId.delete(eventId);

  await Promise.all(prompts.map(async ({ webhook, messageId }) => {
    try {
      await webhook.deleteMessage(messageId);
    } catch (error) {
      // Best-effort: an expired token or an already-dismissed message
      // shouldn't stop the rest from being cleaned up.
    }
  }));
}

module.exports = { registerPostCreatePrompt, deletePostCreatePrompts };
