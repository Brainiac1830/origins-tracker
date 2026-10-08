// ============================================================
// deck-builder.js — the Deck Builder page.
//   Left-click a card  -> big view of the card
//   Right-click a card -> add it to the deck / remove it from the deck
//   Save               -> save as a general deck
//   Add to tournament  -> save as a tournament deck
//
// The page can also open a saved deck, using the address (URL):
//   deck-builder.html?edit=ID   -> change that deck
//   deck-builder.html?copy=ID   -> make its next version (v2, v3...)
// ============================================================

// This file is a module, so it can import from our other modules
import { watchUser } from "./firebase.js";
import { loadDecks, loadMatches, createDeck, updateDeck } from "./database.js";


// ---------- 1. THE DECK BEING BUILT ----------
// These two variables ARE the deck. Everything on screen is drawn from them.
//   deckHero  : the id of the hero, or null if there's no hero yet
//   deckCards : a list of card ids, e.g. ["bullseye", "itsy-bitsy-spider"]
let deckHero = null;
let deckCards = [];

// ---------- 2. EVERYTHING ELSE THE PAGE NEEDS TO REMEMBER ----------
let signedIn = false;
let allDecks = [];       // every saved deck (loaded after you sign in)
let allMatches = [];     // every saved match (to know which decks have been played)
let mode = "new";        // "new", "edit" or "copy"
let sourceDeck = null;   // the saved deck we're editing or copying (null for "new")

// Read ?edit=... or ?copy=... from the address bar.
// For "deck-builder.html?copy=abc", params.get("copy") gives "abc".
const params = new URLSearchParams(location.search);
const editId = params.get("edit");
const copyId = params.get("copy");


// ---------- 3. FIND THE PARTS OF THE PAGE WE NEED ----------
const heroGrid      = document.getElementById("hero-grid");
const cardGrid      = document.getElementById("card-grid");
const deckMode      = document.getElementById("deck-mode");
const deckNameInput = document.getElementById("deck-name");
const deckCounters  = document.getElementById("deck-counters");
const deckMessage   = document.getElementById("deck-message");
const deckHeroBox   = document.getElementById("deck-hero");
const deckCardsBox  = document.getElementById("deck-cards");
const saveBtn       = document.getElementById("save-btn");
const addBtn        = document.getElementById("add-btn");
const resetBtn      = document.getElementById("reset-btn");

// We remember each tile in the grid by card id, so we can change its look later
const tiles = {};


// ---------- 4. MESSAGES ----------
// Shows a short message in the deck panel, then clears it after 5 seconds.
let messageTimer = null;
function showMessage(text) {
  deckMessage.textContent = text;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(function () {
    deckMessage.textContent = "";
  }, 5000);
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
      showMessage(`You already have ${findCard(deckHero).name}. Right-click it to remove it first.`);
      return;
    }
  } else {
    // ----- Other cards: up to 12 -----
    if (deckCards.includes(card.id)) {
      deckCards = deckCards.filter(function (id) { return id !== card.id; });
    } else if (deckCards.length < MAX_CARDS) {
      deckCards.push(card.id);
    } else {
      showMessage(`Your deck is full (${MAX_CARDS} cards). Right-click a card to remove it first.`);
      return;
    }
  }
  updateScreen();
}


// ---------- 6. THE CARD GRID (left side) ----------
function createCardTile(card) {
  const tile = document.createElement("div");
  tile.className = "card-tile";

  const badgeText = card.type === "hero" ? "HERO" : "×2";
  tile.innerHTML = `
    <span class="tile-badge">${badgeText}</span>
    <img src="${card.image}" alt="${card.name}" loading="lazy">
    <span class="card-name">${card.name}</span>
  `;

  // Left-click: big view (openModal comes from modal.js)
  tile.addEventListener("click", function () {
    openModal(card);
  });

  // Right-click: add/remove
  tile.addEventListener("contextmenu", function (event) {
    event.preventDefault();   // stop the normal right-click menu
    toggleCard(card);
  });

  tiles[card.id] = tile;
  return tile;
}

