import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';

export default function MaterialPhoto({ value, onChange, onBusyChange }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);

  const select = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Seleccioná una imagen JPG, PNG o WebP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('La imagen supera los 10 MB. Elegí una más pequeña.');
      return;
    }
    const current = ++request.current;
    setBusy(true);
    onBusyChange(true);
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const scale = Math.min(1, 800 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (current === request.current) onChange(canvas.toDataURL('image/jpeg', 0.85));
    } catch {
      if (current === request.current) setError('No se pudo leer la imagen. Probá con otra foto.');
    } finally {
      URL.revokeObjectURL(url);
      if (current === request.current) { setBusy(false); onBusyChange(false); }
    }
  };

  return <div className="material-photo-editor">
    <div className="material-photo-preview">
      {value ? <img src={value} alt="Vista previa de la foto del material"/> : <><ImagePlus size={30}/><span>Sin foto</span></>}
    </div>
    <div className="material-photo-controls">
      <label className="label" htmlFor="material-photo">Foto del material (opcional)</label>
      <input id="material-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={select} disabled={busy} aria-describedby="material-photo-help"/>
      <p id="material-photo-help">JPG, PNG o WebP, hasta 10 MB. La foto se optimiza al cargarla.</p>
      {busy && <p role="status">Preparando foto…</p>}
      {error && <p className="material-photo-error" role="alert">{error}</p>}
      {value && <button type="button" className="btn-secondary" disabled={busy} onClick={() => { onChange(''); setError(''); }}><Trash2 size={15}/> Quitar foto</button>}
    </div>
  </div>;
}
