/**
 * Conferencia diaria Par x OPP (portao de dados de 30 dias). Roda no servidor, todo dia, e grava um "retrato"
 * do dia na tabela Conferencias_Diarias, mesmo que ninguem abra o sistema nem o computador do Beto esteja ligado.
 * So le o Par e o OPP; so escreve na propria tabela de retratos. Nunca corrige dado de ninguem.
 *
 * Se o OPP nao responder, o dia fica gravado como "falha_opp" (sem conferencia). Nunca se grava "zero achados"
 * por causa de uma falha: um dia sem conferencia e diferente de um dia sem divergencia.
 */
const { montarConferencia, compararComAnterior } = require('../utils/conferenciaDiaria');

const TABELA = 'Conferencias_Diarias';
const FUSO = 'America/Fortaleza';

/** Data local da empresa (Fortaleza) no formato yyyy-mm-dd, mesmo que o servidor rode em UTC. */
function dataLocal(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const lerJSON = (s, padrao) => { try { return JSON.parse(s || ''); } catch { return padrao; } };

async function gravar(db, linha) {
  const existentes = await db.readSheet(TABELA);
  if (existentes.some((r) => r.ID === linha.ID)) await db.updateRowById(TABELA, 'ID', linha.ID, linha);
  else await db.insertRow(TABELA, linha);
}

/**
 * Executa a conferencia de hoje e grava o retrato. `receitas` pode ser injetado (testes).
 * Reexecutar no mesmo dia substitui o retrato daquele dia (continua um por dia).
 */
async function executarConferencia(db, { receitas, agora = new Date() } = {}) {
  const data = dataLocal(agora);
  const geradoEm = agora.toISOString();
  let receitasOPP;
  try {
    receitasOPP = receitas || await require('./mudancasDeDataService').lerReceitasOPP();
  } catch (e) {
    await gravar(db, { ID: data, Data: data, Status: 'falha_opp', Gerado_Em: geradoEm, Resumo_JSON: '{}', Achados_JSON: '[]', Resolvidos_JSON: '[]', Novos: '0', Erro: String(e.message || e).slice(0, 500) });
    return { data, status: 'falha_opp', erro: e.message };
  }

  const planejamentos = await db.readSheet('Planejamentos');
  const conf = montarConferencia(planejamentos, receitasOPP, { hoje: agora });

  const retratos = await db.readSheet(TABELA);
  const anterior = retratos.filter((r) => r.Status === 'ok' && r.Data < data).sort((a, b) => (a.Data < b.Data ? 1 : -1))[0];
  const cmp = compararComAnterior(conf.achados, anterior ? lerJSON(anterior.Achados_JSON, []) : null, data);

  await gravar(db, {
    ID: data, Data: data, Status: 'ok', Gerado_Em: geradoEm,
    Resumo_JSON: JSON.stringify({ ...conf.resumo, comparadoCom: anterior?.Data || null }),
    Achados_JSON: JSON.stringify(cmp.achados), Resolvidos_JSON: JSON.stringify(cmp.resolvidos), Novos: String(cmp.novos), Erro: '',
  });
  return { data, status: 'ok', achados: cmp.achados.length, novos: cmp.novos, resolvidos: cmp.resolvidos.length };
}

/** Lista os retratos (mais recente primeiro) sem o detalhe. */
async function listarRetratos(db) {
  const r = await db.readSheet(TABELA);
  return [...r].sort((a, b) => (a.Data < b.Data ? 1 : -1)).map((x) => ({
    data: x.Data, status: x.Status, geradoEm: x.Gerado_Em, novos: Number(x.Novos || 0), erro: x.Erro || '', resumo: lerJSON(x.Resumo_JSON, {}),
  }));
}

/** Retrato completo de um dia, ou null. */
async function lerRetrato(db, data) {
  const x = (await db.readSheet(TABELA)).find((r) => r.Data === data);
  if (!x) return null;
  return {
    data: x.Data, status: x.Status, geradoEm: x.Gerado_Em, erro: x.Erro || '', resumo: lerJSON(x.Resumo_JSON, {}),
    achados: lerJSON(x.Achados_JSON, []), resolvidos: lerJSON(x.Resolvidos_JSON, []),
  };
}

/** Dias sem retrato valido de `de` (inclusive) ate `ate` (exclusive): o relatorio diz "sem conferencia" neles. */
function diasSemRetrato(retratos, de, ate) {
  const tem = new Set(retratos.filter((r) => r.status === 'ok').map((r) => r.data));
  const faltam = [];
  const d = new Date(`${de}T12:00:00Z`);
  const fim = new Date(`${ate}T12:00:00Z`);
  for (; d < fim; d.setUTCDate(d.getUTCDate() + 1)) {
    const s = d.toISOString().slice(0, 10);
    if (!tem.has(s)) faltam.push(s);
  }
  return faltam;
}

module.exports = { TABELA, dataLocal, executarConferencia, listarRetratos, lerRetrato, diasSemRetrato };
