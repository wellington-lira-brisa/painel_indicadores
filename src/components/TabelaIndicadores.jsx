import { memo, useMemo } from 'react';
import { ChevronDown, ChevronRight, Inbox } from 'lucide-react';
import { MESES, ANO_PAINEL } from '../data/mockHelpers';
import { semanasDoMes } from '../utils/semanas';
import { atingimentoIndicador, atingimentoMes, classificarAtingimento, STATUS_COR_TEXTO } from '../utils/status';
import { formatarValor, formatarPercentual } from '../utils/format';
import { useControlesTabela } from '../hooks/useControlesTabela';
import { useColapsoSemanas } from '../hooks/useColapsoSemanas';
import ControlesTabelaIndicadores from './ControlesTabelaIndicadores';
import ListaIndicadoresMobile from './ListaIndicadoresMobile';
import FeriadosMes from './FeriadosMes';

function corCelula(indicador, mes) {
  const atingimento = atingimentoMes(indicador, mes, 'metaIndicador');
  return atingimento === null ? 'text-slate-400' : STATUS_COR_TEXTO[classificarAtingimento(atingimento)];
}

/** Badge (fundo + texto) do percentual final de atingimento — mesma escala
 * de cor já usada em toda a tabela, só que como pílula em vez de texto
 * solto, pra ficar reconhecível num relance ao rolar a tabela verticalmente. */
const STATUS_COR_BADGE = {
  verde: 'bg-emerald-50 text-emerald-700',
  amarelo: 'bg-amber-50 text-amber-700',
  vermelho: 'bg-red-50 text-red-700',
};

function BadgeAtingimento({ atingimento }) {
  const status = atingimento === null ? null : classificarAtingimento(atingimento);
  return (
    <span
      className={`inline-flex min-w-[3.5rem] justify-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
        status ? STATUS_COR_BADGE[status] : 'text-slate-400'
      }`}
    >
      {formatarPercentual(atingimento)}
    </span>
  );
}

/**
 * Largura fixa da primeira coluna (rótulos de indicador), aplicada em toda
 * célula sticky dela. Sem isso, o navegador redistribui a largura das
 * colunas conforme o conteúdo total da tabela — ligar "mostrar semanas"
 * fazia essa coluna encolher porque as novas colunas de semana disputavam
 * espaço com ela. Fixando a largura, só as colunas novas são adicionadas;
 * as existentes não se movem.
 */
const LARGURA_COLUNA_INDICADOR = 'w-44 min-w-[11rem] max-w-[11rem]';

/** Larguras de coluna de semana: expandida (dado visível) e recolhida (só o indicador +/-). */
const LARGURA_SEMANA_EXPANDIDA = 'min-w-[3rem] px-2';
const LARGURA_SEMANA_COLAPSADA = 'w-6 min-w-[1.5rem] max-w-[1.5rem] px-0';

/**
 * Tabela de indicadores de uma cidade: Base Ativa, meta do indicador x
 * realizado por mês (a meta aqui é a Meta do Indicador — `metaIndicador`,
 * hoje sempre "—" até existir fonte própria; NÃO a Meta Geral da Cidade
 * usada no Ranking/score — ver aplicarMetaInstalacaoFtth em
 * cidadeService.js), resultado semanal (dividido nas semanas reais do
 * calendário, com colunas agrupáveis ao estilo Google Sheets) e feriados
 * do mês. Componente único reutilizado por todas as telas que mostram
 * indicadores de cidade (PaginaCidade e PaginaPlano).
 *
 * Abaixo de `md`: lista de acordeões (ListaIndicadoresMobile).
 * A partir de `md`: tabela completa.
 */
