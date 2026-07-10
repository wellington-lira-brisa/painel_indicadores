import { supabase } from './supabaseClient';
import { tratarErro } from './supabaseHelpers';

/**
 * Retorna um mapa { [cidadeId]: boolean } com o status de venda de FWA de
 * todas as cidades cadastradas. Cidade ausente no mapa = não vende FWA
 * (nunca foi configurada).
 */
export async function listarStatusFwa() {
  const { data, error } = await supabase.from('cidades_fwa').select('cidade_id, vende_fwa');

  tratarErro(error, 'Não foi possível carregar o status de venda de FWA.');
  return Object.fromEntries(data.map((linha) => [linha.cidade_id, linha.vende_fwa]));
}

/**
 * Cria ou atualiza o status de FWA de uma cidade. Protegido por RLS:
 * exige a permissão gerenciar_fwa — front nunca decide sozinho.
 */
export async function atualizarVendeFwa(cidadeId, vendeFwa, atualizadoPorId) {
  if (!cidadeId) throw new Error('Cidade é obrigatória.');

  const { data, error } = await supabase
    .from('cidades_fwa')
    .upsert(
      {
        cidade_id: cidadeId,
        vende_fwa: vendeFwa,
        atualizado_por: atualizadoPorId,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'cidade_id' },
    )
    .select('cidade_id, vende_fwa')
    .single();

  tratarErro(error, 'Não foi possível salvar o status de venda de FWA desta cidade.');
  return data;
}