const heroes = CARDS.filter(function (card) { return card.type === "hero"; });
const others = CARDS.filter(function (card) { return card.type !== "hero"; });

for (const card of sortByCost(heroes)) {
  heroGrid.appendChild(createCardTile(card));
}
for (const card of sortByCost(others)) {
  cardGrid.appendChild(createCardTile(card));
}


// ---------- 7. THE DECK PANEL (right side) ----------
function createDeckRow(card) {
  const row = document.createElement("div");
  row.className = "deck-row";

  const countText = card.type === "hero" ? "" : "×2";
  row.innerHTML = `
    <span class="deck-row-thumb" style="background-image: url('${card.image}')"></span>
    <span class="deck-row-cost">${card.cost}</span>
    <span class="deck-row-name">${card.name}</span>
    <span class="deck-row-count">${countText}</span>
  `;

  row.addEventListener("click", function () {
    openModal(card);
  });
  row.addEventListener("contextmenu", function (event) {
    event.preventDefault();
    toggleCard(card);
  });
  return row;
}

// Redraws the deck panel AND the tile highlights. Called every time the deck changes.
function updateScreen() {
  // ----- Counters -----
  const heroCount = deckHero === null ? 0 : 1;
  deckCounters.innerHTML = `
    <span class="${heroCount === 1 ? "ok" : ""}">Hero ${heroCount}/1</span>
    <span class="${deckCards.length === MAX_CARDS ? "ok" : ""}">Cards ${deckCards.length}/${MAX_CARDS}</span>
    <span class="dim">(${deckCards.length * 2}/${MAX_CARDS * 2} in play)</span>
  `;
  if (isDeckComplete({ hero: deckHero, cards: deckCards })) {
    deckCounters.innerHTML += `<div class="ok complete">✓ Deck complete</div>`;
  }

  // ----- Hero slot -----
  deckHeroBox.innerHTML = "";
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
    for (const card of sortByCost(deckCards.map(findCard))) {
      deckCardsBox.appendChild(createDeckRow(card));
    }
  }

  // ----- Tile highlights in the grid -----
  for (const card of CARDS) {
    const tile = tiles[card.id];
    let inDeck;
    let blocked;
    if (card.type === "hero") {
      inDeck  = deckHero === card.id;
      blocked = deckHero !== null && !inDeck;
    } else {
      inDeck  = deckCards.includes(card.id);
      blocked = deckCards.length >= MAX_CARDS && !inDeck;
    }
    tile.classList.toggle("in-deck", inDeck);
    tile.classList.toggle("blocked", blocked);
  }
}


// ---------- 8. BUTTONS AND MODE (new / edit / copy) ----------

// Shows the right buttons and the "Editing..." line for the current mode
function updateButtons() {
  if (mode === "edit") {
    saveBtn.textContent = "Save changes";
    addBtn.classList.add("hidden");        // in edit mode the deck keeps its category
  } else {
    saveBtn.textContent = "Save";
    addBtn.classList.remove("hidden");
  }

  // Saving needs the database, so you must be signed in
  saveBtn.disabled = !signedIn;
  addBtn.disabled  = !signedIn;
  const tip = signedIn ? "" : "Sign in (top menu) to save decks";
  saveBtn.title = tip;
  addBtn.title  = tip;

  // The line at the top of the panel
  if (mode === "edit") {
    deckMode.innerHTML = `Editing <b>${escapeHtml(deckLabel(sourceDeck))}</b>`;
    deckMode.classList.remove("hidden");
  } else if (mode === "copy") {
    const version = nextVersion(sourceDeck.familyId);
    deckMode.innerHTML = `New version of <b>${escapeHtml(sourceDeck.name)}</b>. It will be saved as <b>v${version}</b>.
      <br><span class="dim">Change the name to save it as a brand-new deck instead.</span>`;
    deckMode.classList.remove("hidden");
  } else {
    deckMode.classList.add("hidden");
  }
}

