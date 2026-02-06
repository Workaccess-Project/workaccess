import {
  getStatus,
  getItems,
  addItem,
  toggleItem,
  deleteItem,
  deleteDoneItems,
} from "./api.js";
import { initUI } from "./ui.js";

let items = [];

async function refresh(ui) {
  items = await getItems();
  ui.renderItems(items);
}

window.addEventListener("DOMContentLoaded", async () => {
  const statusEl = document.getElementById("status");

  try {
    const status = await getStatus();
    statusEl.textContent = status.status;
  } catch {
    statusEl.textContent = "Backend není dostupný ❌";
  }

  const ui = initUI(
    async (text) => {
      const created = await addItem(text);
      items.unshift(created);
      ui.renderItems(items);
    },
    async (id) => {
      await toggleItem(id);
      await refresh(ui);
    },
    async (id) => {
      await deleteItem(id);
      await refresh(ui);
    }
  );

  // tlačítko: Smazat hotové (bez alertu)
  const clearBtn = document.getElementById("clearDoneBtn");
  clearBtn.addEventListener("click", async () => {
    await deleteDoneItems();
    await refresh(ui);
  });

  await refresh(ui);
});
