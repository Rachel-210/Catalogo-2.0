// =============================================================================
// server.js — API (Node.js + Express) e servidor dos arquivos da pasta public/
//
// MAPA DOS BANCOS DE DADOS (onde cada um é usado neste arquivo):
// [MONGODB]  coleção "produtos" ....... cadastro, listagem e exclusão de produtos
// [REDIS]    cache:produtos ........... cache da lista do catálogo (expira em 60 s)
//            cache:consorcio:SLUG ..... cache dos planos de consórcio de um produto (300 s)
//            recentes:VISITANTE ....... lista "vistos recentemente" (5 itens, expira em 7 dias)
// [SUPABASE] Auth ..................... valida o login do administrador (token JWT)
//            tabela planos_consorcio .. planos de consórcio (leitura pública, escrita só do admin)
//            tabela pedidos ........... histórico de pedidos (opcional, exige SERVICE_ROLE_KEY)
//
// O navegador nunca fala direto com o Mongo nem com o Redis: tudo passa por esta API.
// As senhas e URLs dos bancos ficam somente no arquivo .env.
// =============================================================================
//
// Carrega as variáveis do arquivo .env para process.env (URLs e chaves dos bancos).
require('dotenv').config();
// ---------- Bibliotecas ----------
// path, fs e crypto: módulos nativos do Node (caminhos, pastas e nomes aleatórios de upload).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
// express: cria o servidor web e as rotas da API.
const express = require('express');
// multer: recebe as imagens enviadas pelo formulário do painel admin.
const multer = require('multer');
// [MONGODB] driver oficial: MongoClient abre a conexão; ObjectId converte o _id dos documentos.
const { MongoClient, ObjectId } = require('mongodb');
// [REDIS] cliente do Redis (renomeado para createRedis).
const { createClient: createRedis } = require('redis');
// [SUPABASE] cliente do Supabase (renomeado para createSupabase): usado no Auth e nas tabelas PostgreSQL.
const { createClient: createSupabase } = require('@supabase/supabase-js');

// ---------- Configuração lida do .env ----------
// MONGO_URI / MONGO_DB ............ [MONGODB] endereço e nome do banco
// REDIS_URL ....................... [REDIS] endereço do Redis
// SUPABASE_URL / SUPABASE_ANON_KEY  [SUPABASE] projeto e chave pública (publishable/anon)
// SUPABASE_SERVICE_ROLE_KEY ....... [SUPABASE] chave secreta, opcional (só para gravar pedidos)
// ADMIN_EMAILS .................... e-mails autorizados como administrador
// WHATSAPP_NUMBER ................. número que recebe os pedidos
// PORT ............................ porta do servidor
const {
  PORT = 3000, MONGO_URI, MONGO_DB = 'catalogo', REDIS_URL,
  SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
  ADMIN_EMAILS = '', WHATSAPP_NUMBER = '558698177973',
} = process.env;

// Validação: se faltar alguma variável obrigatória de conexão com os bancos, o servidor não inicia.
for (const [nome, valor] of Object.entries({ MONGO_URI, REDIS_URL, SUPABASE_URL, SUPABASE_ANON_KEY })) {
  if (!valor) { console.error(`❌ Variável ${nome} não definida no arquivo .env`); process.exit(1); }
}

// [REDIS] CACHE_KEY = chave do cache da lista de produtos; CACHE_TTL = validade em segundos;
// MAX_RECENTES = quantos itens "vistos recentemente" cada visitante guarda.
const CACHE_KEY = 'cache:produtos'; 
const CACHE_TTL = 60;               
const MAX_RECENTES = 5;             

