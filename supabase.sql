-- =============================================================================
-- supabase.sql — Tabela de PEDIDOS (extra) no [SUPABASE] / PostgreSQL
-- Onde usar: Supabase > SQL Editor > New query > colar > Run.
-- Usada pela rota POST /api/pedidos do server.js (somente se SUPABASE_SERVICE_ROLE_KEY estiver no .env).
-- =============================================================================
-- Histórico dos pedidos gerados quando o cliente clica em "Comprar pelo WhatsApp".
create table if not exists public.pedidos (
  -- Identificador automático do pedido.
  id          bigint generated always as identity primary key,
  -- Itens do pedido em JSON: [{id, nome, preco, quantidade}].
  itens       jsonb         not null,           
  -- Valor total calculado pelo servidor.
  total       numeric(12,2) not null,
  -- Data e hora do pedido (preenchida automaticamente).
  criado_em   timestamptz   not null default now()
);

-- Segurança (RLS): ligado e SEM políticas, ninguém acessa pela chave pública.
-- Só o servidor, com a chave secreta (service role), consegue gravar e ler.
alter table public.pedidos enable row level security;
