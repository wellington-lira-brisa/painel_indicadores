import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { BarChart3, CalendarDays, ChevronDown, ClipboardList, LogOut, Menu, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PERMISSOES } from '../services/permissaoService';
import { useMontagemAnimada } from '../hooks/useMontagemAnimada';

const DURACAO_TRANSICAO_MS = 150;

const ITENS_NAVEGACAO = [
  { to: '/', label: 'Ranking', Icone: BarChart3, fim: true },
  { to: '/planos', label: 'Planos', Icone: ClipboardList },
  { to: '/feriados', label: 'Calendário de Feriados', Icone: CalendarDays },
];

function iniciais(nome = '') {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? partes.at(-1)[0] : '';
  return (primeira + ultima || '?').toUpperCase();
}

/**
 * Menu único do topo.
 *
 * A navegação principal fica dentro deste dropdown em todos os tamanhos de tela,
 * mantendo o header limpo e garantindo que "Planos" apareça também no mobile.
 */
export default function MenuConta() {
  const { usuario, logout, temPermissao } = useAuth();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const { montado, visivel } = useMontagemAnimada(aberto, DURACAO_TRANSICAO_MS);
  const containerRef = useRef(null);
  const botaoRef = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;

    function aoClicarFora(evento) {
      if (containerRef.current && !containerRef.current.contains(evento.target)) {
        setAberto(false);
      }
    }

    function aoPressionarTecla(evento) {
      if (evento.key === 'Escape') {
        setAberto(false);
        botaoRef.current?.focus();
      }
    }

    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoPressionarTecla);

    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoPressionarTecla);
    };
  }, [aberto]);

  if (!usuario) return null;

  const itensConta = [
    { to: '/conta', label: 'Minha conta', Icone: User, fim: true },
    ...(temPermissao(PERMISSOES.ACESSAR_ADMIN)
      ? [{ to: '/admin', label: 'Painel administrativo', Icone: ShieldCheck }]
      : []),
  ];

  async function aoSair() {
    setAberto(false);
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={botaoRef}
        type="button"
        onClick={() => setAberto((valor) => !valor)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
        className="flex min-h-[44px] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-900">
          {iniciais(usuario.nome)}
        </span>

        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[10rem] truncate text-sm font-semibold text-white">
            {usuario.nome}
          </span>
          <span className="block text-xs text-brand-100">matrícula {usuario.matricula}</span>
        </span>

        <Menu className="size-4 shrink-0 text-brand-100 sm:hidden" aria-hidden="true" />
        <ChevronDown
          className={`hidden size-4 shrink-0 text-brand-100 transition-transform duration-150 sm:block ${
            aberto ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {montado && (
        <div
          role="menu"
          aria-label="Menu principal"
          className={`absolute right-0 top-full z-50 mt-4 w-[min(20rem,calc(100vw-2rem))] origin-top-right rounded-xl border border-slate-200 bg-white py-2 text-slate-700 shadow-xl transition-all duration-150 ease-out ${
            visivel ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
          }`}
        >
          <div className="border-b border-slate-100 px-4 py-3 sm:hidden">
            <p className="truncate text-sm font-semibold text-slate-800">{usuario.nome}</p>
            <p className="text-xs text-slate-500">matrícula {usuario.matricula}</p>
          </div>

          <MenuSecao titulo="Navegação">
            {ITENS_NAVEGACAO.map(({ to, label, Icone, fim }) => (
              <ItemMenu key={to} to={to} label={label} Icone={Icone} fim={fim} aoClicar={() => setAberto(false)} />
            ))}
          </MenuSecao>

          <div className="my-2 border-t border-slate-100" />

          <MenuSecao titulo="Conta">
            {itensConta.map(({ to, label, Icone, fim }) => (
              <ItemMenu key={to} to={to} label={label} Icone={Icone} fim={fim} aoClicar={() => setAberto(false)} />
            ))}
          </MenuSecao>

          <div className="my-2 border-t border-slate-100" />

          <button
            type="button"
            role="menuitem"
            onClick={aoSair}
            className="flex min-h-[48px] w-full items-center gap-3 px-4 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

function MenuSecao({ titulo, children }) {
  return (
    <div className="py-1.5">
      <p className="px-4 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {titulo}
      </p>
      {children}
    </div>
  );
}

function ItemMenu({ to, label, Icone, fim, aoClicar }) {
  return (
    <NavLink
      to={to}
      end={fim}
      role="menuitem"
      onClick={aoClicar}
      className={({ isActive }) =>
        `flex min-h-[48px] items-center gap-3 px-4 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700 ${
          isActive
            ? 'bg-brand-50 font-semibold text-brand-800'
            : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
        }`
      }
    >
      <Icone className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}