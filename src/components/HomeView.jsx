import { useEffect, useState } from 'react';
import { ArrowRight, Boxes, Building2, CheckCircle2, ClipboardList, PackageSearch, Sparkles, TrendingUp } from 'lucide-react';

export default function HomeView({ onNavigate }) {
  const [data, setData] = useState({ items: [], suppliers: [], orders: [] });
  const [loading, setLoading] = useState(true);
  useEffect(() => { Promise.all([fetch('/api/items'), fetch('/api/suppliers'), fetch('/api/orders')]).then(async ([i,s,o]) => setData({ items: await i.json(), suppliers: await s.json(), orders: await o.json() })).finally(() => setLoading(false)); }, []);
  const lowStock = data.items.filter((item) => Number(item.stockActual) <= Number(item.stockMinimo || item.puntoPedido));
  const active = data.orders.filter((order) => !['RECIBIDA', 'CANCELADA'].includes(order.estado));
  return <div className="page-stack">
    <section className="hero-panel">
      <div className="hero-copy"><span className="eyebrow"><Sparkles size={15}/> Compras simples, decisiones mejores</span><h1>Todo lo que necesitás para comprar con confianza.</h1><p>Centralizá materiales, proveedores, stock y órdenes de compra en una experiencia clara, rápida y profesional.</p><div className="hero-actions"><button className="btn-accent" onClick={() => onNavigate('catalog')}><PackageSearch size={18}/> Explorar catálogo</button><button className="btn-ghost-light" onClick={() => onNavigate('new')}>Crear orden <ArrowRight size={17}/></button></div></div>
      <div className="hero-visual" aria-hidden="true"><div className="visual-card main"><span>Resumen de compras</span><strong>{active.length} órdenes activas</strong><div className="progress"><i style={{width: `${Math.min(90, active.length * 12 + 25)}%`}}/></div></div><div className="visual-card floating"><CheckCircle2/><span>Control centralizado</span></div></div>
    </section>
    <section className="section-heading"><div><span className="eyebrow dark">Vista general</span><h2>Tu operación, de un vistazo</h2></div><button className="text-link" onClick={() => onNavigate('dashboard')}>Ver reportes <ArrowRight size={16}/></button></section>
    <div className="metric-grid">
      {[['Materiales', data.items.length, Boxes, 'Catálogo disponible', 'catalog'], ['Proveedores', data.suppliers.length, Building2, 'Red de abastecimiento', 'suppliers'], ['Órdenes activas', active.length, ClipboardList, 'En proceso', 'list'], ['Stock crítico', lowStock.length, TrendingUp, lowStock.length ? 'Requiere atención' : 'Todo en orden', 'stock']].map(([label,value,Icon,hint,target]) => <button className="metric-card" key={label} onClick={() => onNavigate(target)}><span className="metric-icon"><Icon/></span><span className="metric-copy"><small>{label}</small><strong>{loading ? '—' : value}</strong><em>{hint}</em></span><ArrowRight className="metric-arrow" size={18}/></button>)}
    </div>
    <section className="quick-panel"><div><span className="eyebrow dark">Flujo recomendado</span><h2>De la necesidad a la orden, sin fricción</h2><p>Buscá el material, compará las ofertas disponibles y emití una orden lista para enviar en PDF.</p></div><div className="steps">{[['01','Explorá','Filtrá el catálogo por categoría o stock.'],['02','Compará','Revisá precios y proveedores disponibles.'],['03','Ordená','Creá y exportá la OC en pocos pasos.']].map(([n,t,d]) => <article key={n}><span>{n}</span><div><strong>{t}</strong><p>{d}</p></div></article>)}</div></section>
  </div>;
}
