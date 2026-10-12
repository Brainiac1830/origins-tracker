# ============================================================
# overlay.py - the deck tracker overlay (Hearthstone Deck Tracker style).
#
# A small always-on-top window on the right of the screen that lists the cards
# of your deck, sorted by mana cost. Cards you've drawn get greyed out, so you
# always see what's left to draw. Below: the enemy's cards seen this match.
#
# Your deck comes from  tracker-app/deck.txt  (see deck_example.txt).
# watch.py starts the overlay by itself when deck.txt exists.
#
# The look is drawn as a picture with Pillow; the window (tkinter) just shows it.
# The window is hidden from screen captures, so the tracker never "sees" it.
# ============================================================

import base64
import io
import os
import re
import threading
import time
from collections import Counter

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

WIDTH = 250          # width of the overlay in pixels
ROW = 30             # height of one card row


# ---------- 1. YOUR DECK (deck.txt) ----------

def simple(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())


CARD_IDS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "card_ids.json")


def decode_deck_code(line):
    """The game's 'Share deck' code, e.g.  KGBLDCdjF8QzAwMDEy...:bebb17fd
    Inside it is a list of the game's card IDs (C00012_MC|C00033_MB|...).
    Returns the list of card names, or None if the line isn't a deck code."""
    import base64
    import json
    body = line.split(":")[0].strip()
    if len(body) < 20 or not re.fullmatch(r"[A-Za-z0-9+/=_-]+", body):
        return None
    ids = []
    for start in range(0, 16):               # the code starts with a few extra letters
        piece = body[start:]
        try:
            text = base64.b64decode(piece + "=" * (-len(piece) % 4)).decode("latin-1")
        except Exception:
            continue
        ids = re.findall(r"[A-Z]\d{5}_[A-Z]{2}", text)
        if len(ids) >= 3:
            break
    if len(ids) < 3:
        return None
    try:
        with open(CARD_IDS, encoding="utf-8") as f:
            names = json.load(f)
    except OSError:
        print("⚠ card_ids.json is missing: can't read the deck code.")
        return []
    return [names.get(i, f"(unknown card {i})") for i in ids]


# The card each hero gives you at the start of the game (it's in your starting hand).
# Legion of the Dead (a Zombie) and Three Not So Little Pigs (three pigs) start with
# units already on the board instead, so they have nothing here.
HERO_STARTING_CARDS = {
    "King Arthur": "Defense Matrix",
    "Mulan": "Reflection",
    "Van Helsing": "Van Helsing's Tools",
    "Dracula": "Brides of Dracula",
    "Merlin": "Merlin's Prophecy",
    "Queen of Hearts": "Off With Your Head",
    "Wicked Stepmother": "Poison Apple",
    "Dorothy": "Twister Toss",
    "Robin Hood": "Bullseye",
}


def load_decks(path, cards):
    """Reads deck.txt, which can hold SEVERAL decks. Each deck starts with a name: line.
    A deck is either the game's deck code (Share deck), or lines like:
         name: Vamp Control
         Dracula            (1 copy - your hero)
         2 Asanbosam        (or: Asanbosam x2)
       Returns a list of decks: {"name": ..., "hero": ..., "cards": [(card, copies), ...]}."""
    if not os.path.exists(path):
        return []
    by_name = {}
    for card in cards:
        by_name.setdefault(simple(card["name"]), card)
        by_name.setdefault(simple(card["id"]), card)
    decks = []
    deck = None

    def start(name):
        nonlocal deck
        deck = {"name": name, "hero": None, "cards": [], "unknown": []}
        decks.append(deck)

    def add(card, copies):
        deck["cards"].append((card, copies))
        if card["type"] == "hero":
            deck["hero"] = card["name"]

    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.split("#")[0].strip()
            if not line:
                continue
            named = re.match(r"^name\s*:\s*(.*)$", line, re.IGNORECASE)    # name: / Name : ...
            if named:
                start(named.group(1).strip() or f"Deck {len(decks) + 1}")
                continue
            from_code = decode_deck_code(line)
            if from_code is not None:
                if deck is None or deck["cards"]:        # a code with no name: line of its own
                    start(f"Deck {len(decks) + 1}")
                # A deck code: the hero is 1 copy, every other card 2 copies
                for name in from_code:
                    card = by_name.get(simple(name))
                    if card:
                        add(card, 1 if card["type"] == "hero" else 2)
                    else:
                        deck["unknown"].append(name)
                continue
            if deck is None:
                start("My deck")
            copies = 1
            m = re.match(r"^(\d+)\s*x?\s+(.+)$", line) or re.match(r"^(.+?)\s*x\s*(\d+)$", line)
            if m:
                a, b = m.groups()
                copies, line = (int(a), b) if a.isdigit() else (int(b), a)
            card = by_name.get(simple(line))
            if card:
                add(card, copies)
            else:
                deck["unknown"].append(line)
    # Add the hero's starting card (one more copy if the deck already has it)
    for d in decks:
        extra = by_name.get(simple(HERO_STARTING_CARDS.get(d["hero"], "")))
        if extra:
            for k, (card, copies) in enumerate(d["cards"]):
                if card["name"] == extra["name"]:
                    d["cards"][k] = (card, copies + 1)
                    break
            else:
                d["cards"].append((extra, 1))
    return [d for d in decks if d["cards"]]


