// ============================================================
// settings.js — tournament settings used across the whole site.
// Change a date or a rule here and every page follows.
// ============================================================

// "2026-10-22T09:00:00-04:00" = 22 Oct 2026, 9:00 AM, US Eastern time (UTC-4 in October)
const DECK_LOCK        = new Date("2026-10-22T09:00:00-04:00");
const TOURNAMENT_START = new Date("2026-10-22T09:00:00-04:00");

const MAX_CARDS            = 12;  // different cards per deck (each counts ×2)
const MAX_TOURNAMENT_DECKS = 3;   // decks you bring to the tournament

// true once the deck lock time has passed
function isDeckLocked() {
  return new Date() >= DECK_LOCK;
}
