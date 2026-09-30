// ============================================================
// common.js — small helper functions used on several pages.
// Load it AFTER cards.js and settings.js (it uses CARDS and MAX_CARDS).
// ============================================================

// Find a card by its id.
// If the id isn't in cards.js any more (e.g. a card was renamed), we return a
// stand-in card instead of crashing.
function findCard(id) {
  const card = CARDS.find(function (c) { return c.id === id; });
  if (card) {
    return card;
  }
  return { id: id, name: "Unknown card (" + id + ")", type: "character", cost: 99, image: "" };
}

// Returns a NEW list sorted by mana cost (cheapest first), then by name.
// Python equivalent:  sorted(cards, key=lambda c: (c["cost"], c["name"]))
function sortByCost(cards) {
  return [...cards].sort(function (a, b) {
    if (a.cost !== b.cost) {
      return a.cost - b.cost;
    }
    return a.name.localeCompare(b.name);
  });
}

// Makes text safe to put inside HTML.
// Without this, a deck name like  <b>Test  would be read as HTML code.
function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// "Dracula Discard v2"
function deckLabel(deck) {
  return deck.name + " v" + deck.version;
}

// A deck is complete when it has a hero AND 12 cards
function isDeckComplete(deck) {
  return deck.hero !== null && deck.cards.length === MAX_CARDS;
}

// ---------- Tournament rules check ----------
// Rules for the 3 tournament decks:
//   - each deck is complete (1 hero + 12 cards)
//   - each deck has a different hero
//   - each deck has at least 8 cards that are NOT in either of the other 2 decks
//
// Gives back:
//   { ready: false }                     -> there aren't 3 tournament decks yet
//   { ready: true, results: {...} }      -> one result per deck id, like:
//       results["abc123"] = {
//         valid: false,
//         problems: ["Hero Dracula is also used in Deck C."],
//         shared: { "bullseye": ["Deck C"] },   // card id -> the other decks that have it
//         uniqueCount: 9
//       }
function checkTournamentDecks(decks) {
  if (decks.length !== MAX_TOURNAMENT_DECKS) {
    return { ready: false, results: {} };
  }

  const results = {};

  for (const deck of decks) {
    // The other 2 decks
    const others = decks.filter(function (d) { return d.id !== deck.id; });
    const problems = [];

    // Rule 1: complete
    if (!isDeckComplete(deck)) {
      problems.push(`Not complete (${deck.cards.length}/${MAX_CARDS} cards${deck.hero ? "" : ", no hero"}).`);
    }

    // Rule 2: different hero
    const sameHero = others.filter(function (o) { return deck.hero !== null && o.hero === deck.hero; });
    if (sameHero.length > 0) {
      const names = sameHero.map(function (o) { return o.name; }).join(" and ");
      problems.push(`Hero ${findCard(deck.hero).name} is also used in ${names}.`);
    }

    // Rule 3: at least 8 unique cards.
    // For each card, list the other decks that also have it.
    const shared = {};
    for (const cardId of deck.cards) {
      const alsoIn = others
        .filter(function (o) { return o.cards.includes(cardId); })
        .map(function (o) { return o.name; });
      if (alsoIn.length > 0) {
        shared[cardId] = alsoIn;
      }
    }
    // Object.keys(shared) = list of the shared card ids (like Python's dict.keys())
    const sharedCount = Object.keys(shared).length;
    const uniqueCount = deck.cards.length - sharedCount;
    if (uniqueCount < MIN_UNIQUE_CARDS) {
      problems.push(`Only ${uniqueCount} unique cards: ${sharedCount} are shared with your other decks (max ${MAX_CARDS - MIN_UNIQUE_CARDS}).`);
    }

    results[deck.id] = {
      valid: problems.length === 0,
      problems: problems,
      shared: shared,
      uniqueCount: uniqueCount
    };
  }

  return { ready: true, results: results };
}

// ---------- Win rates ----------
// Counts wins, losses and ties in a list of matches.
// Win rate = wins out of ALL games (ties count as games), as a whole percentage.
// Example: winStats(matches) -> { games: 8, wins: 5, losses: 2, ties: 1, rate: 63 }
function winStats(matches) {
  const wins   = matches.filter(function (m) { return m.result === "win"; }).length;
  const losses = matches.filter(function (m) { return m.result === "loss"; }).length;
  const ties   = matches.filter(function (m) { return m.result === "tie"; }).length;
  const games  = matches.length;
  return {
    games: games,
    wins: wins,
    losses: losses,
    ties: ties,
    rate: games > 0 ? Math.round((wins / games) * 100) : 0   // Math.round = round to a whole number
  };
}

// Short date like "30 Sep, 2:30 pm"
function formatShortDate(ms) {
  return new Date(ms).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
