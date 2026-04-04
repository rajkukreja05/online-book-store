// ============================================
// Admin — operations + ERP / CRM / analytics
// ============================================

const API_BASE_URL =
    typeof window !== 'undefined' && typeof window.getBookstoreApiBase === 'function'
        ? window.getBookstoreApiBase()
        : '/api';

let currentTab = 'dashboard';
let autoRefreshInterval;
let chartRevenue7d = null;
let chartTopTitles = null;
let chartSalesSeries = null;
let chartRevenueModel = null;
let couponGiftInFlight = false;

function adminHeaders(json) {
    const raw = localStorage.getItem('user');
    const u = raw ? JSON.parse(raw) : {};
    const h = { 'x-admin-user-id': u._id || '' };
    if (json !== false) h['Content-Type'] = 'application/json';
    return h;
}

function normalizeOrderStatus(s) {
    return (s || '').toLowerCase();
}

function formatOrderStatus(s) {
    const k = normalizeOrderStatus(s);
    return k ? k.charAt(0).toUpperCase() + k.slice(1) : '';
}

function customerLabel(order) {
    const u = order.userId;
    if (u && typeof u === 'object') return u.name || u.email || '—';
    return u || '—';
}

const sampleBooks = [
    { _id: '1', title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', category: 'Fiction', price: 1079, stock: 50, coverImage: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400' },
    { _id: '2', title: '1984', author: 'George Orwell', category: 'Fiction', price: 1244, stock: 35, coverImage: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400' }
];

const sampleOrders = [
    { _id: '1', userId: { name: 'Demo' }, items: [{ title: 'Book', quantity: 1 }], total: 500, status: 'delivered', createdAt: new Date() }
];

document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
    initSalesDates();
    loadDashboard();
    startAutoRefresh();
});

function checkAdminAuth() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (!user || user.role !== 'admin') {
        window.location.href = 'index.html';
        return;
    }
    document.getElementById('admin-username').textContent = user.name;
}

function initSalesDates() {
    const to = document.getElementById('sales-to');
    const from = document.getElementById('sales-from');
    if (!to || !from) return;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 29);
    to.value = end.toISOString().slice(0, 10);
    from.value = start.toISOString().slice(0, 10);
}

function startAutoRefresh() {
    autoRefreshInterval = setInterval(() => {
        if (currentTab === 'dashboard') loadDashboard();
        else if (currentTab === 'orders') loadOrders();
        else if (currentTab === 'inventory') loadInventory();
        else if (currentTab === 'crm') loadCustomers();
        else if (currentTab === 'sales') loadSalesReport();
        else if (currentTab === 'revenue') loadRevenueModel();
        else if (currentTab === 'linkage') loadInventorySales();
        else if (currentTab === 'idic') loadIDIC();
        else if (currentTab === 'scm') loadSupplyChain();
        else if (currentTab === 'pull-demand') loadPullDemandRequests();
    }, 15000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.admin-nav a[data-tab]').forEach(a => {
        a.classList.toggle('active', a.getAttribute('data-tab') === tab);
    });
    ['dashboard', 'crm', 'sales', 'revenue', 'linkage', 'idic', 'scm', 'pull-demand', 'orders', 'inventory'].forEach(t => {
        const el = document.getElementById(t + '-section');
        if (el) el.style.display = t === tab ? 'block' : 'none';
    });

    if (tab === 'dashboard') loadDashboard();
    else if (tab === 'orders') loadOrders();
    else if (tab === 'inventory') loadInventory();
    else if (tab === 'crm') loadCustomers();
    else if (tab === 'sales') loadSalesReport();
    else if (tab === 'revenue') loadRevenueModel();
    else if (tab === 'linkage') loadInventorySales();
    else if (tab === 'idic') loadIDIC();
    else if (tab === 'scm') loadSupplyChain();
    else if (tab === 'pull-demand') loadPullDemandRequests();
}

function refreshData() {
    showToast('Refreshing…');
    switchTab(currentTab);
}

