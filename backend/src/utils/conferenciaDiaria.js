/**
 * Conferencia diaria Par x OPP (portao de dados de 30 dias, 01 a 31/12/2026). Funcoes puras, sem rede e sem banco:
 * recebem os planejamentos aprovados e os titulos do OPP e devolvem a lista de achados do dia. So le e compara;
 * nunca corrige nada no Par nem no OPP (decisao de 24/11: o Par acusa, o dono do dado corrige).
 *
 * Cada achado tem uma `chave` estavel entre os dias (mesmo problema = mesma chave), que permite dizer o que e
 * novo, o que continua aberto e ha quantos dias, e o que foi resolvido.
 */
const { arredondar, parseDinheiro } = require('./dinheiro');
const { detectarMudancasDeData, classificarSemTitulo, classificarSemMedicao } = require('./datasRecebimento');

/** Codigos dos achados, com a gravidade e uma frase para o relatorio. */
const CODIGOS = {
  DATA_DIVERGENTE: { gravidade: 'atencao', titulo: 'Vencimento no OPP diferente do planejamento do Par', dono: 'Roberta ajusta no OPP, ou o Par corrige o planejamento' },
  MEDICAO_VENCIDA_SEM_TITULO: { gravidade: 'atencao', titulo: 'Medicao do Par com data vencida e sem titulo no OPP', dono: 'Roberta lanca no OPP, ou o Par corrige a medicao' },
  MEDICAO_SEM_DATA: { gravidade: 'atencao', titulo: 'Medicao do Par sem data planejada', dono: 'planejamento no Par' },
  TITULO_SEM_MEDICAO: { gravidade: 'atencao', titulo: 'Titulo aberto do OPP sem medicao planejada no Par', dono: 'Roberta e o planejamento do Par' },
  TITULO_SEM_PLANEJAMENTO: { gravidade: 'informacao', titulo: 'Titulo aberto do OPP de centro de custo sem planejamento aprovado no Par', dono: 'planejamento no Par' },
  PLANEJAMENTO_SEM_VINCULO: { gravidade: 'atencao', titulo: 'Planejamento aprovado sem centro de custo nem O.S. numerica do OPP', dono: 'Roberta informa o vinculo' },
  CENTRO_DE_CUSTO_REPETIDO: { gravidade: 'atencao', titulo: 'Mesmo centro de custo em mais de um planejamento aprovado', dono: 'planejamento no Par' },
};

/** Le o JSON do baseline de um planejamento sem derrubar o calculo se estiver quebrado. */
function lerDados(plan) {
  try { return JSON.parse(plan.Dados_JSON || '{}'); } catch { return {}; }
}

/**
 * Extrai dos planejamentos aprovados: medicoes, centros de custo com plano, planos sem vinculo.
 * Mesma regra que a tela "Mudancas de data" usa (uma so fonte de verdade para as duas).
 */
function extrairMedicoes(planejamentos) {
  const medicoes = []; const chavesComPlano = new Set(); const semVinculo = new Set(); const planos = [];
  for (const plan of planejamentos.filter((p) => p.Status === 'Aprovado')) {
    const dados = lerDados(plan);
    const d = dados._baseline || dados;
    const chave = plan.ID_Centro_Custo_OPP ? String(plan.ID_Centro_Custo_OPP) : undefined;
    const temOS = /^[0-9, ]+$/.test(String(plan.Nr_OS_OPP || ''));
    if (chave) chavesComPlano.add(chave);
    if (!chave && !temOS) semVinculo.add(plan.ID);
    planos.push({ id: plan.ID, projeto: plan.Nome_Projeto || '', chave, temOS, link: plan.Link_ClickUp || dados.linkClickUp || '' });
    (d.medicoes || d.medicoesCronograma || []).forEach((m, i) => {
      medicoes.push({
        id: `${plan.ID}:${i}`,
        planoId: plan.ID,
        projeto: plan.Nome_Projeto || '',
        idProjeto: plan.ID_Projeto,
        chave,
        etapa: String(m.etapa || m.nome || `Medição ${i + 1}`),
        valor: parseDinheiro(m.valorPlan || m.valor || m.valorPlanejado || 0),
        dataPrevisao: m.dataPrevisao || m.dataPrevista || '',
        linkClickUp: plan.Link_ClickUp || dados.linkClickUp || '',
      });
    });
  }
  return { medicoes, chavesComPlano, semVinculo, planos };
}