// The next version number for a family: highest existing version + 1
function nextVersion(familyId) {
  let highest = 0;
  for (const deck of allDecks) {
    if (deck.familyId === familyId && deck.version > highest) {
      highest = deck.version;
    }
  }
  return highest + 1;
}

// Finds a saved deck with this name (ignoring capitals), or undefined
function findDeckByName(name) {
  return allDecks.find(function (deck) {
    return deck.name.toLowerCase() === name.toLowerCase();
  });
}

// Fill the builder with a saved deck (for ?edit= or ?copy=)
function openSavedDeck(id, newMode) {
  const deck = allDecks.find(function (d) { return d.id === id; });
  if (!deck) {
    showMessage("That deck wasn't found. It may have been deleted.");
    return;
  }
  // A deck that has been played can't be edited directly (its results belong to
  // those exact cards), so open it as a new version instead.
  const used = allMatches.filter(function (m) { return m.deckId === deck.id; }).length;
  if (newMode === "edit" && used > 0) {
    newMode = "copy";
    showMessage(`This deck was played in ${used} match${used === 1 ? "" : "es"}, so your changes will be saved as a new version.`);
  }

  mode = newMode;
  sourceDeck = deck;
  deckHero = deck.hero;
  deckCards = [...deck.cards];          // a copy of the list, so we don't change the original
  deckNameInput.value = deck.name;

  if (mode === "edit" && deck.category === "tournament" && isDeckLocked()) {
    showMessage("Deck lock has passed: this tournament deck can't be changed. Use New version on My Decks instead.");
  }
  updateScreen();
  updateButtons();
}


// ---------- 9. SAVING ----------

// category is "general" or "tournament"
async function save(category) {
  const name = deckNameInput.value.trim();     // .trim() = Python's strip()
  const deck = { hero: deckHero, cards: deckCards };
  const complete = isDeckComplete(deck);

  // ----- Checks that apply to every save -----
  if (name === "") {
    showMessage("Give your deck a name first.");
    deckNameInput.focus();                      // put the cursor in the name box
    return;
  }
  if (deckHero === null && deckCards.length === 0) {
    showMessage("Your deck is empty. Right-click some cards first.");
    return;
  }

  const sameName = findDeckByName(name);

  try {
    // Grey out the buttons while saving, so a double-click doesn't save twice
    saveBtn.disabled = true;
    addBtn.disabled = true;

    if (mode === "edit") {
      // ----- Save changes to an existing deck -----
      if (sameName && sameName.familyId !== sourceDeck.familyId) {
        showMessage(`You already have a different deck called "${sameName.name}".`);
        return;
      }
      if (sourceDeck.category === "tournament") {
        if (isDeckLocked()) {
          showMessage("Deck lock has passed: tournament decks can't be changed.");
          return;
        }
        if (!complete) {
          showMessage("Tournament decks must be complete (1 hero + 12 cards).");
          return;
        }
      }
      await updateDeck(sourceDeck.id, { hero: deckHero, cards: deckCards });

      // If you renamed it, rename every version of this deck so they stay together
      if (name !== sourceDeck.name) {
        for (const d of allDecks) {
          if (d.familyId === sourceDeck.familyId) {
            await updateDeck(d.id, { name: name });
          }
        }
      }

    } else {
      // ----- Save a new deck (brand new, or a new version) -----
      let familyId = null;   // null = start a new family (createDeck handles it)
      let version = 1;

      if (mode === "copy" && sameName && sameName.familyId === sourceDeck.familyId) {
        // Same name as the deck we copied: it's the next version of that deck
        familyId = sourceDeck.familyId;
        version = nextVersion(familyId);
      } else if (sameName) {
        showMessage(`You already have a deck called "${sameName.name}". ` +
                    `Pick another name, or use "New version" on it in My Decks.`);
        return;
      }

      if (category === "tournament") {
        const tournamentCount = allDecks.filter(function (d) { return d.category === "tournament"; }).length;
        if (isDeckLocked()) {
          showMessage("Deck lock has passed: you can't add tournament decks any more.");
          return;
        }
        if (!complete) {
          showMessage("Tournament decks must be complete (1 hero + 12 cards).");
          return;
        }
        if (tournamentCount >= MAX_TOURNAMENT_DECKS) {
          showMessage(`You already have ${MAX_TOURNAMENT_DECKS} tournament decks. ` +
                      `Save this one as a general deck, or move one to general in My Decks.`);
          return;
        }
      }

      await createDeck({
        name: name,
        version: version,
        familyId: familyId,
        hero: deckHero,
        cards: deckCards,
        category: category
      });
    }

    // Saved! Go to My Decks to see it
    location.href = "my-decks.html";

  } catch (error) {
    showMessage("Couldn't save: " + error.message);
    console.error(error);
  } finally {
    // "finally" always runs at the end, whether it worked or not.
    // (If we moved to My Decks, this doesn't matter any more.)
    updateButtons();
  }
}

