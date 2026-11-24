// Testes do detector de mudanca de data de recebimento. Sem banco, sem rede: node --test
const test = require('node:test');
const assert = require('node:assert');
const { lerData, compararDatas, casar, detectarMudancasDeData, PRAZO_DIAS } = require('../src/utils/datasRecebimento');

test('lerData aceita ISO e DD/MM/AAAA e devolve null para lixo', () => {
  assert.equal(lerData('2026-12-09').getDate(), 9);
  assert.equal(lerData('09/12/2026').getMonth(), 11);
  assert.equal(lerData('09/12/2026').getFullYear(), 2026);
  for (const v of ['', null, undefined, 'abc']) assert.equal(lerData(v), null, String(v));
});

test('a regra normal do prazo (data planejada mais 30 dias) nao e divergencia', () => {
  const c = compararDatas({ dataPrevisao: '2026-11-30' }, { vencimento: '30/12/2026' });
  assert.equal(c.status, 'ok');
  assert.equal(c.esperado, '2026-12-30');
  assert.equal(c.diferenca, 0);
  // 31 dias (mes de 31 dias) e 27 a 33 dias ainda ficam dentro da tolerancia
  assert.equal(compararDatas({ dataPrevisao: '2026-10-20' }, { vencimento: '20/11/2026' }).status, 'ok');
  assert.equal(compararDatas({ dataPrevisao: '2026-11-13' }, { vencimento: '10/12/2026' }).status, 'ok');
  assert.equal(compararDatas({ dataPrevisao: '2026-10-23' }, { vencimento: '25/11/2026' }).status, 'ok');
});

test('a outra convencao (a data do Par ja e o vencimento) tambem e aceita', () => {
  const c = compararDatas({ dataPrevisao: '2026-11-19' }, { vencimento: '19/11/2026' });
  assert.equal(c.status, 'ok');
  assert.equal(c.convencao, 'mesma_data');
  assert.equal(compararDatas({ dataPrevisao: '2026-11-19' }, { vencimento: '20/11/2026' }).status, 'ok');
  assert.equal(compararDatas({ dataPrevisao: '2026-11-19' }, { vencimento: '19/12/2026' }).convencao, 'prazo');
});

test('divergencia: o sentido mostra se o OPP vence depois ou antes do esperado', () => {
  const depois = compararDatas({ dataPrevisao: '2026-09-14' }, { vencimento: '19/12/2026' });
  assert.equal(depois.status, 'divergente');
  assert.equal(depois.sentido, 'opp_depois');
  assert.equal(depois.diferenca, 66); // planejada 14/09 + 30 = 14/10; OPP em 19/12 (a data igual, 14/09, estaria 96 dias antes)
  const antes = compararDatas({ dataPrevisao: '2026-12-09' }, { vencimento: '03/12/2026' });
  assert.equal(antes.status, 'divergente');
  assert.equal(antes.sentido, 'opp_antes');
  assert.equal(antes.diferenca, -6); // a convencao mais proxima e a da data igual: 09/12 contra 03/12
});

test('data ausente nao vira divergencia', () => {
  assert.equal(compararDatas({ dataPrevisao: '' }, { vencimento: '10/12/2026' }).status, 'sem_data');
});

test('casar: mesma chave de centro de custo e valor dentro de R$ 1; um titulo para uma medicao', () => {
  const medicoes = [
    { id: 'm1', projeto: 'Alfa', chave: '10', etapa: '1', valor: 150583, dataPrevisao: '2026-07-03' },
    { id: 'm2', projeto: 'Beta', chave: '20', etapa: '1', valor: 150583, dataPrevisao: '2026-07-03' },
  ];
  const titulos = [{ id: 't1', chave: '20', valor: 150583.96, vencimento: '03/08/2026', descricao: 'qualquer' }];
  const r = casar(medicoes, titulos);
  assert.equal(r.pares.length, 1);
  assert.equal(r.pares[0].medicao.id, 'm2');
  assert.equal(r.pares[0].via, 'chave');
  assert.equal(r.semTitulo.length, 1);
});

test('casar sem chave: so por valor e nome; valor igual de projetos diferentes escolhe pelo nome', () => {
  const medicoes = [
    { id: 'm1', projeto: 'ARQ CORREIOS AC SANTAREM', etapa: '1', valor: 47370.88, dataPrevisao: '2026-12-07' },
    { id: 'm2', projeto: 'ARQ SESAB BA LACEN', etapa: '1', valor: 47370.88, dataPrevisao: '2026-12-07' },
  ];
  const titulos = [{ id: 't1', valor: 47370.88, vencimento: '07/01/2027', descricao: '1ª MEDIÇÃO AGENCIA DE CORREIOS AC SANTAREM' }];
  const r = casar(medicoes, titulos);
  assert.equal(r.pares[0].medicao.id, 'm1');
  assert.equal(r.pares[0].via, 'valor');
});

test('detectarMudancasDeData: lista de ajustes so com as divergentes, do maior desvio ao menor, com a data sugerida', () => {
  const medicoes = [
    { id: 'a', projeto: 'P1', chave: '1', etapa: '1', valor: 1000, dataPrevisao: '2026-11-30' }, // OPP 30/12: ok
    { id: 'b', projeto: 'P2', chave: '2', etapa: '1', valor: 2000, dataPrevisao: '2026-09-14' }, // OPP 19/12: diverge
    { id: 'c', projeto: 'P3', chave: '3', etapa: '1', valor: 3000, dataPrevisao: '2026-12-09' }, // OPP 03/12: diverge
    { id: 'd', projeto: 'P4', chave: '4', etapa: '1', valor: 4000, dataPrevisao: '2027-01-01' }, // sem titulo
  ];
  const titulos = [
    { id: 'ta', chave: '1', valor: 1000, vencimento: '30/12/2026', descricao: 'x' },
    { id: 'tb', chave: '2', valor: 2000, vencimento: '19/12/2026', descricao: 'x' },
    { id: 'tc', chave: '3', valor: 3000, vencimento: '03/12/2026', descricao: 'x' },
    { id: 'te', chave: '9', valor: 5000, vencimento: '03/12/2026', descricao: 'sem medicao' },
  ];
  const r = detectarMudancasDeData(medicoes, titulos);
  assert.deepEqual(r.resumo, { pares: 3, ok: 1, divergentes: 2, semData: 0, semMedicao: 1, semTitulo: 1 });
  assert.equal(r.ajustes.length, 2);
  assert.equal(r.ajustes[0].projeto, 'P2'); // 66 dias de desvio vem primeiro
  assert.equal(r.ajustes[0].vencimentoSugerido, '2026-10-14'); // 14/09 + 30 dias
  assert.equal(r.ajustes[1].sentido, 'opp_antes');
  assert.equal(PRAZO_DIAS, 30);
});
