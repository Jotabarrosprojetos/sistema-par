// Testes do modulo unico de dinheiro (24/11/2026). Sem banco: node --test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseDinheiro: pd, parseNumero: pn, ehNumeroValido, arredondar, somarDinheiro, formatarBR, formatarMoeda } = require('../src/utils/dinheiro');

test('parseDinheiro: formato BR', () => {
  assert.equal(pd('1.500,00'), 1500);
  assert.equal(pd('47.370,88'), 47370.88);
  assert.equal(pd('1.234.567,89'), 1234567.89);
  assert.equal(pd('0,5'), 0.5);
  assert.equal(pd('R$ 9.691.964,00'), 9691964);
  assert.equal(pd('-1.234,56'), -1234.56);
  assert.equal(pd('(1.234,56)'), -1234.56);
});

test('parseDinheiro: formato EN, a causa do fator 100', () => {
  assert.equal(pd('47370.88'), 47370.88);   // o parser cego devolvia 4737088
  assert.equal(pd('6374331.00'), 6374331);
  assert.equal(pd('1500.5'), 1500.5);
  assert.equal(pd('1,234.56'), 1234.56);
  assert.equal(pd('0.125'), 0.125);
  assert.equal(pd('1234.5678'), 1234.5678);
  assert.equal(pd(String(0.1 + 0.2)), 0.30000000000000004); // o parser dual devolvia 30000000000000004
});

test('parseDinheiro: milhar BR sem decimais', () => {
  assert.equal(pd('1.234'), 1234);
  assert.equal(pd('28.159.068'), 28159068);
  assert.equal(pd('1,234,567'), 1234567);
  assert.equal(pd('1234'), 1234);
});

test('parseDinheiro: numero JS passa direto; vazio e lixo viram 0', () => {
  assert.equal(pd(47370.88), 47370.88);
  assert.equal(pd(0), 0);
  for (const v of [null, undefined, '', '  ', 'abc', 'R$', NaN, Infinity, '1.2.3', '1,2,3']) assert.equal(pd(v), 0, String(v));
});

test('parseNumero: horas, percentuais e valor-hora (o parseFloat truncava 8,5 para 8)', () => {
  assert.equal(pn('8,5'), 8.5);
  assert.equal(pn('36,40'), 36.4);
  assert.equal(pn('8.5'), 8.5);
  assert.equal(pn('16.33'), 16.33);
  assert.equal(pn('7,5'), 7.5);
  assert.equal(pn('1.234'), 1.234);
  assert.equal(pn(12), 12);
  assert.equal(pn(''), 0);
});

test('ehNumeroValido distingue zero de ilegivel', () => {
  assert.equal(ehNumeroValido('0,00'), true);
  assert.equal(ehNumeroValido(0), true);
  assert.equal(ehNumeroValido('abc'), false);
  assert.equal(ehNumeroValido(null), false);
});

test('arredondar e somarDinheiro', () => {
  assert.equal(arredondar(1.005), 1.01);
  assert.equal(arredondar(2.675), 2.68);
  assert.equal(arredondar(-1.005), -1.01);
  assert.equal(arredondar(1234.5678), 1234.57);
  assert.equal(somarDinheiro([0.1, 0.2]), 0.3);
  assert.equal(somarDinheiro(['1.500,00', '47370.88', 10]), 48880.88);
  assert.equal(somarDinheiro([]), 0);
});

test('arredondar nao quebra com notacao cientifica (numeros minusculos ou enormes)', () => {
  assert.equal(arredondar(4.44e-17), 0);
  assert.equal(arredondar(-1e-10), 0);
  assert.equal(arredondar(0.30000000000000004 - 0.3), 0);
  assert.equal(arredondar(1e21), 1e21);
  assert.equal(formatarBR(1e-10), '0,00');
  assert.equal(somarDinheiro([1e-10, 0.1]), 0.1);
});

test('formatarBR e formatarMoeda, e a ida e volta nao muda o valor', () => {
  assert.equal(formatarBR(1234.5), '1.234,50');
  assert.equal(formatarBR(0), '0,00');
  assert.equal(formatarBR(-1234567.891), '-1.234.567,89');
  assert.equal(formatarBR(1234.5, 0), '1.235');
  assert.equal(formatarMoeda(9691964), 'R$ 9.691.964,00');
  assert.equal(formatarMoeda(-5), '-R$ 5,00');
  for (const n of [0, 0.01, 1, 999.99, 1000, 47370.88, 6374331, 9691964.5, 123456789.12]) {
    assert.equal(pd(formatarBR(n)), n, String(n));
    assert.equal(pd(String(n)), n, String(n));
  }
});

test('frontend: a copia ESM se comporta igual ao modulo do backend', async () => {
  const fonte = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'utils', 'dinheiro.js'), 'utf8');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(fonte).toString('base64'));
  const casos = ['1.500,00', '47370.88', '1.234', '1,234.56', '0.125', 'R$ 9.691.964,00', '', 'abc', null, 12.5, '8,5', '36,40', '(1,00)', '28.159.068'];
  for (const c of casos) {
    assert.equal(mod.parseDinheiro(c), pd(c), 'parseDinheiro ' + String(c));
    assert.equal(mod.parseNumero(c), pn(c), 'parseNumero ' + String(c));
  }
  for (const n of [0, 1234.5, -99.999, 9691964]) assert.equal(mod.formatarBR(n), formatarBR(n));
  assert.equal(mod.somarDinheiro([0.1, 0.2]), 0.3);
});
