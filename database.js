// ============================================================
// database.js — reading and writing data in Firestore.
// Pages call these simple functions instead of talking to Firebase directly.
//
// How Firestore stores things:
//   a "collection" is like a folder, a "document" is like a file inside it,
//   and each document holds fields (name, version, hero, cards...).
//
// ---------- Where everything lives ----------
// Every player has their OWN private folder, named after their Google account id:
//
//   users/<your id>/decks/...           your decks
//   users/<your id>/matches/...         your matches
//   users/<your id>/meta/lastChange     "last changed" stamps (see below)
//
// Plus ONE shared document that every player adds to:
//
//   stats/locations    how many games each location appeared in, across all
//                      players, e.g. { games: 40, "the-hill": 12, ... }
//                      (no names or decks, just counts)
//
// One deck:  { name, version, familyId, hero, cards: [12 ids], category, createdAt, updatedAt }
// One match: { deckId, deckName, deckVersion, deckHero, opponent, enemyHero,
//              result, difficulty, locations: [up to 3 ids], enemyCards: [ids], playedAt, ... }
//
// ---------- Staying inside the free plan ----------
// Every document downloaded counts as 1 read (50,000 free per day). So your
// browser keeps a copy of your data, and each page load only reads your small
// "lastChange" document (1 read). Only when something changed since the copy
// was made is everything downloaded again. Every save updates lastChange.
// ============================================================

import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
         serverTimestamp, increment, writeBatch }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db, auth } from "./firebase.js";


// ---------- 1. PATHS TO YOUR OWN FOLDER ----------

// The signed-in player's account id (pages only call us once someone is signed in)
function uid() {
  return auth.currentUser.uid;
}

// collection(db, "users", <id>, "decks")  =  the folder users/<id>/decks
function myCollection(name) {
  return collection(db, "users", uid(), name);
}

// doc(db, "users", <id>, "decks", <deckId>)  =  one file in that folder
function myDoc(name, id) {
  return doc(db, "users", uid(), name, id);
}

function metaDoc() {
  return myDoc("meta", "lastChange");
}

const LOCATION_STATS = ["stats", "locations"];   // the shared counter document


// ---------- 2. THE BROWSER'S COPY (cache) ----------

// Every cache entry's name starts with this (firebase.js clears them when you sign out).
// The account id is part of the name, so two players on one computer never mix.
export const CACHE_PREFIX = "origins-cache-";

function cacheKey(name) {
  return CACHE_PREFIX + uid() + "-" + name;
}

function readCache(name) {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(name)));
  } catch (error) {
    return null;   // broken or blocked: just ignore it
  }
}

function writeCache(name, data) {
  try {
    localStorage.setItem(cacheKey(name), JSON.stringify(data));
  } catch (error) {
    console.warn("Couldn't save the local copy:", error);   // the site still works without it
  }
}

// Firestore dates are special objects that can't be stored in localStorage,
// so we turn them into plain numbers (milliseconds since 1970).
function plainValues(data) {
  const result = {};
  for (const [key, value] of Object.entries(data)) {       // Object.entries = Python's dict.items()
    result[key] = value && typeof value.toMillis === "function" ? value.toMillis() : value;
  }
  return result;
}


// ---------- 3. ONE-TIME MOVE OF THE OLD SHARED DATA ----------
// Before this update, all data sat in shared top-level folders ("decks", "matches").
// The first time the owner signs in after the update, their data is copied into
// their own folder (same ids, so matches still point to the right decks), and its
// locations are added to the shared counter. For anyone else the old folders
// can't be read (see the rules), so there's simply nothing to move.
// The old copies are left untouched as a backup.

let migrationPromise = null;   // so it only runs once, even if decks and matches load at the same time

function ensureMigrated() {
  if (!migrationPromise) {
    migrationPromise = runMigration();
  }
  return migrationPromise;
}

async function runMigration() {
  // Already done on this browser? (saves 1 read)
  const doneKey = cacheKey("migrated");
  try {
    if (localStorage.getItem(doneKey) === "yes") {
      return;
    }
  } catch (e) { /* storage blocked: just check the database */ }

  const metaSnap = await getDoc(metaDoc());
  if (metaSnap.exists() && metaSnap.data().migrated) {
    try { localStorage.setItem(doneKey, "yes"); } catch (e) { /* not important */ }
    return;
  }

  // Try to read the old shared folders. Not allowed = nothing to move.
  let oldDecks = [];
  let oldMatches = [];
  try {
    oldDecks = (await getDocs(collection(db, "decks"))).docs;
    oldMatches = (await getDocs(collection(db, "matches"))).docs;
  } catch (error) {
    oldDecks = [];
    oldMatches = [];
  }

  // Copy them in groups ("batches") of up to 400 writes, which Firestore saves all at once
  const copies = [];
  for (const d of oldDecks)   { copies.push([myDoc("decks", d.id), d.data()]); }
  for (const m of oldMatches) { copies.push([myDoc("matches", m.id), m.data()]); }
  for (let start = 0; start < copies.length; start += 400) {
    const batch = writeBatch(db);
    for (const [ref, data] of copies.slice(start, start + 400)) {
      batch.set(ref, data);
    }
    await batch.commit();
  }

  // Add the old matches' locations to the shared counter
  await changeLocationStats([], oldMatches.map(function (m) { return m.data().locations || []; }));

  // Remember it's done (and mark both collections as changed so fresh copies are downloaded)
  const now = Date.now();
  await setDoc(metaDoc(), { migrated: true, decks: now, matches: now }, { merge: true });
  try { localStorage.setItem(doneKey, "yes"); } catch (e) { /* not important */ }
}