/** Converte uma linha de contas a receber do OPP no formato usado pelo detector. */
function paraTitulo(r) {
  return {
    id: r.id_conta_rec || r.id_rec || r.id || '',
    chave: r.id_centro_custos && String(r.id_centro_custos) !== '0' ? String(r.id_centro_custos) : undefined,
    valor: parseDinheiro(r.valor_rec),
    vencimento: r.vencimento_rec,
    descricao: `${r.nome_conta || ''} ${r.nome_cliente || ''}`.trim(),
    liquidado: r.liquidado_rec === 'Sim',
  };
}

// Palavras que marcam lancamento de tesouraria na descricao do titulo (lido em 25/11/2026: "RESGATE CDB DI BANCO
// ITAU", "VENCIMENTO CDB BANCO ITAU"). Lista curta de proposito: so o que e inequivoco, para nao esconder cliente.
// A palavra tem de abrir a descricao (nome da conta), para "PREFEITURA DE RESGATE" nao ser escondida.
const TESOURARIA = /^\s*(CDB\b|RESGATE\b|VENCIMENTO CDB\b|REND(IMENTOS?)?\b|EMPR[EÉ]STIMO\b|TRANSFER[EÊ]NCIA\b|APLICA[CÇ][AÃ]O\b|CART[AÃ]O DE CR[EÉ]DITO\b)/i;
const ehTesouraria = (t) => TESOURARIA.test(String(t.descricao || '').normalize('NFC'));

const soma = (xs, f) => arredondar(xs.reduce((s, x) => s + (f(x) || 0), 0), 2);

/**
 * Monta os achados do dia.
 *   planejamentos: linhas da tabela Planejamentos
 *   receitasOPP:   contas a receber do OPP, sem a lixeira
 */
