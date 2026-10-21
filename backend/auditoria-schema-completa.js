// LEVANTAMENTO SOMENTE LEITURA — nenhum ALTER/UPDATE/INSERT/DELETE.
// Confere, pra TODAS as tabelas que o código conhece (não só Terceirizados),
// se alguma coluna que o código espera (lista tirada direto do CREATE TABLE
// de postgresService.js) está faltando no banco real — exatamente a mesma
// categoria de bug achada hoje (21/10/2026) em Terceirizados (9 colunas
// faltando, que travava toda criação nova com "column does not exist").
// Essa checagem só pega o que está declarado no CREATE TABLE do código;
// não substitui revisar campo a campo cada rota, mas pega de olho qualquer
// outra tabela com o mesmo tipo de divergência antes que ela exploda em
// produção do mesmo jeito.
//   node auditoria-schema-completa.js
require('dotenv').config();
const { Client } = require('pg');

const ESPERADO = {
  USER: ['ID','Nome','Email','Senha_Hash','Perfil','Empresa','Ativo','Criado_Em','Ultimo_Login'],
  Projetos_Contratos: ['ID_Projeto','Nome','Cliente','Valor_Global','Teto_Terc_Perc','Teto_Terc_Valor','ID_ClickUp','Centro_Custo_OPP','Status','Progresso_Perc','Data_Inicio','Data_Entrega_Contrato','Data_Entrega_Planejada','Empresa','Setor','Tipologia','Link_ClickUp','Criado_Em','Atualizado_Em','Responsavel','ID_OPP_Cliente','ID_Tarefa_Notificacoes_PAR'],
  Planejamentos: ['ID','ID_Projeto','Nome_Projeto','Cliente','Nr_Contrato_OS','Resp_Planejamento','Resp_Aprovacao','Setor','Tipologia','Empresa','Link_ClickUp','Valor_Contrato','Impostos_Perc','Taxa_Adm_Perc','Comissao_Perc','Data_Inicio_OS','Data_Entrega_Contrato','Data_Entrega_Planejada','Status','Justificativa','Comentario_Aprovacao','Justificativa_Replanejamento','Snapshot_Anterior','Criado_Por','Criado_Em','Aprovado_Por','Aprovado_Em','Dados_JSON','Nr_OS_OPP','Data_OS_Externa','Travado','Travado_Em','Travado_Por'],
  Medicoes: ['ID_Medicao','ID_Projeto','Etapa','Percentual','Valor','Data_Previsao','Data_Realizacao','Status_Fisico','Status_Financeiro','ID_Tarefa_ClickUp','Nr_NF','Data_Emissao_NF','Data_Vencimento','Data_Recebimento','Observacao'],
  Terceirizados: ['ID','ID_Projeto','Servico','Fornecedor','Valor_Contratado','Valor_Pago','Status','ID_Tarefa_ClickUp','ID_Medicao_Vinculada','Percentual_do_Total','Data_Entrega_Prevista','Data_Entrega_Real','Observacao','Aprovado_Por','Criado_Em','OC','Status_ClickUp','Etapa_ClickUp','Responsavel','Descricao_Servico','CNPJ_CPF','Nr_Contrato','Valor_Estimado','Data_Vencimento','Nr_NF','Data_Pagamento','Link_Contrato','Setor'],
  Equipe_Planejamento: ['ID','ID_Planejamento','Colaborador','Media_Hora','Horas_Estimadas','Total'],
  Despesas_Planejamento: ['ID','ID_Planejamento','Descricao','Valor'],
  Log_Horas: ['ID','ID_Projeto','Colaborador','Horas_Estimadas','Horas_Logadas','Custo_Calculado','Data','ID_TimeEntry_ClickUp'],
  Custos_OPP: ['ID','ID_Projeto','Centro_Custo','Descricao','Valor_Lancado','Data_Lancamento','Tipo','Fornecedor_Cliente','Nr_Documento','ID_Importacao'],
  Alertas: ['ID','Tipo_Alerta','ID_Projeto','Mensagem','Data_Geracao','Setor_Destino','Visto_Por','Status','Nivel','Link_ClickUp'],
  Log_Importacoes: ['ID','Data_Upload','Arquivo','Usuario','Registros_Processados','Erros','Status','Detalhes'],
  Configuracoes: ['Chave','Valor','Descricao'],
  Financeiro_OPP: ['ID_OPP','Tipo','Profissional','Categoria','Descricao','Valor','Data_Vencimento','Data_Competencia','Situacao','ID_Cliente_OPP','Nome_Cliente','Nr_Documento','Nr_OS_OPP','OC','Sincronizado_Em'],
  OrdensCompra_OPP: ['ID_OC','ID_Ordem_OPP','Nome_Fornecedor','Valor_Total','Valor_Liquidado','Data_Pedido','Situacao','Observacao','Sincronizado_Em'],
  OrdensServico_OPP: ['ID_OS_OPP','ID_Ordem_OPP','ID_Cliente_OPP','Nome_Cliente','Referencia','Problema','Observacao','Valor_Total','Status','Data_Pedido','Data_Entrega','Data_Realizacao','Sincronizado_Em'],
  Auditoria: ['ID_Auditoria','Tabela','Acao','ID_Registro','Nome_Registro','Dados_Antes','Dados_Depois','Usuario_ID','Usuario_Nome','Usuario_Email','Criado_Em'],
};

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  });
  try {
    await client.connect();
    console.log('Conectado ao banco com sucesso.\n');

    let algumProblema = false;
    for (const [tabela, colunasEsperadas] of Object.entries(ESPERADO)) {
      const res = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
        [tabela]
      );
      if (res.rows.length === 0) {
        console.log(`[${tabela}] TABELA NÃO EXISTE no banco real.`);
        algumProblema = true;
        continue;
      }
      const colunasReais = new Set(res.rows.map(r => r.column_name));
      const faltando = colunasEsperadas.filter(c => !colunasReais.has(c));
      if (faltando.length > 0) {
        console.log(`[${tabela}] FALTANDO: ${faltando.join(', ')}`);
        algumProblema = true;
      }
    }
    if (!algumProblema) {
      console.log('Nenhuma divergência encontrada — todas as colunas que o código espera existem de verdade no banco, em todas as tabelas.');
    }
  } catch (err) {
    console.error('ERRO:', err.message);
  } finally {
    await client.end();
  }
})();
