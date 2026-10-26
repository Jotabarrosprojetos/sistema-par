const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
      max: 10,
      // Era 30000 (30s) — medido com dados reais (21/10/2026,
      // diagnosticar-performance.js) que uma conexão NOVA com o pooler do
      // Supabase custa ~1000-1200ms de handshake, contra ~100-180ms de uma
      // conexão já aberta. Com 30s de idle timeout, o Dashboard (que dispara
      // várias chamadas em paralelo, cada uma precisando de conexão) acaba
      // pagando esse handshake de novo toda vez que o usuário passa mais de
      // 30s sem acessar o PAR — ou seja, quase sempre. 5 minutos cobre o
      // intervalo normal entre cliques/telas sem manter conexão parada pra
      // sempre.
      idleTimeoutMillis: 5 * 60 * 1000,
      connectionTimeoutMillis: 5000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });
    pool.on('error', (err) => {
      console.error('[PostgreSQL] Erro no pool (conexão idle descartada):', err.message);
    });
  }
  return pool;
}

async function initialize() {
  const p = getPool();
  await p.query('SELECT 1'); // valida conexão
  console.log('[PostgreSQL] Conectado com sucesso.');
  return p;
}

async function ensureSheetsExist() {
  const p = getPool();
  const migrations = [
    // ── Criação das tabelas principais ──────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS "USER" (
      "ID" TEXT PRIMARY KEY, "Nome" TEXT, "Email" TEXT, "Senha_Hash" TEXT,
      "Perfil" TEXT, "Empresa" TEXT, "Ativo" TEXT, "Criado_Em" TEXT, "Ultimo_Login" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "Projetos_Contratos" (
      "ID_Projeto" TEXT PRIMARY KEY, "Nome" TEXT, "Cliente" TEXT, "Valor_Global" TEXT,
      "Teto_Terc_Perc" TEXT, "Teto_Terc_Valor" TEXT, "ID_ClickUp" TEXT, "Centro_Custo_OPP" TEXT,
      "Status" TEXT, "Progresso_Perc" TEXT, "Data_Inicio" TEXT, "Data_Entrega_Contrato" TEXT,
      "Data_Entrega_Planejada" TEXT, "Empresa" TEXT, "Setor" TEXT, "Tipologia" TEXT,
      "Link_ClickUp" TEXT, "Criado_Em" TEXT, "Atualizado_Em" TEXT, "Responsavel" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "Planejamentos" (
      "ID" TEXT PRIMARY KEY, "ID_Projeto" TEXT, "Nome_Projeto" TEXT, "Cliente" TEXT,
      "Nr_Contrato_OS" TEXT, "Resp_Planejamento" TEXT, "Resp_Aprovacao" TEXT, "Setor" TEXT,
      "Tipologia" TEXT, "Empresa" TEXT, "Link_ClickUp" TEXT, "Valor_Contrato" TEXT,
      "Impostos_Perc" TEXT, "Taxa_Adm_Perc" TEXT, "Comissao_Perc" TEXT, "Data_Inicio_OS" TEXT,
      "Data_Entrega_Contrato" TEXT, "Data_Entrega_Planejada" TEXT, "Status" TEXT,
      "Justificativa" TEXT, "Comentario_Aprovacao" TEXT, "Justificativa_Replanejamento" TEXT,
      "Snapshot_Anterior" TEXT, "Criado_Por" TEXT, "Criado_Em" TEXT, "Aprovado_Por" TEXT,
      "Aprovado_Em" TEXT, "Dados_JSON" TEXT, "Nr_OS_OPP" TEXT, "Data_OS_Externa" TEXT,
      "Travado" TEXT, "Travado_Em" TEXT, "Travado_Por" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "Medicoes" (
      "ID_Medicao" TEXT PRIMARY KEY, "ID_Projeto" TEXT, "Etapa" TEXT, "Percentual" TEXT,
      "Valor" TEXT, "Data_Previsao" TEXT, "Data_Realizacao" TEXT, "Status_Fisico" TEXT,
      "Status_Financeiro" TEXT, "ID_Tarefa_ClickUp" TEXT, "Nr_NF" TEXT, "Data_Emissao_NF" TEXT,
      "Data_Vencimento" TEXT, "Data_Recebimento" TEXT, "Observacao" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "Terceirizados" (
      "ID" TEXT PRIMARY KEY, "ID_Projeto" TEXT, "Servico" TEXT, "Fornecedor" TEXT,
      "Valor_Contratado" TEXT, "Valor_Pago" TEXT, "Status" TEXT, "ID_Tarefa_ClickUp" TEXT,
      "ID_Medicao_Vinculada" TEXT, "Percentual_do_Total" TEXT, "Data_Entrega_Prevista" TEXT,
      "Data_Entrega_Real" TEXT, "Observacao" TEXT, "Aprovado_Por" TEXT, "Criado_Em" TEXT,
      "OC" TEXT, "Status_ClickUp" TEXT, "Etapa_ClickUp" TEXT, "Responsavel" TEXT,
      "Descricao_Servico" TEXT, "CNPJ_CPF" TEXT, "Nr_Contrato" TEXT, "Valor_Estimado" TEXT,
      "Data_Vencimento" TEXT, "Nr_NF" TEXT, "Data_Pagamento" TEXT, "Link_Contrato" TEXT,
      "Setor" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "Equipe_Planejamento" (
      "ID" TEXT PRIMARY KEY, "ID_Planejamento" TEXT, "Colaborador" TEXT,
      "Media_Hora" TEXT, "Horas_Estimadas" TEXT, "Total" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "Despesas_Planejamento" (
      "ID" TEXT PRIMARY KEY, "ID_Planejamento" TEXT, "Descricao" TEXT, "Valor" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "Log_Horas" (
      "ID" TEXT PRIMARY KEY, "ID_Projeto" TEXT, "Colaborador" TEXT, "Horas_Estimadas" TEXT,
      "Horas_Logadas" TEXT, "Custo_Calculado" TEXT, "Data" TEXT, "ID_TimeEntry_ClickUp" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "Custos_OPP" (
      "ID" TEXT PRIMARY KEY, "ID_Projeto" TEXT, "Centro_Custo" TEXT, "Descricao" TEXT,
      "Valor_Lancado" TEXT, "Data_Lancamento" TEXT, "Tipo" TEXT, "Fornecedor_Cliente" TEXT,
      "Nr_Documento" TEXT, "ID_Importacao" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "Alertas" (
      "ID" TEXT PRIMARY KEY, "Tipo_Alerta" TEXT, "ID_Projeto" TEXT, "Mensagem" TEXT,
      "Data_Geracao" TEXT, "Setor_Destino" TEXT, "Visto_Por" TEXT, "Status" TEXT,
      "Nivel" TEXT, "Link_ClickUp" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "Log_Importacoes" (
      "ID" TEXT PRIMARY KEY, "Data_Upload" TEXT, "Arquivo" TEXT, "Usuario" TEXT,
      "Registros_Processados" TEXT, "Erros" TEXT, "Status" TEXT, "Detalhes" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "Configuracoes" (
      "Chave" TEXT PRIMARY KEY, "Valor" TEXT, "Descricao" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "Financeiro_OPP" (
      "ID_OPP" TEXT PRIMARY KEY, "Tipo" TEXT, "Profissional" TEXT, "Categoria" TEXT,
      "Descricao" TEXT, "Valor" TEXT, "Data_Vencimento" TEXT, "Data_Competencia" TEXT,
      "Situacao" TEXT, "ID_Cliente_OPP" TEXT, "Nome_Cliente" TEXT, "Nr_Documento" TEXT,
      "Nr_OS_OPP" TEXT, "OC" TEXT, "Sincronizado_Em" TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS "OrdensCompra_OPP" (
      "ID_OC" TEXT PRIMARY KEY, "ID_Ordem_OPP" TEXT, "Nome_Fornecedor" TEXT,
      "Valor_Total" TEXT, "Valor_Liquidado" TEXT, "Data_Pedido" TEXT, "Situacao" TEXT,
      "Observacao" TEXT, "Sincronizado_Em" TEXT
    )`,
    // Ordens de Serviço reais do OPP — cada medição de verdade vira sua
    // própria O.S. lá (com valor e NF reais), bem diferente da única
    // Nr_OS_OPP por projeto que o Par guardava até então. Usada pela tela de
    // Medições & Faturamento pra mostrar o dado real, não só a prévia do
    // planejamento.
    `CREATE TABLE IF NOT EXISTS "OrdensServico_OPP" (
      "ID_OS_OPP" TEXT PRIMARY KEY, "ID_Ordem_OPP" TEXT, "ID_Cliente_OPP" TEXT,
      "Nome_Cliente" TEXT, "Referencia" TEXT, "Problema" TEXT, "Observacao" TEXT,
      "Valor_Total" TEXT, "Status" TEXT, "Data_Pedido" TEXT, "Data_Entrega" TEXT,
      "Data_Realizacao" TEXT, "Sincronizado_Em" TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS "idx_os_opp_cliente" ON "OrdensServico_OPP" ("ID_Cliente_OPP")`,
    // Vínculo do projeto do Par com o cliente real no OPP (por id, não por
    // texto) — sem isso não dá pra casar com confiança as O.S./receitas do
    // OPP com o projeto certo.
    `ALTER TABLE "Projetos_Contratos" ADD COLUMN IF NOT EXISTS "ID_OPP_Cliente" TEXT`,
    // ── Índices úteis ────────────────────────────────────────────────────────
    `CREATE INDEX IF NOT EXISTS "idx_plan_projeto" ON "Planejamentos" ("ID_Projeto")`,
    `CREATE INDEX IF NOT EXISTS "idx_med_projeto" ON "Medicoes" ("ID_Projeto")`,
    `CREATE INDEX IF NOT EXISTS "idx_terc_projeto" ON "Terceirizados" ("ID_Projeto")`,
    `CREATE INDEX IF NOT EXISTS "idx_horas_projeto" ON "Log_Horas" ("ID_Projeto")`,
    `CREATE INDEX IF NOT EXISTS "idx_alertas_projeto" ON "Alertas" ("ID_Projeto")`,
    // ── Colunas extras adicionadas após criação inicial ──────────────────────
    `ALTER TABLE "Planejamentos" ADD COLUMN IF NOT EXISTS "Nr_OS_OPP" TEXT`,
    `ALTER TABLE "Planejamentos" ADD COLUMN IF NOT EXISTS "Data_OS_Externa" TEXT`,
    `ALTER TABLE "Planejamentos" ADD COLUMN IF NOT EXISTS "Travado" TEXT`,
    `ALTER TABLE "Planejamentos" ADD COLUMN IF NOT EXISTS "Travado_Em" TEXT`,
    `ALTER TABLE "Planejamentos" ADD COLUMN IF NOT EXISTS "Travado_Por" TEXT`,
    `ALTER TABLE "Planejamentos" ADD COLUMN IF NOT EXISTS "Justificativa_Replanejamento" TEXT`,
    `ALTER TABLE "Planejamentos" ADD COLUMN IF NOT EXISTS "Snapshot_Anterior" TEXT`,
    `ALTER TABLE "Planejamentos" ADD COLUMN IF NOT EXISTS "Comentario_Aprovacao" TEXT`,
    // A tabela OrdensCompra_OPP já existia (criada antes da coluna Valor_Liquidado
    // ser adicionada ao CREATE TABLE acima) — "CREATE TABLE IF NOT EXISTS" não
    // adiciona coluna em tabela que já existe, então o sync de Ordens de Compra
    // ficava sempre falhando silenciosamente (erro engolido pelo catch do cron)
    // na hora de gravar, deixando a tabela sempre vazia.
    `ALTER TABLE "OrdensCompra_OPP" ADD COLUMN IF NOT EXISTS "Valor_Liquidado" TEXT`,
    // Tarefa fixa criada automaticamente em cada projeto (lista do ClickUp) na
    // 1ª vez que o sistema precisa comentar/mencionar sobre um planejamento —
    // reaproveitada sempre depois, em vez de criar uma tarefa nova toda hora.
    // Substitui a tentativa de achar/depender de uma tarefa de Medição.
    `ALTER TABLE "Projetos_Contratos" ADD COLUMN IF NOT EXISTS "ID_Tarefa_Notificacoes_PAR" TEXT`,
    // Mesmo problema do Valor_Liquidado acima, só que em Terceirizados: o
    // código (POST /api/terceirizados e o PUT) grava Descricao_Servico,
    // CNPJ_CPF, Nr_Contrato, Valor_Estimado, Data_Vencimento, Nr_NF,
    // Data_Pagamento, Link_Contrato e Setor há tempo, mas a tabela real em
    // produção nunca ganhou essas colunas (confirmado em 21/10/2026 via
    // information_schema — nenhuma delas existia). Resultado: toda criação
    // manual de terceirizado pela tela do PAR vinha derrubando o INSERT
    // inteiro com "column ... does not exist" (Postgres rejeita o INSERT
    // completo se qualquer uma das colunas não existir). As leituras (GET)
    // já esperavam esses campos (ex.: Setor, Link_Contrato, Nr_Contrato na
    // resposta), então a correção é adicionar as colunas que faltam, não
    // remover os campos do código.
    `ALTER TABLE "Terceirizados" ADD COLUMN IF NOT EXISTS "Descricao_Servico" TEXT`,
    `ALTER TABLE "Terceirizados" ADD COLUMN IF NOT EXISTS "CNPJ_CPF" TEXT`,
    `ALTER TABLE "Terceirizados" ADD COLUMN IF NOT EXISTS "Nr_Contrato" TEXT`,
    `ALTER TABLE "Terceirizados" ADD COLUMN IF NOT EXISTS "Valor_Estimado" TEXT`,
    `ALTER TABLE "Terceirizados" ADD COLUMN IF NOT EXISTS "Data_Vencimento" TEXT`,
    `ALTER TABLE "Terceirizados" ADD COLUMN IF NOT EXISTS "Nr_NF" TEXT`,
    `ALTER TABLE "Terceirizados" ADD COLUMN IF NOT EXISTS "Data_Pagamento" TEXT`,
    `ALTER TABLE "Terceirizados" ADD COLUMN IF NOT EXISTS "Link_Contrato" TEXT`,
    `ALTER TABLE "Terceirizados" ADD COLUMN IF NOT EXISTS "Setor" TEXT`,
    `CREATE TABLE IF NOT EXISTS "Auditoria" (
      "ID_Auditoria" TEXT PRIMARY KEY,
      "Tabela" TEXT NOT NULL,
      "Acao" TEXT NOT NULL,
      "ID_Registro" TEXT,
      "Nome_Registro" TEXT,
      "Dados_Antes" TEXT,
      "Dados_Depois" TEXT,
      "Usuario_ID" TEXT,
      "Usuario_Nome" TEXT,
      "Usuario_Email" TEXT,
      "Criado_Em" TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS "idx_auditoria_tabela" ON "Auditoria" ("Tabela")`,
    `CREATE INDEX IF NOT EXISTS "idx_auditoria_criado" ON "Auditoria" ("Criado_Em" DESC)`,
  ];
  for (const sql of migrations) {
    try { await p.query(sql); } catch (e) { console.warn('[Migration]', e.message); }
  }
}

// Serializa valores para garantir compatibilidade com o comportamento do Sheets (tudo string)
function serialize(val) {
  if (val === null || val === undefined) return '';
  return String(val);
}

// Converte objeto do PG (pode ter números/datas) para objeto com valores string (igual Sheets)
function rowToStrings(row) {
  if (!row) return null;
  const obj = {};
  for (const [k, v] of Object.entries(row)) {
    obj[k] = serialize(v);
  }
  return obj;
}

// Converte valor para null se for string vazia (para INSERT/UPDATE no PG)
function toDb(val) {
  if (val === '' || val === undefined) return null;
  return val;
}

// Cache em memória, por tabela, do resultado de readSheet (SELECT * sem
// filtro). Medido com dados reais (21/10/2026, diagnosticar-performance.js):
// ler as 7 tabelas principais em sequência custa ~800ms-2s, e o Dashboard
// sozinho dispara 7 chamadas de API em paralelo que acabam relendo essas
// MESMAS tabelas de novo cada uma — a causa real da demora relatada pelo
// chef pra carregar/atualizar o PAR. Os dados locais só mudam via sync
// agendado (ClickUp a cada 15min, OPP a cada 2h) ou por uma gravação direta
// do próprio Par.
// 90s (valor original) se mostrou curto demais na prática (26/10/2026):
// o cron do ClickUp roda a cada 15min e, a cada rodada, qualquer escrita
// invalida o cache da tabela na hora — e aí um loop que lê+escreve a MESMA
// tabela várias vezes (ex.: autoImportProjects) força várias leituras
// completas por rodada, o dia inteiro, sem ninguém usando o sistema. Isso
// multiplicado por 96 rodadas/dia explicou ~23GB de transferência no Neon
// em 3 dias pra um banco que tem ~9MB no total. Subido pra 5min: ainda
// cobre bem o intervalo entre sync e sync sem mostrar dado velho pro
// usuário (que só muda via esses mesmos syncs ou gravação direta no Par,
// que já invalida na hora), mas reduz MUITO a frequência de releitura.
// Toda função de escrita abaixo (insert/update/delete) invalida a tabela que
// grava, pra nunca mostrar dado velho depois de uma edição do usuário.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cacheLeitura = new Map(); // tableName -> { dados, expiraEm }

function invalidarCache(tableName) {
  cacheLeitura.delete(tableName);
}

async function readSheet(tableName) {
  const agora = Date.now();
  const cached = cacheLeitura.get(tableName);
  if (cached && cached.expiraEm > agora) return cached.dados;
  const res = await getPool().query(`SELECT * FROM "${tableName}" ORDER BY ctid`);
  const dados = res.rows.map(rowToStrings);
  cacheLeitura.set(tableName, { dados, expiraEm: agora + CACHE_TTL_MS });
  return dados;
}

async function findRows(tableName, condition) {
  const rows = await readSheet(tableName);
  return rows.filter(condition);
}

async function findOne(tableName, condition) {
  const rows = await readSheet(tableName);
  return rows.find(condition) || null;
}

async function insertRow(tableName, data) {
  const keys = Object.keys(data);
  if (keys.length === 0) return data;

  const cols = keys.map(k => `"${k}"`).join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const values = keys.map(k => toDb(data[k]));

  await getPool().query(
    `INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
    values
  );
  invalidarCache(tableName);
  return data;
}

async function insertManyRows(tableName, dataArray) {
  if (!dataArray || dataArray.length === 0) return;

  const keys = Object.keys(dataArray[0]);
  const cols = keys.map(k => `"${k}"`).join(', ');

  // Insere em lotes de 100 para evitar queries enormes
  const BATCH = 100;
  for (let start = 0; start < dataArray.length; start += BATCH) {
    const batch = dataArray.slice(start, start + BATCH);
    const valueSets = [];
    const allValues = [];
    let idx = 1;
    for (const row of batch) {
      const placeholders = keys.map(() => `$${idx++}`).join(', ');
      valueSets.push(`(${placeholders})`);
      keys.forEach(k => allValues.push(toDb(row[k])));
    }
    await getPool().query(
      `INSERT INTO "${tableName}" (${cols}) VALUES ${valueSets.join(', ')} ON CONFLICT DO NOTHING`,
      allValues
    );
  }
  invalidarCache(tableName);
}

async function updateRowById(tableName, idField, idValue, newData) {
  const keys = Object.keys(newData).filter(k => k !== idField);
  if (keys.length === 0) return newData;

  const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
  const values = [...keys.map(k => toDb(newData[k])), idValue];

  await getPool().query(
    `UPDATE "${tableName}" SET ${sets} WHERE "${idField}" = $${keys.length + 1}`,
    values
  );
  invalidarCache(tableName);
  return newData;
}

async function updateManyRowsWhere(tableName, filterFn, newData) {
  const rows = await readSheet(tableName);
  const toUpdate = rows.filter(filterFn);
  for (const row of toUpdate) {
    // Precisamos do campo PK — tenta detectar pelo nome convencional
    const pkField = Object.keys(row).find(k => k.startsWith('ID_') || k === 'ID' || k === 'Chave') || Object.keys(row)[0];
    await updateRowById(tableName, pkField, row[pkField], { ...row, ...newData });
  }
  return toUpdate.length;
}

async function deleteRowById(tableName, idField, idValue) {
  const res = await getPool().query(
    `DELETE FROM "${tableName}" WHERE "${idField}" = $1`,
    [idValue]
  );
  invalidarCache(tableName);
  return (res.rowCount || 0) > 0;
}

async function clearSheetData(tableName) {
  await getPool().query(`DELETE FROM "${tableName}"`);
  invalidarCache(tableName);
}

module.exports = {
  initialize,
  ensureSheetsExist,
  readSheet,
  findRows,
  findOne,
  insertRow,
  insertManyRows,
  updateRowById,
  updateManyRowsWhere,
  deleteRowById,
  clearSheetData,
};
