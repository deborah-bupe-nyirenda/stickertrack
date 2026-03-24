/* =============================================
   StickerTrack — App Logic
   All Firestore calls, view switching, and UI
   ============================================= */

// ── State ──────────────────────────────────────
let allSales = [];           // Cache of all sales from Firestore
let currentFilter = 'all';   // Sales view filter: 'all' | 'paid' | 'pending'
let currentView = 'dashboard'; // Active view name

// ── Helpers ────────────────────────────────────

/**
 * Format a number as ZMW currency
 * e.g. 1200 → "ZMW 1,200.00"
 */
function formatZMW(amount) {
  const num = parseFloat(amount) || 0;
  return 'ZMW ' + num.toLocaleString('en-ZM', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Format a Firestore timestamp or date string to a readable date
 */
function formatDate(dateValue) {
  if (!dateValue) return '—';
  let date;
  // Firestore Timestamp objects have a .toDate() method
  if (dateValue && typeof dateValue.toDate === 'function') {
    date = dateValue.toDate();
  } else {
    date = new Date(dateValue);
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Get today's date as YYYY-MM-DD (for the date input default)
 */
function getTodayISO() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {'success'|'error'|''} type - Toast style
 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : '⚠'}</span> ${message}`;
  container.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, 3000);
}

/**
 * Build a status badge element
 */
function statusBadge(status) {
  const isPaid = status === 'paid';
  return `<span class="badge ${isPaid ? 'badge-paid' : 'badge-pending'}">
    ${isPaid ? 'Paid' : 'Pending'}
  </span>`;
}

// ── Navigation ─────────────────────────────────

/**
 * Switch between Dashboard, Sales, Customers, Reports
 */
function navigateTo(viewName) {
  // Update nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // Update view panels
  document.querySelectorAll('.view').forEach(view => {
    view.classList.toggle('active', view.id === `view-${viewName}`);
  });

  // Update topbar title
  const titles = {
    dashboard: 'Dashboard',
    sales: 'Sales Log',
    customers: 'Customers',
    reports: 'Reports'
  };
  document.getElementById('topbar-title').textContent = titles[viewName] || viewName;

  currentView = viewName;

  // Load appropriate data
  if (viewName === 'dashboard') loadDashboard();
  if (viewName === 'sales') loadSalesView();
  if (viewName === 'customers') loadCustomersView();
  if (viewName === 'reports') loadReportsView();

  // Close sidebar on mobile
  closeSidebar();
}

// ── Mobile Sidebar ──────────────────────────────

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// ── Firestore Data Fetching ─────────────────────

/**
 * Load all sales from Firestore and cache them
 * Returns the sales array sorted newest first
 */
async function fetchAllSales() {
  try {
    const snapshot = await db.collection('sales')
      .orderBy('createdAt', 'desc')
      .get();

    allSales = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return allSales;
  } catch (err) {
    console.error('Error fetching sales:', err);
    showToast('Failed to load sales data', 'error');
    return [];
  }
}

// ── Dashboard View ──────────────────────────────

/**
 * Load and render the Dashboard view
 */
async function loadDashboard() {
  // Show loading in cards
  ['metric-revenue', 'metric-profit', 'metric-pending', 'metric-count'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="spinner" style="margin:auto"></div>';
  });

  await fetchAllSales();

  // Calculate metrics
  const totalRevenue  = allSales.reduce((sum, s) => sum + (parseFloat(s.total)  || 0), 0);
  const totalProfit   = allSales.reduce((sum, s) => sum + (parseFloat(s.profit) || 0), 0);
  const pendingAmount = allSales
    .filter(s => s.status === 'pending')
    .reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
  const totalCount = allSales.length;

  // Render metric cards
  document.getElementById('metric-revenue').textContent  = formatZMW(totalRevenue);
  document.getElementById('metric-profit').textContent   = formatZMW(totalProfit);
  document.getElementById('metric-pending').textContent  = formatZMW(pendingAmount);
  document.getElementById('metric-count').textContent    = totalCount;

  // Render recent sales (last 8)
  renderRecentSalesTable(allSales.slice(0, 8));
}

/**
 * Render the recent sales table on the Dashboard
 */
function renderRecentSalesTable(sales) {
  const tbody = document.getElementById('recent-sales-body');

  if (!sales.length) {
    tbody.innerHTML = `<tr><td colspan="6">
      <div class="table-empty">
        <div class="table-empty-icon">🧾</div>
        No sales recorded yet. Add your first sale!
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = sales.map(sale => `
    <tr>
      <td class="td-name">${escapeHtml(sale.customerName || '—')}</td>
      <td>${escapeHtml(sale.product || '—')}</td>
      <td class="td-mono">${sale.qty || 0}</td>
      <td class="td-mono">${formatZMW(sale.total)}</td>
      <td>${statusBadge(sale.status)}</td>
      <td style="color:var(--text-tertiary); font-size:12px">${formatDate(sale.date)}</td>
    </tr>
  `).join('');
}

// ── Sales View ──────────────────────────────────

/**
 * Load and render the Sales view (full log with filters)
 */
async function loadSalesView() {
  await fetchAllSales();
  renderSalesTable();
}

/**
 * Render sales table with current filter applied
 */
function renderSalesTable() {
  const filtered = currentFilter === 'all'
    ? allSales
    : allSales.filter(s => s.status === currentFilter);

  const tbody = document.getElementById('sales-table-body');

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10">
      <div class="table-empty">
        <div class="table-empty-icon">🔍</div>
        No ${currentFilter === 'all' ? '' : currentFilter} sales found.
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(sale => `
    <tr>
      <td class="td-name">${escapeHtml(sale.customerName || '—')}</td>
      <td>${escapeHtml(sale.product || '—')}</td>
      <td class="td-mono">${sale.qty || 0}</td>
      <td class="td-mono">${formatZMW(sale.unitPrice)}</td>
      <td class="td-mono">${formatZMW(sale.total)}</td>
      <td class="td-mono">${formatZMW(sale.costPrice)}</td>
      <td class="td-mono" style="color:var(--green)">${formatZMW(sale.profit)}</td>
      <td>${statusBadge(sale.status)}</td>
      <td style="color:var(--text-tertiary); font-size:12px">${formatDate(sale.date)}</td>
      <td>
        ${sale.status === 'pending'
          ? `<button class="btn btn-success" onclick="markAsPaid('${sale.id}')">Mark Paid</button>`
          : `<span style="color:var(--text-tertiary); font-size:12px">—</span>`
        }
      </td>
    </tr>
  `).join('');
}

/**
 * Filter sales by status (called by tab buttons)
 */
function filterSales(status) {
  currentFilter = status;

  // Update active tab
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.filter === status);
  });

  renderSalesTable();
}

