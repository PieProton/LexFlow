import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Briefcase, 
  CalendarClock, 
  CalendarDays, 
  Settings, 
  Lock, 
  ShieldCheck 
} from 'lucide-react';
import logo from '../assets/logo.png'; // Assicurati che il percorso sia corretto

export default function Sidebar({ version, onLock }) {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/pratiche', label: 'Fascicoli', icon: Briefcase },
    { path: '/scadenze', label: 'Scadenze', icon: CalendarClock },
    { path: '/agenda', label: 'Agenda', icon: CalendarDays },
  ];

  const bottomItems = [
    { path: '/settings', label: 'Impostazioni', icon: Settings },
  ];

  const NavItem = ({ item }) => {
    const isActive = location.pathname === item.path;
    return (
      <NavLink
        to={item.path}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${
          isActive 
            ? 'bg-primary/10 text-primary border border-primary/20 shadow-lg shadow-primary/5' 
            : 'text-text-muted hover:text-white hover:bg-white/5'
        }`}
      >
        <item.icon 
          size={18} 
          className={`transition-colors ${isActive ? 'text-primary' : 'text-text-dim group-hover:text-white'}`} 
        />
        <span className="font-medium text-sm">{item.label}</span>
      </NavLink>
    );
  };

  return (
    <aside className="w-64 h-screen bg-[#0c0d14] border-r border-[#22263a] flex flex-col flex-shrink-0 z-20">
      {/* Logo Area */}
      <div className="h-16 flex items-center px-6 border-b border-[#22263a]/50">
        <div className="flex items-center gap-2.5">
          {/* Se non hai il logo.png, puoi usare un'icona placeholder */}
          <div className="w-8 h-8 rounded bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold">
            LF
          </div>
          <span className="text-lg font-bold tracking-tight text-white">LexFlow</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto custom-scrollbar">
        <div className="mb-2 px-3 text-[10px] font-bold text-text-dim uppercase tracking-wider">Menu Principale</div>
        {navItems.map((item) => (
          <NavItem key={item.path} item={item} />
        ))}

        <div className="mt-8 mb-2 px-3 text-[10px] font-bold text-text-dim uppercase tracking-wider">Sistema</div>
        {bottomItems.map((item) => (
          <NavItem key={item.path} item={item} />
        ))}
      </nav>

      {/* Footer Actions */}
      <div className="p-4 border-t border-[#22263a]/50 bg-[#0c0d14]">
        {/* Tasto Blocca Vault con ICONA al posto dell'emoji */}
        <button
          onClick={onLock}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-muted hover:text-white hover:bg-red-500/10 hover:border-red-500/20 border border-transparent transition-all duration-200 group mb-4"
        >
          <Lock size={18} className="text-text-dim group-hover:text-red-400 transition-colors" />
          <span className="font-medium text-sm group-hover:text-red-100">Blocca Vault</span>
        </button>

        {/* Info Versione */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-1.5 text-[10px] text-text-dim">
            <ShieldCheck size={10} className="text-green-500" />
            <span>v{version}</span>
          </div>
          <span className="text-[10px] text-text-dim opacity-50">Secure Enclave</span>
        </div>
      </div>
    </aside>
  );
}