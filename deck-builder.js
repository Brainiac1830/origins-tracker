// ============================================================
// deck-builder.js — the Deck Builder page.
//   Left-click a card  -> big view of the card
//   Right-click a card -> add it to the deck / remove it from the deck
// ============================================================


// ---------- 1. SETTINGS ----------
const MAX_CARDS = 12;   // 12 different cards (each one counts twice = 24)


// ---------- 2. THE DECK ----------
// These two variables ARE the deck. Everything on screen is drawn from them.
//   deckHero  : the id of the hero, or null if there's no hero yet
//               (null in JavaScript = None in Python)
//   deckCards : a list of card ids, e.g. ["bullseye", "itsy-bitsy-spider"]
// "let" (instead of "const") means the value is allowed to change later.
let deckHero = null;
let deckCards = [];


// ---------- 3. FIND THE PARTS OF THE PAGE WE NEED ----------
const heroGrid      = document.getElementById("hero-grid");
const cardGrid      = document.getElementById("card-grid");
const deckCounters  = document.getElementById("deck-counters");
const deckMessage   = document.getElementById("deck-message");
const deckHeroBox   = document.getElementById("deck-hero");
const deckCardsBox  = document.getElementById("deck-cards");
const resetBtn      = document.getElementById("reset-btn");
const modal         = document.getElementById("card-modal");
const modalImage    = document.getElementById("modal-image");
const closeBtn      = document.getElementById("modal-close");

// We remember each tile in the grid by card id, so we can change its look
// later (green border when it's in the deck). Python equivalent: tiles = {}
const tiles = {};


// ---------- 4. SMALL HELPERS ----------

// Find a card in the CARDS list by its id.
// Python equivalent:  next(c for c in CARDS if c["id"] == id)
function findCard(id) {
  return CARDS.find(function (card) { return card.id === id; });
}

// Returns a NEW list sorted by mana cost (cheapest first), then by name.
// Python equivalent:  sorted(cards, key=lambda c: (c["cost"], c["name"]))
function sortByCost(cards) {
  return [...cards].sort(function (a, b) {
    if (a.cost !== b.cost) {
      return a.cost - b.cost;              // cheaper card first
    }
    return a.name.localeCompare(b.name);   // same cost: alphabetical
  });
}

// Shows a short message in the deck panel, then clears it after 3 seconds.
let messageTimer = null;
function showMessage(text) {
  deckMessage.textContent = text;
  clearTimeout(messageTimer);                       // cancel the previous timer, if any
  messageTimer = setTimeout(function () {
    deckMessage.textContent = "";
  }, 3000);                                         // 3000 ms = 3 seconds
}


// ---------- 5. ADD / REMOVE A CARD (the right-click rules) ----------

function toggleCard(card) {
  if (card.type === "hero") {
    // ----- Heroes: only 1 allowed -----
    if (deckHero === card.id) {
      deckHero = null;                               // it's our hero: remove it
    } else if (deckHero === null) {
      deckHero = card.id;                            // no hero yet: add it
    } else {
      // We already have a different hero: do nothing, just explain why
      showMessage(`You already have ${findCard(deckHero).name}. Right-click it to remove it first.`);
      return;                                        // stop here
    }
  } else {
    // ----- Other cards: up to 12 -----
    if (deckCards.includes(card.id)) {
      // Already in the deck: remove it.
      // filter() keeps every id EXCEPT this one.
      // Python equivalent:  deck_cards = [i for i in deck_cards if i != card["id"]]
      deckCards = deckCards.filter(function (id) { return id !== card.id; });
    } else if (deckCards.length < MAX_CARDS) {
      deckCards.push(card.id);                       // room left: add it (push = Python's append)
    } else {
      // Deck is full: do nothing, just explain why
      showMessage(`Your deck is full (${MAX_CARDS} cards). Right-click a card to remove it first.`);
      return;
    }
  }

  updateScreen();   // redraw everything to match the new deck
}


// ---------- 6. THE CARD GRID (left side) ----------

// Creates the tile for one card: picture, name, and a hidden badge.
function createCardTile(card) {
  const tile = document.createElement("div");
  tile.className = "card-tile";

  const badgeText = card.type === "hero" ? "HERO" : "×2";
  // ( condition ? A : B ) is a short if/else.
  // Python equivalent:  "HERO" if card["type"] == "hero" else "×2"

  tile.innerHTML = `
    <span class="tile-badge">${badgeText}</span>
    <img src="${card.image}" alt="${card.name}" loading="lazy">
    <span class="card-name">${card.name}</span>
  `;

  // Left-click: open the big view
  tile.addEventListener("click", function () {
    openModal(card);
  });

  // Right-click: add/remove. "contextmenu" is the browser's name for right-click.
  tile.addEventListener("contextmenu", function (event) {
    event.preventDefault();   // stop the normal browser right-click menu from opening
    toggleCard(card);
  });

  tiles[card.id] = tile;      // remember this tile for later
  return tile;
}

