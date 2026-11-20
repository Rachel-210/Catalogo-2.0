# 🏍️ Catálogo Yamaha — E-commerce com Banco de Dados Poliglota

Catálogo de motocicletas com carrinho de compras e finalização do pedido pelo WhatsApp, desenvolvido com **três bancos de dados**, cada um aplicado ao caso de uso em que é mais forte.

## 📋 Identificação
* **👤 Aluna:** Lia Rachel Ferreira de Sousa
* **📚 Disciplina:** Projeto de Banco de Dados
* **👨‍🏫 Professor:**  Anderson Soares Costa

### 📹 Vídeo de Apresentação
* **Link da Apresentação:** https://canva.link/5sipm3gs7bt7b2q

## 🗄️ Arquitetura de dados (banco poliglota)

| Banco | Para que é usado | Por quê |
|---|---|---|
| **Supabase (PostgreSQL)** | Login do administrador (Supabase Auth), planos de consórcio (`planos_consorcio`) e histórico de pedidos (`pedidos`, opcional) | Dados tabulares/relacionais e autenticação segura |
| **MongoDB** | Cadastro e armazenamento dos produtos (coleção `produtos`) | Documentos flexíveis: cada produto pode ter campos, cores e fotos diferentes |
| **Redis** | (1) Cache da listagem do catálogo, (2) cache dos planos de consórcio, (3) lista "Vistos recentemente" por visitante | Leitura muito rápida e dados temporários com expiração |

As senhas dos bancos ficam **somente no servidor** (arquivo `.env`). O navegador conversa apenas com a API do projeto.

```
Navegador ──► API Node.js/Express ──► MongoDB   (produtos)
 (cliente      (server.js)        ├─► Redis     (cache + vistos recentemente)
  e admin)                        └─► Supabase  (login, consórcio, pedidos)
```

O campo **slug** de cada produto (ex.: `nmax`) liga os três bancos: identifica o produto no MongoDB, é o `id_moto` dos planos no Supabase e compõe as chaves do Redis.

### 💲 Regra de preço
O preço exibido no catálogo vem do **valor do crédito do plano de consórcio** (Supabase) quando o produto tem plano cadastrado (se houver vários planos, vale o último). Produtos **sem plano** mostram o preço salvo no MongoDB (o campo "Preço" do painel admin). Esse ajuste é feito em `server.js`, na função `obterProdutos()`.

> Por isso, ao cadastrar um produto novo pelo painel, o preço digitado aparece no catálogo até que seja cadastrado um plano de consórcio para ele.

## ✨ Funcionalidades

**Módulo do cliente (público)**
- Catálogo com os produtos vindos do MongoDB (imagem, nome e preço)
- Modal "Sobre a moto" com fotos por cor, cores e galeria
- Plano de consórcio por moto (dados do Supabase)
- Formulário de financiamento enviado ao WhatsApp (os dados do formulário **não** são gravados em nenhum banco)
- Carrinho de compras: adicionar, remover, alterar quantidade e total (o carrinho fica no `localStorage` do navegador)
- Botão **Comprar pelo WhatsApp**: abre o WhatsApp com a mensagem formatada, por exemplo:
  `Olá, gostaria de pedir: 1x NMAX ABS CONNECTED, 2x FZ15 ABS CONNECTED. Total: R$ 58.970,00`
- Faixa **Vistos recentemente** (Redis): alimentada ao abrir "Sobre a moto" ou ao adicionar um produto ao carrinho

**Módulo administrativo (restrito) — `/admin.html`**
- Login com e-mail e senha (Supabase Auth) e verificação de administrador no servidor
- Cadastro de produtos no MongoDB: nome, preço, descrição, categoria, imagem de capa (arquivo ou URL/caminho), **variações de cor** (cada cor com sua foto, até 8) e **galeria** (até 3 fotos de detalhe)
- Exclusão de produtos
- Cadastro e exclusão de planos de consórcio (Supabase)
- O produto cadastrado aparece **imediatamente** no catálogo (o cache do Redis é invalidado; basta recarregar a página do catálogo)

## 🧰 Tecnologias
Node.js, Express, MongoDB (driver oficial), Redis, Supabase (`@supabase/supabase-js`), Multer (upload de imagens), HTML, CSS e JavaScript puro no front-end.

