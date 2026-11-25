// Conferencia diaria Par x OPP, com banco e OPP falsos (sem rede). node --test
const test = require('node:test');
const assert = require('node:assert');
const { montarConferencia, compararComAnterior, diasCorridos } = require('../src/utils/conferenciaDiaria');
const { executarConferencia, listarRetratos, lerRetrato, diasSemRetrato, dataLocal, TABELA } = require('../src/services/conferenciaDiariaService');

const plano = (id, nome, chave, medicoes, extra = {}) => ({
  ID: id, ID_Projeto: 'P-' + id, Nome_Projeto: nome, Status: extra.status || 'Aprovado', ID_Centro_Custo_OPP: chave, Nr_OS_OPP: extra.os || '',
  Link_ClickUp: `https://app.clickup.com/t/1/${id}`, Dados_JSON: JSON.stringify({ _baseline: { medicoes } }),
});
const rec = (id, chave, valor, venc, liquidado, nome = 'x') => ({
  id_conta_rec: id, id_centro_custos: chave, valor_rec: valor, vencimento_rec: venc, liquidado_rec: liquidado ? 'Sim' : 'Nao', nome_conta: nome, nome_cliente: '',
});
const HOJE = new Date(2026, 11, 1, 9, 30); // 01/12/2026

function cenario() {
  const planejamentos = [
    plano('a', 'Projeto Alfa', '10', [{ etapa: '1', valor: 1000, dataPrevisao: '2026-11-30' }, { etapa: '2', valor: 2000, dataPrevisao: '2026-07-03' }, { etapa: '3', valor: 3000, dataPrevisao: '2027-02-01' }]),
    plano('b', 'Projeto Beta', '20', [{ etapa: '1', valor: 4000, dataPrevisao: '2026-09-14' }, { etapa: '2', valor: 800, dataPrevisao: '2026-10-10' }, { etapa: '3', valor: 900, dataPrevisao: '' }]),
    plano('c', 'Projeto Sem Vinculo', '', [{ etapa: '1', valor: 500, dataPrevisao: '2026-10-01' }]),
    plano('d', 'Projeto Rascunho', '99', [{ etapa: '1', valor: 1, dataPrevisao: '2026-01-01' }], { status: 'Rascunho' }),
    plano('e', 'Projeto Repetido 1', '30', []), plano('f', 'Projeto Repetido 2', '30', []),
  ];
  const receitas = [
    rec(111, '10', '1.000,00', '2026-12-30', false),      // Alfa 1: ok
    rec(222, '10', '2.000,00', '2026-08-02', true),       // Alfa 2: ja recebida (titulo pago): nao e achado
    rec(333, '20', '4.000,00', '2026-12-19', false),      // Beta 1: data divergente
    rec(444, '77', '9.000,00', '2026-12-01', false),      // centro de custo sem planejamento aprovado
    rec(555, '', '2.800.000,19', '2026-10-02', false),    // tesouraria: nao e achado, so resumo
    rec(666, '20', '1.234,00', '2026-11-20', false),      // Beta: titulo sem medicao com esse valor
  ];
  return { planejamentos, receitas };
}

test('montarConferencia: cada situacao vira o achado certo, e o que e esperado nao vira achado', () => {
  const { planejamentos, receitas } = cenario();
  const r = montarConferencia(planejamentos, receitas, { hoje: HOJE });
  const porCodigo = {};
  for (const a of r.achados) (porCodigo[a.codigo] = porCodigo[a.codigo] || []).push(a);

  assert.equal(porCodigo.DATA_DIVERGENTE.length, 1);
  assert.equal(porCodigo.DATA_DIVERGENTE[0].projeto, 'Projeto Beta');
  assert.equal(porCodigo.DATA_DIVERGENTE[0].chave, 'DATA_DIVERGENTE|333');

  assert.deepEqual(porCodigo.MEDICAO_VENCIDA_SEM_TITULO.map((a) => a.projeto), ['Projeto Beta'], 'Beta etapa 2 venceu sem titulo; Alfa 2 esta paga; Alfa 3 e futura; Sem Vinculo conta a parte');
  assert.equal(porCodigo.MEDICAO_SEM_DATA.length, 1);
  assert.equal(porCodigo.TITULO_SEM_MEDICAO[0].chave, 'TITULO_SEM_MEDICAO|666');
  assert.equal(porCodigo.TITULO_SEM_PLANEJAMENTO[0].chave, 'TITULO_SEM_PLANEJAMENTO|444');
  assert.equal(porCodigo.PLANEJAMENTO_SEM_VINCULO.length, 1);
  assert.equal(porCodigo.PLANEJAMENTO_SEM_VINCULO[0].projeto, 'Projeto Sem Vinculo');
  assert.equal(porCodigo.CENTRO_DE_CUSTO_REPETIDO.length, 1);

  assert.ok(!r.achados.some((a) => a.chave.endsWith('|555')), 'tesouraria sem centro de custo nao e achado');
  assert.equal(r.resumo.tesourariaSemCentroDeCusto.quantidade, 1);
  assert.equal(r.resumo.planejamentosAprovados, 5, 'o rascunho fica de fora');
  assert.equal(r.resumo.porCodigo.DATA_DIVERGENTE.quantidade, 1);
});

