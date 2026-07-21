import { Outlet, useLocation, Link } from 'react-router-dom';
import MenuConta from '../components/MenuConta';
import { TECNOLOGIAS } from '../config/tecnologias';

/**
 * Toggle FTTH/5G do cabeçalho. As duas opções usam o MESMO mecanismo
 * visual (pill branca = ativo, texto esmaecido = inativo) — só a cor do
 * texto ativo muda (navy pra FTTH, laranja pra 5G), a mesma lógica de
 * "cor de destaque por tecnologia" já usada no resto do app
 * (`classeTema`/`--color-brand-*`). Antes cada aba tinha um tratamento
 * visual diferente (translúcido vs. laranja sólido); unificar deixa o
 * controle mais legível como um único componente, não dois botões soltos.
 */
function SeletorTecnologia() {
  const { pathname } = useLocation();
  const emCincoG = pathname.startsWith(TECNOLOGIAS.cincoG.rotaBase);

  return (
    <div className="flex shrink-0 gap-0.5 rounded-full bg-white/10 p-0.5" role="group" aria-label="Tecnologia">
      <Link
        to="/"
        aria-current={!emCincoG ? 'page' : undefined}
        className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
          !emCincoG ? 'bg-white text-brand-900' : 'text-white/60 hover:text-white'
        }`}
      >
        {TECNOLOGIAS.ftth.nome}
      </Link>
      <Link
        to={TECNOLOGIAS.cincoG.rotaBase}
        aria-current={emCincoG ? 'page' : undefined}
        className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
          emCincoG ? 'bg-white text-orange-600' : 'text-white/60 hover:text-white'
        }`}
      >
        {TECNOLOGIAS.cincoG.nome}
      </Link>
    </div>
  );
}

export default function LayoutPrincipal() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-brand-800 bg-brand-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <h1 className="text-sm font-bold leading-tight xs:text-base sm:text-lg">
              Mesa de Performance <span className="hidden font-medium text-white/50 sm:inline">OP</span>
            </h1>
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