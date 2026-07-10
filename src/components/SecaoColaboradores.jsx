import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { listarColaboradores } from '../services/adminService';
import CardColaboradorAdmin from './CardColaboradorAdmin';

export default function SecaoColaboradores() {
  const { usuario } = useAuth();
  const [colaboradores, setColaboradores] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    listarColaboradores()
      .then(setColaboradores)
      .catch((excecao) => setErro(excecao.message));
  }, []);

  function aoAtualizarColaborador(atualizado) {
    setColaboradores((atual) => atual.map((c) => (c.id === atualizado.id ? atualizado : c)));
  }

  function aoExcluirColaborador(colaboradorId) {
    setColaboradores((atual) => atual.filter((c) => c.id !== colaboradorId));
  }

  if (erro) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {erro}
      </p>
    );
  }

  if (!colaboradores) {
    return <p className="text-sm text-slate-500">Carregando colaboradores…</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {colaboradores.map((colaborador) => (
        <CardColaboradorAdmin
          key={colaborador.id}
          colaborador={colaborador}
          usuarioLogado={usuario}
          aoAtualizar={aoAtualizarColaborador}
          aoExcluir={aoExcluirColaborador}
        />
      ))}
    </div>
  );
}