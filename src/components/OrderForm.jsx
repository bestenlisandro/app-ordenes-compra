import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import OrderMaterialSearch from './OrderMaterialSearch';

const optionalText = z.string().max(2000, 'Máximo 2000 caracteres.').optional();
const schema = z.object({
  proveedorId: z.coerce.number().int().positive('Seleccione un proveedor.'),
  fechaEntregaEsperada: z.string().optional(), lugarEntrega: optionalText,
  proveedorRazonSocial: z.string().min(1, 'Ingrese la razón social.'),
  proveedorTaxId: z.string().min(1, 'Ingrese la identificación fiscal.'),
  proveedorContacto: optionalText, proveedorDireccion: optionalText, proveedorDatosContacto: optionalText,
  porcentajeImpuestos: z.coerce.number().min(0).max(100), descuentos: z.coerce.number().min(0),
  moneda: z.string().min(1), condicionesPago: optionalText, metodoEnvio: optionalText,
  direccionFacturacion: optionalText, autorizadoPor: optionalText, firmaAutorizacion: optionalText,
  terminosCondiciones: optionalText, observaciones: optionalText,
  items: z.array(z.object({
    productoId: z.coerce.number().int().positive('Seleccione un producto.'),
    cantidad: z.coerce.number().positive('Debe ser mayor a cero.'),
    precioUnitario: z.coerce.number().positive('Debe ser mayor a cero.'),
  })).min(1, 'Agregue al menos un ítem.'),
});

const defaults = {
  proveedorId: '', fechaEntregaEsperada: '', lugarEntrega: '', proveedorRazonSocial: '', proveedorTaxId: '',
  proveedorContacto: '', proveedorDireccion: '', proveedorDatosContacto: '', porcentajeImpuestos: 21,
  descuentos: 0, moneda: 'ARS', condicionesPago: '', metodoEnvio: '', direccionFacturacion: 'Vera Mujica 3440, Rosario, Santa Fe',
  autorizadoPor: '', firmaAutorizacion: '', terminosCondiciones: '', observaciones: '',
  items: [{ productoId: '', cantidad: 1, precioUnitario: 0 }],
};

const Field = ({ label, error, children, wide = false }) => <div className={wide ? 'md:col-span-2' : ''}><label className="label">{label}</label>{children}{error && <p className="mt-1 text-sm text-red-600">{error.message}</p>}</div>;

