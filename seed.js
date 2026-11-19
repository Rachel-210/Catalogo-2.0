// =============================================================================
// seed.js — Carga inicial do catálogo. Rodar uma vez: npm run seed
// [MONGODB] grava (ou atualiza) as 16 motos na coleção "produtos".
// [REDIS]   limpa o cache da lista de produtos para o catálogo mostrar os dados novos na hora.
// Pode ser executado várias vezes: usa "upsert" pelo slug, então não duplica produtos.
// =============================================================================
// Carrega as variáveis do .env (MONGO_URI, MONGO_DB e REDIS_URL).
require('dotenv').config();
// [MONGODB] driver oficial.
const { MongoClient } = require('mongodb');
// [REDIS] cliente do Redis.
const { createClient } = require('redis');

// Lista dos produtos iniciais. Cada objeto vira UM documento da coleção "produtos" do [MONGODB], com os campos:
// slug (identificador, mesmo id_moto usado nos planos do Supabase), nome, descricao, preco, categoria,
// capa (imagem do card), cores (cores CSS), fotos (carrossel, na ordem das cores) e galeria (fotos de detalhe).
// Os caminhos das imagens são relativos à pasta public/.
const MOTOS = [
  {
    "slug": "neos",
    "nome": "NEO'S CONNECTED",
    "descricao": "A Neo’s Connected é a scooter da Yamaha que combina modernidade, praticidade e tecnologia. Leve e ágil, é ideal para o dia a dia na cidade, oferecendo conforto e economia. Seu design elegante aliado à conectividade garante mais segurança e praticidade em cada trajeto.",
    "preco": 22329,
    "categoria": "Scooter",
    "capa": "carrosselNEO/NEO-capa.png",
    "cores": [
      "#8fb3b9",
      "#f0f0f0",
      "#000000"
    ],
    "fotos": [
      "carrosselNEO/neo1.png",
      "carrosselNEO/neo2.png",
      "carrosselNEO/neo3.png"
    ],
    "galeria": [
      "carrosselNEO/amostra3.avif",
      "carrosselNEO/amostra2.avif",
      "carrosselNEO/amostra1.avif"
    ]
  },
  {
    "slug": "fluo",
    "nome": "FLUO HYBRID CONNECTED",
    "descricao": "A Fluo ABS Hybrid Connected é uma scooter urbana moderna com sistema híbrido leve e tecnologia avançada. Seu motor 125 cc entrega 8,3 cv com funcionamento suave e econômico. Conta com tecnologia híbrida Power Assist, sistema Stop & Start e freios ABS para mais segurança no trânsito. O painel 100% digital é conectado e o amplo espaço interno garante praticidade no dia a dia. Uma scooter inteligente feita para mobilidade eficiente e confortável.",
    "preco": 19009,
    "categoria": "Scooter",
    "capa": "carrosselFLUOH/FLUO-Capa.png",
    "cores": [
      "#0b6476",
      "#000000",
      "#9c9797"
    ],
    "fotos": [
      "carrosselFLUOH/fluo1.png",
      "carrosselFLUOH/fluo2.png",
      "carrosselFLUOH/fluo3.png"
    ],
    "galeria": [
      "carrosselFLUOH/amostra1.png",
      "carrosselFLUOH/amostra2.png",
      "carrosselFLUOH/amostra3.png"
    ]
  },
  {
    "slug": "nmax",
    "nome": "NMAX ABS CONNECTED",
    "descricao": "A NMAX ABS Connected chegou para transformar sua experiência sobre duas rodas. Com motor potente e econômico, freios ABS para máxima segurança e conectividade para deixar sua rotina mais prática, ela une tecnologia, conforto e estilo em uma scooter que acompanha o seu ritmo.",
    "preco": 26056,
    "categoria": "Scooter",
    "capa": "carrosselNMAX/NMAX-Capa.png",
    "cores": [
      "#05349a",
      "#462626",
      "#da0d0d"
    ],
    "fotos": [
      "carrosselNMAX/nmax1.png",
      "carrosselNMAX/nmax2.png",
      "carrosselNMAX/nmax3.png"
    ],
    "galeria": [
      "carrosselNMAX/amostra1.png",
      "carrosselNMAX/amostra2.png",
      "carrosselNMAX/amostra3.png"
    ]
  },
  {
    "slug": "xmax",
    "nome": "XMAX 300 CONNECTED",
    "descricao": "A Nova XMAX 300 Connected é uma scooter premium que une potência, tecnologia e sofisticação. Equipada com o novo motor de 300cc e câmbio automático, oferece uma pilotagem ágil, confortável e eficiente. Ideal para quem valoriza desempenho, estilo e tecnologia em cada trajeto.",
    "preco": 42326,
    "categoria": "Scooter",
    "capa": "carrosselXMAX/XMAX-Capa.png",
    "cores": [
      "#3f2a21",
      "#141313",
      "#757575"
    ],
    "fotos": [
      "carrosselXMAX/xmax1.png",
      "carrosselXMAX/xmax2.png",
      "carrosselXMAX/xmax3.png"
    ],
    "galeria": [
      "carrosselXMAX/amostra1.avif",
      "carrosselXMAX/amostra2.avif",
      "carrosselXMAX/amostra3.avif"
    ]
  },
  {
    "slug": "fz15",
    "nome": "FZ15 ABS CONNECTED",
    "descricao": "A FAZER FZ15 ABS CONNECTED é a companheira ideal para o seu dia a dia na cidade. Com seu motor de 150cc, conhecido pela durabilidade e economia com a versatilidade da tecnologia Blueflex, cada trajeto se torna uma experiência única.",
    "preco": 24319,
    "categoria": "Street",
    "capa": "carrosselFZ15/FZ15-Capa.png",
    "cores": [
      "#070707",
      "#938e8e",
      "#c40909",
      "#03052d"
    ],
    "fotos": [
      "carrosselFZ15/fz1.png",
      "carrosselFZ15/fz2.png",
      "carrosselFZ15/fz3.png",
      "carrosselFZ15/fz4.png"
    ],
    "galeria": [
      "carrosselFZ15/amostra1.png",
      "carrosselFZ15/amostra2.png",
      "carrosselFZ15/amostra3.avif"
    ]
  },
  {
    "slug": "fz25",
    "nome": "FZ25 ABS CONNECTED",
    "descricao": "O motor de 250 cilindradas da FAZER FZ25 CONNECTED é reconhecido em todo o Brasil por seu desempenho, eficiência e confiabilidade. Com potência e torque ideais, é perfeito para uso urbano e em viagens, além de exigir uma manutenção simples.",
    "preco": 28502,
    "categoria": "Street",
    "capa": "carrosselFZ25/FZ25-Capa.png",
    "cores": [
      "#938e8e",
      "#03052d",
      "#fefeff",
      "#c40909"
    ],
    "fotos": [
      "carrosselFZ25/fz251.png",
      "carrosselFZ25/fz252.png",
      "carrosselFZ25/fz253.png",
      "carrosselFZ25/fz254.png"
    ],
    "galeria": [
      "carrosselFZ25/amostra1.png",
      "carrosselFZ25/amostra2.png",
      "carrosselFZ25/amostra3.png"
    ]
  },
  {
    "slug": "factor",
    "nome": "FACTOR",
    "descricao": "A Nova FACTOR é a escolha ideal para quem busca uma motocicleta confiável e eficiente para o dia a dia. O motor durável, econômico, conta com a tecnologia Blueflex e autonomia de sobra para rodar o dia todo. Pronta para desbravar novos caminhos, a nova FACTOR é mais do que uma moto, é a sua parceira em todas as conquistas.",
    "preco": 21351,
    "categoria": "Street",
    "capa": "carrosselFACTOR/FACTOR-Capa.png",
    "cores": [
      "#fefeff",
      "#0d0d0d",
      "#c40909"
    ],
    "fotos": [
      "carrosselFACTOR/factor1.png",
      "carrosselFACTOR/factor2.png",
      "carrosselFACTOR/factor3.png"
    ],
    "galeria": [
      "carrosselFACTOR/amostra1.avif",
      "carrosselFACTOR/amostra2.avif",
      "carrosselFACTOR/amostra3.avif"
    ]
  },
  {
    "slug": "factordx",
    "nome": "FACTOR DX",
    "descricao": "A Yamaha Factor DX é uma street urbana moderna, prática e eficiente para o dia a dia. Equipada com motor flex de 149 cc, entrega até 12 cv de potência e torque equilibrado. Seu painel digital e farol de LED aumentam a tecnologia e conforto na pilotagem. Design funcional e soluções modernas tornam seus trajetos mais ágeis e confiáveis. Uma moto versátil que une economia, estilo e desempenho para uso urbano.",
    "preco": 21805,
    "categoria": "Street",
    "capa": "carrosselFACTORDX/FACTORDX-Capa.png",
    "cores": [
      "#b6b6b8",
      "#0300b4",
      "#232323"
    ],
    "fotos": [
      "carrosselFACTORDX/factordx1.png",
      "carrosselFACTORDX/factordx2.png",
      "carrosselFACTORDX/factordx3.png"
    ],
    "galeria": [
      "carrosselFACTORDX/amostra1.png",
      "carrosselFACTORDX/amostra2.png",
      "carrosselFACTORDX/amostra3.png"
    ]
  },
  {
    "slug": "crosser150s",
    "nome": "CROSSER 150 S",
    "descricao": "Considerada a SUV das motocicletas, a Crosser S é alta, robusta e versátil. Equipada com motor 150 cc flex e sistema ABS para mais segurança. Enfrenta asfalto e terra com resistência e economia no dia a dia. Conta com conjunto óptico em LED e painel 100% digital multifuncional. Uma trail urbana completa para quem busca conforto e praticidade.",
    "preco": 25967,
    "categoria": "Trail",
    "capa": "carrosselCROSSER150S/Capa.png",
    "cores": [
      "#0d0d0d",
      "#c40909"
    ],
    "fotos": [
      "carrosselCROSSER150S/price1.png",
      "carrosselCROSSER150S/price2.png"
    ],
    "galeria": [
      "carrosselCROSSER150S/amostra1.png",
      "carrosselCROSSER150S/amostra2.png",
      "carrosselCROSSER150S/amostra3.png"
    ]
  },
  {
    "slug": "crosserz",
    "nome": "CROSSER 150 Z",
    "descricao": "A Crosser Z é a escolha perfeita para quem procura um motor flex de 150cc que entrega resistência para o dia a dia, possui sistema ABS, que evita o travamento da roda dianteira nas frenagens bruscas. O motor durável e econômico, conta com a tecnologia Blueflex, para escolher entre gasolina, etanol ou ambos, o que for melhor para você.",
    "preco": 26180,
    "categoria": "Trail",
    "capa": "carrosselCROSSERZ/capa.png",
    "cores": [
      "#0510d6",
      "#c40909",
      "#225e22"
    ],
    "fotos": [
      "carrosselCROSSERZ/1.png",
      "carrosselCROSSERZ/2.png",
      "carrosselCROSSERZ/3.png"
    ],
    "galeria": [
      "carrosselCROSSERZ/amostra1.png",
      "carrosselCROSSERZ/amostra2.png",
      "carrosselCROSSERZ/amostra3.png"
    ]
  },
  {
    "slug": "lander",
    "nome": "Lander Connected",
    "descricao": "Com o motor de 250 cilindradas da LANDER CONNECTED se destaca por sua impressionante durabilidade e eficiência. Possui sistema ABS, que evita o travamento da roda dianteira nas frenagens bruscas ou em baixa aderência como dias de chuva, garantindo maior controle na pilotagem.",
    "preco": 32263,
    "categoria": "Trail",
    "capa": "carrosselLANDER/capa.png",
    "cores": [
      "#714806",
      "#908d8d",
      "#0e28d1",
      "#81ab81"
    ],
    "fotos": [
      "carrosselLANDER/1.png",
      "carrosselLANDER/2.png",
      "carrosselLANDER/3.png",
      "carrosselLANDER/4.png"
    ],
    "galeria": [
      "carrosselLANDER/amostra1.png",
      "carrosselLANDER/amostra2.png",
      "carrosselLANDER/amostra3.png"
    ]
  },
  {
    "slug": "mt03",
    "nome": "MT-03",
    "descricao": "Inspirada no conceito Dark Side of Japan, a nova MT-03 traz um design ainda mais ousado, com a traseira totalmente renovada e maior aerodinâmica, além de novas cores e detalhes refinados. Uma naked feita para quem busca exclusividade e atitude.",
    "preco": 38164,
    "categoria": "Naked",
    "capa": "carrosselMT03/capa.png",
    "cores": [
      "#f7f7f7",
      "#101010",
      "#0820b9"
    ],
    "fotos": [
      "carrosselMT03/1.png",
      "carrosselMT03/2.png",
      "carrosselMT03/3.png"
    ],
    "galeria": [
      "carrosselMT03/amostra1.jpg",
      "carrosselMT03/amostra2.jpg",
      "carrosselMT03/amostra3.jpg"
    ]
  },
  {
    "slug": "mt07",
    "nome": "MT-07",
    "descricao": "A nova MT-07 evoluiu em estilo e funcionalidade. O novo farol, com projetor e DRL Full LED, destaca seu visual agressivo, enquanto as setas dianteiras e traseiras de LED garantem mais modernidade e visibilidade. Além disso, os novos comandos intuitivos permitem explorar todas as funções do menu com mais facilidade.",
    "preco": 59772,
    "categoria": "Naked",
    "capa": "carrosselMT07/capa.png",
    "cores": [
      "#f7f7f7",
      "#101010",
      "#0820b9"
    ],
    "fotos": [
      "carrosselMT07/1.png",
      "carrosselMT07/2.png",
      "carrosselMT07/3.png"
    ],
    "galeria": [
      "carrosselMT07/amostra1.jpg",
      "carrosselMT07/amostra2.jpg",
      "carrosselMT07/amostra3.jpg"
    ]
  },
  {
    "slug": "r3",
    "nome": "R3 ABS CONNECTED",
    "descricao": "Design atualizado para surpreender, com um duto de admissão em forma de M, inspirado na consagrada YZR-M1. A iluminação Full Led com novos faróis duplos com projetor, defletores aerodinâmicos integrados e novas carenagens em multicamadas trazem uma impressão ainda mais esportiva para a nova R3 Connected.",
    "preco": 41383,
    "categoria": "Esportiva",
    "capa": "carrosselR3/capa.png",
    "cores": [
      "#f7f7f7",
      "#101010",
      "#0820b9"
    ],
    "fotos": [
      "carrosselR3/1.png",
      "carrosselR3/2.png",
      "carrosselR3/3.png"
    ],
    "galeria": [
      "carrosselR3/amostra1.avif",
      "carrosselR3/amostra2.avif",
      "carrosselR3/amostra3.avif"
    ]
  },
  {
    "slug": "r15",
    "nome": "R15 ABS",
    "descricao": "Com câmbio de 6 marchas, a R15 possui potente motor monocilíndrico de 155cc, com refrigeração líquida e Sistema de Atuação de Válvula Variável, que garante agilidade nas arrancadas e retomadas. Eficiente e econômica, atinge potência máxima de 18,8cv a 10.000 rpm. A tecnologia DiASil da Yamaha, contribui para uma menor vibração, melhor dissipação de calor e ganho de performance.",
    "preco": 26063,
    "categoria": "Esportiva",
    "capa": "carrosselR15/capa.png",
    "cores": [
      "#f7f7f7",
      "#101010",
      "#0820b9"
    ],
    "fotos": [
      "carrosselR15/1.png",
      "carrosselR15/2.png",
      "carrosselR15/3.png"
    ],
    "galeria": [
      "carrosselR15/amostra1.png",
      "carrosselR15/amostra2.png",
      "carrosselR15/amostra3.png"
    ]
  },
  {
    "slug": "aerox",
    "nome": "Aerox ABS Connected",
    "descricao": "Projetada para quem quer viver com estilo, a nova Aerox conta com carenagens de linhas expressivas e aerodinâmica que oferece manobras mais ágeis, com distância do solo de 145 mm e sendo o modelo mais leve da categoria, com apenas 127 kg de peso líquido, garantindo uma pilotagem prazerosa em qualquer trajeto.",
    "preco": 21688,
    "categoria": "Scooter",
    "capa": "carrosselAEROX/capa.png",
    "cores": [
      "#0810a6",
      "#252525",
      "#797a7d"
    ],
    "fotos": [
      "carrosselAEROX/1.png",
      "carrosselAEROX/2.png",
      "carrosselAEROX/3.png"
    ],
    "galeria": [
      "carrosselAEROX/amostra1.png",
      "carrosselAEROX/amostra2.png",
      "carrosselAEROX/amostra3.png"
    ]
  }
];

