// Discord API error codes for a resource that's already gone (someone
// deleted it by hand, an earlier operation got partway through before
// failing, or the scheduled cleanup already removed it). Any of these mean
// the caller's goal — the thing not being there — is already met, so
// callers should treat it as a no-op success rather than a failure.
const ALREADY_GONE_CODES = new Set([10003, 10008]); // Unknown Channel, Unknown Message

function isAlreadyGoneError(error) {
  return ALREADY_GONE_CODES.has(error.code);
}

module.exports = { ALREADY_GONE_CODES, isAlreadyGoneError };
