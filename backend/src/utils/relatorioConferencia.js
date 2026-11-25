/**
 * Relatorio diario da conferencia Par x OPP para a Roberta (portao de dados de 30 dias). Texto simples, formato
 * fixo, sem numero inventado: o que nao foi conferido aparece como "sem conferencia". Funcoes puras.
 */
const { CODIGOS } = require('./conferenciaDiaria');

const brData = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const brReais = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MAX_POR_GRUPO = 100;

/** Dias uteis (segunda a sexta) depois de `desde` ate `ate`, inclusive `ate`. Feriados nao entram na conta. */
function diasUteis(desde, ate) {
  let n = 0;
  const d = new Date(`${desde}T12:00:00Z`);
  const fim = new Date(`${ate}T12:00:00Z`);
  for (d.setUTCDate(d.getUTCDate() + 1); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) n += 1;
  }
  return n;
}

const linhaAchado = (a) => `- ${a.projeto || 'sem projeto'}: ${a.descricao}${a.valor ? ` (${brReais(a.valor)})` : ''} [${a.chave}]`;

function grupo(titulo, itens, extra = '') {
  if (!itens.length) return [];
  const L = [`${titulo} (${itens.length})${extra}`];
  // Dentro do grupo, por tipo de achado e do maior valor para o menor, para a Roberta ler um tipo de cada vez.
  const ordenados = [...itens].sort((a, b) => (a.codigo || '').localeCompare(b.codigo || '') || (b.valor || 0) - (a.valor || 0));
  ordenados.slice(0, MAX_POR_GRUPO).forEach((a) => L.push(linhaAchado(a)));
  if (itens.length > MAX_POR_GRUPO) L.push(`- e mais ${itens.length - MAX_POR_GRUPO} itens deste grupo, que aparecem no retrato do dia`);
  L.push('');
  return L;
}

/**
 * retrato: { data, status, erro, resumo, achados, resolvidos } como devolve GET /api/conferencia-diaria/AAAA-MM-DD
 * diasSemConferencia: datas (AAAA-MM-DD) desde o ultimo relatorio enviado sem retrato valido
 */
function gerarRelatorio(entrada, { diasSemConferencia = [] } = {}) {
  const retrato = { ...entrada, achados: entrada.achados || [], resolvidos: entrada.resolvidos || [] };
  const data = retrato.data;
  const L = ['Roberta, bom dia.', ''];

  if (retrato.status !== 'ok') {
    L.push(`Hoje, ${brData(data)}, a conferência não foi feita: ${retrato.status === 'falha_par' ? 'não consegui ler os planejamentos do Par' : 'o OPP não respondeu ou devolveu a lista vazia'}. Não há resultado do dia, e isso não significa que está tudo certo. Motivo registrado: ${retrato.erro || 'sem detalhe'}.`);
  } else {
    const r = retrato.resumo || {};
    const novos = retrato.achados.filter((a) => a.novo);
    const antigos = retrato.achados.filter((a) => !a.novo).map((a) => ({ ...a, desde: a.desde || data }));
    const parados = antigos.filter((a) => diasUteis(a.desde, data) > 2);
    L.push(`Segue a conferência do Par com o OPP de ${brData(data)}${r.comparadoCom ? `, comparada com a de ${brData(r.comparadoCom)}` : ', a primeira, sem dia anterior para comparar'}.`, '');
    L.push('Resumo do dia');
    L.push(`- Planejamentos aprovados no Par: ${r.planejamentosAprovados ?? 'sem dado'}; medições planejadas: ${r.medicoes ?? 'sem dado'}`);
    L.push(`- Títulos do OPP lidos: ${r.titulosOPP ?? 'sem dado'}, dos quais em aberto: ${r.titulosAbertos ?? 'sem dado'}`);
    L.push(`- Pares medição e título conferidos: ${r.paresConferidos ?? 'sem dado'}, dentro da regra de data: ${r.paresNaRegra ?? 'sem dado'}`);
    L.push(`- Achados em aberto: ${retrato.achados.length}; novos hoje: ${novos.length}; resolvidos desde o dia anterior: ${retrato.resolvidos.length}; abertos há mais de 2 dias úteis: ${parados.length}`);
    if (r.tesourariaSemCentroDeCusto?.quantidade) L.push(`- Fora da conferência: ${r.tesourariaSemCentroDeCusto.quantidade} lançamento(s) de tesouraria sem centro de custo, somando ${brReais(r.tesourariaSemCentroDeCusto.valor)}`);
    L.push('');

    if (!retrato.achados.length && !retrato.resolvidos.length) L.push('Nenhum achado hoje.', '');
    L.push(...grupo('Novos hoje', novos));
    L.push(...grupo('Abertos há mais de 2 dias úteis', parados.sort((a, b) => b.diasAberto - a.diasAberto)));
    const demais = antigos.filter((a) => !parados.includes(a));
    L.push(...grupo('Continuam em aberto, com até 2 dias úteis', demais));
    L.push(...grupo('Resolvidos desde o dia anterior', retrato.resolvidos.map((x) => ({ ...x, descricao: x.descricao, chave: x.chave }))));

    const codigos = [...new Set(retrato.achados.map((a) => a.codigo))];
    if (codigos.length) {
      L.push('O que cada tipo de achado quer dizer');
      codigos.forEach((c) => L.push(`- ${c}: ${CODIGOS[c]?.titulo || c}. Quem resolve: ${CODIGOS[c]?.dono || 'a definir'}.`));
      L.push('');
    }
  }

  if (diasSemConferencia.length) {
    L.push(`Dias sem conferência desde o último relatório: ${diasSemConferencia.map(brData).join(', ')}. Nesses dias o resultado não existe, e não deve ser lido como dia sem divergência.`, '');
  }

  L.push('Peço que você responda este e-mail. Para cada item, use o código que está entre colchetes no fim da linha e diga uma destas três coisas:');
  L.push('1. o que você corrigiu no OPP, e quando;');
  L.push('2. a justificativa, se o que está no OPP está certo e o Par é que deve mudar;');
  L.push('3. uma sugestão para o Par, se a conferência apontou algo que não é erro.');
  L.push('O que você responder eu leio e trato no Par. Qualquer mudança no Par que dependa de decisão eu levo ao Beto antes de fazer.', '');
  L.push('Abraço,');

  const nAbertos = retrato.status === 'ok' ? retrato.achados.length : null;
  const assunto = retrato.status === 'ok'
    ? `Conferência Par x OPP de ${brData(data)}: ${nAbertos} em aberto, ${retrato.achados.filter((a) => a.novo).length} novo(s), ${retrato.resolvidos.length} resolvido(s)`
    : `Conferência Par x OPP de ${brData(data)}: não foi feita hoje`;
  return { assunto, corpo: L.join('\n') };
}

module.exports = { gerarRelatorio, diasUteis, MAX_POR_GRUPO };
