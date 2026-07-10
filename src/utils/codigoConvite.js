// Sem 0/O/1/I — evita ambiguidade visual ao digitar o código manualmente.
const CARACTERES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function gerarCodigoConvite(tamanho = 8) {
  let codigo = '';
  for (let i = 0; i < tamanho; i++) {
    codigo += CARACTERES[Math.floor(Math.random() * CARACTERES.length)];
  }
  return codigo;
}