// ============================================================
// game-ids.js — reading the game's "Share deck" codes.
//
// In the game, Share gives a code like  KGBLDCdjF8QzAwMDEy...:bebb17fd
// Inside it is a list of the game's own card ids (C00012_MC, C00033_MB...).
// GAME_IDS turns those into this website's card ids (from cards.js).
//
// New card in the game? Add a line:  "THE_GAME_ID": "website-card-id",
// (the tracker prints unknown ids, and tracker-app/card_ids.json lists them all).
// ============================================================

const GAME_IDS = {
  "C00002_MB": "three-blind-mice",
  "C00003_MB": "guy-of-gisborne",
  "C00006_MB": "black-knight",
  "C00009_MB": "bandersnatch",
  "C00012_MC": "king-arthur",
  "C00013_SB": "bullseye",
  "C00014_SB": "reinforcements",
  "C00015_SB": "axe-throw",
  "C00016_MB": "rumple",
  "C00017_MB": "huntsman",
  "C00018_MB": "shield-maiden",
  "C00019_MB": "galahad",
  "C00021_MB": "big-bad-wolf",
  "C00022_MB": "glinda",
  "C00023_MB": "fairy-godmother",
  "C00026_SB": "searing-light",
  "C00028_SB": "dark-omen",
  "C00029_MB": "banshee",
  "C00030_MB": "ugly-duckling",
  "C00031_MB": "mummy",
  "C00032_MB": "billy",
  "C00033_MB": "flying-monkey",
  "C00036_MB": "imhotep",
  "C00042_SC": "legion-of-the-dead",
  "C00043_SB": "underworld-flare",
  "C00046_MC": "three-not-so-little-pigs",
  "C00047_MB": "lancelot",
  "C00048_MB": "golden-egg",
  "C00052_MB": "pegasus",
  "C00054_MB": "card-soldier",
  "C00060_SB": "lightning-strike",
  "C00061_SB": "twister-toss",
  "C00062_SB": "defense-matrix",
  "C00063_MC": "dorothy",
  "C00064_MB": "aladdin",
  "C00065_MC": "robinhood",
  "C00066_MB": "toto",
  "C00068_MB": "marian",
  "C00070_MB": "jekyll",
  "C00072_MB": "three-musketeers",
  "C00073_MB": "musketeer",
  "C00074_MB": "little-john",
  "C00075_MC": "merlin",
  "C00093_MB": "humpty",
  "C00094_MB": "tin-woodman",
  "C00095_MB": "cowardly-lion",
  "C00096_SB": "rain-of-arrows",
  "C00100_MB": "wicked-witch-of-the-west",
  "C00101_MB": "kanga",
  "C00102_SB": "en-passant",
  "C00103_MB": "roo",
  "C00106_MB": "tweedledum",
  "C00107_MB": "white-queen",
  "C00108_SB": "heroic-charge",
  "C00109_MB": "beast",
  "C00110_MB": "jack",
  "C00115_MC": "mulan",
  "C00118_MC": "dracula",
  "C00119_MB": "quasimodo",
  "C00120_MB": "genie",
  "C00121_MB": "king-shahryar",
  "C00122_MB": "asanbosam",
  "C00124_SB": "freeze",
  "C00125_MB": "baloo",
  "C00126_MB": "mowgli",
  "C00127_MB": "shahrazad",
  "C00131_MB": "wicked-stepsisters",
  "C00132_MB": "koschei",
  "C00133_MB": "esmeralda",
  "C00135_MB": "phuong-hoang",
  "C00136_MB": "the-green-knight",
  "C00142_MB": "don-quixote",
  "C00143_MB": "ali-baba",
  "C00144_MB": "morgiana",
  "C00147_MB": "baby-bear",
  "C00155_MB": "scarecrow",
  "C00159_MB": "jack-in-the-box",
  "C00160_MB": "bridge-troll",
  "C00161_SB": "piggy-bank",
  "C00162_SB": "blow-the-house-down",
  "C00163_SB": "mind-palace",
  "C00167_SB": "spellbook",
  "C00168_MB": "lady-of-the-lake",
  "C00169_SB": "trash-for-treasure",
  "C00173_MB": "beauty",
  "C00175_MC": "wicked-stepmother",
  "C00176_MC": "queen-of-hearts",
  "C00180_MB": "boitata",
  "C00184_MB": "hare",
  "C00190_SB": "obliterate",
  "C00191_MB": "huck-finn",
  "C00193_MB": "christopher-robin",
  "C00194_MB": "paul-bunyan",
  "C00197_MB": "sorcerers-apprentice",
  "C00198_MB": "thumbelina",
  "C00199_MB": "piglet",
  "C00202_MB": "basilisk",
  "C00205_SB": "stroke-of-midnight",
  "C00208_MB": "mary",
  "C00215_SB": "animate-object",
  "C00230_MB": "impundulu",
  "C00231_MB": "puck",
  "C00232_SB": "first-aid",
  "C00234_SB": "forbidden-knowledge",
  "C00236_SB": "poison-apple",
  "C00245_MB": "bagheera",
  "C00258_MB": "bigfoot",
  "C00261_MB": "captain-ahab",
  "C00263_MB": "mothman",
  "C00264_MB": "frog-prince",
  "C00267_MB": "boogeyman",
  "C00269_MB": "magic-carpet",
  "C00270_MB": "queen-of-the-night",
  "C00271_MB": "jill",
  "C00274_MB": "cockatrice",
  "C00275_MB": "sandman",
  "C00283_MB": "frog-prince",
  "C00284_MB": "frog-prince",
  "C00300_MB": "magic-carpet",
  "C00301_MB": "magic-carpet",
  "C00306_SB": "merlins-prophecy",
  "C00310_MB": "itsy-bitsy-spider",
  "C00314_MC": "van-helsing",
  "C00341_MB": "ellen-trechend",
  "C00357_MB": "old-macdonald",
  "C00361_MB": "davy-crockett",
  "C90006_MB": "black-knight",
  "C90013_SB": "bullseye",
  "C90015_SB": "axe-throw",
  "C90019_MB": "galahad",
  "C90021_MB": "big-bad-wolf",
  "C90031_MB": "mummy",
  "C90032_MB": "billy",
  "C90042_SC": "legion-of-the-dead",
  "C90048_MB": "golden-egg",
  "C90065_MC": "robinhood",
  "C90068_MB": "marian",
  "C90074_MB": "little-john",
  "C90125_MB": "baloo",
  "C90131_MB": "wicked-stepsisters",
  "C90191_MB": "huck-finn",
  "C90193_MB": "christopher-robin",
  "C90194_MB": "paul-bunyan",
  "C90245_MB": "bagheera",
  "C90310_MB": "itsy-bitsy-spider"
};

