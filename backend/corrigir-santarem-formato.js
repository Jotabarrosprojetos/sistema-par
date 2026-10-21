// node corrigir-santarem-formato.js            → modo dry-run (só mostra o que mudaria)
// node corrigir-santarem-formato.js --apply     → aplica a correção nos 2 registros
//
// Corrige EXATAMENTE os 2 registros achados pelo levantamento-formato-valores.js
// com valor gravado em formato americano ("47370.88" em vez de "47370,88"):
//   - Planejamentos.ID = 6a636cec-7e43-4aac-8379-21826407abe7 (Valor_Contrato)
//   - Projetos_Contratos.ID_Projeto = 5dfe9b1e-a692-4527-b0ad-4d95110e1765 (Valor_Global)
// Ambos do projeto ARQ-2026-4-AGÊNCIA DE CORREIOS DE SANTARÉM.
//
// Não faz varredura geral — só troca o ponto decimal por vírgula nesses 2 IDs
// específicos, depois de confirmar que o valor atual ainda é exatamente "47370.88"
// (se alguém já tiver corrigido manualmente, o script não mexe em nada).
require('dotenv').config();
const { Client } = require('pg');

const ALVOS = [
  { tabela: 'Planejamentos', coluna: 'Valor_Contrato', idColuna: 'ID', id: '6a636cec-7e43-4aac-8379-21826407abe7', valorEsperado: '47370.88' },
  { tabela: 'Projetos_Contratos', coluna: 'Valor_Global', idColuna: 'ID_Projeto', id: '5dfe9b1e-a692-4527-b0ad-4d95110e1765', valorEsperado: '47370.88' },
];

const APPLY = process.argv.includes('--apply');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  console.log('Conectado.\n');

  for (const alvo of ALVOS) {
    const res = await client.query(`SELECT "${alvo.coluna}" as valor FROM "${alvo.tabela}" WHERE "${alvo.idColuna}" = $1`, [alvo.id]);
    if (res.rows.length === 0) {
      console.log(`[${alvo.tabela}] ID ${alvo.id} não encontrado — pulando.`);
      continue;
    }
    const atual = res.rows[0].valor;
    if (atual !== alvo.valorEsperado) {
      console.log(`[${alvo.tabela}] Valor atual ("${atual}") é diferente do esperado ("${alvo.valorEsperado}") — já foi alterado por outra coisa, NÃO vou mexer. Confira manualmente.`);
      continue;
    }
    const novo = atual.replace('.', ',');
    console.log(`[${alvo.tabela}.${alvo.coluna}] ID ${alvo.id}: "${atual}" → "${novo}"`);
    if (APPLY) {
      await client.query(`UPDATE "${alvo.tabela}" SET "${alvo.coluna}" = $1 WHERE "${alvo.idColuna}" = $2`, [novo, alvo.id]);
      console.log('  gravado.');
    }
  }

  if (!APPLY) {
    console.log('\nModo dry-run — nada foi alterado. Revise acima e rode de novo com --apply para gravar.');
  } else {
    console.log('\nCorreção aplicada.');
  }
  await client.end();
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
