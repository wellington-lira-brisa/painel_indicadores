import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import RotaProtegida from './components/RotaProtegida';
import LayoutPrincipal from './layouts/LayoutPrincipal';
import PaginaLogin from './pages/PaginaLogin';
import PaginaRanking from './pages/PaginaRanking';
import PaginaCidade from './pages/PaginaCidade';
import PaginaListaPlanos from './pages/PaginaListaPlanos';
import PaginaPlano from './pages/PaginaPlano';
import PaginaConta from './pages/PaginaConta';
import { PERMISSOES } from './services/permissaoService';
import { TECNOLOGIAS } from './config/tecnologias';

// Only usuários com acesso administrativo carregam este bundle — a
// maioria dos colaboradores nunca visita /admin.
const PaginaAdmin = lazy(() => import('./pages/PaginaAdmin'));

function CarregandoRota() {
  return <p className="p-4 text-sm text-slate-500">Carregando…</p>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PaginaLogin />} />

          <Route element={<RotaProtegida />}>
            <Route element={<LayoutPrincipal />}>
              <Route path="/" element={<PaginaRanking tecnologia={TECNOLOGIAS.ftth} />} />
              <Route path="/cidades/:cidadeId" element={<PaginaCidade tecnologia={TECNOLOGIAS.ftth} />} />

              {/* Mesmos componentes de página do FTTH, só trocando a config de tecnologia —
                  nenhum arquivo de página novo foi criado pro 5G. */}
              <Route path="/5g" element={<PaginaRanking tecnologia={TECNOLOGIAS.cincoG} />} />
              <Route path="/5g/cidades/:cidadeId" element={<PaginaCidade tecnologia={TECNOLOGIAS.cincoG} />} />

              <Route path="/planos" element={<PaginaListaPlanos />} />
              <Route path="/planos/:planoId" element={<PaginaPlano />} />
              <Route path="/conta" element={<PaginaConta />} />

              <Route element={<RotaProtegida permissaoRequerida={PERMISSOES.ACESSAR_ADMIN} />}>
                <Route
                  path="/admin"
                  element={
                    <Suspense fallback={<CarregandoRota />}>
                      <PaginaAdmin />
                    </Suspense>
                  }
                />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}