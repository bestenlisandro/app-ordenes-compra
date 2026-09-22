import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ROLE_PERMISSIONS, hashPassword, verifyPassword } = require('../server/auth.js');
const { ALLOWED_FIELDS, buildNewUserData, isSystemAdmin, parseUserUpdate, updateUserAccount } = require('../server/userManagement.js');
const roles = Object.keys(ROLE_PERMISSIONS);
const originalPassword = 'ClaveOriginal1!';

function account(overrides = {}) {
  return { id: 2, username: 'operador', passwordHash: hashPassword(originalPassword), nombre: 'Operador', email: null, role: 'REQUESTER', costCenter: null, approvalLimit: null, supplierId: null, active: true, ...overrides };
}

function fixture(initialUsers = [account(), account({ id: 1, username: 'admin', nombre: 'Administrador', role: 'SYSTEM_ADMIN' })]) {
  const users = initialUsers.map((value) => ({ ...value }));
  const audits = [];
  const tx = {
    user: {
      findUnique: async ({ where }) => users.find((value) => value.id === where.id) || null,
      count: async ({ where }) => users.filter((value) => value.active === where.active && value.role === where.role).length,
      update: async ({ where, data }) => {
        const index = users.findIndex((value) => value.id === where.id);
        users[index] = { ...users[index], ...data };
        return users[index];
      },
    },
    auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
  };
  return { users, audits, prisma: { $transaction: async (callback) => callback(tx) } };
}

const admin = { id: 1, role: 'SYSTEM_ADMIN' };
const update = (db, targetId, body, actor = admin) => updateUserAccount(db.prisma, { actor, targetId, body, ipAddress: '127.0.0.1', roles });

test('1. un administrador modifica datos generales permitidos', async () => {
  const db = fixture();
  const result = await update(db, 2, { nombre: 'Nombre nuevo', email: 'nuevo@besten.com', role: 'BUYER', costCenter: 'CC-10', approvalLimit: 2500 });
  assert.equal(result.nombre, 'Nombre nuevo'); assert.equal(result.role, 'BUYER'); assert.equal(result.approvalLimit, 2500);
  assert.equal(db.audits[0].action, 'USER_UPDATED');
});

test('2. la respuesta pública nunca incluye passwordHash', async () => {
  const db = fixture();
  const result = await update(db, 2, { nombre: 'Operador editado' });
  assert.equal('passwordHash' in result, false);
});

test('3. una contraseña vacía conserva el hash actual', async () => {
  const db = fixture(); const before = db.users[0].passwordHash;
  await update(db, 2, { nombre: 'Operador editado', newPassword: '' });
  assert.equal(db.users[0].passwordHash, before); assert.equal(verifyPassword(originalPassword, before), true);
});

test('4. una contraseña nueva usa el hash actual y reemplaza el acceso', async () => {
  const db = fixture(); const next = 'NuevaClave99!';
  await update(db, 2, { newPassword: next });
  assert.equal(verifyPassword(next, db.users[0].passwordHash), true); assert.equal(verifyPassword(originalPassword, db.users[0].passwordHash), false);
});

test('5. la contraseña nueva debe tener al menos ocho caracteres', () => {
  assert.throws(() => parseUserUpdate({ newPassword: 'corta' }, roles), /8 caracteres/);
});

test('6. una contraseña con tipo inválido se rechaza', () => {
  assert.throws(() => parseUserUpdate({ newPassword: 12345678 }, roles), /no es válida/);
});

test('7. un usuario sin rol SYSTEM_ADMIN recibe 403', async () => {
  const db = fixture();
  await assert.rejects(update(db, 2, { nombre: 'Intento' }, { id: 3, role: 'APPROVER', permissions: ['users:manage'] }), (error) => error.statusCode === 403);
});

test('8. el administrador no puede desactivar su propia sesión', async () => {
  const db = fixture();
  await assert.rejects(update(db, 1, { active: false }), /propio usuario/);
});

test('9. no se puede desactivar el último administrador activo', async () => {
  const db = fixture();
  await assert.rejects(update(db, 1, { active: false }, { id: 9, role: 'SYSTEM_ADMIN' }), /último administrador/);
});

test('10. no se puede cambiar el rol del último administrador activo', async () => {
  const db = fixture();
  await assert.rejects(update(db, 1, { role: 'BUYER' }, { id: 9, role: 'SYSTEM_ADMIN' }), /último administrador/);
});

test('11. con dos administradores activos se permite bajar el rol de uno', async () => {
  const db = fixture([account({ id: 1, username: 'admin1', role: 'SYSTEM_ADMIN' }), account({ id: 3, username: 'admin2', role: 'SYSTEM_ADMIN' })]);
  const result = await update(db, 3, { role: 'APPROVER' });
  assert.equal(result.role, 'APPROVER');
});

test('12. desactivar y reactivar genera auditorías específicas', async () => {
  const db = fixture();
  await update(db, 2, { active: false }); await update(db, 2, { active: true });
  assert.deepEqual(db.audits.map((entry) => entry.action), ['USER_DEACTIVATED', 'USER_ACTIVATED']);
});

test('13. una cuenta inactiva queda marcada para impedir el login', async () => {
  const db = fixture(); const result = await update(db, 2, { active: false });
  assert.equal(result.active, false); assert.equal(Boolean(db.users[0].active && verifyPassword(originalPassword, db.users[0].passwordHash)), false);
});

test('14. solo se aceptan los campos declarados y nunca passwordHash', () => {
  assert.equal(ALLOWED_FIELDS.has('passwordHash'), false);
  assert.throws(() => parseUserUpdate({ passwordHash: 'inyectado' }, roles), /no permitidos/);
  assert.throws(() => parseUserUpdate({ password: 'OtraClave1!' }, roles), /no permitidos/);
});

test('15. la auditoría de cambio de clave no contiene clave ni hash', async () => {
  const db = fixture(); const secret = 'SecretoTemporal7!';
  await update(db, 2, { newPassword: secret });
  const serialized = JSON.stringify(db.audits);
  assert.equal(db.audits[0].action, 'USER_PASSWORD_CHANGED');
  assert.equal(serialized.includes(secret), false); assert.equal(serialized.includes(db.users[0].passwordHash), false); assert.equal(serialized.includes('passwordHash'), false);
  assert.equal(isSystemAdmin(admin), true);
});

test('16. la creación de usuarios mantiene el hash y las reglas existentes', () => {
  const data = buildNewUserData({ username: ' NUEVO ', password: 'ClaveNueva88!', nombre: 'Nuevo Usuario', email: '', role: 'REQUESTER', costCenter: 'Producción', approvalLimit: 0 }, roles);
  assert.equal(data.username, 'nuevo'); assert.equal(data.nombre, 'Nuevo Usuario'); assert.equal(data.email, null);
  assert.equal(data.approvalLimit, 0); assert.equal(verifyPassword('ClaveNueva88!', data.passwordHash), true);
});
