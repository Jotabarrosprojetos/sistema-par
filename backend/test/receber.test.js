// Testes do abatimento do recebido (OPP) sobre as medicoes planejadas do Par. node --test
const test = require('node:test');
const assert = require('node:assert');
const { abaterRecebido } = require('../src/utils/receber');

const med = (idProjeto, valor, dataPrevisao, statusFinanceiro = 'Pendente') => ({ idProjeto, valor, dataPrevisao, statusFinanceiro });

test('sem recebido, nada muda', () => {
  const ms = [med('A', 100, '2026-05-01'), med('A', 50, '2026-06-01')];
  const r = abaterRecebido(ms, {});
  assert.deepEqual(r, { previsto: 150, abatido: 0, saldo: 150 });
  assert.equal(ms[0].valor, 100);
});

test('o recebido abate das mais antigas para as mais novas, em qualquer ordem de entrada', () => {
  const ms = [med('A', 50, '2026-06-01'), med('A', 100, '2026-05-01'), med('A', 70, '2026-07-01')];
  const r = abaterRecebido(ms, { A: 120 });
  assert.equal(ms[1].statusFinanceiro, 'Recebido');      // 05/2026 inteira (100)
  assert.equal(ms[1].valor, 0);
  assert.equal(ms[0].valor, 30);                         // 06/2026 abatida em 20
  assert.equal(ms[0].statusFinanceiro, 'Pendente');
  assert.equal(ms[2].valor, 70);                         // 07/2026 intacta
  assert.deepEqual(r, { previsto: 220, abatido: 120, saldo: 100 });
});

test('recebido maior que o planejado nao cria saldo negativo', () => {
  const ms = [med('A', 100, '2026-05-01')];
  const r = abaterRecebido(ms, { A: 999 });
  assert.equal(ms[0].valor, 0);
  assert.deepEqual(r, { previsto: 100, abatido: 100, saldo: 0 });
});

test('cada projeto abate so o seu recebido; medicao sem data fica por ultimo', () => {
  const ms = [med('A', 100, ''), med('A', 40, '2026-01-01'), med('B', 80, '2026-02-01')];
  abaterRecebido(ms, { A: 40, B: 0 });
  assert.equal(ms[1].statusFinanceiro, 'Recebido');  // a de A com data foi abatida primeiro
  assert.equal(ms[0].valor, 100);                    // a sem data ficou
  assert.equal(ms[2].valor, 80);                     // B nao foi afetado
});

test('medicoes ja recebidas nao entram de novo, e centavos nao acumulam erro', () => {
  const ms = [med('A', 100, '2026-01-01', 'Recebido'), med('A', 0.3, '2026-02-01'), med('A', 0.1, '2026-03-01')];
  const r = abaterRecebido(ms, { A: 0.1 + 0.2 });
  assert.equal(r.previsto, 0.4);
  assert.equal(r.abatido, 0.3);
  assert.equal(r.saldo, 0.1);
  assert.equal(ms[2].valor, 0.1);
});

test('o atraso so conta o que sobrou depois de abater', () => {
  const hoje = new Date('2026-11-24');
  const ms = [med('A', 100, '2026-07-01'), med('A', 100, '2026-12-01')];
  abaterRecebido(ms, { A: 100 });
  const atraso = ms.filter((m) => m.statusFinanceiro !== 'Recebido' && new Date(m.dataPrevisao) < hoje).reduce((s, m) => s + m.valor, 0);
  assert.equal(atraso, 0);                           // a vencida foi a recebida
});
