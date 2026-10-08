# ============================================================
# watch.py - Step 1 of the in-game tracker.
#
# Watches the Origins TCG board while you play and prints every card that
# appears in a board slot, for the enemy AND for you, e.g.
#     [Lane 2] Enemy played: Three Blind Mice
# and the cards in your hand whenever it changes:
#               Your hand: Toto, Piglet, Musketeer, Lancelot
# It also reads the round button (READY / REVEALING / COMBAT / ROUND 2) and the
# Victory/Defeat screen, so it knows the round, counts YOUR cards only once they
# are revealed (UNDO-proof), notes which cards died in combat, your draws, and
# prints a summary at the end of every match. Reference pictures: "phases" folder.
#
# How it works (no game files, no game memory - it only looks at the screen):
#   1. Every second it takes a screenshot (the "mss" library).
#   2. It cuts out the 18 card slots on the board (3 lanes x 3 enemy + 3 yours).
#   3. For each slot that changed, it compares the picture with every card
#      image in ../assets using "feature matching" (OpenCV's SIFT): it finds
#      small distinctive details (eyes, edges, shapes) and counts how many of
#      them it can also find in each card image. Most matches = that card.
#
# How to run it (from this folder, in a terminal):
#     py watch.py                  watch the game live (Ctrl+C to stop)
#     py watch.py --snap           take ONE screenshot after 5 seconds and check it
#     py watch.py --test file.png  check a screenshot you already have
#
# --snap and --test save "check.png" with the 18 boxes drawn on it,
# so you can see whether the boxes sit on the slots.
# ============================================================

import filecmp       # compares two files
import os
import re
import sys
import time

import cv2           # OpenCV: image tools (pip name: opencv-python)
import numpy as np   # number arrays, OpenCV uses them for pictures


# ---------- 1. SETTINGS YOU CAN CHANGE ----------

SCAN_EVERY = 1.0     # seconds between screenshots
MY_NAME = ""         # your in-game name, e.g. "BOT HAROLD" (leave "" to let the tracker read it)
MONITOR = 1          # 1 = your main screen. Try 2 if the game is on a second screen.

# After each Victory/Defeat, open your website's Add Match page with the match filled in
# (you check it, pick the difficulty and click Save). False = don't open it.
OPEN_ADD_MATCH = True
SITE_URL = "https://brainiac1830.github.io/origins-tracker/"

# How sure it must be before it believes a match:
MIN_MATCHES = 15     # at least this many matching details...
MIN_LEAD = 2.0       # ...and at least 2x more than the second-best card,
STRONG_MATCHES = 20  # OR, for a strong match (this many details or more),
STRONG_LEAD = 1.6    # ...at least 1.6x more than the second-best card

# Where the project folder is: this file is in origins-tracker/tracker-app,
# so the website folder (with cards.js and assets) is one level up ("..").
HERE = os.path.dirname(os.path.abspath(__file__))
WEBSITE = os.path.dirname(HERE)


# ---------- 2. WHERE THE 18 SLOTS ARE ----------
# Measured on a full-screen screenshot 1679 x 1049 pixels wide/high.
# Each slot is stored as (left, top, right, bottom) in those pixels and turned
# into FRACTIONS of the screen, so it works at any resolution with the same shape.
REF_W, REF_H = 1679, 1049

LANE_COLUMNS = [                      # left and right edge of each slot
    [(262, 382), (386, 505), (509, 628)],      # lane 1 (left)
    [(658, 776), (781, 900), (905, 1022)],     # lane 2 (middle)
    [(1058, 1176), (1182, 1300), (1305, 1425)] # lane 3 (right)
]
ENEMY_ROW = (278, 412)                # top and bottom edge of the enemy slots
MY_ROW = (508, 652)                   # top and bottom edge of your slots

SLOTS = []                            # list of {"side", "lane", "box"} (box = fractions)
for lane_number, columns in enumerate(LANE_COLUMNS, start=1):
    for side, (top, bottom) in (("Enemy", ENEMY_ROW), ("You", MY_ROW)):
        for (left, right) in columns:
            SLOTS.append({
                "side": side,
                "lane": lane_number,
                "box": (left / REF_W, top / REF_H, right / REF_W, bottom / REF_H),
            })


# ---------- 2b. YOUR HAND ----------
# Hand cards move around (5 cards sit differently than 6), so there are no
# fixed boxes. Instead we look for the cyan hexagon mana badge in the top-left
# corner of every hand card: each badge = one card, starting right there.
HAND_STRIP = (0.25, 0.735, 0.80, 0.805)   # where the badges can be (left, top, right, bottom)
HAND_BOTTOM = 0.955                       # bottom of the hand cards (fraction of height)
BADGE_SCORE = 0.30                        # how hexagon-like a spot must be (0 to 1)


def hexagon_picture(scale):
    """Draws the outline of a mana badge (a pointy-top hexagon), white on black."""
    half_w, half_h = 16.5 * scale, 19.5 * scale
    width, height = int(half_w * 2 + 8), int(half_h * 2 + 8)
    cx, cy = width / 2, height / 2
    corners = np.array([(cx, cy - half_h), (cx + half_w, cy - half_h / 2), (cx + half_w, cy + half_h / 2),
                        (cx, cy + half_h), (cx - half_w, cy + half_h / 2), (cx - half_w, cy - half_h / 2)], np.int32)
    picture = np.zeros((height, width), np.uint8)
    cv2.polylines(picture, [corners], True, 255, max(2, int(round(3 * scale))))
    return picture


def has_white_frame(screen, badge_x):
    """Real hand cards have a white frame running down their left edge, just under
    the badge. (The cyan ORIGINS logo behind an emptier hand doesn't.)"""
    h, w = screen.shape[:2]
    scale = w / REF_W
    top, bottom = int(0.77 * h + 30 * scale), int(0.77 * h + 120 * scale)
    for dx in range(-22, 6, 2):                    # the frame is a few pixels left of the badge centre
        x = int(badge_x + dx * scale)
        column = screen[top:bottom, max(0, x - int(3 * scale)):x + int(3 * scale)]
        if column.size == 0:
            continue
        hsv = cv2.cvtColor(column, cv2.COLOR_BGR2HSV)
        if ((hsv[:, :, 2] > 190) & (hsv[:, :, 1] < 60)).mean() > 0.5:
            return True
    return False


def find_hand(screen):
    """Returns one picture per card in your hand (left to right), plus its box."""
    h, w = screen.shape[:2]
    scale = w / REF_W
    left, top = int(HAND_STRIP[0] * w), int(HAND_STRIP[1] * h)
    strip = screen[top:int(HAND_STRIP[3] * h), left:int(HAND_STRIP[2] * w)]

    # Keep only the badge colours - cyan for normal cards, gold for heroes - then
    # soften both pictures a little so small differences in thickness don't matter
    hsv = cv2.cvtColor(strip, cv2.COLOR_BGR2HSV)
    cyan = cv2.inRange(hsv, (80, 100, 120), (100, 255, 255)) | cv2.inRange(hsv, (15, 90, 150), (35, 255, 255))
    blur = int(5 * scale) | 1                     # "| 1" makes it an odd number (OpenCV needs that)
    cyan = cv2.GaussianBlur(cyan, (blur, blur), 0)
    hexagon = cv2.GaussianBlur(hexagon_picture(scale), (blur, blur), 0)

    # Slide the hexagon over the strip: high score = a badge is there
    scores = cv2.matchTemplate(cyan, hexagon, cv2.TM_CCOEFF_NORMED)
    badges = []
    while True:
        _, best, _, (x, y) = cv2.minMaxLoc(scores)
        if best < BADGE_SCORE:
            break
        bx, by = left + x + hexagon.shape[1] // 2, top + y + hexagon.shape[0] // 2
        if has_white_frame(screen, bx):            # a real card, not the ORIGINS logo
            badges.append((bx, by))
        gap = int(0.04 * w)                        # no two badges are this close: blank the area
        scores[:, max(0, x - gap):x + gap] = -1
    badges.sort()

    # Cut out each card: from its badge to the next badge (cards overlap a bit)
    cards = []
    for i, (bx, by) in enumerate(badges):
        right = bx + int(0.075 * w)
        if i + 1 < len(badges):
            right = min(right, badges[i + 1][0] - int(0.005 * w))
        box = (bx - int(0.005 * w), by + int(0.012 * h), right, int(HAND_BOTTOM * h))
        cards.append((screen[box[1]:box[3], box[0]:box[2]], box))
    return cards


# ---------- 2c. GAME PHASES ----------
# The round button (bottom right) always says what is happening:
#   READY / CANCEL READY / WAITING  = planning (you place cards)
#   REVEALING ROUND 3              = cards are being revealed
#   COMBAT ROUND 1                 = units attack
#   (empty circle)                 = in between (e.g. the big "ROUND 3" banner)
# The words are compared with small reference pictures in the "phases" folder.
PHASES_DIR = os.path.join(HERE, "phases")

BUTTON = (1460 / REF_W, 860 / REF_H, 1650 / REF_W, 1010 / REF_H)       # the round button
END_WORD = (180 / REF_W, 400 / REF_H, 1500 / REF_W, 670 / REF_H)        # "DEFEAT!" / "VICTORY!"
END_NEXT = (1340 / REF_W, 925 / REF_H, 1640 / REF_W, 1000 / REF_H)      # the teal NEXT button
ARROW = (1508 / REF_W, 448 / REF_H, 1605 / REF_W, 471 / REF_H)          # combat direction arrow

