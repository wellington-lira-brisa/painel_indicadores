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
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${QUINTIL_COR_BADGE[registro.quintilCidade]}`}
      title={`Média de atingimento dos vendedores: ${Math.round(registro.atingimentoMedio * 100)}% · ${registro.totalVendedores} vendedor(es)`}
    >
      {rotulos[registro.quintilCidade]}
    </span>
  );
}