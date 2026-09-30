// ============================================================
// cards.js — the list of every card in the game.
//
// When the dev team sends you the real cards:
//   1. Put the images in the "assets" folder.
//   2. Add one { ... } block per card below (copy an existing one).
//   3. Don't forget the comma between blocks!
//
// What each field means:
//   id    : a unique short name, lowercase, no spaces. NEVER change it once
//           you've saved decks, because decks remember cards by their id.
//   name  : the name shown on screen.
//   type  : "hero", "character" or "spell".
//   cost  : the mana cost (a number, no quotes).
//   image : where the picture is, starting from the project folder.
// ============================================================

const CARDS = [
  // ---------- Heroes ----------
  {
    id: "dorothy",
    name: "Dorothy",
    type: "hero",
    cost: 4,
    image: "assets/dorothy.png"
  },
  {
    id: "dracula",
    name: "Dracula",
    type: "hero",
    cost: 4,
    image: "assets/dracula.png"
  },

  // ---------- Characters and spells ----------
  {
    id: "itsy-bitsy-spider",
    name: "Itsy Bitsy Spider",
    type: "character",
    cost: 0,
    image: "assets/itsy_bitsy_spider.png"
  },
  {
    id: "bullseye",
    name: "Bullseye",
    type: "spell",
    cost: 1,
    image: "assets/bullseye.png"
  }
];