def load_deck(path, cards):
    """Just the first deck of deck.txt (or None)."""
    decks = load_decks(path, cards)
    return decks[0] if decks else None


def choose_deck(decks, hero, hand=None):
    """Picks the deck you're playing: the one with your hero. If several decks use
    that hero, the one holding the most cards of your starting hand.
    Returns None if no deck has that hero."""
    same_hero = [d for d in decks if d["hero"] == hero]
    if not same_hero:
        return None
    if hand and len(same_hero) > 1:
        def fits(d):
            names = {c["name"] for c, n in d["cards"]}
            return sum(1 for card in hand if card in names)
        return max(same_hero, key=fits)          # (a tie keeps the first one in deck.txt)
    return same_hero[0]


# ---------- 2. PICTURES ----------

FONT_FILES = ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]


def font(size):
    for f in FONT_FILES:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


_strips = {}


def art_strip(card, website):
    """A thin horizontal slice of the card's art, used as the row background."""
    if card["id"] in _strips:
        return _strips[card["id"]]
    name = os.path.basename(card["image"])
    board = os.path.join(website, "assets", "board", name)
    picture = cv2.imread(board) if os.path.exists(board) else None
    if picture is not None:
        h, w = picture.shape[:2]
        piece = picture[int(h * 0.20):int(h * 0.34), int(w * 0.12):int(w * 0.88)]   # inside the white frame
    else:
        picture = cv2.imread(os.path.join(website, card["image"]))
        if picture is None:
            _strips[card["id"]] = None
            return None
        h, w = picture.shape[:2]
        piece = picture[int(h * 0.18):int(h * 0.32), int(w * 0.12):int(w * 0.88)]
    piece = cv2.resize(piece, (150, ROW - 2))
    strip = Image.fromarray(cv2.cvtColor(piece, cv2.COLOR_BGR2RGB))
    _strips[card["id"]] = strip
    return strip


# ---------- 3. DRAWING THE OVERLAY ----------

BG = (24, 16, 40)            # dark purple, like the website
PANEL = (42, 28, 66)
TEXT = (255, 255, 255)
DIM = (120, 110, 140)
MANA = (40, 150, 230)
GOLD = (240, 190, 60)
GREEN = (60, 220, 160)
RED = (230, 70, 110)
LILAC = (190, 150, 255)


def star(d, cx, cy, r, fill):
    """A 5-pointed star (the font has no star sign)."""
    import math
    points = []
    for k in range(10):
        radius = r if k % 2 == 0 else r * 0.45
        angle = math.pi / 2 + k * math.pi / 5
        points.append((cx + radius * math.cos(angle), cy - radius * math.sin(angle)))
    d.polygon(points, fill=fill)


# Where the clickable "Match" lines are drawn: name -> (top, bottom) in pixels.
# Filled in by render(), used by the window to know what was clicked.
CLICK_ZONES = {}         # name -> (left, top, right, bottom)
LINE = 17                # height of one line of the Match panel
DIFFICULTIES = [("easy", "Easy"), ("medium", "Medium"), ("hard", "Hard")]


def panel_height(pending):
    """Match panel: opponent, 3 locations, difficulty (+ a title and buttons after a game)."""
    return LINE * (5 + (2 if pending else 0)) + 6


