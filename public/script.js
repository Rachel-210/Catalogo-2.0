
// Número do WhatsApp que recebe pedidos e financiamentos. O valor abaixo é só um padrão:
// ao iniciar, é substituído pelo WHATSAPP_NUMBER do .env (via /api/config).
let numeroWhatsApp = "558698177973";

// ---------- Estado da página ----------
// produtos: lista vinda do [MONGODB] via API. porSlug: a mesma lista indexada pelo slug (acesso rápido).
let produtos = [];     
const porSlug = {};    
// slideAtual / fotosAtuais: controle do carrossel de fotos do modal "Sobre a moto".
let slideAtual = 0;
let fotosAtuais = [];

// Escapa caracteres especiais (&, <, >, aspas) antes de colocar texto vindo do banco dentro do HTML (evita injeção de código).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Formata número como moeda brasileira: 14990 -> "R$ 14.990,00".
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');

// Identificador anônimo do visitante, criado uma vez e guardado no localStorage.
// É enviado à API (cabeçalho x-visitor-id) e vira a chave da lista "vistos recentemente" no [REDIS].
function getVisitorId() {
    try {
        let id = localStorage.getItem('visitorId');
        if (!id) {
            id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2);
            localStorage.setItem('visitorId', id);
        }
        return id;
    } catch (e) { return 'anonimo'; }
}

// ---------- Catálogo ----------
// Monta o HTML do card de UM produto (documento do [MONGODB]): imagem, nome, preço e botões
// Sobre a moto / Plano de Consórcio / Financiamento / Adicionar ao carrinho / Contato.
// data-moto guarda o slug, que os cliques usam para saber qual produto foi escolhido.
function criarCard(p) {
    return `
    <div class="product-card" data-moto="${esc(p.slug)}">
        <img src="${esc(p.capa)}" alt="${esc(p.nome)}" class="product-image">
        <div class="black-line"></div>
        <h3 class="product-name">${esc(p.nome)}</h3>
        <p class="product-price">${brl(p.preco)}</p>
        <button class="btn-red open-sobre">Sobre a moto</button>
        <button class="btn-cons open-consorcio">Plano de Consórcio</button>
        <button class="btn-finan open-financiamento">Financiamento</button>
        <button class="btn-cart add-carrinho">🛒 Adicionar ao carrinho</button>
        <a href="https://wa.me/${numeroWhatsApp}" target="_blank" class="btn-contat"> Entrar em contato</a>
    </div>`;
}

// Busca os produtos na API e desenha os cards na seção #lista-motos do index.html.
async function carregarCatalogo() {
    const grid = document.getElementById('lista-motos');
    try {
        // [MONGODB via API, com cache REDIS] Pede a lista de produtos.
        const resp = await fetch('/api/produtos');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        // Guarda a lista e a indexa por slug.
        produtos = await resp.json();
        produtos.forEach((p) => { porSlug[p.slug] = p; });
        grid.innerHTML = produtos.length ? produtos.map(criarCard).join('') : '<p class="msg-catalogo">Nenhum produto cadastrado ainda.</p>';
        // Depois de carregar o catálogo, confere o carrinho salvo (remove itens que não existem mais e atualiza preços).
        sincronizarCarrinhoComCatalogo();
    } catch (e) {
        console.error('Erro ao carregar catálogo:', e);
        grid.innerHTML = '<p class="msg-catalogo">Não foi possível carregar o catálogo. Tente novamente.</p>';
    }
}

// ---------- Vistos recentemente ([REDIS]) ----------
// Avisa a API que o visitante viu/adicionou este produto; a API guarda o slug numa lista no [REDIS].
async function registrarRecente(slug) {
    try {
        // POST: grava o slug na lista do visitante (identificado por x-visitor-id).
        await fetch('/api/recentes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-visitor-id': getVisitorId() },
            body: JSON.stringify({ slug }),
        });
        carregarRecentes();
    } catch (e) { console.error('Erro ao registrar recente:', e); }
}

