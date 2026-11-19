// Carrega o .env (SUPABASE_URL e SUPABASE_ANON_KEY).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
// [SUPABASE] cliente do Supabase.
const { createClient } = require('@supabase/supabase-js');

// Coloca um valor entre aspas simples para o SQL, duplicando aspas simples internas (ex.: D'Água -> D''Água).
const q = (v) => "'" + String(v ?? '').trim().replace(/'/g, "''") + "'";

// Transforma a lista de planos em texto SQL: apaga a tabela e insere tudo, em blocos de 50 linhas.
function gerarSQL(planos) {
  let sql = '-- Planos de consórcio exportados do Supabase por exportar-consorcio.js\n';
  sql += '-- Rode no Supabase (SQL Editor) DEPOIS de supabase_consorcio.sql.\n';
  sql += '-- A linha abaixo limpa a tabela antes de inserir, para poder rodar o arquivo mais de uma vez sem duplicar.\n';
  sql += 'delete from public.planos_consorcio;\n';
  for (let i = 0; i < planos.length; i += 50) {
    const bloco = planos.slice(i, i + 50)
      .map((p) => `  (${q(p.id_moto)}, ${q(p.valor_credito)}, ${q(p.prazo)}, ${q(p.valor_parcela)})`)
      .join(',\n');
    sql += `insert into public.planos_consorcio (id_moto, valor_credito, prazo, valor_parcela) values\n${bloco};\n`;
  }
  return sql;
}

// Programa principal (só roda quando o arquivo é executado direto, não quando é importado).
async function main() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Preencha SUPABASE_URL e SUPABASE_ANON_KEY no arquivo .env');
    process.exit(1);
  }
  // [SUPABASE] cliente com a chave pública (só leitura, graças ao RLS).
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  // [SUPABASE] O Supabase devolve no máximo 1000 linhas por consulta, então lê em páginas de 1000.
  const planos = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb
      .from('planos_consorcio')
      .select('id_moto, valor_credito, prazo, valor_parcela')
      .order('id')
      .range(de, de + 999);
    if (error) throw error;
    planos.push(...data);
    if (data.length < 1000) break;
  }
  if (!planos.length) {
    console.error('A tabela planos_consorcio está vazia: nada para exportar.');
    process.exit(1);
  }
  fs.writeFileSync(path.join(__dirname, 'consorcio_inserts.sql'), gerarSQL(planos));
  console.log(`✅ ${planos.length} planos exportados para consorcio_inserts.sql`);
}

module.exports = { gerarSQL };
if (require.main === module) main().catch((e) => { console.error('❌ Erro:', e.message); process.exit(1); });
