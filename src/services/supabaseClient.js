import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar definidas (arquivo .env na raiz do projeto).',
  );
}

/**
 * Cliente único do Supabase para todo o app. A chave anon é pública por
 * design (fica no bundle do front) — a segurança real está nas policies
 * de RLS no banco, não em esconder esta chave.
 */
export const supabase = createClient(url, anonKey);