// ---------- Clientes dos serviços ----------
// [SUPABASE] Cliente "público" (chave anon/publishable). Serve para:
// (1) validar o token de login do admin (auth.getUser) e (2) LER a tabela planos_consorcio,
// cuja política RLS permite leitura a qualquer um. persistSession:false = o servidor não guarda sessão.
const supabaseAuth = createSupabase(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

// [SUPABASE] Cliente com a chave SECRETA (ignora o RLS). Só existe se SUPABASE_SERVICE_ROLE_KEY
// estiver no .env e é usado apenas para gravar na tabela pedidos (rota POST /api/pedidos).
const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createSupabase(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

// [MONGODB] Cria o cliente com a MONGO_URI. A conexão só é aberta em mongo.connect(), no fim do arquivo.
const mongo = new MongoClient(MONGO_URI);
// [MONGODB] Vai guardar a coleção "produtos" depois que a conexão for aberta.
let produtosCol; 

// [REDIS] Cria o cliente com a REDIS_URL. reconnectStrategy: tenta reconectar até 3 vezes (a cada 500 ms)
// e depois falha com erro claro. A conexão só é aberta em redis.connect(), no fim do arquivo.
const redis = createRedis({
  url: REDIS_URL,
  
  socket: { reconnectStrategy: (n) => (n > 3 ? new Error('Redis inacessível') : 500) },
});
// Mostra no console qualquer erro de conexão do Redis.
redis.on('error', (e) => console.error('Redis:', e.message));

// ---------- Upload de imagens (Multer) ----------
// As imagens enviadas pelo painel admin ficam em public/uploads (disco, fora dos bancos).
// No MongoDB é salvo apenas o caminho, por exemplo /uploads/arquivo.png.
const uploadsDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
// Configuração do upload: nome aleatório para cada arquivo (evita sobrescrever), aceita só
// imagens (jpeg, png, webp, avif, gif), limite de 5 MB por arquivo e no máximo 9 arquivos.
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) =>
    /^image\/(jpeg|png|webp|avif|gif)$/.test(file.mimetype) ? cb(null, true) : cb(new Error('Envie apenas imagens (jpg, png, webp, avif, gif).')),
  limits: { fileSize: 5 * 1024 * 1024, files: 9 }, 
});

