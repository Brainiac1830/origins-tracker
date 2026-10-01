// ============================================================
// add-match.js — the Add Match page (and Edit Match).
//   add-match.html            -> log a new match
//   add-match.html?edit=ID    -> change a saved match
// ============================================================

import { watchUser } from "./firebase.js";
import { loadDecks, loadMatches, createMatch, updateMatch } from "./database.js";


// ---------- 1. SETTINGS AND PAGE DATA ----------
const LOCATION_COUNT = 3;       // locations per game
const MAX_ENEMY_CARDS = 12;     // an opponent's deck has 12 different cards

let allDecks = [];              // your saved decks
let allMatches = [];            // your saved matches
let editingMatch = null;        // the match being edited (null when adding a new one)
let pickedCards = [];           // ids of the cards you selected as "they played"
let costFilter = "all";         // which mana cost button is active

const editId = new URLSearchParams(location.search).get("edit");


// ---------- 2. FIND THE PARTS OF THE PAGE ----------
const pageStatus      = document.getElementById("page-status");
const deckChoices     = document.getElementById("deck-choices");
const opponentInput   = document.getElementById("opponent");
const pastOpponents   = document.getElementById("past-opponents");
const heroChoices     = document.getElementById("hero-choices");
const locationBox     = document.getElementById("location-selects");
const pickedBox       = document.getElementById("picked-cards");
const cardSearch      = document.getElementById("card-search");
const costFilterBox   = document.getElementById("cost-filter");
const pickGrid        = document.getElementById("pick-grid");
const saveBtn         = document.getElementById("save-match");
const saveMessage     = document.getElementById("save-message");
const cancelEdit      = document.getElementById("cancel-edit");

const pickTiles = {};           // card id -> its small picture in the grid
const locationSelects = [];     // the 3 drop-down lists


// ---------- 3. SMALL HELPERS ----------

// Which radio button is picked in a group? Gives its value, or null if none.
// 'input[name="result"]:checked' means "the input named result that is checked"
function checkedValue(groupName) {
  const picked = document.querySelector(`input[name="${groupName}"]:checked`);
  return picked ? picked.value : null;
}

// Pick the radio button with this value in a group (or un-pick all if value is null)
function setChecked(groupName, value) {
  for (const input of document.querySelectorAll(`input[name="${groupName}"]`)) {
    input.checked = input.value === value;
  }
}

// Message in the save bar. type is "ok" (green) or "error" (red).
let messageTimer = null;
function showSaveMessage(text, type) {
  saveMessage.textContent = text;
  saveMessage.className = "save-message " + type;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(function () {
    saveMessage.textContent = "";
  }, 6000);
}


// ---------- 4. ENEMY HERO CHOICES ----------
// One radio button per hero, shown as its artwork with the name underneath.
const heroes = CARDS
  .filter(function (c) { return c.type === "hero"; })
  .sort(function (a, b) { return a.name.localeCompare(b.name); });

for (const hero of heroes) {
  const label = document.createElement("label");
  label.className = "hero-choice";
  label.title = hero.name;
  label.innerHTML = `
    <input type="radio" name="enemy-hero" value="${hero.id}">
    <span class="hero-choice-box">
      <span class="hero-choice-art" style="background-image: url('${hero.image}')"></span>
      <span class="hero-choice-name">${hero.name}</span>
    </span>
  `;
  heroChoices.appendChild(label);
}


// ---------- 5. LOCATIONS: 3 DROP-DOWN LISTS ----------
const sortedLocations = [...LOCATIONS].sort(function (a, b) { return a.name.localeCompare(b.name); });

for (let i = 0; i < LOCATION_COUNT; i++) {
  const wrap = document.createElement("div");
  wrap.className = "location-pick";

  // A <select> is a drop-down list; each <option> is one choice
  const select = document.createElement("select");
  select.className = "text-input";
  select.innerHTML = `<option value="">Location ${i + 1}: unknown</option>` +
    sortedLocations.map(function (loc) {
      // Locations removed from the tournament pool are marked, since they can still appear in demo games
      const note = loc.disabledInTournament ? " (disabled in tournament)" : "";
      return `<option value="${loc.id}">${escapeHtml(loc.name)}${note}</option>`;
    }).join("");

  // Under each list: what the chosen location does
  const text = document.createElement("p");
  text.className = "location-text";

  select.addEventListener("change", updateLocationOptions);

  wrap.appendChild(select);
  wrap.appendChild(text);
  locationBox.appendChild(wrap);
  locationSelects.push(select);
}

