import { useNavigate } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PAPEL_ROTULOS, PERMISSAO_ROTULOS, permissoesEfetivas } from '../services/permissaoService';
import LinhaInfo from '../components/LinhaInfo';

export default function PaginaConta() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();

  // RotaProtegida já garante usuário autenticado antes de renderizar esta página.
  if (!usuario) return null;

  async function aoSair() {
    await logout();
    navigate('/login', { replace: true });
  }

  const permissoesAtivas = permissoesEfetivas(usuario);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <User className="size-7" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-slate-900">{usuario.nome}</p>
            <p className="text-sm text-slate-500">Matrícula {usuario.matricula}</p>
          </div>
        </div>

        <dl className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
          <LinhaInfo rotulo="Cargo" valor={usuario.cargo} />
          <LinhaInfo rotulo="Regional" valor={usuario.regional} />
          <LinhaInfo rotulo="Tipo de acesso" valor={PAPEL_ROTULOS[usuario.papel] ?? usuario.papel} />
          <LinhaInfo
            rotulo="Status da conta"
            valor={usuario.status === 'ativo' ? 'Ativa' : 'Inativa'}
            corValor={usuario.status === 'ativo' ? 'text-emerald-700' : 'text-red-700'}
          />
        </dl>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-sm font-semibold text-slate-700">Permissões</h2>
        {permissoesAtivas.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nenhuma permissão atribuída.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {permissoesAtivas.map((permissao) => (
              <li key={permissao} className="flex items-center gap-2 text-sm text-slate-700">
                <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                {PERMISSAO_ROTULOS[permissao] ?? permissao}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={aoSair}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
      >
        <LogOut className="size-4" aria-hidden="true" />
        Sair da conta
      </button>
    </div>
  );
}