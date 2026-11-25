// Conferencia diaria: falhas e recuperacao (pontos da revisao independente de 25/11/2026). node --test
const test = require('node:test');
const assert = require('node:assert');
const { executarConferencia, garantirRetratoDeHoje, TABELA } = require('../src/services/conferenciaDiariaService');

const plano = (id, nome, chave, medicoes) => ({
  ID: id, ID_Projeto: 'P-' + id, Nome_Projeto: nome, Status: 'Aprovado', ID_Centro_Custo_OPP: chave, Nr_OS_OPP: '',
  Link_ClickUp: '', Dados_JSON: JSON.stringify({ _baseline: { medicoes } }),
});
const rec = (id, chave, valor, venc) => ({ id_conta_rec: id, id_centro_custos: chave, valor_rec: valor, vencimento_rec: venc, liquidado_rec: 'Nao', nome_conta: 'x', nome_cliente: '' });
const planejamentos = () => [plano('a', 'Projeto Alfa', '10', [{ etapa: '1', valor: 1000, dataPrevisao: '2026-11-30' }])];
const receitas = () => [rec(111, '10', '1.000,00', '2026-12-30')];

function bancoFalso(plans) {
  const tabelas = { Planejamentos: plans, [TABELA]: [] };
  return {
    tabelas,
    readSheet: async (n) => tabelas[n].map((x) => ({ ...x })),
    insertRow: async (n, d) => { tabelas[n].push({ ...d }); },
    updateRowById: async (n, campo, id, d) => { const i = tabelas[n].findIndex((x) => x[campo] === id); tabelas[n][i] = { ...tabelas[n][i], ...d }; },
  };
}

test('OPP responde com lista vazia: grava falha, nao "zero achados"', async () => {
  const db = bancoFalso(planejamentos());
  const r = await executarConferencia(db, { receitas: [], agora: new Date('2026-12-01T09:30:00Z') });
  assert.equal(r.status, 'falha_opp');
  assert.match(db.tabelas[TABELA][0].Erro, /lista vazia/);
  assert.equal(db.tabelas[TABELA][0].Achados_JSON, '[]');
});

test('falha na leitura de Planejamentos fica registrada', async () => {
  const db = bancoFalso([]);
  const lerOriginal = db.readSheet;
  db.readSheet = async (n) => { if (n === 'Planejamentos') throw new Error('banco fora'); return lerOriginal(n); };
  const r = await executarConferencia(db, { receitas: receitas(), agora: new Date('2026-12-01T09:30:00Z') });
  assert.equal(r.status, 'falha_par');
  assert.equal(db.tabelas[TABELA][0].Status, 'falha_par');
  assert.match(db.tabelas[TABELA][0].Erro, /banco fora/);
});

test('uma falha no mesmo dia nao apaga um retrato valido', async () => {
  const db = bancoFalso(planejamentos());
  await executarConferencia(db, { receitas: receitas(), agora: new Date('2026-12-01T09:30:00Z') });
  const r = await executarConferencia(db, { receitas: [], agora: new Date('2026-12-01T15:00:00Z') });
  assert.equal(r.status, 'falha_opp');
  assert.equal(db.tabelas[TABELA].length, 1);
  assert.equal(db.tabelas[TABELA][0].Status, 'ok');
});

test('uma falha pode ser substituida por um retrato valido no mesmo dia', async () => {
  const db = bancoFalso(planejamentos());
  await executarConferencia(db, { receitas: [], agora: new Date('2026-12-01T09:30:00Z') });
  assert.equal(db.tabelas[TABELA][0].Status, 'falha_opp');
  await executarConferencia(db, { receitas: receitas(), agora: new Date('2026-12-01T12:00:00Z') });
  assert.equal(db.tabelas[TABELA].length, 1);
  assert.equal(db.tabelas[TABELA][0].Status, 'ok');
});

test('garantirRetratoDeHoje: so recupera depois das 06h30 de Fortaleza e se nao houver retrato valido', async () => {
  const mudancas = require('../src/services/mudancasDeDataService');
  const lerOriginal = mudancas.lerReceitasOPP;
  mudancas.lerReceitasOPP = async () => receitas();
  try {
    const db = bancoFalso(planejamentos());
    assert.equal((await garantirRetratoDeHoje(db, { agora: new Date('2026-12-01T09:00:00Z') })).executado, false, '06h00 em Fortaleza: ainda cedo');
    assert.equal((await garantirRetratoDeHoje(db, { agora: new Date('2026-12-01T13:00:00Z') })).executado, true);
    assert.equal(db.tabelas[TABELA].length, 1);
    assert.equal((await garantirRetratoDeHoje(db, { agora: new Date('2026-12-01T14:00:00Z') })).executado, false, 'ja tem retrato');
  } finally { mudancas.lerReceitasOPP = lerOriginal; }
});
