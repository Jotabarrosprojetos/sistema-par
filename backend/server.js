require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const cron = require('node-cron');
const path = require('path');

const { initWebSocket } = require('./src/services/websocketService');
const { syncClickUp } = require('./src/services/clickupService');
const { checkAllAlerts } = require('./src/services/alertService');
const errorHandler = require('./src/middleware/errorHandler');

// Rotas
const authRoutes = require('./src/routes/auth');
const projectsRoutes = require('./src/routes/projects');
const planejamentoRoutes = require('./src/routes/planejamento');
const terceirizadosRoutes = require('./src/routes/terceirizados');
const medicoesRoutes = require('./src/routes/medicoes');
const clickupRoutes = require('./src/routes/clickup');
const opportuneRoutes = require('./src/routes/opportune');
const oppRoutes = require('./src/routes/opp');
const alertasRoutes = require('./src/routes/alertas');
const relatoriosRoutes = require('./src/routes/relatorios');
const relatorioFinalRoutes = require('./src/routes/relatorio-final');
const clickupDashboardsRoutes = require('./src/routes/clickup-dashboards');
const checklistRoutes = require('./src/routes/checklist');
const extratoRoutes = require('./src/routes/extrato');
const auditoriaRoutes = require('./src/routes/auditoria');
const dashboardFinanceiroRoutes = require('./src/routes/dashboard-financeiro');
const baselineRealRoutes = require('./src/routes/baseline-real');

const app = express();
const server = http.createServer(app);

