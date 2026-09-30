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
// ============================================================

import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "./firebase.js";


// Get every deck. Returns a list of deck objects, each with its "id" added.
export async function loadDecks() {
  const snapshot = await getDocs(collection(db, "decks"));

  // "...d.data()" copies all the fields into the new object.
  // Python equivalent:  {"id": d.id, **d.data()}
  return snapshot.docs.map(function (d) {
    return { id: d.id, ...d.data() };
  });
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
  return ref.id;
}

// Change some fields of an existing deck, e.g. updateDeck(id, { category: "general" })
export async function updateDeck(id, changes) {
  await updateDoc(doc(db, "decks", id), {
    ...changes,
    updatedAt: serverTimestamp()
  });
}

// Delete a deck for good
export async function deleteDeck(id) {
  await deleteDoc(doc(db, "decks", id));
}
