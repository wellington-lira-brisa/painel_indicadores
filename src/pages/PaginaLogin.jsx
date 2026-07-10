import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function PaginaLogin() {
  const { usuario, carregando, login } = useAuth();
  const navigate = useNavigate();
  const localizacao = useLocation();

  const [modoCriarConta, setModoCriarConta] = useState(false);
  const [matricula, setMatricula] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [codigoConvite, setCodigoConvite] = useState('');
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  if (!carregando && usuario) {
    return <Navigate to={localizacao.state?.de ?? '/'} replace />;
  }

  function alternarModo() {
    setModoCriarConta((atual) => !atual);
    setErro(null);
    setNome('');
    setCodigoConvite('');
  }

  async function aoEnviar(evento) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await login({
        matricula: matricula.trim(),
        senha,
        nome: modoCriarConta ? nome.trim() : '',
        codigoConvite: modoCriarConta ? codigoConvite.trim() : '',
      });
      navigate(localizacao.state?.de ?? '/', { replace: true });
    } catch (excecao) {
      setErro(excecao.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">FTTH</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">Painel de Metas e Resultados</h1>
          <p className="mt-1 text-sm text-slate-500">
            {modoCriarConta ? 'Crie sua conta com um código de convite' : 'Entre com sua matrícula para continuar'}
          </p>
        </div>

        <form onSubmit={aoEnviar} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="matricula" className="block text-sm font-medium text-slate-700">
              Matrícula do ponto
            </label>
            <input
              id="matricula"
              type="text"
              inputMode="numeric"
              autoComplete="username"
              required
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
              placeholder="Ex: 10234"
            />
          </div>

          <div>
            <label htmlFor="senha" className="block text-sm font-medium text-slate-700">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              autoComplete={modoCriarConta ? 'new-password' : 'current-password'}
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
              placeholder="••••••••"
            />
          </div>

          {modoCriarConta && (
            <>
              <div>
                <label htmlFor="nome" className="block text-sm font-medium text-slate-700">
                  Nome completo
                </label>
                <input
                  id="nome"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={120}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                />
              </div>

              <div>
                <label htmlFor="codigoConvite" className="block text-sm font-medium text-slate-700">
                  Código de convite
                </label>
                <input
                  id="codigoConvite"
                  type="text"
                  autoComplete="off"
                  required
                  value={codigoConvite}
                  onChange={(e) => setCodigoConvite(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700"
                />
              </div>
            </>
          )}

          {erro && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-brand-700 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
          >
            {modoCriarConta ? (
              <UserPlus className="size-4" aria-hidden="true" />
            ) : (
              <LogIn className="size-4" aria-hidden="true" />
            )}
            {enviando ? 'Enviando…' : modoCriarConta ? 'Criar conta' : 'Entrar'}
          </button>
        </form>

        <button
          type="button"
          onClick={alternarModo}
          className="mt-4 w-full text-center text-sm font-medium text-brand-700 hover:underline"
        >
          {modoCriarConta ? 'Já tem conta? Entrar' : 'Primeiro acesso? Criar conta com convite'}
        </button>
      </div>
    </div>
  );
}