import { useEffect, useState } from 'react';
import { CalendarClock, MessageSquareText, UserRound, X } from 'lucide-react';
import { REQUEST_STATUS_LABELS } from './RequesterRequests';

const when = (value) => new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

export default function AdminRequestTracking({ user, orderId, suppliers, onClose, onUpdated }) {
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState('RECEIVED_REQUEST');
  const [message, setMessage] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const response = await fetch(`/api/orders/${orderId}`); const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'No se pudo cargar la solicitud.');
    setOrder(body); setStatus(body.requesterVisibleStatus || 'RECEIVED_REQUEST'); setSupplierId(body.proveedorId || '');
  };
  useEffect(() => { load().catch((loadError) => setError(loadError.message)); }, [orderId]);

  const updateTracking = async () => {
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/orders/${orderId}/request-status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, message }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setOrder(body); setMessage(''); onUpdated(body);
    } catch (saveError) { setError(saveError.message || 'No se pudo actualizar el seguimiento.'); } finally { setSaving(false); }
  };
  const updateSupplier = async () => {
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/orders/${orderId}/suggested-supplier`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proveedorId: supplierId }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setOrder(body); onUpdated(body);
    } catch (saveError) { setError(saveError.message || 'No se pudo actualizar el proveedor.'); } finally { setSaving(false); }
  };

  return <div className="request-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="request-detail admin-tracking" role="dialog" aria-modal="true" aria-labelledby="admin-tracking-title">
    <header><div><span className="eyebrow dark">Seguimiento visible</span><h2 id="admin-tracking-title">{order?.numeroOrden || 'Solicitud'}</h2><p>Actualice la información que verá el solicitante.</p></div><button type="button" onClick={onClose} aria-label="Cerrar"><X/></button></header>
    {error && <p className="notice notice-error">{error}</p>}
    {!order ? <p className="request-empty">Cargando…</p> : <>
      <section><h3>Proveedor</h3><div className="admin-tracking-row"><select className="field" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Sin proveedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.nombre}</option>)}</select><button type="button" className="btn-secondary" onClick={updateSupplier} disabled={saving}>Guardar proveedor</button></div></section>
      {user?.role === 'SYSTEM_ADMIN' && <section className="admin-tracking-control"><div className="admin-tracking-title"><div className="admin-tracking-title-icon"><MessageSquareText size={20} /></div><div><h3>Seguimiento para el solicitante</h3><p>El estado y el mensaje se mostrarán en “Mis solicitudes”.</p></div></div><div className="admin-tracking-fields"><label className="label">Estado para solicitante<select className="field mt-1" value={status} onChange={(event) => setStatus(event.target.value)}>{Object.entries(REQUEST_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="label">Mensaje para solicitante<textarea className="field mt-1" rows="4" maxLength="1000" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ej.: Pedido realizado. Entrega estimada jueves." /></label><button type="button" className="btn-primary admin-tracking-submit" onClick={updateTracking} disabled={saving}>{saving ? 'Guardando…' : 'Actualizar seguimiento'}</button></div></section>}
      <section className="admin-history"><div className="admin-history-heading"><div><span className="eyebrow dark">Registro</span><h3>Historial de seguimiento</h3></div><CalendarClock size={20} /></div><div className="request-timeline admin-history-list">{(order.requestStatusHistory || []).map((entry) => <article key={entry.id}><span/><div><strong>{REQUEST_STATUS_LABELS[entry.status] || entry.status}</strong><time>{when(entry.createdAt)}</time><div className="admin-history-user"><UserRound size={13} />{entry.changedBy?.nombre || 'Sistema'}</div>{entry.message ? <p>{entry.message}</p> : <p className="admin-history-empty">Sin mensaje.</p>}</div></article>)}</div></section>
    </>}
  </section></div>;
}
