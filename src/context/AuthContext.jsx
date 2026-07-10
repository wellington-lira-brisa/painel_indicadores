import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authService from '../services/authService';
import { temPermissao } from '../services/permissaoService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;

    authService.sessaoAtual().then((usuarioSessao) => {
      if (!cancelado) {
        setUsuario(usuarioSessao);
        setCarregando(false);
      }
    });

    // Sincroniza logout feito em outra aba (mesmo navegador).
    const pararDeOuvir = authService.ouvirLogoutExterno(() => setUsuario(null));

    return () => {
      cancelado = true;
      pararDeOuvir();
    };
  }, []);

  const login = useCallback(async (dados) => {
    const usuarioAutenticado = await authService.login(dados);
    setUsuario(usuarioAutenticado);
    return usuarioAutenticado;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUsuario(null);
  }, []);

  const valor = useMemo(
    () => ({
      usuario,
      carregando,
      login,
      logout,
      temPermissao: (permissao) => temPermissao(usuario, permissao),
    }),
    [usuario, carregando, login, logout],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider.');
  }
  return contexto;
}