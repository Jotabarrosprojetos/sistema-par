/**
 * Modulo unico de dinheiro e numeros do Par (auditoria de 24/11/2026).
 *
 * Existiam cerca de 29 copias de "parser de valor", e as que apagavam todo ponto
 * transformavam "47370.88" em 4.737.088 (fator 100). Toda leitura de valor deve passar
 * por aqui. A copia para o frontend esta em frontend/src/utils/dinheiro.js e o teste
 * garante que as duas se comportam igual.
 *
 * Regras de leitura de DINHEIRO (parseDinheiro):
 *  - numero JS: usado como esta (nao passa por texto).
 *  - com virgula: o que vem depois da ultima virgula e decimal; pontos sao milhar ("1.234,56").
 *  - so pontos, mais de um: milhar BR ("1.234.567" = 1234567).
 *  - um ponto so: se o ultimo grupo tem exatamente 3 digitos e a parte inteira tem 1 a 3
 *    digitos e nao e "0", e milhar BR ("1.234" = 1234). Em qualquer outro caso e decimal EN
 *    ("47370.88", "0.125", "1234.5678", "0.30000000000000004").
 *  - vazio, nulo ou ilegivel: 0 (use ehNumeroValido para distinguir de um zero de verdade).
 * Regras de NUMERO comum (parseNumero, para horas, percentuais e valor-hora):
 *  - virgula: decimal BR ("8,5" = 8.5; "36,40" = 36.4).
 *  - um ponto so: SEMPRE decimal ("8.5" = 8.5; "1.234" = 1.234).
 *  - varios pontos: milhar.
 */

function limpar(v) {
  return String(v).replace(/R\$/gi, '').replace(/\s/g, '').replace(/ /g, '');
}

function converter(s, pontoUnicoEhMilhar) {
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  if (!/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;
  let n;
  const ultVirg = s.lastIndexOf(',');
  const ultPonto = s.lastIndexOf('.');
  if (ultVirg >= 0 && ultPonto > ultVirg) {
    // "1,234.56" (EN): a virgula e milhar, o ponto e decimal
    const [inteiro, dec] = [s.slice(0, ultPonto).replace(/,/g, ''), s.slice(ultPonto + 1)];
    if (/[.,]/.test(inteiro) || /[.,]/.test(dec)) return null;
    n = Number(`${inteiro || '0'}.${dec || '0'}`);
  } else if (ultVirg >= 0 && s.indexOf(',') !== ultVirg && ultPonto < 0) {
    // "1,234,567": varias virgulas e nenhum ponto, e milhar EN
    const partes = s.split(',');
    if (partes.slice(1).some((p) => p.length !== 3)) return null;
    n = Number(partes.join(''));
  } else if (s.includes(',')) {
    const i = s.lastIndexOf(',');
    const inteiro = s.slice(0, i).replace(/[.,]/g, '');
    const dec = s.slice(i + 1);
    if (/[.,]/.test(dec)) return null;
    n = Number(`${inteiro || '0'}.${dec || '0'}`);
  } else if (s.includes('.')) {
    const partes = s.split('.');
    if (partes.length > 2) {
      if (partes.slice(1).some((p) => p.length !== 3)) return null;
      n = Number(partes.join(''));
    } else {
      const [inteiro, dec] = partes;
      const milhar = pontoUnicoEhMilhar && dec.length === 3 && inteiro.length >= 1 && inteiro.length <= 3 && inteiro !== '0';
      n = milhar ? Number(inteiro + dec) : Number(`${inteiro || '0'}.${dec || '0'}`);
    }
  } else {
    n = Number(s);
  }
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Le um valor em dinheiro. Devolve numero; 0 se vazio ou ilegivel. */
function parseDinheiro(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === false) return 0;
  const r = converter(limpar(v), true);
  return r === null ? 0 : r;
}

/** Le um numero comum (horas, percentual, valor-hora). Devolve numero; 0 se vazio ou ilegivel. */
function parseNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === false) return 0;
  const r = converter(limpar(v), false);
  return r === null ? 0 : r;
}

/** Diz se o valor e legivel como dinheiro (distingue "ilegivel" de zero de verdade). */
function ehNumeroValido(v) {
  if (typeof v === 'number') return Number.isFinite(v);
  if (v === null || v === undefined) return false;
  return converter(limpar(v), true) !== null;
}

/** Arredonda para N casas, meio para longe do zero, sem o erro de 1.005. */
function arredondar(n, casas = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  const sinal = x < 0 ? -1 : 1;
  const r = Number(`${Math.round(Number(`${Math.abs(x)}e${casas}`))}e-${casas}`);
  return sinal * r;
}

/** Soma em centavos inteiros, para a soma de parcelas nao acumular erro de ponto flutuante. */
function somarDinheiro(lista) {
  let centavos = 0;
  for (const v of lista || []) centavos += Math.round(parseDinheiro(v) * 100);
  return centavos / 100;
}

/** 1234.5 -> "1.234,50" */
function formatarBR(n, casas = 2) {
  const x = arredondar(parseDinheiro(n), casas);
  const [int, dec] = Math.abs(x).toFixed(casas).split('.');
  const milhar = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${x < 0 ? '-' : ''}${milhar}${casas > 0 ? ',' + dec : ''}`;
}

/** 1234.5 -> "R$ 1.234,50" */
function formatarMoeda(n) {
  const s = formatarBR(n, 2);
  return s.startsWith('-') ? `-R$ ${s.slice(1)}` : `R$ ${s}`;
}

module.exports = { parseDinheiro, parseNumero, ehNumeroValido, arredondar, somarDinheiro, formatarBR, formatarMoeda };
