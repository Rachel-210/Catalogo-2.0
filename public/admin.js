// [SUPABASE] Cliente do Supabase usado no navegador (criado no final do arquivo).
let sb;

// Escapa caracteres especiais antes de colocar texto do banco no HTML (evita injeção de código).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Atalho para document.getElementById.
const $ = (id) => document.getElementById(id);
// Formata número como moeda brasileira.
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// [SUPABASE] Pega a sessão de login atual e devolve o cabeçalho "Authorization: Bearer TOKEN" que a API exige.
async function authHeader() {
    const { data: { session } } = await sb.auth.getSession();
    return session ? { Authorization: 'Bearer ' + session.access_token } : {};
}

// Mostra a tela de login e esconde o painel.
function mostrarLogin() { $('tela-login').hidden = false; $('tela-painel').hidden = true; }

// Confirma NO SERVIDOR que quem logou é administrador e, se for, mostra o painel; senão desloga e volta ao login.
async function mostrarPainel() {
    // [SUPABASE via API] A API valida o token e confere o e-mail em ADMIN_EMAILS.
    const r = await fetch('/api/admin/me', { headers: await authHeader() });
    if (!r.ok) {
        await sb.auth.signOut();
        $('login-erro').textContent = (await r.json()).erro || 'Acesso negado.';
        return mostrarLogin();
    }
    const { email } = await r.json();
    $('admin-email').textContent = '👤 ' + email;
    $('tela-login').hidden = true;
    $('tela-painel').hidden = false;
    listarProdutos();
}

// ---------- Produtos ([MONGODB]) ----------
// Lista os produtos cadastrados (GET /api/produtos) com botão Excluir e atualiza o seletor dos planos de consórcio.
async function listarProdutos() {
    const lista = await (await fetch('/api/produtos')).json();
    $('lista-admin').innerHTML = lista.map((p) => `
        <div class="admin-linha">
            <img src="${esc(p.capa)}" alt="">
            <span class="al-nome">${esc(p.nome)}</span>
            <span class="al-preco">${brl(p.preco)}</span>
            <button data-id="${esc(p._id)}" data-nome="${esc(p.nome)}">Excluir</button>
        </div>`).join('') || '<p>Nenhum produto.</p>';
    preencherSelectPlanos(lista); 
}


// ---------- Login ([SUPABASE Auth]) ----------
// Envio do formulário de login.
$('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('login-erro').textContent = '';
    // [SUPABASE Auth] Autentica e-mail e senha. Em caso de erro, mostra "E-mail ou senha inválidos."
    const { error } = await sb.auth.signInWithPassword({ email: $('login-email').value, password: $('login-senha').value });
    if (error) { $('login-erro').textContent = 'E-mail ou senha inválidos.'; return; }
    mostrarPainel();
});

// Botão Sair: encerra a sessão no Supabase.
$('btn-sair').addEventListener('click', async () => { await sb.auth.signOut(); mostrarLogin(); });

// Envio do formulário de cadastro de produto (nome, preço, categoria, descrição, imagens e cores).
    // ---------- Pares de Cor + Foto (garante ordem exata) ----------
function adicionarLinhaVariacao(corPadrao = '#000000') {
    const container = $('lista-variacoes');
    if (container.children.length >= 8) {
        alert('Máximo de 8 variações de cor por produto.');
        return;
    }

    const linha = document.createElement('div');
    linha.className = 'variacao-item';
    linha.style.cssText = 'display: flex; align-items: center; gap: 10px; background: #fff; padding: 10px; border-radius: 8px; border: 1px solid #ccc;';
    linha.innerHTML = `
        <input type="color" class="var-cor" value="${corPadrao}" title="Escolha a cor da bolinha"
               style="width: 45px; height: 40px; padding: 2px; margin: 0; cursor: pointer; border-radius: 6px;">
        <input type="file" class="var-foto" accept="image/*" required
               style="flex: 1; margin: 0; padding: 8px;">
        <img class="var-preview" style="width: 45px; height: 45px; object-fit: contain; display: none; border-radius: 4px;">
        <button type="button" class="btn-rem-var" title="Remover"
                style="background: #D90007; color: #fff; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer; font-weight: bold;">✕</button>
    `;

    // Mostra miniatura da foto assim que você seleciona o arquivo
    const inputFoto = linha.querySelector('.var-foto');
    const preview = linha.querySelector('.var-preview');
    inputFoto.addEventListener('change', () => {
        const arq = inputFoto.files[0];
        if (arq) {
            preview.src = URL.createObjectURL(arq);
            preview.style.display = 'block';
        } else {
            preview.style.display = 'none';
        }
    });

    linha.querySelector('.btn-rem-var').addEventListener('click', () => linha.remove());
    container.appendChild(linha);
}

$('btn-add-variacao').addEventListener('click', () => adicionarLinhaVariacao());

// Inicia o formulário já com 1 linha de cor/foto pronta
adicionarLinhaVariacao();

