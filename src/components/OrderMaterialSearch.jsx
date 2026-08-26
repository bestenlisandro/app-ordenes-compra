import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { filterMaterials } from '../utils/materialSearch.mjs';

export default function OrderMaterialSearch({ products, value, onSelect, supplierId, itemNumber, invalid }) {
  const id = useId();
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const selected = products.find((product) => product.id === Number(value));
  // A selected label is not a search query: reopening must still show the catalog.
  const searchQuery = editing ? query : '';
  const matches = useMemo(() => filterMaterials(products, searchQuery), [products, searchQuery]);
  const active = matches[activeIndex];
  const displayValue = !editing && selected ? `${selected.codigo} — ${selected.descripcion}` : query;

  useEffect(() => {
    if (open && activeIndex >= 0) {
      listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, open]);

  const choose = (product) => {
    onSelect(product.id);
    setQuery('');
    setEditing(false);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };
  const clear = () => {
    onSelect('');
    setQuery('');
    setEditing(true);
    setActiveIndex(-1);
    inputRef.current?.focus();
    setOpen(true);
  };
  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        if (!matches.length) return -1;
        if (!open || current < 0) return event.key === 'ArrowDown' ? 0 : matches.length - 1;
        return (current + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      });
    } else if (event.key === 'Enter') {
      // Searching must never submit the purchase order implicitly.
      event.preventDefault();
      if (open && active) choose(active);
      else if (open && matches.length === 1) choose(matches[0]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return <div className="order-material-picker" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false);
      setActiveIndex(-1);
    }
  }}>
    <div className="materials-search-control">
      <Search size={17} aria-hidden="true" />
      <input ref={inputRef} role="combobox" aria-label={`Buscar material, ítem ${itemNumber}`}
        aria-autocomplete="list" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open && active ? `${id}-option-${active.id}` : undefined}
        aria-describedby={`${id}-help`} aria-invalid={invalid || undefined}
        value={displayValue} autoComplete="off" placeholder="Código, descripción, marca o proveedor…"
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={handleKeyDown}
        onChange={(event) => {
          setQuery(event.target.value);
          setEditing(true);
          setOpen(true);
          setActiveIndex(-1);
          if (value) onSelect('');
        }} />
      {displayValue && <button type="button" aria-label={`Limpiar material, ítem ${itemNumber}`}
        onMouseDown={(event) => event.preventDefault()} onClick={clear}>Limpiar</button>}
    </div>
    <p id={`${id}-help`} className="order-material-help">Combiná palabras, igual que en Materiales. Elegí una coincidencia.</p>
    {open && <div className="order-material-results">
      <p role="status">{matches.length} de {products.length} materiales</p>
      <div ref={listRef} id={`${id}-list`} role="listbox" aria-label={`Materiales para el ítem ${itemNumber}`} className="order-material-options">
        {matches.map((product, index) => {
          const offer = product.ofertas?.find((item) => item.proveedorId === supplierId);
          return <button type="button" role="option" tabIndex={-1}
            id={`${id}-option-${product.id}`} key={product.id}
            aria-selected={product.id === Number(value)} data-active={index === activeIndex}
            onMouseDown={(event) => event.preventDefault()} onClick={() => choose(product)}>
            <span><strong>{product.codigo}</strong> — {product.descripcion}
              <small>{[product.marca, product.categoria].filter(Boolean).join(' · ')}</small>
              {offer ? <small>Proveedor: {offer.codigoProveedor || product.codigo} — {offer.nombreProveedor || product.descripcion}</small>
                : !!supplierId && <small>Sin equivalencia para este proveedor; se usa el material interno.</small>}
            </span>
            {product.id === Number(value) && <Check size={16} aria-hidden="true" />}
          </button>;
        })}
      </div>
      {!matches.length && <p>{products.length ? 'No hay materiales que coincidan. Probá con otras palabras o limpiá la búsqueda.' : 'No hay materiales disponibles.'}</p>}
    </div>}
  </div>;
}