test('tesouraria com centro de custo (resgate de CDB) nao vira achado, mas entra no resumo', () => {
  const { planejamentos, receitas } = cenario();
  receitas.push(rec(777, '222758', '2.800.000,19', '2026-10-02', false, 'RESGATE CDB DI BANCO ITAÚ'));
  receitas.push(rec(778, '222758', '67.051,19', '2026-08-18', false, 'VENCIMENTO CDB BANCO ITAÚ'));
  const r = montarConferencia(planejamentos, receitas, { hoje: HOJE });
  assert.ok(!r.achados.some((a) => /777|778/.test(a.chave)), 'CDB nao e achado');
  assert.equal(r.resumo.tesourariaSemCentroDeCusto.quantidade, 3, 'o lancamento 555 sem centro de custo e os dois CDB');
  assert.ok(r.resumo.tesourariaSemCentroDeCusto.valor > 2800000);
  // cliente com nome parecido nao e escondido
  receitas.push(rec(779, '88', '5.000,00', '2026-12-10', false, 'MEDIÇÃO 02 PREFEITURA DE RESGATE'));
  const r2 = montarConferencia(planejamentos, receitas, { hoje: HOJE });
  assert.ok(r2.achados.some((a) => a.chave === 'TITULO_SEM_PLANEJAMENTO|779'), 'palavra no meio do nome nao esconde o titulo de cliente');
});

test('montarConferencia: lista vazia e Dados_JSON quebrado nao derrubam o calculo', () => {
  const r = montarConferencia([{ ID: 'x', Status: 'Aprovado', Nome_Projeto: 'Quebrado', Dados_JSON: '{nao e json' }], [], { hoje: HOJE });
  assert.equal(r.resumo.medicoes, 0);
  assert.equal(r.achados.length, 1, 'planejamento aprovado sem vinculo');
  assert.equal(r.achados[0].codigo, 'PLANEJAMENTO_SEM_VINCULO');
});

test('compararComAnterior: novo, continua aberto com a idade certa, e resolvido', () => {
  const ontem = [
    { chave: 'DATA_DIVERGENTE|1', codigo: 'DATA_DIVERGENTE', projeto: 'A', descricao: 'a', valor: 10, desde: '2026-11-28' },
    { chave: 'DATA_DIVERGENTE|2', codigo: 'DATA_DIVERGENTE', projeto: 'B', descricao: 'b', valor: 20, desde: '2026-11-30' },
  ];
  const hoje = [{ chave: 'DATA_DIVERGENTE|1', codigo: 'DATA_DIVERGENTE' }, { chave: 'DATA_DIVERGENTE|3', codigo: 'DATA_DIVERGENTE' }];
  const r = compararComAnterior(hoje, ontem, '2026-12-01');
  const por = Object.fromEntries(r.achados.map((a) => [a.chave, a]));
  assert.equal(por['DATA_DIVERGENTE|1'].novo, false);
  assert.equal(por['DATA_DIVERGENTE|1'].desde, '2026-11-28');
  assert.equal(por['DATA_DIVERGENTE|1'].diasAberto, 3);
  assert.equal(por['DATA_DIVERGENTE|3'].novo, true);
  assert.equal(por['DATA_DIVERGENTE|3'].diasAberto, 0);
  assert.equal(r.novos, 1);
  assert.deepEqual(r.resolvidos.map((x) => x.chave), ['DATA_DIVERGENTE|2']);
  assert.equal(compararComAnterior(hoje, null, '2026-12-01').novos, 2, 'primeiro dia: tudo e novo');
  assert.equal(diasCorridos('2026-11-30', '2026-12-02'), 2);
});

