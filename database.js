// ============================================================
// database.js — reading and writing your data in Firestore.
// Pages call these simple functions instead of talking to Firebase directly.
//
// How Firestore stores things:
//   a "collection" is like a folder      -> "decks"
//   a "document" is like a file inside   -> one deck
//   each document holds fields           -> name, version, hero, cards...
//
// One deck document looks like this:
//   {
//     name: "Dracula Discard",
//     version: 2,
//     familyId: "abc123",        // same for v1, v2, v3... of one deck
//     hero: "dracula",
//     cards: ["bullseye", ...],  // 12 card ids
//     category: "tournament",    // or "general"
//     createdAt, updatedAt       // dates, filled in by Firebase
//   }
//
// ---------- Staying inside the free plan ----------
// The free plan allows 50,000 reads per day, and every document downloaded
// counts as 1 read. So instead of downloading every deck on every page load:
//
//   1. The database has one small document, meta/lastChange, holding the time
//      each collection last changed, e.g. { decks: 1790745606275 }
//   2. Your browser keeps a copy of the decks (in localStorage), together with
//      the time that copy was made.
//   3. Each page load reads ONLY meta/lastChange (1 read). If the times match,
//      the browser's copy is still correct and nothing else is downloaded.
//   4. Every save/change/delete updates meta/lastChange (1 extra write), so
//      the next page load knows it must download fresh data. This also keeps
//      your other devices (phone, laptop) up to date.
// ============================================================

import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "./firebase.js";


// ---------- 1. THE BROWSER'S COPY (cache) ----------

// Every cache entry's name starts with this, so it's easy to find and clear
export const CACHE_PREFIX = "origins-cache-";

function readCache(name) {
  // try/catch: if the saved copy is broken for some reason, just ignore it
  try {
    return JSON.parse(localStorage.getItem(CACHE_PREFIX + name));
  } catch (error) {
    return null;
  }
}

function writeCache(name, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + name, JSON.stringify(data));
  } catch (error) {
    console.warn("Couldn't save the local copy:", error);   // the site still works without it
  }
}

// Firestore dates are special objects that can't be stored in localStorage,
// so we turn them into plain numbers (milliseconds since 1970).
function plainValues(data) {
  const result = {};
  // Object.entries = Python's dict.items()
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value.toMillis === "function") {
      result[key] = value.toMillis();
    } else {
      result[key] = value;
    }
  }
  return result;
}


// ---------- 2. "LAST CHANGED" STAMPS ----------

// Records that a collection just changed. Costs 1 write.
// Returns the new stamp (a number).
async function markChanged(name) {
  const stamp = Date.now();
  // { merge: true } = only change this one field, keep the others
  // [name]: stamp  = use the VALUE of name as the field name, e.g. { decks: 1790... }
  await setDoc(doc(db, "meta", "lastChange"), { [name]: stamp }, { merge: true });
  return stamp;
}

// Loads every document of a collection, using the browser's copy when it's still correct.
async function loadCollection(name) {
  // 1 read: when did this collection last change?
  const metaSnap = await getDoc(doc(db, "meta", "lastChange"));
  let stamp = metaSnap.exists() ? (metaSnap.data()[name] || 0) : 0;

  // Nothing changed since our copy was made? Use the copy (no more reads).
  const cached = readCache(name);
  if (cached && stamp !== 0 && cached.stamp === stamp) {
    return cached.items;
  }

  // Otherwise download everything (1 read per document)...
  const snapshot = await getDocs(collection(db, name));
  const items = snapshot.docs.map(function (d) {
    return { id: d.id, ...plainValues(d.data()) };   // "...": copy all fields in (Python's **dict)
  });

  // ...make sure there's a stamp to compare against next time...
  if (stamp === 0) {
    stamp = await markChanged(name);
  }

  // ...and keep a copy for next time
  writeCache(name, { stamp: stamp, items: items });
  return items;
}


// ---------- 3. DECKS ----------

// Get every deck. Returns a list of deck objects, each with its "id" added.
export async function loadDecks() {
  return loadCollection("decks");
}

// Save a brand-new deck. Returns its new id.
export async function createDeck(deck) {
  // doc(collection(...)) makes an empty document with a new random id
  const ref = doc(collection(db, "decks"));

  await setDoc(ref, {
    ...deck,
    // A new v1 deck starts its own family, named after its own id
    familyId: deck.familyId || ref.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await markChanged("decks");
  return ref.id;
}

// Change some fields of an existing deck, e.g. updateDeck(id, { category: "general" })
export async function updateDeck(id, changes) {
  await updateDoc(doc(db, "decks", id), {
    ...changes,
    updatedAt: serverTimestamp()
  });
  await markChanged("decks");
}

// Delete a deck for good
export async function deleteDeck(id) {
  await deleteDoc(doc(db, "decks", id));
  await markChanged("decks");
}
