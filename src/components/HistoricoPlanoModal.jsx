import { useEffect, useState } from 'react';
import { CheckSquare, ChevronDown, Loader2, Minus, Plus, Square } from 'lucide-react';
import ModalFormulario from './ModalFormulario';
import StatusPlanoBadge from './StatusPlanoBadge';
import { listarHistoricoPlano } from '../services/historicoPlanoService';
import { formatarDataHora } from '../utils/format';
import {
  ROTULOS_CAMPO_HISTORICO,
  agruparEventosPorDia,
  ehCampoCurto,
  ehCampoLongo,
  formatarValorHistorico,
  iniciaisNome,
  tempoRelativo,
} from '../utils/historicoPlano';
import { analisarDiffCampoLongo } from '../utils/diffCampoPlano';

/**
 * Timeline de alterações do plano — divulgação progressiva: cada evento é
 * uma linha compacta (autor, quando, o que mudou), e o diff de texto
 * completo só aparece ao expandir. Mudanças de status, prazo, responsável
 * e itens de checklist são sempre visíveis, sem precisar expandir — são
 * curtas e já são a própria descrição do que aconteceu.
 *
 * Carrega sob demanda (só quando o modal abre) — não pesa a página de
 * detalhe do plano se ninguém nunca clicar em "Histórico".
 */
