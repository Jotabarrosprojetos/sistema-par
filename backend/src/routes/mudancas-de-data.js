const express = require('express');
const { authMiddleware, authorize } = require('../middleware/auth');
const { calcularMudancasDeData } = require('../services/mudancasDeDataService');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');

const router = express.Router();
router.use(authMiddleware);
// Mesma lista de perfis que ja le planejamento e medicoes (Admin sempre passa).
router.use(authorize('PO', 'Comercial', 'Financeiro', 'Coordenador', 'Diretoria', 'Leitura-Financeiro'));

/**
 * GET /api/mudancas-de-data
 * Datas divergentes entre o planejamento do Par e o vencimento dos titulos abertos do OPP, mais as duas listas
 * que ficam de fora (medicoes sem titulo e titulos sem medicao), com o motivo provavel de cada uma e os links
 * para o OPP e para o ClickUp. Nunca escreve no OPP: a API do OPP nao tem "atualizar conta a receber".
 */
router.get('/', async (req, res, next) => {
  try {
    const resultado = await calcularMudancasDeData(db).catch((e) => ({ erroOPP: e }));
    if (resultado.erroOPP) return res.status(503).json({ error: 'OPP indisponível no momento. Tente de novo em instantes.' });
    res.json(resultado);
  } catch (err) { next(err); }
});

module.exports = router;