def final_info(pending):
    """The finished game's info with your corrections applied (what Save sends)."""
    info = dict(pending["info"])
    manual, seen = pending.get("manual") or {}, pending.get("detected") or {}
    info["opponent"] = manual.get("opponent") or seen.get("opponent") or ""
    locations = dict(seen.get("locations") or {})
    locations.update(manual.get("locations") or {})
    info["locations"] = [locations[lane]["id"] for lane in (1, 2, 3) if lane in locations]
    info["difficulty"] = manual.get("difficulty")
    return info


def match_lines(match, manual):
    """The Match panel's 4 lines: (zone, label, text, colour).
    Corrected values (manual) are gold, read values white, unknown ones dim."""
    match, manual = match or {}, manual or {}
    lines = []
    if manual.get("opponent"):
        text, colour = manual["opponent"], GOLD
    elif match.get("opponent"):
        text, colour = match["opponent"], TEXT
    else:
        text, colour = "? (click to type it)", DIM
    hero = match.get("hero")
    lines.append(("opponent", "vs", text + (f"  ·  {hero}" if hero and colour != DIM else ""), colour))
    for lane in (1, 2, 3):
        chosen = (manual.get("locations") or {}).get(lane)
        seen = (match.get("locations") or {}).get(lane)
        if isinstance(seen, dict):
            seen = seen["name"]
        if chosen:
            text, colour = chosen["name"], GOLD
        elif seen:
            text, colour = seen, TEXT
        else:
            text, colour = "? (click to pick)", DIM
        lines.append((f"loc{lane}", f"L{lane}", text, colour))
    return lines


