# ============================================================
# website.py - saves a match straight into your website's database
# (Firebase), so the overlay's Save button works without opening the website.
#
# It uses the "tracker key" you create on the website (Tools > Link the deck
# tracker), saved in  tracker-app/tracker_key.txt . That file is your login for
# the website's data: keep it private. (.gitignore stops it going to GitHub.)
#
# A save does exactly what the website's Add Match page does:
#   1. adds the match to  users/<you>/matches
#   2. adds its locations to the shared location counter  (stats/locations)
#   3. updates  users/<you>/meta/lastChange  so the website reloads your matches
# ============================================================

import base64
import json
import os
import random
import re
import string
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
WEBSITE = os.path.dirname(HERE)
KEY_FILE = os.path.join(HERE, "tracker_key.txt")
SITE_URL = "https://brainiac1830.github.io/origins-tracker/"
MAX_CARDS = 12           # cards in a complete deck (plus the hero), like settings.js


# ---------- 1. SETTINGS: the key and the website's Firebase project ----------

def read_key():
    """The tracker key (a dict with uid, email, refreshToken), or None if not linked."""
    if not os.path.exists(KEY_FILE):
        return None
    try:
        with open(KEY_FILE, encoding="utf-8") as f:
            text = re.sub(r"\s", "", f.read())
        text += "=" * (-len(text) % 4)
        key = json.loads(base64.b64decode(text).decode("utf-8"))
        return key if key.get("refreshToken") and key.get("uid") else None
    except Exception:
        return None


def is_linked():
    return read_key() is not None


def firebase_config():
    """apiKey and projectId, read from the website's firebase-config.js."""
    with open(os.path.join(WEBSITE, "firebase-config.js"), encoding="utf-8") as f:
        text = f.read()
    return {name: re.search(name + r':\s*"([^"]+)"', text).group(1) for name in ("apiKey", "projectId")}


# ---------- 2. TALKING TO FIREBASE (plain web requests) ----------

def request(url, data=None, token=None, form=False):
    """Sends a web request and returns the JSON answer. Raises an error with
    Firebase's message if something goes wrong."""
    headers = {"Referer": SITE_URL}           # (as if it came from your website)
    if token:
        headers["Authorization"] = "Bearer " + token
    body = None
    if data is not None:
        if form:
            body = urllib.parse.urlencode(data).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as answer:
            return json.loads(answer.read().decode() or "{}")
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")
        try:
            detail = json.loads(detail)["error"]["message"]
        except Exception:
            pass
        raise RuntimeError(f"{error.code}: {detail}")


_token = {"value": None, "until": 0}


def id_token():
    """A short-lived sign-in token, made from the tracker key (renewed every hour)."""
    if _token["value"] and time.time() < _token["until"] - 60:
        return _token["value"]
    key = read_key()
    if key is None:
        raise RuntimeError("The tracker isn't linked to your website yet (no tracker_key.txt).")
    answer = request("https://securetoken.googleapis.com/v1/token?key=" + firebase_config()["apiKey"],
                     {"grant_type": "refresh_token", "refresh_token": key["refreshToken"]}, form=True)
    _token["value"] = answer["id_token"]
    _token["until"] = time.time() + int(answer.get("expires_in", 3600))
    return _token["value"]


def documents_url():
    return f"https://firestore.googleapis.com/v1/projects/{firebase_config()['projectId']}/databases/(default)/documents"


def doc_name(path):
    return f"projects/{firebase_config()['projectId']}/databases/(default)/documents/{path}"


