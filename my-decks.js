// ============================================================
// my-decks.js — the My Decks page.
// Shows tournament decks (top) and general decks (below), with buttons to
// edit, make a new version, move between tournament/general, archive and delete.
// Archived decks are hidden until you click "Show archived".
// ============================================================

import { watchUser } from "./firebase.js";
import { loadDecks, loadMatches, updateDeck, deleteDeck } from "./database.js";


// ---------- 1. PAGE PARTS AND DATA ----------
const pageStatus      = document.getElementById("page-status");
const lockNotice      = document.getElementById("lock-notice");
const tournamentCount = document.getElementById("tournament-count");
const verifyStatus    = document.getElementById("verify-status");
const tournamentList  = document.getElementById("tournament-decks");
const generalList     = document.getElementById("general-decks");
const archiveToggle   = document.getElementById("archive-toggle");
const archivedSection = document.getElementById("archived-section");
const archivedList    = document.getElementById("archived-decks");

let allDecks = [];   // every saved deck
let allMatches = []; // every saved match (to know which decks have been played)
let showArchived = false;   // is the "Archived decks" section open?


// ---------- 2. LOAD AND DRAW ----------

// Load the decks from the database, then draw them
async function refresh() {
  pageStatus.textContent = "Loading your decks...";
  try {
    // Load decks and matches at the same time (Promise.all waits for both)
    [allDecks, allMatches] = await Promise.all([loadDecks(), loadMatches()]);
    pageStatus.textContent = "";
    render();
  } catch (error) {
    pageStatus.textContent = "Couldn't load your decks: " + error.message;
    console.error(error);
  }
}

// How many saved matches were played with this exact deck version?
function matchCount(deckId) {
  return allMatches.filter(function (m) { return m.deckId === deckId; }).length;
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
  // General decks are split in two: normal ones, and archived ones (archived: true)
  const general    = sortDecks(allDecks.filter(function (d) { return d.category !== "tournament" && !d.archived; }));
  const archived   = sortDecks(allDecks.filter(function (d) { return d.category !== "tournament" && d.archived; }));

  tournamentCount.textContent = `(${tournament.length}/${MAX_TOURNAMENT_DECKS})`;
  lockNotice.classList.toggle("hidden", !isDeckLocked());

  // ----- Check the tournament rules (checkTournamentDecks is in common.js) -----
  const check = checkTournamentDecks(tournament);
  showVerifyStatus(check, tournament.length);

  // ----- Tournament decks -----
  tournamentList.innerHTML = "";
  if (tournament.length === 0) {
    tournamentList.innerHTML = `<p class="empty-slot">No tournament decks yet. Use "Add to tournament" in the Deck Builder, or "Move to tournament" below.</p>`;
  }
  for (const deck of tournament) {
    tournamentList.appendChild(createDeckTile(deck, check));
  }

  // ----- General decks -----
  generalList.innerHTML = "";
  if (general.length === 0) {
    generalList.innerHTML = `<p class="empty-slot">No general decks yet.</p>`;
  }
  for (const deck of general) {
    generalList.appendChild(createDeckTile(deck, null));   // null = no rules check for general decks
  }

  // ----- Archived decks (only drawn when the section is open) -----
  archiveToggle.textContent = showArchived ? `Hide archived (${archived.length})` : `Show archived (${archived.length})`;
  archiveToggle.classList.toggle("active", showArchived);
  archivedSection.classList.toggle("hidden", !showArchived);
  archivedList.innerHTML = "";
  if (showArchived) {
    if (archived.length === 0) {
      archivedList.innerHTML = `<p class="empty-slot">No archived decks. Use "Archive" on a general deck to hide it here.</p>`;
    }
    for (const deck of archived) {
      archivedList.appendChild(createDeckTile(deck, null));
    }
  }
}

// Open / close the archived section (no database reads: the decks are already loaded)
archiveToggle.addEventListener("click", function () {
  showArchived = !showArchived;
  render();
});