// Put every card in the grid (this only runs once, when the page opens)
const heroes = CARDS.filter(function (card) { return card.type === "hero"; });
const others = CARDS.filter(function (card) { return card.type !== "hero"; });

for (const card of sortByCost(heroes)) {
  heroGrid.appendChild(createCardTile(card));
}
for (const card of sortByCost(others)) {
  cardGrid.appendChild(createCardTile(card));
}


// ---------- 7. THE DECK PANEL (right side) ----------

// Creates one row in the deck list: small picture, cost, name, ×2.
function createDeckRow(card) {
  const row = document.createElement("div");
  row.className = "deck-row";

  const countText = card.type === "hero" ? "" : "×2";
  // The small picture is a background image, so CSS can zoom in on the artwork
  row.innerHTML = `
    <span class="deck-row-thumb" style="background-image: url('${card.image}')"></span>
    <span class="deck-row-cost">${card.cost}</span>
    <span class="deck-row-name">${card.name}</span>
    <span class="deck-row-count">${countText}</span>
  `;

  // Same controls as in the grid: left-click = view, right-click = remove
  row.addEventListener("click", function () {
    openModal(card);
  });
  row.addEventListener("contextmenu", function (event) {
    event.preventDefault();
    toggleCard(card);
  });

  return row;
}

// Redraws the deck panel AND the tile highlights, based on deckHero and deckCards.
// We call this every time the deck changes.
function updateScreen() {
  // ----- Counters -----
  const heroCount = deckHero === null ? 0 : 1;
  const deckIsComplete = heroCount === 1 && deckCards.length === MAX_CARDS;

  deckCounters.innerHTML = `
    <span class="${heroCount === 1 ? "ok" : ""}">Hero ${heroCount}/1</span>
    <span class="${deckCards.length === MAX_CARDS ? "ok" : ""}">Cards ${deckCards.length}/${MAX_CARDS}</span>
    <span class="dim">(${deckCards.length * 2}/${MAX_CARDS * 2} in play)</span>
  `;
  if (deckIsComplete) {
    deckCounters.innerHTML += `<div class="ok complete">✓ Deck complete</div>`;
  }

  // ----- Hero slot -----
  deckHeroBox.innerHTML = "";   // empty it first, then refill
  if (deckHero === null) {
    deckHeroBox.innerHTML = `<p class="empty-slot">Right-click a hero to add it</p>`;
  } else {
    deckHeroBox.appendChild(createDeckRow(findCard(deckHero)));
  }

  // ----- Card list (sorted by cost) -----
  deckCardsBox.innerHTML = "";
  if (deckCards.length === 0) {
    deckCardsBox.innerHTML = `<p class="empty-slot">Right-click cards to add them</p>`;
  } else {
    // map() turns the list of ids into a list of card objects.
    // Python equivalent:  [find_card(i) for i in deck_cards]
    const cardsInDeck = deckCards.map(findCard);
    for (const card of sortByCost(cardsInDeck)) {
      deckCardsBox.appendChild(createDeckRow(card));
    }
  }

  // ----- Tile highlights in the grid -----
  // classList.toggle("name", true/false) adds the class if true, removes it if false.
  for (const card of CARDS) {
    const tile = tiles[card.id];
    let inDeck;
    let blocked;   // true = can't be added right now (slot is full)

    if (card.type === "hero") {
      inDeck  = deckHero === card.id;
      blocked = deckHero !== null && !inDeck;
    } else {
      inDeck  = deckCards.includes(card.id);
      blocked = deckCards.length >= MAX_CARDS && !inDeck;
    }

    tile.classList.toggle("in-deck", inDeck);   // green border + badge
    tile.classList.toggle("blocked", blocked);  // faded
  }
}


// ---------- 8. RESET BUTTON ----------
resetBtn.addEventListener("click", function () {
  // If the deck is already empty, there's nothing to reset
  if (deckHero === null && deckCards.length === 0) {
    return;
  }
  // Ask first, so one wrong click doesn't wipe your work.
  // confirm() shows an OK/Cancel box and gives back true (OK) or false (Cancel).
  if (confirm("Remove every card from this deck?")) {
    deckHero = null;
    deckCards = [];
    updateScreen();
  }
});


// ---------- 9. THE BIG CARD VIEW (MODAL) ----------

function openModal(card) {
  modalImage.src = card.image;
  modalImage.alt = card.name;
  modal.classList.remove("hidden");   // removing "hidden" makes it appear
}

function closeModal() {
  modal.classList.add("hidden");      // adding "hidden" makes it disappear
}

// Close when clicking the X
closeBtn.addEventListener("click", closeModal);

// Close when clicking OUTSIDE the card (on the dark background itself)
modal.addEventListener("click", function (event) {
  if (event.target === modal) {
    closeModal();
  }
});

// Close with the Escape key
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    closeModal();
  }
});


// ---------- 10. START ----------
// Draw the empty deck panel when the page first opens
updateScreen();
