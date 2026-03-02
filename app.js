/* Restaurant POS (HTML/CSS/JS only)
   - Menu CRUD with images (localStorage)
   - Click menu to add to cart & bill
   - Clear cart, print bill
   - Pay now (QR) + save monthly sales
*/

(() => {
  "use strict";

  const STORAGE_KEYS = {
    menu: "restaurant_menu_v1",
    sales: "restaurant_sales_v1",
  };

  const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

  /** @type {{menu: MenuItem[], cart: Record<string, number>, sales: SaleRecord[], editingId: string|null, lastBillId: string}} */
  const state = {
    menu: [],
    cart: {},
    sales: [],
    editingId: null,
    lastBillId: "",
  };

  /** @typedef {{id:string, name:string, price:number, imageDataUrl:string, createdAt:number, updatedAt:number}} MenuItem */
  /** @typedef {{id:string, ts:number, total:number, lines: {id:string, name:string, qty:number, price:number}[]}} SaleRecord */

  // --------- DOM helpers ----------
  const $ = (sel) => /** @type {HTMLElement|null} */ (document.querySelector(sel));
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = String(v);
      else if (k === "dataset") Object.assign(node.dataset, v);
      else if (k === "text") node.textContent = String(v);
      else if (k === "html") node.innerHTML = String(v);
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, "");
      else if (v !== false && v != null) node.setAttribute(k, String(v));
    }
    for (const c of children) node.append(c);
    return node;
  };

  const now = () => Date.now();
  const clampInt = (n, min, max) => Math.max(min, Math.min(max, n | 0));

  function toast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    window.clearTimeout(toast._timer);
    toast._timer = window.setTimeout(() => {
      t.hidden = true;
    }, 1600);
  }
  toast._timer = 0;

  // --------- Storage ----------
  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // --------- Placeholder images ----------
  function svgPlaceholder(label, bg) {
    const safe = String(label).trim().slice(0, 18);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${bg}" stop-opacity="0.95"/>
            <stop offset="1" stop-color="#0b1220" stop-opacity="0.9"/>
          </linearGradient>
        </defs>
        <rect width="640" height="360" rx="28" fill="url(#g)"/>
        <circle cx="520" cy="80" r="54" fill="rgba(255,255,255,.14)"/>
        <circle cx="120" cy="290" r="84" fill="rgba(255,255,255,.10)"/>
        <text x="40" y="165" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial"
              font-size="44" font-weight="800" fill="rgba(255,255,255,.92)">${escapeXml(safe)}</text>
        <text x="40" y="210" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial"
              font-size="18" font-weight="700" fill="rgba(255,255,255,.70)">Tap to add to cart</text>
      </svg>
    `.trim();
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function escapeXml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function defaultMenu() {
    const base = [
      ["Idly", 30, "#7c5cff"],
      ["Puttu", 45, "#23c0ff"],
      ["Poori", 50, "#ffb020"],
      ["Coffee", 20, "#8b5a2b"],
      ["Dosai", 55, "#22c55e"],
      ["Vada", 25, "#ff4d4d"],
      ["Pazhampori", 35, "#f97316"],
    ];

    return base.map(([name, price, color], idx) => {
      const id = `m_${idx + 1}`;
      const ts = now();
      return {
        id,
        name,
        price,
        imageDataUrl: svgPlaceholder(name, color),
        createdAt: ts,
        updatedAt: ts,
      };
    });
  }

  function ensureState() {
    const storedMenu = loadJson(STORAGE_KEYS.menu, null);
    state.menu = Array.isArray(storedMenu) && storedMenu.length ? normalizeMenu(storedMenu) : defaultMenu();
    saveJson(STORAGE_KEYS.menu, state.menu);

    const storedSales = loadJson(STORAGE_KEYS.sales, []);
    state.sales = Array.isArray(storedSales) ? storedSales : [];

    state.cart = {};
    state.lastBillId = makeBillId();
  }

  function normalizeMenu(items) {
    const ts = now();
    return items
      .filter((x) => x && typeof x === "object")
      .map((x, i) => ({
        id: String(x.id || `m_${i + 1}`),
        name: String(x.name || "Item").trim() || "Item",
        price: toPrice(x.price),
        imageDataUrl: typeof x.imageDataUrl === "string" && x.imageDataUrl ? x.imageDataUrl : svgPlaceholder(x.name || "Item", "#7c5cff"),
        createdAt: typeof x.createdAt === "number" ? x.createdAt : ts,
        updatedAt: typeof x.updatedAt === "number" ? x.updatedAt : ts,
      }));
  }

  function toPrice(v) {
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n);
  }

  function makeBillId() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const t = String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0") + String(d.getSeconds()).padStart(2, "0");
    const rand = Math.random().toString(16).slice(2, 6).toUpperCase();
    return `BILL-${y}${m}${day}-${t}-${rand}`;
  }

  // --------- Tabs ----------
  function initTabs() {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => setTab(btn.dataset.tab || "pos"));
    });
  }

  function setTab(tabName) {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tabName));
    document.querySelectorAll(".tab-panel").forEach((p) => {
      const is = p.id === `tab-${tabName}`;
      p.classList.toggle("is-active", is);
      p.hidden = !is;
    });

    const activeBtn = document.querySelector(`.tab[data-tab="${tabName}"]`);
    if (activeBtn) {
      document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", b === activeBtn ? "true" : "false"));
    }

    if (tabName === "reports") renderReports();
    if (tabName === "manage") renderManageTable();
  }

  // --------- Menu render ----------
  function renderMenu() {
    const grid = $("#menu-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const q = ($("#menu-search")?.value || "").trim().toLowerCase();
    const items = state.menu
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((it) => (!q ? true : it.name.toLowerCase().includes(q)));

    if (!items.length) {
      grid.append(el("div", { class: "cart-empty", text: "No items found." }));
      return;
    }

    for (const it of items) {
      const card = el(
        "button",
        { class: "menu-card", type: "button", dataset: { id: it.id }, title: "Click to add to cart" },
        [
          el("div", { class: "menu-card__img" }, [el("img", { src: it.imageDataUrl, alt: it.name, loading: "lazy" })]),
          el("div", { class: "menu-card__body" }, [
            el("div", {}, [el("div", { class: "menu-card__name", text: it.name }), el("div", { class: "pill", text: "Add" })]),
            el("div", { class: "menu-card__price", text: formatMoney(it.price) }),
          ]),
        ],
      );

      card.addEventListener("click", () => {
        addToCart(it.id, 1);
        toast(`${it.name} added`);
      });

      grid.append(card);
    }
  }

  // --------- Cart & bill ----------
  function addToCart(menuId, qty) {
    const it = state.menu.find((m) => m.id === menuId);
    if (!it) return;
    state.cart[menuId] = clampInt((state.cart[menuId] || 0) + qty, 0, 999);
    if (state.cart[menuId] <= 0) delete state.cart[menuId];
    renderCartAndBill();
  }

  function clearCart() {
    state.cart = {};
    state.lastBillId = makeBillId();
    renderCartAndBill();
  }

  function cartLines() {
    const lines = [];
    for (const [id, qty] of Object.entries(state.cart)) {
      const it = state.menu.find((m) => m.id === id);
      if (!it) continue;
      lines.push({ id, name: it.name, qty, price: it.price });
    }
    lines.sort((a, b) => a.name.localeCompare(b.name));
    return lines;
  }

  function billSubtotal(lines) {
    return lines.reduce((sum, l) => sum + l.qty * l.price, 0);
  }

  function formatMoney(n) {
    return INR.format(Number(n) || 0);
  }

  function renderCartAndBill() {
    const cartWrap = $("#cart-items");
    const billLines = $("#bill-lines");
    const billSubtotalEl = $("#bill-subtotal");
    const billTotalEl = $("#bill-total");
    const billDate = $("#bill-date");
    const billId = $("#bill-id");

    const lines = cartLines();
    const subtotal = billSubtotal(lines);

    if (cartWrap) {
      cartWrap.innerHTML = "";
      if (!lines.length) {
        cartWrap.append(el("div", { class: "cart-empty", text: "Cart is empty. Click a menu item to add." }));
      } else {
        for (const l of lines) {
          const it = state.menu.find((m) => m.id === l.id);
          const row = el("div", { class: "cart-item" }, [
            el("div", { class: "cart-item__img" }, [el("img", { src: it?.imageDataUrl || svgPlaceholder(l.name, "#7c5cff"), alt: l.name })]),
            el("div", {}, [
              el("div", { class: "cart-item__name", text: l.name }),
              el("div", { class: "cart-item__sub", text: `${l.qty} × ${formatMoney(l.price)} = ${formatMoney(l.qty * l.price)}` }),
            ]),
            el("div", { class: "qty" }, [
              el("button", { class: "qty__btn", type: "button", text: "−", title: "Decrease" }),
              el("div", { class: "qty__val", text: String(l.qty) }),
              el("button", { class: "qty__btn", type: "button", text: "+", title: "Increase" }),
            ]),
          ]);

          const [minusBtn, , plusBtn] = row.querySelectorAll(".qty__btn, .qty__val");
          minusBtn?.addEventListener("click", () => addToCart(l.id, -1));
          plusBtn?.addEventListener("click", () => addToCart(l.id, +1));

          cartWrap.append(row);
        }
      }
    }

    if (billLines) {
      billLines.innerHTML = "";
      if (!lines.length) {
        billLines.append(el("div", { class: "muted small", text: "No items." }));
      } else {
        for (const l of lines) {
          billLines.append(
            el("div", { class: "bill-line" }, [
              el("div", { class: "bill-line__left" }, [
                el("div", { class: "bill-line__name", text: l.name }),
                el("div", { class: "bill-line__qty", text: `${l.qty} × ${formatMoney(l.price)}` }),
              ]),
              el("div", { class: "bill-line__amt", text: formatMoney(l.qty * l.price) }),
            ]),
          );
        }
      }
    }

    if (billSubtotalEl) billSubtotalEl.textContent = formatMoney(subtotal);
    if (billTotalEl) billTotalEl.textContent = formatMoney(subtotal);
    if (billDate) billDate.textContent = new Date().toLocaleString();
    if (billId) billId.textContent = state.lastBillId;

    const payBtn = $("#btn-pay-now");
    if (payBtn) payBtn.disabled = subtotal <= 0;
    const printBtn = $("#btn-print-bill");
    if (printBtn) printBtn.disabled = subtotal <= 0;
  }

  // --------- Manage menu (CRUD) ----------
  function renderManageTable() {
    const tbody = $("#menu-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const items = state.menu.slice().sort((a, b) => a.name.localeCompare(b.name));
    if (!items.length) {
      tbody.append(el("tr", {}, [el("td", { colspan: "4", class: "muted", text: "No items. Add one above." })]));
      return;
    }

    for (const it of items) {
      const tr = el("tr", {}, [
        el("td", {}, [el("div", { class: "timg" }, [el("img", { src: it.imageDataUrl, alt: it.name })])]),
        el("td", { text: it.name }),
        el("td", { class: "num", text: formatMoney(it.price) }),
        el("td", { class: "actions" }, [
          el("div", { class: "action-row" }, [
            el("button", { class: "btn btn--ghost btn--sm", type: "button", text: "Edit" }),
            el("button", { class: "btn btn--danger btn--sm", type: "button", text: "Delete" }),
          ]),
        ]),
      ]);

      const [editBtn, delBtn] = tr.querySelectorAll("button");
      editBtn?.addEventListener("click", () => beginEdit(it.id));
      delBtn?.addEventListener("click", () => deleteMenuItem(it.id));
      tbody.append(tr);
    }
  }

  function beginEdit(id) {
    const it = state.menu.find((m) => m.id === id);
    if (!it) return;
    state.editingId = id;

    /** @type {HTMLInputElement|null} */
    const idEl = $("#menu-id");
    /** @type {HTMLInputElement|null} */
    const nameEl = $("#menu-name");
    /** @type {HTMLInputElement|null} */
    const priceEl = $("#menu-price");
    /** @type {HTMLImageElement|null} */
    const preview = $("#menu-image-preview");
    const cancel = $("#btn-cancel-edit");

    if (idEl) idEl.value = it.id;
    if (nameEl) nameEl.value = it.name;
    if (priceEl) priceEl.value = String(it.price);
    if (preview) preview.src = it.imageDataUrl;
    if (cancel) cancel.hidden = false;

    toast("Editing item");
    setTab("manage");
  }

  function cancelEdit() {
    state.editingId = null;
    const form = $("#menu-form");
    form?.reset();
    const preview = $("#menu-image-preview");
    if (preview) preview.removeAttribute("src");
    const cancel = $("#btn-cancel-edit");
    if (cancel) cancel.hidden = true;
  }

  function deleteMenuItem(id) {
    const it = state.menu.find((m) => m.id === id);
    if (!it) return;
    const ok = confirm(`Delete "${it.name}" from menu?`);
    if (!ok) return;
    state.menu = state.menu.filter((m) => m.id !== id);
    saveJson(STORAGE_KEYS.menu, state.menu);
    if (state.cart[id]) delete state.cart[id];
    renderMenu();
    renderManageTable();
    renderCartAndBill();
    toast("Item deleted");
  }

  function upsertMenuItem(item) {
    const existingIdx = state.menu.findIndex((m) => m.id === item.id);
    if (existingIdx >= 0) state.menu[existingIdx] = item;
    else state.menu.push(item);
    saveJson(STORAGE_KEYS.menu, state.menu);
    renderMenu();
    renderManageTable();
  }

  function menuNameExists(name, exceptId) {
    const n = name.trim().toLowerCase();
    return state.menu.some((m) => m.id !== exceptId && m.name.trim().toLowerCase() === n);
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error("read failed"));
      r.onload = () => resolve(String(r.result));
      r.readAsDataURL(file);
    });
  }

  // --------- Payments & sales ----------
  function openPayModal() {
    const modal = $("#pay-modal");
    if (!modal) return;

    const lines = cartLines();
    const total = billSubtotal(lines);
    if (total <= 0) return;

    const amountEl = $("#pay-amount");
    if (amountEl) amountEl.textContent = formatMoney(total);

    const qr = $("#pay-qr");
    if (qr) {
      const payload = `Restaurant Payment|Bill=${state.lastBillId}|Amount=${total}`;
      const url = makeQrUrl(payload);
      qr.setAttribute("src", url);
    }

    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closePayModal() {
    const modal = $("#pay-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  function makeQrUrl(data) {
    const size = 240;
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
  }

  function markPaid() {
    const lines = cartLines();
    const total = billSubtotal(lines);
    if (total <= 0) return;

    /** @type {SaleRecord} */
    const sale = {
      id: state.lastBillId,
      ts: now(),
      total,
      lines: lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, price: l.price })),
    };
    state.sales.unshift(sale);
    saveJson(STORAGE_KEYS.sales, state.sales);
    toast("Payment saved to sales");
    closePayModal();
    clearCart();
    renderReports();
  }

  // --------- Reports ----------
  function monthKey(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function renderReports() {
    const monthInput = /** @type {HTMLInputElement|null} */ ($("#report-month"));
    const selected = monthInput?.value || defaultMonthValue();
    if (monthInput && monthInput.value !== selected) monthInput.value = selected;

    const sales = state.sales.filter((s) => monthKey(s.ts) === selected);
    const orders = sales.length;
    const revenue = sales.reduce((sum, s) => sum + (s.total || 0), 0);

    const itemAgg = new Map(); // name -> {qty, revenue}
    for (const s of sales) {
      for (const l of s.lines || []) {
        const k = String(l.name || "Item");
        const cur = itemAgg.get(k) || { qty: 0, revenue: 0 };
        cur.qty += Number(l.qty) || 0;
        cur.revenue += (Number(l.qty) || 0) * (Number(l.price) || 0);
        itemAgg.set(k, cur);
      }
    }

    const top = [...itemAgg.entries()].sort((a, b) => b[1].qty - a[1].qty)[0]?.[0] || "—";

    const ordersEl = $("#rep-orders");
    const revEl = $("#rep-revenue");
    const topEl = $("#rep-top-item");
    if (ordersEl) ordersEl.textContent = String(orders);
    if (revEl) revEl.textContent = formatMoney(revenue);
    if (topEl) topEl.textContent = top;

    const itemsWrap = $("#rep-items");
    if (itemsWrap) {
      itemsWrap.innerHTML = "";
      const rows = [...itemAgg.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
      if (!rows.length) itemsWrap.append(el("div", { class: "muted", text: "No sales for this month yet." }));
      for (const [name, v] of rows) {
        itemsWrap.append(
          el("div", { class: "rep-row" }, [
            el("div", {}, [el("strong", { text: name }), el("div", { class: "muted small", text: `${v.qty} sold` })]),
            el("div", { class: "order__total", text: formatMoney(v.revenue) }),
          ]),
        );
      }
    }

    const ordersWrap = $("#rep-orders-list");
    if (ordersWrap) {
      ordersWrap.innerHTML = "";
      if (!sales.length) ordersWrap.append(el("div", { class: "muted", text: "No orders yet." }));
      for (const s of sales.slice(0, 50)) {
        ordersWrap.append(
          el("div", { class: "order" }, [
            el("div", { class: "order__top" }, [
              el("div", { text: new Date(s.ts).toLocaleString() }),
              el("div", {}, [el("div", { class: "order__total", text: formatMoney(s.total) }), el("div", { class: "muted small", text: s.id })]),
            ]),
            el("div", { class: "order__items" }, (s.lines || []).map((l) => el("div", { class: "order__item" }, [el("div", { text: `${l.name} × ${l.qty}` }), el("div", { class: "muted", text: formatMoney((l.qty || 0) * (l.price || 0)) })]))),
          ]),
        );
      }
    }
  }

  function defaultMonthValue() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ menu: state.menu, sales: state.sales }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `restaurant-backup-${defaultMonthValue()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function clearSales() {
    const ok = confirm("Clear ALL sales data? This cannot be undone.");
    if (!ok) return;
    state.sales = [];
    saveJson(STORAGE_KEYS.sales, state.sales);
    renderReports();
    toast("Sales cleared");
  }

  function resetDemo() {
    const ok = confirm("Reset demo menu + clear sales? (Keeps your page, resets data)");
    if (!ok) return;
    state.menu = defaultMenu();
    state.sales = [];
    saveJson(STORAGE_KEYS.menu, state.menu);
    saveJson(STORAGE_KEYS.sales, state.sales);
    clearCart();
    cancelEdit();
    renderMenu();
    renderManageTable();
    renderReports();
    toast("Demo reset");
  }

  function addDefaultItemsIfMissing() {
    const def = defaultMenu();
    const existingNames = new Set(state.menu.map((m) => m.name.trim().toLowerCase()));
    let added = 0;
    for (const it of def) {
      if (!existingNames.has(it.name.trim().toLowerCase())) {
        it.id = `m_${Math.random().toString(16).slice(2, 8)}`;
        state.menu.push(it);
        added++;
      }
    }
    saveJson(STORAGE_KEYS.menu, state.menu);
    renderMenu();
    renderManageTable();
    toast(added ? `Added ${added} items` : "All default items already exist");
  }

  // --------- Wire events ----------
  function initEvents() {
    $("#menu-search")?.addEventListener("input", renderMenu);
    $("#btn-clear-cart")?.addEventListener("click", () => {
      if (!Object.keys(state.cart).length) return;
      clearCart();
      toast("Cart cleared");
    });
    $("#btn-print-bill")?.addEventListener("click", () => window.print());
    $("#btn-pay-now")?.addEventListener("click", openPayModal);
    $("#btn-mark-paid")?.addEventListener("click", markPaid);

    $("#btn-cancel-edit")?.addEventListener("click", cancelEdit);
    $("#btn-add-demo-items")?.addEventListener("click", addDefaultItemsIfMissing);
    $("#btn-reset-demo")?.addEventListener("click", resetDemo);

    $("#btn-export-json")?.addEventListener("click", exportJson);
    $("#btn-clear-sales")?.addEventListener("click", clearSales);
    $("#report-month")?.addEventListener("change", renderReports);

    // Modal close (click backdrop or close buttons)
    $("#pay-modal")?.addEventListener("click", (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t?.dataset?.close === "true") closePayModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePayModal();
    });

    // Manage form submit
    $("#menu-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nameEl = /** @type {HTMLInputElement|null} */ ($("#menu-name"));
      const priceEl = /** @type {HTMLInputElement|null} */ ($("#menu-price"));
      const fileEl = /** @type {HTMLInputElement|null} */ ($("#menu-image"));
      const preview = /** @type {HTMLImageElement|null} */ ($("#menu-image-preview"));

      const name = (nameEl?.value || "").trim();
      const price = toPrice(priceEl?.value || 0);
      if (!name) return toast("Enter item name");
      if (!Number.isFinite(price) || price <= 0) return toast("Enter valid price");

      const id = state.editingId || `m_${Math.random().toString(16).slice(2, 9)}`;
      if (menuNameExists(name, id)) return toast("Item with same name already exists");

      let imageDataUrl = "";
      const file = fileEl?.files?.[0];
      if (file) {
        try {
          imageDataUrl = await fileToDataUrl(file);
        } catch {
          imageDataUrl = "";
        }
      } else if (state.editingId) {
        imageDataUrl = state.menu.find((m) => m.id === id)?.imageDataUrl || "";
      }
      if (!imageDataUrl) imageDataUrl = svgPlaceholder(name, "#7c5cff");

      const ts = now();
      const existing = state.menu.find((m) => m.id === id);
      /** @type {MenuItem} */
      const item = {
        id,
        name,
        price,
        imageDataUrl,
        createdAt: existing?.createdAt || ts,
        updatedAt: ts,
      };

      const wasEditing = Boolean(state.editingId);
      upsertMenuItem(item);
      if (preview) preview.src = imageDataUrl;

      cancelEdit();
      toast(wasEditing ? "Item updated" : "Item added");
    });

    // Image preview on select
    $("#menu-image")?.addEventListener("change", async () => {
      const fileEl = /** @type {HTMLInputElement|null} */ ($("#menu-image"));
      const preview = /** @type {HTMLImageElement|null} */ ($("#menu-image-preview"));
      const file = fileEl?.files?.[0];
      if (!file || !preview) return;
      try {
        preview.src = await fileToDataUrl(file);
      } catch {
        // ignore
      }
    });
  }

  function init() {
    ensureState();
    initTabs();
    initEvents();
    renderMenu();
    renderCartAndBill();
    renderManageTable();
    renderReports();
  }

  document.addEventListener("DOMContentLoaded", init);
})();