export default function OrderForm({ onCancel, onCreated }) {
  const [suppliers, setSuppliers] = useState([]); const [products, setProducts] = useState([]); const [apiError, setApiError] = useState('');
  const { register, control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: defaults });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const rows = watch('items'); const selectedSupplier = Number(watch('proveedorId')); const taxRate = Number(watch('porcentajeImpuestos')) || 0; const discount = Number(watch('descuentos')) || 0; const currency = watch('moneda') || 'ARS';
  useEffect(() => { Promise.all([fetch('/api/suppliers'), fetch('/api/items')]).then(async ([s, p]) => { if (!s.ok || !p.ok) throw new Error(); setSuppliers(await s.json()); setProducts(await p.json()); }).catch(() => setApiError('No se pudieron cargar los datos necesarios para la orden.')); }, []);
  const totals = useMemo(() => { const subtotal = (rows || []).reduce((sum, row) => sum + (Number(row.cantidad) || 0) * (Number(row.precioUnitario) || 0), 0); const tax = subtotal * taxRate / 100; return { subtotal, tax, total: subtotal + tax - discount }; }, [rows, taxRate, discount]);
  const money = (value) => { try { return new Intl.NumberFormat('es-AR', { style: 'currency', currency }).format(value); } catch { return `${currency} ${Number(value).toFixed(2)}`; } };
  const selectSupplier = (id) => { const supplier = suppliers.find((item) => item.id === Number(id)); if (!supplier) return; setValue('proveedorRazonSocial', supplier.razonSocial || supplier.nombre); setValue('proveedorTaxId', supplier.taxId); setValue('proveedorContacto', supplier.contacto || ''); setValue('proveedorDireccion', [supplier.direccion, supplier.ciudad, supplier.provincia, supplier.pais].filter(Boolean).join(', ')); setValue('proveedorDatosContacto', [supplier.email, supplier.telefono].filter(Boolean).join(' · ')); };
  const pickProduct = (index, productId) => { const product = products.find((item) => item.id === Number(productId)); if (product) { const offer = product.ofertas?.find((itemOffer) => itemOffer.proveedorId === selectedSupplier); setValue(`items.${index}.precioUnitario`, Number(offer?.precioSinIva ?? product.precioUnitario), { shouldValidate: true }); if (offer?.moneda) setValue('moneda', offer.moneda); } };
  const submit = async (values) => { setApiError(''); try { const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); onCreated(payload); } catch (error) { setApiError(error.message || 'No se pudo crear la orden.'); } };

  return <form onSubmit={handleSubmit(submit)} className="space-y-6">
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-5 text-lg font-semibold">Nueva orden de compra</h2><div className="grid gap-5 md:grid-cols-2">
      <Field label="Proveedor *" error={errors.proveedorId}><select {...register('proveedorId')} onChange={(e) => { register('proveedorId').onChange(e); selectSupplier(e.target.value); }} className="field"><option value="">Seleccione un proveedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.nombre} · {supplier.taxId}</option>)}</select></Field>
      <Field label="Fecha esperada de entrega"><input type="date" {...register('fechaEntregaEsperada')} className="field" /></Field>
      <Field label="Lugar de entrega"><input {...register('lugarEntrega')} className="field" placeholder="Ciudad, planta, depósito..." /></Field>
      <Field label="Moneda de pago"><select {...register('moneda')} className="field"><option>ARS</option><option>USD</option><option>EUR</option><option>BRL</option></select></Field>
    </div></section>

    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-5 text-lg font-semibold">Datos del proveedor</h2><div className="grid gap-5 md:grid-cols-2">
      <Field label="Nombre o razón social *" error={errors.proveedorRazonSocial}><input {...register('proveedorRazonSocial')} className="field" /></Field><Field label="Identificación fiscal *" error={errors.proveedorTaxId}><input {...register('proveedorTaxId')} className="field" /></Field>
      <Field label="Persona de contacto"><input {...register('proveedorContacto')} className="field" /></Field><Field label="Datos de contacto"><input {...register('proveedorDatosContacto')} className="field" placeholder="Email y teléfono" /></Field>
      <Field label="Dirección" wide><input {...register('proveedorDireccion')} className="field" /></Field>
    </div></section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b p-5"><div><h2 className="text-lg font-semibold">Ítems de la orden</h2><p className="mt-1 text-xs text-slate-500">Seleccionás por nombre interno; la OC imprime la equivalencia del proveedor.</p></div><button type="button" onClick={() => append({ productoId: '', cantidad: 1, precioUnitario: 0 })} className="btn-secondary py-2"><Plus size={16}/> Agregar ítem</button></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Material interno / equivalencia</th><th className="p-3">Cantidad</th><th className="p-3">Precio unitario</th><th className="p-3 text-right">Subtotal</th><th /></tr></thead><tbody>{fields.map((field, index) => { const row = rows?.[index] || {}; const lineTotal = (Number(row.cantidad) || 0) * (Number(row.precioUnitario) || 0); const selectedProduct = products.find((product) => product.id === Number(row.productoId)); const equivalence = selectedProduct?.ofertas?.find((offer) => offer.proveedorId === selectedSupplier); return <tr key={field.id} className="border-t align-top"><td className="p-3"><input type="hidden" {...register(`items.${index}.productoId`)} /><OrderMaterialSearch products={products} value={row.productoId} supplierId={selectedSupplier} itemNumber={index + 1} invalid={!!errors.items?.[index]?.productoId} onSelect={(productId) => { setValue(`items.${index}.productoId`, productId, { shouldValidate: true, shouldDirty: true }); if (productId) pickProduct(index, productId); else setValue(`items.${index}.precioUnitario`, 0, { shouldDirty: true }); }} />{equivalence && <p className="mt-1.5 rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs text-orange-800"><strong>En la OC:</strong> {equivalence.codigoProveedor || selectedProduct.codigo} — {equivalence.nombreProveedor || selectedProduct.descripcion}</p>}{errors.items?.[index]?.productoId && <p className="mt-1 text-xs text-red-600">{errors.items[index].productoId.message}</p>}</td><td className="p-3"><input type="number" min="0.01" step="0.01" {...register(`items.${index}.cantidad`)} className="field" /></td><td className="p-3"><input type="number" min="0.01" step="0.01" {...register(`items.${index}.precioUnitario`)} className="field" /></td><td className="p-3 pt-5 text-right font-medium">{money(lineTotal)}</td><td className="p-3"><button type="button" aria-label="Eliminar ítem" disabled={fields.length === 1} onClick={() => remove(index)} className="rounded-md p-2 text-red-600 disabled:opacity-30"><Trash2 size={18}/></button></td></tr>; })}</tbody></table></div>
      <div className="ml-auto grid w-full max-w-md gap-3 border-t p-5 text-sm"><label className="flex items-center justify-between gap-3"><span>Impuestos / IVA (%)</span><input type="number" min="0" max="100" step="0.01" {...register('porcentajeImpuestos')} className="field w-32" /></label><label className="flex items-center justify-between gap-3"><span>Descuento ({currency})</span><input type="number" min="0" step="0.01" {...register('descuentos')} className="field w-32" /></label><div className="flex justify-between"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div><div className="flex justify-between"><span>Impuestos ({taxRate}%)</span><span>{money(totals.tax)}</span></div><div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span>{money(totals.total)}</span></div></div>
    </section>

    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-5 text-lg font-semibold">Condiciones financieras, logísticas y legales</h2><div className="grid gap-5 md:grid-cols-2">
      <Field label="Condiciones de pago"><input {...register('condicionesPago')} className="field" placeholder="Contado, neto a 30 días..." /></Field><Field label="Método de envío y transporte"><input {...register('metodoEnvio')} className="field" placeholder="Transportista, modalidad o Incoterm" /></Field>
      <Field label="Dirección de facturación" wide><input {...register('direccionFacturacion')} className="field" /></Field><Field label="Persona que autoriza"><input {...register('autorizadoPor')} className="field" /></Field><Field label="Firma / autorización"><input {...register('firmaAutorizacion')} className="field" placeholder="Firma digital, referencia o dejar para firma manuscrita" /></Field>
      <Field label="Notas adicionales" wide><textarea {...register('observaciones')} rows="3" className="field" placeholder="Instrucciones especiales de embalaje u otras notas..." /></Field><Field label="Términos y condiciones" wide><textarea {...register('terminosCondiciones')} rows="4" className="field" placeholder="Políticas de devolución, penalizaciones por demora..." /></Field>
    </div></section>
    {apiError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{apiError}</p>}<footer className="flex justify-end gap-3"><button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button><button type="submit" disabled={isSubmitting} className="btn-primary">{isSubmitting ? 'Creando...' : 'Crear orden'}</button></footer>
  </form>;
}