// Reads a deck code. Returns { hero: id or null, cards: [ids], unknown: [game ids] },
// or null if the text isn't a deck code.
function decodeDeckCode(text) {
  const body = (text || "").trim().split(":")[0].replace(/\s/g, "");
  if (body.length < 20) {
    return null;
  }
  // The code starts with a few extra letters, so try reading it from a few places
  for (let start = 0; start < 16; start++) {
    let piece = body.slice(start).replace(/-/g, "+").replace(/_/g, "/");
    while (piece.length % 4 !== 0) {
      piece += "=";
    }
    let decoded;
    try {
      decoded = atob(piece);
    } catch (error) {
      continue;                        // not readable from here: try the next place
    }
    const gameIds = decoded.match(/[A-Z]\d{5}_[A-Z]{2}/g) || [];
    if (gameIds.length < 3) {
      continue;
    }
    const result = { hero: null, cards: [], unknown: [] };
    for (const gameId of gameIds) {
      const card = CARDS.find(function (c) { return c.id === GAME_IDS[gameId]; });
      if (!card) {
        result.unknown.push(gameId);
      } else if (card.type === "hero") {
        result.hero = card.id;
      } else if (!result.cards.includes(card.id)) {
        result.cards.push(card.id);
      }
    }
    return result;
  }
  return null;
}