// Busca a lista do visitante e mostra a faixa "Vistos recentemente" no topo do catálogo (escondida se estiver vazia).
async function carregarRecentes() {
    const secao = document.getElementById('recentes-section');
    const lista = document.getElementById('recentes-lista');
    try {
        // GET: lê da API (que consulta o [REDIS]) os produtos vistos recentemente.
        const resp = await fetch('/api/recentes', { headers: { 'x-visitor-id': getVisitorId() } });
        const itens = await resp.json();
        secao.hidden = !itens.length;
        lista.innerHTML = itens.map((p) => `
            <div class="recent-item" data-moto="${esc(p.slug)}">
                <img src="${esc(p.capa)}" alt="${esc(p.nome)}">
                <span>${esc(p.nome)}</span>
                <small>${brl(p.preco)}</small>
            </div>`).join('');
    } catch (e) { secao.hidden = true; }
}

// ---------- Modal "Sobre a moto" ----------
// Preenche e abre o modal com os dados do produto (nome, descrição, fotos, cores e galeria), todos vindos do [MONGODB].
// Também registra o produto em "vistos recentemente" ([REDIS]).
function abrirSobre(slug) {
    const dados = porSlug[slug];
    if (!dados) return;

    document.getElementById('sobre-titulo').textContent = dados.nome;
    document.getElementById('sobre-descricao').textContent = dados.descricao;
    // Fotos do carrossel; se o produto não tiver, usa a capa.
    fotosAtuais = (dados.fotos && dados.fotos.length) ? dados.fotos : [dados.capa];
    slideAtual = 0;

    // Cria uma bolinha de navegação para cada foto do carrossel.
    const dotsContainer = document.getElementById('dots-container');
    dotsContainer.innerHTML = '';
    fotosAtuais.forEach((_, i) => {
        const dot = document.createElement('span');
        dot.className = 'dot' + (i === 0 ? ' active' : '');
        dot.onclick = () => { slideAtual = i; atualizarSlide(); };
        dotsContainer.appendChild(dot);
    });

    // Cria uma amostra de cor para cada cor do produto; clicar nela mostra a foto correspondente (mesma posição).
    const containerCores = document.getElementById('sobre-cores');
    containerCores.innerHTML = '';
    (dados.cores || []).forEach((cor, i) => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch' + (i === 0 ? ' active' : '');
        swatch.style.backgroundColor = cor;
        swatch.onclick = () => { slideAtual = Math.min(i, fotosAtuais.length - 1); atualizarSlide(); };
        containerCores.appendChild(swatch);
    });

    // Mostra as imagens de detalhe (galeria) do produto.
    const containerGaleria = document.getElementById('sobre-galeria');
    containerGaleria.innerHTML = '';
    (dados.galeria || []).forEach((imgUrl) => {
        const img = document.createElement('img');
        img.src = imgUrl;
        containerGaleria.appendChild(img);
    });

    atualizarSlide();
    document.getElementById('modal-sobre').classList.add('active');
    // Registra o produto em "vistos recentemente" ([REDIS]).
    registrarRecente(slug);
}

// Mostra no modal a foto atual e destaca a bolinha e a cor correspondentes.
function atualizarSlide() {
    const imgPrincipal = document.getElementById('imagem-principal');
    if (fotosAtuais[slideAtual]) imgPrincipal.src = fotosAtuais[slideAtual];
    document.querySelectorAll('.dot').forEach((dot, i) => dot.classList.toggle('active', i === slideAtual));
    document.querySelectorAll('.color-swatch').forEach((sw, i) => sw.classList.toggle('active', i === slideAtual));
}

// Fecha o modal de consórcio (chamada pelo "×" do index.html).
function fecharModalConsorcio() { document.getElementById('modal-consorcio').classList.remove('active'); }