WORD_TO_PHASE = {"ready": "planning", "cancel": "planning", "waiting": "planning",
                 "revealing": "revealing", "combat": "combat"}


def cut(screen, box, size=None):
    """Cut a box (fractions of the screen) out of the screenshot, optionally resized."""
    h, w = screen.shape[:2]
    left, top, right, bottom = box
    piece = screen[int(top * h):int(bottom * h), int(left * w):int(right * w)]
    return cv2.resize(piece, size) if size else piece


def colour_mask(picture, low, high, blur=5):
    """White where the picture's colour is between low and high (in HSV), black elsewhere."""
    mask = cv2.inRange(cv2.cvtColor(picture, cv2.COLOR_BGR2HSV), low, high)
    return cv2.GaussianBlur(mask, (blur, blur), 0) if blur else mask


def phase_word_mask(screen):
    """The big white word on the round button (READY, COMBAT...)."""
    button = cut(screen, BUTTON, (190, 150))
    return colour_mask(button[25:72], (0, 0, 200), (180, 60, 255))


def round_digit_mask(screen):
    """The yellow round number under the word ("ROUND 2" -> the 2)."""
    button = cut(screen, BUTTON, (190, 150))
    return colour_mask(button[66:108, 118:162], (15, 100, 150), (40, 255, 255), blur=3)


def end_word_mask(screen):
    """The giant white word of the end screen, shrunk."""
    return colour_mask(cut(screen, END_WORD, (264, 54)), (0, 0, 200), (180, 60, 255))


def arrow_mask(screen):
    return colour_mask(cut(screen, ARROW, (97, 23)), (0, 0, 170), (180, 255, 255), blur=3)


def similarity(a, b):
    """How alike two masks are: 1 = identical, 0 = unrelated."""
    a = a.astype(np.float32).ravel() - a.mean()
    b = b.astype(np.float32).ravel() - b.mean()
    size = np.linalg.norm(a) * np.linalg.norm(b)
    return float(a @ b / size) if size else 0.0


def load_phase_pictures():
    pictures = {}
    if os.path.isdir(PHASES_DIR):
        for f in os.listdir(PHASES_DIR):
            if f.endswith(".png"):
                pictures[f[:-4]] = cv2.imread(os.path.join(PHASES_DIR, f), cv2.IMREAD_GRAYSCALE)
    return pictures


def read_phase(screen, pictures):
    """Returns (phase, round number or None). Phase is one of:
    planning, revealing, combat, between, defeat, victory, unknown."""
    # End screen? (the teal NEXT button bottom right)
    teal = colour_mask(cut(screen, END_NEXT), (80, 120, 150), (95, 255, 255), blur=0)
    if (teal > 0).mean() > 0.6:
        # Teal button bottom right: the end screen... or the finishing animation (SKIP).
        # Only the giant word tells them apart.
        word = end_word_mask(screen)
        scores = {name[4:]: similarity(word, p) for name, p in pictures.items() if name.startswith("end_")}
        if scores:
            best = max(scores, key=scores.get)
            if scores[best] > 0.6:
                return best, None            # "victory" or "defeat"
        return "between", None

    word = phase_word_mask(screen)
    if (word > 128).mean() < 0.01:
        return "between", None                     # empty button
    best, best_score = None, 0.0
    for name, picture in pictures.items():
        if name.startswith("word_"):
            score = similarity(word, picture)
            if score > best_score:
                best, best_score = name[5:], score
    if best is None or best_score < 0.8:
        return "unknown", None
    phase = WORD_TO_PHASE[best]

    round_number = None
    if best in ("ready", "revealing", "combat"):     # these show "ROUND N"
        digit = round_digit_mask(screen)
        scores = sorted(((similarity(digit, p), int(n[6:])) for n, p in pictures.items()
                         if n.startswith("round_")), reverse=True)
        if scores and scores[0][0] > 0.9 and (len(scores) == 1 or scores[0][0] - scores[1][0] > 0.08):
            round_number = scores[0][1]
    return phase, round_number


def read_direction(screen, pictures):
    """Combat direction: "left to right", "right to left" (Wonderland) or None."""
    if "arrow" not in pictures:
        return None
    mask = arrow_mask(screen)
    if (mask > 128).mean() < 0.05:
        return None
    normal = similarity(mask, pictures["arrow"])
    flipped = similarity(mask, cv2.flip(pictures["arrow"], 1))   # 1 = mirror left-right
    if max(normal, flipped) < 0.5:
        return None
    return "left to right" if normal >= flipped else "right to left"


# ---------- 3. THE CARD LIST (read from the website's cards.js) ----------
# Reusing cards.js means a card you add to the website is known here too.

def load_cards():
    """Reads cards.js and tokens.js. Returns a list of cards like
    {"id": "roo", "name": "Roo", "type": "character", "image": "assets/roo.png", "artOf": None}"""
    cards = []
    for file_name in ("cards.js", "tokens.js"):
        path = os.path.join(WEBSITE, file_name)
        if not os.path.exists(path):
            continue                                # tokens.js is optional
        with open(path, encoding="utf-8") as f:
            for line in f:                          # one card per line
                fields = dict(re.findall(r'(\w+):\s*"([^"]*)"', line))   # every  key: "value"  on the line
                if "id" in fields and "image" in fields:
                    cost = re.search(r"cost:\s*(\d+)", line)
                    cards.append({"id": fields["id"], "name": fields.get("name", fields["id"]),
                                  "type": fields.get("type", ""), "image": fields["image"],
                                  "artOf": fields.get("artOf"),
                                  "cost": int(cost.group(1)) if cost else None})
    return cards


def is_token(card):
    return card["type"].startswith("token")


# ---------- 4. THE PICTURE LIBRARY ----------
sift = cv2.SIFT_create()       # the detail finder
matcher = cv2.BFMatcher()      # compares details between two pictures

CROP_WIDTH = 230               # every slot picture is resized to this width first,
                               # so it behaves the same at any screen resolution

def simple_name(file_name):
    """ "Robin_Hood.png" -> "robinhood": so small spelling differences still match."""
    return re.sub(r"[^a-z0-9]", "", os.path.splitext(file_name)[0].lower())


def board_picture_paths(card):
    """The card's pictures in assets/board: "dracula.png" (art-only, added by you)
    and "dracula_screen.png" (cut from a real game, learned by the tracker).
    A picture that is an exact copy of the normal card picture (with the text box)
    doesn't count: it's no better than the normal one."""
    folder = os.path.join(WEBSITE, "assets", "board")
    if not os.path.isdir(folder):
        return []
    wanted = simple_name(os.path.basename(card["image"]))
    normal = os.path.join(WEBSITE, card["image"])
    paths = []
    for f in sorted(os.listdir(folder)):
        if simple_name(f) in (wanted, wanted + "screen"):
            path = os.path.join(folder, f)
            if os.path.exists(normal) and filecmp.cmp(path, normal, shallow=False):
                continue                             # just a copy of the text version
            paths.append(path)
    return paths


def screen_picture_path(card):
    """Where the tracker saves the picture it learns from a real game."""
    name = os.path.splitext(os.path.basename(card["image"]))[0]
    return os.path.join(WEBSITE, "assets", "board", name + "_screen.png")


def build_library(cards):
    """Find the details in the ART part of every card image (heroes included:
    they can be played too). Takes about 10 seconds."""
    library = []
    used_board = 0
    for card in cards:
        if card["artOf"]:
            continue    # same picture as a normal card: the normal card covers it
        # Best: the "board" version of the card (art + big name, no text box), which
        # looks just like the card on the board and in your hand. Put those in
        # assets/board/ with the SAME file name as the normal picture.
        board_paths = board_picture_paths(card)
        if board_paths:
            # Every board picture of this card goes in the library (the best one counts)
            for path in board_paths:
                image = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
                details = board_details(image) if image is not None else None
                if details is not None:
                    library.append((card, details))
            used_board += 1
        else:
            # Otherwise: the normal card picture, but only its art band
            # (from 8% to 48% of the height), since the board shows mostly art.
            image = cv2.imread(os.path.join(WEBSITE, card["image"]), cv2.IMREAD_GRAYSCALE)
            if image is None:
                print("  (missing picture, skipped):", card["image"])
                continue
            h, w = image.shape
            art = image[int(h * 0.08):int(h * 0.48), int(w * 0.06):int(w * 0.94)]
            art = cv2.resize(art, None, fx=0.5, fy=0.5)   # half size works best (tested)
            details = sift.detectAndCompute(art, None)[1]
            if details is not None:
                library.append((card, details))

        # Heroes: ALSO keep the art of the full card picture (tested: a hero on the
        # board matches it better). The best of the two pictures counts.
        if board_paths and card["type"] == "hero":
            image = cv2.imread(os.path.join(WEBSITE, card["image"]), cv2.IMREAD_GRAYSCALE)
            if image is not None:
                h, w = image.shape
                art = image[int(h * 0.08):int(h * 0.48), int(w * 0.06):int(w * 0.94)]
                extra = sift.detectAndCompute(cv2.resize(art, None, fx=0.5, fy=0.5), None)[1]
                if extra is not None:
                    library.append((card, extra))
    if used_board:
        print(f"  ({used_board} cards use their board picture from assets/board)")

    # Card backs (face-down cards) from assets/backs: any of them = "a hidden card"
    backs_dir = os.path.join(WEBSITE, "assets", "backs")
    backs = 0
    if os.path.isdir(backs_dir):
        for f in sorted(os.listdir(backs_dir)):
            image = cv2.imread(os.path.join(backs_dir, f), cv2.IMREAD_GRAYSCALE)
            if image is None:
                continue
            image = cv2.resize(image, None, fx=250 / image.shape[1], fy=250 / image.shape[1])
            keypoints, details = sift.detectAndCompute(image, None)
            if details is not None:
                library.append(({"id": "back-" + f, "name": "Hidden card", "type": "back",
                                 "image": f, "artOf": None}, details))
                backs += 1
    if backs:
        print(f"  ({backs} card backs from assets/backs)")
    return library


