const BASE = "http://localhost:3000/api";

export async function getStatus() {
  const res = await fetch(`${BASE}/status`);
  if (!res.ok) throw new Error("GET /status failed");
  return res.json();
}

export async function getItems() {
  const res = await fetch(`${BASE}/items`);
  if (!res.ok) throw new Error("GET /items failed");
  return res.json();
}

export async function addItem(name) {
  const res = await fetch(`${BASE}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("POST /items failed");
  return res.json();
}

export async function toggleItem(id) {
  const res = await fetch(`${BASE}/items/${id}`, {
    method: "PATCH",
  });
  if (!res.ok) throw new Error("PATCH /items/:id failed");
  return res.json();
}

export async function deleteItem(id) {
  const res = await fetch(`${BASE}/items/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("DELETE /items/:id failed");
  return res.json();
}

export async function deleteDoneItems() {
  const res = await fetch(`${BASE}/items`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("DELETE /items (done) failed");
  return res.json();
}
