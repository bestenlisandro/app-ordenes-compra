import { useEffect, useState } from 'react';
import { CalendarDays, Check, ChevronRight, Clock3, MessageSquareText, PackageCheck, X } from 'lucide-react';

export const REQUEST_STATUS_LABELS = {
  RECEIVED_REQUEST: 'Recibido el pedido',
  ORDERED_FROM_SUPPLIER: 'Pedido al proveedor',
  PARTIALLY_DELIVERED: 'Parcialmente entregado',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

const TRACKING_STEPS = [
  { key: 'SUBMITTED', label: 'Solicitud enviada' },
  { key: 'RECEIVED_REQUEST', label: REQUEST_STATUS_LABELS.RECEIVED_REQUEST },
  { key: 'ORDERED_FROM_SUPPLIER', label: REQUEST_STATUS_LABELS.ORDERED_FROM_SUPPLIER },
  { key: 'PARTIALLY_DELIVERED', label: REQUEST_STATUS_LABELS.PARTIALLY_DELIVERED },
  { key: 'DELIVERED', label: REQUEST_STATUS_LABELS.DELIVERED },
];

const date = (value) => value ? new Date(value).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const time = (value) => value ? new Date(value).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
const quantity = (value) => Number(value).toLocaleString('es-AR', { maximumFractionDigits: 3 });

const isSubmissionEvent = (entry) => entry.status === 'RECEIVED_REQUEST' && /^solicitud enviada\.?$/i.test(entry.message?.trim() || '');

function buildTimeline(request) {
  const history = [...(request.history || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const submissionEvent = history.find(isSubmissionEvent);
  const statusEvents = history.filter((entry) => entry !== submissionEvent);
  const currentIndex = TRACKING_STEPS.findIndex((step) => step.key === request.requesterVisibleStatus);
  const cancelled = request.requesterVisibleStatus === 'CANCELLED';

  const steps = TRACKING_STEPS.map((step, index) => {
    const events = step.key === 'SUBMITTED'
      ? [{ id: submissionEvent?.id || `submitted-${request.id}`, createdAt: submissionEvent?.createdAt || request.fechaEmision, message: null }]
      : statusEvents.filter((entry) => entry.status === step.key);
    const isCurrent = !cancelled && step.key === request.requesterVisibleStatus;
    const completed = !isCurrent && (events.length > 0 || (!cancelled && currentIndex > index));
    return { ...step, events, state: isCurrent ? 'current' : completed ? 'completed' : 'future' };
  });

  if (cancelled || statusEvents.some((entry) => entry.status === 'CANCELLED')) {
    steps.push({
      key: 'CANCELLED',
      label: REQUEST_STATUS_LABELS.CANCELLED,
      events: statusEvents.filter((entry) => entry.status === 'CANCELLED'),
      state: cancelled ? 'current cancelled' : 'completed cancelled',
    });
  }
  return steps;
}

function StatusBadge({ status }) {
  return <span className={`request-status ${status?.toLowerCase()}`}>{REQUEST_STATUS_LABELS[status] || status}</span>;
}

function TrackingTimeline({ request }) {
  return <div className="request-progress" aria-label="Línea de tiempo de la solicitud">
    {buildTimeline(request).map((step) => <article className={`request-progress-step ${step.state}`} key={step.key}>
      <div className="request-progress-marker" aria-hidden="true">{step.state.includes('completed') ? <Check size={14} /> : <span />}</div>
      <div className="request-progress-content">
        <header><strong>{step.label}</strong><span>{step.state.includes('current') ? 'Estado actual' : step.state.includes('completed') ? 'Completado' : 'Pendiente'}</span></header>
        {step.events.map((entry) => <div className="request-progress-event" key={entry.id}>
          {entry.createdAt && <div className="request-progress-date"><CalendarDays size={14} /><time dateTime={entry.createdAt}>{date(entry.createdAt)} <span>· {time(entry.createdAt)}</span></time></div>}
          {entry.message && <p>{entry.message}</p>}
        </div>)}
      </div>
    </article>)}
  </div>;
}

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
    {loading ? <section className="request-empty">Cargando solicitudes…</section> : requests.length === 0 ? <section className="request-empty"><PackageCheck/><h2>Todavía no hay solicitudes</h2><p>Cuando envíe una solicitud podrá seguirla desde aquí.</p></section> : <section className="request-list">{requests.map((request) => {
      const primaryItem = request.items[0];
      return <article className="request-summary" key={request.id}>
        <header className="request-summary-header"><div><span className="request-card-kicker">Solicitud</span><h2>{request.numeroOrden}</h2><p><CalendarDays size={14} /> Enviada el {date(request.fechaEmision)}</p></div><StatusBadge status={request.requesterVisibleStatus} /></header>
        <div className="request-primary-item"><div className="request-primary-icon"><PackageCheck size={21} /></div><div><span>Producto o descripción principal</span><strong>{primaryItem?.descripcion || 'Sin descripción'}</strong><p>{primaryItem ? `${quantity(primaryItem.cantidad)} ${primaryItem.unidad}` : 'Sin ítems'}{request.items.length > 1 && ` · ${request.items.length - 1} ítem${request.items.length > 2 ? 's' : ''} más`}</p></div></div>
        <dl className="request-summary-dates"><div><dt>Fecha requerida</dt><dd>{date(request.fechaEntregaEsperada)}</dd></div><div><dt>Última actualización</dt><dd>{date(request.updatedAt)} <span>{time(request.updatedAt)}</span></dd></div></dl>
        <div className="request-latest-message"><MessageSquareText size={18} /><div><span>Último mensaje</span><p>{request.lastMessage || 'No hay novedades adicionales.'}</p></div></div>
        <footer><button type="button" className="request-follow-button" onClick={() => setSelected(request)}>Ver seguimiento <ChevronRight size={18} /></button></footer>
      </article>;
    })}</section>}
    {selected && <div className="request-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="request-detail" role="dialog" aria-modal="true" aria-labelledby="request-detail-title">
      <header><div><StatusBadge status={selected.requesterVisibleStatus} /><h2 id="request-detail-title">Seguimiento de {selected.numeroOrden}</h2><p>Solicitud enviada el {date(selected.fechaEmision)} a las {time(selected.fechaEmision)}</p></div><button type="button" onClick={() => setSelected(null)} aria-label="Cerrar"><X/></button></header>
      <section className="request-detail-overview"><h3>Lo solicitado</h3>{selected.items.map((item) => <div className="request-detail-item" key={item.id}><div><strong>{item.descripcion}</strong><span>{item.codigo || 'Sin código'}</span></div><b>{quantity(item.cantidad)} {item.unidad}</b></div>)}</section>
      <section className="request-detail-meta"><div><span>Fecha requerida</span><strong>{date(selected.fechaEntregaEsperada)}</strong></div>{selected.lugarEntrega && <div><span>Lugar de entrega</span><strong>{selected.lugarEntrega}</strong></div>}<div><span>Última actualización</span><strong>{date(selected.updatedAt)} · {time(selected.updatedAt)}</strong></div></section>
      {selected.observaciones && <section><h3>Observaciones</h3><p>{selected.observaciones}</p></section>}
      <section className="request-tracking-section"><div className="request-tracking-heading"><div><span className="eyebrow dark">Avance</span><h3>Línea de tiempo</h3></div><Clock3 size={20} /></div><TrackingTimeline request={selected} /></section>
    </section></div>}
  </div>;
}
