import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PERMISSOES } from '../services/permissaoService';
import SecaoColaboradores from '../components/SecaoColaboradores';
import SecaoConvites from '../components/SecaoConvites';
import SecaoFwa from '../components/SecaoFwa';

const ABAS = [
  { id: 'colaboradores', label: 'Colaboradores', permissaoRequerida: PERMISSOES.GERENCIAR_USUARIOS },
  { id: 'convites', label: 'Convites', permissaoRequerida: PERMISSOES.CRIAR_CONVITES },
  { id: 'fwa', label: 'FWA', permissaoRequerida: PERMISSOES.GERENCIAR_FWA },
];

export default function PaginaAdmin() {
  const { temPermissao } = useAuth();
  const abasVisiveis = ABAS.filter((aba) => !aba.permissaoRequerida || temPermissao(aba.permissaoRequerida));
  const [abaAtiva, setAbaAtiva] = useState(abasVisiveis[0]?.id ?? null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-6 text-brand-700" aria-hidden="true" />
        <div>
          <h1 className="text-lg font-bold text-slate-900">Painel administrativo</h1>
          <p className="text-sm text-slate-500">Gerenciamento de colaboradores e permissões</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {abasVisiveis.map((aba) => (
          <button
            key={aba.id}
            type="button"
            role="tab"
            aria-selected={abaAtiva === aba.id}
            onClick={() => setAbaAtiva(aba.id)}
            className={`min-h-[44px] border-b-2 px-4 text-sm font-semibold ${
              abaAtiva === aba.id
                ? 'border-brand-700 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {aba.label}
          </button>
        ))}
      </div>

      {abasVisiveis.length === 0 && (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Sua conta não tem permissão para nenhuma área administrativa específica.
        </p>
      )}

      {abaAtiva === 'colaboradores' && <SecaoColaboradores />}
      {abaAtiva === 'convites' && <SecaoConvites />}
      {abaAtiva === 'fwa' && <SecaoFwa />}
    </div>
  );
}