## 📁 Estrutura do projeto
```
├─ server.js                  API + servidor dos arquivos estáticos
├─ seed.js                    popula o MongoDB com as 16 motos
├─ exportar-consorcio.js      gera o consorcio_inserts.sql a partir do Supabase (para quem mantém o projeto)
├─ supabase_consorcio.sql     tabela de planos de consórcio + políticas de segurança (RLS)
├─ consorcio_inserts.sql      (opcional) dados dos planos; gerado por exportar-consorcio.js
├─ supabase.sql               tabela de pedidos (opcional)
├─ docker-compose.yml         (opcional) MongoDB e Redis locais
├─ .env.example               modelo das variáveis de ambiente (comentado)
├─ package.json / package-lock.json
└─ public/
   ├─ index.html, style.css, script.js     área do cliente
   ├─ admin.html, admin.js                 painel administrativo
   ├─ imagens/ e carrossel*/               imagens das motos
   └─ uploads/                             imagens enviadas pelo admin (não vão para o Git)
```
Os arquivos de código têm comentários indicando onde cada banco é usado (procure por `[MONGODB]`, `[REDIS]` e `[SUPABASE]`).

## ✅ Pré-requisitos
- **Node.js 18 ou superior** (https://nodejs.org, versão LTS) — o npm vem junto
- Conta gratuita no **Supabase** (supabase.com)
- **MongoDB**: conta gratuita no MongoDB Atlas **ou** MongoDB local
- **Redis**: conta gratuita no Redis Cloud (ou Upstash) **ou** Redis local

> Para rodar MongoDB e Redis localmente com Docker: `docker compose up -d` (use `mongodb://localhost:27017` e `redis://localhost:6379` no `.env`).

## 🚀 Como rodar (passo a passo)

### 1. Instalar as dependências
```bash
npm install
```

### 2. Configurar os bancos de dados

**MongoDB Atlas**
1. Crie um cluster gratuito (M0).
2. Em *Database Access*, crie um usuário e uma senha (use só letras e números).
3. Em *Network Access*, libere o acesso (*Allow Access From Anywhere*).
4. Em *Database > Connect > Drivers*, copie a URL `mongodb+srv://...` e troque `<password>` pela senha.

**Redis Cloud**
1. Crie um banco gratuito.
2. Anote o endereço, a porta e a senha. A URL fica: `redis://default:SENHA@ENDERECO:PORTA`

**Supabase**
1. Crie um projeto.
2. Copie a **Project URL** e a **publishable key** (`sb_publishable_...`) pelo botão **Connect**, ou em *Project Settings > API Keys*. Chaves antigas `anon` também funcionam.
3. Em *Authentication > Users > Add user*, crie o administrador (e-mail e senha) marcando **Auto Confirm User**.
4. Em *Authentication > Sign In / Providers > Email*, desative **Allow new users to sign up**.
5. Em *SQL Editor*, rode **na ordem**:
   1. `supabase_consorcio.sql` — cria a tabela de planos de consórcio
   2. `consorcio_inserts.sql` — insere os planos de consórcio (**somente se o arquivo existir no repositório**; caso contrário, pule este passo e cadastre os planos depois pelo painel admin)
   3. `supabase.sql` — tabela de pedidos (opcional)
6. (Opcional, para gravar o histórico de pedidos) Copie a chave **secret / service_role** em *Project Settings > API Keys* e coloque em `SUPABASE_SERVICE_ROLE_KEY` no `.env`. Sem ela, a compra pelo WhatsApp funciona normalmente, mas o pedido não é registrado no Supabase.

### 3. Criar o arquivo `.env`
Copie o `.env.example` para `.env` (`copy .env.example .env` no Windows, `cp .env.example .env` no Linux/Mac) e preencha os valores. Cada variável está explicada nos comentários do próprio arquivo.

```env
PORT=3000
MONGO_URI=mongodb+srv://USUARIO:SENHA@cluster0.xxxxx.mongodb.net/
MONGO_DB=catalogo
REDIS_URL=redis://default:SENHA@ENDERECO:PORTA
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...        # chave pública (publishable ou anon)
SUPABASE_SERVICE_ROLE_KEY=                  # opcional: chave secreta, só para gravar a tabela "pedidos"
ADMIN_EMAILS=email-do-admin@exemplo.com     # o mesmo e-mail criado no Supabase
WHATSAPP_NUMBER=5586999999999               # DDI + DDD + número, só dígitos
```

> ⚠️ O `.env` contém senhas e **nunca deve ser enviado ao GitHub** (já está no `.gitignore`).
>
> ⚠️ **Preencha `ADMIN_EMAILS`.** Se a variável ficar vazia, qualquer usuário autenticado no Supabase é aceito como administrador.
>
> 📱 `WHATSAPP_NUMBER` define o destino do botão "Comprar pelo WhatsApp", do "Entrar em contato" e do formulário de financiamento. O ícone de WhatsApp do cabeçalho da página tem o link escrito direto em `public/index.html`; altere lá se mudar o número.

### 4. Cadastrar os produtos iniciais no MongoDB
```bash
npm run seed
```
Insere as 16 motos (pode ser executado mais de uma vez: atualiza em vez de duplicar). Se já havia rodado o seed antes, rode de novo para atualizar os dados.

### 5. Iniciar o servidor
```bash
npm start
```
- Catálogo: http://localhost:3000
- Painel admin: http://localhost:3000/admin.html

### 6. (Quem mantém o projeto) Atualizar o `consorcio_inserts.sql`
Depois de alterar os planos de consórcio pelo painel admin, gere (ou regenere) o arquivo para que o repositório fique em dia:
```bash
npm run exportar:consorcio
```
Ele lê a tabela `planos_consorcio` do seu Supabase e grava o `consorcio_inserts.sql` na raiz do projeto. Se a tabela estiver vazia, nada é gerado.

## 🧪 Roteiro de teste
1. Abra o catálogo e confira os produtos com preço e imagem.
2. Clique em **Sobre a moto** em alguns modelos: a faixa *Vistos recentemente* aparece (Redis).
3. Clique em **Plano de Consórcio**: a tabela vem do Supabase.
4. Adicione produtos ao carrinho, altere as quantidades e clique em **Comprar pelo WhatsApp**: o WhatsApp abre com o pedido formatado.
5. Em `/admin.html`, faça login, cadastre um produto novo e recarregue o catálogo: o produto já aparece (com o preço digitado, pois ainda não tem plano de consórcio).
6. No admin, cadastre um plano de consórcio para o produto novo e confira no catálogo (o preço passa a ser o valor do crédito).

Dica: no DevTools do navegador (F12 > Network), as chamadas `produtos` e `consorcio/...` mostram o cabeçalho `X-Cache: MISS` na primeira vez e `HIT` nas seguintes, comprovando o cache do Redis.

## 🔌 Rotas da API

| Método | Rota | Acesso | Função |
|---|---|---|---|
| GET | `/api/config` | Público | Configurações públicas (URL/chave pública do Supabase, WhatsApp) |
| GET | `/api/produtos` | Público | Lista de produtos (MongoDB, com cache Redis; preço ajustado pelo consórcio) |
| POST | `/api/produtos` | Admin | Cadastra produto (com upload de imagens) |
| DELETE | `/api/produtos/:id` | Admin | Exclui produto |
| GET | `/api/consorcio/:slug` | Público | Planos de consórcio do produto (Supabase, com cache Redis) |
| POST | `/api/consorcio` | Admin | Cadastra plano |
| DELETE | `/api/consorcio/:id` | Admin | Exclui plano |
| GET/POST | `/api/recentes` | Público | "Vistos recentemente" por visitante (Redis) |
| POST | `/api/pedidos` | Público | Registra o pedido no Supabase (opcional; exige `SUPABASE_SERVICE_ROLE_KEY`) |
| GET | `/api/admin/me` | Admin | Confirma se o login é de administrador |

## 🔐 Segurança
- Rotas de administração exigem o token JWT do Supabase, validado no servidor, e o e-mail precisa estar em `ADMIN_EMAILS` (mantenha a variável preenchida).
- A gravação dos planos de consórcio usa as políticas RLS do Supabase: qualquer visitante lê, só o usuário autenticado escreve.
- Senhas ficam apenas no `.env`; o cadastro público de usuários no Supabase fica desativado.
- Textos vindos do banco são escapados antes de ir para a página (proteção contra injeção de HTML).
- Upload aceita apenas imagens (jpg, png, webp, avif, gif) de até 5 MB cada.
- No registro de pedidos, os preços e nomes são conferidos no servidor, nunca confiados ao navegador.

## 👩‍💻 Autoria
Projeto desenvolvido como trabalho acadêmico sobre persistência poliglota. Base visual: catálogo de vendas Yamaha Água Branca desenvolvido anteriormente por mim.
