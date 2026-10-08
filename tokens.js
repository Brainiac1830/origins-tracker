// ============================================================
// tokens.js — cards that are CREATED during a game (tokens), not put in decks.
//
// They live in their own list so the Deck Builder never offers them.
// The in-game tracker (tracker-app/watch.py) reads this file as well as
// cards.js, so it can recognise tokens on the board and in your hand.
//
// To add a token:
//   1. Put its image in the "assets" folder.
//   2. Copy one line below and change it. Every line ends with a comma.
//
// What each field means:
//   id    : unique short name, lowercase, no spaces (not used by any other card or token).
//   name  : the name shown on screen.
//   type  : "token" (stays on the board) or "token-spell" (a spell that gets created).
//   image : where the picture is.
//   from  : (optional) the card or hero that creates it — just for your information.
//   artOf : (optional) if the token has EXACTLY the same art as a normal card, put that
//           card's id here. The tracker can't tell two identical pictures apart, so it
//           will report the normal card instead.
// ============================================================

const TOKENS = [
  // ---------- Units ----------
  { id: "zombie", name: "Zombie", type: "token", image: "assets/zombie_token.png", from: "legion-of-the-dead" },
  { id: "mouse", name: "Mouse", type: "token", image: "assets/mouse_token.png", from: "three-blind-mice" },
  { id: "hyde", name: "Hyde", type: "token", image: "assets/hyde_token.png", from: "jekyll" },
  { id: "brides-of-dracula", name: "Brides of Dracula", type: "token", image: "assets/brides_of_dracula_token.png" },
  { id: "beautiful-swan", name: "Beautiful Swan", type: "token", image: "assets/beautiful_swan_token.png" },
  { id: "broomstick", name: "Broomstick", type: "token", image: "assets/broomstick_token.png" },
  { id: "golden-goose", name: "Golden Goose", type: "token", image: "assets/golden_goose_token.png" },
  { id: "little-lamb", name: "Little Lamb", type: "token", image: "assets/little_lamb_token.png" },
  { id: "little-pig", name: "Little Pig", type: "token", image: "assets/little_pig_token.png" },
  { id: "not-so-little-pig", name: "Not So Little Pig", type: "token", image: "assets/not_so_little_pig_token.png" },
  { id: "mama-bear", name: "Mama Bear", type: "token", image: "assets/mama_bear_token.png" },
  { id: "papa-bear", name: "Papa Bear", type: "token", image: "assets/papa_bear_token.png" },
  { id: "merry-man", name: "Merry Man", type: "token", image: "assets/merry_man_token.png" },
  { id: "tweedledee", name: "Tweedledee", type: "token", image: "assets/tweedledee_token.png" },
  // Same art as the normal card (a "Choose One" version), so the tracker reports the normal card:
  { id: "frog-prince-token", name: "Frog Prince", type: "token", image: "assets/frog_prince_token.png", from: "frog-prince", artOf: "frog-prince" },
  { id: "magic-carpet-token", name: "Magic Carpet", type: "token", image: "assets/magic_carpet_token.png", from: "magic-carpet", artOf: "magic-carpet" },

  // ---------- Spells ----------
  { id: "van-helsings-tools", name: "Van Helsing's Tools", type: "token-spell", image: "assets/van_helsings_tools_token_spell.png", from: "van-helsing" },
  { id: "holy-water", name: "Holy Water", type: "token-spell", image: "assets/holy_water_token_spell.png", from: "van-helsings-tools" },
  { id: "silver-bullet", name: "Silver Bullet", type: "token-spell", image: "assets/silver_bullet_token_spell.png", from: "van-helsings-tools" },
  { id: "garlic", name: "Garlic", type: "token-spell", image: "assets/garlic_token_spell.png", from: "van-helsings-tools" },
  { id: "wooden-stake", name: "Wooden Stake", type: "token-spell", image: "assets/wooden_stake_token_spell.png", from: "van-helsings-tools" },
  { id: "off-with-your-head", name: "Off With Your Head", type: "token-spell", image: "assets/off_with_your_head_token_spell.png" },
  { id: "pumpkin", name: "Pumpkin", type: "token-spell", image: "assets/pumpkin_token_spell.png" },
  { id: "reflection", name: "Reflection", type: "token-spell", image: "assets/reflection_token_spell.png" }
];