/**
 * Mark a sale as paid in Firestore and refresh UI
 */
async function markAsPaid(saleId) {
  try {
    await db.collection('sales').doc(saleId).update({ status: 'paid' });
    showToast('Sale marked as paid ✓');

    // Refresh current view
    if (currentView === 'sales')     await loadSalesView();
    if (currentView === 'dashboard') await loadDashboard();
    if (currentView === 'customers') await loadCustomersView();
    if (currentView === 'reports')   await loadReportsView();
  } catch (err) {
    console.error('Error updating sale:', err);
    showToast('Failed to update sale', 'error');
  }
}

// ── Customers View ──────────────────────────────

/**
 * Load and render the Customers view
 */
async function loadCustomersView() {
  await fetchAllSales();

  // Aggregate by customer name
  const customerMap = {};

  allSales.forEach(sale => {
    const name = sale.customerName || 'Unknown';
    if (!customerMap[name]) {
      customerMap[name] = { totalPurchases: 0, amountPaid: 0, amountOwing: 0, salesCount: 0 };
    }
    const total = parseFloat(sale.total) || 0;
    customerMap[name].totalPurchases += total;
    customerMap[name].salesCount++;
    if (sale.status === 'paid') {
      customerMap[name].amountPaid += total;
    } else {
      customerMap[name].amountOwing += total;
    }
  });

  const customers = Object.entries(customerMap)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.amountOwing - a.amountOwing); // Sort by most owing

  renderCustomersTable(customers);
}

/**
 * Render customers table
 */