// ---------- Consórcio ([SUPABASE]) ----------
// Preenche o modal de consórcio com os planos do produto escolhido.
async function carregarTabelaConsorcio(idMoto, nomeExibicao) {
    const corpoTabela = document.getElementById('tabela-corpo-consorcio');
    const campoCredito = document.getElementById('consorcio-valor-credito');
    const campoNome = document.getElementById('consorcio-nome-moto');

    campoNome.innerText = nomeExibicao;
    campoCredito.innerText = "Carregando...";
    corpoTabela.innerHTML = "<tr><td colspan='2'>Buscando planos...</td></tr>";

    try {
        // [SUPABASE via API, com cache REDIS] Busca os planos (tabela planos_consorcio) pelo slug do produto.
        const resp = await fetch('/api/consorcio/' + encodeURIComponent(idMoto));
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const planos = await resp.json();

        // Mostra o valor do crédito do último plano e uma linha (prazo + parcela) para cada plano.
        campoCredito.innerText = planos.length ? planos[planos.length - 1].valor_credito : "Consulte-nos";
        corpoTabela.innerHTML = planos.length
            ? planos.map((p) => `
                <tr>
                    <td style="font-weight: 800; color: #333; font-size: 18px;">${esc(p.prazo)}</td>
                    <td style="color: #D90007; font-weight: 800; font-size: 18px;">${esc(p.valor_parcela)}</td>
                </tr>`).join('')
            : "<tr><td colspan='2'>Nenhum plano cadastrado.</td></tr>";
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        corpoTabela.innerHTML = "<tr><td colspan='2'>Erro ao carregar dados.</td></tr>";
    }
}

// ---------- Carrinho de compras ----------
// O carrinho fica só no navegador (localStorage), como lista de { id (slug), nome, preco, quantidade }.
let carrinho = [];
try { carrinho = JSON.parse(localStorage.getItem('carrinho') || '[]'); } catch (e) { carrinho = []; }

// Salva o carrinho no localStorage e redesenha o modal do carrinho.
function salvarCarrinho() {
    try { localStorage.setItem('carrinho', JSON.stringify(carrinho)); } catch (e) { }
    renderCarrinho();
}

// Mantém no carrinho só produtos que ainda existem e atualiza nome e preço com os valores atuais do catálogo.
function sincronizarCarrinhoComCatalogo() {
    carrinho = carrinho
        .filter((i) => porSlug[i.id])
        .map((i) => ({ ...i, nome: porSlug[i.id].nome, preco: Number(porSlug[i.id].preco) }));
    salvarCarrinho();
}

// Adiciona 1 unidade (ou soma se já estiver no carrinho) e registra o produto em "vistos recentemente" ([REDIS]).
function adicionarAoCarrinho(slug) {
    const p = porSlug[slug];
    if (!p) return;
    const existente = carrinho.find((i) => i.id === slug);
    if (existente) existente.quantidade++;
    else carrinho.push({ id: slug, nome: p.nome, preco: Number(p.preco), quantidade: 1 });
    salvarCarrinho();
    registrarRecente(slug);
}

// Soma preço x quantidade de todos os itens.
const totalCarrinho = () => carrinho.reduce((soma, i) => soma + i.preco * i.quantidade, 0);

// Atualiza o contador do botão flutuante, o total, o botão de comprar e a lista de itens do modal (com + / - / remover).
function renderCarrinho() {
    document.getElementById('carrinho-contador').textContent = carrinho.reduce((s, i) => s + i.quantidade, 0);
    document.getElementById('carrinho-total').textContent = brl(totalCarrinho());
    document.getElementById('btn-finalizar').disabled = carrinho.length === 0;
    document.getElementById('carrinho-itens').innerHTML = carrinho.length
        ? carrinho.map((i) => `
            <div class="carrinho-item" data-id="${esc(i.id)}">
                <div class="ci-info"><span class="ci-nome">${esc(i.nome)}</span><span class="ci-preco">${brl(i.preco * i.quantidade)}</span></div>
                <div class="ci-controles">
                    <button type="button" class="ci-menos">−</button>
                    <span class="ci-qtd">${i.quantidade}</span>
                    <button type="button" class="ci-mais">+</button>
                    <button type="button" class="ci-remover" title="Remover">🗑</button>
                </div>
            </div>`).join('')
        : '<p class="carrinho-vazio">Seu carrinho está vazio.</p>';
}

