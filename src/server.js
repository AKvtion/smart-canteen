const express = require('express');
const path = require('path');
const { readDb, writeDb, nextId, now, money, today, uuid, sha256, addAudit, eachDate } = require('./store');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_API = new Set(['/api/health', '/api/auth/login']);
const MAX_DAILY_RECHARGE = 1000;
const MIN_RECHARGE = 10;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function ok(res, data = {}) { res.json({ success: true, ...data }); }
function fail(res, message, status = 400) { res.status(status).json({ success: false, message }); }
function currentMealType() { const h = new Date().getHours(); if (h < 10) return 'breakfast'; if (h < 15) return 'lunch'; return 'dinner'; }
function getToken(req) { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : (req.query.token || ''); }
function operator(req) { return req.admin?.username || 'system'; }
function findSession(db, token) {
  if (!token) return null;
  const session = db.sessions.find(s => s.token === token && new Date(s.expiresAt).getTime() > Date.now());
  if (!session) return null;
  const admin = db.admins.find(a => a.id === session.adminId && a.status === 'active');
  return admin ? { session, admin } : null;
}
function requireAuth(req, res, next) {
  if (!req.path.startsWith('/api/') || PUBLIC_API.has(req.path)) return next();
  const db = readDb();
  const auth = findSession(db, getToken(req));
  if (!auth) return fail(res, '未登录或登录已过期', 401);
  req.admin = auth.admin;
  req.db = db;
  next();
}
app.use(requireAuth);

app.get('/api/health', (req, res) => ok(res, { time: now() }));
app.post('/api/auth/login', (req, res) => {
  const db = readDb();
  const { username, password } = req.body || {};
  const admin = db.admins.find(a => a.username === username && a.passwordHash === sha256(password || '') && a.status === 'active');
  if (!admin) return fail(res, '账号或密码错误', 401);
  const token = uuid();
  db.sessions = db.sessions.filter(s => new Date(s.expiresAt).getTime() > Date.now() && s.adminId !== admin.id);
  db.sessions.push({ token, adminId: admin.id, createdAt: now(), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
  addAudit(db, '管理员登录', `账号 ${admin.username} 登录系统`, admin.username);
  writeDb(db);
  ok(res, { token, admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role } });
});
app.post('/api/auth/logout', (req, res) => { const db = req.db || readDb(); db.sessions = db.sessions.filter(s => s.token !== getToken(req)); addAudit(db, '管理员退出', `账号 ${operator(req)} 退出系统`, operator(req)); writeDb(db); ok(res); });
app.get('/api/auth/me', (req, res) => ok(res, { admin: { id: req.admin.id, username: req.admin.username, name: req.admin.name, role: req.admin.role } }));

app.get('/api/departments', (req, res) => ok(res, { departments: readDb().departments.filter(d => d.status !== 'deleted') }));
app.post('/api/departments', (req, res) => {
  const db = readDb(); const name = String(req.body.name || '').trim();
  if (!name) return fail(res, '部门名称必填');
  if (db.departments.some(d => d.name === name && d.status !== 'deleted')) return fail(res, '部门已存在');
  const department = { id: nextId(db.departments), name, status: 'active', createdAt: now() };
  db.departments.push(department); addAudit(db, '新增部门', `新增部门：${name}`, operator(req)); writeDb(db); ok(res, { department });
});

app.get('/api/employees', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const department = String(req.query.department || '').trim();
  let employees = readDb().employees.filter(e => e.status !== 'deleted');
  if (department) employees = employees.filter(e => e.department === department);
  if (q) employees = employees.filter(e => [e.name, e.jobNo, e.phone, e.cardNo, e.department].some(v => String(v || '').toLowerCase().includes(q)));
  ok(res, { employees });
});
app.post('/api/employees', (req, res) => {
  const db = readDb(); const b = req.body || {};
  if (!b.name || !b.jobNo) return fail(res, '姓名和工号必填');
  if (db.employees.some(e => e.jobNo === b.jobNo && e.status !== 'deleted')) return fail(res, '工号已存在');
  if (b.cardNo && db.employees.some(e => e.cardNo === b.cardNo && e.status !== 'deleted')) return fail(res, '饭卡号已绑定');
  const employee = { id: nextId(db.employees), name: b.name, jobNo: b.jobNo, department: b.department || '', phone: b.phone || '', cardNo: b.cardNo || '', faceCode: b.faceCode || '', balance: money(b.balance), status: b.status || 'active', createdAt: now() };
  db.employees.push(employee); addAudit(db, '新增员工', `新增员工：${employee.name}(${employee.jobNo})`, operator(req)); writeDb(db); ok(res, { employee });
});
app.put('/api/employees/:id', (req, res) => {
  const db = readDb(); const employee = db.employees.find(e => e.id === Number(req.params.id) && e.status !== 'deleted');
  if (!employee) return fail(res, '员工不存在', 404);
  for (const k of ['name', 'jobNo', 'department', 'phone', 'cardNo', 'faceCode', 'status']) if (k in req.body) employee[k] = req.body[k];
  addAudit(db, '编辑员工', `编辑员工：${employee.name}(${employee.jobNo})`, operator(req)); writeDb(db); ok(res, { employee });
});
app.post('/api/employees/:id/status', (req, res) => {
  const db = readDb(); const employee = db.employees.find(e => e.id === Number(req.params.id));
  if (!employee || employee.status === 'deleted') return fail(res, '员工不存在', 404);
  const status = req.body.status;
  if (!['active', 'disabled'].includes(status)) return fail(res, '状态只能为 active 或 disabled');
  employee.status = status; addAudit(db, status === 'active' ? '启用员工' : '禁用员工', `${employee.name}(${employee.jobNo})`, operator(req)); writeDb(db); ok(res, { employee });
});
app.delete('/api/employees/:id', (req, res) => {
  const db = readDb(); const employee = db.employees.find(e => e.id === Number(req.params.id));
  if (!employee || employee.status === 'deleted') return fail(res, '员工不存在', 404);
  if (money(employee.balance) > 0) return fail(res, '账户仍有余额，不能删除，只能禁用');
  employee.status = 'deleted'; addAudit(db, '删除员工', `${employee.name}(${employee.jobNo})`, operator(req)); writeDb(db); ok(res, { employee });
});

