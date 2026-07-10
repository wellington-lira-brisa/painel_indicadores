/**
 * Linha "rótulo: valor" usada em painéis de detalhe (conta, admin,
 * metadados de imagem). Aceita `valor` (texto simples) ou `children`
 * (conteúdo composto, ex.: ícone + coordenadas). Por padrão trunca o valor
 * numa linha só; `quebrarLinha` desliga isso pra valores longos que
 * precisam ficar legíveis por completo (ex.: um endereço).
 */
export default function LinhaInfo({ rotulo, valor, children, corValor, quebrarLinha = false }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 text-slate-500">{rotulo}</dt>
      <dd
        className={`min-w-0 flex-1 text-right font-medium ${quebrarLinha ? 'break-words' : 'truncate'} ${
          corValor ?? 'text-slate-800'
        }`}
      >
        {children ?? valor}
      </dd>
    </div>
  );
}