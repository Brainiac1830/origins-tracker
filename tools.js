// ============================================================
// tools.js — the Tools page: every location and how often it appears.
//
// The numbers come from the shared counter (stats/locations in database.js),
// which adds up the games logged by ALL players.
//   "% of games" = games this location appeared in / games with locations recorded
// Each game has 3 locations, so all the percentages add up to about 300%.
// ============================================================

import { watchUser } from "./firebase.js";
import { loadLocationStats, logLocationsOnly, unlogLocationsOnly } from "./database.js";


// ---------- 1. PAGE PARTS AND DATA ----------
const searchInput = document.getElementById("location-search");
const sortSelect  = document.getElementById("location-sort");
const poolSelect  = document.getElementById("location-pool");
const noticeBox   = document.getElementById("tournament-notice");
const countLine   = document.getElementById("tools-count");
const grid        = document.getElementById("location-grid");

let stats = null;          // the shared counter, e.g. { games: 40, "the-hill": 12 } (null = not loaded)

const quickBox     = document.getElementById("quick-log");
const quickSelects = document.getElementById("quick-log-selects");
const quickAddBtn  = document.getElementById("quick-log-add");
const quickMessage = document.getElementById("quick-log-message");
const quickLists   = [];       // the 3 drop-down lists
let lastLogged = null;         // the last locations-only game added (for Undo)


// ---------- 2. HELPERS ----------

// How many games a location appeared in
function timesSeen(loc) {
  return stats && stats[loc.id] ? stats[loc.id] : 0;
}

// Its share of games, as a whole percentage
function percentOf(loc) {
  const games = stats ? stats.games || 0 : 0;
  return games > 0 ? Math.round((timesSeen(loc) / games) * 100) : 0;
}


// ---------- 3. DRAWING ----------
function render() {
  const text = searchInput.value.trim().toLowerCase();

  // Keep locations whose name OR text contains the search,
  // and that match the "Show" choice (all / tournament pool / disabled)
  let shown = LOCATIONS.filter(function (loc) {
    const textOk = loc.name.toLowerCase().includes(text) || loc.text.toLowerCase().includes(text);
    let poolOk = true;
    if (poolSelect.value === "pool") {
      poolOk = !loc.disabledInTournament;
    } else if (poolSelect.value === "disabled") {
      poolOk = loc.disabledInTournament === true;
    }
    return textOk && poolOk;
  });

  // Sort. For "common"/"rare", locations with the same count are sorted by name.
  shown = [...shown].sort(function (a, b) {
    if (sortSelect.value === "common" && timesSeen(a) !== timesSeen(b)) {
      return timesSeen(b) - timesSeen(a);
    }
    if (sortSelect.value === "rare" && timesSeen(a) !== timesSeen(b)) {
      return timesSeen(a) - timesSeen(b);
    }
    return a.name.localeCompare(b.name);
  });

  // The line above the grid
  const games = stats ? stats.games || 0 : 0;
  let source;
  if (!stats) {
    source = "sign in to see how often each one appears";
  } else if (games === 0) {
    source = "no games with locations logged yet";
  } else {
    source = `based on ${games} game${games === 1 ? "" : "s"} logged by all players`;
  }
  countLine.textContent = `Showing ${shown.length} of ${LOCATIONS.length} locations · ${source}`;

  // The cards
  grid.innerHTML = "";
  if (shown.length === 0) {
    grid.innerHTML = `<p class="empty-slot">No location matches your search.</p>`;
    return;
  }

  for (const loc of shown) {
    const card = document.createElement("div");
    card.className = "location-card" + (loc.disabledInTournament ? " disabled-location" : "");

    // Red label for locations removed from the tournament pool
    const disabledTag = loc.disabledInTournament
      ? `<div class="disabled-tag">🚫 Disabled in tournament</div>`
      : "";

    const rarity = loc.rarity ? `<span class="tag tag-rarity">${escapeHtml(loc.rarity)}</span>` : "";
    const statsHtml = stats
      ? `
        <div class="location-stat-line">
          <span class="location-percent">${percentOf(loc)}%</span>
          <span class="dim small">of games · seen ${timesSeen(loc)}×</span>
        </div>
        <div class="rate-bar"><div class="rate-fill" style="width: ${percentOf(loc)}%"></div></div>
      `
      : "";

    card.innerHTML = `
      <div class="location-card-name">${escapeHtml(loc.name)} ${rarity}${disabledTag}</div>
      <div class="location-card-text">${escapeHtml(loc.text)}</div>
      <div class="location-card-stats">${statsHtml}</div>
    `;
    grid.appendChild(card);
  }
}

