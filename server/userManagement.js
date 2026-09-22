const { hashPassword, publicUser } = require('./auth');

const ALLOWED_FIELDS = new Set(['nombre', 'email', 'role', 'costCenter', 'approvalLimit', 'active', 'newPassword']);

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`El campo ${field} es obligatorio.`);
  return value.trim();
}

function buildNewUserData(body, roles) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Los datos del usuario no son válidos.');
  if (!roles.includes(body.role)) throw new Error('Rol inválido.');
  const approvalLimit = body.approvalLimit === '' || body.approvalLimit == null ? null : Number(body.approvalLimit);
  if (approvalLimit != null && (!Number.isFinite(approvalLimit) || approvalLimit < 0)) throw new Error('El límite de aprobación debe ser un número igual o mayor a cero.');
  return {
    username: requiredString(body.username, 'usuario').toLowerCase(),
    passwordHash: hashPassword(body.password),
    nombre: requiredString(body.nombre, 'nombre'),
    email: optionalString(body.email),
    role: body.role,
    costCenter: optionalString(body.costCenter),
    approvalLimit,
    supplierId: body.supplierId ? Number(body.supplierId) : null,
  };
}

function parseUserUpdate(body, roles) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Los datos del usuario no son válidos.');
  const unexpected = Object.keys(body).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unexpected.length) throw new Error(`Campos no permitidos: ${unexpected.join(', ')}.`);
  const data = {};
  if ('nombre' in body) {
    if (typeof body.nombre !== 'string' || !body.nombre.trim()) throw new Error('El nombre es obligatorio.');
    data.nombre = body.nombre.trim();
  }
  if ('email' in body) data.email = optionalString(body.email);
  if ('costCenter' in body) data.costCenter = optionalString(body.costCenter);
  if ('role' in body) {
    if (!roles.includes(body.role)) throw new Error('Rol inválido.');
    data.role = body.role;
  }
  if ('active' in body) {
    if (typeof body.active !== 'boolean') throw new Error('El estado activo debe ser verdadero o falso.');
    data.active = body.active;
  }
  if ('approvalLimit' in body) {
    if (body.approvalLimit === '' || body.approvalLimit == null) data.approvalLimit = null;
    else {
      const limit = Number(body.approvalLimit);
      if (!Number.isFinite(limit) || limit < 0) throw new Error('El límite de aprobación debe ser un número igual o mayor a cero.');
      data.approvalLimit = limit;
    }
  }
  if ('newPassword' in body && typeof body.newPassword !== 'string') throw new Error('La nueva contraseña no es válida.');
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (newPassword) data.passwordHash = hashPassword(newPassword);
  if (!Object.keys(data).length) throw new Error('No se informaron cambios para guardar.');
  return { data, passwordChanged: Boolean(newPassword) };
}

function isSystemAdmin(user) {
  return user?.role === 'SYSTEM_ADMIN';
}

async function updateUserAccount(prisma, { actor, targetId, body, ipAddress, roles }) {
  if (!isSystemAdmin(actor)) {
    const error = new Error('Solo un administrador puede modificar usuarios.');
    error.statusCode = 403;
    throw error;
  }
  if (!Number.isInteger(targetId) || targetId <= 0) throw new Error('Usuario inválido.');
  const parsed = parseUserUpdate(body, roles);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { id: targetId } });
    if (!existing) {
      const error = new Error('Usuario no encontrado.');
      error.statusCode = 404;
      throw error;
    }
    if (targetId === actor.id && parsed.data.active === false) throw new Error('No puede desactivar su propio usuario mientras tiene la sesión iniciada.');
    const removesActiveAdmin = existing.active && existing.role === 'SYSTEM_ADMIN' && (parsed.data.active === false || (parsed.data.role && parsed.data.role !== 'SYSTEM_ADMIN'));
    if (removesActiveAdmin) {
      const activeAdmins = await tx.user.count({ where: { active: true, role: 'SYSTEM_ADMIN' } });
      if (activeAdmins <= 1) throw new Error('No puede desactivar ni cambiar el rol del último administrador activo.');
    }
    const user = await tx.user.update({ where: { id: targetId }, data: parsed.data });
    const changedFields = ['nombre', 'email', 'role', 'costCenter', 'approvalLimit'].filter((field) => field in parsed.data && String(existing[field] ?? '') !== String(user[field] ?? ''));
    const audits = [];
    const addAudit = (action, details) => audits.push(tx.auditLog.create({ data: { userId: actor.id, action, entity: 'USER', entityId: String(targetId), details: JSON.stringify(details), ipAddress } }));
    if (changedFields.length) addAudit('USER_UPDATED', { fields: changedFields });
    if (parsed.passwordChanged) addAudit('USER_PASSWORD_CHANGED', { fields: ['password'] });
    if (existing.active !== user.active) addAudit(user.active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', { fields: ['active'] });
    await Promise.all(audits);
    return publicUser(user);
  }, { isolationLevel: 'Serializable' });
}

module.exports = { ALLOWED_FIELDS, buildNewUserData, isSystemAdmin, parseUserUpdate, updateUserAccount };
