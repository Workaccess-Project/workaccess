export function initUI(onAdd, onToggle, onDelete, onDeleteSelected) {
  const form = document.getElementById("addForm");
  const input = document.getElementById("itemInput");
  const list = document.getElementById("itemsList");

  // Tlačítko "Smazat vybranou" (v HTML máš pravděpodobně id="deleteSelectedBtn")
  // Pokud máš jiné id, napiš mi a upravíme to.
  const deleteSelectedBtn =
    document.getElementById("deleteSelectedBtn") ||
    document.getElementById("btnDeleteSelected") ||
    document.getElementById("deleteSelected");

  let selectedId = null;

  function setSelected(id) {
    selectedId = (id == null) ? null : String(id);
    applySelectionToDOM();
  }

  function applySelectionToDOM() {
    // zvýraznění vybraného řádku
    for (const li of list.querySelectorAll("li[data-id]")) {
      const id = li.dataset.id;
      li.classList.toggle("selected", selectedId != null && id === String(selectedId));
    }

    // aktivace/deaktivace tlačítka
    if (deleteSelectedBtn) {
      deleteSelectedBtn.disabled = selectedId == null;
    }
  }

  // submit (přidat)
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    await onAdd(text);
    input.value = "";
    input.focus();
  });

  // klik na "Smazat vybranou"
  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener("click", async () => {
      if (selectedId == null) return;

      // onDeleteSelected je volitelné – když není, použijeme onDelete(selectedId)
      if (typeof onDeleteSelected === "function") {
        await onDeleteSelected(selectedId);
      } else {
        await onDelete(selectedId);
      }

      // po smazání zrušíme selection
      setSelected(null);
    });
  }

  function renderItems(items) {
    list.innerHTML = "";

    for (const item of items) {
      const idStr = String(item.id);

      const li = document.createElement("li");
      li.dataset.id = idStr;

      // jednoduché stylování řádku (pokud nemáš CSS class)
      li.style.display = "flex";
      li.style.alignItems = "center";
      li.style.gap = "10px";
      li.style.padding = "10px 12px";
      li.style.borderBottom = "1px solid rgba(255,255,255,.08)";
      li.style.cursor = "default";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!item.done;

      // ✅ UX: klik/změna checkboxu vždy vybere řádek
      checkbox.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelected(idStr);
      });

      checkbox.addEventListener("change", async (e) => {
        e.stopPropagation();

        // vybereme a držíme selection i přes refresh
        setSelected(idStr);

        // provedeme toggle (app.js udělá refresh)
        await onToggle(item.id);

        // po refreshi app.js zavolá renderItems znovu a my selection znovu aplikujeme
      });

      const span = document.createElement("span");
      span.textContent = item.name;
      span.style.flex = "1";
      span.style.userSelect = "none";

      if (item.done) {
        span.style.textDecoration = "line-through";
        span.style.opacity = "0.7";
      }

      const delBtn = document.createElement("button");
      delBtn.textContent = "❌";
      delBtn.title = "Smazat položku";
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = confirm(`Opravdu smazat: "${item.name}"?`);
        if (!ok) return;

        await onDelete(item.id);

        // pokud smažu vybranou položku, zruším selection
        if (selectedId === idStr) setSelected(null);
      });

      // ✅ klik na řádek = vybere řádek
      li.addEventListener("click", () => setSelected(idStr));

      li.appendChild(checkbox);
      li.appendChild(span);
      li.appendChild(delBtn);
      list.appendChild(li);
    }

    // po každém renderu znovu aplikujeme selection a tlačítko
    applySelectionToDOM();
  }

  return { renderItems };
}