def board_details(gray_picture):
    """The details of a board-style picture (same processing as assets/board pictures)."""
    h, w = gray_picture.shape
    art = gray_picture[int(h * 0.03):int(h * 0.80), int(w * 0.04):int(w * 0.96)]
    art = cv2.resize(art, None, fx=250 / art.shape[1], fy=250 / art.shape[1])
    return sift.detectAndCompute(art, None)[1]


# ---------- 4b. LEARNING BOARD PICTURES ----------
# When a card on the board is recognised with a VERY strong match, a clean crop of
# it is saved once as assets/board/<name>_screen.png. From then on the card is ALSO
# matched against how it really looks in your game: even more reliable.
LEARN_MATCHES = 30       # at least this many matching details...
LEARN_LEAD = 2.5         # ...and 2.5x more than the second-best card


def learn_board_picture(card, picture, why, library):
    if card["type"] == "back" or card.get("artOf"):
        return False
    path = screen_picture_path(card)
    if os.path.exists(path):
        return False                                 # already learned from a game
    try:
        best, second = [int(x) for x in why.split(" vs ")]
    except ValueError:
        return False
    if best < LEARN_MATCHES or best < LEARN_LEAD * max(second, 1):
        return False
    h, w = picture.shape[:2]
    inset = max(2, int(w * 0.03))                    # trim the slot edges
    clean = picture[inset:h - inset, inset:w - inset]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cv2.imwrite(path, clean)
    details = board_details(cv2.cvtColor(clean, cv2.COLOR_BGR2GRAY))
    if details is not None:
        library.append((card, details))              # the best picture of a card counts
    return True


def looks_empty(slot_picture):
    """Empty board slots are dark navy blue; cards are colourful art. Measured on your
    screenshots: empty slots 98-100% navy, cards and card backs 16% or less."""
    h, w = slot_picture.shape[:2]
    middle = slot_picture[int(h * 0.2):int(h * 0.8), int(w * 0.2):int(w * 0.8)]
    hsv = cv2.cvtColor(middle, cv2.COLOR_BGR2HSV)
    navy = ((hsv[:, :, 0] >= 100) & (hsv[:, :, 0] <= 125) & (hsv[:, :, 1] >= 60)
            & (hsv[:, :, 2] >= 25) & (hsv[:, :, 2] <= 120))
    return navy.mean() > 0.8


def identify(slot_picture, library, board_slot=False):
    """Returns (card or None, how many details matched, a short explanation)."""
    if board_slot and looks_empty(slot_picture):
        return None, 0, "empty"
    gray = cv2.cvtColor(slot_picture, cv2.COLOR_BGR2GRAY)
    scale = CROP_WIDTH / gray.shape[1]
    gray = cv2.resize(gray, None, fx=scale, fy=scale)
    keypoints, details = sift.detectAndCompute(gray, None)

    # An empty slot is a plain dark square: almost no details at all
    if details is None or len(keypoints) < 25:
        return None, 0, "empty"

    scores = []
    for card, card_details in library:
        pairs = matcher.knnMatch(details, card_details, k=2)
        # "Ratio test": keep a match only if it is clearly better than the next one
        good = sum(1 for p in pairs if len(p) == 2 and p[0].distance < 0.7 * p[1].distance)
        scores.append((good, card))
    scores.sort(key=lambda s: s[0], reverse=True)

    best_score, best_card = scores[0]
    if best_score < 8:
        # A real card always matches far more details than this: it's an empty slot
        # with a little glow or the edge of a neighbouring card in it.
        return None, best_score, "empty"
    # The second-best must be a DIFFERENT card (two pictures of card backs, or of the
    # same card, shouldn't count as competitors)
    second_score = next((sc for sc, c in scores[1:]
                         if c["name"] != best_card["name"]), 0)
    lead = best_score / max(second_score, 1)
    if best_card["type"] == "back" and best_score >= 25:
        return best_card, best_score, f"{best_score} vs {second_score}"   # card backs match very strongly
    if (best_score >= MIN_MATCHES and lead >= MIN_LEAD) or (best_score >= STRONG_MATCHES and lead >= STRONG_LEAD):
        return best_card, best_score, f"{best_score} vs {second_score}"
    return None, best_score, f"unsure: {best_card['name']}? ({best_score} vs {second_score})"


# ---------- 4c. THE REVEAL POP-UP (top left) ----------
# Every card that gets revealed - yours and the enemy's, spells included - is shown
# big in the top-left corner for a moment, as the full card WITH its text. So it is
# compared with the normal card pictures in assets (not the board pictures).
POPUP = (0.0, 0.12, 0.21, 0.52)          # where the pop-up appears (left, top, right, bottom)
LEGENDARY = (0.85, 0.06, 0.975, 0.335)   # "Opponent's Legendary" on the starting-hand screen

# The "VS" matchup screen before each match: both heroes as cards, and both names
MATCH_MY_HERO = (600 / REF_W, 798 / REF_H, 752 / REF_W, 1018 / REF_H)
MATCH_ENEMY_HERO = (928 / REF_W, 798 / REF_H, 1078 / REF_W, 1018 / REF_H)
MATCH_MY_NAME = (80 / REF_W, 945 / REF_H, 420 / REF_W, 992 / REF_H)
MATCH_ENEMY_NAME = (1330 / REF_W, 945 / REF_H, 1640 / REF_W, 992 / REF_H)
# During the match both names are also shown in a plain, easy-to-read font:
GAME_ENEMY_NAME = (0.068, 0.012, 0.25, 0.048)      # top left
# The location names: the white title line of each lane's banner (lane 1, 2, 3)
LOCATION_TITLES = [(0.150, 0.403, 0.372, 0.433), (0.392, 0.403, 0.612, 0.433),
                   (0.633, 0.403, 0.853, 0.433)]
GAME_MY_NAME = (0.068, 0.925, 0.25, 0.962)         # bottom left


