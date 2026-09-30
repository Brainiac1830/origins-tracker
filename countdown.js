// ============================================================
// countdown.js — the countdowns on the home page.
// In JavaScript, comments start with // (like # in Python).
// ============================================================


// ---------- 1. SETTINGS (the only part you'll normally change) ----------
//
// "countdowns" is a list (JavaScript calls it an "array").
// Each item inside { } is like a Python dictionary: key: value pairs.
//
// About the date: "2026-10-22T09:00:00-04:00" means
//   22 Oct 2026, at 09:00, in a zone that is 4 hours behind UTC.
//   That is US Eastern time (New York) in October.
// To change a date, only edit the text inside the quotes.
const countdowns = [
  {
    id: "deck-lock",
    title: "Deck lock",
    date: new Date("2026-10-22T09:00:00-04:00"),
    finishedText: "Decks are locked!"
  },
  {
    id: "tournament-start",
    title: "Tournament start",
    date: new Date("2026-10-22T09:00:00-04:00"),
    finishedText: "The tournament has started. Good luck!"
  }
];


// ---------- 2. HELPER FUNCTIONS ----------

// Shows a date in your local time AND in US Eastern time.
// Python equivalent:  def format_date(date):
function formatDate(date) {
  const localText = date.toLocaleString("en-AU", {
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit"
  });

  const easternText = date.toLocaleString("en-US", {
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit",
    timeZone: "America/New_York"
  });

  // Text between backticks ` ` works like a Python f-string:
  // ${something} is replaced by the value of "something".
  return `Your time: ${localText}<br>US Eastern: ${easternText}`;
}

// Builds the HTML for one number + label, e.g. "05" with "hours" underneath.
function timeUnit(number, label) {
  // padStart(2, "0") turns 5 into "05" so the numbers don't jump around.
  const twoDigits = String(number).padStart(2, "0");
  return `
    <div class="time-unit">
      <span class="time-number">${twoDigits}</span>
      <span class="time-label">${label}</span>
    </div>
  `;
}


// ---------- 3. FILL IN EACH COUNTDOWN BOX ----------

// index.html already has an empty box for each countdown:
//   <div id="deck-lock">  on the left,  <div id="tournament-start">  on the right.
// The "id" in the settings above must match the id in index.html.

// Python equivalent:  for countdown in countdowns:
for (const countdown of countdowns) {
  const box = document.getElementById(countdown.id);   // find the box by its id
  box.innerHTML = `
    <h2>${countdown.title}</h2>
    <div class="countdown-time" id="${countdown.id}-time">--</div>
    <p class="countdown-date">${formatDate(countdown.date)}</p>
  `;
}


// ---------- 4. UPDATE THE NUMBERS ----------

function updateCountdowns() {
  const now = new Date();   // the current date and time

  for (const countdown of countdowns) {
    const timeBox = document.getElementById(countdown.id + "-time");

    // Subtracting two dates gives the difference in milliseconds (1000 ms = 1 second)
    const msLeft = countdown.date - now;

    // If the time has passed, show the "finished" message instead of numbers
    if (msLeft <= 0) {
      timeBox.innerHTML = `<span class="countdown-finished">${countdown.finishedText}</span>`;
      continue;   // skip to the next countdown (same as Python's continue)
    }

    // Math.floor rounds down, like Python's //
    const totalSeconds = Math.floor(msLeft / 1000);
    const days    = Math.floor(totalSeconds / 86400);          // 86400 seconds in a day
    const hours   = Math.floor((totalSeconds % 86400) / 3600); // % is "remainder", same as Python
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    timeBox.innerHTML =
      timeUnit(days, "days") +
      timeUnit(hours, "hours") +
      timeUnit(minutes, "min") +
      timeUnit(seconds, "sec");
  }
}

// Run it once straight away, so the page doesn't show "--" for a second...
updateCountdowns();

// ...then run it again every 1000 milliseconds (every second).
setInterval(updateCountdowns, 1000);
