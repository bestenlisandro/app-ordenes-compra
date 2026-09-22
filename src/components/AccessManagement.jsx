import { useCallback, useEffect, useState } from 'react';

const ROLES = { SYSTEM_ADMIN: 'Administrador', REQUESTER: 'Solicitante', APPROVER: 'Aprobador', BUYER: 'Compras', RECEIVER: 'Recepción', FINANCE: 'Finanzas', VENDOR: 'Proveedor' };
const EMPTY_USER = { username: '', password: '', nombre: '', email: '', role: 'REQUESTER', costCenter: '', approvalLimit: '' };

export default function AccessManagement({ user }) {
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');
  const [form, setForm] = useState(EMPTY_USER);
  const [delegation, setDelegation] = useState({ delegateId: '', startsAt: '', endsAt: '' });
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const canManage = user.role === 'SYSTEM_ADMIN';

  const notify = (text, type = 'success') => { setMessage(text); setMessageType(type); };
  const load = useCallback(async () => {
    try {
      const suffix = canManage && showInactive ? '?includeInactive=true' : '';
      const response = await fetch(`/api/users${suffix}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo cargar la lista de usuarios.');
      setUsers(data);
    } catch (error) { notify(error.message, 'error'); }
  }, [canManage, showInactive]);
  useEffect(() => { load(); }, [load]);

  const create = async (event) => {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo crear el usuario.');
      setForm(EMPTY_USER); notify('Usuario creado correctamente.'); await load();
    } catch (error) { notify(error.message, 'error'); } finally { setSaving(false); }
  };

  const delegate = async (event) => {
    event.preventDefault();
    const response = await fetch('/api/delegations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(delegation) });
    const data = await response.json(); notify(response.ok ? 'Delegación registrada.' : data.error, response.ok ? 'success' : 'error');
  };

  const openEditor = (account) => {
    setEditing(account);
    setEditForm({ nombre: account.nombre || '', email: account.email || '', role: account.role, costCenter: account.costCenter || '', approvalLimit: account.approvalLimit ?? '', newPassword: '', confirmPassword: '' });
    setMessage('');
  };
  const closeEditor = () => { if (!saving) { setEditing(null); setEditForm(null); } };
  const patchUser = async (id, body) => {
    const response = await fetch(`/api/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo actualizar el usuario.');
    return data;
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (editForm.newPassword !== editForm.confirmPassword) return notify('Las contraseñas nuevas no coinciden.', 'error');
    if (editForm.newPassword && editForm.newPassword.length < 8) return notify('La nueva contraseña debe tener al menos 8 caracteres.', 'error');
    setSaving(true);
    try {
      const payload = { nombre: editForm.nombre, email: editForm.email, role: editForm.role, costCenter: editForm.costCenter, approvalLimit: editForm.approvalLimit };
      if (editForm.newPassword) payload.newPassword = editForm.newPassword;
      const updated = await patchUser(editing.id, payload);
      setEditing(updated); setEditForm((current) => ({ ...current, newPassword: '', confirmPassword: '' }));
      notify('Usuario actualizado correctamente.'); await load();
    } catch (error) { notify(error.message, 'error'); } finally { setSaving(false); }
  };

  const changeStatus = async () => {
    const nextActive = !editing.active;
    if (!nextActive && !window.confirm('¿Seguro que desea desactivar este usuario?')) return;
    setSaving(true);
    try {
      const updated = await patchUser(editing.id, { active: nextActive });
      setEditing(updated); notify(nextActive ? 'Usuario activado correctamente.' : 'Usuario desactivado correctamente.'); await load();
    } catch (error) { notify(error.message, 'error'); } finally { setSaving(false); }
  };

  return <div className="page-stack">
    <header className="module-header"><div><span className="eyebrow dark">Seguridad</span><h1>{canManage ? 'Usuarios y accesos' : 'Delegación de autoridad'}</h1><p>{canManage ? 'Roles, centros de costos, límites de aprobación y estado de acceso.' : 'Designe un reemplazo temporal durante su ausencia.'}</p></div></header>
    {message && <p className={`notice ${messageType === 'error' ? 'notice-error' : ''}`} role="status">{message}</p>}
    {canManage ? <>
      <form className="material-form" onSubmit={create}><div className="material-section"><div className="form-grid four">
        <Field label="Usuario" value={form.username} set={(value) => setForm({ ...form, username: value })} />
        <Field label="Nombre" value={form.nombre} set={(value) => setForm({ ...form, nombre: value })} />
        <Field label="Contraseña" type="password" minLength={8} value={form.password} set={(value) => setForm({ ...form, password: value })} />
        <RoleField value={form.role} set={(value) => setForm({ ...form, role: value })} />
        <Field label="Correo electrónico" type="email" required={false} value={form.email} set={(value) => setForm({ ...form, email: value })} />
        <Field label="Centro de costos" required={false} value={form.costCenter} set={(value) => setForm({ ...form, costCenter: value })} />
        <Field label="Límite de aprobación" type="number" min="0" required={false} value={form.approvalLimit} set={(value) => setForm({ ...form, approvalLimit: value })} />
      </div></div><div className="form-actions"><button className="btn-primary" disabled={saving}>{saving ? 'Creando…' : 'Crear usuario'}</button></div></form>
      <section className="materials-list">
        <div className="list-heading"><div><h2>Usuarios</h2><p>{showInactive ? 'Activos e inactivos' : 'Usuarios con acceso activo'}</p></div><label className="user-filter"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Mostrar inactivos</label></div>
        {users.length === 0 && <p className="user-empty">No hay usuarios para mostrar.</p>}
        {users.map((account) => <article className={`material-card user-card ${account.active ? '' : 'user-card-inactive'}`} key={account.id}><div className="material-main"><span className={`status-dot ${account.active ? 'activo' : 'inactivo'}`}>{account.active ? 'Activo' : 'Inactivo'}</span><h3>{account.nombre}</h3><p>@{account.username} · {ROLES[account.role] || account.role} · {account.costCenter || 'Sin centro de costos'} · Límite: {account.approvalLimit ?? '—'}</p></div><div className="material-actions"><button type="button" onClick={() => openEditor(account)}>Editar</button></div></article>)}
      </section>
    </> : <form className="material-form" onSubmit={delegate}><div className="material-section"><div className="form-grid four">
      <label className="label">Delegar en<select className="field mt-1" required value={delegation.delegateId} onChange={(event) => setDelegation({ ...delegation, delegateId: event.target.value })}><option value="">Seleccionar</option>{users.filter((account) => account.id !== user.id).map((account) => <option value={account.id} key={account.id}>{account.nombre} · {ROLES[account.role]}</option>)}</select></label>
      <Field label="Desde" type="datetime-local" value={delegation.startsAt} set={(value) => setDelegation({ ...delegation, startsAt: value })} />
      <Field label="Hasta" type="datetime-local" value={delegation.endsAt} set={(value) => setDelegation({ ...delegation, endsAt: value })} />
    </div></div><div className="form-actions"><button className="btn-primary">Crear delegación</button></div></form>}
    {editing && editForm && <div className="user-edit-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}><section className="user-edit-panel" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
      <header className="user-edit-header"><div><span className={`status-dot ${editing.active ? 'activo' : 'inactivo'}`}>{editing.active ? 'Activo' : 'Inactivo'}</span><h2 id="edit-user-title">Editar usuario</h2><p>Modifique los datos y guarde los cambios.</p></div><button type="button" className="user-close" onClick={closeEditor} aria-label="Cerrar">×</button></header>
      {message && <p className={`notice user-edit-notice ${messageType === 'error' ? 'notice-error' : ''}`} role="status">{message}</p>}
      <form onSubmit={saveEdit}><div className="user-edit-fields">
        <Field label="Usuario" value={editing.username} readOnly />
        <Field label="Nombre" value={editForm.nombre} set={(value) => setEditForm({ ...editForm, nombre: value })} />
        <Field label="Correo electrónico" type="email" required={false} value={editForm.email} set={(value) => setEditForm({ ...editForm, email: value })} />
        <RoleField value={editForm.role} set={(value) => setEditForm({ ...editForm, role: value })} />
        <Field label="Centro de costos" required={false} value={editForm.costCenter} set={(value) => setEditForm({ ...editForm, costCenter: value })} />
        <Field label="Límite de aprobación" type="number" min="0" required={false} value={editForm.approvalLimit} set={(value) => setEditForm({ ...editForm, approvalLimit: value })} />
        <Field label="Nueva contraseña" type="password" minLength={8} required={false} autoComplete="new-password" value={editForm.newPassword} set={(value) => setEditForm({ ...editForm, newPassword: value })} />
        <Field label="Confirmar contraseña" type="password" minLength={8} required={Boolean(editForm.newPassword)} autoComplete="new-password" value={editForm.confirmPassword} set={(value) => setEditForm({ ...editForm, confirmPassword: value })} />
        <p className="user-password-help">Deje ambos campos vacíos para conservar la contraseña actual.</p>
      </div><div className="user-status-action"><div><strong>Acceso a la aplicación</strong><span>{editing.active ? 'Este usuario puede iniciar sesión.' : 'Este usuario no puede iniciar sesión.'}</span></div><button type="button" className={editing.active ? 'btn-danger' : 'btn-secondary'} disabled={saving || (editing.active && editing.id === user.id)} onClick={changeStatus}>{editing.active ? 'Desactivar usuario' : 'Activar usuario'}</button></div>
      {editing.active && editing.id === user.id && <p className="user-self-help">No puede desactivar su propio usuario mientras tiene la sesión iniciada.</p>}
      <div className="form-actions"><button type="button" className="btn-secondary" onClick={closeEditor} disabled={saving}>Cancelar</button><button className="btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button></div></form>
    </section></div>}
  </div>;
}

function RoleField({ value, set }) { return <label className="label">Rol<select className="field mt-1" value={value} onChange={(event) => set(event.target.value)}>{Object.entries(ROLES).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>; }
function Field({ label, type = 'text', value, set, required = true, readOnly = false, ...props }) { return <label className="label">{label}<input className="field mt-1" type={type} required={required} readOnly={readOnly} value={value} onChange={set ? (event) => set(event.target.value) : undefined} {...props} /></label>; }
