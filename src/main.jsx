import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, Boxes, Building2, ClipboardList, Home, List, Menu, PackageSearch, Plus, X } from 'lucide-react';
import './styles.css';
import HomeView from './components/HomeView';
import Catalog from './components/Catalog';
import OrderList from './components/OrderList';
import OrderForm from './components/OrderForm';
import Suppliers from './components/Suppliers';
import Stock from './components/Stock';
import Materials from './components/Materials';
import Dashboard from './components/Dashboard';

const navigation = [
  ['home', 'Inicio', Home], ['catalog', 'Catálogo', PackageSearch], ['list', 'Órdenes', List],
  ['suppliers', 'Proveedores', Building2], ['materials', 'Materiales', Boxes], ['stock', 'Stock', ClipboardList], ['dashboard', 'Reportes', BarChart3],
];

function App() {
  const [view, setView] = useState('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = (next) => { setView(next); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const created = () => { setRefreshKey((key) => key + 1); navigate('list'); };
  const content = {
    home: <HomeView onNavigate={navigate} />,
    catalog: <Catalog onCreateOrder={() => navigate('new')} />,
    list: <OrderList key={refreshKey} />,
    new: <OrderForm onCancel={() => navigate('list')} onCreated={created} />,
    suppliers: <Suppliers />, materials: <Materials />, stock: <Stock />, dashboard: <Dashboard />,
  }[view];

  return <div className="app-shell">
    <header className="topbar">
      <div className="topbar-inner">
        <button className="brand" onClick={() => navigate('home')} aria-label="Ir al inicio">
          <span className="brand-mark"><img src="/besten-logo.png" alt="" /></span>
          <span><strong>Besten Compras</strong><small>Gestión inteligente</small></span>
        </button>
        <nav className="desktop-nav" aria-label="Navegación principal">
          {navigation.slice(0, 3).map(([id, label]) => <button key={id} onClick={() => navigate(id)} className={view === id ? 'active' : ''}>{label}</button>)}
        </nav>
        <div className="topbar-actions">
          <button onClick={() => navigate('new')} className="btn-primary"><Plus size={17}/> Nueva orden</button>
          <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menú" aria-expanded={menuOpen}>{menuOpen ? <X/> : <Menu/>}</button>
        </div>
      </div>
    </header>
    <div className="layout">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <p className="sidebar-label">Espacio de trabajo</p>
        <nav aria-label="Módulos de gestión">{navigation.map(([id, label, Icon]) => <button key={id} onClick={() => navigate(id)} className={view === id ? 'active' : ''}><Icon size={18}/><span>{label}</span></button>)}</nav>
        <div className="sidebar-help"><PackageSearch size={20}/><strong>Compra con claridad</strong><p>Compará proveedores, costos y stock desde un solo lugar.</p></div>
      </aside>
      <main className="main-content">{content}</main>
    </div>
  </div>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