function montarConferencia(planejamentos, receitasOPP, { hoje = new Date() } = {}) {
  const { medicoes, chavesComPlano, semVinculo, planos } = extrairMedicoes(planejamentos);
  const todos = receitasOPP.map(paraTitulo);
  // Lancamentos de tesouraria (resgate de CDB, emprestimo, rendimento...) ficam em Contas a receber do OPP, as
  // vezes com centro de custo, mas nao sao recebimento de cliente: saem da conferencia e entram so no resumo.
  const tesourariaPorNome = todos.filter(ehTesouraria);
  const titulos = todos.filter((t) => !ehTesouraria(t));
  const abertos = titulos.filter((t) => !t.liquidado);
  const pagos = titulos.filter((t) => t.liquidado);
  const r = detectarMudancasDeData(medicoes, abertos);
  const achados = [];
  const add = (codigo, chave, resto) => achados.push({ codigo, chave: `${codigo}|${chave}`, gravidade: CODIGOS[codigo].gravidade, ...resto });

  for (const a of r.ajustes) {
    add('DATA_DIVERGENTE', a.tituloId, {
      projeto: a.projeto, descricao: `${a.etapa}: Par ${a.dataPlanejadaPar}, OPP vence em ${a.vencimentoAtualOPP} (esperado ${a.vencimentoSugerido}), ${a.diferencaDias} dia(s)`,
      valor: a.valor, referencia: { tituloId: a.tituloId, ligacao: a.ligacao },
    });
  }

  for (const m of r.semTitulo) {
    const motivo = classificarSemTitulo(m, { pagos, temVinculo: !semVinculo.has(m.planoId), hoje });
    // "recebida no OPP", "a vencer" e "sem vinculo" sao situacoes esperadas ou ja contadas em outro achado
    if (motivo === 'vencida_sem_titulo') {
      add('MEDICAO_VENCIDA_SEM_TITULO', m.id, { projeto: m.projeto, descricao: `${m.etapa}: data planejada ${m.dataPrevisao} sem titulo aberto nem pago no OPP`, valor: arredondar(m.valor, 2), referencia: { medicao: m.id } });
    } else if (motivo === 'sem_data') {
      add('MEDICAO_SEM_DATA', m.id, { projeto: m.projeto, descricao: `${m.etapa}: medição sem data planejada`, valor: arredondar(m.valor, 2), referencia: { medicao: m.id } });
    }
  }

  for (const t of r.semMedicao) {
    const motivo = classificarSemMedicao(t, { chavesComPlano });
    if (motivo === 'medicao_nao_planejada') {
      add('TITULO_SEM_MEDICAO', t.id, { projeto: t.descricao, descricao: `Título ${t.id} com vencimento ${t.vencimento}: o projeto tem planejamento aprovado, mas nenhuma medição com esse valor`, valor: arredondar(t.valor, 2), referencia: { tituloId: t.id } });
    } else if (motivo === 'sem_planejamento_aprovado') {
      add('TITULO_SEM_PLANEJAMENTO', t.id, { projeto: t.descricao, descricao: `Título ${t.id} com vencimento ${t.vencimento}: centro de custo ${t.chave} sem planejamento aprovado`, valor: arredondar(t.valor, 2), referencia: { tituloId: t.id } });
    }
    // sem_centro_de_custo e tesouraria (CDB, emprestimo): entra so no resumo, nao e achado
  }

  for (const p of planos.filter((x) => !x.chave && !x.temOS)) {
    add('PLANEJAMENTO_SEM_VINCULO', p.id, { projeto: p.projeto, descricao: 'Sem centro de custo e sem O.S. numérica do OPP: não dá para conferir', valor: 0, referencia: { plano: p.id } });
  }

  const porChave = new Map();
  for (const p of planos.filter((x) => x.chave)) porChave.set(p.chave, [...(porChave.get(p.chave) || []), p]);
  for (const [chave, lista] of porChave) {
    if (lista.length > 1) add('CENTRO_DE_CUSTO_REPETIDO', chave, { projeto: lista.map((p) => p.projeto).join(' | '), descricao: `Centro de custo ${chave} em ${lista.length} planejamentos aprovados`, valor: 0, referencia: { chave } });
  }

  // Valor diferente entre Par e OPP aparece sozinho: a medicao sem titulo e o titulo sem medicao do mesmo
  // centro de custo (o casamento exige o mesmo valor, com tolerancia de R$ 1). Nao ha achado de total por centro
  // de custo: comparar o planejado inteiro com o lancado daria alarme falso em todo contrato com medicoes futuras.

  const porCodigo = {};
  for (const a of achados) {
    porCodigo[a.codigo] = porCodigo[a.codigo] || { quantidade: 0, valor: 0 };
    porCodigo[a.codigo].quantidade += 1;
    porCodigo[a.codigo].valor = arredondar(porCodigo[a.codigo].valor + (a.valor || 0), 2);
  }
  const tesouraria = r.semMedicao.filter((t) => classificarSemMedicao(t, { chavesComPlano }) === 'sem_centro_de_custo');

  return {
    achados,
    resumo: {
      planejamentosAprovados: planos.length,
      medicoes: medicoes.length,
      titulosOPP: titulos.length,
      titulosAbertos: abertos.length,
      paresConferidos: r.resumo.pares,
      paresNaRegra: r.resumo.ok,
      porCodigo,
      tesourariaSemCentroDeCusto: {
        quantidade: tesouraria.length + tesourariaPorNome.length,
        valor: soma([...tesouraria, ...tesourariaPorNome], (t) => t.valor),
        nota: 'lançamentos de tesouraria (CDB, resgate, empréstimo, rendimento, transferência, cartão) e sem centro de custo; não entram como achado',
      },
      totalPlanejadoPar: soma(medicoes, (m) => m.valor),
    },
  };
}

/**
 * Compara os achados de hoje com os do dia anterior.
 *   anterior: lista de achados do ultimo retrato valido (ou null se nao existe)
 *   `desde` guarda o dia em que o achado apareceu; a idade vem da diferenca de datas (yyyy-mm-dd).
 */
function compararComAnterior(achadosHoje, anterior, dataHoje) {
  const antes = new Map((anterior || []).map((a) => [a.chave, a]));
  const hoje = new Set(achadosHoje.map((a) => a.chave));
  const comHistorico = achadosHoje.map((a) => {
    const previo = antes.get(a.chave);
    const desde = previo?.desde || dataHoje;
    return { ...a, desde, novo: !previo, diasAberto: diasCorridos(desde, dataHoje) };
  });
  const resolvidos = (anterior || []).filter((a) => !hoje.has(a.chave)).map((a) => ({ chave: a.chave, codigo: a.codigo, projeto: a.projeto, descricao: a.descricao, valor: a.valor, desde: a.desde }));
  return { achados: comHistorico, novos: comHistorico.filter((a) => a.novo).length, resolvidos };
}

function diasCorridos(de, ate) {
  const [a, b, c] = de.split('-').map(Number); const [d, e, f] = ate.split('-').map(Number);
  return Math.round((Date.UTC(d, e - 1, f) - Date.UTC(a, b - 1, c)) / 86400000);
}

module.exports = { CODIGOS, extrairMedicoes, paraTitulo, montarConferencia, compararComAnterior, diasCorridos };
