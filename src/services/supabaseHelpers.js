/**
 * Lança Error com mensagem amigável se `error` existir. Centraliza o
 * padrão repetido em todo service que chama Supabase — muda em um lugar
 * só se o tratamento precisar evoluir (ex.: log estruturado, Sentry).
 */
export function tratarErro(error, mensagem) {
  if (error) throw new Error(mensagem);
}