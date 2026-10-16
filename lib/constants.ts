// Technical anti-abuse guardrail: every connected account has access to
// everything, but is still capped at a generous daily message count to stop
// runaway/looping usage. No tier notion — this applies uniformly.
export const ABUSE_DAILY_LIMIT = 500;
