import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import '../styles/visualizador-markdown.css';

/**
 * O schema padrão do rehype-sanitize remove o atributo `checked` de <input>
 * e `alt` de <img> — verificado em node_modules (rehype-sanitize@6.0.0).
 * Sem isso, checklists do GFM (`- [x] tarefa`) sempre apareceriam
 * desmarcadas, e imagens perderiam texto alternativo.
 */
const ESQUEMA_SANITIZACAO = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    input: [...(defaultSchema.attributes.input ?? []), 'checked'],
    img: [...(defaultSchema.attributes.img ?? []), 'alt'],
  },
};

/**
 * react-markdown 10.x não passa mais a prop `inline` pro componente `code`
 * (removida desde a v8) — a distinção bloco/inline oficial recomendada é
 * checar se o conteúdo tem quebra de linha.
 */
function Code({ className, children, ...props }) {
  const textoBruto = String(children);
  if (textoBruto.includes('\n')) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }
  return (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700" {...props}>
      {children}
    </code>
  );
}

/**
 * Exibe Markdown salvo no banco como HTML seguro. Nunca renderiza HTML cru
 * do conteúdo — só o que passa por remark-gfm + rehype-sanitize.
 *
 * Importante: não usamos trim() no conteúdo renderizado. A validação usa
 * trim() apenas para saber se existe texto, mas o Markdown é exibido com
 * as quebras de linha e espaços que o usuário digitou no editor.
 */
export default function VisualizadorMarkdown({ valor, textoVazio = 'Sem descrição informada.' }) {
  const conteudo = String(valor ?? '').replace(/\r\n/g, '\n');

  if (!conteudo.trim()) {
    return <p className="text-sm text-slate-500">{textoVazio}</p>;
  }

  return (
    <div className="visualizador-markdown text-sm leading-7 text-slate-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, ESQUEMA_SANITIZACAO]]}
        components={{
          a: (props) => (
            <a
              {...props}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900"
            />
          ),
          p: (props) => <p {...props} className="my-2 break-words" />,
          h1: (props) => (
            <h1 {...props} className="mb-3 mt-5 break-words text-xl font-bold text-slate-900 first:mt-0" />
          ),
          h2: (props) => (
            <h2 {...props} className="mb-2 mt-4 break-words text-lg font-bold text-slate-900 first:mt-0" />
          ),
          h3: (props) => (
            <h3 {...props} className="mb-2 mt-4 break-words text-base font-bold text-slate-900 first:mt-0" />
          ),
          h4: (props) => (
            <h4 {...props} className="mb-1.5 mt-3 break-words text-sm font-bold text-slate-900 first:mt-0" />
          ),
          h5: (props) => (
            <h5 {...props} className="mb-1.5 mt-3 break-words text-sm font-semibold text-slate-900 first:mt-0" />
          ),
          h6: (props) => (
            <h6 {...props} className="mb-1.5 mt-3 break-words text-sm font-semibold text-slate-600 first:mt-0" />
          ),
          ul: (props) => <ul {...props} className="my-2 list-disc space-y-1 pl-5" />,
          ol: (props) => <ol {...props} className="my-2 list-decimal space-y-1 pl-5" />,
          li: (props) => <li {...props} className="break-words" />,
          blockquote: (props) => (
            <blockquote
              {...props}
              className="my-3 border-l-4 border-slate-300 pl-4 text-slate-600"
            />
          ),
          pre: (props) => <pre {...props} className="overflow-x-auto rounded-lg bg-slate-100 p-3" />,
          code: Code,
          table: (props) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-slate-200">
              <table {...props} className="min-w-full divide-y divide-slate-200 text-sm" />
            </div>
          ),
          th: (props) => (
            <th {...props} className="bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700" />
          ),
          td: (props) => <td {...props} className="border-t border-slate-100 px-3 py-2" />,
        }}
      >
        {conteudo}
      </ReactMarkdown>
    </div>
  );
}