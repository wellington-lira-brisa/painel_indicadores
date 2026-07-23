import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { mesesConsecutivosAte, tendenciaEntreQuintis } from '../utils/historicoQuintil';
import { QUINTIL_COR_BADGE, QUINTIL_ROTULOS_CURTOS, QUINTIL_ROTULOS } from '../utils/quintil';

/**
 * Chip do quintil da cidade (Q1..Q5, escala verde→vermelho). `registro`
 * é o objeto de quintilService (ou null — cidade sem dado exibe "—" no
 * mesmo espaço, nunca some da coluna). `curto` = "Q1"; padrão = "1º Quintil".
 */
export default function BadgeQuintil({ registro, curto = false }) {
  if (!registro?.quintilCidade) {
    return <span className="text-slate-400">—</span>;
  }

  const rotulos = curto ? QUINTIL_ROTULOS_CURTOS : QUINTIL_ROTULOS;
  const meses = mesesConsecutivosAte(registro.mesRef, 2);
  const porMes = new Map((registro.historico ?? []).map((item) => [item.mesRef, item]));
  const quintilAnterior = porMes.get(meses[0])?.quintilCidade;
  const tendencia = tendenciaEntreQuintis(quintilAnterior, registro.quintilCidade);
  const configTendencia = {
    melhorou: { Icone: ArrowUpRight, classe: 'text-emerald-600', texto: `Melhorou desde Q${quintilAnterior}` },
    estavel: { Icone: ArrowRight, classe: 'text-slate-400', texto: `Permaneceu no Q${registro.quintilCidade}` },
    caiu: { Icone: ArrowDownRight, classe: 'text-red-500', texto: `Caiu desde Q${quintilAnterior}` },
  }[tendencia.tipo];

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${QUINTIL_COR_BADGE[registro.quintilCidade]}`}
        title={`Média de atingimento dos vendedores: ${Math.round(registro.atingimentoMedio * 100)}% · ${registro.totalVendedores} vendedor(es)`}
      >
        {rotulos[registro.quintilCidade]}
      </span>
      {configTendencia && (
        <span className={configTendencia.classe} title={configTendencia.texto} aria-label={configTendencia.texto}>
          <configTendencia.Icone className="size-3.5" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}