# Firestore sends values with their type, e.g. {"stringValue": "Roo"} or
# {"arrayValue": {"values": [...]}}. These two functions convert to/from Python.
def to_value(value):
    if value is None:
        return {"nullValue": None}
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int):
        return {"integerValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, (list, tuple)):
        return {"arrayValue": {"values": [to_value(v) for v in value]}}
    if isinstance(value, dict):
        return {"mapValue": {"fields": {k: to_value(v) for k, v in value.items()}}}
    return {"stringValue": str(value)}


def from_value(value):
    kind, inner = next(iter(value.items()))
    if kind == "integerValue":
        return int(inner)
    if kind == "arrayValue":
        return [from_value(v) for v in inner.get("values", [])]
    if kind == "mapValue":
        return {k: from_value(v) for k, v in inner.get("fields", {}).items()}
    if kind == "nullValue":
        return None
    return inner                               # strings, numbers, booleans, timestamps


# ---------- 3. READING: your decks, and "is this match saved already?" ----------

def load_decks():
    """Your decks: list of {"id", "name", "version", "hero", "cards", "archived", ...}."""
    uid = read_key()["uid"]
    answer = request(f"{documents_url()}/users/{uid}/decks?pageSize=300", token=id_token())
    decks = []
    for d in answer.get("documents", []):
        deck = {k: from_value(v) for k, v in d.get("fields", {}).items()}
        deck["id"] = d["name"].split("/")[-1]
        decks.append(deck)
    return decks


def already_saved(tracker_id):
    """True if a match with this tracker id is in your matches already."""
    uid = read_key()["uid"]
    query = {"structuredQuery": {
        "from": [{"collectionId": "matches"}],
        "where": {"fieldFilter": {"field": {"fieldPath": "trackerId"}, "op": "EQUAL",
                                  "value": {"stringValue": tracker_id}}},
        "limit": 1}}
    answer = request(f"{documents_url()}/users/{uid}:runQuery", query, token=id_token())
    return any("document" in row for row in answer)


def pick_deck(decks, my_hero, deck_cards):
    """Your deck that best fits what the tracker saw (same as the website does):
    complete, not archived, same hero, most cards in common, newest version on a tie."""
    best, best_score = None, -1
    for deck in decks:
        if deck.get("archived") or not deck.get("hero") or len(deck.get("cards") or []) != MAX_CARDS:
            continue
        if my_hero and deck["hero"] != my_hero:
            continue
        score = len(set(deck["cards"]) & set(deck_cards or []))
        if score > best_score or (score == best_score and deck.get("version", 0) > best.get("version", 0)):
            best, best_score = deck, score
    return best


# ---------- 4. SAVING A MATCH ----------

def new_id():
    """A random 20-letter id, like the ones Firestore makes."""
    return "".join(random.choice(string.ascii_letters + string.digits) for _ in range(20))


def save_match(info):
    """Saves one match. info = what the tracker collected:
       {"id", "result", "difficulty", "opponent", "myHero", "enemyHero",
        "deckCards", "locations", "enemyCards"}
    Returns the deck it was saved with. Raises an error (with a readable message) if not."""
    if info.get("result") not in ("win", "loss", "tie"):
        raise RuntimeError("Pick the result first.")
    if not info.get("difficulty"):
        raise RuntimeError("Pick the difficulty first.")
    if not info.get("enemyHero"):
        raise RuntimeError("The enemy hero isn't known: use the Website button.")
    if already_saved(info["id"]):
        raise RuntimeError("This match is saved already.")
    deck = pick_deck(load_decks(), info.get("myHero"), info.get("deckCards"))
    if deck is None:
        raise RuntimeError("None of your decks matches this hero: use the Website button.")

    uid = read_key()["uid"]
    match = {
        "deckId": deck["id"], "deckName": deck.get("name", ""), "deckVersion": deck.get("version", 1),
        "deckHero": deck["hero"], "opponent": info.get("opponent") or "?", "enemyHero": info["enemyHero"],
        "result": info["result"], "difficulty": info["difficulty"],
        "locations": list(info.get("locations") or [])[:3], "enemyCards": list(info.get("enemyCards") or [])[:12],
        "playedAt": int(time.time() * 1000), "trackerId": info["id"],
    }
    writes = [{
        # 1. the match (plus createdAt / updatedAt set by Firebase's own clock)
        "update": {"name": doc_name(f"users/{uid}/matches/{new_id()}"),
                   "fields": {k: to_value(v) for k, v in match.items()}},
        "updateTransforms": [{"fieldPath": "createdAt", "setToServerValue": "REQUEST_TIME"},
                             {"fieldPath": "updatedAt", "setToServerValue": "REQUEST_TIME"}],
        "currentDocument": {"exists": False},
    }]
    if match["locations"]:
        # 2. the shared location counter: +1 game, +1 for each location
        steps = [{"fieldPath": "games", "increment": {"integerValue": "1"}}]
        steps += [{"fieldPath": f"`{loc}`", "increment": {"integerValue": "1"}} for loc in match["locations"]]
        writes.append({"update": {"name": doc_name("stats/locations"), "fields": {}},
                       "updateMask": {"fieldPaths": []}, "updateTransforms": steps})
    # 3. "matches changed" stamp, so the website downloads your matches again
    writes.append({"update": {"name": doc_name(f"users/{uid}/meta/lastChange"),
                              "fields": {"matches": to_value(int(time.time() * 1000))}},
                   "updateMask": {"fieldPaths": ["matches"]}})
    request(f"{documents_url()}:commit", {"writes": writes}, token=id_token())
    return deck


def add_match_link(info):
    """The website's Add Match page, filled in with this match (the Website button)."""
    code = base64.urlsafe_b64encode(json.dumps(info).encode("utf-8")).decode("ascii").rstrip("=")
    return SITE_URL.rstrip("/") + "/add-match.html#import=" + code


# Run  python website.py  to check the link works (reads your decks, saves nothing).
if __name__ == "__main__":
    if not is_linked():
        print("Not linked yet: create a key on your website (Tools > Link the deck tracker)")
        print("and paste it into", KEY_FILE)
    else:
        try:
            decks = load_decks()
            print(f"Linked ✓  ({read_key().get('email', '?')}) - {len(decks)} decks found:")
            for deck in decks:
                print(f"   {deck.get('name')} v{deck.get('version')}  ({deck.get('hero')})")
        except Exception as error:
            print("The link didn't work:", error)
