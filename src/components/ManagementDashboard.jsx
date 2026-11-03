import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, Building2, Clock3, FileText, Package, Wallet } from 'lucide-react';
import { formatMoney } from '../utils/purchaseMoney.mjs';
import Dashboard from './Dashboard';

const states = { BORRADOR: 'Borrador', ENVIADA: 'Enviada', APROBADA: 'Aprobada', RECIBIDA: 'Recibida', CANCELADA: 'Cancelada' };
const colors = { BORRADOR: '#94a3b8', ENVIADA: '#547494', APROBADA: '#d49a37', RECIBIDA: '#288267', CANCELADA: '#b75c61' };
const presets = [['current', 'Este mes'], ['last', 'Mes anterior'], ['3', 'Últimos 3 meses'], ['6', 'Últimos 6 meses'], ['year', 'Año actual'], ['custom', 'Personalizado']];
const initial = { preset: 'current', from: '', to: '', supplierId: '', costCenter: '', status: '', q: '' };
const zone = 'America/Argentina/Buenos_Aires';
const date = new Intl.DateTimeFormat('es-AR', { timeZone: zone });
const month = new Intl.DateTimeFormat('es-AR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const integer = new Intl.NumberFormat('es-AR');
const percent = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const panel = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5';
const pct = (value) => value == null ? '—' : percent.format(value) + ' %';
const delta = (value, base) => Number(base) > 0 ? (Number(value) / Number(base) - 1) * 100 : null;
const monthName = (value) => month.format(new Date(value + '-01T12:00:00Z'));
const currentMonth = () => new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', timeZone: zone }).format(new Date());

function period(filters) {
  const now = currentMonth();
  const shift = (n) => {
    const date = new Date(now + '-01T12:00:00Z');
    date.setUTCMonth(date.getUTCMonth() + n);
    return date.toISOString().slice(0, 7);
  };
  if (filters.preset === 'custom') return { from: filters.from || now, to: filters.to || filters.from || now };
  if (filters.preset === 'last') return { from: shift(-1), to: shift(-1) };
  if (filters.preset === 'year') return { from: now.slice(0, 4) + '-01', to: now };
  const offset = filters.preset === 'current' ? 0 : 1 - Number(filters.preset);
  return { from: shift(offset), to: now };
}

function Panel({ title, subtitle, children, className = '' }) {
  return <section className={panel + ' ' + className}>
    <h2 className="text-base font-semibold text-slate-900">{title}</h2>
    {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    <div className="mt-4">{children}</div>
  </section>;
}
const Empty = ({ children = 'No hay datos para estos filtros.' }) => <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">{children}</p>;

function Trend({ rows, money }) {
  const [active, setActive] = useState(null);
  const max = Math.max(...rows.map((row) => Number(row.spend)), 1);
  const step = 560 / Math.max(1, rows.length - 1);
  const points = rows.map((row, i) => [25 + i * step, 158 - 125 * Number(row.spend) / max]);
  const selected = active == null ? null : rows[active];
  return <>
    <div className="flex justify-between gap-3 text-xs text-slate-600">
      <span>Gasto mensual · {money(max)}</span>
      {selected && <output>{monthName(selected.month)} · {money(selected.spend)} · {selected.count} OC</output>}
    </div>
    <svg viewBox="0 0 610 178" className="mt-2 block w-full" role="group" aria-label="Evolución mensual del gasto">
      {[33, 75, 116, 158].map((y) => <line key={y} x1="25" x2="585" y1={y} y2={y} stroke="#e2e8f0" />)}
      <polygon points={`25,158 ${points.join(' ')} 585,158`} fill="#e5eef6" />
      <polyline points={points.join(' ')} fill="none" stroke="#365c7e" strokeWidth="3" strokeLinejoin="round" />
      {points.map(([x, y], i) => {
        const row = rows[i];
        const label = `${monthName(row.month)} · ${money(row.spend)} · ${row.count} órdenes`;
        return <circle key={row.month} cx={x} cy={y} r={active === i ? 7 : 5} fill="#365c7e"
          tabIndex={0} aria-label={label} onFocus={() => setActive(i)} onPointerEnter={() => setActive(i)} onClick={() => setActive(i)}>
          <title>{label}</title>
        </circle>;
      })}
    </svg>
    <div className="flex justify-between gap-1 text-[10px] text-slate-600 sm:text-xs">
      {rows.filter((_, i) => rows.length <= 6 || i % Math.ceil(rows.length / 6) === 0 || i === rows.length - 1)
        .map((row) => <span key={row.month}>{monthName(row.month)}</span>)}
    </div>
  </>;
}

function StatusChart({ rows, total }) {
  let offset = 0;
  return <div className="flex flex-wrap items-center gap-5">
    <svg viewBox="0 0 120 120" className="w-32 shrink-0" role="group" aria-label="Distribución por estado">
      <circle cx="60" cy="60" r="46" fill="none" stroke="#e2e8f0" strokeWidth="12" />
      {rows.filter((row) => row.count).map(({ estado, count }) => {
        const share = count / total * 100;
        const start = offset;
        offset += share;
        return <circle key={estado} cx="60" cy="60" r="46" pathLength="100" fill="none" stroke={colors[estado]}
          strokeWidth="12" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-start}
          transform="rotate(-90 60 60)" tabIndex={0} aria-label={`${states[estado]} · ${count} OC · ${share.toFixed(1)} %`}>
          <title>{states[estado]} · {count} OC · {share.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %</title>
        </circle>;
      })}
      <text x="60" y="58" textAnchor="middle" className="fill-slate-900 text-xl font-semibold">{total}</text>
      <text x="60" y="75" textAnchor="middle" className="fill-slate-500 text-[10px]">órdenes</text>
    </svg>
    <ul className="min-w-[8rem] flex-1 space-y-2 text-sm">
      {rows.map(({ estado, count }) => <li key={estado} className="flex justify-between gap-4">
        <span><span className="mr-2 inline-block size-2 rounded-full" style={{ background: colors[estado] }} />{states[estado]}</span><strong>{count}</strong>
      </li>)}
    </ul>
  </div>;
}

function Table({ headers, children }) {
  return <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={headers.join(', ')}>
    <table className="w-full text-left text-sm">
      <thead className="bg-slate-50 text-xs text-slate-600"><tr>{headers.map((label) => <th key={label} scope="col" className="whitespace-nowrap px-3 py-2">{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100 [&_td]:px-3 [&_td]:py-2">{children}</tbody>
    </table>
  </div>;
}

export default function ManagementDashboard({ onReview }) {
  const [detail, setDetail] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [filters, setFilters] = useState(initial);
  const [data, setData] = useState(null);
  const [currency, setCurrency] = useState('ARS');
  const [allSuppliers, setAllSuppliers] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const range = period(filters);
  const query = new URLSearchParams(range);
  for (const key of ['supplierId', 'costCenter', 'status', 'q']) if (filters[key]) query.set(key, filters[key]);
  const queryString = query.toString();

  useEffect(() => {
    if (detail) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/dashboard/management?' + queryString, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!controller.signal.aborted) setData(result);
      } catch (error) {
        if (!controller.signal.aborted) setError(error.message || 'No se pudo cargar el dashboard.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [queryString, detail]);

  const set = (key) => (event) => setFilters((previous) => ({ ...previous, [key]: event.target.value }));
  const series = data?.monetary.find((entry) => entry.moneda === currency) ?? data?.monetary[0];
  const money = (value) => formatMoney(value, series?.moneda || 'ARS');
  const counts = data?.kpis;
  const cards = series && [
    [Wallet, 'Gasto del período', money(series.kpis.spend), `${pct(delta(series.kpis.spend, series.previous.spend))} vs. período anterior`],
    [FileText, 'Órdenes de compra', integer.format(counts.count), `${percent.format(counts.count - data.previousCount)} OC vs. período anterior`],
    [Activity, 'Ticket promedio', money(series.kpis.ticket), `${series.kpis.validCount} OC no canceladas en ${series.moneda}`],
    [Clock3, 'Valor pendiente', money(series.pending), 'Capital comprometido pendiente de recepción'],
    [Building2, 'Proveedores activos', integer.format(counts.suppliers), 'Con órdenes no canceladas'],
    [Package, 'Requieren atención', integer.format(counts.attention), 'Órdenes abiertas para revisar'],
  ];
  const showPeriod = (from, to) => from === to ? monthName(from) : `${monthName(from)} – ${monthName(to)}`;

  return <div className="grid min-w-0 gap-5 text-slate-800">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Gestión de compras</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{detail ? 'Reporte detallado' : 'Dashboard de compras'}</h1>
        {!detail && <p className="mt-1 text-sm text-slate-600">{showPeriod(range.from, range.to)}</p>}
      </div>
      <button className="btn-secondary" onClick={() => setDetail(!detail)}>{detail ? 'Volver al dashboard' : 'Reporte detallado'} <ArrowUpRight size={16} /></button>
    </header>
    {detail ? <Dashboard /> : <>
      <button type="button" className="btn-secondary justify-self-start sm:hidden" aria-expanded={mobileFilters}
        aria-controls="management-filters" onClick={() => setMobileFilters(!mobileFilters)}>
        {mobileFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
      </button>
      <section id="management-filters" className={panel + (mobileFilters ? '' : ' hidden sm:block')} aria-label="Filtros del dashboard">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="label">Período<select className="field" value={filters.preset} onChange={set('preset')}>{presets.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
          <label className="label">Proveedor<select className="field" value={filters.supplierId} onChange={set('supplierId')}><option value="">Todos</option>{data?.suppliers.map(({ id, nombre }) => <option key={id} value={id}>{nombre}</option>)}</select></label>
          <label className="label">Centro de costo<select className="field" value={filters.costCenter} onChange={set('costCenter')}><option value="">Todos</option>{data?.centers.map((center) => <option key={center}>{center}</option>)}</select></label>
          <label className="label">Estado<select className="field" value={filters.status} onChange={set('status')}><option value="">Todos</option>{Object.entries(states).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
          <label className="label">Buscar<input className="field" value={filters.q} onChange={set('q')} maxLength={200} placeholder="Número de OC o proveedor" /></label>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {filters.preset === 'custom' && <>
            <label className="label">Desde, mes y año<input type="month" className="field" value={range.from} onChange={set('from')} /></label>
            <label className="label">Hasta, mes y año<input type="month" className="field" value={range.to} onChange={set('to')} /></label>
          </>}
          {data?.monetary.length > 1 && <label className="label">Moneda de importes<select className="field" value={series.moneda} onChange={(event) => setCurrency(event.target.value)}>{data.monetary.map(({ moneda }) => <option key={moneda}>{moneda}</option>)}</select></label>}
          <button className="btn-secondary" onClick={() => { setFilters(initial); setCurrency('ARS'); setAllSuppliers(false); }}>Limpiar filtros</button>
        </div>
      </section>
      {loading ? <div role="status" className={panel}>Cargando indicadores…</div> : error ? <div role="alert" className={panel + ' text-red-700'}>{error}</div> : data && <>
        {!counts.count && <Empty>No hay órdenes para {showPeriod(range.from, range.to)} con estos filtros.</Empty>}
        {cards && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {cards.map(([Icon, label, value, description], index) => <section key={label} className={panel + (index === 0 ? ' border-blue-200 bg-blue-50/50' : '')}>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-600"><Icon size={17} aria-hidden="true" />{label}</div>
            <div className="mt-2 break-words text-xl font-bold tabular-nums text-slate-900">{value}</div>
            <p className="mt-1 text-xs text-slate-600">{description}</p>
          </section>)}
        </div>}
        {series && <>
          <Panel title="Evolución mensual de compras" subtitle={`Importes en ${series.moneda} · termina en el mes seleccionado · excluye canceladas`}>
            {series.monthlySpend.some((row) => Number(row.spend) > 0) ? <Trend rows={series.monthlySpend} money={money} /> : <Empty />}
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Top proveedores por monto" subtitle={series.top3 == null ? undefined : `Los tres principales concentran ${pct(series.top3).replace('+', '')} del gasto.`}>
              {!series.supplierSpend.length && <Empty />}
              <ul className="space-y-3">{series.supplierSpend.slice(0, allSuppliers ? undefined : 5).map((entry) => <li key={entry.id} title={`${entry.name} · ${money(entry.total)} · ${pct(entry.share).replace('+', '')} · ${entry.count} órdenes`}>
                <div className="flex flex-wrap justify-between gap-1 text-sm"><strong>{entry.name}</strong><span>{money(entry.total)} · {pct(entry.share).replace('+', '')} · {entry.count} OC</span></div>
                <div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-slate-600" style={{ width: `${Math.max(0, Math.min(100, entry.share || 0))}%` }} /></div>
              </li>)}</ul>
              {series.supplierSpend.length > 5 && <button className="btn-secondary mt-3" onClick={() => setAllSuppliers(!allSuppliers)}>{allSuppliers ? 'Ver Top 5' : 'Ver todos'}</button>}
            </Panel>
            <Panel title="Distribución por estado" subtitle="Todas las monedas. Incluye canceladas.">
              {counts.count ? <StatusChart rows={data.statusDistribution} total={counts.count} /> : <Empty />}
            </Panel>
            <Panel title="Principales insumos" subtitle="Participación sobre el subtotal de líneas, antes de impuestos y descuentos.">
              {series.itemSpend.length ? <Table headers={['Material', 'Cantidad', 'Monto', 'Participación']}>
                {series.itemSpend.map((item) => <tr key={item.key}><td>{item.name}</td><td>{Number(item.quantity).toLocaleString('es-AR', { maximumFractionDigits: 10 })}{item.unit && ' ' + item.unit}</td><td className="whitespace-nowrap">{money(item.total)}</td><td>{pct(item.share).replace('+', '')}</td></tr>)}
              </Table> : <Empty />}
            </Panel>
            <Panel title="Valor de órdenes abiertas" subtitle="Borradores, enviadas y aprobadas pendientes de recepción.">
              {series.openValueByStatus.map(({ estado, total }) => <div key={estado} title={`${states[estado]} · ${money(total)}`} className="flex flex-wrap justify-between gap-2 border-b py-3 text-sm">
                <span>{states[estado]}</span><strong>{money(total)}</strong>
              </div>)}
            </Panel>
          </div>
          <Panel title="Resultado por mes">
            <Table headers={['Mes', 'Compras', 'Órdenes', 'Ticket promedio', 'Variación']}>
              {[...series.monthlySpend].reverse().map((row) => <tr key={row.month}><td>{monthName(row.month)}</td><td className="whitespace-nowrap">{money(row.spend)}</td><td>{row.count}</td><td className="whitespace-nowrap">{money(row.ticket)}</td><td>{pct(row.change)}</td></tr>)}
            </Table>
          </Panel>
          <Panel title="Período seleccionado vs. anterior" subtitle={`${showPeriod(data.filters.from, data.filters.to)} frente a ${showPeriod(data.filters.previousFrom, data.filters.previousTo)} · ${series.moneda}`}>
            <Table headers={['Indicador', 'Seleccionado', 'Anterior', 'Variación']}>
              {[['Gasto', 'spend', money], ['Órdenes', 'count', integer.format], ['Ticket promedio', 'ticket', money], ['Proveedores activos', 'suppliers', integer.format]].map(([label, key, format]) => {
                const change = delta(series.kpis[key], series.previous[key]);
                return <tr key={key}><td>{label}</td><td>{format(series.kpis[key])}</td><td>{format(series.previous[key])}</td>
                  <td className="whitespace-nowrap">{change > 0 ? '↑ ' : change < 0 ? '↓ ' : ''}{pct(change)}</td></tr>;
              })}
            </Table>
          </Panel>
          <Panel title="Compras más relevantes" subtitle={`Cinco órdenes de mayor importe en ${series.moneda}.`}>
            {series.topOrders.length ? <Table headers={['OC', 'Proveedor', 'Monto', 'Estado', 'Acción']}>
              {series.topOrders.map((order) => <tr key={order.id}><td>{order.numeroOrden}</td><td>{order.proveedor?.nombre || '—'}</td><td className="whitespace-nowrap">{money(order.total)}</td><td>{states[order.estado]}</td><td><button className="btn-secondary" onClick={() => onReview(order.numeroOrden)}>Revisar</button></td></tr>)}
            </Table> : <Empty />}
          </Panel>
        </>}
        <Panel title="Órdenes que requieren atención" subtitle="Prioridad: entrega vencida, monto en el cuartil superior de su moneda y borrador de 14 días o más.">
          {data.criticalOrders.length ? <Table headers={['OC', 'Proveedor', 'Centro de costo', 'Fecha', 'Fecha esperada', 'Monto', 'Estado', 'Motivo', 'Acción']}>
            {data.criticalOrders.map((order) => <tr key={order.id}><td>{order.numeroOrden}</td><td>{order.proveedor?.nombre || '—'}</td><td>{order.costCenter || '—'}</td><td>{date.format(new Date(order.fechaEmision))}</td><td>{order.fechaEntregaEsperada ? date.format(new Date(order.fechaEntregaEsperada)) : '—'}</td><td className="whitespace-nowrap">{formatMoney(order.total, order.moneda)} ({order.moneda})</td><td>{states[order.estado]}</td><td className={order.priority === 1 ? 'text-red-700' : 'text-amber-800'}>{order.reason}</td><td><button className="btn-secondary" onClick={() => onReview(order.numeroOrden)}>Revisar</button></td></tr>)}
          </Table> : <Empty>No hay órdenes que requieran atención con estos filtros.</Empty>}
        </Panel>
        <Panel title="Indicadores sin fuente" subtitle="Datos no disponibles">
          <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
            <p><strong className="block">Presupuesto</strong>Falta un presupuesto por período y centro de costo.</p>
            <p><strong className="block">OTIF</strong>Falta registrar recepciones reales fechadas y cantidades recibidas por línea.</p>
            <p><strong className="block">Ciclo de compra</strong>Falta el vínculo entre solicitud y OC con sus fechas de origen y emisión.</p>
          </div>
        </Panel>
      </>}
    </>}
  </div>;
}
