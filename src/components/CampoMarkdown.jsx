import MDEditor, { commands } from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';
import '../styles/editor-markdown.css';

const COMANDOS = [
  commands.title,
  commands.bold,
  commands.italic,
  commands.quote,
  commands.link,
  commands.code,
  commands.codeBlock,
  commands.unorderedListCommand,
  commands.orderedListCommand,
  commands.checkedListCommand,
  commands.table,
  commands.divider,
  commands.fullscreen,
];

// Toolbar reduzida pra uso compacto (campos curtos de formulário) — menos
// botões renderizados por instância quando várias aparecem na mesma tela.
const COMANDOS_COMPACTOS = [commands.bold, commands.italic, commands.unorderedListCommand];

/**
 * Campo de texto com formatação Markdown (negrito, listas, tabelas, etc.).
 * Controlado — todo o estado vive no formulário que o usa. Salva Markdown
 * puro; a renderização segura fica a cargo de <VisualizadorMarkdown>.
 *
 * Pesado (~150kb+ com CodeMirror, compartilhado entre instâncias após o
 * primeiro import). Importe via React.lazy no ponto de uso.
 *
 * `compacto`: toolbar reduzida e altura menor — para campos curtos de
 * formulário (ex.: "O quê", "Quem") onde o editor completo é over-kill e
 * várias instâncias montadas juntas pesam mais na tela, especialmente
 * no mobile.
 */
export default function CampoMarkdown({
  rotulo,
  nome,
  valor,
  aoAlterar,
  placeholder = 'Digite o conteúdo...',
  obrigatorio = false,
  desabilitado = false,
  erro,
  dica,
  limiteCaracteres = 8000,
  alturaMinima = 260,
  compacto = false,
}) {
  const valorAtual = typeof valor === 'string' ? valor : '';
  const altura = compacto ? Math.min(alturaMinima, 120) : alturaMinima;

  function aoMudar(proximoValor = '') {
    aoAlterar(proximoValor.slice(0, limiteCaracteres));
  }

  return (
    <div className="w-full min-w-0" data-color-mode="light">
      {rotulo && (
        <label htmlFor={nome} className="block text-sm font-medium text-slate-700">
          {rotulo}
          {obrigatorio && <span className="text-red-600"> *</span>}
        </label>
      )}

      <div
        className={`mt-1 min-w-0 overflow-hidden rounded-lg border ${
          erro
            ? 'border-red-400 ring-1 ring-red-400'
            : 'border-slate-300 focus-within:border-brand-700 focus-within:ring-1 focus-within:ring-brand-700'
        } ${desabilitado ? 'opacity-60' : ''}`}
      >
        <MDEditor
          value={valorAtual}
          onChange={aoMudar}
          height={altura}
          preview="edit"
          visibleDragbar={false}
          extraCommands={[]}
          textareaProps={{
            id: nome,
            name: nome,
            required: obrigatorio,
            disabled: desabilitado,
            maxLength: limiteCaracteres,
            placeholder,
            'aria-invalid': Boolean(erro),
          }}
          commands={compacto ? COMANDOS_COMPACTOS : COMANDOS}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
        <p className={erro ? 'text-red-600' : 'text-slate-500'}>
          {erro || dica || 'Use negrito, listas e tabelas pra deixar o plano mais claro.'}
        </p>
        <span
          className={`shrink-0 tabular-nums ${
            valorAtual.length >= limiteCaracteres ? 'text-red-600' : 'text-slate-400'
          }`}
        >
          {valorAtual.length}/{limiteCaracteres}
        </span>
      </div>
    </div>
  );
}