export default function HistoricoPlanoModal({ planoId, aoFechar }) {
  const [eventos, setEventos] = useState(null);
  const [erro, setErro] = useState(null);
  const [expandidos, setExpandidos] = useState(() => new Set());

  useEffect(() => {
    let cancelado = false;

    listarHistoricoPlano(planoId)
      .then((dados) => {
        if (cancelado) return;
        setEventos(dados);
        // O evento mais recente já vem aberto — é o que a pessoa quer ver
        // sem precisar clicar; os anteriores ficam compactos por padrão.
        if (dados.length > 0) setExpandidos(new Set([dados[0].id]));
      })
      .catch((excecao) => {
        if (!cancelado) setErro(excecao.message);
      });

    return () => {
      cancelado = true;
    };
  }, [planoId]);

  function alternarExpandido(id) {
    setExpandidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <ModalFormulario
      titulo="Histórico de alterações"
      subtitulo="Linha do tempo das mudanças neste plano"
      aoFechar={aoFechar}
    >
      <div className="px-4 py-5 sm:px-6">
        {erro && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </p>
        )}

        {!erro && !eventos && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Carregando histórico…
          </div>
        )}

        {eventos && eventos.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">Nenhuma alteração registrada ainda.</p>
        )}

        {eventos && eventos.length > 0 && (
          <div className="space-y-5">
            {agruparEventosPorDia(eventos).map((grupo) => (
              <div key={grupo.rotulo}>
                <p className="sticky top-0 -mx-1 mb-2 bg-white px-1 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {grupo.rotulo}
                </p>
                <ol className="space-y-2">
                  {grupo.eventos.map((evento) => (
                    <EventoHistorico
                      key={evento.id}
                      evento={evento}
                      expandido={expandidos.has(evento.id)}
                      aoAlternar={() => alternarExpandido(evento.id)}
                    />
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalFormulario>
  );
}

function EventoHistorico({ evento, expandido, aoAlternar }) {
  const nomeAutor = evento.alteradoPor?.nome ?? 'Colaborador removido';
  const entradas = Object.entries(evento.alteracoes);

  const mudancaStatus = entradas.find(([campo]) => campo === 'status');
  const mudancasCurtas = entradas.filter(([campo]) => ehCampoCurto(campo) && campo !== 'status');

  // Cada campo longo pode conter checklist + prosa ao mesmo tempo — a
  // análise já separa as duas coisas, então cada uma é renderizada do
  // jeito certo sem o componente precisar saber como.
  const analisesLongas = entradas
    .filter(([campo]) => ehCampoLongo(campo))
    .map(([campo, diff]) => ({ campo, ...analisarDiffCampoLongo(diff.de, diff.para) }));

  const mudancasChecklist = analisesLongas.flatMap((analise) =>
    analise.mudancasChecklist.map((item) => ({ ...item, campo: analise.campo })),
  );
  const camposComProsa = analisesLongas.filter((analise) => analise.diffProsa !== null);
  const temDetalheExpansivel = camposComProsa.length > 0;

  const existeAlgumaLinhaVisivel =
    Boolean(mudancaStatus) || mudancasCurtas.length > 0 || mudancasChecklist.length > 0 || camposComProsa.length > 0;

  return (
    <li className="rounded-xl border border-slate-100 bg-white">
      <button
        type="button"
        onClick={temDetalheExpansivel ? aoAlternar : undefined}
        aria-expanded={temDetalheExpansivel ? expandido : undefined}
        className={`flex w-full items-start gap-3 rounded-xl p-3 text-left ${
          temDetalheExpansivel ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'
        }`}
      >
        <Avatar nome={nomeAutor} />

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{nomeAutor}</span>{' '}
            <time
              dateTime={evento.alteradoEm}
              title={formatarDataHora(evento.alteradoEm)}
              className="text-xs text-slate-400"
            >
              {tempoRelativo(evento.alteradoEm)}
            </time>
          </p>

          {mudancaStatus && <DiffStatus de={mudancaStatus[1].de} para={mudancaStatus[1].para} />}

          {mudancasCurtas.map(([campo, diff]) => (
            <DiffCurto
              key={campo}
              rotulo={ROTULOS_CAMPO_HISTORICO[campo] ?? campo}
              de={formatarValorHistorico(campo, diff.de)}
              para={formatarValorHistorico(campo, diff.para)}
            />
          ))}

          {mudancasChecklist.map((item, indice) => (
            <LinhaChecklist key={`${item.campo}-${indice}`} item={item} />
          ))}

          {camposComProsa.map((analise) => (
            <p key={analise.campo} className="text-sm text-slate-700">
              Editou <span className="font-medium">{ROTULOS_CAMPO_HISTORICO[analise.campo] ?? analise.campo}</span>
            </p>
          ))}

          {!existeAlgumaLinhaVisivel && (
            <p className="text-sm text-slate-500">Fez uma alteração sem mudança de conteúdo visível.</p>
          )}

          {evento.motivo && <p className="text-xs italic text-slate-500">"{evento.motivo}"</p>}
        </div>

        {temDetalheExpansivel && (
          <ChevronDown
            className={`mt-1 size-4 shrink-0 text-slate-400 transition-transform ${expandido ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        )}
      </button>

      {temDetalheExpansivel && expandido && (
        <div className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2">
          {camposComProsa.map((analise) => (
            <BlocoDiffProsa
              key={analise.campo}
              rotulo={ROTULOS_CAMPO_HISTORICO[analise.campo] ?? analise.campo}
              partes={analise.diffProsa}
            />
          ))}
        </div>
      )}
    </li>
  );
}

function Avatar({ nome }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
      {iniciaisNome(nome)}
    </span>
  );
}

/** Status é curto e enumerado — dois badges coloridos "de → para" dizem tudo, sem precisar de mais texto. */
function DiffStatus({ de, para }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="opacity-60">
        <StatusPlanoBadge status={de} />
      </span>
      <span className="text-xs text-slate-400" aria-hidden="true">→</span>
      <StatusPlanoBadge status={para} />
    </p>
  );
}

/** Valor curto não-colorido (prazo, responsável) — mesma ideia do status, em texto simples. */
function DiffCurto({ rotulo, de, para }) {
  return (
    <p className="text-sm text-slate-700">
      <span className="font-medium text-slate-500">{rotulo}:</span>{' '}
      <span className="text-slate-400 line-through decoration-slate-300">{de}</span>{' '}
      <span aria-hidden="true">→</span>{' '}
      <span className="font-semibold text-slate-800">{para}</span>
    </p>
  );
}

const ESTILO_ITEM_CHECKLIST = {
  concluido: { Icone: CheckSquare, cor: 'text-emerald-600', acao: 'marcado como concluído' },
  pendente: { Icone: Square, cor: 'text-slate-400', acao: 'marcado como pendente' },
  adicionado: { Icone: Plus, cor: 'text-emerald-600', acao: 'adicionado ao checklist' },
  removido: { Icone: Minus, cor: 'text-red-500', acao: 'removido do checklist' },
};

/** Um item de checklist que mudou de estado — já é a própria descrição do evento, sempre visível. */
function LinhaChecklist({ item }) {
  const { Icone, cor, acao } = ESTILO_ITEM_CHECKLIST[item.tipo];
  return (
    <p className="flex items-start gap-1.5 text-sm text-slate-700">
      <Icone className={`mt-0.5 size-4 shrink-0 ${cor}`} aria-hidden="true" />
      <span>
        Item <span className="font-medium">"{item.texto}"</span> {acao}
      </span>
    </p>
  );
}

/** Diff de prosa (texto corrido) — só aparece quando o evento é expandido. */
function BlocoDiffProsa({ rotulo, partes }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">
        {partes.map((parte, indice) => (
          <TrechoDiff key={indice} tipo={parte.tipo} texto={parte.texto} />
        ))}
      </p>
    </div>
  );
}

function TrechoDiff({ tipo, texto }) {
  if (tipo === 'removido') {
    return <span className="bg-red-100 text-red-700 line-through decoration-red-400">{texto}</span>;
  }
  if (tipo === 'adicionado') {
    return <span className="bg-emerald-100 text-emerald-800">{texto}</span>;
  }
  return <span className="text-slate-500">{texto}</span>;
}