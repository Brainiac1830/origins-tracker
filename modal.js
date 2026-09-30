// ============================================================
// modal.js — the big card view, shared by every page.
// Any page that loads this file can call  openModal(card)
// ============================================================

// Build the modal once and add it to the end of the page.
// (It used to be written in deck-builder.html; now every page gets it for free.)
const cardModal = document.createElement("div");
cardModal.className = "modal hidden";
cardModal.innerHTML = `
  <div class="modal-content">
    <button class="modal-close" aria-label="Close">&times;</button>
    <img src="" alt="">
  </div>
`;
document.body.appendChild(cardModal);

// querySelector finds the first element inside cardModal that matches
const cardModalImage = cardModal.querySelector("img");
const cardModalClose = cardModal.querySelector(".modal-close");

function openModal(card) {
  cardModalImage.src = card.image;
  cardModalImage.alt = card.name;
  cardModal.classList.remove("hidden");   // removing "hidden" makes it appear
}

function closeModal() {
  cardModal.classList.add("hidden");      // adding "hidden" makes it disappear
}

// Close with the X
cardModalClose.addEventListener("click", closeModal);

// Close when clicking OUTSIDE the card (on the dark background itself)
cardModal.addEventListener("click", function (event) {
  if (event.target === cardModal) {
    closeModal();
  }
});

// Close with the Escape key
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    closeModal();
  }
});
