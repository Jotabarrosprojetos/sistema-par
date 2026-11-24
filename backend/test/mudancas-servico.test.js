// Teste do servico de mudancas de data com banco e OPP falsos (sem rede). node --test
const test = require('node:test');
const assert = require('node:assert');
const { calcularMudancasDeData, verificarMudancasDeData, linkOPP, TIPO_ALERTA } = require('../src/services/mudancasDeDataService');

function bancoFalso(planejamentos, alertas = []) {
  const tabelas = { Planejamentos: planejamentos, Alertas: alertas };
  return {
    tabelas,
    readSheet: async (n) => tabelas[n].map((x) => ({ ...x })),
    insertRow: async (n, d) => { tabelas[n].push({ ...d }); },
    updateManyRowsWhere: async (n, fn, novo) => { let c = 0; for (const x of tabelas[n]) if (fn(x)) { Object.assign(x, novo); c++; } return c; },
  };
}
const plano = (id, nome, chave, medicoes, extra = {}) => ({
  ID: id, ID_Projeto: 'P-' + id, Nome_Projeto: nome, Status: 'Aprovado', ID_Centro_Custo_OPP: chave, Nr_OS_OPP: extra.os || '',
  Link_ClickUp: `https://app.clickup.com/t/1/${id}`, Dados_JSON: JSON.stringify({ _baseline: { medicoes } }),
});
const rec = (id, chave, valor, venc, liquidado, nome = 'x') => ({
  id_conta_rec: id, id_centro_custos: chave, valor_rec: valor, vencimento_rec: venc, liquidado_rec: liquidado ? 'Sim' : 'Nao', nome_conta: nome, nome_cliente: '',
});
const HOJE = new Date(2026, 10, 24);

function cenario() {
  const planejamentos = [
    plano('a', 'Projeto Alfa', '10', [{ etapa: '1', valor: 1000, dataPrevisao: '2026-11-30' }, { etapa: '2', valor: 2000, dataPrevisao: '2026-07-03' }, { etapa: '3', valor: 3000, dataPrevisao: '2027-02-01' }]),
    plano('b', 'Projeto Beta', '20', [{ etapa: '1', valor: 4000, dataPrevisao: '2026-09-14' }]),
    plano('c', 'Projeto Sem Vinculo', '', [{ etapa: '1', valor: 500, dataPrevisao: '2026-10-01' }]),
  ];
  const receitas = [
    rec(111, '10', '1.000,00', '2026-12-30', false),      // Alfa 1: 30/11 + 30 = 30/12: ok
    rec(222, '10', '2.000,00', '2026-08-02', true),       // Alfa 2: ja recebida (titulo pago)
    rec(333, '20', '4.000,00', '2026-12-19', false),      // Beta: planejada 14/09, OPP em 19/12: divergente
    rec(444, '77', '9.000,00', '2026-12-01', false),      // centro de custo sem planejamento aprovado
    rec(555, '', '2.800.000,19', '2026-10-02', false),    // tesouraria, sem centro de custo
  ];
  return { planejamentos, receitas };
}

test('linkOPP monta o endereco da tela de edicao da conta a receber', () => {
  assert.equal(linkOPP(129644202), 'https://erp.opportune.com.br/index.php?Secao=Financeiro.Contas.Rec&Modulo=Financeiro#!editar/129644202');
  assert.equal(linkOPP(''), '');
});

test('calcularMudancasDeData: divergencias com links, e as duas listas com o motivo', async () => {
  const { planejamentos, receitas } = cenario();
  const r = await calcularMudancasDeData(bancoFalso(planejamentos), { receitas, hoje: HOJE });

  assert.equal(r.ajustes.length, 1);
  assert.equal(r.ajustes[0].projeto, 'Projeto Beta');
  assert.equal(r.ajustes[0].vencimentoSugerido, '2026-10-14');
  assert.equal(r.ajustes[0].linkOPP, linkOPP(333));
  assert.equal(r.ajustes[0].linkClickUp, 'https://app.clickup.com/t/1/b');
  assert.equal(r.ajustes[0].ligacao, 'chave');

  const motivosSemTitulo = Object.fromEntries(r.semTitulo.map((m) => [m.projeto + ':' + m.etapa, m.motivo]));
  assert.equal(motivosSemTitulo['Projeto Alfa:2'], 'recebida_no_opp');
  assert.equal(motivosSemTitulo['Projeto Alfa:3'], 'a_vencer_sem_titulo');
  assert.equal(motivosSemTitulo['Projeto Sem Vinculo:1'], 'sem_vinculo_com_opp');

  const motivosSemMedicao = Object.fromEntries(r.semMedicao.map((t) => [t.tituloId, t.motivo]));
  assert.equal(motivosSemMedicao[444], 'sem_planejamento_aprovado');
  assert.equal(motivosSemMedicao[555], 'sem_centro_de_custo');
  assert.equal(r.semMedicao[0].tituloId, 555, 'lista ordenada do maior valor para o menor');
  assert.equal(r.semMedicao[0].linkOPP, linkOPP(555));

  assert.equal(r.resumo.pares, 2);
  assert.equal(r.resumo.semTituloPorMotivo.recebida_no_opp, 1);
  assert.equal(r.resumo.semMedicaoPorMotivo.sem_centro_de_custo, 1);
});

test('alerta: nasce para o Financeiro, nao duplica, renova quando o resumo muda e encerra quando zera', async () => {
  const { planejamentos, receitas } = cenario();
  const db = bancoFalso(planejamentos);

  let r = await verificarMudancasDeData(db, { receitas, hoje: HOJE });
  assert.equal(r.criado, true);
  assert.equal(db.tabelas.Alertas.length, 1);
  const alerta = db.tabelas.Alertas[0];
  assert.equal(alerta.Tipo_Alerta, TIPO_ALERTA);
  assert.equal(alerta.Setor_Destino, 'Financeiro');
  assert.match(alerta.Mensagem, /^1 título\(s\) do OPP com vencimento diferente do planejamento/);
  assert.match(alerta.Mensagem, /Financeiro > Mudanças de data/);

  r = await verificarMudancasDeData(db, { receitas, hoje: HOJE });         // mesma situacao: nao cria outro
  assert.equal(r.criado, false);
  assert.equal(db.tabelas.Alertas.filter((a) => a.Status === 'ativo').length, 1);

  // aparece uma divergencia nova: o aviso anterior e encerrado e um novo nasce
  planejamentos.push(plano('d', 'Projeto Delta', '30', [{ etapa: '1', valor: 7000, dataPrevisao: '2026-01-05' }]));
  receitas.push(rec(666, '30', '7.000,00', '2026-12-01', false));
  r = await verificarMudancasDeData(db, { receitas, hoje: HOJE });
  assert.equal(r.criado, true);
  assert.equal(db.tabelas.Alertas.filter((a) => a.Status === 'ativo').length, 1);
  assert.equal(db.tabelas.Alertas.filter((a) => a.Status === 'Resolvido').length, 1);
  assert.match(db.tabelas.Alertas.find((a) => a.Status === 'ativo').Mensagem, /^2 título\(s\)/);

  // o financeiro ajusta o OPP: as duas datas passam a bater e o alerta e encerrado
  receitas.find((x) => x.id_conta_rec === 333).vencimento_rec = '2026-10-14';
  receitas.find((x) => x.id_conta_rec === 666).vencimento_rec = '2026-02-04';
  r = await verificarMudancasDeData(db, { receitas, hoje: HOJE });
  assert.equal(r.divergentes, 0);
  assert.equal(db.tabelas.Alertas.filter((a) => a.Status === 'ativo').length, 0);
});
