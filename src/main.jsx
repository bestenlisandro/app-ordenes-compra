import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ClipboardList, Plus, Building2, Package, BarChart3, List } from 'lucide-react';
import './styles.css';
import OrderList from './components/OrderList';
import OrderForm from './components/OrderForm';
import Suppliers from './components/Suppliers';
import Stock from './components/Stock';
import Dashboard from './components/Dashboard';

function App() {
  const [view, setView] = useState('list');
  const [refreshKey, setRefreshKey] = useState(0);
  const created = () => { setRefreshKey((key) => key + 1); setView('list'); };
  return <main className="min-h-screen p-4 sm:p-8">
    <div className="mx-auto max-w-7xl">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-blue-600 p-3 text-white"><ClipboardList /></span><div><h1 className="text-2xl font-bold text-slate-900">Órdenes de Compra</h1><p className="text-sm text-slate-500">Gestión de proveedores, productos y órdenes</p></div></div>
        {view === 'list' && <button onClick={() => setView('new')} className="btn-primary"><Plus size={18} /> Nueva orden</button>}
      </header>
      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Módulos principales">
        {[['list', 'Órdenes', List], ['suppliers', 'Proveedores', Building2], ['stock', 'Stock', Package], ['dashboard', 'Reportes', BarChart3]].map(([id, label, Icon]) => <button key={id} onClick={() => setView(id)} className={view === id ? 'btn-primary py-2' : 'btn-secondary py-2'}><Icon size={16}/>{label}</button>)}
      </nav>
      {view === 'list' && <OrderList key={refreshKey} />}
      {view === 'new' && <OrderForm onCancel={() => setView('list')} onCreated={created} />}
      {view === 'suppliers' && <Suppliers />}
      {view === 'stock' && <Stock />}
      {view === 'dashboard' && <Dashboard />}
    </div>
  </main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
