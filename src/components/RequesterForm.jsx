import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

const blankItem = (user) => ({ tipo: user.canUseCatalogItem !== false ? 'CATALOGO' : 'LIBRE', productoId: '', descripcionLibre: '', codigoLibre: '', cantidad: 1, unidad: 'u.' });

export default function RequesterForm({ user, onCancel, onCreated }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ fechaEntregaEsperada: '', lugarEntrega: '', observaciones: '', items: [blankItem(user)] });
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (user.canUseCatalogItem !== false) fetch('/api/items').then((response) => response.ok ? response.json() : []).then(setItems).catch(() => setError('No se pudo cargar el catálogo.'));
  }, [user]);

  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const updateItem = (index, name, value) => setForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [name]: value } : item) }));
  const changeType = (index, tipo) => setForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...blankItem(user), cantidad: item.cantidad, unidad: item.unidad, tipo } : item) }));
  const addItem = () => setForm((current) => ({ ...current, items: [...current.items, blankItem(user)] }));
  const removeItem = (index) => setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));

  const submit = async (event) => {
    event.preventDefault(); setError(''); setSending(true);
    try {
      const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo enviar la solicitud.');
      onCreated(body);
    } catch (submitError) { setError(submitError.message); } finally { setSending(false); }
  };

  const hasItemMode = user.canUseCatalogItem !== false || user.canUseFreeItem !== false;
  return <form className="request-form page-stack" onSubmit={submit}>
    <header className="module-header"><div><span className="eyebrow dark">Solicitud de compra</span><h1>¿Qué necesitás?</h1><p>Describí el material o servicio. Compras se ocupará de precios y condiciones.</p></div></header>
    {error && <p className="notice notice-error" role="alert">{error}</p>}
    {!hasItemMode && <p className="notice notice-error">Su usuario no tiene habilitada ninguna modalidad de ítem. Contacte a un administrador.</p>}
    <section className="request-card"><div className="request-grid">
      <label className="label">Centro de costo<input className="field mt-1" value={user.costCenter || 'Sin asignar'} readOnly /></label>
      <label className="label">Fecha requerida<input type="date" className="field mt-1" value={form.fechaEntregaEsperada} onChange={(event) => update('fechaEntregaEsperada', event.target.value)} /></label>
      <label className="label request-wide">Lugar de entrega<input className="field mt-1" value={form.lugarEntrega} onChange={(event) => update('lugarEntrega', event.target.value)} placeholder="Planta, depósito o sector" /></label>
    </div></section>
    <section className="request-card"><header className="request-section-heading"><div><h2>Productos o servicios</h2><p>No es necesario indicar precios.</p></div><button type="button" className="btn-secondary" onClick={addItem} disabled={!hasItemMode}><Plus size={16}/> Agregar ítem</button></header>
      <div className="request-items">{form.items.map((item, index) => <article className="request-item" key={index}>
        <div className="request-item-top"><strong>Ítem {index + 1}</strong><button type="button" aria-label={`Quitar ítem ${index + 1}`} onClick={() => removeItem(index)} disabled={form.items.length === 1}><Trash2 size={17}/></button></div>
        {user.canUseCatalogItem !== false && user.canUseFreeItem !== false && <div className="request-type"><button type="button" className={item.tipo === 'CATALOGO' ? 'active' : ''} onClick={() => changeType(index, 'CATALOGO')}>Catálogo</button><button type="button" className={item.tipo === 'LIBRE' ? 'active' : ''} onClick={() => changeType(index, 'LIBRE')}>Ítem libre</button></div>}
        <div className="request-grid">{item.tipo === 'CATALOGO' ? <label className="label request-wide">Material<select required className="field mt-1" value={item.productoId} onChange={(event) => { const product = items.find((candidate) => candidate.id === Number(event.target.value)); updateItem(index, 'productoId', event.target.value); if (product?.unidadMedida) updateItem(index, 'unidad', product.unidadMedida); }}><option value="">Seleccionar material</option>{items.map((product) => <option key={product.id} value={product.id}>{product.codigo} · {product.descripcion}</option>)}</select></label> : <><label className="label">Código (opcional)<input className="field mt-1" value={item.codigoLibre} onChange={(event) => updateItem(index, 'codigoLibre', event.target.value)} /></label><label className="label">Descripción<input required className="field mt-1" value={item.descripcionLibre} onChange={(event) => updateItem(index, 'descripcionLibre', event.target.value)} placeholder="Producto o servicio solicitado" /></label></>}
          <label className="label">Cantidad<input required type="number" min="0.01" step="0.01" className="field mt-1" value={item.cantidad} onChange={(event) => updateItem(index, 'cantidad', event.target.value)} /></label>
          <label className="label">Unidad<input required className="field mt-1" value={item.unidad} onChange={(event) => updateItem(index, 'unidad', event.target.value)} placeholder="u., kg, hora…" /></label>
        </div>
      </article>)}</div>
    </section>
    <section className="request-card"><label className="label">Observaciones<textarea className="field mt-1" rows="4" value={form.observaciones} onChange={(event) => update('observaciones', event.target.value)} placeholder="Especificaciones, uso previsto o información adicional" /></label></section>
    <div className="form-actions request-actions"><button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button><button className="btn-primary" disabled={sending || !hasItemMode}>{sending ? 'Enviando…' : 'Enviar solicitud'}</button></div>
  </form>;
}