export default function TabelaIndicadores({ indicadores, baseAtiva, cidade }) {
  const { mostrarSemanas, alternarSemanas, janelaHistorico, setJanelaHistorico, indicesVisiveis, indiceMesAtual } =
    useControlesTabela();
  const { semanaColapsada, alternarSemana, mesEstaTotalmenteColapsado, alternarMes } = useColapsoSemanas();

  // Quantidade de semanas por mês varia com o calendário (4 ou 5) — recalculado
  // só quando a janela de histórico muda, não a cada alternância de semanas.
  const semanasPorMesVisivel = useMemo(
    () => indicesVisiveis.map((i) => semanasDoMes(ANO_PAINEL, i)),
    [indicesVisiveis],
  );

  // Estado vazio: acontece com cidade recém-cadastrada, sem indicadores
  // configurados ainda. Sem isso a tabela renderizava só o cabeçalho, sem
  // dizer se é falta de dado ou erro de carregamento.
  if (!baseAtiva && indicadores.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
        <Inbox className="size-8 text-slate-300" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-600">Nenhum indicador configurado para esta cidade.</p>
        <p className="max-w-sm text-xs text-slate-400">
          Assim que metas forem cadastradas para esta cidade, elas aparecem aqui automaticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ControlesTabelaIndicadores
        mostrarSemanas={mostrarSemanas}
        alternarSemanas={alternarSemanas}
        janelaHistorico={janelaHistorico}
        aoMudarJanela={setJanelaHistorico}
      />

      <ListaIndicadoresMobile
        indicadores={indicadores}
        baseAtiva={baseAtiva}
        cidade={cidade}
        indicesVisiveis={indicesVisiveis}
        mostrarSemanas={mostrarSemanas}
        indiceMesAtual={indiceMesAtual}
        className="md:hidden"
      />

      <div className="hidden overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block md:max-h-[70vh]">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 z-20">
            <tr className="bg-brand-900 text-white">
              <th
                rowSpan={mostrarSemanas ? 2 : 1}
                className={`sticky left-0 z-40 border-r border-white/15 bg-brand-900 px-3 py-2 text-left align-bottom font-semibold ${LARGURA_COLUNA_INDICADOR}`}
              >
                Indicador
              </th>
              {indicesVisiveis.map((i, pos) => (
                <CabecalhoMes
                  key={MESES[i]}
                  cidade={cidade}
                  mesIndice={i}
                  rotulo={MESES[i]}
                  emDestaque={i === indiceMesAtual}
                  mostrarSemanas={mostrarSemanas}
                  semanas={semanasPorMesVisivel[pos]}
                  mesEstaTotalmenteColapsado={mesEstaTotalmenteColapsado}
                  alternarMes={alternarMes}
                />
              ))}
              <th rowSpan={mostrarSemanas ? 2 : 1} className="px-3 py-2 text-right align-bottom font-semibold">
                Atingimento
              </th>
            </tr>
            {mostrarSemanas && (
              <tr className="bg-brand-800 text-[10px] uppercase tracking-wide text-white/70">
                {indicesVisiveis.map((i, pos) => (
                  <SubcabecalhoSemanas
                    key={MESES[i]}
                    mesIndice={i}
                    semanas={semanasPorMesVisivel[pos]}
                    semanaColapsada={semanaColapsada}
                    alternarSemana={alternarSemana}
                  />
                ))}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {baseAtiva && (
              <LinhaBaseAtiva
                baseAtiva={baseAtiva}
                indicesVisiveis={indicesVisiveis}
                semanasPorMesVisivel={semanasPorMesVisivel}
                mostrarSemanas={mostrarSemanas}
                indiceMesAtual={indiceMesAtual}
                semanaColapsada={semanaColapsada}
              />
            )}
            {indicadores.map((indicador) => (
              <FragmentoIndicador
                key={indicador.id}
                indicador={indicador}
                atingimento={atingimentoIndicador(indicador, 'metaIndicador')}
                indicesVisiveis={indicesVisiveis}
                mostrarSemanas={mostrarSemanas}
                indiceMesAtual={indiceMesAtual}
                semanaColapsada={semanaColapsada}
              />
            ))}
          </tbody>
        </table>
        <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
          Linha superior: meta do indicador (— = ainda não cadastrada) · Linha inferior: realizado
          (— = mês não apurado). As semanas seguem o calendário do próprio mês (4 ou 5, conforme a
          quantidade de dias) e cada coluna pode ser recolhida individualmente.{' '}
          <span className="italic text-amber-600">≈ = projeção</span> (dia ainda não confirmado na base de
          dias úteis; some quando a base atualizar).
        </p>
      </div>
    </div>
  );
}

function CabecalhoMes({
  cidade,
  mesIndice,
  rotulo,
  emDestaque,
  mostrarSemanas,
  semanas,
  mesEstaTotalmenteColapsado,
  alternarMes,
}) {
  const colSpan = 1 + (mostrarSemanas ? semanas.length : 0);
  const colapsado = mostrarSemanas && mesEstaTotalmenteColapsado(mesIndice, semanas);

  return (
    <th
      colSpan={colSpan}
      className={`border-l border-white/10 px-2 py-2 text-right align-bottom font-semibold ${
        emDestaque ? 'bg-brand-700' : ''
      }`}
    >
      <span className="inline-flex items-center justify-end gap-1">
        {mostrarSemanas && (
          <button
            type="button"
            onClick={() => alternarMes(mesIndice, semanas)}
            aria-expanded={!colapsado}
            aria-label={`${colapsado ? 'Expandir' : 'Recolher'} semanas de ${rotulo}`}
            title={`${colapsado ? 'Expandir' : 'Recolher'} semanas de ${rotulo}`}
            className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-white/10"
          >
            {colapsado ? (
              <ChevronRight className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            )}
          </button>
        )}
        {rotulo}
        <FeriadosMes cidade={cidade} ano={ANO_PAINEL} mesIndice={mesIndice} />
      </span>
    </th>
  );
}

function SubcabecalhoSemanas({ mesIndice, semanas, semanaColapsada, alternarSemana }) {
  return (
    <>
      {/* Célula de alinhamento sob a coluna de valor mensal: sem rótulo —
          o nome do mês já está no cabeçalho de cima, repeti-lo aqui era
          redundante. */}
      <th className="min-w-[3.5rem] border-l border-white/10 px-2 py-1" aria-hidden="true" />
      {semanas.map((semana) => {
        const colapsada = semanaColapsada(mesIndice, semana.numero);
        return (
          <th
            key={semana.numero}
            className={`select-none py-1 text-right font-medium transition-[width,min-width,max-width] duration-200 ease-in-out ${
              colapsada ? LARGURA_SEMANA_COLAPSADA : LARGURA_SEMANA_EXPANDIDA
            }`}
          >
            <button
              type="button"
              onClick={() => alternarSemana(mesIndice, semana.numero)}
              aria-expanded={!colapsada}
              aria-label={`Semana ${semana.numero}, dias ${semana.diaInicio} a ${semana.diaFim} — clique para ${
                colapsada ? 'expandir' : 'recolher'
              }`}
              title={`Dias ${semana.diaInicio}–${semana.diaFim}`}
              className="flex min-h-[26px] w-full items-center justify-center gap-0.5 rounded px-0.5 hover:bg-white/10"
            >
              {colapsada ? (
                <span className="text-[11px] leading-none">+</span>
              ) : (
                <>
                  <span>{`S${semana.numero}`}</span>
                  <span className="text-white/40">−</span>
                </>
              )}
            </button>
          </th>
        );
      })}
    </>
  );
}

function CelulasMes({
  valorMensal,
  unidade,
  semanas,
  mostrarSemanas,
  classeValor = 'text-slate-500',
  emDestaque = false,
  mesIndice,
  semanaColapsada,
}) {
  return (
    <>
      <td
        className={`min-w-[3.5rem] border-l border-slate-100 px-2 py-1.5 text-right tabular-nums font-medium ${classeValor} ${
          emDestaque ? 'bg-brand-50/60' : ''
        }`}
      >
        {formatarValor(valorMensal, unidade)}
      </td>
      {mostrarSemanas &&
        semanas.map((semana) => {
          const colapsada = semanaColapsada(mesIndice, semana.numero);
          return (
            <td
              key={semana.numero}
              title={
                semana.projecao
                  ? 'Projeção: parte dos dias desta semana ainda não está confirmada na base de dias úteis (calculado por calendário — dia útil seg-sex, sábado meio período, feriados nacionais/estaduais). Some quando a base atualizar com o dado real.'
                  : undefined
              }
              className={`text-right tabular-nums transition-[width,min-width,max-width] duration-200 ease-in-out ${
                semana.projecao ? 'italic text-amber-600' : 'text-slate-400'
              } ${
                colapsada ? `${LARGURA_SEMANA_COLAPSADA} overflow-hidden py-1.5` : `${LARGURA_SEMANA_EXPANDIDA} py-1.5`
              }`}
            >
              {!colapsada && formatarValor(semana.valor, unidade)}
              {!colapsada && semana.projecao && <sup>≈</sup>}
            </td>
          );
        })}
    </>
  );
}

const LinhaBaseAtiva = memo(function LinhaBaseAtiva({
  baseAtiva,
  indicesVisiveis,
  semanasPorMesVisivel,
  mostrarSemanas,
  indiceMesAtual,
  semanaColapsada,
}) {
  return (
    <tr className="bg-brand-50/60">
      <td className={`sticky left-0 z-10 border-r border-slate-200 bg-brand-50 px-3 py-1.5 font-semibold text-slate-700 ${LARGURA_COLUNA_INDICADOR}`}>
        Base Ativa
      </td>
      {indicesVisiveis.map((i, pos) => (
        <CelulasMes
          key={i}
          mesIndice={i}
          valorMensal={baseAtiva[i]?.valor}
          semanas={semanasPorMesVisivel[pos]}
          mostrarSemanas={mostrarSemanas}
          classeValor="font-semibold text-slate-700"
          emDestaque={i === indiceMesAtual}
          semanaColapsada={semanaColapsada}
        />
      ))}
      <td className="px-3 py-1.5" />
    </tr>
  );
});

const FragmentoIndicador = memo(function FragmentoIndicador({
  indicador,
  atingimento,
  indicesVisiveis,
  mostrarSemanas,
  indiceMesAtual,
  semanaColapsada,
}) {
  return (
    <>
      <tr className="bg-slate-50">
        <td className={`sticky left-0 z-10 border-r border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700 ${LARGURA_COLUNA_INDICADOR}`}>
          {indicador.nome} <span className="font-normal text-slate-400">· meta</span>
        </td>
        {indicesVisiveis.map((i) => {
          const mes = indicador.meses[i];
          const semanasDaMeta = mes.semanasMetaIndicador ?? mes.semanas.map((s) => ({ ...s, valor: null }));
          return (
            <CelulasMes
              key={i}
              mesIndice={i}
              valorMensal={mes.metaIndicador}
              unidade={indicador.unidade}
              semanas={semanasDaMeta}
              mostrarSemanas={mostrarSemanas}
              emDestaque={i === indiceMesAtual}
              semanaColapsada={semanaColapsada}
            />
          );
        })}
        <td rowSpan={2} className="px-3 py-1.5 text-right align-middle">
          <BadgeAtingimento atingimento={atingimento} />
        </td>
      </tr>
      <tr>
        <td className={`sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-1.5 text-slate-500 ${LARGURA_COLUNA_INDICADOR}`}>realizado</td>
        {indicesVisiveis.map((i) => {
          const mes = indicador.meses[i];
          return (
            <CelulasMes
              key={i}
              mesIndice={i}
              valorMensal={mes.realizado}
              unidade={indicador.unidade}
              semanas={mes.semanas}
              mostrarSemanas={mostrarSemanas}
              classeValor={corCelula(indicador, mes)}
              emDestaque={i === indiceMesAtual}
              semanaColapsada={semanaColapsada}
            />
          );
        })}
      </tr>
    </>
  );
});