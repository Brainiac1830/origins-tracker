// ============================================================
// deck-builder.js — the Deck Builder page.
// Step 3: show every card in a grid, and open a big view on left-click.
// (Right-click to add/remove cards comes in step 4.)
// ============================================================


// ---------- 1. FIND THE PARTS OF THE PAGE WE NEED ----------
// Each of these looks up an element in deck-builder.html by its id.
const heroGrid   = document.getElementById("hero-grid");
const cardGrid   = document.getElementById("card-grid");
const modal      = document.getElementById("card-modal");
const modalImage = document.getElementById("modal-image");
const closeBtn   = document.getElementById("modal-close");


// ---------- 2. SORTING ----------

// Returns a NEW list sorted by mana cost (cheapest first).
// If two cards cost the same, they're sorted by name (A to Z).
//
// Python equivalent:
//   sorted(cards, key=lambda c: (c["cost"], c["name"]))
//
// In JavaScript, sort() is given a small "compare" function that looks at two
// cards (a and b) and returns a negative number if a goes first, or positive if b goes first.
function sortByCost(cards) {
  return [...cards].sort(function (a, b) {
    if (a.cost !== b.cost) {
      return a.cost - b.cost;              // cheaper card first
    }
    return a.name.localeCompare(b.name);   // same cost: alphabetical
  });
}


// ---------- 3. BUILD ONE CARD TILE ----------

// Creates the little box for one card: its picture with its name underneath.
function createCardTile(card) {
  const tile = document.createElement("div");
  tile.className = "card-tile";

  // loading="lazy" means the browser only loads the picture when you scroll
  // near it. That keeps the page fast once there are 100+ cards.
  tile.innerHTML = `
    <img src="${card.image}" alt="${card.name}" loading="lazy">
    <span class="card-name">${card.name}</span>
  `;

  // Left-click on the tile opens the big view of this card
  tile.addEventListener("click", function () {
    openModal(card);
  });

  return tile;
}


// ---------- 4. PUT ALL THE CARDS ON THE PAGE ----------

// filter() keeps only the items where the test is true.
// Python equivalent:  heroes = [c for c in CARDS if c["type"] == "hero"]
const heroes = CARDS.filter(function (card) { return card.type === "hero"; });
const others = CARDS.filter(function (card) { return card.type !== "hero"; });

for (const card of sortByCost(heroes)) {
  heroGrid.appendChild(createCardTile(card));
}

for (const card of sortByCost(others)) {
  cardGrid.appendChild(createCardTile(card));
}


// ---------- 5. THE BIG CARD VIEW (MODAL) ----------

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

// Close when clicking OUTSIDE the card.
// "event.target" is the exact thing that was clicked. If it's the dark
// background itself (and not the box or the card inside it), we close.
modal.addEventListener("click", function (event) {
  if (event.target === modal) {
    closeModal();
  }
});

// Bonus: close with the Escape key on the keyboard
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    closeModal();
  }
});
