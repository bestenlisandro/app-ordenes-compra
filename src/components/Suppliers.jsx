import { useEffect, useState } from 'react';
import { Building2, Contact, Download, FileText, Plus, Star, Trash2, WalletCards } from 'lucide-react';

const empty = { razonSocial:'', nombre:'', taxId:'', condicionIva:'', direccion:'', numero:'', piso:'', ciudad:'', provincia:'', codigoPostal:'', pais:'Argentina', contacto:'', telefono:'', email:'', sitioWeb:'', horarioAtencion:'', condicionPago:'', moneda:'ARS', listaPrecios:'', descuentoVolumen:'', costoEnvio:'', tiempoEntrega:'', calificacion:'', notasInternas:'', categoriaProductos:'', archivos:[] };
const Field = ({ name, label, form, change, type='text', required=false, children, ...props }) => <label className="label">{label}{required && ' *'}{children || <input {...props} type={type} required={required} name={name} value={form[name]} onChange={change} className="field mt-1"/>}</label>;
const Section = ({ icon:Icon, title, subtitle, children }) => <section className="supplier-form-section"><header><Icon size={18}/><div><h3>{title}</h3><p>{subtitle}</p></div></header><div className="supplier-form-grid">{children}</div></section>;

export default function Suppliers() {
  const [suppliers,setSuppliers]=useState([]), [form,setForm]=useState(empty), [editing,setEditing]=useState(null), [message,setMessage]=useState('');
  const load=()=>fetch('/api/suppliers').then(r=>r.json()).then(setSuppliers);
  useEffect(()=>{load();},[]);
  const change=e=>setForm(current=>({...current,[e.target.name]:e.target.value}));
  const addFiles=async e=>{
    const files=[...e.target.files];
    if(form.archivos.length+files.length>5 || files.some(file=>file.size>3*1024*1024)){setMessage('Puede adjuntar hasta 5 archivos de 3 MB cada uno.');e.target.value='';return;}
    const additions=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({nombre:file.name,tipo:file.type||'application/octet-stream',datos:reader.result});reader.onerror=reject;reader.readAsDataURL(file);})));
    setForm(current=>({...current,archivos:[...current.archivos,...additions]}));e.target.value='';
  };
  const submit=async e=>{e.preventDefault();setMessage('');const response=await fetch(editing?`/api/suppliers/${editing}`:'/api/suppliers',{method:editing?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});const data=await response.json().catch(()=>({}));if(!response.ok)return setMessage(data.error||'No se pudo guardar.');setForm(empty);setEditing(null);setMessage('Proveedor guardado correctamente.');load();};
  const edit=supplier=>{setEditing(supplier.id);setForm(Object.fromEntries(Object.keys(empty).map(key=>[key,supplier[key]??empty[key]])));window.scrollTo({top:0,behavior:'smooth'});};
  const remove=async id=>{if(!window.confirm('¿Eliminar este proveedor?'))return;const response=await fetch(`/api/suppliers/${id}`,{method:'DELETE'});if(!response.ok)return setMessage((await response.json()).error);load();};

  return <div className="grid gap-6">
    <form onSubmit={submit} className="supplier-form">
      <div className="form-heading"><div><Building2/><div><h2>{editing?'Editar proveedor':'Nuevo proveedor'}</h2><p>Información legal, operativa y comercial</p></div></div></div>
      <Section icon={Building2} title="1. Datos de identificación" subtitle="Información legal y fiscal para pedidos y facturación">
        <Field name="razonSocial" label="Razón social" form={form} change={change} required/><Field name="nombre" label="Nombre comercial" form={form} change={change} required/><Field name="taxId" label="CUIT" form={form} change={change} required placeholder="30-12345678-9"/>
        <Field label="Condición frente al IVA"><select name="condicionIva" value={form.condicionIva} onChange={change} className="field mt-1"><option value="">Seleccionar…</option>{['Responsable Inscripto','Monotributista','Exento','Consumidor Final','No Responsable'].map(v=><option key={v}>{v}</option>)}</select></Field>
        <Field name="direccion" label="Calle" form={form} change={change}/><Field name="numero" label="Número" form={form} change={change}/><Field name="piso" label="Piso / departamento" form={form} change={change}/><Field name="ciudad" label="Ciudad" form={form} change={change}/><Field name="provincia" label="Provincia" form={form} change={change}/><Field name="codigoPostal" label="Código postal" form={form} change={change}/><Field name="pais" label="País" form={form} change={change}/>
      </Section>
      <Section icon={Contact} title="2. Datos de contacto" subtitle="Canales para pedidos, cotizaciones y reclamos">
        <Field name="contacto" label="Persona de contacto principal" form={form} change={change}/><Field name="telefono" label="Teléfono" form={form} change={change} type="tel"/><Field name="email" label="Email" form={form} change={change} type="email"/><Field name="sitioWeb" label="Sitio web" form={form} change={change} type="url" placeholder="https://…"/><Field name="horarioAtencion" label="Horario de atención" form={form} change={change} placeholder="Lun. a vie. de 9 a 18 h"/>
      </Section>
      <Section icon={WalletCards} title="3. Datos comerciales y financieros" subtitle="Condiciones que inciden en costos y abastecimiento">
        <Field name="condicionPago" label="Condición de pago" form={form} change={change} placeholder="Contado, 30 días…"/><Field label="Moneda de trabajo"><select name="moneda" value={form.moneda} onChange={change} className="field mt-1">{['ARS','USD','EUR','BRL','MXN','COP'].map(v=><option key={v}>{v}</option>)}</select></Field><Field name="listaPrecios" label="Lista de precios" form={form} change={change}/><Field name="descuentoVolumen" label="Descuento por volumen" form={form} change={change} placeholder="5% desde 100 unidades"/><Field name="costoEnvio" label="Costo / condición de envío" form={form} change={change}/><Field name="tiempoEntrega" label="Plazo de entrega (días)" form={form} change={change} type="number" min="0"/>
      </Section>
      <Section icon={Star} title="4. Datos avanzados" subtitle="Evaluación, clasificación y documentación interna">
        <Field label="Calificación"><select name="calificacion" value={form.calificacion} onChange={change} className="field mt-1"><option value="">Sin calificar</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{'★'.repeat(n)} ({n}/5)</option>)}</select></Field><Field name="categoriaProductos" label="Categoría de productos" form={form} change={change}/>
        <label className="label supplier-wide">Notas internas<textarea name="notasInternas" value={form.notasInternas} onChange={change} rows="3" className="field mt-1"/></label>
        <label className="label supplier-wide">Adjuntar archivos <span className="font-normal text-slate-400">(máx. 5, 3 MB c/u)</span><input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*" onChange={addFiles} className="field mt-1"/></label>
        {form.archivos.length>0&&<div className="supplier-files supplier-wide">{form.archivos.map((archivo,index)=><div key={`${archivo.nombre}-${index}`}><FileText size={15}/><span>{archivo.nombre}</span><button type="button" onClick={()=>setForm(current=>({...current,archivos:current.archivos.filter((_,i)=>i!==index)}))}><Trash2 size={14}/></button></div>)}</div>}
      </Section>
      <div className="form-actions"><button className="btn-primary"><Plus size={16}/>{editing?'Guardar cambios':'Agregar proveedor'}</button>{editing&&<button type="button" onClick={()=>{setEditing(null);setForm(empty);}} className="btn-secondary">Cancelar</button>}</div>{message&&<p className="mx-6 mb-5 text-sm text-blue-700">{message}</p>}
    </form>
    <section className="suppliers-list"><div className="list-heading"><div><h2>Proveedores registrados</h2><p>{suppliers.length} proveedor{suppliers.length===1?'':'es'}</p></div></div><div className="divide-y divide-slate-100">{suppliers.map(s=><article key={s.id} className="supplier-card">
      <div><p className="font-semibold text-slate-900">{s.nombre}</p><p className="text-slate-500">{s.razonSocial||'Sin razón social'}</p><p className="mt-1">CUIT: {s.taxId}</p></div><div><p className="font-medium text-slate-700">Contacto</p><p>{s.contacto||'—'}</p><p className="text-slate-500">{s.email||s.telefono||'Sin datos'}</p></div><div><p className="font-medium text-slate-700">Condiciones</p><p>{s.condicionPago||'Sin condición de pago'} · {s.moneda||'ARS'}</p><p className="text-slate-500">{s.tiempoEntrega==null?'Sin plazo informado':`${s.tiempoEntrega} días`}{s.calificacion?` · ${'★'.repeat(s.calificacion)}`:''}</p></div><div className="supplier-card-actions"><button onClick={()=>edit(s)}>Editar</button><button onClick={()=>remove(s.id)} className="text-red-600"><Trash2 size={17}/></button></div>
      {(s.categoriaProductos||s.notasInternas||s.archivos?.length>0)&&<div className="supplier-card-extra"><span>{s.categoriaProductos||'Sin categoría'}</span>{s.notasInternas&&<p>{s.notasInternas}</p>}{s.archivos?.map((a,i)=><a key={`${a.nombre}-${i}`} href={a.datos} download={a.nombre}><Download size={13}/>{a.nombre}</a>)}</div>}
    </article>)}</div>{suppliers.length===0&&<p className="p-8 text-center text-sm text-slate-400">Todavía no hay proveedores registrados.</p>}</section>
  </div>;
}
