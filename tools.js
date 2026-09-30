// ============================================================
// tools.js — the Tools page: every location and how often it appears.
//
// The numbers come from the shared counter (stats/locations in database.js),
// which adds up the games logged by ALL players.
//   "% of games" = games this location appeared in / games with locations recorded
// Each game has 3 locations, so all the percentages add up to about 300%.
// ============================================================

import { watchUser } from "./firebase.js";
import { loadLocationStats } from "./database.js";


// ---------- 1. PAGE PARTS AND DATA ----------
const searchInput = document.getElementById("location-search");
const sortSelect  = document.getElementById("location-sort");
const countLine   = document.getElementById("tools-count");
const grid        = document.getElementById("location-grid");

let stats = null;          // the shared counter, e.g. { games: 40, "the-hill": 12 } (null = not loaded)


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

  // Keep locations whose name OR text contains the search
  let shown = LOCATIONS.filter(function (loc) {
    return loc.name.toLowerCase().includes(text) || loc.text.toLowerCase().includes(text);
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
    card.className = "location-card";

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
      <div class="location-card-name">${escapeHtml(loc.name)} ${rarity}</div>
      <div class="location-card-text">${escapeHtml(loc.text)}</div>
      <div class="location-card-stats">${statsHtml}</div>
    `;
    grid.appendChild(card);
  }
}

searchInput.addEventListener("input", render);
sortSelect.addEventListener("change", render);


// ---------- 4. START ----------
render();   // show the list straight away, even before the numbers arrive

watchUser(async function (user) {
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