app.get('/api/menus', (req, res) => { const db = readDb(); const date = req.query.date || today(); ok(res, { menus: db.menus.filter(m => m.mealDate === date) }); });
app.post('/api/menus', (req, res) => {
  const db = readDb(); const b = req.body || {};
  if (!b.mealDate || !b.mealType || !b.itemName || b.price == null) return fail(res, '日期、餐次、菜品、价格必填');
  const menu = { id: nextId(db.menus), mealDate: b.mealDate, mealType: b.mealType, itemName: b.itemName, price: money(b.price), deadline: b.deadline || `${b.mealDate}T10:30`, supplyLimit: Number(b.supplyLimit || 0), status: b.status || 'enabled', createdAt: now() };
  db.menus.push(menu); addAudit(db, '发布菜单', `${menu.mealDate} ${menu.mealType} ${menu.itemName} ¥${menu.price}`, operator(req)); writeDb(db); ok(res, { menu });
});
app.post('/api/menus/batch', (req, res) => {
  const db = readDb(); const b = req.body || {};
  if (!b.startDate || !b.endDate || !Array.isArray(b.items) || b.items.length === 0) return fail(res, '开始日期、结束日期和套餐列表必填');
  const dates = eachDate(b.startDate, b.endDate); let created = 0;
  for (const date of dates) {
    for (const item of b.items) {
      if (!item.mealType || !item.itemName || item.price == null) continue;
      const exists = db.menus.some(m => m.mealDate === date && m.mealType === item.mealType && m.itemName === item.itemName && m.status !== 'deleted');
      if (exists) continue;
      db.menus.push({ id: nextId(db.menus), mealDate: date, mealType: item.mealType, itemName: item.itemName, price: money(item.price), deadline: `${date}T${item.deadlineTime || '10:30'}`, supplyLimit: Number(item.supplyLimit || 0), status: 'enabled', createdAt: now() });
      created++;
    }
  }
  addAudit(db, '批量生成菜单', `${b.startDate} 至 ${b.endDate}，生成 ${created} 条菜单`, operator(req)); writeDb(db); ok(res, { created });
});
app.post('/api/menus/:id/status', (req, res) => {
  const db = readDb(); const menu = db.menus.find(m => m.id === Number(req.params.id));
  if (!menu) return fail(res, '菜单不存在', 404);
  if (!['enabled', 'disabled'].includes(req.body.status)) return fail(res, '状态错误');
  menu.status = req.body.status; addAudit(db, req.body.status === 'enabled' ? '启用菜单' : '停用菜单', `${menu.mealDate} ${menu.itemName}`, operator(req)); writeDb(db); ok(res, { menu });
});

