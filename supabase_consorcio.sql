-- =============================================================================
-- supabase_consorcio.sql — Tabela de PLANOS DE CONSÓRCIO no [SUPABASE] / PostgreSQL
-- Onde usar: Supabase > SQL Editor > New query > colar > Run.
-- Usada por: GET/POST/DELETE /api/consorcio (server.js) e pelo modal de consórcio do catálogo.
-- O servidor também lê o valor_credito para definir o preço exibido de cada produto.
-- =============================================================================
-- Cada linha é um plano de consórcio de um produto.
create table if not exists public.planos_consorcio (
  -- Identificador automático do plano (define a ordem de cadastro).
  id             bigint generated always as identity primary key,
  -- Slug do produto no MongoDB (neos, fluo, nmax...). É o elo entre o MongoDB e o Supabase.
  id_moto        text not null,   
  -- Valor do crédito, como texto formatado. Ex.: "R$ 15.000,00".
  valor_credito  text not null,   
  -- Quantidade de parcelas, como texto. Ex.: "72x" (aparece como QUANTIDADE no modal).
  prazo          text not null,   
  -- Valor de cada parcela, como texto formatado. Ex.: "R$ 299,90".
  valor_parcela  text not null    
);

-- Segurança (RLS) ligada: sem política, ninguém acessa. As políticas abaixo liberam só o necessário.
alter table public.planos_consorcio enable row level security;

-- Remove as políticas antigas (se existirem) para o script poder ser executado de novo sem erro.
drop policy if exists "leitura publica" on public.planos_consorcio;
drop policy if exists "admin insere"    on public.planos_consorcio;
drop policy if exists "admin exclui"    on public.planos_consorcio;

-- Qualquer visitante (anon) e usuário logado pode LER os planos (o catálogo é público).
create policy "leitura publica" on public.planos_consorcio for select to anon, authenticated using (true);
-- Só usuário autenticado (o administrador, pois o cadastro público está desligado) pode INSERIR.
create policy "admin insere"    on public.planos_consorcio for insert to authenticated with check (true);
-- Só usuário autenticado pode EXCLUIR.
create policy "admin exclui"    on public.planos_consorcio for delete to authenticated using (true);

-- Permissões de acesso à tabela (além das políticas): leitura para todos e inserir/excluir só para autenticados.
grant select on public.planos_consorcio to anon, authenticated;
grant insert, delete on public.planos_consorcio to authenticated;
