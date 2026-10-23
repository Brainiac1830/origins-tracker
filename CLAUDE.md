# Origins TCG Crimson Cup: match tracker website + in-game deck tracker

## About the owner (read first)
- Olivier is a **beginner coder who works in Python**. Give **extra detailed, step-by-step instructions** (where to click in VS Code, exact terminal commands, what output to expect).
- Windows PC, VS Code, PowerShell terminal. Use `python -m pip ...` (plain `pip` isn't on PATH). Python 3.14.
- The game runs **fullscreen at 1680×1050** on monitor 1.
- He tests by playing real games, then asks for the log and screenshots to be reviewed. Always check the newest folder in `tracker-app/games/`.
- Code style he's used to: lots of plain-English comments, simple names, a "Python equivalent" note for JS where it helps.

## Project layout (repo root = `C:\Users\Brainiac\Documents\GitHub\origins-tracker`)
GitHub: `Brainiac1830/origins-tracker`. Live site: https://brainiac1830.github.io/origins-tracker/
He publishes with VS Code: Source Control, then Commit, then Push (↑). GitHub Pages takes about 1 minute, and the browser may cache files for about 10 minutes (Ctrl+F5).

### Website (GitHub Pages + Firebase Firestore, Google sign-in)
- `cards.js` (CARDS, one card per line: id, name, type hero/character/spell, cost, image), `tokens.js` (TOKENS: type "token"/"token-spell", optional `from`, `artOf`), `locations.js` (LOCATIONS, 45, some `disabledInTournament`), `settings.js` (MAX_CARDS = 12), `common.js` (findCard, sortByCost, escapeHtml, isDeckComplete).
- `firebase-config.js`, `firebase.js` (watchUser), `database.js`: per-user data at `users/<uid>/decks|matches|meta/lastChange`, shared counter `stats/locations`. Every save also updates `meta/lastChange` so other pages' local cache refreshes. `firestore.rules` is a copy for reference.
- Deck: `{name, version, familyId, hero, cards:[12 ids], category: tournament|general, archived, createdAt, updatedAt}`.
- Match: `{deckId, deckName, deckVersion, deckHero, opponent, enemyHero, result win|loss|tie, difficulty easy|medium|hard, locations:[≤3 ids], enemyCards:[≤12 ids], playedAt (ms), trackerId?}`.
- Pages: `index.html/home.js`, `my-decks.*` (archiving + **Import deck code** box), `deck-builder.*` (opens `#import=CODE`), `add-match.*` (also `?edit=ID` and **`#import=<base64url JSON>`** pre-fill from the tracker, dedupe by `trackerId`), `match-history.*`, `tools.*` (**Deck tracker: Create key** box at the top, then the location stats; the PvE log was removed).
- `game-ids.js`: GAME_IDS maps the game's card ids (e.g. `C00012_MC`) to website ids, plus `decodeDeckCode()`. Game "Share deck" code = 6 junk letters + base64("v1|C00012_MC|..."). Hero = 1 copy, others = 2.

### Tracker app (`tracker-app/`, Python, runs locally while playing)
Run: `cd tracker-app` then `python watch.py`. Requirements: opencv-python, mss, numpy, winocr, pillow.
- `watch.py`: screen recognition (mss screenshots every 1 s).
  - Cards: OpenCV **SIFT + ratio test**. The library comes from `assets/board/<name>.png` (art-only) and `<name>_screen.png` (learned in games, or cut by hand from screenshots), plus card backs from `assets/backs`.
  - Accept rule: best ≥ 15 with a 2× lead, or best ≥ 20 with a 1.6× lead.
  - Phases and rounds: template matching against `tracker-app/phases/` (word_ready/cancel/waiting/revealing/combat, round_1–7, end_victory/end_defeat, arrow).
  - Reveal pop-up (top left) is read for spells.
  - Hand: mana badges.
  - Names and location names: **winocr**, with a grey-text Otsu fallback for locations.
  - Writes `games/<date>/log.txt` plus screenshots, and a summary at match end.
  - Settings near the top: `OPEN_ADD_MATCH`, `SITE_URL`, `MONITOR`, etc.
- `overlay.py`: HDT-style tkinter overlay (Pillow draws the image), top-most, drag to move, ✕ quits.
  - Shows deck cards left, sorted by cost. **Match panel**: opponent, L1–L3 locations (click to correct), **Diff** buttons, **Result Win/Loss/Tie** (during a game these END the game).
  - After a game: "Last game" panel with **Save** (when linked) / **Website** / close.
  - Opponent list shows units in white and spells in lilac; tokens are hidden.
  - `HERO_STARTING_CARDS` (e.g. King Arthur gets Defense Matrix) are added to the deck.
  - Hiding from capture (`SetWindowDisplayAffinity`) doesn't work on his PC. Instead the overlay blinks off for screenshots, **but only when it covers an area the tracker reads**. On the right edge it doesn't blink. The combat direction comes from the Wonderland location when known.
- `website.py`: saves a match straight to Firestore via the REST API using `tracker_key.txt` (base64 JSON `{uid, email, refreshToken}`, made on Tools > Create key).
  - It does exactly what the website does: match + `stats/locations` increments + `meta/lastChange`. `python website.py` tests the link.
  - **`tracker_key.txt` is gitignored and must never be committed or printed.**
- `deck.txt`: one or more decks (`name:` line + game Share code, or "2 Card" lines). The overlay picks the deck by hero, then by starting-hand overlap.
- `card_ids.json`: game id → name (from bentodd1/origins-tracker's carddb snapshot).
- `.gitignore`: games/, snap.png, check.png, `__pycache__/`, tracker_key.txt.

## Recognition rules worth knowing (hard-won)
- "Played" = went through the reveal pop-up (enemy) or left your hand (you). Board cards that appear otherwise = "summoned".
- A card that moves within 3 s isn't a new play. Stability needs 2 identical readings. Screen-shake and dark-board (legendary reveal) guards exist.
- The board is only read in planning/revealing/combat with the round button visible. The hand is read **before** the board, so a busy board never blocks draws.
- The "board not on screen" skip only triggers when unsure slots greatly outnumber recognised ones. If an unsure guess equals the card already in that slot, it keeps that card (shields).
- Pop-up: the same card shown again in the same reveal counts once.
- Draw counting: cards that appear during planning count as draws unless they're cards put back. Any card you play or cast also counts as drawn (backstop).
- Tokens recently added as board pictures: little_pig_token_screen, not_so_little_pig_token_screen (Three Not So Little Pigs hero).

## Current status / next steps
1. Done (2026-10-17): new end-screen references made with `python watch.py --end-ref victory|defeat <jpg>` (several pictures per word allowed, e.g. end_victory_old.png). If the round button is missing 8+ s mid-match, a `possible-end-screen.jpg` is saved. Opponent names: read every 3 s with 3 OCR tries (2×, 3×, inverted 2×, top line only) and voted until one name has 3 reads; ~12/13 correct in replays (SLYFOX reads as SLYFOK, an OCR font limit).
2. **Check that the latest watch.py / overlay.py / website.py are installed.** On 2026-10-16 they were sent as chat attachments (the Win/Loss/Tie buttons, result picking when not seen). Confirm the overlay shows a "Result" row; if not, re-apply that feature.
3. Linking: confirm `tracker_key.txt` exists and `python website.py` says "Linked ✓", then test Save from the overlay in a real game.
4. Later (agreed in principle, not built): special cards. Return-to-hand cards are Dracula (on discard, and discard isn't tracked yet), Stroke of Midnight, White Queen, the Ballroom location, and Koschei (returns after death unless the ability is removed, e.g. Van Helsing's Garlic). Card Soldier copies itself when it moves. The plan: general rules first (played vs summoned, transformed, draws capped at deck copies, otherwise "returned to hand"), then a special-cards file.
5. Possible: fully automatic save (no click) once Save proves reliable.

## Testing tips
- `python watch.py --test path\to\screenshot.jpg` reads one screenshot and writes check.png with the slot boxes.
- Replaying a game folder through `watch()` (with mss, `time.time`/`sleep` and `take_screenshot` patched to feed the saved jpgs) is a good regression check. The saved screenshots are only event frames, so expect some round merging.
- Website changes: test locally with stubbed `firebase.js`/`database.js` before pushing.
