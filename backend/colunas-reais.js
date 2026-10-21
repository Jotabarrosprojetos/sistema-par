// LEVANTAMENTO SOMENTE LEITURA — nenhum ALTER/UPDATE/INSERT/DELETE.
// Mostra as colunas que REALMENTE existem hoje na tabela Terceirizados
// (banco de produção), pra comparar com o que o código (CREATE TABLE em
// postgresService.js e os INSERTs em terceirizados.js/clickupService.js)
// assume que existe. O erro "column Valor_Estimado does not exist" no
// levantamento-formato-valores.js mostra que o código e o banco real
// divergiram em algum momento.
//   node colunas-reais.js
require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  });
  try {
    await client.connect();
    const res = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
      ['Terceirizados']
    );
    console.log('=== Colunas reais de "Terceirizados" no banco de produção ===');
    console.log(res.rows.map(r => `${r.column_name} (${r.data_type})`).join('\n'));

    // Campos que o código tenta gravar hoje (POST em terceirizados.js,
    // INSERT em clickupService.js) — pra comparar de olho com a lista acima.
    const esperados = [
      'ID', 'ID_Projeto', 'Servico', 'Descricao_Servico', 'Fornecedor',
      'CNPJ_CPF', 'Nr_Contrato', 'Valor_Estimado', 'Valor_Contratado',
      'Valor_Pago', 'Status', 'ID_Tarefa_ClickUp', 'ID_Medicao_Vinculada',
      'Percentual_do_Total', 'Data_Entrega_Prevista', 'Data_Vencimento',
      'Data_Entrega_Real', 'Observacao', 'Nr_NF', 'Data_Pagamento',
      'Link_Contrato', 'Aprovado_Por', 'Criado_Em', 'Setor', 'OC',
      'Status_ClickUp', 'Etapa_ClickUp', 'Responsavel',
    ];
    const colunasReais = new Set(res.rows.map(r => r.column_name));
    const faltando = esperados.filter(c => !colunasReais.has(c));
    console.log('\n=== Campos que o código tenta gravar mas NÃO existem na tabela real ===');
    console.log(faltando.length ? faltando.join(', ') : '(nenhum — tudo bate)');
  } catch (err) {
    console.error('ERRO:', err.message);
  } finally {
    await client.end();
  }
})();