// A location can only be picked once per match: grey it out in the other 2 lists.
// Also shows what each chosen location does.
function updateLocationOptions() {
  const chosen = locationSelects.map(function (s) { return s.value; });

  for (const select of locationSelects) {
    for (const option of select.options) {
      option.disabled = option.value !== "" && option.value !== select.value && chosen.includes(option.value);
    }
    const loc = LOCATIONS.find(function (l) { return l.id === select.value; });
    select.nextElementSibling.textContent = loc ? loc.text : "";   // the <p> right after the list
  }
}


// ---------- 6. CARDS THEY PLAYED: THE PICKER ----------
const pickableCards = sortByCost(CARDS.filter(function (c) { return c.type !== "hero"; }));

// Mana cost filter buttons: All, 0, 1, 2, ...
// new Set(...) removes duplicates (like Python's set()), then we sort the numbers.
const costs = [...new Set(pickableCards.map(function (c) { return c.cost; }))].sort(function (a, b) { return a - b; });

for (const value of ["all", ...costs]) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cost-btn" + (value === "all" ? " active" : "");
  btn.textContent = value === "all" ? "All" : value;
  btn.addEventListener("click", function () {
    costFilter = value;
    for (const b of costFilterBox.children) {
      b.classList.toggle("active", b === btn);
    }
    applyCardFilter();
  });
  costFilterBox.appendChild(btn);
}

// One small picture per card
for (const card of pickableCards) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "pick-thumb";
  tile.title = card.name;                               // name shows when you hover
  tile.style.backgroundImage = `url('${card.image}')`;
  tile.innerHTML = `<span class="pick-cost">${card.cost}</span>`;

  tile.addEventListener("click", function () {          // click: select / unselect
    togglePick(card);
  });
  tile.addEventListener("contextmenu", function (event) { // right-click: big view
    event.preventDefault();
    openModal(card);
  });

  pickTiles[card.id] = tile;
  pickGrid.appendChild(tile);
}

// A message shown when the search finds nothing
const noMatch = document.createElement("p");
noMatch.className = "empty-slot hidden";
noMatch.textContent = "No card matches your search.";
pickGrid.after(noMatch);

// Show only the cards matching the search box AND the cost button
function applyCardFilter() {
  const text = cardSearch.value.trim().toLowerCase();
  let shown = 0;

  for (const card of pickableCards) {
    const nameOk = card.name.toLowerCase().includes(text);
    const costOk = costFilter === "all" || card.cost === costFilter;
    const visible = nameOk && costOk;
    pickTiles[card.id].classList.toggle("hidden", !visible);
    if (visible) {
      shown++;                                          // same as shown += 1
    }
  }
  noMatch.classList.toggle("hidden", shown > 0);
}

// "input" fires on every key you type in the search box
cardSearch.addEventListener("input", applyCardFilter);

function togglePick(card) {
  if (pickedCards.includes(card.id)) {
    pickedCards = pickedCards.filter(function (id) { return id !== card.id; });
  } else if (pickedCards.length < MAX_ENEMY_CARDS) {
    pickedCards.push(card.id);
  } else {
    showSaveMessage(`That's already ${MAX_ENEMY_CARDS} cards, the size of a whole deck.`, "error");
    return;
  }
  renderPicked();
}

// Draws the selected cards as name tags, and highlights them in the grid
function renderPicked() {
  pickedBox.innerHTML = "";

  const title = document.createElement("span");
  title.className = "picked-title";
  title.textContent = pickedCards.length === 0
    ? "No cards selected yet"
    : `Selected (${pickedCards.length}/${MAX_ENEMY_CARDS}):`;
  pickedBox.appendChild(title);

  for (const card of sortByCost(pickedCards.map(findCard))) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "picked-chip";
    chip.title = "Click to remove";
    chip.textContent = `${card.name} ✕`;
    chip.addEventListener("click", function () {
      togglePick(card);
    });
    pickedBox.appendChild(chip);
  }

  for (const card of pickableCards) {
    pickTiles[card.id].classList.toggle("picked", pickedCards.includes(card.id));
  }
}


