/**
 * Mudanca de data de recebimento (24/11/2026): compara a data planejada de cada medicao no Par com o
 * vencimento do titulo correspondente no OPP e aponta onde as datas nao combinam. So le e compara;
 * nunca escreve no OPP (a API do OPP nao tem "atualizar conta a receber").
 *
 * Regra de prazo: o vencimento no OPP e a data planejada da medicao + PRAZO_DIAS (30 dias corridos).
 * No Par existem DUAS convencoes para a data da medicao: em umas a data e a da medicao (o vencimento fica 30
 * dias depois) e em outras ja e o proprio vencimento (as duas datas sao iguais). Na leitura de 24/11, 8 dos 35
 * pares tinham datas iguais. O detector aceita as duas, para nao gerar alarme falso.
 * [PENDENTE DE VALIDACAO com o Beto e a Roberta: 30 dias corridos ou um mes; a leitura dos pares de
 * 24/11 mostrou 31 dias em 6 casos e 30 em 3, o que cabe nas duas leituras.] A TOLERANCIA_DIAS evita
 * alarme por causa dessa diferenca de calendario.
 */
const { arredondar } = require('./dinheiro');

const PRAZO_DIAS = 30;
const TOLERANCIA_DIAS = 5;
const TOLERANCIA_VALOR = 1.0; // o baseline do Par guarda varios valores sem os centavos

const DIA = 86400000;

/** "2026-12-09", "09/12/2026" ou Date -> Date local (meia-noite); null se nao der. */
function lerData(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}

function diasEntre(a, b) { return Math.round((a - b) / DIA); }
function somarDias(d, n) { const r = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return r; }
function iso(d) { return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null; }

/**
 * Compara um par (medicao do Par, titulo do OPP).
 * diferenca > 0: o OPP vence DEPOIS do esperado (a empresa conta com receber antes do que o OPP mostra);
 * diferenca < 0: o OPP vence ANTES do esperado.
 */
function compararDatas(medicao, titulo, { prazoDias = PRAZO_DIAS, toleranciaDias = TOLERANCIA_DIAS } = {}) {
  const planejada = lerData(medicao.dataPrevisao);
  const venc = lerData(titulo.vencimento);
  if (!planejada || !venc) return { status: 'sem_data', planejada: iso(planejada), vencimentoOPP: iso(venc) };
  const comPrazo = somarDias(planejada, prazoDias);          // convencao 1: data da medicao
  const difPrazo = diasEntre(venc, comPrazo);
  const difMesma = diasEntre(venc, planejada);                // convencao 2: a data ja e o vencimento
  const aceita = Math.abs(difPrazo) <= toleranciaDias || Math.abs(difMesma) <= toleranciaDias;
  // A diferenca informada e a da convencao mais proxima; a data sugerida e sempre a da regra do prazo.
  const diferenca = Math.abs(difMesma) < Math.abs(difPrazo) ? difMesma : difPrazo;
  return {
    status: aceita ? 'ok' : 'divergente',
    planejada: iso(planejada), esperado: iso(comPrazo), vencimentoOPP: iso(venc), diferenca,
    convencao: Math.abs(difMesma) < Math.abs(difPrazo) ? 'mesma_data' : 'prazo',
    sentido: diferenca > 0 ? 'opp_depois' : diferenca < 0 ? 'opp_antes' : 'igual',
  };
}

const tokens = (s) => new Set(String(s || '').toUpperCase().normalize('NFD').replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3));
function sobreposicao(a, b) { const A = tokens(a); const B = tokens(b); let n = 0; for (const x of A) if (B.has(x)) n++; return n; }

/**
 * Casa titulos do OPP com medicoes do Par, um para um.
 *   medicoes: [{ id, projeto, chave?, etapa, valor, dataPrevisao }]   chave = id do centro de custo do OPP, se houver
 *   titulos:  [{ id, chave?, valor, vencimento, descricao }]
 * Regra: mesma chave (quando as duas tem), valor dentro da tolerancia; entre candidatos, o de data mais
 * proxima da esperada. Sem chave, vale o valor e, na duvida, o nome. Casamento por valor e heuristico: os
 * pares sem chave devem ser conferidos por uma pessoa.
 */