searchInput.addEventListener("input", render);
sortSelect.addEventListener("change", render);
poolSelect.addEventListener("change", render);

// ---------- 3b. TOURNAMENT NOTICE ----------
// Lists the locations marked  disabledInTournament: true  in locations.js
function renderNotice() {
  const disabled = LOCATIONS
    .filter(function (loc) { return loc.disabledInTournament; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });

  if (disabled.length === 0) {
    noticeBox.classList.add("hidden");
    return;
  }
  const names = disabled.map(function (loc) { return `<b>${escapeHtml(loc.name)}</b>`; }).join(", ");
  noticeBox.innerHTML = `
    🚫 <b>${disabled.length} locations are disabled in the Crimson Cup tournament pool:</b> ${names}.
    <span class="dim">They can still appear in demo games.</span>
  `;
}
renderNotice();


// ---------- 3c. LOG A PVE GAME (LOCATIONS ONLY) ----------
// 3 drop-down lists, like on the Add Match form. A location can only be picked once.
const sortedLocations = [...LOCATIONS].sort(function (a, b) { return a.name.localeCompare(b.name); });

for (let i = 0; i < 3; i++) {
  const select = document.createElement("select");
  select.className = "text-input";
  select.innerHTML = `<option value="">Location ${i + 1}</option>` +
    sortedLocations.map(function (loc) {
      const note = loc.disabledInTournament ? " (disabled in tournament)" : "";
      return `<option value="${loc.id}">${escapeHtml(loc.name)}${note}</option>`;
    }).join("");
  select.addEventListener("change", updateQuickOptions);
  quickSelects.appendChild(select);
  quickLists.push(select);
}

// Grey out a location in the other lists once it's picked in one
function updateQuickOptions() {
  const chosen = quickLists.map(function (s) { return s.value; });
  for (const select of quickLists) {
    for (const option of select.options) {
      option.disabled = option.value !== "" && option.value !== select.value && chosen.includes(option.value);
    }
  }
}

// Message under the box, with an optional Undo button
function showQuickMessage(html, withUndo) {
  quickMessage.innerHTML = html + (withUndo ? ` <button type="button" class="clear-filter" id="quick-undo">Undo</button>` : "");
  if (withUndo) {
    document.getElementById("quick-undo").addEventListener("click", undoQuickLog);
  }
}

function locationNames(ids) {
  return ids.map(function (id) { return LOCATIONS.find(function (l) { return l.id === id; }).name; }).join(", ");
}

quickAddBtn.addEventListener("click", async function () {
  const picked = quickLists.map(function (s) { return s.value; }).filter(function (v) { return v !== ""; });
  if (picked.length === 0) {
    showQuickMessage(`<span class="error-text">Pick at least one location first.</span>`, false);
    return;
  }
  quickAddBtn.disabled = true;
  try {
    await logLocationsOnly(picked);
    lastLogged = picked;
    for (const select of quickLists) {
      select.value = "";                // empty the lists, ready for the next game
    }
    updateQuickOptions();
    stats = await loadLocationStats();  // refresh the numbers (1 read)
    render();
    showQuickMessage(`✓ Added: ${escapeHtml(locationNames(picked))}`, true);
  } catch (error) {
    showQuickMessage(`<span class="error-text">Couldn't save: ${escapeHtml(error.message)}</span>`, false);
  } finally {
    quickAddBtn.disabled = false;
  }
});

// Take the last locations-only game back off the stats
async function undoQuickLog() {
  if (!lastLogged) {
    return;
  }
  const undone = lastLogged;
  lastLogged = null;
  try {
    await unlogLocationsOnly(undone);
    stats = await loadLocationStats();
    render();
    showQuickMessage(`↩ Removed: ${escapeHtml(locationNames(undone))}`, false);
  } catch (error) {
    lastLogged = undone;
    showQuickMessage(`<span class="error-text">Couldn't undo: ${escapeHtml(error.message)}</span>`, true);
  }
}


// ---------- 4. START ----------
render();   // show the list straight away, even before the numbers arrive

watchUser(async function (user) {
  quickBox.classList.toggle("hidden", !user);   // logging needs you to be signed in
  if (!user) {
    stats = null;
    render();
    return;
  }
  try {
    stats = await loadLocationStats();   // 1 read
  } catch (error) {
    stats = null;
    countLine.textContent = "Couldn't load the location stats: " + error.message;
    console.error(error);
    return;
  }
  render();
});
