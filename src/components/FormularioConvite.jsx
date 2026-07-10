import { useState } from 'react';
import { Dices } from 'lucide-react';
import ModalFormulario from './ModalFormulario';
import { criarConvite, atualizarConvite } from '../services/convitesAdminService';
import { gerarCodigoConvite } from '../utils/codigoConvite';

/** Converte data (YYYY-MM-DD) para ISO no fim do dia — expira ao final da data escolhida, não no início. */
function dataParaIsoFimDoDia(data) {
  return data ? new Date(`${data}T23:59:59`).toISOString() : null;
}

function isoParaData(iso) {
  return iso ? iso.slice(0, 10) : '';
}

export default function FormularioConvite({ convite, papeis, criadoPorId, aoFechar, aoSalvar }) {
  const editando = Boolean(convite);

  const [codigo, setCodigo] = useState(convite?.codigo ?? gerarCodigoConvite());
  const [descricao, setDescricao] = useState(convite?.descricao ?? '');
  const [ativo, setAtivo] = useState(convite?.ativo ?? true);
  const [ilimitado, setIlimitado] = useState(convite ? convite.limiteUsos === null : true);
  const [limiteUsos, setLimiteUsos] = useState(convite?.limiteUsos ?? 1);
  const [semExpiracao, setSemExpiracao] = useState(convite ? !convite.expiraEm : true);
  const [expiraEm, setExpiraEm] = useState(isoParaData(convite?.expiraEm));
  const [matriculaPermitida, setMatriculaPermitida] = useState(convite?.matriculaPermitida ?? '');
  const [papelAssociado, setPapelAssociado] = useState(convite?.papelAssociado ?? '');
  const [observacoes, setObservacoes] = useState(convite?.observacoes ?? '');
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  async function aoEnviar(evento) {
    evento.preventDefault();
    setErro(null);

    const limiteUsosNumero = Number(limiteUsos);
    if (!ilimitado && (!Number.isInteger(limiteUsosNumero) || limiteUsosNumero < 1)) {
      setErro('Quantidade de usos precisa ser um número inteiro maior que zero.');
      return;
    }

    setSalvando(true);

    const dados = {
      codigo: codigo.trim().toUpperCase(),
      descricao: descricao.trim(),
      ativo,
      limiteUsos: ilimitado ? null : limiteUsosNumero,
      expiraEm: semExpiracao ? null : dataParaIsoFimDoDia(expiraEm),
      matriculaPermitida: matriculaPermitida.trim(),
      papelAssociado: papelAssociado || null,
      observacoes: observacoes.trim(),
    };

    try {
      const salvo = editando
        ? await atualizarConvite(convite.codigo, dados)
        : await criarConvite({ ...dados, criadoPor: criadoPorId });
      aoSalvar(salvo);
    } catch (excecao) {
      setErro(excecao.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalFormulario
      titulo={editando ? 'Editar código de convite' : 'Criar código de convite'}
      aoFechar={aoFechar}
    >
      <form onSubmit={aoEnviar} className="flex flex-1 flex-col gap-4 px-4 py-5 sm:px-6">
        <div>
          <label htmlFor="codigo" className="block text-sm font-medium text-slate-700">
            Código
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="codigo"
              type="text"
              required
              maxLength={20}
              disabled={editando}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono text-base uppercase focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 disabled:bg-slate-50 disabled:text-slate-500"
            />
            {!editando && (
              <button
                type="button"
                onClick={() => setCodigo(gerarCodigoConvite())}
                className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <Dices className="size-4" aria-hidden="true" />
                Gerar
              </button>
            )}
          </div>
          {editando && (
            <p className="mt-1 text-xs text-slate-500">O código não pode ser alterado após criado.</p>
          )}
        </div>

        <div>
          <label htmlFor="descricao" className="block text-sm font-medium text-slate-700">
            Descrição
          </label>
          <input
            id="descricao"
            type="text"
            maxLength={200}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
            placeholder="Ex: Convite para equipe G7"
          />
        </div>

        <label className="flex min-h-[44px] items-center gap-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="size-4 rounded border-slate-300 text-brand-700 focus:ring-brand-700"
          />
          Convite ativo
        </label>

        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Quantidade de usos</legend>
          <div className="mt-1 space-y-2">
            <label className="flex min-h-[44px] items-center gap-2.5 text-sm text-slate-700">
              <input
                type="radio"
                name="tipoUso"
                checked={ilimitado}
                onChange={() => setIlimitado(true)}
                className="size-4 border-slate-300 text-brand-700 focus:ring-brand-700"
              />
              Ilimitado
            </label>
            <label className="flex min-h-[44px] flex-wrap items-center gap-2.5 text-sm text-slate-700">
              <input
                type="radio"
                name="tipoUso"
                checked={!ilimitado}
                onChange={() => setIlimitado(false)}
                className="size-4 border-slate-300 text-brand-700 focus:ring-brand-700"
              />
              Limitado a
              <input
                type="number"
                min={1}
                disabled={ilimitado}
                value={limiteUsos}
                onChange={(e) => setLimiteUsos(e.target.value)}
                className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 disabled:bg-slate-50"
              />
              usos
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-slate-700">Expiração</legend>
          <div className="mt-1 space-y-2">
            <label className="flex min-h-[44px] items-center gap-2.5 text-sm text-slate-700">
              <input
                type="radio"
                name="tipoExpiracao"
                checked={semExpiracao}
                onChange={() => setSemExpiracao(true)}
                className="size-4 border-slate-300 text-brand-700 focus:ring-brand-700"
              />
              Sem expiração
            </label>
            <label className="flex min-h-[44px] flex-wrap items-center gap-2.5 text-sm text-slate-700">
              <input
                type="radio"
                name="tipoExpiracao"
                checked={!semExpiracao}
                onChange={() => setSemExpiracao(false)}
                className="size-4 border-slate-300 text-brand-700 focus:ring-brand-700"
              />
              Expira em
              <input
                type="date"
                disabled={semExpiracao}
                value={expiraEm}
                onChange={(e) => setExpiraEm(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 disabled:bg-slate-50"
              />
            </label>
          </div>
        </fieldset>

        <div>
          <label htmlFor="matricula" className="block text-sm font-medium text-slate-700">
            Matrícula específica (opcional)
          </label>
          <input
            id="matricula"
            type="text"
            maxLength={20}
            value={matriculaPermitida}
            onChange={(e) => setMatriculaPermitida(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
            placeholder="Deixe em branco para permitir qualquer matrícula"
          />
        </div>

        <div>
          <label htmlFor="papel" className="block text-sm font-medium text-slate-700">
            Perfil associado (opcional)
          </label>
          <select
            id="papel"
            value={papelAssociado}
            onChange={(e) => setPapelAssociado(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
          >
            <option value="">Nenhum</option>
            {papeis.map((p) => (
              <option key={p.papel} value={p.papel}>
                {p.nome}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Apenas informativo por enquanto — não altera o cadastro automaticamente.
          </p>
        </div>

        <div>
          <label htmlFor="observacoes" className="block text-sm font-medium text-slate-700">
            Observações internas
          </label>
          <textarea
            id="observacoes"
            rows={3}
            maxLength={1000}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
            placeholder="Visível só para administradores"
          />
        </div>

        {erro && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </p>
        )}

        <div className="mt-auto flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={aoFechar}
            className="flex min-h-[48px] items-center justify-center rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="flex min-h-[48px] items-center justify-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Criar convite'}
          </button>
        </div>
      </form>
    </ModalFormulario>
  );
}