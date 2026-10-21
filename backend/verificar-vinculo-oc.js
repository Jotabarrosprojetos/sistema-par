// SOMENTE LEITURA — só faz GET na API do OPP e no banco, não grava nada.
// Testa de verdade, direto na API, se existe algum campo que ligue uma
// Ordem de Compra a uma Conta a Pagar. Reaproveita o oppRequest() que já
// existe em src/services/oppService.js (mesmas credenciais do .env) — não
// depende do servidor (Railway) estar no ar, roda local.
//   node verificar-vinculo-oc.js
require('dotenv').config();
const { Client } = require('pg');
const { oppRequest } = require('./src/services/oppService');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  });
  try {
    await client.connect();

    // Pega 3 Ordens de Compra reais já sincronizadas, de preferência já pagas
    // (mais chance de ter uma conta a pagar de verdade ligada a ela).
    const res = await client.query(
      `SELECT "ID_OC", "Nome_Fornecedor", "Valor_Total", "Situacao" FROM "OrdensCompra_OPP" ORDER BY "Sincronizado_Em" DESC LIMIT 200`
    );
    const candidatas = res.rows.filter(r => (r.Situacao || '').toLowerCase().includes('atend') || (r.Situacao || '').toLowerCase().includes('pago'))
      .slice(0, 3);
    const amostra = candidatas.length ? candidatas : res.rows.slice(0, 3);

    console.log('=== Ordens de Compra testadas ===');
    console.log(amostra.map(o => `${o.ID_OC} — ${o.Nome_Fornecedor} — R$${o.Valor_Total} — ${o.Situacao}`).join('\n'));

    for (const oc of amostra) {
      console.log(`\n\n########## OC ${oc.ID_OC} (${oc.Nome_Fornecedor}) ##########`);

      // 1. Detalhe completo da OC na API — todos os campos, sem filtrar nada.
      try {
        const detalhe = await oppRequest('GET', `/ordens-compra/${oc.ID_OC}`);
        console.log('\n--- GET /ordens-compra/' + oc.ID_OC + ' (TODOS os campos) ---');
        console.log(JSON.stringify(detalhe, null, 2));
      } catch (e) {
        console.log('\n--- GET /ordens-compra/' + oc.ID_OC + ' falhou: ' + e.message + ' ---');
      }

      // 2. Tenta o filtro id_pedido em /contas-pagar — pra ver se a API
      // realmente ignora (como o comentário no código diz) ou se funciona.
      try {
        const hoje = new Date().toISOString().split('T')[0];
        const doisAnosAtras = new Date(); doisAnosAtras.setFullYear(doisAnosAtras.getFullYear() - 2);
        const inicio = doisAnosAtras.toISOString().split('T')[0];
        const filtradas = await oppRequest('GET', `/contas-pagar?id_pedido=${oc.ID_OC}&data_inicio=${inicio}&data_fim=${hoje}&limit=10`);
        const lista = Array.isArray(filtradas) ? filtradas : (filtradas?.data || []);
        console.log(`\n--- GET /contas-pagar?id_pedido=${oc.ID_OC} — ${lista.length} resultado(s) ---`);
        if (lista.length) {
          console.log('TODOS os campos da 1ª conta retornada:', Object.keys(lista[0]).join(', '));
          console.log(JSON.stringify(lista[0], null, 2));
        }
      } catch (e) {
        console.log(`\n--- GET /contas-pagar?id_pedido=${oc.ID_OC} falhou: ${e.message} ---`);
      }
    }

    // 3. Amostra geral de /contas-pagar (sem filtro), pra listar TODOS os
    // campos que a API oferece numa conta a pagar qualquer — talvez exista
    // um campo de referência que ninguém tentou usar ainda.
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const umAnoAtras = new Date(); umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
      const inicio = umAnoAtras.toISOString().split('T')[0];
      const geral = await oppRequest('GET', `/contas-pagar?data_inicio=${inicio}&data_fim=${hoje}&limit=5`);
      const lista = Array.isArray(geral) ? geral : (geral?.data || []);
      console.log('\n\n=== Amostra geral de /contas-pagar — todos os campos disponíveis ===');
      if (lista.length) {
        console.log('Campos:', Object.keys(lista[0]).join(', '));
        console.log(JSON.stringify(lista.slice(0, 2), null, 2));
      } else {
        console.log('(nenhum resultado)');
      }
    } catch (e) {
      console.log('Amostra geral falhou: ' + e.message);
    }
  } catch (err) {
    console.error('ERRO:', err.message);
  } finally {
    await client.end();
  }
})();
