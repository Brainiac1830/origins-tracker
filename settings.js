// ============================================================
// settings.js — tournament settings used across the whole site.
// Change a date or a rule here and every page follows.
// ============================================================

// Deck lock switch: true = after DECK_LOCK, tournament decks can't be changed.
// false = no lock at all (e.g. playoffs, where decks can still be changed).
// (Python equivalent: DECK_LOCK_ON = False)
const DECK_LOCK_ON = false;

// "2026-10-22T09:00:00-04:00" = 22 Oct 2026, 9:00 AM, US Eastern time (UTC-4 in October)
const DECK_LOCK        = new Date("2026-10-22T09:00:00-04:00");
const TOURNAMENT_START = new Date("2026-10-22T09:00:00-04:00");

const MAX_CARDS            = 12;  // different cards per deck (each counts ×2)
const MAX_TOURNAMENT_DECKS = 3;   // decks you bring to the tournament
const MAX_SHARED_CARDS     = 4;   // two tournament decks may have at most 4 cards in common
                                  // (checked for each pair: A+B, A+C, B+C)

// true once the deck lock time has passed (and the lock is switched on)
function isDeckLocked() {
  return DECK_LOCK_ON && new Date() >= DECK_LOCK;
}