// ---------- 7. MY DECK CHOICES (needs your saved decks) ----------
function renderDeckChoices() {
  deckChoices.innerHTML = "";

  // Only complete decks can be played. Tournament decks first, then by name, newest version first.
  const playable = allDecks
    .filter(isDeckComplete)
    .sort(function (a, b) {
      if (a.category !== b.category) {
        return a.category === "tournament" ? -1 : 1;
      }
      if (a.name !== b.name) {
        return a.name.localeCompare(b.name);
      }
      return b.version - a.version;
    });

  // Editing a match whose deck was deleted since? Offer it anyway, using the copy stored in the match.
  if (editingMatch && !playable.some(function (d) { return d.id === editingMatch.deckId; })) {
    playable.push({
      id: editingMatch.deckId, name: editingMatch.deckName + " (deleted)",
      version: editingMatch.deckVersion, hero: editingMatch.deckHero, category: "general"
    });
  }

  if (playable.length === 0) {
    deckChoices.innerHTML = `<p class="empty-slot">No complete decks yet. <a class="text-link" href="deck-builder.html">Build one first</a>.</p>`;
    return;
  }

  for (const deck of playable) {
    const hero = findCard(deck.hero);
    const tag = deck.category === "tournament" ? `<span class="tag tag-tournament">Tournament</span>` : "";
    const label = document.createElement("label");
    label.className = "choice";
    label.innerHTML = `
      <input type="radio" name="deck" value="${deck.id}">
      <span class="choice-box">
        <span class="choice-art" style="background-image: url('${hero.image}')"></span>
        <span>
          <span class="choice-name">${escapeHtml(deck.name)} <span class="version">v${deck.version}</span></span>
          <span class="dim small">${hero.name} ${tag}</span>
        </span>
      </span>
    `;
    deckChoices.appendChild(label);
  }
}

// Suggestions for the opponent box: every name you've played before
function renderPastOpponents() {
  const names = {};
  for (const match of allMatches) {
    names[match.opponent.toLowerCase()] = match.opponent;   // one entry per name, ignoring capitals
  }
  pastOpponents.innerHTML = Object.values(names)
    .sort(function (a, b) { return a.localeCompare(b); })
    .map(function (name) { return `<option value="${escapeHtml(name)}"></option>`; })
    .join("");
}


// ---------- 8. EDIT MODE: FILL THE FORM WITH A SAVED MATCH ----------
function fillForm(match) {
  setChecked("deck", match.deckId);
  opponentInput.value = match.opponent;
  setChecked("enemy-hero", match.enemyHero);
  setChecked("result", match.result);
  setChecked("difficulty", match.difficulty);

  for (let i = 0; i < LOCATION_COUNT; i++) {
    locationSelects[i].value = match.locations[i] || "";
  }
  updateLocationOptions();

  pickedCards = [...match.enemyCards];
  renderPicked();
}

// Empties the form for the next match. Your deck stays selected,
// since you usually play several games in a row with the same deck.
function resetForm() {
  opponentInput.value = "";
  setChecked("enemy-hero", null);
  setChecked("result", null);
  setChecked("difficulty", null);
  for (const select of locationSelects) {
    select.value = "";
  }
  updateLocationOptions();
  pickedCards = [];
  renderPicked();
  cardSearch.value = "";
  applyCardFilter();
  opponentInput.focus();          // cursor ready in the opponent box
}


