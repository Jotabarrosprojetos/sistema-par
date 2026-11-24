/**
 * A receber e em atraso com o OPP como dono do realizado (decisao do Beto, 24/11/2026).
 *
 * Antes: o "a receber" do dashboard era a soma de TODAS as medicoes planejadas dos planejamentos
 * aprovados, e o "em atraso" a das que ja tinham passado da data planejada, sem abater o que o OPP
 * ja recebeu (a situacao das medicoes vindas do JSON do baseline era sempre "Pendente").
 *
 * Agora: o planejamento do Par segue dono da PREVISAO (valor e data de cada medicao); o OPP e dono
 * do REALIZADO. O que o OPP ja recebeu de cada projeto abate as medicoes do projeto, das mais antigas
 * para as mais novas. O que sobra e o a receber; o que sobra e ja passou da data planejada e o atraso.
 */
const { arredondar } = require('./dinheiro');

function chaveData(m) {
  const t = Date.parse(m.dataPrevisao);
  return Number.isNaN(t) ? Infinity : t; // sem data fica por ultimo
}

/**
 * @param {Array<{idProjeto:string, valor:number, dataPrevisao:string, statusFinanceiro:string}>} medicoes
 *   medicoes planejadas (o array e alterado: marca "Recebido" ou reduz o valor ao saldo).
 * @param {Object<string, number>} recebidoPorProjeto recebido no OPP por projeto
 * @returns {{previsto:number, abatido:number, saldo:number}} totais das medicoes ainda nao recebidas
 */
function abaterRecebido(medicoes, recebidoPorProjeto) {
  const porProjeto = new Map();
  for (const m of medicoes) {
    if (m.statusFinanceiro === 'Recebido') continue;
    if (!porProjeto.has(m.idProjeto)) porProjeto.set(m.idProjeto, []);
    porProjeto.get(m.idProjeto).push(m);
  }
  let previsto = 0; let abatido = 0;
  for (const [idProjeto, lista] of porProjeto) {
    lista.sort((a, b) => chaveData(a) - chaveData(b));
    let credito = Math.max(0, Number(recebidoPorProjeto[idProjeto]) || 0);
    for (const m of lista) {
      m.valorPrevisto = m.valor;
      previsto += m.valor;
      if (credito <= 0 || m.valor <= 0) continue;
      const usado = Math.min(credito, m.valor);
      credito = arredondar(credito - usado);
      abatido += usado;
      if (usado >= m.valor - 0.005) { m.statusFinanceiro = 'Recebido'; m.valor = 0; } else { m.valor = arredondar(m.valor - usado); }
    }
  }
  return { previsto: arredondar(previsto), abatido: arredondar(abatido), saldo: arredondar(previsto - abatido) };
}

module.exports = { abaterRecebido };