function casar(medicoes, titulos, { tolerancia = TOLERANCIA_VALOR, prazoDias = PRAZO_DIAS } = {}) {
  const livres = medicoes.map((m) => ({ ...m, _usada: false }));
  const pares = []; const semMedicao = [];
  const ordenados = [...titulos].sort((a, b) => b.valor - a.valor);
  for (const t of ordenados) {
    const venc = lerData(t.vencimento);
    const cand = livres.filter((m) => !m._usada && Math.abs(m.valor - t.valor) <= tolerancia
      && (!t.chave || !m.chave || String(t.chave) === String(m.chave)));
    const pontuar = (m) => {
      const pl = lerData(m.dataPrevisao);
      const dist = pl && venc ? Math.abs(diasEntre(venc, somarDias(pl, prazoDias))) : 9999;
      const mesmaChave = t.chave && m.chave && String(t.chave) === String(m.chave) ? 0 : 1;
      return [mesmaChave, -sobreposicao(`${m.projeto} ${m.etapa}`, t.descricao), dist];
    };
    cand.sort((a, b) => { const pa = pontuar(a); const pb = pontuar(b); for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]; return 0; });
    const escolhida = cand[0];
    const seguro = escolhida && (t.chave && escolhida.chave || sobreposicao(`${escolhida.projeto} ${escolhida.etapa}`, t.descricao) > 0 || (cand.length === 1 && t.valor > 1000));
    if (escolhida && seguro) { escolhida._usada = true; pares.push({ medicao: escolhida, titulo: t, via: t.chave && escolhida.chave ? 'chave' : 'valor' }); } else semMedicao.push(t);
  }
  return { pares, semMedicao, semTitulo: livres.filter((m) => !m._usada) };
}

/**
 * Resultado completo: pares casados com a comparacao de datas, e a lista de ajustes (so as divergentes),
 * do maior desvio para o menor. `ajuste.vencimentoSugerido` e a data que o OPP deveria ter (planejada + prazo).
 */
function detectarMudancasDeData(medicoes, titulos, opcoes = {}) {
  const { pares, semMedicao, semTitulo } = casar(medicoes, titulos, opcoes);
  const comparados = pares.map((p) => ({ ...p, comparacao: compararDatas(p.medicao, p.titulo, opcoes) }));
  const ajustes = comparados
    .filter((c) => c.comparacao.status === 'divergente')
    .map((c) => ({
      projeto: c.medicao.projeto, etapa: c.medicao.etapa, valor: arredondar(c.titulo.valor, 2),
      tituloId: c.titulo.id, tituloDescricao: c.titulo.descricao,
      dataPlanejadaPar: c.comparacao.planejada, vencimentoAtualOPP: c.comparacao.vencimentoOPP,
      vencimentoSugerido: c.comparacao.esperado, diferencaDias: c.comparacao.diferenca, sentido: c.comparacao.sentido, ligacao: c.via,
    }))
    .sort((a, b) => Math.abs(b.diferencaDias) - Math.abs(a.diferencaDias));
  return {
    comparados, ajustes, semMedicao, semTitulo,
    resumo: {
      pares: comparados.length, ok: comparados.filter((c) => c.comparacao.status === 'ok').length,
      divergentes: ajustes.length, semData: comparados.filter((c) => c.comparacao.status === 'sem_data').length,
      semMedicao: semMedicao.length, semTitulo: semTitulo.length,
    },
  };
}

/**
 * Motivo provavel de uma medicao do Par SEM titulo aberto no OPP.
 *  - recebida_no_opp: ha titulo PAGO no OPP com o mesmo valor (e a mesma chave, quando existe): ja foi recebida;
 *  - a_vencer_sem_titulo: a data planejada ainda nao passou e nao ha titulo: o OPP ainda nao lancou;
 *  - vencida_sem_titulo: a data planejada passou, nao ha titulo aberto nem pago: conferir (nao lancada, valor diferente ou ligacao ausente);
 *  - sem_vinculo_com_opp: o planejamento nao tem centro de custo nem O.S. do OPP, entao nem da para procurar.
 */
function classificarSemTitulo(medicao, { pagos = [], temVinculo = true, hoje = new Date() } = {}) {
  if (!temVinculo) return 'sem_vinculo_com_opp';
  const achou = pagos.some((t) => Math.abs(t.valor - medicao.valor) <= TOLERANCIA_VALOR
    && (!t.chave || !medicao.chave || String(t.chave) === String(medicao.chave)));
  if (achou) return 'recebida_no_opp';
  const d = lerData(medicao.dataPrevisao);
  if (!d) return 'sem_data';
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return d >= h ? 'a_vencer_sem_titulo' : 'vencida_sem_titulo';
}

/**
 * Motivo provavel de um titulo aberto do OPP SEM medicao aprovada no Par.
 *  - sem_centro_de_custo: o titulo nao tem centro de custo (lancamento de tesouraria, ajuste ou titulo antigo);
 *  - sem_planejamento_aprovado: o centro de custo do titulo nao pertence a nenhum planejamento aprovado;
 *  - medicao_nao_planejada: o projeto tem planejamento aprovado, mas nenhuma medicao dele tem esse valor.
 */
function classificarSemMedicao(titulo, { chavesComPlano = new Set() } = {}) {
  if (!titulo.chave) return 'sem_centro_de_custo';
  if (!chavesComPlano.has(String(titulo.chave))) return 'sem_planejamento_aprovado';
  return 'medicao_nao_planejada';
}

module.exports = { PRAZO_DIAS, TOLERANCIA_DIAS, lerData, compararDatas, casar, detectarMudancasDeData, classificarSemTitulo, classificarSemMedicao };
