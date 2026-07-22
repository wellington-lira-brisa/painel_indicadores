import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  CheckSquare,
  ChevronDown,
  FilePenLine,
  Loader2,
  MessageSquareText,
  Minus,
  Plus,
  Square,
} from "lucide-react";
import ModalFormulario from "./ModalFormulario";
import StatusPlanoBadge from "./StatusPlanoBadge";
import { listarHistoricoPlano } from "../services/historicoPlanoService";
import { formatarDataHora } from "../utils/format";
import {
  ROTULOS_CAMPO_HISTORICO,
  agruparEventosPorDia,
  ehCampoCurto,
  ehCampoLongo,
  formatarValorHistorico,
  iniciaisNome,
  tempoRelativo,
} from "../utils/historicoPlano";
import { analisarDiffCampoLongo } from "../utils/diffCampoPlano";

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
      largura="ampla"
    >
      <div className="px-4 py-5 sm:px-6">
        {erro && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
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
          <p className="py-10 text-center text-sm text-slate-500">
            Nenhuma alteração registrada ainda.
          </p>
        )}

        {eventos && eventos.length > 0 && (
          <div className="space-y-6">
            {agruparEventosPorDia(eventos).map((grupo) => (
              <div key={grupo.rotulo}>
                <div
                  className="mb-3 flex items-center gap-3"
                  aria-label={`Alterações de ${grupo.rotulo}`}
                >
                  <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {grupo.rotulo}
                  </p>
                  <span
                    className="h-px flex-1 bg-slate-200"
                    aria-hidden="true"
                  />
                </div>
                <ol className="space-y-3">
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
  const nomeAutor = evento.alteradoPor?.nome ?? "Colaborador removido";
  // O diff de textos longos pode usar LCS. Memoizar a preparação evita
  // recalculá-lo em todos os cards quando outro evento é expandido.
  const dadosVisuais = useMemo(() => {
    const entradas = Object.entries(evento.alteracoes);
    const mudancaStatus = entradas.find(([campo]) => campo === "status");
    const mudancasCurtas = entradas.filter(
      ([campo]) => ehCampoCurto(campo) && campo !== "status",
    );
    const analisesLongas = entradas
      .filter(([campo]) => ehCampoLongo(campo))
      .map(([campo, diff]) => ({
        campo,
        ...analisarDiffCampoLongo(diff.de, diff.para),
      }));

    return {
      entradas,
      mudancaStatus,
      mudancasCurtas,
      analisesLongas,
      camposComProsa: analisesLongas.filter(
        (analise) => analise.diffProsa !== null,
      ),
    };
  }, [evento.alteracoes]);

  const {
    entradas,
    mudancaStatus,
    mudancasCurtas,
    analisesLongas,
    camposComProsa,
  } = dadosVisuais;
  const temDetalheExpansivel = camposComProsa.length > 0;
  const camposAlterados = entradas.map(
    ([campo]) => ROTULOS_CAMPO_HISTORICO[campo] ?? campo,
  );
  const quantidadeCampos = camposAlterados.length;
  const resumoCampos = `${quantidadeCampos} ${quantidadeCampos === 1 ? "campo alterado" : "campos alterados"}`;

  const existeAlgumaLinhaVisivel =
    Boolean(mudancaStatus) ||
    mudancasCurtas.length > 0 ||
    analisesLongas.some((analise) => analise.mudancasChecklist.length > 0) ||
    camposComProsa.length > 0;

  return (
    <li className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex w-full items-start gap-3 p-4 text-left sm:gap-4">
        <Avatar nome={nomeAutor} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-sm font-semibold text-slate-900">{nomeAutor}</p>
            <time
              dateTime={evento.alteradoEm}
              title={formatarDataHora(evento.alteradoEm)}
              className="text-xs text-slate-400"
            >
              {tempoRelativo(evento.alteradoEm)} ·{" "}
              {formatarDataHora(evento.alteradoEm)}
            </time>
          </div>

          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
            <FilePenLine
              className="size-4 shrink-0 text-brand-700"
              aria-hidden="true"
            />
            {resumoCampos}
          </p>

          {camposAlterados.length > 0 && (
            <ul
              className="mt-2 flex flex-wrap gap-1.5"
              aria-label="Campos alterados"
            >
              {camposAlterados.map((campo) => (
                <li
                  key={campo}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600"
                >
                  {campo}
                </li>
              ))}
            </ul>
          )}

          {!existeAlgumaLinhaVisivel && (
            <p className="mt-2 text-sm text-slate-500">
              Alteração sem mudança de conteúdo visível.
            </p>
          )}
        </div>

        {temDetalheExpansivel && (
          <button
            type="button"
            onClick={aoAlternar}
            aria-expanded={expandido}
            aria-label={`${expandido ? "Ocultar" : "Ver"} detalhes de ${resumoCampos}`}
            className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-brand-700 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            <ChevronDown
              className={`size-4 transition-transform ${expandido ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      {(mudancaStatus || mudancasCurtas.length > 0) && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 px-3 py-3 sm:px-4 sm:py-4">
          {mudancaStatus && (
            <DiffStatus de={mudancaStatus[1].de} para={mudancaStatus[1].para} />
          )}

          {mudancasCurtas.map(([campo, diff]) => (
            <DiffCurto
              key={campo}
              rotulo={ROTULOS_CAMPO_HISTORICO[campo] ?? campo}
              de={formatarValorHistorico(campo, diff.de)}
              para={formatarValorHistorico(campo, diff.para)}
            />
          ))}
        </div>
      )}

      {analisesLongas.some(
        (analise) => analise.mudancasChecklist.length > 0,
      ) && (
        <div className="space-y-3 border-t border-slate-100 px-3 py-3 sm:px-4 sm:py-4">
          {analisesLongas
            .filter((analise) => analise.mudancasChecklist.length > 0)
            .map((analise) => (
              <BlocoChecklist
                key={analise.campo}
                rotulo={ROTULOS_CAMPO_HISTORICO[analise.campo] ?? analise.campo}
                itens={analise.mudancasChecklist}
              />
            ))}
        </div>
      )}

      {temDetalheExpansivel && expandido && (
        <div className="space-y-4 border-t border-slate-100 bg-slate-50/50 px-3 py-3 sm:px-4 sm:py-4">
          {camposComProsa.map((analise) => (
            <BlocoDiffProsa
              key={analise.campo}
              rotulo={ROTULOS_CAMPO_HISTORICO[analise.campo] ?? analise.campo}
              partes={analise.diffProsa}
            />
          ))}
        </div>
      )}

      {evento.motivo && (
        <div className="flex items-start gap-2.5 border-t border-slate-100 bg-amber-50/60 px-4 py-3 text-sm text-slate-700">
          <MessageSquareText
            className="mt-0.5 size-4 shrink-0 text-amber-700"
            aria-hidden="true"
          />
          <p>
            <span className="font-semibold text-slate-800">Motivo:</span>{" "}
            {evento.motivo}
          </p>
        </div>
      )}
    </li>
  );
}

function Avatar({ nome }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 ring-4 ring-brand-50">
      {iniciaisNome(nome)}
    </span>
  );
}

function DiffStatus({ de, para }) {
  return (
    <BlocoCampo rotulo="Status">
      <ComparacaoValores
        anterior={<StatusPlanoBadge status={de} />}
        novo={<StatusPlanoBadge status={para} />}
        alinharCentro
      />
    </BlocoCampo>
  );
}

function DiffCurto({ rotulo, de, para }) {
  return (
    <BlocoCampo rotulo={rotulo}>
      <ComparacaoValores
        anterior={<span className="break-words text-slate-700">{de}</span>}
        novo={
          <span className="break-words font-semibold text-slate-900">
            {para}
          </span>
        }
      />
    </BlocoCampo>
  );
}

const ESTILO_ITEM_CHECKLIST = {
  concluido: {
    Icone: CheckSquare,
    cor: "text-emerald-600",
    acao: "marcado como concluído",
  },
  pendente: {
    Icone: Square,
    cor: "text-slate-400",
    acao: "marcado como pendente",
  },
  adicionado: {
    Icone: Plus,
    cor: "text-emerald-600",
    acao: "adicionado ao checklist",
  },
  removido: {
    Icone: Minus,
    cor: "text-red-500",
    acao: "removido do checklist",
  },
};

/** Um item de checklist que mudou de estado — já é a própria descrição do evento, sempre visível. */
function BlocoChecklist({ rotulo, itens }) {
  return (
    <BlocoCampo rotulo={rotulo}>
      <ul className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        {itens.map((item, indice) => (
          <LinhaChecklist key={`${item.texto}-${indice}`} item={item} />
        ))}
      </ul>
    </BlocoCampo>
  );
}

function LinhaChecklist({ item }) {
  const { Icone, cor, acao } = ESTILO_ITEM_CHECKLIST[item.tipo];
  return (
    <li className="flex items-start gap-2 text-sm text-slate-700">
      <Icone className={`mt-0.5 size-4 shrink-0 ${cor}`} aria-hidden="true" />
      <span>
        Item <span className="font-medium">"{item.texto}"</span> {acao}
      </span>
    </li>
  );
}

function BlocoDiffProsa({ rotulo, partes }) {
  const partesAnteriores = partes.filter(
    (parte) => parte.tipo !== "adicionado",
  );
  const partesNovas = partes.filter((parte) => parte.tipo !== "removido");

  return (
    <BlocoCampo rotulo={rotulo}>
      <ComparacaoValores
        anterior={<TextoDiff partes={partesAnteriores} lado="anterior" />}
        novo={<TextoDiff partes={partesNovas} lado="novo" />}
      />
    </BlocoCampo>
  );
}

function BlocoCampo({ rotulo, children }) {
  return (
    <section className="min-w-0" aria-label={`Alteração no campo ${rotulo}`}>
      <h4 className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-600">
        {rotulo}
      </h4>
      {children}
    </section>
  );
}

function ComparacaoValores({ anterior, novo, alinharCentro = false }) {
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-stretch">
      <CartaoValor tipo="anterior" alinharCentro={alinharCentro}>
        {anterior}
      </CartaoValor>

      <div
        className="flex items-center justify-center text-slate-400"
        aria-hidden="true"
      >
        <ArrowDown className="size-4 sm:hidden" />
        <ArrowRight className="hidden size-4 sm:block" />
      </div>

      <CartaoValor tipo="novo" alinharCentro={alinharCentro}>
        {novo}
      </CartaoValor>
    </div>
  );
}

const ESTILOS_CARTAO_VALOR = {
  anterior: {
    rotulo: "Antes",
    detalhe: "Valor anterior",
    Icone: Minus,
    cabecalho: "border-rose-100 bg-rose-50 text-rose-800",
    borda: "border-rose-100",
  },
  novo: {
    rotulo: "Depois",
    detalhe: "Novo valor",
    Icone: Plus,
    cabecalho: "border-emerald-100 bg-emerald-50 text-emerald-800",
    borda: "border-emerald-100",
  },
};

function CartaoValor({ tipo, children, alinharCentro }) {
  const estilo = ESTILOS_CARTAO_VALOR[tipo];
  const { Icone } = estilo;

  return (
    <div
      className={`min-w-0 overflow-hidden rounded-xl border bg-white ${estilo.borda}`}
    >
      <div
        className={`flex items-center gap-2 border-b px-3 py-2 ${estilo.cabecalho}`}
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/80">
          <Icone className="size-3" aria-hidden="true" />
        </span>
        <p className="text-xs font-bold uppercase tracking-wide">
          {estilo.rotulo}
        </p>
        <span className="text-[11px] font-medium opacity-70">
          {estilo.detalhe}
        </span>
      </div>
      <div
        className={`min-h-14 p-3 text-sm leading-6 ${alinharCentro ? "flex items-center" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}

function TextoDiff({ partes, lado }) {
  if (partes.length === 0)
    return <span className="italic text-slate-400">Sem conteúdo</span>;

  return (
    <p className="whitespace-pre-wrap break-words text-slate-700">
      {partes.map((parte, indice) => (
        <TrechoDiff
          key={indice}
          tipo={parte.tipo}
          texto={parte.texto}
          lado={lado}
        />
      ))}
    </p>
  );
}

function TrechoDiff({ tipo, texto, lado }) {
  if (lado === "anterior" && tipo === "removido") {
    return (
      <span className="rounded-sm bg-rose-100 px-0.5 text-rose-900 line-through decoration-rose-400">
        {texto}
      </span>
    );
  }
  if (lado === "novo" && tipo === "adicionado") {
    return (
      <span className="rounded-sm bg-emerald-100 px-0.5 font-medium text-emerald-900">
        {texto}
      </span>
    );
  }
  return <span>{texto}</span>;
}