app.post('/api/orders', (req, res) => {
  const db = readDb(); const employeeId = Number(req.body.employeeId); const menuId = Number(req.body.menuId);
  const employee = db.employees.find(e => e.id === employeeId && e.status === 'active'); const menu = db.menus.find(m => m.id === menuId && m.status === 'enabled');
  if (!employee) return fail(res, '员工不存在或已停用'); if (!menu) return fail(res, '菜单不存在或未启用');
  if (new Date(menu.deadline).getTime() < Date.now()) return fail(res, '已超过订餐截止时间');
  const exists = db.orders.find(o => o.employeeId === employeeId && o.mealDate === menu.mealDate && o.mealType === menu.mealType && o.status !== 'cancelled');
  if (exists) return fail(res, '该餐次已经订过餐');
  const order = { id: nextId(db.orders), employeeId, menuId, mealDate: menu.mealDate, mealType: menu.mealType, price: menu.price, status: 'ordered', orderTime: now(), verifyTime: null, verifyMethod: null };
  db.orders.push(order); addAudit(db, '创建订餐', `${employee.name} 订 ${menu.mealDate} ${menu.mealType} ${menu.itemName}`, operator(req)); writeDb(db); ok(res, { order });
});
app.post('/api/orders/:id/cancel', (req, res) => {
  const db = readDb(); const order = db.orders.find(o => o.id === Number(req.params.id));
  if (!order) return fail(res, '订单不存在', 404); if (order.status === 'consumed') return fail(res, '已取餐订单不能取消');
  order.status = 'cancelled'; order.cancelTime = now(); addAudit(db, '取消订单', `订单ID：${order.id}`, operator(req)); writeDb(db); ok(res, { order });
});
app.get('/api/orders', (req, res) => {
  const db = readDb(); const date = req.query.date || today();
  const orders = db.orders.filter(o => o.mealDate === date).map(o => ({ ...o, employee: db.employees.find(e => e.id === o.employeeId), menu: db.menus.find(m => m.id === o.menuId) }));
  ok(res, { orders });
});

app.post('/api/recharge', (req, res) => {
  const db = readDb(); const employee = db.employees.find(e => e.id === Number(req.body.employeeId) && e.status === 'active'); const amount = money(req.body.amount);
  if (!employee) return fail(res, '员工不存在或已停用'); if (amount < MIN_RECHARGE) return fail(res, `单次充值不能低于 ${MIN_RECHARGE} 元`);
  const day = today(); const todaySum = db.balanceLogs.filter(l => l.employeeId === employee.id && l.type === 'recharge' && String(l.createdAt).slice(0, 10) === day).reduce((s, l) => s + Number(l.amount), 0);
  if (money(todaySum + amount) > MAX_DAILY_RECHARGE) return fail(res, `员工每日充值上限 ${MAX_DAILY_RECHARGE} 元，今日剩余额度 ${money(Math.max(0, MAX_DAILY_RECHARGE - todaySum))} 元`);
  const before = money(employee.balance); employee.balance = money(before + amount);
  db.balanceLogs.push({ id: nextId(db.balanceLogs), employeeId: employee.id, amount, type: 'recharge', beforeBalance: before, afterBalance: employee.balance, relatedOrderId: null, remark: req.body.remark || '管理员充值', operator: operator(req), createdAt: now() });
  addAudit(db, '员工充值', `${employee.name} 充值 ${amount} 元`, operator(req)); writeDb(db); ok(res, { employee });
});

