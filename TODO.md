# ERP/CRM Integration TODO

## Phase 1: Data Model Extensions ✅ Complete
- ✅ Update server/models/User.js (CRM fields: orders[], loyaltyPoints, totalSpent, segment, etc.)
- [ ] Minor update server/models/Order.js

## Phase 2: Backend APIs
- ✅ Create server/routes/customers.js (new CRM route)
- ✅ Enhance server/routes/orders.js (CRM hooks + period stats/top products)
- ✅ Enhance server/routes/books.js (low-stock endpoint)
- ✅ Update server/server.js (mount /api/customers)
- [ ] Create server/utils/reports.js (helpers)

## Phase 3: Frontend
- [ ] public/js/admin.js (charts, customers tab)
- [ ] public/admin.html (new tab)
- [ ] public/css/admin.css (styles)
- [ ] public/js/profile.js (order history)
- [ ] public/profile.html (new tab)
- [ ] public/css/profile.css

## Phase 4: Setup & Test
- [ ] Install deps: npm i chart.js moment csv-writer
- [ ] Seed data
- [ ] Test APIs
- [ ] E2E tests
