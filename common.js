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
