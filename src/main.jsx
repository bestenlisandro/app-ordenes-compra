import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, Boxes, Building2, ClipboardList, List, LogOut, Menu, PackageSearch, Plus, ShieldCheck, X } from 'lucide-react';
import './styles.css';
import Catalog from './components/Catalog';
import OrderList from './components/OrderList';
import OrderForm from './components/OrderForm';
import RequesterForm from './components/RequesterForm';
import RequesterRequests from './components/RequesterRequests';
import Suppliers from './components/Suppliers';
import Stock from './components/Stock';
import Materials from './components/Materials';
import Dashboard from './components/Dashboard';
import AccessManagement from './components/AccessManagement';

const navigation = [['catalog', 'Catálogo', PackageSearch, 'catalog:read'], ['list', 'Órdenes', List, 'orders:read'], ['suppliers', 'Proveedores', Building2, 'suppliers:manage'], ['materials', 'Materiales', Boxes, 'items:manage'], ['stock', 'Stock', ClipboardList, 'stock:manage'], ['dashboard', 'Reportes', BarChart3, 'reports:read'], ['access', 'Usuarios', ShieldCheck, 'users:manage'], ['delegation', 'Delegar', ShieldCheck, 'delegations:create']];

function Login({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' }); const [error, setError] = useState('');
  const submit = async (event) => { event.preventDefault(); const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); const data = await response.json(); if (!response.ok) return setError(data.error); localStorage.setItem('compras_token', data.token); onLogin(data.user); };
  return <main className="login-page"><form className="login-card" onSubmit={submit}><span className="brand-mark"><img src="/besten-logo.png" alt="Besten"/></span><h1>Bienvenido a Compras</h1><p>Ingrese con su cuenta corporativa para continuar.</p>{error && <div className="login-error">{error}</div>}<label className="label">Usuario<input autoFocus className="field mt-1" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })}/></label><label className="label">Contraseña<input type="password" className="field mt-1" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })}/></label><button className="btn-primary">Ingresar</button></form></main>;
}

function Workspace({ user, onLogout }) {
  const isRequester = user.role === 'REQUESTER';
  const allowed = navigation.filter((item) => user.permissions.includes(item[3])).map((item) => isRequester && item[0] === 'list' ? [item[0], 'Mis solicitudes', item[2], item[3]] : item);
  const initialView = isRequester ? 'list' : allowed.some(([id]) => id === 'list') ? 'list' : allowed[0]?.[0] || 'access';
  const [view, setView] = useState(initialView); const [refreshKey, setRefreshKey] = useState(0); const [menuOpen, setMenuOpen] = useState(false);
  const navigate = (next) => { setView(next); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const created = () => { setRefreshKey((key) => key + 1); navigate('list'); };
  const content = {
    catalog: <Catalog user={user} onCreateOrder={() => navigate('new')}/>,
    list: isRequester ? <RequesterRequests key={refreshKey}/> : <OrderList user={user} key={refreshKey}/>,
    new: isRequester ? <RequesterForm user={user} onCancel={() => navigate('list')} onCreated={created}/> : <OrderForm onCancel={() => navigate('list')} onCreated={created}/>,
    suppliers: <Suppliers/>, materials: <Materials/>, stock: <Stock/>, dashboard: <Dashboard/>, access: <AccessManagement user={user}/>, delegation: <AccessManagement user={user}/>,
  }[view];
  return <div className="app-shell"><header className="topbar"><div className="topbar-inner"><button className="brand" onClick={() => navigate(initialView)}><span className="brand-mark"><img src="/besten-logo.png" alt=""/></span><span><strong>Besten Compras</strong><small>Gestión segura</small></span></button><nav className="desktop-nav">{allowed.slice(0, 3).map(([id, label]) => <button key={id} onClick={() => navigate(id)} className={view === id ? 'active' : ''}>{label}</button>)}</nav><div className="topbar-actions">{user.permissions.includes('orders:create') && <button onClick={() => navigate('new')} className="btn-primary"><Plus size={17}/> {isRequester ? 'Nueva solicitud' : 'Nueva orden'}</button>}<button className="user-chip" onClick={onLogout}><span><strong>{user.nombre}</strong><small>{user.role}</small></span><LogOut size={16}/></button><button className="menu-button" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X/> : <Menu/>}</button></div></div></header><div className="layout"><aside className={`sidebar ${menuOpen ? 'open' : ''}`}><p className="sidebar-label">Espacio de trabajo</p><nav>{allowed.map(([id, label, Icon]) => <button key={id} onClick={() => navigate(id)} className={view === id ? 'active' : ''}><Icon size={18}/><span>{label}</span></button>)}</nav></aside><main className="main-content">{content}</main></div></div>;
}

function App() {
  const [user, setUser] = useState(null); const [checking, setChecking] = useState(true);
  useEffect(() => {
    const original = window.fetch.bind(window);
    window.fetch = (url, options = {}) => { const token = localStorage.getItem('compras_token'); return original(url, { ...options, headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } }); };
    if (!localStorage.getItem('compras_token')) return setChecking(false);
    window.fetch('/api/auth/me').then((response) => response.ok ? response.json() : Promise.reject()).then((data) => setUser(data.user)).catch(() => localStorage.removeItem('compras_token')).finally(() => setChecking(false));
  }, []);
  if (checking) return <div className="login-page">Verificando sesión…</div>;
  return user ? <Workspace user={user} onLogout={() => { localStorage.removeItem('compras_token'); setUser(null); }}/> : <Login onLogin={setUser}/>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