function renderCustomersTable(customers) {
  const tbody = document.getElementById('customers-table-body');

  if (!customers.length) {
    tbody.innerHTML = `<tr><td colspan="5">
      <div class="table-empty">
        <div class="table-empty-icon">👥</div>
        No customers yet. Add your first sale!
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = customers.map(c => `
    <tr>
      <td>
        <div style="display:flex; align-items:center; gap:10px">
          <div style="
            width:32px; height:32px;
            background:var(--accent-soft);
            color:var(--accent);
            border-radius:50%;
            display:flex; align-items:center; justify-content:center;
            font-weight:700; font-size:12px; flex-shrink:0
          ">${escapeHtml(c.name.charAt(0).toUpperCase())}</div>
          <span class="td-name">${escapeHtml(c.name)}</span>
        </div>
      </td>
      <td class="td-mono">${c.salesCount} sale${c.salesCount !== 1 ? 's' : ''}</td>
      <td class="td-mono">${formatZMW(c.totalPurchases)}</td>
      <td class="td-mono" style="color:var(--green)">${formatZMW(c.amountPaid)}</td>
      <td class="td-mono" style="color:${c.amountOwing > 0 ? 'var(--amber)' : 'var(--text-tertiary)'}; font-weight:${c.amountOwing > 0 ? '600' : '400'}">
        ${c.amountOwing > 0 ? formatZMW(c.amountOwing) : '—'}
      </td>
    </tr>
  `).join('');
}

// ── Reports View ────────────────────────────────

/**
 * Load and render the Reports view
 */
async function loadReportsView() {
  await fetchAllSales();

  // Summary totals
  const totalRevenue   = allSales.reduce((sum, s) => sum + (parseFloat(s.total)   || 0), 0);
  const totalProfit    = allSales.reduce((sum, s) => sum + (parseFloat(s.profit)  || 0), 0);
  const totalCollected = allSales.filter(s => s.status === 'paid').reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
  const totalPending   = allSales.filter(s => s.status === 'pending').reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);

  document.getElementById('report-revenue').textContent   = formatZMW(totalRevenue);
  document.getElementById('report-profit').textContent    = formatZMW(totalProfit);
  document.getElementById('report-collected').textContent = formatZMW(totalCollected);
  document.getElementById('report-pending').textContent   = formatZMW(totalPending);

  // Breakdown by product
  const productMap = {};
  allSales.forEach(sale => {
    const prod = sale.product || 'Other';
    if (!productMap[prod]) {
      productMap[prod] = { revenue: 0, profit: 0, count: 0 };
    }
    productMap[prod].revenue += parseFloat(sale.total)  || 0;
    productMap[prod].profit  += parseFloat(sale.profit) || 0;
    productMap[prod].count++;
  });

  const productColors = {
    'Sticker': '#6366f1',
    'Laptop Skin': '#0d9488',
    'Other': '#f59e0b'
  };

  const breakdown = document.getElementById('product-breakdown');
  const products = Object.entries(productMap)
    .sort((a, b) => b[1].revenue - a[1].revenue);

  if (!products.length) {
    breakdown.innerHTML = '<p style="color:var(--text-tertiary); font-size:13px; text-align:center; padding:20px 0">No data yet</p>';
    return;
  }

  breakdown.innerHTML = products.map(([name, data]) => `
    <div class="product-breakdown-item">
      <div class="product-name">
        <div class="product-dot" style="background:${productColors[name] || '#94a3b8'}"></div>
        ${escapeHtml(name)}
      </div>
      <div class="product-stats">
        <div class="product-revenue">${formatZMW(data.revenue)}</div>
        <div class="product-count">${data.count} sale${data.count !== 1 ? 's' : ''} · Profit: ${formatZMW(data.profit)}</div>
      </div>
    </div>
  `).join('');
}

// ── Add Sale Modal ──────────────────────────────

/** Open the Add Sale modal */
function openAddSaleModal() {
  document.getElementById('sale-modal').classList.add('open');
  document.getElementById('sale-date').value = getTodayISO();
  updateCalcPreview();
  populateCustomerAutocomplete();
}

/** Close the Add Sale modal */
function closeAddSaleModal() {
  document.getElementById('sale-modal').classList.remove('open');
  document.getElementById('sale-form').reset();
  updateCalcPreview();
  closeAutocomplete();
}

/**
 * Calculate and show the live Total + Profit preview in the modal
 */
function updateCalcPreview() {
  const qty       = parseFloat(document.getElementById('sale-qty').value)       || 0;
  const unitPrice = parseFloat(document.getElementById('sale-unit-price').value) || 0;
  const costPrice = parseFloat(document.getElementById('sale-cost-price').value) || 0;

  const total  = qty * unitPrice;
  const profit = (unitPrice - costPrice) * qty;

  document.getElementById('preview-total').textContent  = formatZMW(total);
  document.getElementById('preview-profit').textContent = formatZMW(profit);
}

/**
 * Handle the Add Sale form submission
 */
async function submitSale(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('submit-sale-btn');
  submitBtn.textContent = 'Saving…';
  submitBtn.disabled = true;

  // Gather form values
  const customerName = document.getElementById('sale-customer').value.trim();
  const product      = document.getElementById('sale-product').value;
  const qty          = parseFloat(document.getElementById('sale-qty').value) || 0;
  const unitPrice    = parseFloat(document.getElementById('sale-unit-price').value) || 0;
  const costPrice    = parseFloat(document.getElementById('sale-cost-price').value) || 0;
  const status       = document.querySelector('input[name="payment-status"]:checked')?.value || 'pending';
  const dateInput    = document.getElementById('sale-date').value;

  // Basic validation
  if (!customerName || !product || qty <= 0 || unitPrice <= 0) {
    showToast('Please fill all required fields', 'error');
    submitBtn.textContent = 'Record Sale';
    submitBtn.disabled = false;
    return;
  }

  // Calculate
  const total  = qty * unitPrice;
  const profit = (unitPrice - costPrice) * qty;

  // Build sale document
  const saleData = {
    customerName,
    product,
    qty,
    unitPrice,
    costPrice,
    total,
    profit,
    status,
    date: dateInput || getTodayISO(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection('sales').add(saleData);
    showToast('Sale recorded ✓');
    closeAddSaleModal();

    // Refresh the current view
    if (currentView === 'dashboard') await loadDashboard();
    if (currentView === 'sales')     await loadSalesView();
    if (currentView === 'customers') await loadCustomersView();
    if (currentView === 'reports')   await loadReportsView();
  } catch (err) {
    console.error('Error saving sale:', err);
    showToast('Failed to save sale. Check Firestore connection.', 'error');
  } finally {
    submitBtn.textContent = 'Record Sale';
    submitBtn.disabled = false;
  }
}

// ── Customer Autocomplete ───────────────────────

/**
 * Populate the autocomplete list with unique customer names
 */
function populateCustomerAutocomplete() {
  const names = [...new Set(allSales.map(s => s.customerName).filter(Boolean))];
  window._customerNames = names;
}

/** Show autocomplete suggestions as user types */
function onCustomerInput(e) {
  const val = e.target.value.toLowerCase();
  const names = window._customerNames || [];
  const list = document.getElementById('customer-autocomplete');

  if (!val || !names.length) {
    list.classList.remove('open');
    return;
  }

  const matches = names.filter(n => n.toLowerCase().includes(val));
  if (!matches.length) {
    list.classList.remove('open');
    return;
  }

  list.innerHTML = matches.map(name => `
    <div class="autocomplete-item" onclick="selectCustomer('${escapeHtml(name)}')">${escapeHtml(name)}</div>
  `).join('');
  list.classList.add('open');
}

/** Select a customer from the autocomplete dropdown */
function selectCustomer(name) {
  document.getElementById('sale-customer').value = name;
  closeAutocomplete();
}

function closeAutocomplete() {
  document.getElementById('customer-autocomplete').classList.remove('open');
}

// ── Payment Toggle ──────────────────────────────

/**
 * Update the visual styling of the payment toggle
 */
function updatePaymentToggle(value) {
  document.querySelectorAll('.toggle-option').forEach(opt => {
    opt.className = 'toggle-option'; // reset
    if (opt.dataset.value === value) {
      opt.classList.add(value === 'paid' ? 'selected-paid' : 'selected-pending');
    }
  });
}

// ── Security: Escape HTML ───────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Initialization ──────────────────────────────

/**
 * Set up all event listeners and load initial data
 */
function init() {
  // Nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.view));
  });

  // Filter tabs (Sales view)
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => filterSales(tab.dataset.filter));
  });

  // Mobile menu
  document.getElementById('menu-toggle').addEventListener('click', openSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

  // Add sale buttons (both dashboard and sales view)
  document.querySelectorAll('.open-add-sale').forEach(btn => {
    btn.addEventListener('click', openAddSaleModal);
  });

  // Modal close
  document.getElementById('modal-close').addEventListener('click', closeAddSaleModal);
  document.getElementById('modal-cancel').addEventListener('click', closeAddSaleModal);

  // Close modal on overlay click
  document.getElementById('sale-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAddSaleModal();
  });

  // Form submission
  document.getElementById('sale-form').addEventListener('submit', submitSale);

  // Live calc preview
  ['sale-qty', 'sale-unit-price', 'sale-cost-price'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateCalcPreview);
  });

  // Customer autocomplete
  document.getElementById('sale-customer').addEventListener('input', onCustomerInput);
  document.addEventListener('click', e => {
    if (!e.target.closest('.autocomplete-wrapper')) closeAutocomplete();
  });

  // Payment toggle
  document.querySelectorAll('input[name="payment-status"]').forEach(radio => {
    radio.addEventListener('change', () => updatePaymentToggle(radio.value));
  });

  // Set default payment toggle visual
  updatePaymentToggle('paid');

  // Load initial view
  loadDashboard();
}

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', init);
