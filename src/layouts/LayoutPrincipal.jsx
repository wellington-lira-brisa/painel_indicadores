import { Outlet, useLocation, Link } from 'react-router-dom';
import MenuConta from '../components/MenuConta';
import { TECNOLOGIAS } from '../config/tecnologias';

/** Abas FTTH/5G do cabeçalho: link simples pra raiz de cada tecnologia. */
function SeletorTecnologia() {
  const { pathname } = useLocation();
  const emCincoG = pathname.startsWith(TECNOLOGIAS.cincoG.rotaBase);

  return (
    <div className="flex overflow-hidden rounded-lg border border-white/20" role="group" aria-label="Tecnologia">
      <Link
        to="/"
        aria-current={!emCincoG ? 'page' : undefined}
        className={`px-2.5 py-1 text-[11px] font-bold ${!emCincoG ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'}`}
      >
        {TECNOLOGIAS.ftth.nome}
      </Link>
      <Link
        to={TECNOLOGIAS.cincoG.rotaBase}
        aria-current={emCincoG ? 'page' : undefined}
        className={`px-2.5 py-1 text-[11px] font-bold ${emCincoG ? 'bg-orange-600 text-white' : 'text-white/60 hover:text-white'}`}
      >
        {TECNOLOGIAS.cincoG.nome}
      </Link>
    </div>
  );
}

export default function LayoutPrincipal() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 bg-brand-900 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold sm:text-lg">Mesa de Performace OP</h1>
            </div>
            <SeletorTecnologia />
          </div>

          <MenuConta />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}