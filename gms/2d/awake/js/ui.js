(function () {
  let modalRoot;
  let toastRoot;

  function closeOverlays() {
    document.querySelectorAll(".overlay.open").forEach(panel => {
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden", "true");
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  window.CodexHorrorUI = {
    init() {
      modalRoot = document.getElementById("modal-root");
      toastRoot = document.getElementById("toast-root");
      document.querySelectorAll("[data-close]").forEach(button => {
        button.addEventListener("click", () => this.closePanel(button.dataset.close));
      });
      document.querySelectorAll(".overlay").forEach(panel => {
        panel.addEventListener("click", event => {
          if (event.target === panel) this.closePanel(panel.id);
        });
      });
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          this.closeModal();
          closeOverlays();
        }
      });
    },
    escapeHtml,
    showScreen(id) {
      document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.toggle("active", screen.id === id);
      });
    },
    openPanel(id) {
      if (id !== "help-panel") closeOverlays();
      const panel = document.getElementById(id);
      if (!panel) return;
      panel.classList.add("open");
      panel.setAttribute("aria-hidden", "false");
    },
    closePanel(id) {
      const panel = document.getElementById(id);
      if (!panel) return;
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden", "true");
    },
    confirm({ title, body, confirmLabel = "OK", cancelLabel = "Cancel", danger = false }) {
      return new Promise(resolve => {
        modalRoot.innerHTML = `
          <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <h2 id="modal-title">${escapeHtml(title)}</h2>
            <p class="story-text">${escapeHtml(body)}</p>
            <div class="popup-actions">
              <button class="glass-button quiet" type="button" data-modal="cancel">${escapeHtml(cancelLabel)}</button>
              <button class="glass-button ${danger ? "danger" : "primary"}" type="button" data-modal="confirm">${escapeHtml(confirmLabel)}</button>
            </div>
          </div>
        `;
        modalRoot.classList.add("open");
        modalRoot.querySelector("[data-modal='cancel']").addEventListener("click", () => {
          this.closeModal();
          resolve(false);
        });
        modalRoot.querySelector("[data-modal='confirm']").addEventListener("click", () => {
          this.closeModal();
          resolve(true);
        });
      });
    },
    closeModal() {
      if (!modalRoot) return;
      modalRoot.classList.remove("open");
      modalRoot.innerHTML = "";
    },
    toast(message) {
      if (!toastRoot || !message) return;
      const toast = document.createElement("div");
      toast.className = "toast";
      toast.textContent = message;
      toastRoot.innerHTML = "";
      toastRoot.append(toast);
      setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(8px)";
      }, 2200);
      setTimeout(() => toast.remove(), 2600);
    },
  };
})();
