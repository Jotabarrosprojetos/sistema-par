// Testes das colunas de dinheiro (Fase 2). Sem banco: node --test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { COLUNAS_DINHEIRO, ehColunaDinheiro, paraBanco } = require('../src/utils/colunasDinheiro');

test('paraBanco: qualquer formato de entrada vira numero nas colunas de dinheiro', () => {
  assert.equal(paraBanco('Medicoes', 'Valor', '1.500,00'), 1500);
  assert.equal(paraBanco('Medicoes', 'Valor', '47370.88'), 47370.88);
  assert.equal(paraBanco('Medicoes', 'Valor', 6374331), 6374331);
  assert.equal(paraBanco('Financeiro_OPP', 'Valor', 'R$ 22.715.600,82'), 22715600.82);
  assert.equal(paraBanco('Projetos_Contratos', 'Valor_Global', '1.234'), 1234);
  assert.equal(paraBanco('Planejamentos', 'Valor_Contrato', '9981959.999'), 9981960);
});

test('paraBanco: vazio vira NULL em qualquer coluna; texto ilegivel vira NULL no dinheiro, com aviso', () => {
  for (const v of ['', undefined, null]) {
    assert.equal(paraBanco('Medicoes', 'Valor', v), null);
    assert.equal(paraBanco('Medicoes', 'Etapa', v), null);
  }
  const avisos = []; const orig = console.warn; console.warn = (m) => avisos.push(m);
  try { assert.equal(paraBanco('Medicoes', 'Valor', 'abc'), null); } finally { console.warn = orig; }
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /Medicoes\.Valor/);
});

test('paraBanco: colunas que nao sao dinheiro passam sem alteracao', () => {
  assert.equal(paraBanco('Medicoes', 'Etapa', '1.500,00'), '1.500,00');
  assert.equal(paraBanco('Configuracoes', 'Valor', '1.234'), '1.234');           // Configuracoes.Valor e chave de configuracao
  assert.equal(paraBanco('Planejamentos', 'Impostos_Perc', '16,33'), '16,33');   // percentual nao entra
  assert.equal(ehColunaDinheiro('Configuracoes', 'Valor'), false);
});

test('a lista de colunas do codigo e a do SQL de migracao sao a mesma', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'migrar-dinheiro-para-numero.sql'), 'utf8');
  const doSql = [...sql.matchAll(/\['([A-Za-z_]+)','([A-Za-z_]+)'\]/g)].map((m) => `${m[1]}.${m[2]}`).sort();
  const doCodigo = Object.entries(COLUNAS_DINHEIRO).flatMap(([t, cs]) => cs.map((c) => `${t}.${c}`)).sort();
  assert.deepEqual(doSql, doCodigo);
  assert.equal(doCodigo.length, 15);
});

test('o CREATE TABLE do servico usa NUMERIC em todas as colunas de dinheiro e TEXT em Configuracoes.Valor', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'postgresService.js'), 'utf8');
  for (const [t, cs] of Object.entries(COLUNAS_DINHEIRO)) {
    const ini = src.indexOf('CREATE TABLE IF NOT EXISTS "' + t + '" (');
    assert.ok(ini >= 0, 'sem CREATE TABLE de ' + t);
    const fim = src.indexOf(')`', ini); // fim do bloco: parentese seguido de crase
    const bloco = src.slice(ini, fim);
    for (const c of cs) assert.ok(bloco.includes('"' + c + '" NUMERIC(18,2)'), t + '.' + c + ' deve ser NUMERIC(18,2)');
  }
  assert.ok(src.includes('"Chave" TEXT PRIMARY KEY, "Valor" TEXT'), 'Configuracoes.Valor deve continuar TEXT');
});