// ---------- Execução ----------
(async () => {
  // [MONGODB] Cria o cliente com a MONGO_URI.
  const mongo = new MongoClient(process.env.MONGO_URI);
  // [MONGODB] Abre a conexão.
  await mongo.connect();
  // [MONGODB] Seleciona o banco (MONGO_DB, padrão "catalogo") e a coleção "produtos".
  const col = mongo.db(process.env.MONGO_DB || 'catalogo').collection('produtos');

  // [MONGODB] Índice único no slug: impede produtos duplicados.
  await col.createIndex({ slug: 1 }, { unique: true });

  // Prepara uma operação "upsert" para cada moto: se o slug já existe atualiza, senão insere.
  const ops = MOTOS.map((m, i) => ({
    updateOne: {
      // Procura o documento pelo slug.
      filter: { slug: m.slug },
      // Define os campos do produto, marca como ativo e usa uma data de criação crescente para manter a ordem do catálogo.
      update: { $set: { ...m, ativo: true, criadoEm: new Date(Date.UTC(2024, 0, 1, 0, 0, i)) } },
      // Cria o documento se ele não existir.
      upsert: true,
    },
  }));
  // [MONGODB] Executa todas as operações de uma vez e mostra quantos produtos foram inseridos/atualizados.
  const r = await col.bulkWrite(ops);
  console.log(`MongoDB: ${r.upsertedCount} inseridas, ${r.modifiedCount} atualizadas.`);
  // [MONGODB] Fecha a conexão.
  await mongo.close();

  // [REDIS] Se houver REDIS_URL, limpa o cache da lista de produtos (a falha aqui só gera um aviso).
  if (process.env.REDIS_URL) {
    try {
      // [REDIS] Cria o cliente.
      const redis = createClient({ url: process.env.REDIS_URL });
      // [REDIS] Abre a conexão.
      await redis.connect();
      // [REDIS] Apaga a chave do cache do catálogo (a mesma CACHE_KEY do server.js).
      await redis.del('cache:produtos');
      // [REDIS] Fecha a conexão.
      await redis.quit();
      console.log('Redis: cache do catálogo limpo.');
    } catch (e) { console.warn('Aviso: não consegui limpar o cache Redis:', e.message); }
  }
// Se algo falhar (ex.: senha do Mongo errada), mostra o motivo e encerra com erro.
})().catch((e) => { console.error('Erro no seed:', e.message); process.exit(1); });
