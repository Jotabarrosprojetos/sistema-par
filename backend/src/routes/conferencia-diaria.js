const express = require('express');
const { authMiddleware, authorize } = require('../middleware/auth');
const { listarRetratos, lerRetrato } = require('../services/conferenciaDiariaService');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');

const router = express.Router();
router.use(authMiddleware);
// Mesmos perfis de leitura financeira da tela Mudancas de data (Admin sempre passa).
// Somente leitura: o retrato do dia e gravado pelo cron do servidor.
router.use(authorize('Financeiro', 'Coordenador', 'Diretoria', 'Leitura-Financeiro'));

/** GET /api/conferencia-diaria -> lista dos retratos (mais recente primeiro), sem o detalhe */
router.get('/', async (req, res, next) => {
  try { res.json(await listarRetratos(db)); } catch (err) { next(err); }
});

/** GET /api/conferencia-diaria/2026-12-01 -> retrato completo do dia */
router.get('/:data', async (req, res, next) => {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.data)) return res.status(400).json({ error: 'Data inválida. Use AAAA-MM-DD.' });
    const r = await lerRetrato(db, req.params.data);
    if (!r) return res.status(404).json({ error: 'Sem retrato nessa data.' });
    res.json(r);
  } catch (err) { next(err); }
});

module.exports = router;
