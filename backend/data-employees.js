// backend/data-employees.js
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Spolehlivá cesta: employees.json je ve stejné složce jako tento soubor
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FILE = path.join(__dirname, "employees.json");

async function readJson() {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    // pokud soubor neexistuje nebo je prázdný/rozbitý -> fallback
    return [];
  }
}

async function writeJson(items) {
  const pretty = JSON.stringify(items, null, 2);
  await fs.writeFile(FILE, pretty, "utf8");
}

function makeId() {
  return (
    "emp_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 8)
  );
}

export async function listEmployees() {
  return await readJson();
}

export async function getEmployeeById(id) {
  const items = await readJson();
  return items.find((x) => String(x.id) === String(id)) || null;
}

export async function createEmployee(payload) {
  const items = await readJson();

  const now = new Date().toISOString();
  const created = {
    id: payload?.id ?? makeId(),
    ...payload,
    createdAt: payload?.createdAt ?? now,
    updatedAt: now,
  };

  items.push(created);
  await writeJson(items);
  return created;
}

export async function updateEmployee(id, patch) {
  const items = await readJson();
  const idx = items.findIndex((x) => String(x.id) === String(id));
  if (idx === -1) return null;

  const now = new Date().toISOString();
  items[idx] = {
    ...items[idx],
    ...patch,
    id: items[idx].id,
    updatedAt: now,
  };

  await writeJson(items);
  return items[idx];
}

export async function deleteEmployee(id) {
  const items = await readJson();
  const before = items.length;
  const filtered = items.filter((x) => String(x.id) !== String(id));
  if (filtered.length === before) return false;

  await writeJson(filtered);
  return true;
}
