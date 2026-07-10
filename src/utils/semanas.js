/**
 * Divide um mês em semanas de calendário (Semana 1..4, e 5 quando o mês tem
 * dias o suficiente). Cálculo puro e dinâmico: depende só de `ano` e do
 * índice do mês (0 = janeiro), então funciona para qualquer ano sem
 * precisar de tabela ou configuração manual.
 *
 * Regra: dias 1-7 = Semana 1, 8-14 = Semana 2, ..., a última semana fecha
 * no último dia do mês (pode ter menos de 7 dias).
 */
export function semanasDoMes(ano, mesIndice) {
  const diasNoMes = new Date(ano, mesIndice + 1, 0).getDate();
  const quantidadeDeSemanas = Math.ceil(diasNoMes / 7);

  return Array.from({ length: quantidadeDeSemanas }, (_, i) => {
    const diaInicio = i * 7 + 1;
    const diaFim = Math.min(diaInicio + 6, diasNoMes);
    return { numero: i + 1, diaInicio, diaFim };
  });
}