// ---------- 4. "LAST CHANGED" STAMPS AND LOADING ----------

// Records that a collection just changed. Costs 1 write. Returns the new stamp.
async function markChanged(name) {
  const stamp = Date.now();
  // { merge: true } = only change this one field, keep the others
  await setDoc(metaDoc(), { [name]: stamp }, { merge: true });
  return stamp;
}

// Loads all of your documents in a collection, using the browser's copy when it's still correct.
// If the database refuses (account not on the player list), a clear message is given instead.
async function loadCollection(name) {
  try {
    return await loadCollectionInner(name);
  } catch (error) {
    if (error.code === "permission-denied") {
      throw new Error("This Google account isn't on the player list yet. Ask the site owner to add your email.");
    }
    throw error;
  }
}

async function loadCollectionInner(name) {
  await ensureMigrated();

  // 1 read: when did this collection last change?
  const metaSnap = await getDoc(metaDoc());
  let stamp = metaSnap.exists() ? (metaSnap.data()[name] || 0) : 0;

  const cached = readCache(name);
  if (cached && stamp !== 0 && cached.stamp === stamp) {
    return cached.items;                       // nothing changed: no more reads
  }

  // Otherwise download everything (1 read per document)
  const snapshot = await getDocs(myCollection(name));
  const items = snapshot.docs.map(function (d) {
    return { id: d.id, ...plainValues(d.data()) };   // "...": copy all fields in (Python's **dict)
  });

  if (stamp === 0) {
    stamp = await markChanged(name);
  }
  writeCache(name, { stamp: stamp, items: items });
  return items;
}


// ---------- 5. DECKS ----------

export async function loadDecks() {
  return loadCollection("decks");
}

// Save a brand-new deck. Returns its new id.
export async function createDeck(deck) {
  const ref = doc(myCollection("decks"));        // a new empty document with a random id
  await setDoc(ref, {
    ...deck,
    familyId: deck.familyId || ref.id,           // a new v1 deck starts its own family
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await markChanged("decks");
  return ref.id;
}

// Change some fields, e.g. updateDeck(id, { category: "general" })
export async function updateDeck(id, changes) {
  await updateDoc(myDoc("decks", id), { ...changes, updatedAt: serverTimestamp() });
  await markChanged("decks");
}

export async function deleteDeck(id) {
  await deleteDoc(myDoc("decks", id));
  await markChanged("decks");
}


// ---------- 6. MATCHES ----------
// Adding, editing and deleting a match also updates the shared location counter.

export async function loadMatches() {
  return loadCollection("matches");
}

export async function createMatch(match) {
  const ref = doc(myCollection("matches"));
  await setDoc(ref, { ...match, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await changeLocationStats([], [match.locations]);
  await markChanged("matches");
  return ref.id;
}

// oldMatch = the match as it was before editing (to fix the location counts)
export async function updateMatch(id, changes, oldMatch) {
  await updateDoc(myDoc("matches", id), { ...changes, updatedAt: serverTimestamp() });
  await changeLocationStats([oldMatch.locations || []], [changes.locations || []]);
  await markChanged("matches");
}

// match = the match being deleted (to take its locations off the counter)
export async function deleteMatch(id, match) {
  await deleteDoc(myDoc("matches", id));
  await changeLocationStats([match.locations || []], []);
  await markChanged("matches");
}


// ---------- 7. SHARED LOCATION COUNTER ----------

// Takes games off the counter (removed) and adds games to it (added).
// Each item is one game's list of location ids. A game only counts toward
// "games" if at least one location was recorded for it.
// increment(n) tells Firestore to add n to the number already there (n can be negative),
// so two players saving at the same moment never overwrite each other.
async function changeLocationStats(removed, added) {
  const deltas = {};                              // e.g. { games: 1, "the-hill": 1 }

  function count(games, sign) {
    for (const locations of games) {
      if (locations.length === 0) {
        continue;
      }
      deltas.games = (deltas.games || 0) + sign;
      for (const id of locations) {
        deltas[id] = (deltas[id] || 0) + sign;
      }
    }
  }
  count(removed, -1);
  count(added, +1);

  // Turn the numbers into increment() instructions, skipping anything that cancels out to 0
  const changes = {};
  for (const [key, value] of Object.entries(deltas)) {
    if (value !== 0) {
      changes[key] = increment(value);
    }
  }
  if (Object.keys(changes).length === 0) {
    return;                                       // nothing to change: no write
  }
  await setDoc(doc(db, ...LOCATION_STATS), changes, { merge: true });
}

// Read the shared counter (1 read). Returns e.g. { games: 40, "the-hill": 12, ... }
export async function loadLocationStats() {
  const snap = await getDoc(doc(db, ...LOCATION_STATS));
  return snap.exists() ? snap.data() : { games: 0 };
}
