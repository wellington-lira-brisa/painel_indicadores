import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { listarCidades } from '../services/cidadeService';
import { atualizarVendeFwa } from '../services/fwaService';
import BadgeFwa from './BadgeFwa';

export default function SecaoFwa() {
  const { usuario } = useAuth();
  const [cidades, setCidades] = useState(null);
  const [erro, setErro] = useState(null);
  const [cidadeSelecionadaId, setCidadeSelecionadaId] = useState('');
  const [vendeFwa, setVendeFwa] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvoRecentemente, setSalvoRecentemente] = useState(false);

  useEffect(() => {
    listarCidades()
      .then((dados) => {
        setCidades(dados);
        if (dados.length > 0) {
          setCidadeSelecionadaId(dados[0].id);
          setVendeFwa(dados[0].vendeFwa);
        }
      })
      .catch((excecao) => setErro(excecao.message));
  }, []);

  function aoTrocarCidade(id) {
    setCidadeSelecionadaId(id);
    setVendeFwa(cidades.find((c) => c.id === id)?.vendeFwa ?? false);
    setSalvoRecentemente(false);
  }

  async function aoSalvar() {
    setErro(null);
    setSalvando(true);
    try {
      await atualizarVendeFwa(cidadeSelecionadaId, vendeFwa, usuario.id);
      setCidades((atual) =>
        atual.map((c) => (c.id === cidadeSelecionadaId ? { ...c, vendeFwa } : c)),
      );
      setSalvoRecentemente(true);
      setTimeout(() => setSalvoRecentemente(false), 2500);
    } catch (excecao) {
      setErro(excecao.message);
    } finally {
      setSalvando(false);
    }
  }

  if (erro) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {erro}
      </p>
    );
  }

  if (!cidades) {
    return <p className="text-sm text-slate-500">Carregando cidades…</p>;
  }

  const cidadeSelecionada = cidades.find((c) => c.id === cidadeSelecionadaId);

  return (
    <div className="max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <label htmlFor="cidade-fwa" className="block text-sm font-medium text-slate-700">
          Cidade
        </label>
        <select
          id="cidade-fwa"
          value={cidadeSelecionadaId}
          onChange={(e) => aoTrocarCidade(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
        >
          {cidades.map((cidade) => (
            <option key={cidade.id} value={cidade.id}>
              {cidade.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-700">Vende FWA</p>
          {cidadeSelecionada && (
            <p className="mt-1">
              <BadgeFwa vendeFwa={cidadeSelecionada.vendeFwa} />
            </p>
          )}
        </div>
        <label className="relative inline-flex min-h-[44px] shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            checked={vendeFwa}
            onChange={(e) => {
              setVendeFwa(e.target.checked);
              setSalvoRecentemente(false);
            }}
            className="peer sr-only"
          />
          <span className="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-600 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-700" />
          <span className="absolute left-1 size-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={aoSalvar}
          disabled={salvando || !cidadeSelecionadaId}
          className="flex min-h-[44px] items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
        >
          {salvando ? 'Salvando…' : 'Salvar alteração'}
        </button>
        {salvoRecentemente && <span className="text-sm font-medium text-emerald-700">Salvo.</span>}
      </div>
    </div>
  );
}