app.post('/api/canteen/verify', (req, res) => {
  const db = readDb(); const method = req.body.method || 'card'; const mealType = req.body.mealType || currentMealType(); let employee;
  if (method === 'card') employee = db.employees.find(e => e.cardNo && e.cardNo === String(req.body.cardNo));
  if (method === 'face') employee = db.employees.find(e => e.faceCode && e.faceCode === String(req.body.faceCode));
  if (!employee || employee.status !== 'active') return verifyFail(db, res, null, method, req.body.deviceId, '员工未识别或已停用');
  const order = db.orders.find(o => o.employeeId === employee.id && o.mealDate === today() && o.mealType === mealType && o.status !== 'cancelled');
  if (!order) return verifyFail(db, res, employee.id, method, req.body.deviceId, '当前餐次未订餐');
  if (order.status === 'consumed') return verifyFail(db, res, employee.id, method, req.body.deviceId, '该订单已取餐，请勿重复核销');
  if (money(employee.balance) < money(order.price)) return verifyFail(db, res, employee.id, method, req.body.deviceId, '余额不足');
  const before = money(employee.balance); employee.balance = money(before - order.price); order.status = 'consumed'; order.verifyTime = now(); order.verifyMethod = method;
  db.balanceLogs.push({ id: nextId(db.balanceLogs), employeeId: employee.id, amount: -money(order.price), type: 'consume', beforeBalance: before, afterBalance: employee.balance, relatedOrderId: order.id, remark: `${order.mealDate} ${order.mealType} 消费`, createdAt: now() });
  db.verifyLogs.push({ id: nextId(db.verifyLogs), employeeId: employee.id, orderId: order.id, verifyMethod: method, deviceId: req.body.deviceId || '', result: 'success', message: '核销成功', createdAt: now() });
  addAudit(db, '核销取餐', `${employee.name} ${method} 核销，扣款 ${order.price} 元`, operator(req)); writeDb(db); ok(res, { message: '核销成功', employeeName: employee.name, amount: order.price, balance: employee.balance, order });
});
function verifyFail(db, res, employeeId, method, deviceId, message) { db.verifyLogs.push({ id: nextId(db.verifyLogs), employeeId, orderId: null, verifyMethod: method, deviceId: deviceId || '', result: 'fail', message, createdAt: now() }); writeDb(db); return fail(res, message); }

app.get('/api/reports/daily', (req, res) => {
  const db = readDb(); const date = req.query.date || today(); const orders = db.orders.filter(o => o.mealDate === date); const consumed = orders.filter(o => o.status === 'consumed');
  const byMeal = ['breakfast', 'lunch', 'dinner'].map(mealType => { const rows = orders.filter(o => o.mealType === mealType); return { mealType, ordered: rows.length, consumed: rows.filter(o => o.status === 'consumed').length, amount: money(rows.filter(o => o.status === 'consumed').reduce((s, o) => s + o.price, 0)) }; });
  ok(res, { date, orderedCount: orders.length, consumedCount: consumed.length, notConsumedCount: orders.length - consumed.length, totalAmount: money(consumed.reduce((s, o) => s + o.price, 0)), byMeal });
});

app.get('/api/reports/range', (req, res) => {
  const db = readDb();
  const start = req.query.start || today();
  const end = req.query.end || start;
  const dates = eachDate(start, end);
  const rows = dates.map(date => {
    const orders = db.orders.filter(o => o.mealDate === date);
    const consumed = orders.filter(o => o.status === 'consumed');
    return { date, orderedCount: orders.length, consumedCount: consumed.length, notConsumedCount: orders.length - consumed.length, totalAmount: money(consumed.reduce((s, o) => s + o.price, 0)) };
  });
  ok(res, { start, end, rows, total: { orderedCount: rows.reduce((s, r) => s + r.orderedCount, 0), consumedCount: rows.reduce((s, r) => s + r.consumedCount, 0), notConsumedCount: rows.reduce((s, r) => s + r.notConsumedCount, 0), totalAmount: money(rows.reduce((s, r) => s + r.totalAmount, 0)) } });
});

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function sendCsv(res, filename, headers, rows) {
  const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\ufeff' + csv);
}
app.get('/api/export/audit-logs', (req, res) => {
  const db = readDb();
  sendCsv(res, 'audit-logs.csv', ['时间', '操作', '详情', '操作人'], db.auditLogs.map(l => [l.createdAt, l.action, l.detail, l.operator]));
});
app.get('/api/export/balance-logs', (req, res) => {
  const db = readDb();
  sendCsv(res, 'balance-logs.csv', ['时间', '员工ID', '类型', '金额', '变动前', '变动后', '备注', '操作人'], db.balanceLogs.map(l => [l.createdAt, l.employeeId, l.type, l.amount, l.beforeBalance, l.afterBalance, l.remark, l.operator || '']));
});
app.get('/api/export/verify-logs', (req, res) => {
  const db = readDb();
  sendCsv(res, 'verify-logs.csv', ['时间', '员工ID', '方式', '结果', '消息', '设备'], db.verifyLogs.map(l => [l.createdAt, l.employeeId || '', l.verifyMethod, l.result, l.message, l.deviceId || '']));
});

app.get('/api/balance-logs', (req, res) => ok(res, { logs: readDb().balanceLogs }));
app.get('/api/verify-logs', (req, res) => ok(res, { logs: readDb().verifyLogs }));
app.get('/api/audit-logs', (req, res) => ok(res, { logs: readDb().auditLogs }));

app.listen(PORT, () => console.log(`Smart canteen running: http://localhost:${PORT}`));
