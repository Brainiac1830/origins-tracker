// ============================================================
// match-history.js — the Match History page.
// Shows every match (newest first) as a coloured row:
//   green = win, red = loss, grey = tie
// with a player search, a hero filter, and Edit / Delete buttons.
// Click a row to see the locations and the cards they played.
// ============================================================

import { watchUser } from "./firebase.js";
import { loadMatches, deleteMatch } from "./database.js";


// ---------- 1. PAGE PARTS AND DATA ----------
const pageStatus    = document.getElementById("page-status");
const playerSearch  = document.getElementById("player-search");
const heroFilterBtn = document.getElementById("hero-filter-btn");
const heroPanel     = document.getElementById("hero-filter-panel");
const summaryBox    = document.getElementById("history-summary");
const listBox       = document.getElementById("history-list");

let allMatches = [];
let heroFilter = "all";          // "all" or a hero id

const RESULT_WORDS = { win: "Win", loss: "Loss", tie: "Tie" };
const DIFFICULTY_WORDS = { easy: "Easy", medium: "Medium", hard: "Hard" };


// ---------- 2. HERO FILTER (button + panel) ----------
const heroes = CARDS
  .filter(function (c) { return c.type === "hero"; })
  .sort(function (a, b) { return a.name.localeCompare(b.name); });

// The panel: "All heroes" first, then one picture button per hero
function buildHeroPanel() {
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "hero-option hero-option-all";
  allBtn.textContent = "All heroes";
  allBtn.addEventListener("click", function () { chooseHero("all"); });
  heroPanel.appendChild(allBtn);

  for (const hero of heroes) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hero-option";
    btn.title = hero.name;
    btn.innerHTML = `
      <span class="hero-option-art" style="background-image: url('${hero.image}')"></span>
      <span class="hero-option-name">${hero.name}</span>
    `;
    btn.addEventListener("click", function () { chooseHero(hero.id); });
    heroPanel.appendChild(btn);
  }
}

function chooseHero(heroId) {
  heroFilter = heroId;
  if (heroId === "all") {
    heroFilterBtn.innerHTML = "All heroes ▾";
  } else {
    const hero = findCard(heroId);
    heroFilterBtn.innerHTML = `
      <span class="hero-filter-art" style="background-image: url('${hero.image}')"></span>
      ${hero.name} ▾`;
  }
  heroFilterBtn.classList.toggle("filtering", heroId !== "all");
  heroPanel.classList.add("hidden");
  render();
}

// Open / close the panel
heroFilterBtn.addEventListener("click", function () {
  heroPanel.classList.toggle("hidden");
});

// Clicking anywhere outside the filter closes the panel.
// .closest(".hero-filter") finds the filter box around what was clicked (or null if outside).
document.addEventListener("click", function (event) {
  if (!event.target.closest(".hero-filter")) {
    heroPanel.classList.add("hidden");
  }
});


// ---------- 3. FILTERING AND THE SUMMARY ----------

// The matches that pass the search box and the hero filter, newest first
function filteredMatches() {
  const text = playerSearch.value.trim().toLowerCase();
  return allMatches
    .filter(function (m) {
      const playerOk = m.opponent.toLowerCase().includes(text);
      const heroOk = heroFilter === "all" || m.enemyHero === heroFilter;
      return playerOk && heroOk;
    })
    .sort(function (a, b) { return b.playedAt - a.playedAt; });   // biggest time (newest) first
}

// "12 matches · 7W 4L 1T · 58% win rate"
function renderSummary(matches) {
  if (allMatches.length === 0) {
    summaryBox.innerHTML = "";
    return;
  }
  const wins   = matches.filter(function (m) { return m.result === "win"; }).length;
  const losses = matches.filter(function (m) { return m.result === "loss"; }).length;
  const ties   = matches.filter(function (m) { return m.result === "tie"; }).length;
  // Win rate = wins out of all games shown (ties count as games). Math.round rounds to a whole number.
  const rate = matches.length > 0 ? Math.round((wins / matches.length) * 100) : 0;

  const filtered = matches.length !== allMatches.length;
  summaryBox.innerHTML = `
    <b>${matches.length}</b> match${matches.length === 1 ? "" : "es"}${filtered ? ` <span class="dim">(of ${allMatches.length})</span>` : ""}
    · <span class="w">${wins}W</span> <span class="l">${losses}L</span> <span class="t">${ties}T</span>
    · <b>${rate}%</b> win rate
  `;
}


// ---------- 4. DRAWING THE LIST ----------