async function loadDashboard() {
    try {
        const response = await fetch(API_BASE_URL + '/orders/admin/stats');
        const stats = await response.json();
        document.getElementById('total-orders').textContent = stats.totalOrders || 0;
        document.getElementById('total-revenue').textContent =
            '₹' + (stats.totalRevenue || 0).toLocaleString('en-IN');
        document.getElementById('pending-orders').textContent = stats.pending || 0;
        document.getElementById('delivered-orders').textContent = stats.delivered || 0;
    } catch (e) {
        document.getElementById('total-orders').textContent = sampleOrders.length;
        document.getElementById('total-revenue').textContent = '₹0';
    }

    await loadDecisionDashboard();
    await loadRecentOrders();
}

async function loadDecisionDashboard() {
    try {
        const res = await fetch(API_BASE_URL + '/analytics/decision-dashboard', { headers: adminHeaders(false) });
        if (!res.ok) throw new Error('analytics');
        const d = await res.json();

        document.getElementById('kpi-customers').textContent = d.crm?.totalCustomers ?? '—';
        document.getElementById('kpi-mtd-revenue').textContent =
            '₹' + (d.orders?.monthToDateRevenue || 0).toLocaleString('en-IN');
        document.getElementById('kpi-inventory-value').textContent =
            (d.inventory?.inventoryValueAtCostPrice || 0).toLocaleString('en-IN');
        document.getElementById('kpi-low-stock').textContent = d.inventory?.lowStockSkuCount ?? '—';

        const daySeries = d.charts?.revenueLast7Days || [];
        const labels7 = daySeries.map(x => x._id);
        const data7 = daySeries.map(x => x.revenue || 0);
        const ctx7 = document.getElementById('chart-revenue-7d');
        if (ctx7 && typeof Chart !== 'undefined') {
            if (chartRevenue7d) chartRevenue7d.destroy();
            chartRevenue7d = new Chart(ctx7, {
                type: 'line',
                data: {
                    labels: labels7,
                    datasets: [{
                        label: 'Revenue (₹)',
                        data: data7,
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52,152,219,0.15)',
                        fill: true,
                        tension: 0.3
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        const tops = d.charts?.topTitlesByRevenue || [];
        const ctxT = document.getElementById('chart-top-titles');
        if (ctxT && typeof Chart !== 'undefined') {
            if (chartTopTitles) chartTopTitles.destroy();
            chartTopTitles = new Chart(ctxT, {
                type: 'bar',
                data: {
                    labels: tops.map(x => (x._id || '').slice(0, 22)),
                    datasets: [{
                        label: '₹',
                        data: tops.map(x => x.lineTotal || 0),
                        backgroundColor: 'rgba(243, 156, 18, 0.7)'
                    }]
                },
                options: {
                    responsive: true,
                    indexAxis: 'y',
                    plugins: { legend: { display: false } },
                    scales: { x: { beginAtZero: true } }
                }
            });
        }
    } catch (e) {
        document.getElementById('kpi-customers').textContent = '—';
        document.getElementById('kpi-mtd-revenue').textContent = '—';
        document.getElementById('kpi-inventory-value').textContent = '—';
        document.getElementById('kpi-low-stock').textContent = '—';
    }

    document.getElementById('last-refresh').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
}

async function loadRecentOrders() {
    try {
        const response = await fetch(API_BASE_URL + '/orders?admin=true');
        const orders = await response.json();
        renderRecentOrders(Array.isArray(orders) ? orders.slice(0, 5) : []);
    } catch (e) {
        renderRecentOrders(sampleOrders);
    }
}

function renderRecentOrders(orders) {
    const tbody = document.getElementById('recent-orders-body');
    if (!orders.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">No orders</td></tr>';
        return;
    }
    tbody.innerHTML = orders
        .map(
            order => `
        <tr>
            <td>#${order._id}</td>
            <td>${(order.items || []).length} items</td>
            <td>₹${Number(order.total || 0).toLocaleString('en-IN')}</td>
            <td><span class="status-badge ${normalizeOrderStatus(order.status)}">${formatOrderStatus(order.status)}</span></td>
            <td>${new Date(order.createdAt).toLocaleDateString()}</td>
        </tr>`
        )
        .join('');
}

async function loadCustomers() {
    const tbody = document.getElementById('customers-body');
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading…</td></tr>';
    const search = document.getElementById('crm-search')?.value || '';
    const segment = document.getElementById('crm-segment')?.value || '';
    const q = new URLSearchParams({ limit: 50 });
    if (search) q.set('search', search);
    if (segment) q.set('segment', segment);

    try {
        const res = await fetch(API_BASE_URL + '/customers?' + q, { headers: adminHeaders(false) });
        if (!res.ok) throw new Error('crm');
        const data = await res.json();
        const list = data.customers || [];
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading">No customers</td></tr>';
            return;
        }
        tbody.innerHTML = list
            .map(c => {
                const id = c._id;
                const seg = normalizeOrderStatus(c.segment) || 'new';
                return `<tr>
                <td>${escapeHtml(c.name)}</td>
                <td>${escapeHtml(c.email)}</td>
                <td>
                    <select class="status-select ${seg}" onchange="updateCustomerSegment('${id}', this.value)">
                        <option value="new" ${seg === 'new' ? 'selected' : ''}>New</option>
                        <option value="regular" ${seg === 'regular' ? 'selected' : ''}>Regular</option>
                        <option value="vip" ${seg === 'vip' ? 'selected' : ''}>VIP</option>
                    </select>
                </td>
                <td>${c.purchaseCount ?? 0}</td>
                <td>₹${Number(c.totalSpent || 0).toLocaleString('en-IN')}</td>
                <td>${c.loyaltyPoints ?? 0}</td>
                <td>
                    <button type="button" class="btn-delete" onclick="awardLoyaltyPrompt('${id}')"><i class="fas fa-gift"></i> Points</button>
                    <button type="button" class="btn-delete" onclick="giftCouponPrompt('${id}')"><i class="fas fa-ticket-alt"></i> Coupon</button>
                </td>
            </tr>`;
            })
            .join('');
    } catch (e) {
        tbody.innerHTML =
            '<tr><td colspan="7" class="loading">Could not load CRM (need admin login + valid user id).</td></tr>';
    }
    document.getElementById('last-refresh').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
}

function escapeHtml(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function updateCustomerSegment(customerId, segment) {
    try {
        const res = await fetch(API_BASE_URL + '/customers/' + customerId + '/segment', {
            method: 'PUT',
            headers: adminHeaders(),
            body: JSON.stringify({ segment })
        });
        if (res.ok) showToast('Segment updated');
        else showToast('Update failed');
    } catch (e) {
        showToast('Network error');
    }
}

async function awardLoyaltyPrompt(customerId) {
    const pts = prompt('Loyalty points to add (can be negative to adjust):', '50');
    if (pts === null) return;
    const n = parseInt(pts, 10);
    if (Number.isNaN(n)) return;
    try {
        const res = await fetch(API_BASE_URL + '/customers/' + customerId + '/loyalty', {
            method: 'POST',
            headers: adminHeaders(),
            body: JSON.stringify({ points: n })
        });
        if (res.ok) {
            showToast('Loyalty updated');
            loadCustomers();
        } else showToast('Failed');
    } catch (e) {
        showToast('Network error');
    }
}

async function giftCouponPrompt(customerId) {
    if (couponGiftInFlight) return;
    const amountStr = prompt('Coupon amount in INR (example: 500):', '500');
    if (amountStr === null) return;
    const amount = parseInt(amountStr, 10);
    if (Number.isNaN(amount) || amount <= 0) {
        showToast('Invalid coupon amount');
        return;
    }
    const validDays = 30;
    const note = 'Gift coupon from admin';

    try {
        couponGiftInFlight = true;
        const res = await fetch(API_BASE_URL + '/customers/' + customerId + '/coupon', {
            method: 'POST',
            headers: adminHeaders(),
            body: JSON.stringify({ amount, validDays, note })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showToast(err.message || 'Failed to gift coupon');
            return;
        }
        const data = await res.json().catch(() => ({}));
        const code = data?.coupon?.code || 'N/A';
        const wallet = Number(data?.walletBalance || 0).toLocaleString('en-IN');
        showToast(`Gifted ₹${amount} | Code: ${code} | Wallet: ₹${wallet}`);
        loadCustomers();
    } catch (e) {
        showToast('Network error');
    } finally {
        couponGiftInFlight = false;
    }
}

async function loadSalesReport() {
    const from = document.getElementById('sales-from')?.value;
    const to = document.getElementById('sales-to')?.value;
    const sumEl = document.getElementById('sales-summary');
    const statusBody = document.getElementById('sales-by-status-body');

    try {
        const q = new URLSearchParams();
        if (from) q.set('from', from);
        if (to) q.set('to', to);
        const res = await fetch(API_BASE_URL + '/analytics/sales-report?' + q, { headers: adminHeaders(false) });
        if (!res.ok) throw new Error('sales');
        const data = await res.json();
        const s = data.summary || {};
        sumEl.innerHTML = `
            <div class="sales-summary-cards">
                <div class="sum-card"><span>Orders</span><strong>${s.orderCount}</strong></div>
                <div class="sum-card"><span>Gross revenue</span><strong>₹${Number(s.grossRevenue || 0).toLocaleString('en-IN')}</strong></div>
                <div class="sum-card"><span>AOV</span><strong>₹${Number(s.avgOrderValue || 0).toLocaleString('en-IN')}</strong></div>
            </div>`;

        const series = data.seriesByDay || [];
        const ctx = document.getElementById('chart-sales-series');
        if (ctx && typeof Chart !== 'undefined') {
            if (chartSalesSeries) chartSalesSeries.destroy();
            chartSalesSeries = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: series.map(x => x._id),
                    datasets: [
                        {
                            label: 'Revenue ₹',
                            data: series.map(x => x.revenue || 0),
                            backgroundColor: 'rgba(46, 204, 113, 0.6)'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        const bySt = data.byStatus || [];
        statusBody.innerHTML = bySt.length
            ? bySt
                .map(
                    r => `<tr><td>${formatOrderStatus(r._id)}</td><td>${r.count}</td><td>₹${Number(r.revenue || 0).toLocaleString('en-IN')}</td></tr>`
                )
                .join('')
            : '<tr><td colspan="3">No data</td></tr>';
    } catch (e) {
        sumEl.innerHTML = '<p class="section-hint">Could not load sales report.</p>';
        statusBody.innerHTML = '';
    }
    document.getElementById('last-refresh').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
}

async function loadRevenueModel() {
    const cogsPct = Math.max(0, Math.min(100, Number(document.getElementById('rm-cogs')?.value || 58)));
    const marketingPct = Math.max(0, Math.min(100, Number(document.getElementById('rm-marketing')?.value || 10)));
    const paymentPct = Math.max(0, Math.min(100, Number(document.getElementById('rm-payment')?.value || 2)));
    const shippingPerOrder = Math.max(0, Number(document.getElementById('rm-shipping')?.value || 40));
    const fixedOps = Math.max(0, Number(document.getElementById('rm-fixed')?.value || 50000));

    try {
        const from = document.getElementById('sales-from')?.value;
        const to = document.getElementById('sales-to')?.value;
        const q = new URLSearchParams();
        if (from) q.set('from', from);
        if (to) q.set('to', to);
        const res = await fetch(API_BASE_URL + '/analytics/sales-report?' + q, { headers: adminHeaders(false) });
        if (!res.ok) throw new Error('revenue');
        const data = await res.json();
        const s = data.summary || {};
        const gross = Number(s.grossRevenue || 0);
        const orders = Number(s.orderCount || 0);
        const avgOrder = Number(s.avgOrderValue || 0);

        const cogs = gross * (cogsPct / 100);
        const marketing = gross * (marketingPct / 100);
        const paymentFee = gross * (paymentPct / 100);
        const shipping = orders * shippingPerOrder;
        const contribution = gross - cogs - marketing - paymentFee - shipping;
        const net = contribution - fixedOps;
        const marginPct = gross > 0 ? (contribution / gross) * 100 : 0;

        document.getElementById('rm-gross').textContent = `₹${gross.toLocaleString('en-IN')}`;
        document.getElementById('rm-margin').textContent = `${marginPct.toFixed(1)}%`;
        document.getElementById('rm-contribution').textContent = `₹${Math.round(contribution).toLocaleString('en-IN')}`;
        document.getElementById('rm-net').textContent = `₹${Math.round(net).toLocaleString('en-IN')}`;

        const kpiBody = document.getElementById('rm-kpis-body');
        if (kpiBody) {
            kpiBody.innerHTML = `
                <tr><td>Orders</td><td><strong>${orders}</strong></td></tr>
                <tr><td>AOV</td><td><strong>₹${avgOrder.toLocaleString('en-IN')}</strong></td></tr>
                <tr><td>COGS</td><td>₹${Math.round(cogs).toLocaleString('en-IN')}</td></tr>
                <tr><td>Marketing</td><td>₹${Math.round(marketing).toLocaleString('en-IN')}</td></tr>
                <tr><td>Payment fee</td><td>₹${Math.round(paymentFee).toLocaleString('en-IN')}</td></tr>
                <tr><td>Shipping</td><td>₹${Math.round(shipping).toLocaleString('en-IN')}</td></tr>
                <tr><td>Fixed ops</td><td>₹${Math.round(fixedOps).toLocaleString('en-IN')}</td></tr>
            `;
        }

        const ctx = document.getElementById('chart-revenue-model');
        if (ctx && typeof Chart !== 'undefined') {
            if (chartRevenueModel) chartRevenueModel.destroy();
            chartRevenueModel = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['COGS', 'Marketing', 'Payment fee', 'Shipping', 'Contribution'],
                    datasets: [{
                        data: [cogs, marketing, paymentFee, shipping, Math.max(0, contribution)],
                        backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981']
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        }
    } catch (e) {
        document.getElementById('rm-gross').textContent = '—';
        document.getElementById('rm-margin').textContent = '—';
        document.getElementById('rm-contribution').textContent = '—';
        document.getElementById('rm-net').textContent = '—';
        const kpiBody = document.getElementById('rm-kpis-body');
        if (kpiBody) kpiBody.innerHTML = '<tr><td>Could not load revenue model</td><td></td></tr>';
    }
    document.getElementById('last-refresh').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
}

async function loadInventorySales() {
    const tbody = document.getElementById('linkage-body');
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Loading…</td></tr>';
    try {
        const res = await fetch(API_BASE_URL + '/analytics/inventory-sales', { headers: adminHeaders(false) });
        if (!res.ok) throw new Error('link');
        const data = await res.json();
        const rows = data.rows || [];
        tbody.innerHTML = rows
            .map(r => {
                const st = r.linkageStatus || '';
                return `<tr>
                <td>${escapeHtml(r.title)}</td>
                <td>${escapeHtml(r.category || '—')}</td>
                <td>${r.stockOnHand}</td>
                <td>${r.unitsSoldLifetime}</td>
                <td>₹${Number(r.revenueFromSku || 0).toLocaleString('en-IN')}</td>
                <td><span class="stock-badge ${st === 'low' || st === 'stockout_risk' ? 'low' : 'ok'}">${st}</span></td>
            </tr>`;
            })
            .join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Could not load linkage data.</td></tr>';
    }
    document.getElementById('last-refresh').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
}

async function loadIDIC() {
    const body = document.getElementById('idic-feedback-body');
    if (body) body.innerHTML = '<tr><td colspan="6" class="loading">Loading…</td></tr>';
    try {
        const res = await fetch(API_BASE_URL + '/analytics/idic-model', { headers: adminHeaders(false) });
        if (!res.ok) throw new Error('idic');
        const data = await res.json();
        document.getElementById('idic-identify').textContent = data.identify?.totalCustomers ?? 0;
        const segText = (data.differentiate || []).map(s => `${s._id}:${s.count}`).join(' | ') || '—';
        document.getElementById('idic-differentiate').textContent = segText;
        const intText = (data.interact || []).slice(0, 2).map(s => `${s._id}:${s.count}`).join(' | ') || '—';
        document.getElementById('idic-interact').textContent = intText;
        document.getElementById('idic-customize').textContent = 'Campaign Ready';
        if (body) {
            const rows = data.recentFeedback || [];
            body.innerHTML = rows.length ? rows.map(r => `<tr>
                <td>${new Date(r.createdAt).toLocaleDateString()}</td>
                <td>${escapeHtml(r.name || '-')}</td>
                <td>${escapeHtml(r.category || '-')}</td>
                <td>${r.rating || '-'}</td>
                <td>${escapeHtml(r.subject || '-')}</td>
                <td>${escapeHtml(r.status || 'new')}</td>
            </tr>`).join('') : '<tr><td colspan="6" class="loading">No feedback yet</td></tr>';
        }
    } catch (e) {
        if (body) body.innerHTML = '<tr><td colspan="6" class="loading">Could not load IDIC data</td></tr>';
    }
}

async function loadSupplyChain() {
    const body = document.getElementById('scm-body');
    if (body) body.innerHTML = '<tr><td colspan="6" class="loading">Loading…</td></tr>';
    try {
        const res = await fetch(API_BASE_URL + '/analytics/supply-chain', { headers: adminHeaders(false) });
        if (!res.ok) throw new Error('scm');
        const data = await res.json();
        document.getElementById('scm-total').textContent = data.summary?.totalSkus ?? 0;
        document.getElementById('scm-reorder').textContent = data.summary?.reorderNow ?? 0;
        document.getElementById('scm-review').textContent = data.summary?.reviewSku ?? 0;
        document.getElementById('scm-slow').textContent = data.summary?.slowMoving ?? 0;
        if (body) {
            body.innerHTML = (data.recommendations || []).map(r => `<tr>
                <td>${escapeHtml(r.title)}</td>
                <td>${escapeHtml(r.category)}</td>
                <td>${r.stock}</td>
                <td>${r.unitsSold}</td>
                <td>${escapeHtml(r.action)}</td>
                <td>${escapeHtml(r.supplierETA)}</td>
            </tr>`).join('');
        }
    } catch (e) {
        if (body) body.innerHTML = '<tr><td colspan="6" class="loading">Could not load SCM data</td></tr>';
    }
}

async function loadPullDemandRequests() {
    const body = document.getElementById('pull-demand-body');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="8" class="loading">Loading…</td></tr>';
    try {
        const status = document.getElementById('pull-demand-status')?.value || 'open';
        const type = document.getElementById('pull-demand-type')?.value || '';
        const q = new URLSearchParams();
        q.set('status', status);
        if (type) q.set('type', type);

        const res = await fetch(API_BASE_URL + '/books/demand/requests?' + q.toString(), {
            headers: adminHeaders(false)
        });
        if (!res.ok) throw new Error('pull-demand');
        const rows = await res.json();

        if (!Array.isArray(rows) || !rows.length) {
            body.innerHTML = '<tr><td colspan="8" class="loading">No pull-demand requests</td></tr>';
            return;
        }

        body.innerHTML = rows.map((r) => {
            const requester = r.userId?.name || r.userId?.email || '—';
            const typeLabel = r.type === 'preorder' ? 'Pre-order' : 'Personal request';
            const st = (r.status || 'open').toLowerCase();
            const title = escapeHtml(r.title || r.bookId?.title || '—');
            return `<tr>
                <td>${new Date(r.createdAt).toLocaleDateString()}</td>
                <td>${escapeHtml(requester)}</td>
                <td>${typeLabel}</td>
                <td>${title}</td>
                <td>${escapeHtml(r.category || '—')}</td>
                <td>${Number(r.quantity || 1)}</td>
                <td><span class="status-badge ${st}">${formatOrderStatus(st)}</span></td>
                <td>
                    <select class="status-select ${st}" onchange="updatePullDemandStatus('${r._id}', this.value)">
                        <option value="open" ${st === 'open' ? 'selected' : ''}>Open</option>
                        <option value="fulfilled" ${st === 'fulfilled' ? 'selected' : ''}>Fulfilled</option>
                        <option value="cancelled" ${st === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        body.innerHTML = '<tr><td colspan="8" class="loading">Could not load pull-demand requests</td></tr>';
    }
    document.getElementById('last-refresh').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
}

async function updatePullDemandStatus(requestId, status) {
    try {
        const res = await fetch(API_BASE_URL + '/books/demand/requests/' + requestId + '/status', {
            method: 'PUT',
            headers: adminHeaders(),
            body: JSON.stringify({ status })
        });
        if (!res.ok) throw new Error('status');
        showToast('Pull-demand status updated');
    } catch (e) {
        showToast('Could not update status');
    } finally {
        loadPullDemandRequests();
    }
}

async function loadOrders() {
    try {
        const response = await fetch(API_BASE_URL + '/orders?admin=true');
        const orders = await response.json();
        renderOrders(Array.isArray(orders) ? orders : []);
    } catch (e) {
        renderOrders(sampleOrders);
    }
}

function renderOrders(orders) {
    const tbody = document.getElementById('all-orders-body');
    if (!orders.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">No orders</td></tr>';
        return;
    }
    tbody.innerHTML = orders
        .map(order => {
            const oid = order._id;
            const items = (order.items || []).map(i => `${i.title} (x${i.quantity})`).join(', ');
            return `<tr>
            <td>#${oid}</td>
            <td>${escapeHtml(customerLabel(order))}</td>
            <td>${escapeHtml(items)}</td>
            <td>₹${Number(order.total || 0).toLocaleString('en-IN')}</td>
            <td>
                <select onchange="updateOrderStatus('${oid}', this.value)" class="status-select ${normalizeOrderStatus(order.status)}">
                    <option value="pending" ${normalizeOrderStatus(order.status) === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="processing" ${normalizeOrderStatus(order.status) === 'processing' ? 'selected' : ''}>Processing</option>
                    <option value="shipped" ${normalizeOrderStatus(order.status) === 'shipped' ? 'selected' : ''}>Shipped</option>
                    <option value="delivered" ${normalizeOrderStatus(order.status) === 'delivered' ? 'selected' : ''}>Delivered</option>
                    <option value="cancelled" ${normalizeOrderStatus(order.status) === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
            </td>
            <td>${new Date(order.createdAt).toLocaleDateString()}</td>
            <td><button type="button" onclick="deleteOrder('${oid}')" class="btn-delete"><i class="fas fa-trash"></i></button></td>
        </tr>`;
        })
        .join('');
    document.getElementById('last-refresh').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
}

async function updateOrderStatus(orderId, status) {
    try {
        await fetch(API_BASE_URL + '/orders/' + orderId + '/status', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        showToast('Status updated');
        setTimeout(() => {
            loadOrders();
            loadDashboard();
        }, 400);
    } catch (e) {
        showToast('Error');
    }
}

async function deleteOrder(orderId) {
    if (!confirm('Delete this order?')) return;
    try {
        await fetch(API_BASE_URL + '/orders/' + orderId, { method: 'DELETE' });
        showToast('Deleted');
        setTimeout(() => {
            loadOrders();
            loadDashboard();
        }, 400);
    } catch (e) {
        showToast('Error');
    }
}

async function loadInventory() {
    try {
        const response = await fetch(API_BASE_URL + '/books');
        const books = await response.json();
        renderInventory(Array.isArray(books) ? books : []);
    } catch (e) {
        renderInventory(sampleBooks);
    }
}

function renderInventory(books) {
    const tbody = document.getElementById('inventory-body');
    const lowStockBooks = books.filter(b => (b.stock || 0) < 10);
    const bid = b => (b._id && b._id.toString ? b._id.toString() : b._id) || '';

    tbody.innerHTML = books
        .map(
            book => `
        <tr>
            <td><img src="${book.coverImage || 'https://via.placeholder.com/50'}" alt="" class="book-thumb"></td>
            <td>${escapeHtml(book.title)}</td>
            <td>${escapeHtml(book.author)}</td>
            <td>${escapeHtml(book.category)}</td>
            <td>₹${Number(book.price || 0).toLocaleString('en-IN')}</td>
            <td>
                <input type="number" value="${book.stock || 0}" min="0" class="stock-input" 
                    onchange="updateStock('${bid(book)}', this.value)">
            </td>
            <td>
                <span class="stock-badge ${(book.stock || 0) < 10 ? 'low' : 'ok'}">
                    ${(book.stock || 0) < 10 ? 'Low' : 'OK'}
                </span>
            </td>
        </tr>`
        )
        .join('');

    const warn = document.getElementById('inventory-low-stock-warning');
    if (warn) {
        if (lowStockBooks.length) {
            warn.style.display = 'block';
            warn.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${lowStockBooks.length} SKUs below threshold (10).`;
        } else warn.style.display = 'none';
    }
    document.getElementById('last-refresh').textContent = 'Last updated: ' + new Date().toLocaleTimeString();
}

async function updateStock(bookId, newStock) {
    try {
        await fetch(API_BASE_URL + '/books/' + bookId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stock: parseInt(newStock, 10) })
        });
        showToast('Stock updated');
        setTimeout(() => loadInventory(), 400);
    } catch (e) {
        showToast('Error');
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function logout() {
    stopAutoRefresh();
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

window.addEventListener('beforeunload', () => stopAutoRefresh());