// ---------- 9. SAVING ----------
async function saveMatch() {
  const deckId     = checkedValue("deck");
  const opponent   = opponentInput.value.trim();
  const enemyHero  = checkedValue("enemy-hero");
  const result     = checkedValue("result");
  const difficulty = checkedValue("difficulty");

  // ----- Check the required parts; outline any missing section in red -----
  const required = [
    ["section-deck", "your deck", deckId],
    ["section-opponent", "opponent", opponent],
    ["section-hero", "enemy hero", enemyHero],
    ["section-result", "result", result],
    ["section-difficulty", "difficulty", difficulty]
  ];
  const missing = [];
  // [sectionId, label, value] "unpacks" each small list, like Python's  for a, b, c in ...
  for (const [sectionId, label, value] of required) {
    const isMissing = !value;         // null or "" counts as missing
    document.getElementById(sectionId).classList.toggle("missing", isMissing);
    if (isMissing) {
      missing.push(label);
    }
  }
  if (missing.length > 0) {
    showSaveMessage("Please fill in: " + missing.join(", "), "error");
    return;
  }

  // ----- Build the match -----
  // Copy the deck's name, version and hero into the match (see database.js)
  let deck = allDecks.find(function (d) { return d.id === deckId; });
  if (!deck && editingMatch) {
    deck = { name: editingMatch.deckName, version: editingMatch.deckVersion, hero: editingMatch.deckHero };
  }

  const match = {
    deckId: deckId,
    deckName: deck.name,
    deckVersion: deck.version,
    deckHero: deck.hero,
    opponent: opponent,
    enemyHero: enemyHero,
    result: result,
    difficulty: difficulty,
    locations: locationSelects.map(function (s) { return s.value; }).filter(function (v) { return v !== ""; }),
    enemyCards: [...pickedCards]
  };

  saveBtn.disabled = true;
  try {
    if (editingMatch) {
      await updateMatch(editingMatch.id, match, editingMatch);   // the old version fixes the location counts
      location.href = "match-history.html";       // back to the list
      return;
    }

    match.playedAt = Date.now();                   // when you played = now
    await createMatch(match);

    // Remember the deck for next time you open this page (only in this browser)
    try { localStorage.setItem("last-deck", deckId); } catch (e) { /* not important */ }

    allMatches.push(match);                        // so the name suggestions include this opponent
    renderPastOpponents();

    const resultWord = { win: "Win", loss: "Loss", tie: "Tie" }[result];
    showSaveMessage(`✓ Saved: ${resultWord} vs ${opponent}`, "ok");
    resetForm();
  } catch (error) {
    showSaveMessage("Couldn't save: " + error.message, "error");
    console.error(error);
  } finally {
    saveBtn.disabled = false;
  }
}

saveBtn.addEventListener("click", saveMatch);

// Picking something in a red (missing) section removes the red outline straight away
document.addEventListener("change", function (event) {
  const section = event.target.closest(".form-section");   // the section this input is in
  if (section) {
    section.classList.remove("missing");
  }
});
opponentInput.addEventListener("input", function () {
  document.getElementById("section-opponent").classList.remove("missing");
});


// ---------- 10. START ----------
updateLocationOptions();
renderPicked();

watchUser(async function (user) {
  if (!user) {
    pageStatus.textContent = "Sign in (top menu) to add matches.";
    saveBtn.disabled = true;
    deckChoices.innerHTML = "";
    return;
  }

  pageStatus.textContent = "Loading your decks...";
  saveBtn.disabled = true;
  try {
    // Load decks and matches at the same time (Promise.all waits for both)
    [allDecks, allMatches] = await Promise.all([loadDecks(), loadMatches()]);
  } catch (error) {
    pageStatus.textContent = "Couldn't load your data: " + error.message;
    console.error(error);
    return;
  }
  pageStatus.textContent = "";

  if (editId) {
    editingMatch = allMatches.find(function (m) { return m.id === editId; }) || null;
    if (!editingMatch) {
      pageStatus.textContent = "That match wasn't found. It may have been deleted.";
    }
  }

  renderDeckChoices();
  renderPastOpponents();

  if (editingMatch) {
    const when = new Date(editingMatch.playedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    pageStatus.innerHTML = `Editing match vs <b>${escapeHtml(editingMatch.opponent)}</b> (${when})`;
    saveBtn.textContent = "Save changes";
    cancelEdit.classList.remove("hidden");
    fillForm(editingMatch);
  } else {
    // Pre-select the deck you used last time
    let lastDeck = null;
    try { lastDeck = localStorage.getItem("last-deck"); } catch (e) { /* not important */ }
    if (lastDeck) {
      setChecked("deck", lastDeck);
    }
  }

  saveBtn.disabled = false;
});