// Converte moeda em texto ("R$ 15.000,00") para número (15000). Necessário porque o
// valor_credito é guardado como texto na tabela planos_consorcio do Supabase.
const parseBRL = (valor) => {
  if (typeof valor === 'number') return valor;
  const limpo = String(valor || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return Number(limpo) || 0;
};

// ---------- Lista de produtos (usada pelo catálogo, pelos recentes e pelos pedidos) ----------
// Fluxo: [REDIS] cache -> se não houver, [MONGODB] busca os produtos -> [SUPABASE] ajusta o preço
// pelo valor do crédito do consórcio -> [REDIS] guarda o resultado por 60 s.
// Retorna a lista e "HIT" (veio do cache) ou "MISS" (veio dos bancos).
async function obterProdutos() {
  // [REDIS] 1) Tenta ler a lista pronta do cache.
  const emCache = await redis.get(CACHE_KEY);
  if (emCache) return { lista: JSON.parse(emCache), cache: 'HIT' };

  // [MONGODB] 2) Sem cache: busca os produtos ativos, do mais antigo para o mais novo.
  const lista = await produtosCol.find({ ativo: true }).sort({ criadoEm: 1 }).toArray();

  // [SUPABASE] 3) Lê da tabela planos_consorcio o id_moto e o valor_credito de cada plano.
  const { data: planos, error } = await supabaseAuth
    .from('planos_consorcio')
    .select('id_moto, valor_credito')
    .order('id');

  // Se a consulta funcionou e há planos, o preço exibido de cada produto passa a ser o valor do
  // crédito do consórcio (se houver vários planos, vale o último cadastrado). Produtos sem plano
  // mantêm o preço salvo no MongoDB. Se o Supabase falhar, o erro é ignorado e valem os preços do MongoDB.
  if (!error && planos && planos.length) {
    const precoSupabase = {};
    for (const pl of planos) {
      const val = parseBRL(pl.valor_credito);
      if (val > 0) precoSupabase[limparSlug(pl.id_moto)] = val;
    }

    for (const prod of lista) {
      const slugLimpo = limparSlug(prod.slug);
      if (precoSupabase[slugLimpo]) {
        prod.preco = precoSupabase[slugLimpo];
      }
    }
  }

  // [REDIS] 4) Guarda a lista no cache por CACHE_TTL segundos.
  await redis.set(CACHE_KEY, JSON.stringify(lista), { EX: CACHE_TTL });
  return { lista, cache: 'MISS' };
}
// [REDIS] Apaga o cache da lista de produtos. É chamado sempre que um produto ou plano muda,
// para o catálogo mostrar a alteração imediatamente.
const limparCache = () => redis.del(CACHE_KEY);

// ---------- Funções auxiliares ----------
// Gera o "slug" (identificador curto, minúsculo, sem acento nem espaço) a partir do nome.
// O slug liga os três bancos: identifica o produto no MongoDB, é o id_moto dos planos no
// Supabase e entra nas chaves e listas do Redis.
const slugify = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40) || 'produto';
// Aceita apenas caminhos de imagem seguros: URL http(s), caminho iniciado por "/" ou "pasta/arquivo".
const caminhoValido = (s) => /^(https?:\/\/|\/|[\w-]+\/)[^\s"'<>]*$/.test(s);

// Formata número como moeda ("R$ 15.000,00"); usado ao gravar os planos no Supabase.
const fmtBRL = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');

// [SUPABASE] Cria um cliente que age COMO o administrador logado (envia o token dele).
// Assim as políticas RLS (só usuário autenticado pode inserir/excluir) valem na gravação dos planos.
const supabaseComoUsuario = (token) => createSupabase(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${token}` } },
});
// Normaliza um slug: minúsculas, só letras, números e hífen, no máximo 60 caracteres.
const limparSlug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
// Lê o identificador do visitante enviado pelo navegador (cabeçalho x-visitor-id).
// É a chave da lista "vistos recentemente" no Redis.
const idVisitante = (req) => String(req.headers['x-visitor-id'] || '').replace(/[^\w-]/g, '').slice(0, 64);

// ---------- Proteção das rotas de administrador ----------
// Middleware: só deixa passar quem enviar um token válido do Supabase Auth e cujo e-mail
// esteja em ADMIN_EMAILS. Sem isso responde 401 (não logado) ou 403 (não é administrador).
async function exigirAdmin(req, res, next) {
  try {
    // Extrai o token do cabeçalho "Authorization: Bearer TOKEN" enviado pelo admin.js.
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ erro: 'Faça login.' });
    // [SUPABASE] Pergunta ao Supabase Auth se o token é válido e de quem é.
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    // Lista de administradores vinda do .env. Se estiver vazia, qualquer usuário autenticado no Supabase é aceito.
    const permitidos = ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (permitidos.length && !permitidos.includes((data.user.email || '').toLowerCase()))
      return res.status(403).json({ erro: 'Este usuário não é administrador.' });
    // Guarda usuário e token na requisição para as rotas seguintes (o token é usado em supabaseComoUsuario).
    req.user = data.user;
    req.token = token;
    next();
  } catch (e) { res.status(500).json({ erro: 'Erro ao validar login.' }); }
}

// ---------- Aplicação Express ----------
const app = express();
// Permite ler o corpo das requisições em JSON (limite de 100 KB).
app.use(express.json({ limit: '100kb' }));
// Serve a pasta public/ (index.html, admin.html, CSS, JS, imagens e uploads) pelo mesmo servidor.
app.use(express.static(path.join(__dirname, 'public'))); 

// ROTA PÚBLICA. Entrega ao navegador só o que pode ser público: URL e chave pública do Supabase
// (necessárias ao login do admin) e o número do WhatsApp. Nenhuma senha de banco sai daqui.
app.get('/api/config', (req, res) => res.json({ supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY, whatsapp: WHATSAPP_NUMBER }));

// ROTA PÚBLICA — catálogo. Usa obterProdutos(): [REDIS] cache -> [MONGODB] produtos -> [SUPABASE] preço.
// O cabeçalho X-Cache informa HIT (veio do Redis) ou MISS (veio dos bancos); aparece no DevTools.
app.get('/api/produtos', async (req, res) => {
  try {
    const { lista, cache } = await obterProdutos();
    res.set({ 'X-Cache': cache, 'Cache-Control': 'no-store' }).json(lista); 
  } catch (e) { console.error(e); res.status(500).json({ erro: 'Erro ao listar produtos.' }); }
});

// ROTA DO ADMIN. exigirAdmin confere o login no [SUPABASE] e a rota devolve o e-mail.
// O admin.js usa para confirmar se quem logou realmente é administrador.
app.get('/api/admin/me', exigirAdmin, (req, res) => res.json({ email: req.user.email }));

// ROTA DO ADMIN — cadastra produto no [MONGODB] (formulário do admin.html) e limpa o cache [REDIS].
app.post('/api/produtos', exigirAdmin,
  // Recebe até 1 capa, 8 fotos de cores e 3 fotos de galeria (formulário multipart do admin.html).
  upload.fields([
    { name: 'capa', maxCount: 1 },
    { name: 'fotos_cores', maxCount: 8 },
    { name: 'galeria', maxCount: 3 }
  ]),
  async (req, res) => {
    try {
      // b = campos de texto do formulário; files = imagens que o Multer já salvou em public/uploads.
      const b = req.body, files = req.files || {};
      const nome = String(b.nome || '').trim().slice(0, 80);
      const descricao = String(b.descricao || '').trim().slice(0, 2000);
      const preco = Number(String(b.preco || '').replace(',', '.'));
      if (!nome) return res.status(400).json({ erro: 'Informe o nome.' });
      if (!(preco > 0)) return res.status(400).json({ erro: 'Informe um preço maior que zero.' });

      // Capa: arquivo enviado ou, se não houver, o caminho/URL digitado no campo capa_url.
      const capa = files.capa?.[0] ? `/uploads/${files.capa[0].filename}` : String(b.capa_url || '').trim();
      if (!capa || !caminhoValido(capa)) return res.status(400).json({ erro: 'Envie uma imagem de capa (arquivo ou URL/caminho válido).' });

      // fotos = imagens do carrossel/cores (usa a capa se nenhuma foi enviada); galeria = até 3 fotos de detalhe.
      const fotosCores = (files.fotos_cores || []).map((f) => `/uploads/${f.filename}`);
      const fotos = fotosCores.length ? fotosCores : [capa];

      const galeria = (files.galeria || []).slice(0, 3).map((f) => `/uploads/${f.filename}`);

      // cores: lista de cores CSS (ex.: #000000, blue), na mesma ordem das fotos, no máximo 8.
      const cores = String(b.cores || '').split(',').map((c) => c.trim()).filter((c) => c && c.length <= 30).slice(0, 8);

      // Gera o slug do produto; se já existir outro igual, acrescenta um sufixo para ficar único.
      let slug = slugify(nome);
      if (await produtosCol.findOne({ slug })) slug += Date.now().toString(36);

      // [MONGODB] Documento que será salvo na coleção "produtos" (campos flexíveis).
      const doc = {
        slug, nome, descricao, preco, capa, cores,
        fotos,
        galeria,
        categoria: String(b.categoria || '').trim().slice(0, 40) || 'Outros',
        ativo: true, criadoEm: new Date(),
      };
      // [MONGODB] Grava o produto no banco.
      const r = await produtosCol.insertOne(doc);
      // [REDIS] Apaga o cache da lista: o produto novo aparece no catálogo na hora.
      await limparCache();
      res.status(201).json({ ...doc, _id: r.insertedId });
    } catch (e) { console.error(e); res.status(500).json({ erro: 'Erro ao cadastrar produto.' }); }
  });

// ROTA DO ADMIN — exclui produto do [MONGODB] pelo _id e limpa o cache [REDIS].
app.delete('/api/produtos/:id', exigirAdmin, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ erro: 'ID inválido.' });
    // [MONGODB] Remove o documento.
    const r = await produtosCol.deleteOne({ _id: new ObjectId(req.params.id) });
    // [REDIS] Apaga o cache da lista: o produto removido some do catálogo na hora.
    await limparCache();
    res.json({ removidos: r.deletedCount });
  } catch (e) { res.status(500).json({ erro: 'Erro ao excluir.' }); }
});

// ROTA PÚBLICA — registra um produto como "visto recentemente" para o visitante, no [REDIS].
// Usa o [MONGODB] só para confirmar que o produto existe.
app.post('/api/recentes', async (req, res) => {
  try {
    const visitante = idVisitante(req), slug = String(req.body.slug || '');
    if (!visitante || !slug) return res.status(400).json({ erro: 'Dados inválidos.' });
    // [MONGODB] Confere se o produto existe e está ativo.
    if (!(await produtosCol.findOne({ slug, ativo: true }, { projection: { _id: 1 } }))) return res.status(404).json({ erro: 'Produto não encontrado.' });
    // [REDIS] Chave da lista deste visitante.
    const chave = `recentes:${visitante}`;
    // [REDIS] Operação em bloco: remove o slug se já estava na lista (lRem), coloca no início (lPush),
    // mantém só os 5 últimos (lTrim) e define expiração de 7 dias (expire).
    await redis.multi()
      .lRem(chave, 0, slug)              
      .lPush(chave, slug)                
      .lTrim(chave, 0, MAX_RECENTES - 1) 
      .expire(chave, 7 * 24 * 3600)      
      .exec();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ erro: 'Erro ao salvar recente.' }); }
});

// ROTA PÚBLICA — devolve os produtos vistos recentemente: slugs no [REDIS] + dados do produto pela obterProdutos().
app.get('/api/recentes', async (req, res) => {
  try {
    const visitante = idVisitante(req);
    if (!visitante) return res.json([]);
    // [REDIS] Lê os slugs guardados (o mais recente primeiro).
    const slugs = await redis.lRange(`recentes:${visitante}`, 0, MAX_RECENTES - 1);
    // Busca a lista atual de produtos para devolver nome, imagem e preço atualizados (e não dados antigos).
    const { lista } = await obterProdutos();
    res.set('Cache-Control', 'no-store').json(slugs.map((s) => lista.find((p) => p.slug === s)).filter(Boolean));
  } catch (e) { res.status(500).json({ erro: 'Erro ao buscar recentes.' }); }
});

// ROTA PÚBLICA — planos de consórcio de um produto. [REDIS] cache de 5 minutos -> [SUPABASE] tabela planos_consorcio.
app.get('/api/consorcio/:slug', async (req, res) => {
  try {
    const slug = limparSlug(req.params.slug);
    // [REDIS] Chave do cache dos planos deste produto.
    const chave = `cache:consorcio:${slug}`;
    // [REDIS] Se já houver cache, responde direto com X-Cache: HIT.
    const emCache = await redis.get(chave);
    if (emCache) return res.set({ 'X-Cache': 'HIT', 'Cache-Control': 'no-store' }).type('json').send(emCache);

    // [SUPABASE] Sem cache: consulta a tabela planos_consorcio filtrando pelo produto, em ordem de cadastro.
    const { data, error } = await supabaseAuth
      .from('planos_consorcio')
      .select('id, id_moto, valor_credito, prazo, valor_parcela')
      // ilike compara sem diferenciar maiúsculas de minúsculas.
      .ilike('id_moto', slug)
      .order('id');
    if (error) throw error;
    // [REDIS] Guarda os planos no cache por 300 segundos (5 minutos).
    await redis.set(chave, JSON.stringify(data), { EX: 300 });
    res.set({ 'X-Cache': 'MISS', 'Cache-Control': 'no-store' }).json(data);
  } catch (e) { console.error('consorcio:', e.message); res.status(500).json({ erro: 'Erro ao buscar planos.' }); }
});

// ROTA DO ADMIN — cadastra um plano de consórcio: confere o produto no [MONGODB], grava no [SUPABASE]
// e limpa os caches [REDIS].
app.post('/api/consorcio', exigirAdmin, async (req, res) => {
  try {
    const slug = limparSlug(req.body.id_moto);
    // Converte e valida os números enviados pelo formulário (crédito, parcela e prazo precisam ser maiores que zero).
    const credito = Number(req.body.valor_credito), parcela = Number(req.body.valor_parcela), prazo = parseInt(req.body.prazo);
    if (!slug || !(credito > 0) || !(parcela > 0) || !(prazo > 0)) return res.status(400).json({ erro: 'Preencha produto, crédito, prazo e parcela.' });
    // [MONGODB] Confere se o produto do plano existe.
    if (!(await produtosCol.findOne({ slug }, { projection: { _id: 1 } }))) return res.status(404).json({ erro: 'Produto não encontrado.' });

    // [SUPABASE] Insere o plano na tabela planos_consorcio COMO administrador logado (a política RLS
    // "admin insere" permite). Os valores são salvos como texto formatado: "R$ 15.000,00" e "72x".
    const { data, error } = await supabaseComoUsuario(req.token)
      .from('planos_consorcio')
      .insert({ id_moto: slug, valor_credito: fmtBRL(credito), prazo: `${prazo}x`, valor_parcela: fmtBRL(parcela) })
      .select().single();
    if (error) throw error;
    // [REDIS] Apaga o cache dos planos deste produto e, na linha seguinte, o cache da lista de produtos
    // (o preço exibido no catálogo vem do crédito do consórcio).
    await redis.del(`cache:consorcio:${slug}`); 
    await limparCache();
    res.status(201).json(data);
  } catch (e) { console.error('consorcio:', e.message); res.status(500).json({ erro: 'Erro ao salvar plano.' }); }
});

// ROTA DO ADMIN — exclui um plano de consórcio do [SUPABASE] e limpa os caches [REDIS].
app.delete('/api/consorcio/:id', exigirAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ erro: 'ID inválido.' });
    // [SUPABASE] Cliente que age como o administrador logado.
    const db = supabaseComoUsuario(req.token);
    // [SUPABASE] Descobre a qual produto o plano pertence (para limpar o cache certo).
    const { data: linha } = await db.from('planos_consorcio').select('id_moto').eq('id', id).maybeSingle();
    // [SUPABASE] Exclui o plano (permitido pela política RLS "admin exclui").
    const { error } = await db.from('planos_consorcio').delete().eq('id', id);
    if (error) throw error;
    // [REDIS] Limpa o cache dos planos desse produto e, na linha seguinte, o cache da lista de produtos.
    if (linha) await redis.del(`cache:consorcio:${limparSlug(linha.id_moto)}`);
    await limparCache();
    res.json({ ok: true });
  } catch (e) { console.error('consorcio:', e.message); res.status(500).json({ erro: 'Erro ao excluir plano.' }); }
});

// ROTA PÚBLICA (extra) — registra o pedido no [SUPABASE] (tabela pedidos) quando o cliente clica em
// "Comprar pelo WhatsApp". Os preços são conferidos na lista oficial de produtos, nunca no navegador.
app.post('/api/pedidos', async (req, res) => {
  try {
    // Sem SERVICE_ROLE_KEY no .env o registro de pedidos fica desativado (recurso opcional);
    // a compra pelo WhatsApp continua funcionando normalmente.
    if (!supabaseAdmin) return res.json({ ok: true, registrado: false });
    // Lê os itens do carrinho enviados pelo navegador (no máximo 50).
    const itens = Array.isArray(req.body.itens) ? req.body.itens.slice(0, 50) : [];
    if (!itens.length) return res.status(400).json({ erro: 'Carrinho vazio.' });
    // Lista oficial de produtos ([REDIS]/[MONGODB]/[SUPABASE]) usada para conferir nome e preço de cada item.
    const { lista } = await obterProdutos();
    // Mantém só itens que existem no catálogo, com nome e preço oficiais e quantidade entre 1 e 99.
    const conferidos = itens.map((i) => {
      const p = lista.find((x) => x.slug === i.id);
      return p ? { id: p.slug, nome: p.nome, preco: p.preco, quantidade: Math.max(1, Math.min(99, parseInt(i.quantidade) || 1)) } : null;
    }).filter(Boolean);
    // Total recalculado no servidor.
    const total = conferidos.reduce((s, i) => s + i.preco * i.quantidade, 0);
    // [SUPABASE] Grava o pedido (itens em JSON + total) na tabela pedidos usando a chave secreta.
    const { error } = await supabaseAdmin.from('pedidos').insert({ itens: conferidos, total });
    if (error) throw error;
    res.status(201).json({ ok: true, registrado: true });
  } catch (e) { console.error('pedido:', e.message); res.status(500).json({ erro: 'Erro ao registrar pedido.' }); }
});

// Tratador de erros: devolve em JSON as falhas de upload (tipo ou tamanho inválido) e outros erros.
app.use((err, req, res, next) => res.status(400).json({ erro: err.message || 'Erro na requisição.' }));

// ---------- Inicialização ----------
// Abre as conexões com os bancos e só depois liga o servidor.
(async () => {
  // [MONGODB] Abre a conexão.
  await mongo.connect();
  // [MONGODB] Seleciona o banco (MONGO_DB) e a coleção "produtos".
  produtosCol = mongo.db(MONGO_DB).collection('produtos');
  // [MONGODB] Índice único: impede dois produtos com o mesmo slug.
  await produtosCol.createIndex({ slug: 1 }, { unique: true });
  // [REDIS] Abre a conexão (se falhar, o erro aparece e o servidor encerra).
  await redis.connect();
  // Começa a atender requisições (catálogo em / e painel em /admin.html).
  app.listen(PORT, () => {
    console.log(`✅ Catálogo:  http://localhost:${PORT}`);
    console.log(`🔐 Admin:     http://localhost:${PORT}/admin.html`);
  });
// Se qualquer conexão falhar, mostra o motivo e encerra o programa.
})().catch((e) => { console.error('❌ Falha ao iniciar:', e.message); process.exit(1); });
