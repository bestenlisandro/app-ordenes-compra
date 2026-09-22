import { useEffect, useState } from 'react';
import { ChevronRight, Clock3, PackageCheck, X } from 'lucide-react';

export const REQUEST_STATUS_LABELS = {
  RECEIVED_REQUEST: 'Recibido el pedido',
  ORDERED_FROM_SUPPLIER: 'Pedido al proveedor',
  PARTIALLY_DELIVERED: 'Parcialmente entregado',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

const date = (value, withTime = false) => value ? new Date(value).toLocaleString('es-AR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }) : '—';

export default function RequesterRequests() {
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/orders').then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; }).then(setRequests).catch((loadError) => setError(loadError.message || 'No se pudieron cargar sus solicitudes.')).finally(() => setLoading(false));
  }, []);

  return <div className="page-stack requester-list-page">
    <header className="module-header"><div><span className="eyebrow dark">Seguimiento</span><h1>Mis solicitudes</h1><p>Consulte qué solicitó y el estado informado por Compras.</p></div></header>
    {error && <p className="notice notice-error">{error}</p>}
    {loading ? <section className="request-empty">Cargando solicitudes…</section> : requests.length === 0 ? <section className="request-empty"><PackageCheck/><h2>Todavía no hay solicitudes</h2><p>Cuando envíe una solicitud podrá seguirla desde aquí.</p></section> : <section className="request-list">{requests.map((request) => <article className="request-summary" key={request.id}>
      <header><div><span className={`request-status ${request.requesterVisibleStatus?.toLowerCase()}`}>{REQUEST_STATUS_LABELS[request.requesterVisibleStatus] || request.requesterVisibleStatus}</span><h2>{request.numeroOrden}</h2><p>Enviada el {date(request.fechaEmision)}</p></div><button type="button" onClick={() => setSelected(request)} aria-label={`Abrir ${request.numeroOrden}`}><ChevronRight/></button></header>
      <div className="request-summary-items">{request.items.map((item) => <p key={item.id}><strong>{item.descripcion}</strong><span>{Number(item.cantidad)} {item.unidad}</span></p>)}</div>
      <dl><div><dt>Fecha requerida</dt><dd>{date(request.fechaEntregaEsperada)}</dd></div><div><dt>Última actualización</dt><dd>{date(request.updatedAt, true)}</dd></div></dl>
      {request.lastMessage && <blockquote>{request.lastMessage}</blockquote>}
    </article>)}</section>}
    {selected && <div className="request-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="request-detail" role="dialog" aria-modal="true" aria-labelledby="request-detail-title">
      <header><div><span className={`request-status ${selected.requesterVisibleStatus?.toLowerCase()}`}>{REQUEST_STATUS_LABELS[selected.requesterVisibleStatus]}</span><h2 id="request-detail-title">{selected.numeroOrden}</h2><p>Solicitud enviada el {date(selected.fechaEmision, true)}</p></div><button type="button" onClick={() => setSelected(null)} aria-label="Cerrar"><X/></button></header>
      <section><h3>Lo solicitado</h3>{selected.items.map((item) => <div className="request-detail-item" key={item.id}><div><strong>{item.descripcion}</strong><span>{item.codigo || 'Sin código'}</span></div><b>{Number(item.cantidad)} {item.unidad}</b></div>)}</section>
      <section className="request-detail-meta"><div><span>Fecha requerida</span><strong>{date(selected.fechaEntregaEsperada)}</strong></div><div><span>Proveedor sugerido</span><strong>{selected.proveedor?.nombre || 'Sin sugerencia'}</strong></div>{selected.lugarEntrega && <div><span>Lugar de entrega</span><strong>{selected.lugarEntrega}</strong></div>}</section>
      {selected.observaciones && <section><h3>Observaciones</h3><p>{selected.observaciones}</p></section>}
      <section><h3>Historial</h3><div className="request-timeline">{selected.history.map((entry) => <article key={entry.id}><span><Clock3 size={15}/></span><div><strong>{REQUEST_STATUS_LABELS[entry.status] || entry.status}</strong><time>{date(entry.createdAt, true)}</time>{entry.message && <p>{entry.message}</p>}</div></article>)}</div></section>
    </section></div>}
  </div>;
}
