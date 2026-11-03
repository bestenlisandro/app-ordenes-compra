import { useEffect, useState } from 'react';
import { formatMoney } from '../utils/purchaseMoney.mjs';

const LABELS = { BORRADOR: 'Borrador', ENVIADA: 'Enviada', APROBADA: 'Aprobada', RECIBIDA: 'Recibida', CANCELADA: 'Cancelada' };
const timeZone = 'America/Argentina/Buenos_Aires';
const monthLabel = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const orderDate = new Intl.DateTimeFormat('es-AR', { timeZone });
const emptyReport = { suppliers: [], monthly: [], byStatus: [] };

export default function Dashboard() {
  const [data, setData] = useState(emptyReport);
  const [supplier, setSupplier] = useState('');
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric', month: '2-digit', timeZone,
  }).format(new Date()));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (supplier) query.set('proveedorId', supplier);
    if (month) query.set('mes', month);
    setLoading(true);
    setError('');
    fetch(`/api/reports/purchases?${query}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) setError('No se pudieron cargar los reportes.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [supplier, month]);

  return <div className="grid gap-6">
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold">Compras por proveedor y mes</h2>
      <p className="mb-5 text-sm text-slate-500">Órdenes no canceladas, agrupadas por mes de emisión y moneda.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">Proveedor<select className="field" value={supplier} onChange={(event) => setSupplier(event.target.value)}>
          <option value="">Todos los proveedores</option>
          {data.suppliers.map(({ id, nombre }) => <option key={id} value={id}>{nombre}</option>)}
        </select></label>
        <div><label className="label">Mes y año<input className="field" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
          <button type="button" className="mt-2 text-sm underline" onClick={() => setMonth('')}>Todos los meses</button></div>
      </div>
      {loading && <p role="status" className="mt-5 text-sm">Cargando reportes…</p>}
      {error && <p role="alert" className="mt-5 text-red-600">{error}</p>}
      {!loading && !error && <div className="mt-5 space-y-3">
        {!data.monthly.length && <p className="text-sm text-slate-500">No hay órdenes para estos filtros.</p>}
        {data.monthly.map(({ proveedor, month: period, moneda, total, orders }) => <details key={`${proveedor?.id}-${period}-${moneda}`} className="rounded-lg border p-3">
          <summary className="cursor-pointer font-medium">
            {proveedor?.nombre || 'Sin proveedor'} · {monthLabel.format(new Date(`${period}-01T00:00:00Z`))} · {orders.length} {orders.length === 1 ? 'orden' : 'órdenes'} · {formatMoney(total, moneda)} ({moneda})
          </summary>
          <ul className="mt-3 divide-y text-sm">
            {orders.map((order) => <li key={order.id} className="py-3">
              <div className="flex flex-wrap justify-between gap-2 font-medium">
                <span>{order.numeroOrden} · {orderDate.format(new Date(order.fechaEmision))}</span>
                <span>{formatMoney(order.total, moneda)}</span>
              </div>
              <ul className="mt-2 space-y-1 text-slate-600">
                {order.items.map((item) => <li key={item.id}>
                  {item.nombreProveedor || item.producto.descripcion} · {Number(item.cantidad).toLocaleString('es-AR', { maximumFractionDigits: 10 })} × {formatMoney(item.precioUnitario, moneda, 4)}
                </li>)}
              </ul>
            </li>)}
          </ul>
        </details>)}
      </div>}
    </section>
    {!loading && !error && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">Órdenes según estado</h2>
      {data.byStatus.map(({ estado, moneda, cantidad, total }) => <div key={`${estado}-${moneda}`} className="flex flex-wrap justify-between gap-2 border-t py-2 text-sm">
        <span>{LABELS[estado] || estado} · {cantidad} {cantidad === 1 ? 'orden' : 'órdenes'}</span>
        <span>{formatMoney(total, moneda)} ({moneda})</span>
      </div>)}
      {!data.byStatus.length && <p className="text-sm text-slate-500">No hay órdenes para estos filtros.</p>}
    </section>}
  </div>;
}
