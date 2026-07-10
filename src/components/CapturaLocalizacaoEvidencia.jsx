import { Loader2, MapPin, MapPinned, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PERMISSOES } from '../services/permissaoService';
import { formatarDataHora } from '../utils/format';

/**
 * Captura da localização do dispositivo no momento em que as evidências são
 * anexadas — uma única captura para o lote inteiro (não por imagem, ver
 * `criar_plano_com_evidencias` na migration 20260709130000).
 *
 * `aoCapturar` é opcional: quando ausente, o bloco vira somente leitura
 * (sem botão) — usado na visualização de um plano já salvo, onde não faz
 * sentido recapturar.
 */
export default function CapturaLocalizacaoEvidencia({ localizacao, status = 'ocioso', erro, aoCapturar, obrigatoria = false }) {
  const { temPermissao } = useAuth();
  const podeVerDadosSensiveis = temPermissao(PERMISSOES.VISUALIZAR_DADOS_SENSIVEIS);
  const faltando = obrigatoria && !localizacao;

  return (
    <div className={`rounded-xl border p-4 ${faltando ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-700">
            Localização da evidência
            {obrigatoria && <span className="text-red-600"> *</span>}
          </p>
          {faltando && (
            <p className="mt-0.5 text-xs text-amber-700">
              Obrigatória: capture a localização antes de salvar, já que há evidências anexadas.
            </p>
          )}
        </div>

        {aoCapturar && status !== 'sucesso' && (
          <button
            type="button"
            onClick={aoCapturar}
            disabled={status === 'capturando'}
            className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === 'capturando' ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <MapPinned className="size-3.5" aria-hidden="true" />
            )}
            {status === 'capturando' ? 'Obtendo localização…' : 'Capturar localização'}
          </button>
        )}
      </div>

      {localizacao && (
        <div className="mt-2 flex items-start justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2">
          <p className="text-sm text-emerald-900">
            {podeVerDadosSensiveis ? (
              <>
                <span className="inline-flex items-center gap-1 font-medium">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  {localizacao.endereco ?? `${localizacao.latitude.toFixed(5)}, ${localizacao.longitude.toFixed(5)}`}
                </span>
                {localizacao.precisaoMetros != null && (
                  <span className="mt-0.5 block text-xs text-emerald-700">
                    Precisão de ±{Math.round(localizacao.precisaoMetros)} m · {formatarDataHora(localizacao.capturadaEm)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-emerald-800">
                Localização capturada · <span className="text-emerald-700">Restrito (permissão necessária)</span>
              </span>
            )}
          </p>
          {aoCapturar && (
            <button
              type="button"
              onClick={aoCapturar}
              className="flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Capturar novamente
            </button>
          )}
        </div>
      )}

      {status === 'erro' && erro && (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {erro}
        </p>
      )}
    </div>
  );
}