// The message above the tournament decks
function showVerifyStatus(check, count) {
  verifyStatus.classList.remove("hidden", "status-grey", "status-ok", "status-bad");

  if (count === 0) {
    verifyStatus.classList.add("hidden");   // the "no tournament decks yet" box is enough
    return;
  }

  if (!check.ready) {
    verifyStatus.classList.add("status-grey");
    verifyStatus.innerHTML = `Add ${MAX_TOURNAMENT_DECKS} decks to verify decks <span class="dim">(${count}/${MAX_TOURNAMENT_DECKS})</span>`;
    return;
  }

  // Object.values(...) = the list of results (like Python's dict.values())
  const invalidCount = Object.values(check.results).filter(function (r) { return !r.valid; }).length;
  if (invalidCount === 0) {
    verifyStatus.classList.add("status-ok");
    verifyStatus.textContent = `✓ All ${MAX_TOURNAMENT_DECKS} tournament decks are valid`;
  } else {
    verifyStatus.classList.add("status-bad");
    verifyStatus.innerHTML = `✗ ${invalidCount} of ${MAX_TOURNAMENT_DECKS} decks need changes.
      <span class="dim">Cards with a red dot are shared with another tournament deck.</span>`;
  }
}


// ---------- 3. ONE DECK TILE ----------
// "check" is the result of checkTournamentDecks (or null for general decks)
function createDeckTile(deck, check) {
  const tile = document.createElement("div");
  tile.className = "deck-tile";

  const isTournament = deck.category === "tournament";
  const isArchived   = !isTournament && deck.archived === true;
  if (isArchived) {
    tile.classList.add("deck-archived");
  }

  // This deck's own result, if the rules were checked
  const result = check && check.ready ? check.results[deck.id] : null;

  // ----- Border colour (tournament decks only) -----
  //   grey  = fewer than 3 tournament decks, can't check yet
  //   green = passes every rule
  //   red   = breaks at least one rule
  if (isTournament) {
    if (!result) {
      tile.classList.add("deck-unchecked");
    } else if (result.valid) {
      tile.classList.add("deck-valid");
    } else {
      tile.classList.add("deck-invalid");
    }
  }

  // ----- The line under the name: "✓ Valid" or the list of problems -----
  let checkHtml = "";
  if (result && result.valid) {
    checkHtml = `<div class="deck-check ok">✓ Valid · ${result.uniqueCount} unique cards</div>`;
  } else if (result) {
    // One line per problem. escapeHtml because problems contain deck names you typed.
    const lines = result.problems.map(function (p) { return `<li>${escapeHtml(p)}</li>`; }).join("");
    checkHtml = `<ul class="deck-check bad">${lines}</ul>`;
  }
  const locked = isTournament && isDeckLocked();   // locked tournament decks can't change
  const hero = deck.hero ? findCard(deck.hero) : null;

  const heroThumb = hero
    ? `<span class="deck-tile-hero" style="background-image: url('${hero.image}')" title="${hero.name}"></span>`
    : `<span class="deck-tile-hero no-hero">?</span>`;

  // Win rate of this exact version (winStats is in common.js)
  const used = matchCount(deck.id);
  const stats = winStats(allMatches.filter(function (m) { return m.deckId === deck.id; }));
  const usedText = used === 0
    ? "Not played yet"
    : `<b class="rate-text">${stats.rate}% win rate</b> · ${stats.wins}W ${stats.losses}L ${stats.ties}T (${stats.games} game${stats.games === 1 ? "" : "s"})`;

  const incompleteTag = isDeckComplete(deck) ? "" : `<span class="tag tag-warning">Incomplete</span>`;
  const archivedTag   = isArchived ? `<span class="tag tag-archived">Archived</span>` : "";

  // Archived decks get "Unarchive" instead of "Move to tournament".
  // Normal general decks get an extra "Archive" button. Tournament decks can't be archived
  // (move them to general first).
  let middleButtons;
  if (isArchived) {
    middleButtons = `<button class="btn btn-small btn-outline" data-action="unarchive">Unarchive</button>`;
  } else if (isTournament) {
    middleButtons = `<button class="btn btn-small btn-outline" data-action="move">Move to general</button>`;
  } else {
    middleButtons = `<button class="btn btn-small btn-outline" data-action="move">Move to tournament</button>
      <button class="btn btn-small btn-outline" data-action="archive">Archive</button>`;
  }

  tile.innerHTML = `
    <div class="deck-tile-top">
      ${heroThumb}
      <div>
        <div class="deck-tile-name">${escapeHtml(deck.name)} <span class="version">v${deck.version}</span> ${archivedTag}</div>
        <div class="dim small">${hero ? hero.name : "No hero"} · ${deck.cards.length}/${MAX_CARDS} cards ${incompleteTag}</div>
      </div>
    </div>
    ${checkHtml}
    <div class="deck-tile-cards"></div>
    <div class="dim small">${usedText}</div>
    <div class="deck-tile-buttons">
      <button class="btn btn-small" data-action="edit">Edit</button>
      <button class="btn btn-small" data-action="copy">New version</button>
      ${middleButtons}
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

    // Shared with another tournament deck? Add a red dot and say where.
    if (result && result.shared[card.id]) {
      thumb.classList.add("shared");
      thumb.title = `${card.name} (also in ${result.shared[card.id].join(" and ")})`;
    }
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
  const archiveBtn   = tile.querySelector('[data-action="archive"]');     // null if this tile has none
  const unarchiveBtn = tile.querySelector('[data-action="unarchive"]');   // null if this tile has none

  // After deck lock: tournament decks can't be edited, moved or deleted,
  // and no general deck can be moved INTO the tournament either.
  // ("New version" always works: it makes a new general deck.)
  const lockedButtons = locked ? [editBtn, moveBtn, deleteBtn] : (isDeckLocked() ? [moveBtn] : []);
  for (const btn of lockedButtons) {
    if (!btn) {
      continue;      // archived tiles have no Move button
    }
    btn.disabled = true;
    btn.title = "Deck lock has passed";
  }

  // A deck that has been played can't be edited: its results belong to those exact cards.
  // To change it, make a New version instead (it gets its own results).
  if (used > 0 && !editBtn.disabled) {
    editBtn.disabled = true;
    editBtn.title = "Already played: use New version to change it";
  }

  editBtn.addEventListener("click", function () {
    location.href = "deck-builder.html?edit=" + deck.id;
  });

  copyBtn.addEventListener("click", function () {
    location.href = "deck-builder.html?copy=" + deck.id;
  });

  if (moveBtn) {
    moveBtn.addEventListener("click", function () {
      if (isTournament) {
        moveDeck(deck, "general");
      } else {
        moveDeck(deck, "tournament");
      }
    });
  }

  if (archiveBtn) {
    archiveBtn.addEventListener("click", function () {
      setArchived(deck, true);
    });
  }
  if (unarchiveBtn) {
    unarchiveBtn.addEventListener("click", function () {
      setArchived(deck, false);
    });
  }

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

function isDeckArchivable(deck) {
  return deck.category !== "tournament";
}

// Archive (hide) or unarchive (show again) a general deck.
// Nothing is deleted: its cards, matches and win rate are all kept.
async function setArchived(deck, archived) {
  try {
    await updateDeck(deck.id, { archived: archived });
    await refresh();
  } catch (error) {
    alert("Couldn't change the deck: " + error.message);
  }
}

async function removeDeck(deck) {
  const used = matchCount(deck.id);
  const warning = used > 0
    ? `\n\nIt was played in ${used} match${used === 1 ? "" : "es"}. Those matches will be kept, but won't count toward any deck's win rate.`
    : "";
  const tip = isDeckArchivable(deck) && !deck.archived ? `\n\nTip: "Archive" hides a deck without deleting it.` : "";
  if (!confirm(`Delete "${deckLabel(deck)}"? This can't be undone.${warning}${tip}`)) {
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
    archivedList.innerHTML = "";
    tournamentCount.textContent = "";
    pageStatus.textContent = "Sign in (top menu) to see your decks.";
  }
});


// ---------- IMPORT A DECK CODE (from the game's Share button) ----------
// The code is checked here, then the Deck Builder opens with the cards selected,
// so you can name the deck and save it.
const importToggle  = document.getElementById("import-toggle");
const importBox     = document.getElementById("import-box");
const importCode    = document.getElementById("import-code");
const importGo      = document.getElementById("import-go");
const importMessage = document.getElementById("import-message");

importToggle.addEventListener("click", function () {
  importBox.classList.toggle("hidden");
  if (!importBox.classList.contains("hidden")) {
    importCode.focus();
  }
});

function importDeckCode() {
  const code = importCode.value.trim();
  const deck = decodeDeckCode(code);
  importMessage.className = "import-message error";
  if (!deck) {
    importMessage.textContent = "That doesn't look like a deck code. Copy it again from Share in the game.";
    return;
  }
  if (!deck.hero && deck.cards.length === 0) {
    importMessage.textContent = "None of the cards in this code were recognised.";
    return;
  }
  // encodeURIComponent makes the code safe to put in a web address
  location.href = "deck-builder.html#import=" + encodeURIComponent(code);
}

importGo.addEventListener("click", importDeckCode);
importCode.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    importDeckCode();
  }
});