saveBtn.addEventListener("click", function () {
  // In edit mode the deck keeps its category; otherwise Save = general
  const category = mode === "edit" ? sourceDeck.category : "general";
  save(category);
});

addBtn.addEventListener("click", function () {
  save("tournament");
});


// ---------- 10. RESET BUTTON ----------
// Reset = start again with a blank, brand-new deck
resetBtn.addEventListener("click", function () {
  const hasName = deckNameInput.value.trim() !== "";
  if (deckHero === null && deckCards.length === 0 && !hasName && mode === "new") {
    return;   // nothing to reset
  }
  if (confirm("Clear the deck name and remove every card?")) {
    deckHero = null;
    deckCards = [];
    deckNameInput.value = "";
    mode = "new";
    sourceDeck = null;
    // Remove ?edit=... / ?copy=... from the address bar without reloading the page
    history.replaceState(null, "", "deck-builder.html");
    updateScreen();
    updateButtons();
  }
});


// ---------- 11. START ----------

// Opened from My Decks > Import deck code?  (deck-builder.html#import=CODE)
// Select the code's hero and cards as a new deck: you name it and save it.
if (location.hash.startsWith("#import=")) {
  const imported = decodeDeckCode(decodeURIComponent(location.hash.slice("#import=".length)));
  history.replaceState(null, "", location.pathname + location.search);   // tidy the address
  if (imported) {
    deckHero = imported.hero;
    deckCards = imported.cards.slice(0, MAX_CARDS);
    let note = "Deck imported from the game. Give it a name, then Save.";
    if (imported.unknown.length > 0) {
      note += ` ${imported.unknown.length} card(s) weren't recognised (${imported.unknown.join(", ")}): add them by hand.`;
    }
    showMessage(note);
  } else {
    showMessage("That deck code couldn't be read.");
  }
}

updateScreen();
updateButtons();

// Runs when the page opens and whenever you sign in or out
watchUser(async function (user) {
  signedIn = user !== null;

  if (signedIn) {
    try {
      [allDecks, allMatches] = await Promise.all([loadDecks(), loadMatches()]);
    } catch (error) {
      showMessage("Couldn't load your decks: " + error.message);
      console.error(error);
    }
    // Opened from My Decks? Load that deck (only once, while still in "new" mode)
    if (mode === "new" && editId) {
      openSavedDeck(editId, "edit");
    } else if (mode === "new" && copyId) {
      openSavedDeck(copyId, "copy");
    }
  } else if (editId || copyId) {
    showMessage("Sign in (top menu) to open this deck.");
  }

  updateButtons();
});
