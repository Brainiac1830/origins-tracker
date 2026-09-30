// ============================================================
// home.js — the dashboard on the Home page.
//   Overview:          games played, record, win rate, last 10 form
//   Tournament decks:  each deck's win rate and rules check
//   Last 10 games:     the most recent matches
// ============================================================

import { watchUser } from "./firebase.js";
import { loadDecks, loadMatches } from "./database.js";


// ---------- 1. PAGE PARTS ----------
const pageStatus  = document.getElementById("page-status");
const overviewBox = document.getElementById("overview");
const decksBox    = document.getElementById("dash-decks");
const recentBox   = document.getElementById("recent-games");

const RESULT_WORDS = { win: "Win", loss: "Loss", tie: "Tie" };
const RESULT_LETTERS = { win: "W", loss: "L", tie: "T" };
const DIFFICULTY_WORDS = { easy: "Easy", medium: "Medium", hard: "Hard" };


// ---------- 2. OVERVIEW TILES ----------
function renderOverview(matches) {
  const all = winStats(matches);

  // Newest first, keep the first 10
  const recent = [...matches].sort(function (a, b) { return b.playedAt - a.playedAt; }).slice(0, 10);
  const last10 = winStats(recent);

  // One coloured dot per recent game, oldest on the left so it reads like a timeline
  const dots = [...recent].reverse().map(function (m) {
    return `<span class="form-dot dot-${m.result}" title="${RESULT_WORDS[m.result]} vs ${escapeHtml(m.opponent)}">${RESULT_LETTERS[m.result]}</span>`;
  }).join("");

  overviewBox.innerHTML = `
    <div class="stat-tile">
      <span class="stat-value">${all.games}</span>
      <span class="stat-label">Games played</span>
    </div>
    <div class="stat-tile">
      <span class="stat-value"><span class="w">${all.wins}</span>-<span class="l">${all.losses}</span>-<span class="t">${all.ties}</span></span>
      <span class="stat-label">Wins - Losses - Ties</span>
    </div>
    <div class="stat-tile">
      <span class="stat-value">${all.rate}%</span>
      <span class="stat-label">Overall win rate</span>
    </div>
    <div class="stat-tile stat-wide">
      <span class="form-dots">${dots || `<span class="dim">No games yet</span>`}</span>
      <span class="stat-label">Last ${recent.length || 10} games${recent.length ? ` · ${last10.rate}% win rate` : ""}</span>
    </div>
  `;
}


// ---------- 3. TOURNAMENT DECKS ----------
function renderTournamentDecks(decks, matches) {
  const tournament = decks
    .filter(function (d) { return d.category === "tournament"; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });

  decksBox.innerHTML = "";
  if (tournament.length === 0) {
    decksBox.innerHTML = `<p class="empty-slot">No tournament decks yet. Pick them on <a class="text-link" href="my-decks.html">My Decks</a>.</p>`;
    return;
  }

  // The same rules check as on My Decks (common.js)
  const check = checkTournamentDecks(tournament);

  for (const deck of tournament) {
    // Only the matches played with this exact version
    const stats = winStats(matches.filter(function (m) { return m.deckId === deck.id; }));
    const hero = findCard(deck.hero);

    // Rules status chip
    let status;
    if (!check.ready) {
      status = `<span class="chip chip-grey">Add ${MAX_TOURNAMENT_DECKS} decks to verify</span>`;
    } else if (check.results[deck.id].valid) {
      status = `<span class="chip chip-ok">✓ Valid</span>`;
    } else {
      status = `<span class="chip chip-bad">✗ Needs changes</span>`;
    }

    // Win rate: a big number and a bar, or "Not played yet"
    const rateHtml = stats.games === 0
      ? `<div class="dash-rate-empty dim">Not played yet</div>`
      : `
        <div class="dash-rate-line">
          <span class="dash-rate">${stats.rate}%</span>
          <span class="dim small">${stats.wins}W ${stats.losses}L ${stats.ties}T · ${stats.games} game${stats.games === 1 ? "" : "s"}</span>
        </div>
        <div class="rate-bar"><div class="rate-fill" style="width: ${stats.rate}%"></div></div>
      `;

    const card = document.createElement("div");
    card.className = "dash-deck";
    card.innerHTML = `
      <div class="deck-tile-top">
        <span class="deck-tile-hero" style="background-image: url('${hero.image}')" title="${hero.name}"></span>
        <div>
          <div class="deck-tile-name">${escapeHtml(deck.name)} <span class="version">v${deck.version}</span></div>
          <div class="dim small">${hero.name}</div>
          ${status}
        </div>
      </div>
      ${rateHtml}
    `;
    decksBox.appendChild(card);
  }
}


// ---------- 4. LAST 10 GAMES ----------
function renderRecent(matches) {
  const recent = [...matches].sort(function (a, b) { return b.playedAt - a.playedAt; }).slice(0, 10);

  recentBox.innerHTML = "";
  if (recent.length === 0) {
    recentBox.innerHTML = `<p class="empty-slot">No games yet. <a class="text-link" href="add-match.html">Add your first match</a>.</p>`;
    return;
  }

  for (const match of recent) {
    const myHero = findCard(match.deckHero);
    const enemyHero = findCard(match.enemyHero);

    // Same look as the Match History rows, without the buttons.
    // The whole row is a link to Match History.
    const row = document.createElement("a");
    row.className = "match-row result-" + match.result;
    row.href = "match-history.html";
    row.innerHTML = `
      <div class="match-main compact">
        <span class="match-result">${RESULT_WORDS[match.result]}</span>
        <span class="match-deck">
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
        <span class="match-date dim small">${formatShortDate(match.playedAt)}</span>
      </div>
    `;
    recentBox.appendChild(row);
  }
}


// ---------- 5. START ----------
watchUser(async function (user) {
  if (!user) {
    overviewBox.innerHTML = "";
    decksBox.innerHTML = "";
    recentBox.innerHTML = "";
    pageStatus.textContent = "Sign in (top menu) to see your dashboard.";
    return;
  }

  pageStatus.textContent = "Loading...";
  try {
    const [decks, matches] = await Promise.all([loadDecks(), loadMatches()]);
    pageStatus.textContent = "";
    renderOverview(matches);
    renderTournamentDecks(decks, matches);
    renderRecent(matches);
  } catch (error) {
    pageStatus.textContent = "Couldn't load your data: " + error.message;
    console.error(error);
  }
});