// ── Middlewares globais ──────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
}));
app.use(express.json({
  limit: '10mb',
  // Guarda o corpo cru so do webhook do ClickUp, pra validar a assinatura HMAC
  // sobre os bytes exatos que o ClickUp assinou.
  verify: (req, res, buf) => { if (req.originalUrl.startsWith('/api/clickup/webhook')) req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));

// Pasta de uploads temporários
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Rotas da API ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/projetos', projectsRoutes);
app.use('/api/planejamento', planejamentoRoutes);
app.use('/api/terceirizados', terceirizadosRoutes);
app.use('/api/medicoes', medicoesRoutes);
app.use('/api/clickup/dashboards', clickupDashboardsRoutes); // antes de /api/clickup
app.use('/api/clickup', clickupRoutes);
app.use('/api/opportune', opportuneRoutes);
app.use('/api/opp', oppRoutes);
app.use('/api/alertas', alertasRoutes);
app.use('/api/relatorios', relatoriosRoutes);
app.use('/api/relatorio-final', relatorioFinalRoutes);
app.use('/api/checklist', checklistRoutes);
app.use('/api/extrato', extratoRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/dashboard-financeiro', dashboardFinanceiroRoutes);
app.use('/api/baseline-real', baselineRealRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// Removidas em 22/10/2026 (pedido do chefe, achado de seguranca): as rotas
// /api/admin/opp-ping, /api/admin/env-vars, /api/admin/migrar-para-postgres e
// /api/diagnostico-opp* eram publicas, sem autenticacao real — a senha era
// so a string fixa "teste1234" (ou nem existia, no caso das /diagnostico-opp,
// que vazavam lancamentos financeiros reais do OPP pra qualquer um que
// soubesse a URL). Eram so scripts de debug de uma fase anterior do projeto,
// nao usadas por nenhuma tela do Par (confirmado: nenhuma referencia no
// frontend nem em outras rotas) — removidas por completo em vez de so trocar
// a senha, ja que nao tinham mais utilidade e eram so risco.
// ── WebSocket ─────────────────────────────────────────────────────────────────
initWebSocket(server);

// ── Sync manual ClickUp ───────────────────────────────────────────────────────
// Exige login (28/10/2026, OS 3 condicao e): antes qualquer um disparava um sync
// completo sem autenticacao — e o sync e o processo mais pesado do servidor.
app.post('/api/sync-clickup', require('./src/middleware/auth').authMiddleware, async (req, res) => {
  try {
    console.log('[Manual] Sync ClickUp disparado manualmente.');
    syncClickUp().then(() => checkAllAlerts()).catch(e => console.error('[Manual] Erro sync:', e.message));
    res.json({ ok: true, message: 'Sync iniciado. Aguarde alguns instantes.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sincronização automática com ClickUp ──────────────────────────────────────
const syncInterval = parseInt(process.env.SYNC_INTERVAL_MINUTES || '15');
cron.schedule(`*/${syncInterval} * * * *`, async () => {
  try {
    console.log(`[CRON] Iniciando sync com ClickUp — ${new Date().toLocaleString('pt-BR')}`);
    await syncClickUp();
    await checkAllAlerts();
    console.log('[CRON] Sync concluído.');
  } catch (err) {
    console.error('[CRON] Erro na sincronização:', err.message);
  }
});

// Sync automático OPP a cada 2 horas (minuto 7, p/ nunca bater junto com o
// cron do ClickUp de 15/15min nem com o sync completo de horas às 3h17 —
// os dois rodando ao mesmo tempo foi o que causou os crashes de memoria
// (OOM) em producao, achado em 28/10/2026)
const { syncReceitasDespesas, syncOrdensCompra } = require('./src/services/oppService');
const db = process.env.USE_POSTGRES === 'true'
  ? require('./src/services/postgresService')
  : require('./src/services/googleSheetsService');

// Inicializa banco de dados
db.initialize().then(() => {
  return db.ensureSheetsExist();
}).then(() => {
  const nome = process.env.USE_POSTGRES === 'true' ? 'PostgreSQL' : 'Google Sheets';
  console.log(`[Startup] Banco (${nome}) verificado/conectado.`);
}).catch(err => {
  console.error('[Startup] Erro ao inicializar banco:', err.message);
});

cron.schedule('7 */2 * * *', async () => {
  try {
    console.log(`[CRON] Iniciando sync OPP — ${new Date().toLocaleString('pt-BR')}`);
    const [result] = await Promise.all([
      syncReceitasDespesas(db),
      syncOrdensCompra(db),
    ]);
    console.log(`[CRON] Sync OPP concluído: ${result.totalReceitas} receitas, ${result.totalDespesas} despesas, ${result.medicoesReconciliadas} medições.`);
  } catch (err) {
    console.error('[CRON] Erro no sync OPP:', err.message);
  }
});

// Sync COMPLETO de horas do ClickUp (3 anos) 1x por dia, de madrugada —
// o ciclo de 15/15min (acima) so cobre os ultimos 30 dias pra nao sobrecarregar
// a memoria; isso aqui garante que uma edicao em lancamento antigo tambem
// seja pega, só que 1x/dia em vez de 96x/dia.
cron.schedule('17 3 * * *', async () => {
  try {
    console.log('[CRON] Iniciando sync COMPLETO de horas do ClickUp (3 anos)...');
    await syncClickUp(null, { fullHistorico: true });
    console.log('[CRON] Sync completo de horas concluído.');
  } catch (err) {
    console.error('[CRON] Erro no sync completo de horas:', err.message);
  }
});

// Verificação diária de alertas às 08h
cron.schedule('0 8 * * 1-5', async () => {
  try {
    console.log('[CRON] Verificação diária de alertas...');
    await checkAllAlerts();
  } catch (err) {
    console.error('[CRON] Erro na verificação de alertas:', err.message);
  }
});

// ── Serve frontend (build de produção) ───────────────────────────────────────
const frontendDist = path.join(__dirname, '../frontend/dist');
if (require('fs').existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendDist, 'index.html'));
    }
  });
}

// ── Tratamento de erros ───────────────────────────────────────────────────────
app.use(errorHandler);

// ── Inicialização ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║   Sistema PAR — Cérebro Central de Gestão            ║
  ║   Jota Barros Projetos | Engenharia & Arquitetura    ║
  ╠══════════════════════════════════════════════════════╣
  ║   Backend rodando em: http://localhost:${PORT}          ║
  ║   Ambiente: ${process.env.NODE_ENV || 'development'}                         ║
  ╚══════════════════════════════════════════════════════╝
  `);
  console.log('[Startup] Servidor pronto. Use "Sync ClickUp" no dashboard ou aguarde o cron automático.');
});
