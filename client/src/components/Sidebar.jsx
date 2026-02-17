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
import logo from '../assets/logo.png';

export default function Sidebar({ version, onLock }) {
  const location = useLocation();

  // Elementi della navigazione principale (esclusa Dashboard per posizionamento separato)
  const navItems = [
    { path: '/pratiche', label: 'Fascicoli', icon: Briefcase },
    { path: '/scadenze', label: 'Scadenze', icon: CalendarClock },
    { path: '/agenda', label: 'Agenda', icon: CalendarDays },
  ];

  const systemItems = [
    { path: '/settings', label: 'Impostazioni', icon: Settings },
  ];

  // Sottocomponente per i singoli item della navigazione
  const NavItem = ({ item }) => {
    const isActive = location.pathname === item.path;
    
    return (
      <NavLink
        to={item.path}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group relative ${
          isActive 
            ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]' 
            : 'text-text-dim hover:text-white hover:bg-white/5'
        }`}
      >
        {/* Indicatore laterale per l'elemento attivo */}
        {isActive && (
          <div className="absolute left-0 top-3 bottom-3 w-1 bg-white rounded-r-full shadow-[0_0_8px_white]" />
        )}
        
        <item.icon 
          size={20} 
          className={`transition-all duration-300 ${
            isActive ? 'text-white' : 'group-hover:text-primary group-hover:scale-110'
          }`} 
        />
        <span className={`text-sm tracking-wide ${isActive ? 'font-bold' : 'font-medium'}`}>
          {item.label}
        </span>
      </NavLink>
    );
  };

  return (
    <aside className="w-68 h-screen bg-[#08090f] border-r border-white/5 flex flex-col flex-shrink-0 z-20 pt-14 relative">
      
      {/* Glow effect di sfondo (opzionale, molto sottile) */}
      <div className="absolute top-0 left-0 w-full h-32 bg-primary/5 blur-[80px] -z-10 pointer-events-none" />

      {/* Area Logo Premium */}
      <div className="h-20 flex items-center px-8 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full" />
            <img src={logo} alt="LexFlow" className="w-10 h-10 object-contain relative z-10" />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-black tracking-tighter text-white leading-none">LexFlow</span>
            <span className="text-[9px] font-bold text-primary uppercase tracking-[3px] mt-1">Law Suite</span>
          </div>
        </div>
      </div>

      {/* Navigazione */}
      <nav className="flex-1 px-4 py-2 space-y-8 overflow-y-auto custom-scrollbar">
        
        {/* Dashboard - Ora posizionata sopra al Menu Principale */}
        <div className="space-y-1.5">
          <NavItem item={{ path: '/', label: 'Dashboard', icon: LayoutDashboard }} />
        </div>

        {/* Gruppo Principale */}
        <div className="space-y-1.5">
          <div className="px-4 mb-3 text-[10px] font-black text-text-dim/40 uppercase tracking-[3px]">
            Menu Principale
          </div>
          {navItems.map((item) => (
            <NavItem key={item.path} item={item} />
          ))}
        </div>

        {/* Gruppo Sistema */}
        <div className="space-y-1.5">
          <div className="px-4 mb-3 text-[10px] font-black text-text-dim/40 uppercase tracking-[3px]">
            Configurazione
          </div>
          {systemItems.map((item) => (
            <NavItem key={item.path} item={item} />
          ))}
        </div>
      </nav>

      {/* Footer con Azioni di Sicurezza */}
      <div className="p-6 border-t border-white/5 bg-[#0a0b12]">
        
        {/* Tasto Blocca Vault - Ora permanentemente rosso e visibile */}
        <button
          onClick={onLock}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-2xl text-red-500 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all duration-300 group mb-6"
        >
          <Lock size={18} className="transition-transform group-hover:-rotate-12" />
          <span className="font-black text-[11px] uppercase tracking-widest">Blocca Vault</span>
        </button>

        {/* Badge Versione e Crittografia */}
        <div className="flex flex-col gap-3 px-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-text-dim/60 uppercase tracking-tighter">Versione {version}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/5">
            <ShieldCheck size={12} className="text-primary" />
            <span className="text-[9px] font-black text-text-dim uppercase tracking-widest">
              AES-256 GCM Secure
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}