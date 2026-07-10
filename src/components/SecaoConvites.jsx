import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listarConvites, listarPapeis } from '../services/convitesAdminService';
import CardConvite from './CardConvite';
import FormularioConvite from './FormularioConvite';

export default function SecaoConvites() {
  const { usuario } = useAuth();
  const [convites, setConvites] = useState(null);
  const [papeis, setPapeis] = useState([]);
  const [erro, setErro] = useState(null);
  const [convitEditando, setConviteEditando] = useState(null); // null = fechado, {} = novo, objeto = editar
  const [modalAberto, setModalAberto] = useState(false);

  useEffect(() => {
    Promise.all([listarConvites(), listarPapeis()])
      .then(([dadosConvites, dadosPapeis]) => {
        setConvites(dadosConvites);
        setPapeis(dadosPapeis);
      })
      .catch((excecao) => setErro(excecao.message));
  }, []);

  function abrirCriacao() {
    setConviteEditando(null);
    setModalAberto(true);
  }

  function abrirEdicao(convite) {
    setConviteEditando(convite);
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
  }

  function aoSalvarFormulario(convite) {
    setModalAberto(false);
    setConvites((atual) => {
      const existe = atual.some((c) => c.codigo === convite.codigo);
      return existe
        ? atual.map((c) => (c.codigo === convite.codigo ? convite : c))
        : [convite, ...atual];
    });
  }

  function aoAtualizarLocal(convite) {
    setConvites((atual) => atual.map((c) => (c.codigo === convite.codigo ? convite : c)));
  }

  function aoRemoverLocal(codigo) {
    setConvites((atual) => atual.filter((c) => c.codigo !== codigo));
  }

  if (erro) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {erro}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={abrirCriacao}
          className="flex min-h-[44px] items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          <Plus className="size-4" aria-hidden="true" />
          Novo convite
        </button>
      </div>

      {!convites ? (
        <p className="text-sm text-slate-500">Carregando convites…</p>
      ) : convites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">Nenhum código de convite criado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {convites.map((convite) => (
            <CardConvite
              key={convite.codigo}
              convite={convite}
              aoAtualizar={aoAtualizarLocal}
              aoRemover={aoRemoverLocal}
              aoEditar={abrirEdicao}
            />
          ))}
        </div>
      )}

      {modalAberto && (
        <FormularioConvite
          convite={convitEditando}
          papeis={papeis}
          criadoPorId={usuario.id}
          aoFechar={fecharModal}
          aoSalvar={aoSalvarFormulario}
        />
      )}
    </div>
  );
}