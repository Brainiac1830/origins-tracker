// ============================================================
// locations.js — every location that can appear in a game (45).
// Each game has 3 of them.
//
//   id     : unique short name. NEVER change it once matches are saved.
//   name   : the name shown on screen.
//   text   : what the location does.
//   rarity : unknown for now (null). If the real rarities are ever
//            published, fill them in here, e.g. rarity: "Common"
// ============================================================

const LOCATIONS = [
  { id: "amplifying-amphitheatre", name: "Amplifying Amphitheatre", text: "ALL damage here is doubled.", rarity: null },
  { id: "anti-magic-vault", name: "Anti-Magic Vault", text: "Characters here lose all abilities.", rarity: null },
  { id: "arcane-leyline", name: "Arcane Leyline", text: "Both players get +2 mana this round.", rarity: null },
  { id: "ashen-grove", name: "Ashen Grove", text: "When you play a character here, discard your rightmost card then draw a card.", rarity: null },
  { id: "ballroom", name: "Ballroom", text: "After combat, return a random character here to its owner's hand for both players.", rarity: null },
  { id: "bandersnatch-burrow", name: "Bandersnatch Burrow", text: "After you play a character here, there is a 10% chance it will transform into a Bandersnatch this round.", rarity: null },
  { id: "blessed-grounds", name: "Blessed Grounds", text: "When a Good character is played here, it gets Shield.", rarity: null },
  { id: "broken-gate", name: "Broken Gate", text: "Barriers here regenerate with 10 health instead of 40 health.", rarity: null },
  { id: "broom-closet", name: "Broom Closet", text: "When you play a spell, allies here get +1/+1.", rarity: null },
  { id: "burial-grounds", name: "Burial Grounds", text: "On Death abilities happen twice here.", rarity: null },
  { id: "burnturn-arena", name: "Burnturn Arena", text: "After combat, deal 1 damage to ALL characters here.", rarity: null },
  { id: "castle-in-the-clouds", name: "Castle in the Clouds", text: "Cards that cost 7 or more cost 1 less to play.", rarity: null },
  { id: "cloning-lab", name: "Cloning Lab", text: "After you play a character here, fill your spaces here with copies of it.", rarity: null },
  { id: "conveyor-belt", name: "Conveyor Belt", text: "After combat, move all characters here to the right one space.", rarity: null },
  { id: "field-of-mice", name: "Field of Mice", text: "After a character enters play here, stun it.", rarity: null },
  { id: "giant-s-beacon", name: "Giant's Beacon", text: "Draw your highest-cost card. Set its cost to 1.", rarity: null },
  { id: "gold-spinning-wheel", name: "Gold Spinning Wheel", text: "Cards cost 1 less to play.", rarity: null },
  { id: "hero-emerges", name: "Hero Emerges", text: "Draw your legendary card. If you can't, draw a card instead.", rarity: null },
  { id: "human-cannon", name: "\"Human\" Cannon", text: "When you play a character here, destroy it and deal damage equal to its power to the opponent's barrier.", rarity: null },
  { id: "hundred-acre-woods", name: "Hundred Acre Woods", text: "Summon Christopher Robin here for both players.", rarity: null },
  { id: "junkyard", name: "Junkyard", text: "Both players discard a random card.", rarity: null },
  { id: "knowledge-vault", name: "Knowledge Vault", text: "The first player to fill this location draws a card.", rarity: null },
  { id: "mana-battery", name: "Mana Battery", text: "Keep your leftover mana between rounds.", rarity: null },
  { id: "mirror-dimension", name: "Mirror Dimension", text: "On Reveal abilities happen twice here.", rarity: null },
  { id: "nostradamus-call", name: "Nostradamus' Call", text: "At the start of round 6, destroy both players' decks.", rarity: null },
  { id: "open-meadow", name: "Open Meadow", text: "When a character enters play here, it gets Move.", rarity: null },
  { id: "overloaded-circuit", name: "Overloaded Circuit", text: "The first player to fill this location deals 5 damage to the opponent's barrier here.", rarity: null },
  { id: "poison-grounds", name: "Poison Grounds", text: "Evil characters here have Deathtouch.", rarity: null },
  { id: "reflecting-pool", name: "Reflecting Pool", text: "After you play a character here, copy it in another location.", rarity: null },
  { id: "sherwood-forest", name: "Sherwood Forest", text: "Summon a Merry Man at a random location every turn.", rarity: null },
  { id: "soul-artillery", name: "Soul Artillery", text: "After a character dies here, deal 1 damage to BOTH barriers.", rarity: null },
  { id: "stomping-grounds", name: "Stomping Grounds", text: "Characters here have Trample.", rarity: null },
  { id: "tectonic-decay", name: "Tectonic Decay", text: "After combat, deal 1 damage to both barriers here.", rarity: null },
  { id: "the-colosseum", name: "The Colosseum", text: "Characters here have Double Attack.", rarity: null },
  { id: "the-gallows", name: "The Gallows", text: "When a character enters play here, destroy the enemy across from it.", rarity: null },
  { id: "the-hill", name: "The Hill", text: "After combat, if there is more than one character here, destroy ALL characters who share the lowest power.", rarity: null },
  { id: "the-sultan-s-court", name: "The Sultan's Court", text: "At the start of each round, draw a card. Discard it before combat.", rarity: null },
  { id: "the-well", name: "The Well", text: "When you play a character here, heal 1 damage from your barrier here.", rarity: null },
  { id: "tinkerer-s-toolbox", name: "Tinkerer's Toolbox", text: "Both players draw a random 1-cost card from their deck.", rarity: null },
  { id: "training-dojo", name: "Training Dojo", text: "After combat, ALL characters here get +1 power.", rarity: null },
  { id: "treasurer-s-office", name: "Treasurer's Office", text: "Cards cost 1 more to play this round.", rarity: null },
  { id: "vacant-armory", name: "Vacant Armory", text: "Characters here have +1 power.", rarity: null },
  { id: "wall-of-dumpty", name: "Wall of Dumpty", text: "Destroy the first character you play here.", rarity: null },
  { id: "windmill-ridge", name: "Windmill Ridge", text: "Characters here have Defender.", rarity: null },
  { id: "wonderland", name: "Wonderland", text: "Reverse the attack order.", rarity: null }
];
