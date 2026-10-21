// SOMENTE LEITURA.
// Acha a O.S. real no OPP ligada à medição "15ª MEDIÇÃO - NF_Nº503" do
// projeto Calçadão (APUIARÉS), pra ver exatamente qual campo de data
// (Data_Realizacao, Data_Entrega ou Data_Pedido) virou o "17/07/2026" que
// aparece na tela de Medições & Faturamento.
//   node verificar-data-medicao.js
require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  });
  try {
    await client.connect();

    const proj = await client.query(
      `SELECT "ID_Projeto", "Nome", "Cliente" FROM "Projetos_Contratos" WHERE "Nome" ILIKE $1`,
      ['%APUIAR%']
    );
    console.log('=== Projeto(s) encontrado(s) ===');
    console.log(JSON.stringify(proj.rows, null, 2));

    // Busca a O.S. real pela referência (contém "503" ou "15")
    const os = await client.query(
      `SELECT * FROM "OrdensServico_OPP" WHERE "Referencia" ILIKE $1 OR "Referencia" ILIKE $2`,
      ['%503%', '%15%MEDI%']
    );
    console.log('\n=== Ordem(ns) de Serviço candidatas (Referencia contém 503 ou "15 MEDI...") ===');
    console.log(JSON.stringify(os.rows, null, 2));
  } catch (err) {
    console.error('ERRO:', err.message);
  } finally {
    await client.end();
  }
})();
