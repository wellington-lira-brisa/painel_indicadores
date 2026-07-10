import { Eye, EyeOff } from 'lucide-react';
import { JANELAS_HISTORICO } from '../utils/tabelaIndicadores';

const OPCOES_HISTORICO = [
  { valor: JANELAS_HISTORICO.ATUAL, rotulo: 'Mês atual' },
  { valor: JANELAS_HISTORICO.ULTIMOS_3, rotulo: 'Últimos 3 meses' },
  { valor: JANELAS_HISTORICO.TODOS, rotulo: 'Todos os meses' },
];

/**
 * Controles de exibição da tabela de indicadores: alternar colunas
 * semanais e limitar quantos meses aparecem. Ação é só de renderização,
 * instantânea, sem nova consulta ao banco.
 */
export default function ControlesTabelaIndicadores({
  mostrarSemanas,
  alternarSemanas,
  janelaHistorico,
  aoMudarJanela,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={alternarSemanas}
        aria-pressed={mostrarSemanas}
        className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        {mostrarSemanas ? (
          <EyeOff className="size-3.5" aria-hidden="true" />
        ) : (
          <Eye className="size-3.5" aria-hidden="true" />
        )}
        {mostrarSemanas ? 'Ocultar semanas' : 'Mostrar semanas'}
      </button>

      <div className="flex overflow-hidden rounded-lg border border-slate-300" role="group" aria-label="Histórico de meses">
        {OPCOES_HISTORICO.map((opcao) => (
          <button
            key={opcao.valor}
            type="button"
            onClick={() => aoMudarJanela(opcao.valor)}
            aria-pressed={janelaHistorico === opcao.valor}
            className={`min-h-[36px] px-3 text-xs font-semibold ${
              janelaHistorico === opcao.valor
                ? 'bg-brand-700 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {opcao.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}