function bancoFalso(planejamentos) {
  const tabelas = { Planejamentos: planejamentos, [TABELA]: [] };
  return {
    tabelas,
    readSheet: async (n) => tabelas[n].map((x) => ({ ...x })),
    insertRow: async (n, d) => { tabelas[n].push({ ...d }); },
    updateRowById: async (n, campo, id, d) => { const i = tabelas[n].findIndex((x) => x[campo] === id); tabelas[n][i] = { ...tabelas[n][i], ...d }; },
  };
}

test('dataLocal usa o fuso de Fortaleza: 01h UTC ainda e o dia anterior', () => {
  assert.equal(dataLocal(new Date('2026-12-01T01:00:00Z')), '2026-11-30');
  assert.equal(dataLocal(new Date('2026-12-01T09:30:00Z')), '2026-12-01');
});

test('executarConferencia: grava um retrato por dia, acompanha o anterior e substitui no mesmo dia', async () => {
  const { planejamentos, receitas } = cenario();
  const db = bancoFalso(planejamentos);

  let r = await executarConferencia(db, { receitas, agora: new Date('2026-12-01T09:30:00Z') });
  assert.equal(r.status, 'ok');
  assert.equal(db.tabelas[TABELA].length, 1);
  assert.equal(r.novos, r.achados, 'primeiro dia: tudo e novo');

  // dia seguinte: a Roberta corrigiu a data do titulo 333 (agora bate com a regra), e nada mais mudou
  const corrigidas = receitas.map((x) => (x.id_conta_rec === 333 ? { ...x, vencimento_rec: '2026-10-14' } : x));
  r = await executarConferencia(db, { receitas: corrigidas, agora: new Date('2026-12-02T09:30:00Z') });
  assert.equal(db.tabelas[TABELA].length, 2);
  assert.equal(r.novos, 0);
  assert.equal(r.resolvidos, 1);
  const dia2 = await lerRetrato(db, '2026-12-02');
  assert.ok(dia2.resolvidos.some((x) => x.chave === 'DATA_DIVERGENTE|333'));
  const antigo = dia2.achados.find((a) => a.codigo === 'TITULO_SEM_MEDICAO');
  assert.equal(antigo.desde, '2026-12-01');
  assert.equal(antigo.diasAberto, 1);

  // rodar de novo no mesmo dia nao cria segundo retrato
  await executarConferencia(db, { receitas: corrigidas, agora: new Date('2026-12-02T12:00:00Z') });
  assert.equal(db.tabelas[TABELA].length, 2);
});

test('executarConferencia: OPP fora do ar grava "falha_opp" e nao apaga nem zera o historico', async () => {
  const { planejamentos, receitas } = cenario();
  const db = bancoFalso(planejamentos);
  await executarConferencia(db, { receitas, agora: new Date('2026-12-01T09:30:00Z') });

  const original = require('../src/services/mudancasDeDataService');
  const lerOriginal = original.lerReceitasOPP;
  original.lerReceitasOPP = async () => { throw new Error('OPP 503'); };
  try {
    const r = await executarConferencia(db, { agora: new Date('2026-12-02T09:30:00Z') });
    assert.equal(r.status, 'falha_opp');
  } finally { original.lerReceitasOPP = lerOriginal; }

  const lista = await listarRetratos(db);
  assert.equal(lista[0].status, 'falha_opp');
  assert.match(lista[0].erro, /503/);
  assert.equal(lista[1].status, 'ok');

  // o dia seguinte compara com o ultimo dia VALIDO (01/12), nao com o dia da falha
  const r = await executarConferencia(db, { receitas, agora: new Date('2026-12-03T09:30:00Z') });
  assert.equal(r.novos, 0);
  const dia3 = await lerRetrato(db, '2026-12-03');
  assert.equal(dia3.resumo.comparadoCom, '2026-12-01');
  assert.deepEqual(diasSemRetrato(await listarRetratos(db), '2026-12-01', '2026-12-04'), ['2026-12-02']);
});
