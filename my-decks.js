// ============================================================
// my-decks.js — the My Decks page.
// Shows tournament decks (top) and general decks (below), with buttons to
// edit, make a new version, move between tournament/general, and delete.
// ============================================================

import { watchUser } from "./firebase.js";
import { loadDecks, updateDeck, deleteDeck } from "./database.js";


// ---------- 1. PAGE PARTS AND DATA ----------
const pageStatus      = document.getElementById("page-status");
const lockNotice      = document.getElementById("lock-notice");
const tournamentCount = document.getElementById("tournament-count");
const tournamentList  = document.getElementById("tournament-decks");
const generalList     = document.getElementById("general-decks");

let allDecks = [];   // every saved deck


// ---------- 2. LOAD AND DRAW ----------

// Load the decks from the database, then draw them
async function refresh() {
  pageStatus.textContent = "Loading your decks...";
  try {
    allDecks = await loadDecks();
    pageStatus.textContent = "";
    render();
  } catch (error) {
    pageStatus.textContent = "Couldn't load your decks: " + error.message;
    console.error(error);
  }
}

// Sort decks by name, and newest version first within the same name
function sortDecks(decks) {
  return [...decks].sort(function (a, b) {
    if (a.name !== b.name) {
      return a.name.localeCompare(b.name);
    }
    return b.version - a.version;
  });
}

function render() {
  const tournament = sortDecks(allDecks.filter(function (d) { return d.category === "tournament"; }));
  const general    = sortDecks(allDecks.filter(function (d) { return d.category !== "tournament"; }));

  tournamentCount.textContent = `(${tournament.length}/${MAX_TOURNAMENT_DECKS})`;
  lockNotice.classList.toggle("hidden", !isDeckLocked());

  // ----- Tournament decks -----
  tournamentList.innerHTML = "";
  if (tournament.length === 0) {
    tournamentList.innerHTML = `<p class="empty-slot">No tournament decks yet. Use "Add to tournament" in the Deck Builder, or "Move to tournament" below.</p>`;
  }
  for (const deck of tournament) {
    tournamentList.appendChild(createDeckTile(deck));
  }

  // ----- General decks -----
  generalList.innerHTML = "";
  if (general.length === 0) {
    generalList.innerHTML = `<p class="empty-slot">No general decks yet.</p>`;
  }
  for (const deck of general) {
    generalList.appendChild(createDeckTile(deck));
  }
}


// ---------- 3. ONE DECK TILE ----------
function createDeckTile(deck) {
  const tile = document.createElement("div");
  tile.className = "deck-tile";

  const isTournament = deck.category === "tournament";
  const locked = isTournament && isDeckLocked();   // locked tournament decks can't change
  const hero = deck.hero ? findCard(deck.hero) : null;

  const heroThumb = hero
    ? `<span class="deck-tile-hero" style="background-image: url('${hero.image}')" title="${hero.name}"></span>`
    : `<span class="deck-tile-hero no-hero">?</span>`;

  const incompleteTag = isDeckComplete(deck) ? "" : `<span class="tag tag-warning">Incomplete</span>`;

  tile.innerHTML = `
    <div class="deck-tile-top">
      ${heroThumb}
      <div>
        <div class="deck-tile-name">${escapeHtml(deck.name)} <span class="version">v${deck.version}</span></div>
        <div class="dim small">${hero ? hero.name : "No hero"} · ${deck.cards.length}/${MAX_CARDS} cards ${incompleteTag}</div>
      </div>
    </div>
    <div class="deck-tile-cards"></div>
    <div class="dim small">Win rate: no matches yet</div>
    <div class="deck-tile-buttons">
      <button class="btn btn-small" data-action="edit">Edit</button>
      <button class="btn btn-small" data-action="copy">New version</button>
      <button class="btn btn-small btn-outline" data-action="move">${isTournament ? "Move to general" : "Move to tournament"}</button>
      <button class="btn btn-small btn-danger" data-action="delete">Delete</button>
    </div>
  `;

  // ----- The 12 small card pictures (click one to see it big) -----
  const cardsBox = tile.querySelector(".deck-tile-cards");
  for (const card of sortByCost(deck.cards.map(findCard))) {
    const thumb = document.createElement("span");
    thumb.className = "mini-thumb";
    thumb.style.backgroundImage = `url('${card.image}')`;
    thumb.title = card.name;          // name shows when you hover
    thumb.addEventListener("click", function () {
      openModal(card);
    });
    cardsBox.appendChild(thumb);
  }

  // ----- Buttons -----
  // querySelector('[data-action="edit"]') finds the button with that data-action
  const editBtn   = tile.querySelector('[data-action="edit"]');
  const copyBtn   = tile.querySelector('[data-action="copy"]');
  const moveBtn   = tile.querySelector('[data-action="move"]');
  const deleteBtn = tile.querySelector('[data-action="delete"]');

  // After deck lock: tournament decks can't be edited, moved or deleted,
  // and no general deck can be moved INTO the tournament either.
  // ("New version" always works: it makes a new general deck.)
  const lockedButtons = locked ? [editBtn, moveBtn, deleteBtn] : (isDeckLocked() ? [moveBtn] : []);
  for (const btn of lockedButtons) {
    btn.disabled = true;
    btn.title = "Deck lock has passed";
  }

  editBtn.addEventListener("click", function () {
    location.href = "deck-builder.html?edit=" + deck.id;
  });

  copyBtn.addEventListener("click", function () {
    location.href = "deck-builder.html?copy=" + deck.id;
  });

  moveBtn.addEventListener("click", function () {
    if (isTournament) {
      moveDeck(deck, "general");
    } else {
      moveDeck(deck, "tournament");
    }
  });

  deleteBtn.addEventListener("click", function () {
    removeDeck(deck);
  });

  return tile;
}


// ---------- 4. ACTIONS ----------

// Promote to tournament / demote to general. The deck itself is kept.
async function moveDeck(deck, newCategory) {
  if (isDeckLocked()) {
    alert("Deck lock has passed: tournament decks can't be changed.");
    return;
  }
  if (newCategory === "tournament") {
    const count = allDecks.filter(function (d) { return d.category === "tournament"; }).length;
    if (count >= MAX_TOURNAMENT_DECKS) {
      alert(`You already have ${MAX_TOURNAMENT_DECKS} tournament decks. Move one to general first.`);
      return;
    }
    if (!isDeckComplete(deck)) {
      alert("Only complete decks (1 hero + 12 cards) can be tournament decks.");
      return;
    }
  }
  try {
    await updateDeck(deck.id, { category: newCategory });
    await refresh();
  } catch (error) {
    alert("Couldn't move the deck: " + error.message);
  }
}

async function removeDeck(deck) {
  if (!confirm(`Delete "${deckLabel(deck)}"? This can't be undone.`)) {
    return;
  }
  try {
    await deleteDeck(deck.id);
    await refresh();
  } catch (error) {
    alert("Couldn't delete the deck: " + error.message);
  }
}


// ---------- 5. START ----------
watchUser(function (user) {
  if (user) {
    refresh();
  } else {
    allDecks = [];
    tournamentList.innerHTML = "";
    generalList.innerHTML = "";
    tournamentCount.textContent = "";
    pageStatus.textContent = "Sign in (top menu) to see your decks.";
  }
});
