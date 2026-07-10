import { memo } from 'react';
import { AlertTriangle, CheckCircle2, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PERMISSOES } from '../services/permissaoService';
import { formatarDataHora, formatarBytes } from '../utils/format';
import LinhaInfo from './LinhaInfo';

function Secao({ titulo, children }) {
  return (
    <div className="border-b border-slate-100 px-4 py-4 last:border-b-0 sm:px-5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{titulo}</h4>
      <dl className="mt-2 divide-y divide-slate-100">{children}</dl>
    </div>
  );
}

/**
 * Painel de metadados de UMA evidência, organizado em seções (Arquivo /
 * Origem da foto / Evidência). Somente leitura — todo dado já chega pronto
 * via props, nada é buscado aqui (abrir ou trocar de imagem no lightbox
 * nunca dispara consulta).
 *
 * `localizacaoCapturada`, `criadoPor`, `criadoEm`, `nomeArquivo` são
 * opcionais e vêm do PLANO (não da imagem individual) — o mesmo valor é
 * passado pra cada evidência do lote, já que representam "quem/quando/onde
 * anexou", não algo específico de um arquivo.
 */
function PainelMetadadosImagem({ metadados, nomeArquivo, criadoEm, criadoPor, localizacaoCapturada = null }) {
  const { temPermissao } = useAuth();
  const podeVerDadosSensiveis = temPermissao(PERMISSOES.VISUALIZAR_DADOS_SENSIVEIS);

  if (!metadados) return null;

  return (
    <div>
      <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
        <h3 className="truncate text-sm font-semibold text-slate-800" title={nomeArquivo ?? metadados.nomeOriginal}>
          {nomeArquivo ?? metadados.nomeOriginal}
        </h3>
        {metadados.possuiExif ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            EXIF original encontrado
          </p>
        ) : (
          <p className="mt-2 inline-flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Sem EXIF — origem da foto não confirmada.
          </p>
        )}
      </div>

      <Secao titulo="Evidência">
        <LinhaInfo rotulo="Enviado em">{criadoEm ? formatarDataHora(criadoEm) : '—'}</LinhaInfo>
        <LinhaInfo rotulo="Colaborador">{criadoPor?.nome ?? '—'}</LinhaInfo>
        <LinhaInfo rotulo="Localização capturada" quebrarLinha>
          {!localizacaoCapturada ? (
            '—'
          ) : podeVerDadosSensiveis ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              {localizacaoCapturada.endereco ??
                `${localizacaoCapturada.latitude.toFixed(5)}, ${localizacaoCapturada.longitude.toFixed(5)}`}
            </span>
          ) : (
            <span className="text-slate-400">Restrito</span>
          )}
        </LinhaInfo>
      </Secao>

      <Secao titulo="Arquivo">
        <LinhaInfo rotulo="Tamanho original">{formatarBytes(metadados.tamanhoOriginalBytes)}</LinhaInfo>
        <LinhaInfo rotulo="Após compressão">{formatarBytes(metadados.tamanhoFinalBytes)}</LinhaInfo>
        <LinhaInfo rotulo="Dimensões">
          {metadados.larguraFinal && metadados.alturaFinal
            ? `${metadados.larguraFinal} × ${metadados.alturaFinal} px`
            : '—'}
        </LinhaInfo>
        <LinhaInfo rotulo="Tipo">{metadados.tipoMimeFinal ?? '—'}</LinhaInfo>
      </Secao>

      <Secao titulo="Origem da foto (EXIF)">
        <LinhaInfo rotulo="Data da captura">{formatarDataHora(metadados.dataCaptura)}</LinhaInfo>
        <LinhaInfo rotulo="Dispositivo">{metadados.dispositivo ?? '—'}</LinhaInfo>
        <LinhaInfo rotulo="Software">{metadados.software ?? '—'}</LinhaInfo>
        <LinhaInfo rotulo="Localização" quebrarLinha>
          {!metadados.localizacao ? (
            '—'
          ) : podeVerDadosSensiveis ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              {metadados.localizacao.latitude.toFixed(5)}, {metadados.localizacao.longitude.toFixed(5)}
            </span>
          ) : (
            <span className="text-slate-400">Restrito</span>
          )}
        </LinhaInfo>
      </Secao>

      {metadados.exifBruto && (
        <details className="px-4 py-3 sm:px-5">
          <summary className="cursor-pointer text-xs font-medium text-brand-700">
            Ver campos EXIF completos
          </summary>
          <dl className="mt-2 rounded-lg bg-slate-50 p-3">
            {Object.entries(metadados.exifBruto).map(([campo, valor]) => (
              <div key={campo} className="flex justify-between gap-4 py-0.5 text-xs">
                <dt className="shrink-0 font-mono text-slate-500">{campo}</dt>
                <dd className="min-w-0 flex-1 break-words text-right text-slate-700">{String(valor)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

export default memo(PainelMetadadosImagem);