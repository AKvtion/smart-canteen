const { readDb, writeDb, nextId, now, today, sha256 } = require('./store');

const db = readDb();
const d = today();

if (db.admins.length === 0) {
  db.admins.push({ id: 1, username: 'admin', passwordHash: sha256('admin123'), name: '系统管理员', role: 'admin', status: 'active', createdAt: now() });
}

if (db.departments.length === 0) {
  db.departments.push(
    { id: 1, name: '生产部', status: 'active', createdAt: now() },
    { id: 2, name: '财务部', status: 'active', createdAt: now() },
    { id: 3, name: '行政部', status: 'active', createdAt: now() }
  );
}

if (db.employees.length === 0) {
  db.employees.push(
    { id: 1, name: '张三', jobNo: 'E001', department: '生产部', phone: '13800000001', cardNo: '10001', faceCode: 'face001', balance: 100, status: 'active', createdAt: now() },
    { id: 2, name: '李四', jobNo: 'E002', department: '财务部', phone: '13800000002', cardNo: '10002', faceCode: 'face002', balance: 50, status: 'active', createdAt: now() }
  );
}

if (!db.menus.some(m => m.mealDate === d)) {
  const startId = nextId(db.menus);
  db.menus.push(
    { id: startId, mealDate: d, mealType: 'breakfast', itemName: '早餐套餐', price: 5, deadline: `${d}T23:59`, supplyLimit: 0, status: 'enabled', createdAt: now() },
    { id: startId + 1, mealDate: d, mealType: 'lunch', itemName: '午餐套餐', price: 12, deadline: `${d}T23:59`, supplyLimit: 0, status: 'enabled', createdAt: now() },
    { id: startId + 2, mealDate: d, mealType: 'dinner', itemName: '晚餐套餐', price: 10, deadline: `${d}T23:59`, supplyLimit: 0, status: 'enabled', createdAt: now() }
  );
}

writeDb(db);
console.log('Seed data ready.');
console.log('Default admin: admin / admin123');
