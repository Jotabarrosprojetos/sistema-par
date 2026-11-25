const { v4: uuidv4 } = require('uuid');
const { arredondar } = require('../utils/dinheiro');
const { extrairMedicoes, paraTitulo } = require('../utils/conferenciaDiaria');
const {
  detectarMudancasDeData, classificarSemTitulo, classificarSemMedicao, PRAZO_DIAS, TOLERANCIA_DIAS,
} = require('../utils/datasRecebimento');

// Tela de edicao de uma conta a receber no OPP (formato visto no teste de 21/10/2026: #!editar/<id_conta_rec>).
const OPP_URL = 'https://erp.opportune.com.br/index.php?Secao=Financeiro.Contas.Rec&Modulo=Financeiro';
const linkOPP = (id) => (id ? `${OPP_URL}#!editar/${id}` : '');

// Contas a receber do OPP (so leitura), sem a lixeira, mesma paginacao do dashboard financeiro.
async function lerReceitasOPP() {
  const { oppRequest } = require('./oppService');
  const todos = [];
  for (let offset = 0; offset <= 10000; offset += 250) {
    const r = await oppRequest('GET', `/contas-receber?limit=250&offset=${offset}&lixeira=Nao`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    todos.push(...lista);
    if (lista.length < 250) break;
  }
  return todos;
}

/**
 * Calcula tudo da tela "Mudancas de data": divergencias de data, medicoes do Par sem titulo aberto no OPP
 * e titulos abertos do OPP sem medicao aprovada. So le; nunca escreve no OPP.
 * `receitas` pode ser injetado (testes); sem ele le o OPP.
 */
async function calcularMudancasDeData(db, { receitas, hoje = new Date() } = {}) {
  const [planejamentos, receitasOPP] = await Promise.all([db.readSheet('Planejamentos'), receitas || lerReceitasOPP()]);

  const { medicoes, chavesComPlano, semVinculo } = extrairMedicoes(planejamentos);

  const titulos = receitasOPP.map(paraTitulo);
  const abertos = titulos.filter((t) => !t.liquidado);
  const pagos = titulos.filter((t) => t.liquidado);
  const r = detectarMudancasDeData(medicoes, abertos);

  const ajustes = r.ajustes.map((a) => {
    const med = r.comparados.find((c) => c.titulo.id === a.tituloId)?.medicao;
    return { ...a, linkOPP: linkOPP(a.tituloId), linkClickUp: med?.linkClickUp || '' };
  });

  const semTitulo = r.semTitulo.map((m) => ({
    projeto: m.projeto, etapa: m.etapa, valor: arredondar(m.valor, 2), dataPrevisao: m.dataPrevisao, linkClickUp: m.linkClickUp,
    motivo: classificarSemTitulo(m, { pagos, temVinculo: !semVinculo.has(m.planoId), hoje }),
  })).sort((a, b) => b.valor - a.valor);

  const semMedicao = r.semMedicao.map((t) => ({
    tituloId: t.id, descricao: t.descricao, valor: arredondar(t.valor, 2), vencimento: t.vencimento, linkOPP: linkOPP(t.id),
    motivo: classificarSemMedicao(t, { chavesComPlano }),
  })).sort((a, b) => b.valor - a.valor);

  const contar = (lista) => lista.reduce((o, x) => { o[x.motivo] = (o[x.motivo] || 0) + 1; return o; }, {});
  return {
    geradoEm: new Date().toISOString(),
    regra: { prazoDias: PRAZO_DIAS, toleranciaDias: TOLERANCIA_DIAS, nota: 'vencimento no OPP = data planejada + prazo, ou a própria data planejada (duas convenções existem no Par)' },
    resumo: { ...r.resumo, semTituloPorMotivo: contar(semTitulo), semMedicaoPorMotivo: contar(semMedicao) },
    ajustes, semTitulo, semMedicao,
  };
}

const TIPO_ALERTA = 'MUDANCA_DATA_RECEBIMENTO';

/**
 * Alerta diario (dia util, 08h) para o financeiro: resumo das datas divergentes. Vai para o perfil Financeiro
 * (a Roberta); quem e Admin (o Ricardo) ve todos os alertas. Um alerta ativo por vez: se o resumo mudou, o
 * antigo e encerrado e um novo nasce (volta a aparecer como nao visto); se a lista zerou, o alerta e encerrado.
 */
async function verificarMudancasDeData(db, opcoes = {}) {
  const calc = await calcularMudancasDeData(db, opcoes);
  const n = calc.ajustes.length;
  const total = calc.ajustes.reduce((s, a) => s + (a.valor || 0), 0);
  const alertas = await db.readSheet('Alertas');
  const ativos = alertas.filter((a) => a.Tipo_Alerta === TIPO_ALERTA && String(a.Status).toLowerCase() === 'ativo');
  const mensagem = n === 0 ? '' : `${n} título(s) do OPP com vencimento diferente do planejamento, somando ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Abra Financeiro > Mudanças de data para ver a lista e ajustar as datas no OPP.`;
  if (n === 0 || ativos.some((a) => a.Mensagem !== mensagem)) {
    await db.updateManyRowsWhere('Alertas', (a) => a.Tipo_Alerta === TIPO_ALERTA && String(a.Status).toLowerCase() === 'ativo' && a.Mensagem !== mensagem, { Status: 'Resolvido' });
  }
  const jaTem = ativos.some((a) => a.Mensagem === mensagem);
  if (n > 0 && !jaTem) {
    await db.insertRow('Alertas', {
      ID: uuidv4(), Tipo_Alerta: TIPO_ALERTA, ID_Projeto: '', Mensagem: mensagem, Data_Geracao: new Date().toISOString(),
      Setor_Destino: 'Financeiro', Visto_Por: '', Status: 'ativo', Nivel: 'warning', Link_ClickUp: '',
    });
    return { criado: true, divergentes: n, total };
  }
  return { criado: false, divergentes: n, total };
}

module.exports = { lerReceitasOPP, calcularMudancasDeData, verificarMudancasDeData, linkOPP, TIPO_ALERTA };
