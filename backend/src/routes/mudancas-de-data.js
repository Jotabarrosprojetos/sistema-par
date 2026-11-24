const express = require('express');
const { authMiddleware, authorize } = require('../middleware/auth');
const { parseDinheiro } = require('../utils/dinheiro');
const { detectarMudancasDeData, PRAZO_DIAS, TOLERANCIA_DIAS } = require('../utils/datasRecebimento');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');

const router = express.Router();
router.use(authMiddleware);
// Mesma lista de perfis que ja le planejamento e medicoes (Admin sempre passa).
router.use(authorize('PO', 'Comercial', 'Financeiro', 'Coordenador', 'Diretoria', 'Leitura-Financeiro'));

// Contas a receber do OPP (so leitura), sem a lixeira, mesma paginacao usada no dashboard financeiro.
async function lerReceitasOPP() {
  const { oppRequest } = require('../services/oppService');
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
 * GET /api/mudancas-de-data
 * Compara a data planejada de cada medicao dos planejamentos aprovados com o vencimento do titulo em aberto
 * no OPP e devolve a lista de ajustes. Nunca escreve no OPP: a API do OPP nao tem "atualizar conta a receber".
 * Quando o planejamento tem o centro de custo do OPP confirmado, o casamento usa essa chave; sem ela, valor e nome.
 */
router.get('/', async (req, res, next) => {
  try {
    const [planejamentos, receitas] = await Promise.all([
      db.readSheet('Planejamentos'),
      lerReceitasOPP().catch(() => null),
    ]);
    if (receitas === null) return res.status(503).json({ error: 'OPP indisponível no momento. Tente de novo em instantes.' });

    const medicoes = [];
    for (const plan of planejamentos.filter((p) => p.Status === 'Aprovado')) {
      let dados = {};
      try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch { /* sem JSON */ }
      const d = dados._baseline || dados;
      const lista = d.medicoes || d.medicoesCronograma || [];
      lista.forEach((m, i) => {
        medicoes.push({
          id: `${plan.ID}:${i}`,
          projeto: `${plan.Nome_Projeto || ''} ${plan.Nr_OS_OPP || ''} ${plan.Nr_Contrato_OS || ''}`.trim(),
          idProjeto: plan.ID_Projeto,
          chave: plan.ID_Centro_Custo_OPP ? String(plan.ID_Centro_Custo_OPP) : undefined,
          etapa: String(m.etapa || m.nome || `Medição ${i + 1}`),
          valor: parseDinheiro(m.valorPlan || m.valor || m.valorPlanejado || 0),
          dataPrevisao: m.dataPrevisao || m.dataPrevista || '',
        });
      });
    }
    const titulos = receitas
      .filter((r) => r.liquidado_rec !== 'Sim')
      .map((r) => ({
        id: r.id_conta_rec || r.id_rec || r.id || r.n_documento_rec || '',
        chave: r.id_centro_custos && String(r.id_centro_custos) !== '0' ? String(r.id_centro_custos) : undefined,
        valor: parseDinheiro(r.valor_rec),
        vencimento: r.vencimento_rec,
        descricao: `${r.nome_conta || ''} ${r.nome_cliente || ''}`.trim(),
      }));

    const r = detectarMudancasDeData(medicoes, titulos);
    res.json({
      geradoEm: new Date().toISOString(),
      regra: { prazoDias: PRAZO_DIAS, toleranciaDias: TOLERANCIA_DIAS, nota: 'vencimento no OPP = data planejada + prazo, ou a própria data planejada (duas convenções existem no Par)' },
      resumo: r.resumo,
      ajustes: r.ajustes,
    });
  } catch (err) { next(err); }
});

module.exports = router;