// Envio do formulário de cadastro de produto (montando cores e fotos na ordem exata das linhas)
$('form-produto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('produto-msg');
    msg.className = '';
    msg.textContent = 'Enviando...';

    const fd = new FormData(e.target);
    // Remove qualquer resquício e monta manualmente na ordem exata das linhas
    fd.delete('fotos_cores');
    fd.delete('cores');

    const coresOrdenadas = [];
    const linhas = document.querySelectorAll('#lista-variacoes .variacao-item');

    for (const linha of linhas) {
        const cor = linha.querySelector('.var-cor').value;
        const arquivo = linha.querySelector('.var-foto').files[0];
        if (arquivo) {
            coresOrdenadas.push(cor);
            fd.append('fotos_cores', arquivo); // entra no FormData exatamente na mesma posição da cor!
        }
    }

    fd.append('cores', coresOrdenadas.join(', '));

    const resp = await fetch('/api/produtos', {
        method: 'POST',
        headers: await authHeader(),
        body: fd
    });
    const dados = await resp.json();

    if (!resp.ok) {
        msg.className = 'admin-erro';
        msg.textContent = dados.erro || 'Erro ao cadastrar.';
        return;
    }

    msg.className = 'admin-ok';
    msg.textContent = '✔ "' + dados.nome + '" cadastrado! Já está no catálogo.';
    e.target.reset();
    $('lista-variacoes').innerHTML = '';
    adicionarLinhaVariacao();
    listarProdutos();
});

// Botão Excluir de um produto: pede confirmação e chama DELETE /api/produtos/:id ([MONGODB]).
$('lista-admin').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn || !confirm('Excluir "' + btn.dataset.nome + '"?')) return;
    await fetch('/api/produtos/' + btn.dataset.id, { method: 'DELETE', headers: await authHeader() });
    listarProdutos();
});

// ---------- Inicialização ----------
// Ao abrir a página: busca a configuração pública, cria o cliente do Supabase e decide entre tela de login e painel.
(async () => {
    const cfg = await (await fetch('/api/config')).json();
    // [SUPABASE] Cria o cliente com a URL e a chave pública entregues por /api/config.
    sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    // [SUPABASE] Verifica se já existe sessão salva (login anterior ainda válido).
    const { data: { session } } = await sb.auth.getSession();
    session ? mostrarPainel() : mostrarLogin();
})();


// ---------- Planos de consórcio ([SUPABASE]) ----------
// Preenche o seletor "Produto" com os produtos do [MONGODB] e carrega os planos do produto escolhido.
function preencherSelectPlanos(lista) {
    const sel = $('plano-produto'), atual = sel.value;
    sel.innerHTML = lista.map((p) => `<option value="${esc(p.slug)}">${esc(p.nome)}</option>`).join('');
    if (atual && lista.some((p) => p.slug === atual)) sel.value = atual;
    listarPlanos();
}

// Lista os planos do produto selecionado (GET /api/consorcio/:slug, que lê o [SUPABASE] com cache no [REDIS]).
async function listarPlanos() {
    const slug = $('plano-produto').value;
    if (!slug) { $('lista-planos').innerHTML = ''; return; }
    const planos = await (await fetch('/api/consorcio/' + encodeURIComponent(slug))).json();
    $('lista-planos').innerHTML = planos.map((p) => `
        <div class="admin-linha">
            <span class="al-nome">Crédito ${esc(p.valor_credito)} · ${esc(p.prazo)}</span>
            <span class="al-preco">${esc(p.valor_parcela)}</span>
            <button data-plano="${esc(p.id)}">Excluir</button>
        </div>`).join('') || '<p>Nenhum plano para este produto.</p>';
}

// Ao trocar o produto selecionado, recarrega a lista de planos.
$('plano-produto').addEventListener('change', listarPlanos);

// Envio do formulário de plano (crédito, prazo e parcela).
$('form-plano').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('plano-msg'); msg.className = ''; msg.textContent = 'Salvando...';
    const corpo = Object.fromEntries(new FormData(e.target));
    // [SUPABASE via API] Cadastra o plano; a API grava na tabela planos_consorcio e limpa os caches [REDIS].
    const resp = await fetch('/api/consorcio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(corpo),
    });
    const dados = await resp.json();
    if (!resp.ok) { msg.className = 'admin-erro'; msg.textContent = dados.erro || 'Erro ao salvar.'; return; }
    msg.className = 'admin-ok'; msg.textContent = '✔ Plano adicionado!';
    e.target.reset();
    $('plano-produto').value = corpo.id_moto; 
    listarPlanos();
});

// Botão Excluir de um plano: pede confirmação e chama DELETE /api/consorcio/:id ([SUPABASE]).
$('lista-planos').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-plano]');
    if (!btn || !confirm('Excluir este plano?')) return;
    await fetch('/api/consorcio/' + btn.dataset.plano, { method: 'DELETE', headers: await authHeader() });
    listarPlanos();
});