def read_text(screen, box):
    """Reads white text in a box with Windows' built-in text reader (the 'winocr'
    package). Returns the text, or None if winocr isn't installed or nothing was read."""
    try:
        from winocr import recognize_cv2_sync
        read = lambda picture: recognize_cv2_sync(picture, "en")["text"]
    except Exception:
        try:                                    # (only used for testing away from Windows)
            import pytesseract
            read = lambda picture: pytesseract.image_to_string(picture, config="--psm 7")
        except Exception:
            return None
    try:
        piece = cut(screen, box)
        piece = cv2.resize(piece, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
        # White letters on a dark background -> black letters on white (easier to read)
        hsv = cv2.cvtColor(piece, cv2.COLOR_BGR2HSV)
        letters = (hsv[:, :, 2] > 190) & (hsv[:, :, 1] < 60)
        clean = np.full(piece.shape, 255, np.uint8)
        clean[letters] = 0
        clean = cv2.copyMakeBorder(clean, 40, 40, 40, 40, cv2.BORDER_CONSTANT, value=(255, 255, 255))
        return read(clean)
    except Exception:
        return None


def read_name(screen, box):
    """Reads a player name. Returns None if nothing could be read."""
    text = read_text(screen, box)
    if not text:
        return None
    text = re.sub(r"[^A-Za-z0-9 _-]", "", text).strip().upper()   # only letters, numbers, spaces
    return text if len(text) >= 2 else None


def load_locations():
    """Reads locations.js: a list of {"id", "name"}."""
    path = os.path.join(WEBSITE, "locations.js")
    found = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                fields = dict(re.findall(r'(\w+):\s*"([^"]*)"', line))
                if "id" in fields and "name" in fields:
                    found.append({"id": fields["id"], "name": fields["name"]})
    return found


def read_location(screen, box, locations):
    """Reads one lane's location name and finds it in locations.js.
    Returns the location, or None ("Reveals on Round 2", unreadable, unknown...)."""
    import difflib
    text = read_text(screen, box)
    if not text:
        return None
    text = re.sub(r"[^a-z ]", "", text.lower()).strip()
    if len(text) < 4:
        return None
    scores = sorted(((difflib.SequenceMatcher(None, text, loc["name"].lower()).ratio(), k)
                     for k, loc in enumerate(locations)), reverse=True)
    if not scores or scores[0][0] < 0.75:
        return None
    if len(scores) > 1 and scores[0][0] - scores[1][0] < 0.08:
        return None                             # two locations look alike: not sure
    return locations[scores[0][1]]


def build_popup_library(cards):
    popup_library = []
    for card in cards:
        image = cv2.imread(os.path.join(WEBSITE, card["image"]), cv2.IMREAD_GRAYSCALE)
        if image is None or card.get("artOf"):
            continue
        image = cv2.resize(image, None, fx=260 / image.shape[1], fy=260 / image.shape[1])
        details = sift.detectAndCompute(image, None)[1]
        if details is not None:
            popup_library.append((card, details))
    return popup_library


def read_popup(screen, popup_library):
    """The card shown in the reveal pop-up, or None."""
    h, w = screen.shape[:2]
    piece = screen[int(POPUP[1] * h):int(POPUP[3] * h), int(POPUP[0] * w):int(POPUP[2] * w)]
    gray = cv2.cvtColor(piece, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, None, fx=352 / gray.shape[1], fy=352 / gray.shape[1])
    details = sift.detectAndCompute(gray, None)[1]
    if details is None:
        return None, "nothing"
    scores = []
    for card, card_details in popup_library:
        pairs = matcher.knnMatch(details, card_details, k=2)
        good = sum(1 for p in pairs if len(p) == 2 and p[0].distance < 0.7 * p[1].distance)
        scores.append((good, card))
    scores.sort(key=lambda x: x[0], reverse=True)
    best, card = scores[0]
    second = next((sc for sc, c in scores[1:] if c["name"] != card["name"]), 0)
    # Every full card shares the frame and text layout, so the second-best is always
    # fairly high. Real pop-ups scored 178-317 (2.2-3.2x the next card); screens
    # without a pop-up never scored above 52.
    if best >= 100 and best >= 2.0 * max(second, 1):
        return card, f"{best} vs {second}"
    return None, f"no pop-up ({best} vs {second})"


# ---------- 4d. BIG CARDS IN THE WAY (previews, pop-ups, reveal animations) ----------
# Hovering a card (on the board or in your hand) shows a big preview of it; reveals
# show big cards too. Anything under a big card is NOT read until it goes away, so
# a preview can never be mistaken for a card in a slot or a change in your hand.

def big_cards(screen):
    """Boxes (fractions of the screen) of big cards: found by their white frame,
    taller than a quarter of the screen and shaped like a card."""
    h, w = screen.shape[:2]
    small = cv2.resize(screen, (REF_W, REF_H))
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    white = ((hsv[:, :, 2] > 200) & (hsv[:, :, 1] < 50)).astype(np.uint8) * 255
    white = cv2.morphologyEx(white, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    count, labels, stats, centres = cv2.connectedComponentsWithStats(white)
    boxes = []
    for k in range(1, count):
        x, y, bw, bh, area = stats[k]
        if 0.25 * REF_H < bh < 0.65 * REF_H and 0.5 < bw / bh < 0.95:
            boxes.append((x / REF_W, y / REF_H, (x + bw) / REF_W, (y + bh) / REF_H))
    return boxes


def covered(box, big_boxes, amount=0.2):
    """True if at least 'amount' (20%) of the box is hidden under a big card."""
    left, top, right, bottom = box
    size = (right - left) * (bottom - top)
    for (l, t, r, b) in big_boxes:
        overlap = max(0, min(right, r) - max(left, l)) * max(0, min(bottom, b) - max(top, t))
        if overlap >= amount * size:
            return True
    return False


# ---------- 5. HELPERS ----------

def cut_slot(screen, slot):
    """Cut one slot out of the whole screenshot."""
    h, w = screen.shape[:2]
    left, top, right, bottom = slot["box"]
    return screen[int(top * h):int(bottom * h), int(left * w):int(right * w)]


def take_screenshot(grabber, overlay=None):
    """One screenshot of the chosen screen, as an OpenCV picture.
    If the overlay can't be hidden from screenshots on this PC, it's made
    see-through for a split second while the screenshot is taken."""
    blink = overlay is not None and overlay.get("blink") and overlay.get("hwnd")
    if blink:
        import overlay as overlay_module
        overlay_module.set_alpha(overlay["hwnd"], 0)
        time.sleep(0.05)
    try:
        shot = grabber.grab(grabber.monitors[MONITOR])
    finally:
        if blink:
            overlay_module.set_alpha(overlay["hwnd"], overlay_module.ALPHA)
    picture = np.array(shot)                            # colours come as B, G, R, A
    return cv2.cvtColor(picture, cv2.COLOR_BGRA2BGR)   # drop A (transparency)


def tiny(picture):
    """A small grey copy of a slot, used to notice quickly whether it changed."""
    return cv2.resize(cv2.cvtColor(picture, cv2.COLOR_BGR2GRAY), (24, 24)).astype("int16")


def check_screenshot(screen, library, save_as):
    """Prints what is in each slot and saves a copy with the boxes drawn on it."""
    drawing = screen.copy()
    h, w = screen.shape[:2]
    for slot in SLOTS:
        card, score, why = identify(cut_slot(screen, slot), library, board_slot=True)
        left, top, right, bottom = slot["box"]
        p1 = (int(left * w), int(top * h))
        p2 = (int(right * w), int(bottom * h))
        colour = (0, 220, 0) if card else (0, 220, 255)       # green = known, yellow = not
        cv2.rectangle(drawing, p1, p2, colour, 2)
        if why != "empty":
            label = card["name"] if card else "?"
            print(f"  Lane {slot['lane']} {slot['side']:5}: {label:22} ({why})")
            if card and card["type"] == "back":
                colour = (255, 160, 0)
            cv2.putText(drawing, label, (p1[0] + 3, p2[1] - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, colour, 1, cv2.LINE_AA)

    # Your hand
    hand = find_hand(screen)
    print(f"\n  Your hand ({len(hand)} cards):")
    for picture, (x1, y1, x2, y2) in hand:
        card, score, why = identify(picture, library)
        label = card["name"] if card else "?"
        colour = (0, 220, 0) if card else (0, 220, 255)
        print(f"    {label:22} ({why})")
        cv2.rectangle(drawing, (x1, y1), (x2, y2), colour, 2)
        cv2.putText(drawing, label, (x1 + 3, y2 - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.45, colour, 1, cv2.LINE_AA)

    pictures = load_phase_pictures()
    if pictures:
        phase, round_number = read_phase(screen, pictures)
        print(f"\n  Phase: {phase}" + (f", round {round_number}" if round_number else "")
              + f" | combat direction: {read_direction(screen, pictures) or '-'}")

    cv2.imwrite(save_as, drawing)
    print(f"\nSaved {save_as} - open it to check the boxes sit on the card slots.")


# ---------- 6. WATCHING LIVE ----------

def opposite_side_has(card, slot, held):
    """True if the same card sits on the OTHER side of the same lane.
    When a unit attacks, its picture flies over to the other side for a moment,
    so a sudden "enemy Koschei" right in front of your Koschei is probably that."""
    for j, other in enumerate(SLOTS):
        if other["lane"] == slot["lane"] and other["side"] != slot["side"]:
            if held[j] is not None and held[j]["id"] == card["id"]:
                return True
    return False


# ---------- 6b. THE GAME DIARY (screenshots + log) ----------
# Every time you run "py watch.py", a new folder is made in tracker-app/games/,
# named after the date and time, e.g.  games/2026-10-08_09-40-12/
# Inside: log.txt (everything printed, with the time) and one picture per event,
# with a box around the slot it's about. Only the newest KEEP_SESSIONS folders are kept.
KEEP_SESSIONS = 20


class Diary:
    def __init__(self):
        games = os.path.join(HERE, "games")
        os.makedirs(games, exist_ok=True)
        # Delete the oldest sessions so the folder doesn't grow forever
        old = sorted(d for d in os.listdir(games) if os.path.isdir(os.path.join(games, d)))
        for name in old[:max(0, len(old) - (KEEP_SESSIONS - 1))]:
            folder = os.path.join(games, name)
            for f in os.listdir(folder):
                os.remove(os.path.join(folder, f))
            os.rmdir(folder)
        self.folder = os.path.join(games, time.strftime("%Y-%m-%d_%H-%M-%S"))
        os.makedirs(self.folder)
        self.count = 0

    def write(self, text, screen=None, box=None, label=""):
        """Print a line, add it to log.txt, and (if a screenshot is given) save it."""
        print(text)
        stamp = time.strftime("%H:%M:%S")
        picture_name = ""
        if screen is not None:
            self.count += 1
            safe = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
            picture_name = f"{self.count:04d}_{stamp.replace(':', '-')}_{safe}.jpg"
            drawing = screen.copy()
            if box is not None:
                h, w = drawing.shape[:2]
                left, top, right, bottom = box
                cv2.rectangle(drawing, (int(left * w), int(top * h)), (int(right * w), int(bottom * h)),
                              (0, 0, 255), 3)                       # red box around the slot
            cv2.imwrite(os.path.join(self.folder, picture_name), drawing,
                        [cv2.IMWRITE_JPEG_QUALITY, 80])           # jpg = about 10x smaller than png
        with open(os.path.join(self.folder, "log.txt"), "a", encoding="utf-8") as f:
            f.write(f"{stamp}  {text.strip()}" + (f"   -> {picture_name}" if picture_name else "") + "\n")


def watch(library, stop=None, overlay=None):
    """stop: a threading.Event that ends the watching (used with the overlay).
    overlay: a dict shared with the overlay window (drawn cards, enemy cards, status)."""
    import mss                       # only needed when looking at the real screen
    from collections import Counter  # counts things in a list, e.g. Counter(["a","a","b"]) = {a: 2, b: 1}

    pictures = load_phase_pictures()
    locations = load_locations()                   # for reading the location names
    all_cards = {card["name"]: card for card in load_cards()}
    if not pictures:
        print("(No 'phases' folder found: rounds and phases won't be tracked.)")

    # A card is only believed once the SAME card is read in the SAME slot
    # this many times in a row (scans are about 1 second apart). Attack
    # animations pass through a slot faster than that, so they're ignored.
    SURE_AFTER = 2
    SURE_AFTER_IF_MIRRORED = 4       # when the same card sits across from it (see opposite_side_has)
    MOVE_WINDOW = 3                  # seconds: a card that reappears this fast on the same side MOVED

    n = len(SLOTS)
    last_tiny = [None] * n           # small picture of each slot, to notice changes
    held = [None] * n                # the card we believe is in each slot (None = empty)
    counted = [False] * n            # has the card in this slot been counted as played?
    candidate = [None] * n           # what the last readings said ("empty" or a card id)
    streak = [0] * n                 # how many readings in a row said the same thing
    last_reading = [None] * n        # the very last reading ("empty", "unsure" or a card id)
    recently_left = []               # cards that just left a slot (to spot moves and deaths)

    unsure_count = [0] * n           # how many readings in a row a slot was "unsure"
    flagged = [False] * n            # already warned about this slot?
    guesses = [[] for _ in range(n)] # the last best guesses for an unsure slot
    hidden = [False] * n             # a face-down card sits in this slot
    hand_unsure_count = 0
    checks = []                      # the ⚠ CHECK lines of this match (listed in the summary)

    state = {
        "phase": None,               # planning / revealing / combat / defeat / victory
        "round": None,               # round number
        "phase_candidate": None, "phase_streak": 0,
        "match": 1,
    }
    stats = {}                       # filled by new_match()
    print("Learning the full card pictures for the reveal pop-up (a few seconds)...")
    popup_library = build_popup_library(load_cards())
    popup = {"tiny": None, "last": None,     # the pop-up area last time, and what it showed
             "counted": None}                 # the last pop-up card counted (this reveal)
    round_info = {"mine": Counter()}         # cards that are surely yours this round

    last_hand_tiny = None            # small picture of the hand area, to notice changes
    hand_now = []                    # names of the cards in your hand right now
    hand_candidate, hand_streak = None, 0

    diary = Diary()

    def new_match():
        stats.clear()
        # Per side: the most copies of each card seen on the board AT THE SAME TIME,
        # and how many times it was played (shown in brackets if different).
        stats["most_at_once"] = {"Enemy": {}, "You": {}}
        stats["plays"] = {"Enemy": {}, "You": {}}
        stats["tokens"] = set()
        stats["spells"] = {"Enemy": Counter(), "You": Counter()}
        stats["enemy_hero"] = None
        stats["my_hero"] = None
        stats["my_name"] = None
        stats["enemy_name"] = None
        stats["locations"] = {}             # lane number -> location
        if overlay is not None:
            overlay["drawn"] = Counter()
            overlay["enemy"] = Counter()
            overlay["enemy_spells"] = Counter()
            overlay["enemy_tokens"] = Counter()
        stats["from_hand"] = Counter()      # your cards played/cast from your hand

    def pick_deck(hand=None):
        """With several decks in deck.txt: show the one you're playing (your hero,
        then the best fit with your starting hand)."""
        if overlay is None or len(overlay.get("decks") or []) < 2:
            return
        from overlay import choose_deck
        hero = stats["my_hero"]
        if not hero and hand:                    # your hero card sits in your starting hand
            heroes = {d["hero"] for d in overlay["decks"]}
            hero = next((name for name in hand if name in heroes), None)
        if not hero:
            return
        chosen = choose_deck(overlay["decks"], hero, hand)
        if chosen is None:
            if not stats.get("no_deck_warned"):
                stats["no_deck_warned"] = True
                diary.write(f"(Overlay: no deck in deck.txt uses {hero} - still showing {overlay['deck']['name']})")
        elif chosen is not overlay["deck"] or not stats.get("deck_announced"):
            overlay["deck"] = chosen
            stats["deck_announced"] = True
            diary.write(f"Overlay deck: {chosen['name']}")

    def check_overlay_visibility(grabber):
        """Once, at the start: can the tracker's screenshots see the overlay?"""
        import overlay as overlay_module
        seen = overlay_module.seen_by_capture(overlay["hwnd"], grabber)
        if seen is None:
            return                                   # can't tell yet: try again next second
        if seen:
            seen = overlay_module.seen_by_capture(overlay["hwnd"], grabber) is not False   # make sure
        overlay["blink"] = seen
        if seen:
            print("Overlay: this PC can't hide it from screenshots, so it blinks off for a split\n"
                  "         second each time the tracker looks (the game stays fully visible to it).")
        else:
            print("Overlay: hidden from the tracker's screenshots ✓")

    def check(text, screen=None, box=None, label="check"):
        """Something the tracker isn't sure about: clearly marked, with a screenshot."""
        line = f"{tag()}⚠ CHECK: {text}"
        checks.append(line)
        diary.write(line, screen, box, label)

    def tag():
        """ "R3 " in front of lines once the round is known."""
        return f"R{state['round']} " if state["round"] else ""

    def who(side):
        return "Enemy" if side == "Enemy" else "You  "

    def count_play(i, card, why, screen):
        side = SLOTS[i]["side"]
        counted[i] = True
        stats["plays"][side][card["name"]] = stats["plays"][side].get(card["name"], 0) + 1
        if is_token(card):
            stats["tokens"].add(card["name"])
        if overlay is not None and side == "Enemy":
            overlay["enemy_tokens" if is_token(card) else "enemy"][card["name"]] += 1
        if side == "You" and why == "revealed" and not is_token(card):
            played_from_hand(card["name"])
        verb = "summoned" if is_token(card) else "played"
        diary.write(f"{tag()}[Lane {SLOTS[i]['lane']}] {who(side)} {verb}: {card['name']}  ({why})",
                    screen, SLOTS[i]["box"], f"{side}-{card['name']}")

    def played_from_hand(name):
        """A card you played or cast came from your hand, so you must have drawn it.
        (Catches draws the hand reading missed.)"""
        stats["from_hand"][name] += 1
        if overlay is not None and overlay["drawn"][name] < stats["from_hand"][name]:
            overlay["drawn"][name] = stats["from_hand"][name]

    def commit_your_placements(screen):
        """At the reveal, the cards you placed during planning become real plays.
        (Cards you took back with UNDO are gone by then, so they never count.)"""
        for i, slot in enumerate(SLOTS):
            if slot["side"] == "You" and held[i] is not None and not counted[i]:
                count_play(i, held[i], "revealed", screen)
                round_info["mine"][held[i]["name"]] += 1

    def send_to_website(result):
        """Opens the website's Add Match page with this match filled in. The match
        travels inside the link (after #import=), so nothing else is needed."""
        import base64
        import json
        import webbrowser

        def card_id(name):
            card = all_cards.get(name)
            return card["id"] if card else None

        # The opponent's deck: units and spells they played (not tokens, not their hero,
        # not the card their hero gives them), the ones played most first, 12 at most
        hero_card = None
        try:
            from overlay import HERO_STARTING_CARDS
            hero_card = HERO_STARTING_CARDS.get(stats["enemy_hero"])
        except Exception:
            pass
        times = Counter(stats["plays"]["Enemy"]) + Counter(stats["spells"]["Enemy"])
        enemy_cards = []
        for name, n in times.most_common():
            card = all_cards.get(name)
            if card and card["type"] != "hero" and not is_token(card) and name != hero_card:
                enemy_cards.append(card["id"])
        deck = overlay.get("deck") if overlay is not None else None
        match = {
            "v": 1,
            "id": f"{time.strftime('%Y%m%d-%H%M%S')}-{stats['enemy_name'] or 'x'}",  # (stops saving it twice)
            "result": result,
            "opponent": stats["enemy_name"] or "",
            "myHero": card_id(stats["my_hero"]) if stats["my_hero"] else None,
            "enemyHero": card_id(stats["enemy_hero"]) if stats["enemy_hero"] else None,
            "deckName": deck["name"] if deck else None,
            "deckCards": [c["id"] for c, n in deck["cards"]] if deck else [],
            "locations": [stats["locations"][lane]["id"] for lane in (1, 2, 3) if lane in stats["locations"]],
            "enemyCards": enemy_cards[:12],
        }
        code = base64.urlsafe_b64encode(json.dumps(match).encode("utf-8")).decode("ascii").rstrip("=")
        link = SITE_URL.rstrip("/") + "/add-match.html#import=" + code
        try:
            webbrowser.open(link)
            diary.write("  → Opened your website's Add Match page with this match filled in.")
        except Exception as error:
            diary.write(f"  (Couldn't open the browser: {error}. The link: {link})")

    def end_match(title, screen):
        nonlocal hand_now, hand_candidate, hand_streak, last_hand_tiny
        anything = any(stats["plays"][s] or stats["spells"][s] for s in ("Enemy", "You"))
        if anything:
            diary.write(f"\n===== {title} =====  Match {state['match']} summary "
                        f"(most copies on the board at the same time):", screen, None, title)
            for side in ("Enemy", "You"):
                cards_only = {k: v for k, v in stats["most_at_once"][side].items() if k not in stats["tokens"]}
                tokens_only = {k: v for k, v in stats["most_at_once"][side].items() if k in stats["tokens"]}
                diary.write(f"  {side:5} cards : {describe(cards_only, stats['plays'][side])}")
                diary.write(f"  {side:5} tokens: {describe(tokens_only, stats['plays'][side])}")
                spells = stats["spells"][side]
                diary.write(f"  {side:5} spells: " + (", ".join(f"{k} x{v}" for k, v in sorted(spells.items()))
                                                      if spells else "none"))
            if stats["my_hero"] or stats["my_name"]:
                diary.write(f"  You         : {stats['my_name'] or '?'} with {stats['my_hero'] or '?'}")
            if stats["enemy_hero"] or stats["enemy_name"]:
                diary.write(f"  Opponent    : {stats['enemy_name'] or '?'} with {stats['enemy_hero'] or '?'}")
            if checks:
                diary.write(f"  ⚠ {len(checks)} thing(s) to check (screenshots in the games folder):")
                for line in checks:
                    diary.write(f"     {line}")
            else:
                diary.write("  ✓ Nothing uncertain this match.")
            if stats["locations"]:
                diary.write("  Locations   : " + ", ".join(stats["locations"][lane]["name"]
                                                       for lane in sorted(stats["locations"])))
            if OPEN_ADD_MATCH and title in ("VICTORY", "DEFEAT"):
                send_to_website("win" if title == "VICTORY" else "loss")
            diary.write("")
            state["match"] += 1
        checks.clear()
        # Fresh start for the next match
        new_match()
        for i in range(n):
            held[i], counted[i], candidate[i], streak[i], last_tiny[i] = None, False, None, 0, None
            unsure_count[i], flagged[i], hidden[i] = 0, False, False
        recently_left.clear()
        state["round"] = None
        hand_now, hand_candidate, hand_streak, last_hand_tiny = [], None, 0, None

    def update_phase(screen):
        """Reads the round button and reacts when the phase changes."""
        if not pictures:
            return
        phase, round_number = read_phase(screen, pictures)
        state["raw_phase"] = phase                   # this screenshot's reading (not yet confirmed)
        if phase == state["phase_candidate"]:
            state["phase_streak"] += 1
        else:
            state["phase_candidate"], state["phase_streak"] = phase, 1
        if state["phase_streak"] < 2 or phase in ("between", "unknown"):
            return                                   # not sure yet, or nothing to learn

        old = state["phase"]
        if phase in ("defeat", "victory"):
            if old not in ("defeat", "victory"):
                commit_your_placements(screen)
                state["phase"] = phase
                if phase == "victory" and "end_victory" not in pictures:
                    check("End screen didn't look like DEFEAT, so it's counted as a VICTORY. "
                          "Please confirm (this screenshot can become the Victory reference).",
                          screen, END_WORD, "victory-reference")
                end_match("VICTORY" if phase == "victory" else "DEFEAT", screen)
            return

        # The round number: read from the button, or +1 when planning follows combat
        counted_round = False
        if round_number is None and phase == "planning" and old == "combat" and state["round"]:
            round_number = state["round"] + 1
            counted_round = True
        if (round_number is not None and state["round"] is not None
                and round_number not in (state["round"], state["round"] + 1, 1)):
            # A jump like 3 -> 6 is usually a misread... unless it's read again and again
            # (then the tracker missed a round, and the button is right).
            state["odd"] = state.get("odd", 0) + 1 if state.get("odd_value") == round_number else 1
            state["odd_value"] = round_number
            if state["odd"] < 3:
                print(f"          (ignored odd round reading {round_number} after round {state['round']})")
                round_number = None
                if phase == "planning" and old == "combat":
                    round_number, counted_round = state["round"] + 1, True
            else:
                print(f"          (round {round_number} read 3 times: trusting the button)")
        if round_number is not None and round_number != state["round"]:
            if state["round"] is not None and round_number == 1 and state["round"] >= 2:
                end_match("NEW MATCH (no Victory/Defeat screen seen)", screen)
            state["round"] = round_number
            round_info["mine"] = Counter()
            diary.write(f"\n===== Round {round_number} =====", screen, BUTTON, f"round-{round_number}")
        if counted_round or (round_number is None and phase in ("revealing", "combat")
                             and not state.get("warned_round") == state["round"]):
            # The number on the button couldn't be read (a round we have no reference for yet)
            state["warned_round"] = state["round"]
            if counted_round:      # the "===== Round N =====" screenshot already shows the button
                diary.write(f"{tag()}(round number counted, not read: the round screenshot is a reference)")
            else:
                diary.write(f"{tag()}(round number not read: reference screenshot)", screen, BUTTON,
                            f"round-reference-{state['round']}")

        if phase != old:
            state["phase"] = phase
            if phase == "revealing":
                if popup["last"] != popup["counted"]:
                    popup["counted"] = None            # (a card that STAYS in the corner isn't re-counted)
                popup["last"] = popup["tiny"] = None   # a spell you targeted can now be revealed: read again
                diary.write(f"{tag()}--- Reveal ---")
                commit_your_placements(screen)
            elif phase == "combat":
                direction = read_direction(screen, pictures)
                extra = "   *** REVERSED (Wonderland?) ***" if direction == "right to left" else ""
                diary.write(f"{tag()}--- Combat ({direction or 'direction unknown'}) ---{extra}")
                commit_your_placements(screen)
            elif phase == "planning":
                diary.write(f"{tag()}--- Planning ---")

    def forget_old_departures():
        """A card that left a slot and didn't reappear within MOVE_WINDOW died (or was removed)."""
        now = time.time()
        for r in list(recently_left):
            wait = 8 if r["phase"] == "combat" else MOVE_WINDOW   # attack animations can take a while
            if now - r["time"] < wait:
                continue
            recently_left.remove(r)
            if not r["counted"]:
                print(f"          (You took back {r['card']['name']})")
                continue
            how = "died in combat" if r["phase"] == "combat" else "killed or removed (spell/effect?)"
            diary.write(f"{r['tag']}[Lane {r['lane']}] {who(r['side'])} {r['card']['name']} {how}")

    new_match()
    print(f"Saving screenshots and a log in: {diary.folder}")
    print("Watching the screen. Play a match! Press Ctrl+C here to stop.\n")
    with mss.mss() as grabber:
        try:
            while not (stop is not None and stop.is_set()):
                started = time.time()
                if overlay is not None and overlay.get("hwnd") and overlay.get("blink") is None:
                    check_overlay_visibility(grabber)
                screen = take_screenshot(grabber, overlay)
                if overlay is not None:
                    phase = state["phase"] or "waiting for a match"
                    overlay["status"] = (f"Round {state['round']} · {phase}" if state["round"] else phase)

                # ----- 0. Which phase are we in? -----
                update_phase(screen)

                # Before the first round (the "STARTING HAND" screen) and after Victory/Defeat
                # the big cards and letters sit over the board slots: don't read the board then.
                if (state["phase"] not in ("planning", "revealing", "combat")
                        or state.get("raw_phase") in ("victory", "defeat")):
                    # The "VS" matchup screen: both heroes (as cards) and both player names
                    if not stats["my_hero"]:
                        mine, s1, why1 = identify(cut(screen, MATCH_MY_HERO), library)
                        theirs, s2, why2 = identify(cut(screen, MATCH_ENEMY_HERO), library)
                        if mine and theirs and mine["type"] == "hero" and theirs["type"] == "hero":
                            stats["my_hero"], stats["enemy_hero"] = mine["name"], theirs["name"]
                            # (names are read later, in the game's plain font: the VS screen's
                            #  decorative font is too hard to read reliably)
                            diary.write(f"Matchup: You with {mine['name']}  vs  opponent with {theirs['name']}"
                                        f"  ({why1} / {why2})", screen, None, "matchup")
                            pick_deck()
                    # ...and the starting-hand screen shows the opponent's hero, top right
                    if not stats["enemy_hero"]:
                        card, score, why = identify(cut(screen, LEGENDARY), library)
                        if card and card["type"] == "hero":
                            stats["enemy_hero"] = card["name"]
                            diary.write(f"Enemy hero: {card['name']}  ({why})", screen, LEGENDARY,
                                        f"hero-{card['name']}")
                    time.sleep(SCAN_EVERY)
                    continue

                # ----- 0b. Player names, in the plain font shown during the match (once) -----
                if not stats.get("names_read") and state["phase"] == "planning":
                    stats["names_read"] = True
                    enemy_name = read_name(screen, GAME_ENEMY_NAME)
                    my_name = MY_NAME or read_name(screen, GAME_MY_NAME)
                    if enemy_name:
                        stats["enemy_name"] = enemy_name
                    if my_name:
                        stats["my_name"] = my_name
                    if enemy_name or my_name:
                        diary.write(f"Players: You = {stats['my_name'] or '?'}, opponent = {stats['enemy_name'] or '?'}")

                # ----- 0c. The 3 location names (until all 3 are known, every few seconds) -----
                if len(stats["locations"]) < 3 and time.time() - state.get("location_try", 0) >= 3:
                    state["location_try"] = time.time()
                    blocking = big_cards(screen)
                    for lane, box in enumerate(LOCATION_TITLES, start=1):
                        if lane in stats["locations"] or covered(box, blocking, amount=0.5):
                            continue
                        found = read_location(screen, box, locations)
                        if found:
                            stats["locations"][lane] = found
                            diary.write(f"{tag()}Location (lane {lane}): {found['name']}")

                # ----- 1a. The reveal pop-up (top left): read first, it doesn't need the board -----
                corner = tiny(cut(screen, POPUP))
                if popup["tiny"] is None or np.abs(corner - popup["tiny"]).mean() >= 4:
                    popup["tiny"] = corner
                    card, why = read_popup(screen, popup_library)
                    name = card["name"] if card else None
                    planning_now = "planning" in (state["phase"], state.get("raw_phase"))
                    if card and name != popup["last"] and planning_now:
                        # During planning the corner shows YOUR spell while you choose its
                        # target ("CHOOSE A TARGET"). It counts when it's revealed.
                        if card["type"] != "hero" and round_info["mine"][name] == 0:
                            round_info["mine"][name] = 1   # (it may already be known from your hand)
                            print(f"          (you're casting {name}: counts when it's revealed)")
                    elif card and name != popup["last"]:
                        if card["type"] == "hero":
                            if state["round"] in (None, 1) and not stats["enemy_hero"]:
                                mine_hero = round_info["mine"][name] > 0 or any(
                                    held[i] is not None and held[i]["name"] == name
                                    for i, sl in enumerate(SLOTS) if sl["side"] == "You") or name in hand_now
                                if not mine_hero:
                                    stats["enemy_hero"] = name
                                    diary.write(f"{tag()}Enemy hero: {name}  ({why})", screen, POPUP, f"hero-{name}")
                        elif name == popup["counted"]:
                            # The same card again (its cost changed, it glowed, it's repeated by
                            # an effect, or it stays on screen): still the same card, count it once
                            print(f"          (pop-up: {name} shown again - counted once)")
                        else:
                            popup["counted"] = name
                            placed_by_you = any(held[i] is not None and held[i]["name"] == name and not counted[i]
                                                for i, sl in enumerate(SLOTS) if sl["side"] == "You")
                            side = "You" if (round_info["mine"][name] > 0 or placed_by_you) else "Enemy"
                            if side == "You":
                                round_info["mine"][name] -= 1
                            if card["type"] in ("spell", "token-spell"):
                                stats["spells"][side][name] += 1
                                if overlay is not None and side == "Enemy":
                                    overlay["enemy_spells"][name] += 1
                                if side == "You":
                                    played_from_hand(name)
                                diary.write(f"{tag()}{who(side)} cast  : {name} (spell)  ({why})",
                                            screen, POPUP, f"{side}-spell-{name}")
                            else:
                                print(f"          (pop-up: {who(side).strip()} revealed {name})")
                    popup["last"] = name

                # ----- 1. Read every slot that changed (except those under a big card) -----
                in_the_way = big_cards(screen)

                # ----- 1b. Your hand (read before the board, so a busy board never blocks it) -----
                # Only re-read it when that part of the screen changed.
                hand_area = cut(screen, (HAND_STRIP[0], HAND_STRIP[1], HAND_STRIP[2], HAND_BOTTOM))
                small = tiny(hand_area)
                hand_box = (HAND_STRIP[0], HAND_STRIP[1] - 0.25, HAND_STRIP[2], HAND_BOTTOM)  # the hand + just above it
                hovering = covered(hand_box, in_the_way, amount=0.05)
                if hovering:
                    last_hand_tiny = None           # a card is being previewed: read the hand later
                elif last_hand_tiny is None or np.abs(small - last_hand_tiny).mean() >= 4:
                    last_hand_tiny = small
                    names, unsure_in_hand = [], 0
                    for picture, box in find_hand(screen):
                        card, score, why = identify(picture, library)
                        if card:
                            names.append(card["name"])
                        elif why != "empty":           # an empty spot isn't a card
                            unsure_in_hand += 1
                    reading = (sorted(names), unsure_in_hand)
                    if reading == hand_candidate:
                        hand_streak += 1
                    else:
                        hand_candidate, hand_streak = reading, 1
                    hand_unsure_count = hand_unsure_count + 1 if unsure_in_hand else 0
                    if hand_unsure_count == 5:
                        check(f"{unsure_in_hand} card(s) in your hand aren't recognised. "
                              "Missing from cards.js/tokens.js, or a new card?",
                              screen, (HAND_STRIP[0], HAND_STRIP[1], HAND_STRIP[2], HAND_BOTTOM), "unknown-hand")
                    if unsure_in_hand or hand_streak < 2:
                        last_hand_tiny = None       # not sure yet: look again next time
                    if hand_streak >= 2 and sorted(names) != sorted(hand_now):
                        gained = list((Counter(names) - Counter(hand_now)).elements())
                        lost = Counter(hand_now) - Counter(names)
                        new_cards = gained
                        if state["round"] is None and stats.get("starting_hand"):
                            # before round 1 (starting hand screen): a card that leaves your
                            # hand was swapped back into the deck
                            if overlay is not None and lost:
                                overlay["drawn"] -= lost
                        elif "planning" in (state["phase"], state.get("raw_phase")):
                            # cards that left your hand while planning: you played them
                            round_info["mine"] += lost
                            # cards coming BACK (put back, UNDO) aren't draws; the others are
                            back = Counter(gained) & round_info["mine"]
                            round_info["mine"] -= back
                            new_cards = list((Counter(gained) - back).elements())
                        extra = f" (+{unsure_in_hand} unsure)" if unsure_in_hand else ""
                        line = f"          Your hand: {', '.join(names) if names else 'empty'}{extra}"
                        if not hand_now and gained and not stats.get("starting_hand"):
                            stats["starting_hand"] = True
                            pick_deck(gained)
                            if overlay is not None:
                                overlay["drawn"] = Counter(gained)
                            diary.write(f"{tag()}Starting hand: {', '.join(gained)}{extra}",
                                        screen, None, "starting-hand")
                        elif not hand_now:
                            print(line)            # the hand was hidden for a moment (screen shake)
                        elif new_cards:
                            if overlay is not None:
                                overlay["drawn"].update(new_cards)
                            diary.write(f"{tag()}You drew: {', '.join(new_cards)}", screen, None, "drew")
                            print(line)
                        else:
                            print(line)            # cards placed, or back in hand (UNDO)
                        hand_now = names

                results = []                       # (slot number, card, why)
                new_tiny = list(last_tiny)
                for i, slot in enumerate(SLOTS):
                    if covered(slot["box"], in_the_way):
                        continue                   # hidden by a preview: keep what we had
                    picture = cut_slot(screen, slot)
                    small = tiny(picture)
                    # Skip slots that look the same as last time (saves a lot of work)
                    if last_tiny[i] is not None and np.abs(small - last_tiny[i]).mean() < 6:
                        continue
                    new_tiny[i] = small
                    card, score, why = identify(picture, library, board_slot=True)
                    results.append((i, card, why))

                # If lots of slots are "unsure", the board isn't on screen
                # (a menu, the settings, the results screen): ignore this screenshot.
                unsure = sum(1 for (i, card, why) in results if card is None and why != "empty")
                # No round button on screen (e.g. your hero's finishing animation): no board
                no_button = state.get("raw_phase") in ("between", "unknown")
                # Screen shake (some locations shake the whole board): several slots suddenly
                # show a DIFFERENT card at the same moment. Wait until it settles.
                swapped = sum(1 for (i, card, why) in results
                              if card is not None and card["type"] != "back"
                              and held[i] is not None and held[i]["id"] != card["id"])
                appeared = sum(1 for (i, card, why) in results
                               if card is not None and card["type"] != "back" and held[i] is None)
                shaking = swapped >= 2      # (cards just appearing don't count: reveals can flip several at once)
                if shaking:
                    for (i, card, why) in results:
                        candidate[i], streak[i] = None, 0     # start the readings over
                # Several cards "vanishing" at the same moment outside combat = the board went
                # dark (e.g. a legendary hero's reveal). Wait up to 8 s before believing it.
                vanishing = [i for (i, card, why) in results if why == "empty" and held[i] is not None]
                if len(vanishing) >= 3 and state["phase"] != "combat":
                    state.setdefault("dark_since", time.time())
                    if time.time() - state["dark_since"] < 8:
                        results = [r for r in results if r[0] not in vanishing]
                        for i in vanishing:
                            new_tiny[i] = None             # look again next time
                else:
                    state.pop("dark_since", None)
                recognised = sum(1 for (i, card, why) in results if card is not None)
                not_the_board = unsure > 4 and unsure > 2 * (recognised + sum(1 for c in held if c))
                if not_the_board or shaking or (no_button and unsure + appeared > 0):
                    time.sleep(SCAN_EVERY)
                    continue
                last_tiny = new_tiny

                # ----- 2. Only believe readings that stay the same -----
                for (i, card, why) in results:
                    slot = SLOTS[i]
                    side = slot["side"]
                    if card is None and why != "empty" and held[i] is not None \
                            and why.split("unsure: ")[-1].split("?")[0] == held[i]["name"]:
                        card, why = held[i], "same card as before"   # e.g. covered by a shield effect
                    if card is None and why != "empty":
                        last_reading[i] = "unsure"
                        last_tiny[i] = None        # unsure (moving, glowing...): look again next time
                        unsure_count[i] += 1
                        guess = why.split("unsure: ")[-1].split("?")[0]
                        guesses[i] = (guesses[i] + [guess])[-5:]          # keep the last 5
                        # A real unknown card gives the SAME guess every time; an animation
                        # passing over the slot gives a different guess each second.
                        steady = max(guesses[i].count(g) for g in guesses[i]) >= 3
                        # Still unsure after ~5 readings? Hidden enemy cards during planning are
                        # normal (face down); anything else is worth a look.
                        hidden_enemy = side == "Enemy" and state["phase"] == "planning"
                        limit = 10 if (side == "Enemy" and state["phase"] == "revealing") else 5
                        try:
                            best_details = int(why.split("(")[-1].split(" vs ")[0])
                        except ValueError:
                            best_details = 0
                        real_card = best_details >= 16      # below that it's an animation, glow or preview
                        if unsure_count[i] >= limit and steady and real_card and not flagged[i] and not hidden_enemy:
                            flagged[i] = True
                            check(f"[Lane {slot['lane']}] {who(side).strip()}: a card here isn't recognised "
                                  f"({why}). Missing from cards.js/tokens.js, or a new card?",
                                  screen, slot["box"], f"unknown-{side}-lane{slot['lane']}")
                        continue
                    unsure_count[i], guesses[i] = 0, []
                    if why == "empty":
                        flagged[i] = False

                    if card is not None and card["type"] == "back":
                        # A face-down card: not a play yet, and nothing to warn about
                        last_reading[i], unsure_count[i], guesses[i] = "hidden", 0, []
                        if not hidden[i] and held[i] is None:
                            hidden[i] = True
                            if side == "Enemy":
                                diary.write(f"{tag()}[Lane {slot['lane']}] Enemy placed a hidden card")
                        continue
                    hidden[i] = False

                    reading = "empty" if card is None else card["id"]
                    last_reading[i] = reading
                    if reading == candidate[i]:
                        streak[i] += 1
                    else:
                        candidate[i], streak[i] = reading, 1

                    needed = SURE_AFTER
                    if card is not None and opposite_side_has(card, slot, held):
                        needed = SURE_AFTER_IF_MIRRORED
                    if streak[i] < needed:
                        last_tiny[i] = None        # not sure yet: read it again next time
                        continue

                    # Sure now. Did a card leave this slot?
                    if held[i] is not None and (card is None or held[i]["id"] != card["id"]):
                        recently_left.append({"side": side, "card": held[i], "lane": slot["lane"],
                                              "time": time.time(), "phase": state["phase"],
                                              "counted": counted[i], "tag": tag()})
                        held[i], counted[i] = None, False
                    if card is None or held[i] is not None:
                        continue                   # empty now, or the same card as before

                    # A new card in this slot. Did it MOVE here from another slot on this side?
                    # (Not during combat: then a new card is something being summoned.)
                    moved_from = None
                    if state["phase"] != "combat":
                        for j, other in enumerate(SLOTS):     # (a) still shown in its old slot, which is changing
                            if (j != i and other["side"] == side and held[j] is not None and counted[j]
                                    and held[j]["id"] == card["id"] and last_reading[j] != card["id"]):
                                moved_from = f"from lane {other['lane']}"
                                held[j], counted[j] = None, False
                                break
                        if moved_from is None:                # (b) it left another slot a moment ago
                            for r in recently_left:
                                if r["side"] == side and r["card"]["id"] == card["id"] and r["counted"]:
                                    recently_left.remove(r)
                                    moved_from = f"from lane {r['lane']}"
                                    break

                    if moved_from is None and state["phase"] == "combat":
                        for r in recently_left:
                            if (r["side"] == side and r["card"]["id"] == card["id"]
                                    and r["lane"] == slot["lane"] and r["counted"]):
                                recently_left.remove(r)
                                moved_from = "back"          # it was only away for its attack
                                break

                    held[i] = card
                    if moved_from == "back":
                        counted[i] = True                    # same card: nothing to log
                    elif moved_from:
                        counted[i] = True
                        diary.write(f"{tag()}[Lane {slot['lane']}] {who(side)} moved : {card['name']} "
                                    f"({moved_from}, not a new play)", screen, slot["box"],
                                    f"{side}-moved-{card['name']}")
                    elif side == "You" and "planning" in (state["phase"], state.get("raw_phase")):
                        counted[i] = False         # you can still UNDO: it counts at the reveal
                        print(f"          (placed {card['name']} in lane {slot['lane']}, counts at the reveal)")
                    else:
                        count_play(i, card, why, screen)
                    if learn_board_picture(card, cut_slot(screen, slot), why, library):
                        print(f"          (learned the board picture of {card['name']}: saved in assets/board)")

                forget_old_departures()

                # ----- 3. Update "most copies at the same time" (counted cards only) -----
                for side in ("Enemy", "You"):
                    now = Counter(held[i]["name"] for i, s in enumerate(SLOTS)
                                  if s["side"] == side and held[i] is not None and counted[i])
                    for name, count in now.items():
                        best = stats["most_at_once"][side]
                        best[name] = max(best.get(name, 0), count)

                # Wait for the rest of the second
                time.sleep(max(0, SCAN_EVERY - (time.time() - started)))

        except KeyboardInterrupt:
            pass
        end_match("STOPPED", None)
        print(f"Screenshots and log saved in: {diary.folder}")


def describe(counts, plays):
    """e.g. "Mummy x2 (played 3 times), Koschei x1" """
    parts = []
    for name in sorted(counts, key=lambda n: (-counts[n], n)):
        times = f" (played {plays[name]} times)" if plays.get(name, 0) > counts[name] else ""
        parts.append(f"{name} x{counts[name]}{times}")
    return ", ".join(parts) if parts else "none"


# ---------- 7. START ----------

def main():
    cards = load_cards()
    print(f"Found {len(cards)} cards in cards.js. Learning the card pictures (about 10 seconds)...")
    library = build_library(cards)
    print(f"Ready: {len(library)} cards learned.\n")

    if len(sys.argv) >= 3 and sys.argv[1] == "--test":
        screen = cv2.imread(sys.argv[2])
        if screen is None:
            print("Couldn't open that picture:", sys.argv[2])
            return
        check_screenshot(screen, library, os.path.join(HERE, "check.png"))

    elif len(sys.argv) >= 2 and sys.argv[1] == "--snap":
        import mss
        print("Switch to the game now: screenshot in 5 seconds...")
        time.sleep(5)
        with mss.mss() as grabber:
            screen = take_screenshot(grabber)
        cv2.imwrite(os.path.join(HERE, "snap.png"), screen)
        print(f"Screenshot taken ({screen.shape[1]} x {screen.shape[0]}), saved as snap.png\n")
        check_screenshot(screen, library, os.path.join(HERE, "check.png"))

    else:
        start_with_overlay(cards, library)


def start_with_overlay(cards, library):
    """With a deck.txt: the overlay window runs here, and the watching runs next to
    it (in a 'thread'). Without deck.txt (or with --no-overlay): just watch."""
    deck_file = os.path.join(HERE, "deck.txt")
    if "--no-overlay" in sys.argv or not os.path.exists(deck_file):
        if not os.path.exists(deck_file):
            print("(No deck.txt: no overlay. See deck_example.txt to set one up.)\n")
        watch(library)
        return
    try:
        import threading
        import overlay as overlay_module
        import tkinter  # noqa: F401  (just checking it's there)
    except Exception as error:
        print(f"(Overlay not available: {error}. Watching without it.)\n")
        watch(library)
        return

    decks = overlay_module.load_decks(deck_file, cards)
    if not decks:
        print("(deck.txt has no cards in it: no overlay. See deck_example.txt.)\n")
        watch(library)
        return
    for deck in decks:
        size = sum(n for c, n in deck["cards"])
        print(f"Deck: {deck['name']}  ({deck['hero'] or 'no hero'}, {size} cards)")
        if deck["unknown"]:
            print(f"   ⚠ these cards weren't found: {', '.join(deck['unknown'])}")
    if len(decks) > 1:
        print("The overlay switches to the right deck when it sees your hero.")
    print("Drag the overlay with the mouse, close it with its ✕ (that also stops the tracker).\n")

    from collections import Counter
    shared = {"deck": decks[0], "decks": decks, "drawn": Counter(), "enemy": Counter(),
              "enemy_spells": Counter(), "enemy_tokens": Counter(), "status": "starting...",
              "hwnd": None, "blink": None}
    stop = threading.Event()
    watcher = threading.Thread(target=watch, args=(library, stop, shared))
    watcher.start()

    import signal
    signal.signal(signal.SIGINT, lambda *args: stop.set())    # Ctrl+C also stops everything
    try:
        overlay_module.run_window(shared, stop, WEBSITE)
    finally:
        stop.set()
        watcher.join()


if __name__ == "__main__":
    main()
