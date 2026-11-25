// Relatorio diario da conferencia para a Roberta. node --test
const test = require('node:test');
const assert = require('node:assert');
const { gerarRelatorio, diasUteis } = require('../src/utils/relatorioConferencia');

const achado = (codigo, id, extra = {}) => ({ codigo, chave: `${codigo}|${id}`, projeto: 'Projeto Beta', descricao: `descricao ${id}`, valor: 1500.5, novo: false, desde: '2026-12-01', diasAberto: 0, ...extra });
const retrato = (extra = {}) => ({
  data: '2026-12-04', status: 'ok', erro: '',
  resumo: { planejamentosAprovados: 68, medicoes: 231, titulosOPP: 130, titulosAbertos: 106, paresConferidos: 35, paresNaRegra: 18, comparadoCom: '2026-12-03', tesourariaSemCentroDeCusto: { quantidade: 2, valor: 2800000.19 } },
  achados: [achado('DATA_DIVERGENTE', '333', { novo: true, desde: '2026-12-04' }), achado('TITULO_SEM_MEDICAO', '666', { desde: '2026-12-01' }), achado('MEDICAO_SEM_DATA', 'a:2', { desde: '2026-12-03' })],
  resolvidos: [{ chave: 'DATA_DIVERGENTE|111', codigo: 'DATA_DIVERGENTE', projeto: 'Projeto Alfa', descricao: 'corrigido', valor: 10 }],
  ...extra,
});

test('diasUteis conta segunda a sexta depois da data de abertura', () => {
  assert.equal(diasUteis('2026-12-01', '2026-12-04'), 3); // ter -> sex: qua, qui, sex
  assert.equal(diasUteis('2026-12-04', '2026-12-07'), 1); // sex -> seg: so a segunda
  assert.equal(diasUteis('2026-12-04', '2026-12-04'), 0);
});

test('relatorio do dia: resumo, grupos, codigos e pedido de resposta', () => {
  const { assunto, corpo } = gerarRelatorio(retrato());
  assert.equal(assunto, 'Conferência Par x OPP de 04/12/2026: 3 em aberto, 1 novo(s), 1 resolvido(s)');
  assert.match(corpo, /^Roberta, bom dia\./);
  assert.match(corpo, /comparada com a de 03\/12\/2026/);
  assert.match(corpo, /Novos hoje \(1\)/);
  assert.match(corpo, /Abertos há mais de 2 dias úteis \(1\)/, 'o de 01/12 tem 3 dias uteis');
  assert.match(corpo, /Continuam em aberto, com até 2 dias úteis \(1\)/);
  assert.match(corpo, /Resolvidos desde o dia anterior \(1\)/);
  assert.match(corpo, /\[DATA_DIVERGENTE\|333\]/);
  assert.match(corpo, /R\$\s?1\.500,50/);
  assert.match(corpo, /2 lançamento\(s\) de tesouraria/);
  assert.match(corpo, /Responda|responda este e-mail/);
  assert.match(corpo, /Abraço,$/);
  assert.ok(!/—|–/.test(corpo), 'sem travessao');
});

test('dia sem retrato valido: diz que nao houve conferencia e nao inventa resultado', () => {
  const { assunto, corpo } = gerarRelatorio({ data: '2026-12-04', status: 'falha_opp', erro: 'OPP 503', resumo: {}, achados: [], resolvidos: [] }, { diasSemConferencia: ['2026-12-02', '2026-12-03'] });
  assert.match(assunto, /não foi feita hoje/);
  assert.match(corpo, /a conferência não foi feita/);
  assert.match(corpo, /não significa que está tudo certo/);
  assert.match(corpo, /OPP 503/);
  assert.match(corpo, /02\/12\/2026, 03\/12\/2026/);
  assert.ok(!/Resumo do dia/.test(corpo));
});

test('dia ok sem achados: diz "Nenhum achado hoje", e acumulado lista os dias sem conferencia', () => {
  const { corpo } = gerarRelatorio(retrato({ achados: [], resolvidos: [] }), { diasSemConferencia: ['2026-12-02'] });
  assert.match(corpo, /Nenhum achado hoje\./);
  assert.match(corpo, /Dias sem conferência desde o último relatório: 02\/12\/2026/);
});

test('primeiro dia, sem retrato anterior, e lista muito longa e cortada com aviso', () => {
  const muitos = Array.from({ length: 130 }, (_, i) => achado('MEDICAO_SEM_DATA', `m${i}`, { novo: true, desde: '2026-12-04' }));
  const { corpo } = gerarRelatorio(retrato({ achados: muitos, resolvidos: [], resumo: { planejamentosAprovados: 1 } }));
  assert.match(corpo, /a primeira, sem dia anterior para comparar/);
  assert.match(corpo, /Novos hoje \(130\)/);
  assert.match(corpo, /e mais 30 itens deste grupo/);
  assert.match(corpo, /titulosOPP|Títulos do OPP lidos: sem dado/);
});
