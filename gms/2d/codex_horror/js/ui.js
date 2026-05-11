(function () {
  let modalRoot;
  let toastRoot;

  function closePanels() {
    document.querySelectorAll(".panel.open").forEach(panel => {
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden", "true");
    });
  }

  window.BlackGlassUI = {
    init() {
      modalRoot = document.getElementById("modal-root");
      toastRoot = document.getElementById("toast-root");
      document.querySelectorAll("[data-close]").forEach(button => {
        button.addEventListener("click", () => this.closePanel(button.dataset.close));
      });
      document.querySelectorAll(".panel").forEach(panel => {
        panel.addEventListener("click", event => {
          if (event.target === panel) this.closePanel(panel.id);
        });
      });
      document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          closePanels();
          this.closeModal();
        }
      });
    },
    showScreen(id) {
      document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.toggle("active", screen.id === id);
      });
    },
    openPanel(id) {
      closePanels();
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
            <h3 id="modal-title">${title}</h3>
            <p>${body}</p>
            <div class="modal-actions">
              <button class="btn quiet" type="button" data-modal="cancel">${cancelLabel}</button>
              <button class="btn ${danger ? "danger" : "primary"}" type="button" data-modal="confirm">${confirmLabel}</button>
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
      toastRoot.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(8px)";
      }, 1900);
      setTimeout(() => toast.remove(), 2400);
    },
  };
})();
