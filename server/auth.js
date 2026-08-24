const crypto = require('crypto');
const ROLE_PERMISSIONS = {
  SYSTEM_ADMIN: ['users:manage','audit:read','delegations:manage','delegations:create','catalog:read','orders:read','orders:create','orders:approve','orders:buy','orders:receive','orders:finance','orders:vendor','suppliers:manage','items:manage','stock:manage','reports:read'], REQUESTER: ['catalog:read','orders:read','orders:create'],
  APPROVER: ['catalog:read','orders:read','orders:approve','delegations:create'], BUYER: ['catalog:read','orders:read','orders:create','orders:buy','suppliers:manage','items:manage'],
  RECEIVER: ['catalog:read','orders:read','orders:receive','stock:manage'], FINANCE: ['orders:read','orders:finance','reports:read'], VENDOR: ['orders:read','orders:vendor']
};
const secret=()=>process.env.AUTH_SECRET||'cambiar-esta-clave-en-produccion';
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){if(typeof password!=='string'||password.length<8)throw new Error('La contraseña debe tener al menos 8 caracteres.');return `${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`}
function verifyPassword(password,stored){try{const [salt,hash]=stored.split(':');return crypto.timingSafeEqual(Buffer.from(hash,'hex'),crypto.scryptSync(password,salt,64))}catch{return false}}
function signToken(user){const payload=Buffer.from(JSON.stringify({sub:user.id,exp:Date.now()+28800000})).toString('base64url');return `${payload}.${crypto.createHmac('sha256',secret()).update(payload).digest('base64url')}`}
function readToken(token){try{const [payload,signature]=String(token||'').split('.');const expected=crypto.createHmac('sha256',secret()).update(payload).digest('base64url');if(!signature||signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;const data=JSON.parse(Buffer.from(payload,'base64url'));return data.exp>Date.now()?data:null}catch{return null}}
const publicUser=(u,delegatedRoles=[])=>({id:u.id,username:u.username,nombre:u.nombre,email:u.email,role:u.role,costCenter:u.costCenter,approvalLimit:u.approvalLimit==null?null:Number(u.approvalLimit),supplierId:u.supplierId,active:u.active,delegatedRoles,permissions:[...new Set([...(ROLE_PERMISSIONS[u.role]||[]),...delegatedRoles.flatMap(r=>ROLE_PERMISSIONS[r]||[])])]});
module.exports={ROLE_PERMISSIONS,hashPassword,verifyPassword,signToken,readToken,publicUser};