// ---------- Finalização do pedido (WhatsApp) ----------
// Monta a mensagem "Olá, gostaria de pedir: 1x Produto A, 2x Produto B. Total: R$ XX" e abre o WhatsApp.
function finalizarCompra() {
    if (!carrinho.length) return;
    // Texto dos itens no formato quantidade x nome, separados por vírgula.
    const itensTexto = carrinho.map((i) => `${i.quantidade}x ${i.nome}`).join(', ');
    const msg = `Olá, gostaria de pedir: ${itensTexto}. Total: ${brl(totalCarrinho())}`;

    // Abre o WhatsApp com a mensagem já preenchida (encodeURIComponent codifica o texto para a URL).
    window.open(`https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(msg)}`, '_blank');

    // Extra: envia o pedido à API, que o grava no [SUPABASE] (tabela pedidos) se a chave secreta estiver configurada. Falha aqui não impede a compra.
    fetch('/api/pedidos', {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: carrinho }),
    }).catch(() => { });

    // Esvazia o carrinho e fecha o modal depois de finalizar.
    carrinho = [];
    salvarCarrinho();
    document.getElementById('modal-carrinho').classList.remove('active');
}

// ---------- Cliques da página (delegação de eventos) ----------
// Um único ouvinte trata todos os botões, inclusive os dos cards criados dinamicamente.
document.addEventListener('click', function (e) {
    const target = e.target;
    const card = target.closest('.product-card');

    // Botão "Sobre a moto".
    if (target.closest('.open-sobre') && card) abrirSobre(card.dataset.moto);

    // Clique em um item da faixa "Vistos recentemente": abre o "Sobre a moto" desse produto.
    const recente = target.closest('.recent-item');
    if (recente) abrirSobre(recente.dataset.moto);

    // Botão "Plano de Consórcio": abre o modal e carrega os planos do [SUPABASE].
    if (target.closest('.open-consorcio') && card) {
        const nomeMoto = card.querySelector('.product-name').innerText;
        document.getElementById('modal-consorcio').classList.add('active');
        carregarTabelaConsorcio(card.dataset.moto, nomeMoto);
    }

    // Botão "Financiamento": abre o formulário já com a moto selecionada (cria a opção na lista se ela não existir).
    if (target.closest('.open-financiamento') && card) {
        const tituloMoto = card.querySelector('.product-name').innerText;
        const select = document.querySelector('#form-financiamento select[name="modelo_moto"]');

        if (![...select.options].some((o) => o.value === tituloMoto)) select.add(new Option(tituloMoto, tituloMoto));
        select.value = tituloMoto;
        document.getElementById('modal-financiamento').classList.add('active');
    }

    // Botão "Adicionar ao carrinho" (mostra "Adicionado!" por 1,2 s).
    if (target.closest('.add-carrinho') && card) {
        adicionarAoCarrinho(card.dataset.moto);
        const btn = target.closest('.add-carrinho');
        btn.textContent = '✔ Adicionado!';
        setTimeout(() => { btn.textContent = '🛒 Adicionar ao carrinho'; }, 1200);
    }
    // Botão flutuante do carrinho: abre o modal.
    if (target.closest('#btn-carrinho')) document.getElementById('modal-carrinho').classList.add('active');

    // Botões + / - / remover de cada item do carrinho.
    const linha = target.closest('.carrinho-item');
    if (linha) {
        const item = carrinho.find((i) => i.id === linha.dataset.id);
        if (item) {
            if (target.closest('.ci-mais')) item.quantidade++;
            if (target.closest('.ci-menos')) item.quantidade = Math.max(1, item.quantidade - 1);
            if (target.closest('.ci-remover')) carrinho = carrinho.filter((i) => i !== item);
            salvarCarrinho();
        }
    }
    // Esvaziar carrinho.
    if (target.closest('#btn-limpar-carrinho')) { carrinho = []; salvarCarrinho(); }
    // Comprar pelo WhatsApp.
    if (target.closest('#btn-finalizar')) finalizarCompra();

    // Fecha qualquer modal ao clicar no "×" ou fora da caixa.
    if (target.classList.contains('close-modal') || target.classList.contains('modal-overlay')) {
        document.querySelectorAll('.modal-overlay').forEach((m) => m.classList.remove('active'));
    }
});

