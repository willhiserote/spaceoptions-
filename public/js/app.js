const STORAGE_KEY = 'spaceoptions_web_app_url';

function $(id) {
  return document.getElementById(id);
}

function getWebAppUrl() {
  return (localStorage.getItem(STORAGE_KEY) || '').trim();
}

function setWebAppUrl(url) {
  localStorage.setItem(STORAGE_KEY, url.trim());
}

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

function isAppsScriptUrl(url) {
  if (!url) return false;
  return /script\.google\.com/.test(url) || /\/exec$/.test(url) || /\/dev$/.test(url);
}

function setStatus(message, type = 'info') {
  const el = $('status');
  if (!el) return;
  el.innerHTML = `<div class="status ${type}">${message}</div>`;
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    ...options
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error || 'Request failed');
  }
  return json;
}

function getBaseUrlOrThrow() {
  const raw = getWebAppUrl();
  if (!raw) {
    throw new Error('Set your Google Apps Script Web App URL in Settings first.');
  }
  return normalizeBaseUrl(raw);
}

async function fetchInventory() {
  const baseUrl = getBaseUrlOrThrow();
  if (!isAppsScriptUrl(baseUrl)) {
    throw new Error('Web App URL must be a Google Apps Script /exec URL.');
  }
  return requestJson(`${baseUrl}?action=inventory`);
}

async function adjustInventory(payload) {
  const baseUrl = getBaseUrlOrThrow();
  return requestJson(baseUrl, {
    method: 'POST',
    body: JSON.stringify({ action: 'adjust', ...payload })
  });
}

async function submitOrder(payload) {
  const baseUrl = getBaseUrlOrThrow();
  return requestJson(baseUrl, {
    method: 'POST',
    body: JSON.stringify({ action: 'order', ...payload })
  });
}

function createItemRow(item = '', quantity = '') {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <input class="input" name="item" placeholder="Item name" value="${item}">
    <input class="input" name="quantity" type="number" min="1" placeholder="Qty" value="${quantity}">
    <button type="button" class="ghost" data-action="remove">Remove</button>
  `;
  row.querySelector('[data-action="remove"]').addEventListener('click', () => {
    row.remove();
  });
  return row;
}

function readOrderItems(container) {
  const rows = Array.from(container.querySelectorAll('.item-row'));
  return rows
    .map((row) => {
      const item = row.querySelector('input[name="item"]').value.trim();
      const quantity = Number(row.querySelector('input[name="quantity"]').value || 0);
      return { item, quantity };
    })
    .filter((x) => x.item && x.quantity > 0);
}

function drawInventory(items) {
  const body = $('inventoryTable');
  body.innerHTML = '';
  items.forEach((product) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${product.item}</td><td>${product.stock}</td>`;
    body.appendChild(tr);
  });
}

async function loadInventory() {
  try {
    const data = await fetchInventory();
    drawInventory(data.inventory || []);
  } catch (err) {
    setStatus(`Inventory load failed: ${err.message}`, 'danger');
  }
}

function initSettings() {
  const input = $('webAppUrl');
  const saveBtn = $('saveSettings');
  const testBtn = $('testConnection');
  const existing = getWebAppUrl();

  if (existing) {
    input.value = existing;
  }

  saveBtn.addEventListener('click', () => {
    const next = input.value.trim();
    if (!next) {
      setStatus('Enter your Apps Script Web App URL before saving.', 'warning');
      return;
    }
    setWebAppUrl(next);
    setStatus('Settings saved.', 'success');
  });

  testBtn.addEventListener('click', async () => {
    try {
      setWebAppUrl(input.value.trim());
      await fetchInventory();
      setStatus('Connection OK. Inventory loaded from Google Sheets.', 'success');
      await loadInventory();
    } catch (err) {
      setStatus(`Connection failed: ${err.message}`, 'danger');
    }
  });
}

function initOrders() {
  const form = $('orderForm');
  const itemsContainer = $('itemsContainer');
  const addBtn = $('addItem');

  itemsContainer.appendChild(createItemRow());

  addBtn.addEventListener('click', () => {
    itemsContainer.appendChild(createItemRow());
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const builder = $('builder').value.trim();
    const notes = $('orderNotes').value.trim();
    const items = readOrderItems(itemsContainer);

    if (!builder) {
      setStatus('Builder name is required.', 'warning');
      return;
    }
    if (items.length === 0) {
      setStatus('Add at least one item to the order.', 'warning');
      return;
    }

    try {
      const response = await submitOrder({ builder, notes, items });
      setStatus(`Order submitted. Order ID: ${response.orderId}`, 'success');
      form.reset();
      itemsContainer.innerHTML = '';
      itemsContainer.appendChild(createItemRow());
      await loadInventory();
    } catch (err) {
      setStatus(`Order failed: ${err.message}`, 'danger');
    }
  });
}

function initAdjustments() {
  const form = $('adjustForm');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      item: $('adjustItem').value.trim(),
      quantity: Number($('adjustQty').value || 0),
      direction: $('adjustDirection').value,
      notes: $('adjustNotes').value.trim(),
      source: 'manual'
    };

    if (!payload.item) {
      setStatus('Item is required.', 'warning');
      return;
    }
    if (!payload.quantity || payload.quantity <= 0) {
      setStatus('Quantity must be greater than 0.', 'warning');
      return;
    }

    try {
      const data = await adjustInventory(payload);
      setStatus('Inventory updated.', 'success');
      form.reset();
      drawInventory(data.inventory || []);
    } catch (err) {
      setStatus(`Update failed: ${err.message}`, 'danger');
    }
  });
}

function init() {
  initSettings();
  initOrders();
  initAdjustments();

  if (getWebAppUrl()) {
    loadInventory();
  }
}

document.addEventListener('DOMContentLoaded', init);