function render() {
  const matches = filteredMatches();
  renderSummary(matches);
  listBox.innerHTML = "";

  if (allMatches.length === 0) {
    listBox.innerHTML = `<p class="empty-slot">No matches yet. <a class="text-link" href="add-match.html">Add your first match</a>.</p>`;
    return;
  }
  if (matches.length === 0) {
    listBox.innerHTML = `<p class="empty-slot">No matches for this search.</p>`;
    return;
  }

  for (const match of matches) {
    listBox.appendChild(createRow(match));
  }
}

// Short date like "30 Sep, 2:30 pm"
function formatDate(ms) {
  return new Date(ms).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function createRow(match) {
  const row = document.createElement("div");
  row.className = "match-row result-" + match.result;     // result-win / result-loss / result-tie

  const myHero = findCard(match.deckHero);
  const enemyHero = findCard(match.enemyHero);

  row.innerHTML = `
    <div class="match-main">
      <span class="match-result">${RESULT_WORDS[match.result]}</span>
      <span class="match-deck" title="My deck">
        <span class="row-thumb" style="background-image: url('${myHero.image}')"></span>
        <span>${escapeHtml(match.deckName)} <span class="version">v${match.deckVersion}</span></span>
      </span>
      <span class="match-vs">vs</span>
      <span class="match-enemy">
        <span class="row-thumb" style="background-image: url('${enemyHero.image}')" title="${enemyHero.name}"></span>
        <span>
          <span class="match-opponent">${escapeHtml(match.opponent)}</span>
          <span class="dim small">${enemyHero.name}</span>
        </span>
      </span>
      <span class="match-difficulty diff-${match.difficulty}">${DIFFICULTY_WORDS[match.difficulty]}</span>
      <span class="match-date dim small">${formatDate(match.playedAt)}</span>
      <span class="match-buttons">
        <button class="btn btn-small btn-outline" data-action="edit">Edit</button>
        <button class="btn btn-small btn-danger" data-action="delete">Delete</button>
      </span>
    </div>
    <div class="match-details hidden"></div>
  `;

  // ----- Details (hidden until you click the row) -----
  const details = row.querySelector(".match-details");
  const locationNames = match.locations.map(function (id) {
    const loc = LOCATIONS.find(function (l) { return l.id === id; });
    return loc ? `<span class="location-tag" title="${escapeHtml(loc.text)}">${escapeHtml(loc.name)}</span>` : "";
  }).join("");

  details.innerHTML = `
    <div class="details-line"><span class="details-label">Locations</span>
      ${locationNames || `<span class="dim small">Not recorded</span>`}</div>
    <div class="details-line"><span class="details-label">Cards they played</span>
      <span class="details-cards">${match.enemyCards.length === 0 ? `<span class="dim small">Not recorded</span>` : ""}</span></div>
  `;
  const cardsBox = details.querySelector(".details-cards");
  for (const card of sortByCost(match.enemyCards.map(findCard))) {
    const thumb = document.createElement("span");
    thumb.className = "mini-thumb details-thumb";
    thumb.style.backgroundImage = `url('${card.image}')`;
    thumb.title = card.name;
    thumb.addEventListener("click", function () { openModal(card); });
    cardsBox.appendChild(thumb);
  }

  // Click the row to show/hide details (but not when clicking a button or a card)
  row.querySelector(".match-main").addEventListener("click", function (event) {
    if (event.target.closest("button")) {
      return;
    }
    details.classList.toggle("hidden");
    row.classList.toggle("open");
  });

  // ----- Buttons -----
  row.querySelector('[data-action="edit"]').addEventListener("click", function () {
    location.href = "add-match.html?edit=" + match.id;
  });

  row.querySelector('[data-action="delete"]').addEventListener("click", async function () {
    if (!confirm(`Delete this match (${RESULT_WORDS[match.result]} vs ${match.opponent}, ${formatDate(match.playedAt)})? This can't be undone.`)) {
      return;
    }
    try {
      await deleteMatch(match.id);
      // Remove it from our list and redraw (no need to download everything again)
      allMatches = allMatches.filter(function (m) { return m.id !== match.id; });
      render();
    } catch (error) {
      alert("Couldn't delete the match: " + error.message);
    }
  });

  return row;
}


// ---------- 5. START ----------
buildHeroPanel();
playerSearch.addEventListener("input", render);   // filter on every key you type

watchUser(async function (user) {
  if (!user) {
    allMatches = [];
    listBox.innerHTML = "";
    summaryBox.innerHTML = "";
    pageStatus.textContent = "Sign in (top menu) to see your matches.";
    return;
  }
  pageStatus.textContent = "Loading your matches...";
  try {
    allMatches = await loadMatches();
    pageStatus.textContent = "";
    render();
  } catch (error) {
    pageStatus.textContent = "Couldn't load your matches: " + error.message;
    console.error(error);
  }
});