// ---------- Inicialização ----------
// Ao abrir a página: lê o WhatsApp do servidor, desenha o carrinho, carrega o catálogo ([MONGODB]) e os vistos recentemente ([REDIS]).
(async function iniciar() {
    try { 
        // Lê o número do WhatsApp configurado no .env do servidor.
        const cfg = await (await fetch('/api/config')).json();
        if (cfg.whatsapp) numeroWhatsApp = cfg.whatsapp;
    } catch (e) { }
    renderCarrinho();
    await carregarCatalogo();
    carregarRecentes();
})();

// ---------- Financiamento (WhatsApp) ----------
// Máscaras de digitação: formatam telefone, CPF, data e valores em reais enquanto o cliente digita.
const mascaras = {
    telefone(v) {
        v = v.replace(/\D/g, "");
        v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
        v = v.replace(/(\d{5})(\d)/, "$1-$2");
        return v;
    },

    cpf(v) {
        v = v.replace(/\D/g, "");
        v = v.replace(/(\d{3})(\d)/, "$1.$2");
        v = v.replace(/(\d{3})(\d)/, "$1.$2");
        v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
        return v;
    },

    data(v) {
        v = v.replace(/\D/g, "");
        v = v.replace(/(\d{2})(\d)/, "$1/$2");
        v = v.replace(/(\d{2})(\d)/, "$1/$2");
        return v;
    },

    moeda(v) {
        v = v.replace(/\D/g, "");
        v = (v / 100).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
        return v;
    }
};

// Aplica a máscara certa conforme o campo digitado (pelo atributo name).
document.addEventListener('input', (e) => {
    const campo = e.target;
    const nome = campo.name;

    if (nome === 'telefone') campo.value = mascaras.telefone(campo.value);
    if (nome === 'cpf') campo.value = mascaras.cpf(campo.value);
    if (nome === 'data_nascimento') campo.value = mascaras.data(campo.value);
    if (nome === 'valor_entrada' || nome === 'renda_mensal') {
        campo.value = mascaras.moeda(campo.value);
    }
});

// Envio do formulário de financiamento: monta a mensagem e abre o WhatsApp. Esses dados NÃO são gravados em nenhum banco.
document.getElementById('form-financiamento').addEventListener('submit', function(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(this).entries());
    
    const mensagem = `*SOLICITAÇÃO DE FINANCIAMENTO*\n` +
                     `--------------------------\n` +
                     `*Moto:* ${d.modelo_moto}\n` +
                     `*Cliente:* ${d.nome}\n` +
                     `*CPF:* ${d.cpf}\n` +
                     `*Nascimento:* ${d.data_nascimento}\n` +
                     `*Cidade:* ${d.cidade}\n` +
                     `*Telefone:* ${d.telefone}\n` +
                     `*Renda Mensal:* ${d.renda_mensal}\n` +
                     `*Entrada:* ${d.valor_entrada}`;

    window.open(`https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensagem)}`, '_blank');
    this.reset();
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
});
