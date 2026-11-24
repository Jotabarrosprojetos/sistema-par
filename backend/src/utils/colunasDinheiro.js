/**
 * Colunas de dinheiro do banco do Par (Fase 2, 24/11/2026): passam de TEXT para NUMERIC(18,2).
 * A lista foi levantada no banco de producao (information_schema) e todos os valores gravados
 * eram legiveis (inteiro, formato BR com virgula ou formato EN com ponto). Toda gravacao passa por
 * paraBanco(), que converte qualquer formato de entrada ("1.500,00", "1500.00", 1500) em numero.
 * Mantenha esta lista igual a de scripts/migrar-dinheiro-para-numero.sql (um teste confere).
 */
const { parseDinheiro, ehNumeroValido, arredondar } = require('./dinheiro');

const COLUNAS_DINHEIRO = {
  Custos_OPP: ['Valor_Lancado'],
  Despesas_Planejamento: ['Valor'],
  Equipe_Planejamento: ['Total'],
  Financeiro_OPP: ['Valor'],
  Log_Horas: ['Custo_Calculado'],
  Medicoes: ['Valor'],
  OrdensCompra_OPP: ['Valor_Liquidado', 'Valor_Total'],
  OrdensServico_OPP: ['Valor_Total'],
  Planejamentos: ['Valor_Contrato'],
  Projetos_Contratos: ['Teto_Terc_Valor', 'Valor_Global'],
  Terceirizados: ['Valor_Contratado', 'Valor_Estimado', 'Valor_Pago'],
};

function ehColunaDinheiro(tabela, coluna) {
  return !!COLUNAS_DINHEIRO[tabela] && COLUNAS_DINHEIRO[tabela].includes(coluna);
}

/**
 * Valor pronto para gravar no banco. Vazio vira NULL em qualquer coluna. Em coluna de dinheiro,
 * o valor vira numero com 2 casas; texto ilegivel vira NULL com aviso no log (nunca 0 em silencio).
 */
function paraBanco(tabela, coluna, valor) {
  if (valor === '' || valor === undefined || valor === null) return null;
  if (!ehColunaDinheiro(tabela, coluna)) return valor;
  if (!ehNumeroValido(valor)) {
    console.warn(`[Dinheiro] valor ilegivel em ${tabela}.${coluna}: ${JSON.stringify(String(valor)).slice(0, 60)}; gravado como NULL`);
    return null;
  }
  return arredondar(parseDinheiro(valor), 2);
}

module.exports = { COLUNAS_DINHEIRO, ehColunaDinheiro, paraBanco };