def render(deck, drawn, enemy, status, website, enemy_spells=None, enemy_tokens=None, warning=None,
           match=None, manual=None, pending=None):
    """Draws the whole overlay. drawn = Counter of card names you've drawn,
    enemy / enemy_spells / enemy_tokens = Counters of what the opponent played,
    cast and summoned. match / manual = the Match panel (read / corrected values).
    Returns a Pillow image."""
    enemy_spells = enemy_spells or Counter()
    enemy_tokens = enemy_tokens or Counter()
    rows = sorted(deck["cards"], key=lambda cc: (int(cc[0].get("cost") or 0), cc[0]["name"]))
    total = sum(n for c, n in rows)
    left_total = sum(max(0, n - drawn[c["name"]]) for c, n in rows)

    # One list: units in white, spells in lilac (tokens aren't shown), most played first
    items = [(name, n, TEXT) for name, n in enemy.items()] + \
            [(name, n, LILAC) for name, n in enemy_spells.items()]
    items.sort(key=lambda item: (-item[1], item[0]))
    enemy_height = (len(items) + 1) // 2 * 18 + 4
    if pending:                      # after a game: show that game until it's saved or closed
        match, manual = pending.get("detected"), pending.get("manual")
    match_height = panel_height(pending)
    height = 58 + match_height + len(rows) * (ROW + 2) + 34 + max(18, enemy_height) + 30 + (18 if warning else 0)
    img = Image.new("RGB", (WIDTH, height), BG)
    d = ImageDraw.Draw(img)
    big, mid, small = font(15), font(13), font(11)

    # Title bar
    d.rectangle([0, 0, WIDTH, 26], fill=PANEL)
    d.text((8, 5), deck["name"][:24], font=big, fill=TEXT)
    d.line([WIDTH - 20, 8, WIDTH - 10, 18], fill=DIM, width=2)     # close button (an X)
    d.line([WIDTH - 20, 18, WIDTH - 10, 8], fill=DIM, width=2)
    d.text((8, 32), f"In deck: {left_total}/{total}", font=mid, fill=GREEN)
    d.text((WIDTH - 8 - d.textlength(status, font=small), 34), status, font=small, fill=DIM)

    # The Match panel: opponent, locations, difficulty (click to correct / choose)
    y = 54
    CLICK_ZONES.clear()
    d.rectangle([4, y - 2, WIDTH - 4, y + match_height - 6], fill=(30, 22, 48))
    if pending:
        won = pending.get("title") == "VICTORY"
        d.text((10, y), ("Last game: VICTORY" if won else "Last game: DEFEAT"), font=small, fill=GREEN if won else RED)
        d.text((WIDTH - 44, y), "close", font=small, fill=DIM)
        CLICK_ZONES["dismiss"] = (WIDTH - 70, y - 2, WIDTH - 4, y + LINE - 2)
        y += LINE
    for zone, label, text, colour in match_lines(match, manual):
        d.text((10, y), label, font=small, fill=RED if zone == "opponent" else MANA)
        shown = text
        if d.textlength(shown, font=small) > WIDTH - 50:
            while d.textlength(shown + "…", font=small) > WIDTH - 50 and len(shown) > 4:
                shown = shown[:-1]                       # shorten to fit the line
            shown = shown.rstrip() + "…"
        d.text((34, y), shown, font=small, fill=colour)
        CLICK_ZONES[zone] = (0, y - 2, WIDTH, y + LINE - 2)
        y += LINE
    # Difficulty: three small buttons
    d.text((10, y), "Diff", font=small, fill=DIM)
    chosen = (manual or {}).get("difficulty")
    x = 44
    for value, word in DIFFICULTIES:
        w = d.textlength(word, font=small) + 12
        on = chosen == value
        d.rounded_rectangle([x, y - 1, x + w, y + 14], radius=4, fill=GOLD if on else PANEL)
        d.text((x + 6, y), word, font=small, fill=(20, 14, 32) if on else TEXT)
        CLICK_ZONES["diff-" + value] = (x, y - 2, x + w, y + LINE - 2)
        x += w + 6
    y += LINE
    if pending:
        # Buttons: Save (needs the tracker key) and Website (opens the filled-in Add Match page)
        x = 10
        buttons = (["save"] if pending.get("linked") else []) + ["website"]
        for name in buttons:
            word = "Save" if name == "save" else "Website"
            w = d.textlength(word, font=small) + 16
            d.rounded_rectangle([x, y - 1, x + w, y + 14], radius=4, fill=GREEN if name == "save" else PANEL)
            d.text((x + 8, y), word, font=small, fill=(20, 14, 32) if name == "save" else TEXT)
            CLICK_ZONES[name] = (x, y - 2, x + w, y + LINE - 2)
            x += w + 6
        note = pending.get("status") or ("" if (manual or {}).get("difficulty") else "pick the difficulty")
        if d.textlength(note, font=small) > WIDTH - x - 8:
            while note and d.textlength(note + "…", font=small) > WIDTH - x - 8:
                note = note[:-1]
            note = note.rstrip() + "…"
        d.text((x + 2, y), note, font=small, fill=GOLD if "✓" in note else DIM)
        y += LINE
    y = 54 + match_height

    for card, copies in rows:
        left = max(0, copies - drawn[card["name"]])
        gone = left == 0
        # row background + art strip on the right
        d.rectangle([4, y, WIDTH - 4, y + ROW - 1], fill=(30, 22, 48) if gone else PANEL)
        strip = art_strip(card, website)
        if strip is not None:
            s = strip if not gone else Image.eval(strip, lambda v: v // 4)
            # fade the strip in from the left (Hearthstone style)
            ramp = np.clip(np.linspace(0, 1.6, s.size[0]), 0, 1) * 255
            mask = Image.fromarray(np.tile(ramp.astype(np.uint8), (s.size[1], 1)), "L")
            img.paste(s, (WIDTH - 4 - 26 - s.size[0], y + 1), mask)
        # mana cost
        cx = 18
        d.regular_polygon((cx, y + ROW // 2, 11), 6, rotation=30, fill=MANA if not gone else (40, 50, 70))
        cost = str(card.get("cost") if card.get("cost") is not None else "?")
        d.text((cx - d.textlength(cost, font=mid) / 2, y + 7), cost, font=mid, fill=TEXT if not gone else DIM)
        # name (with a dark outline so it's readable over the art)
        name = card["name"][:22]
        colour = TEXT if not gone else DIM
        d.text((36, y + 7), name, font=mid, fill=colour, stroke_width=2, stroke_fill=(0, 0, 0))
        # copies left (hero = star)
        box = [WIDTH - 28, y + 3, WIDTH - 7, y + ROW - 4]
        d.rectangle(box, fill=(20, 14, 32))
        if card["type"] == "hero":
            star(d, WIDTH - 17, y + ROW // 2 - 1, 8, GOLD if not gone else DIM)
        else:
            mark = str(left)
            d.text((WIDTH - 17 - d.textlength(mark, font=mid) / 2, y + 7), mark, font=mid,
                   fill=GOLD if left == copies else (TEXT if left else DIM))
        y += ROW + 2

    # Enemy cards seen
    y += 6
    d.rectangle([0, y, WIDTH, y + 22], fill=PANEL)
    d.text((8, y + 4), "Opponent played", font=mid, fill=RED)
    y += 28
    if not items:
        d.text((8, y), "nothing yet", font=small, fill=DIM)
    for k, (name, n, colour) in enumerate(items):
        x = 8 if k % 2 == 0 else WIDTH // 2 + 2
        count = f" x{n}" if n > 1 else ""
        label, short = name + count, name
        while d.textlength(label, font=small) > WIDTH // 2 - 12 and len(short) > 3:
            short = short[:-1]                       # shorten long names to fit the column
            label = short.rstrip() + "…" + count
        d.text((x, y + (k // 2) * 18), label, font=small, fill=colour)
    y += (len(items) + 1) // 2 * 18 + 4
    if warning:
        d.text((8, height - 36), warning, font=small, fill=GOLD)
    if deck.get("unknown"):
        d.text((8, height - 18), f"Not found in cards: {', '.join(deck['unknown'])[:34]}", font=small, fill=RED)
    return img


# ---------- 4. THE WINDOW ----------

def run_window(state, stop, website, refresh_ms=400):
    """Shows the overlay until it's closed (or 'stop' is set).
    state = {"deck": ..., "drawn": Counter, "enemy": Counter, "enemy_spells": Counter,
             "enemy_tokens": Counter, "status": str}"""
    import tkinter as tk

    root = tk.Tk()
    root.title("Origins deck tracker")
    root.overrideredirect(True)             # no window frame
    root.attributes("-topmost", True)       # always on top of the game
    try:
        root.attributes("-alpha", 0.92)     # very slightly see-through
    except tk.TclError:
        pass
    label = tk.Label(root, bd=0, bg="#180f28")
    label.pack()

    # Start on the right side of the screen, under the top bar
    screen_w = root.winfo_screenwidth()
    root.geometry(f"+{screen_w - WIDTH - 4}+{90}")   # right edge, clear of the board

    # Hide the overlay from screen captures (Windows 10 2004+), so the tracker's
    # screenshots still show the game underneath it. watch.py then checks that it
    # really worked (see seen_by_capture below).
    def hide_from_capture():
        state["hwnd"] = None
        try:
            import ctypes
            from ctypes import wintypes
            user32 = ctypes.windll.user32
            user32.GetParent.restype = wintypes.HWND
            user32.GetAncestor.restype = wintypes.HWND
            user32.SetWindowDisplayAffinity.argtypes = [wintypes.HWND, wintypes.DWORD]
            user32.GetWindowDisplayAffinity.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
            inner = root.winfo_id()
            candidates = []
            try:
                candidates.append(int(root.wm_frame(), 16))      # Tk's outer window
            except Exception:
                pass
            candidates += [user32.GetAncestor(inner, 2), user32.GetParent(inner), inner]   # 2 = GA_ROOT
            for hwnd in candidates:
                if not hwnd:
                    continue
                user32.SetWindowDisplayAffinity(hwnd, 0x11)     # WDA_EXCLUDEFROMCAPTURE
                got = wintypes.DWORD(0)
                if user32.GetWindowDisplayAffinity(hwnd, ctypes.byref(got)) and got.value == 0x11:
                    state["hwnd"] = hwnd
                    return
            state["hwnd"] = candidates[0] if candidates else None   # (watch.py will notice)
        except Exception as error:
            print(f"(Couldn't hide the overlay from screenshots: {error})")
    root.after(300, hide_from_capture)

    # Drag it anywhere with the mouse; click the ✕ (top right) to close;
    # click a line of the Match panel (without dragging) to correct it
    drag = {"x": 0, "y": 0, "moved": False}
    manual = state.setdefault("manual", {"opponent": None, "locations": {}})

    def press(event):
        if event.y < 26 and event.x > WIDTH - 28:
            stop.set()
            return
        drag["x"], drag["y"], drag["moved"] = event.x, event.y, False

    def move(event):
        if abs(event.x - drag["x"]) + abs(event.y - drag["y"]) > 3:
            drag["moved"] = True
        root.geometry(f"+{root.winfo_x() + event.x - drag['x']}+{root.winfo_y() + event.y - drag['y']}")

    def release(event):
        if drag["moved"]:
            return
        for zone, (left, top, right, bottom) in list(CLICK_ZONES.items()):
            if left <= event.x <= right and top <= event.y <= bottom:
                clicked(zone)
                return

    def current_manual():
        """Corrections go to the finished game while it's shown, otherwise to the live game."""
        pending = state.get("pending")
        target = pending if pending else state
        return target.setdefault("manual", {"opponent": None, "locations": {}})

    def clicked(zone):
        pending = state.get("pending")
        if zone.startswith("diff-"):
            value = zone[5:]
            manual_now = current_manual()
            manual_now["difficulty"] = None if manual_now.get("difficulty") == value else value
        elif zone == "dismiss":
            state["pending"] = None
        elif zone == "website" and pending:
            import webbrowser
            import website as site
            webbrowser.open(site.add_match_link(final_info(pending)))
        elif zone == "save" and pending:
            save_pending(pending)
        else:
            open_editor(zone)

    def save_pending(pending):
        """Saves the finished game to the website (in the background, so the overlay
        doesn't freeze while it talks to the internet)."""
        if pending.get("saving"):
            return
        if not (pending.get("manual") or {}).get("difficulty"):
            pending["status"] = "pick the difficulty first"
            return
        pending["saving"], pending["status"] = True, "saving..."

        def work():
            import website as site
            try:
                deck = site.save_match(final_info(pending))
                pending["status"] = f"saved ✓ ({deck.get('name')})"
                pending["close_at"] = time.time() + 4        # then the panel goes back to live
            except Exception as error:
                pending["status"] = f"not saved: {error}"
                print(f"(Overlay Save: {error})")
            pending["saving"] = False
        threading.Thread(target=work, daemon=True).start()

    label.bind("<Button-1>", press)
    label.bind("<B1-Motion>", move)
    label.bind("<ButtonRelease-1>", release)

    editor = {"window": None}

    def open_editor(zone):
        """A small window to type the opponent's name or pick a location."""
        if editor["window"] is not None:
            editor["window"].destroy()
        win = tk.Toplevel(root)
        editor["window"] = win
        win.attributes("-topmost", True)
        win.configure(bg="#180f28", padx=10, pady=8)
        win.geometry(f"+{max(0, root.winfo_x() - 270)}+{root.winfo_y() + 40}")
        style = {"bg": "#180f28", "fg": "white"}
        manual = current_manual()

        def close():
            editor["window"] = None
            win.destroy()

        if zone == "opponent":
            win.title("Opponent's name")
            tk.Label(win, text="Opponent's name:", **style).pack(anchor="w")
            entry = tk.Entry(win, width=28)
            seen = (state.get("pending") or {}).get("detected") or state.get("match") or {}
            entry.insert(0, manual.get("opponent") or seen.get("opponent") or "")
            entry.pack(pady=4)
            entry.focus_force()
            entry.select_range(0, "end")

            def save(event=None):
                manual["opponent"] = entry.get().strip() or None
                close()
            entry.bind("<Return>", save)
            row = tk.Frame(win, bg="#180f28")
            row.pack(fill="x")
            tk.Button(row, text="Save", command=save).pack(side="left")
            tk.Button(row, text="Use what the tracker read",
                      command=lambda: (manual.update(opponent=None), close())).pack(side="left", padx=6)
        else:
            lane = int(zone[-1])
            win.title(f"Location {lane}")
            tk.Label(win, text=f"Location {lane} (lane {lane}) - type to search:", **style).pack(anchor="w")
            search = tk.Entry(win, width=30)
            search.pack(pady=4)
            search.focus_force()
            box = tk.Listbox(win, height=10, width=32, exportselection=False)
            box.pack()
            everything = sorted(state.get("locations_list") or [], key=lambda loc: loc["name"])
            shown = []

            def fill(event=None):
                text = search.get().strip().lower()
                shown[:] = [loc for loc in everything if text in loc["name"].lower()]
                box.delete(0, "end")
                for loc in shown:
                    box.insert("end", loc["name"])
                if shown:
                    box.selection_set(0)

            def pick(event=None):
                chosen = box.curselection()
                if shown and chosen:
                    manual.setdefault("locations", {})[lane] = shown[chosen[0]]
                close()
            search.bind("<KeyRelease>", fill)
            search.bind("<Return>", pick)
            box.bind("<Double-Button-1>", pick)
            box.bind("<Return>", pick)
            row = tk.Frame(win, bg="#180f28")
            row.pack(fill="x", pady=(6, 0))
            tk.Button(row, text="Pick", command=pick).pack(side="left")
            tk.Button(row, text="Use what the tracker read",
                      command=lambda: ((manual.get("locations") or {}).pop(lane, None), close())).pack(side="left", padx=6)
            fill()
        win.bind("<Escape>", lambda event: close())
        win.protocol("WM_DELETE_WINDOW", close)

    shown = {"key": None, "photo": None}

    def refresh():
        if stop.is_set():
            root.destroy()
            return
        try:      # (the tracker may be updating the numbers at this very moment)
            key = (tuple(sorted(dict(state["drawn"]).items())), tuple(sorted(dict(state["enemy"]).items())),
                   tuple(sorted(dict(state.get("enemy_spells") or {}).items())),
                   tuple(sorted(dict(state.get("enemy_tokens") or {}).items())),
                   state["status"], id(state["deck"]), state.get("warning"),
                   repr(state.get("match")), repr(state.get("manual")), repr(state.get("pending")))
            deck = state["deck"]
            match, manual_now = dict(state.get("match") or {}), dict(state.get("manual") or {})
            pending = state.get("pending")
            if pending and pending.get("close_at") and time.time() > pending["close_at"]:
                state["pending"] = pending = None            # saved: back to the live game
        except RuntimeError:
            root.after(50, refresh)
            return
        if key != shown["key"]:
            shown["key"] = key
            picture = render(deck, Counter(dict(key[0])), Counter(dict(key[1])), key[4], website,
                             Counter(dict(key[2])), Counter(dict(key[3])), key[6], match, manual_now, pending)
            data = io.BytesIO()
            picture.save(data, "PNG")
            shown["photo"] = tk.PhotoImage(data=base64.b64encode(data.getvalue()))
            label.configure(image=shown["photo"])
        root.after(refresh_ms, refresh)

    refresh()
    root.mainloop()


# ---------- 5. CAN THE TRACKER SEE THE OVERLAY? ----------
# If hiding from screenshots doesn't work on this PC, the overlay would cover the game
# in the tracker's screenshots (e.g. the reveal pop-up, top left). Then watch.py makes
# the overlay see-through for a split second while it takes each screenshot.

ALPHA = int(0.92 * 255)


def set_alpha(hwnd, alpha):
    import ctypes
    from ctypes import wintypes
    user32 = ctypes.windll.user32
    user32.SetLayeredWindowAttributes.argtypes = [wintypes.HWND, wintypes.DWORD, ctypes.c_ubyte, wintypes.DWORD]
    user32.SetLayeredWindowAttributes(hwnd, 0, alpha, 2)       # 2 = LWA_ALPHA


def window_box(hwnd):
    """The overlay's position on the screen: {left, top, width, height} or None."""
    import ctypes
    from ctypes import wintypes
    rect = wintypes.RECT()
    if not ctypes.windll.user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(rect)):
        return None
    if rect.right - rect.left < 20 or rect.bottom - rect.top < 20:
        return None
    return {"left": rect.left, "top": rect.top,
            "width": rect.right - rect.left, "height": rect.bottom - rect.top}


def seen_by_capture(hwnd, grabber):
    """Takes two small screenshots of the overlay's spot: one normal, one with the
    overlay made invisible. If they differ a lot, screenshots DO see the overlay.
    Returns True / False, or None if it can't tell (e.g. the overlay is off-screen)."""
    import time
    box = window_box(hwnd)
    if box is None:
        return None
    try:
        normal = np.array(grabber.grab(box))[:, :, :3].astype("int16")
        set_alpha(hwnd, 0)
        time.sleep(0.12)
        hidden = np.array(grabber.grab(box))[:, :, :3].astype("int16")
    except Exception:
        return None
    finally:
        set_alpha(hwnd, ALPHA)
    return float(np.abs(normal - hidden).mean()) > 12


def covers(hwnd, boxes, monitor):
    """True if the overlay sits on top of any of these boxes (fractions of the
    screen; monitor = {left, top, width, height} of the game's screen)."""
    box = window_box(hwnd)
    if box is None:
        return False
    ox1, oy1 = box["left"] - monitor["left"], box["top"] - monitor["top"]
    ox2, oy2 = ox1 + box["width"], oy1 + box["height"]
    for (l, t, r, b) in boxes:
        x1, y1, x2, y2 = l * monitor["width"], t * monitor["height"], r * monitor["width"], b * monitor["height"]
        overlap = max(0, min(ox2, x2) - max(ox1, x1)) * max(0, min(oy2, y2) - max(oy1, y1))
        if overlap > 0.05 * (x2 - x1) * (y2 - y1):
            return True
    return False
