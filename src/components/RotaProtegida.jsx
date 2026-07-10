import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Bloqueia acesso a rotas internas para usuários não autenticados,
 * redirecionando para /login e preservando a rota de origem em
 * `state.de` para retorno pós-login.
 * Se `permissaoRequerida` for informada, também exige essa permissão.
 */
export default function RotaProtegida({ permissaoRequerida }) {
  const { usuario, carregando, temPermissao } = useAuth();
  const localizacao = useLocation();

  if (carregando) {
    return <p className="p-4 text-sm text-slate-500">Carregando sessão…</p>;
  }

  if (!usuario) {
    return <Navigate to="/login" state={{ de: localizacao.pathname }} replace />;
  }

  if (permissaoRequerida && !temPermissao(permissaoRequerida)) {
    return (
      <div className="mx-auto max-w-md space-y-2 px-4 py-10 text-center">
        <p className="text-base font-semibold text-slate-800">Acesso restrito</p>
        <p className="text-sm text-slate-500">
          Sua conta não tem permissão para acessar esta área.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
