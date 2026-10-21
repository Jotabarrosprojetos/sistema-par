// node backend/diagnosticar-oc-pagar-centrocusto.js
//
// Só lê (não grava nada). Pergunta de hoje: dá pra ligar Ordem de Compra <->
// Conta a Pagar usando Centro de Custo (já que Projetos/Planejamentos têm
// Centro_Custo_OPP) em vez do casamento por fornecedor+valor?
//
// O que já sabemos, testado antes (diagnosticar-formato-centro-custo.js,
// no lado de CONTAS A RECEBER): ~98% das contas a receber liquidadas vêm
// com id_centro_custos=0/null, mesmo em contas de clientes com projeto
// certo. Nunca medimos isso no lado de CONTAS A PAGAR (despesas/OC) — pode
// ser diferente. Esse script mede:
//
//  1) Quantas contas a pagar (ativas, liquidadas) têm id_centro_custos
//     preenchido (!= 0) vs só o texto (centro_custos_pag) vs nada.
//  2) Quantas Ordens de Compra (lista /ordens-compra) trazem ALGUM campo de
//     centro de custo próprio (pra cruzar com a conta a pagar).
//  3) Taxa de sucesso do fallback por TEXTO que já existe no código
//     (oppService.js, sync de Financeiro_OPP) — tenta extrair um número de
//     OC de dentro de observacoes_pag/nome_conta via regex, e confere
//     quantos desses números batem uma OC real que já temos sincronizada.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const { oppRequest } = require('./src/services/oppService');
  const db = require('./src/services/postgresService');

  console.log('=== 1) Centro de custo em /contas-pagar (ativas, até 2000) ===\n');
  let offset = 0, pagar = [];
  while (pagar.length < 2000) {
    const r = await oppRequest('GET', `/contas-pagar?limit=250&offset=${offset}&lixeira=Nao`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    if (lista.length === 0) break;
    pagar.push(...lista);
    if (lista.length < 250) break;
    offset += 250;
  }
  const liquidadasPag = pagar.filter((p) => p.liquidado_pag === 'Sim');
  const comIdCC = liquidadasPag.filter((p) => p.id_centro_custos && p.id_centro_custos !== 0 && p.id_centro_custos !== '0');
  const comSoTextoCC = liquidadasPag.filter((p) => (!p.id_centro_custos || p.id_centro_custos === 0 || p.id_centro_custos === '0') && p.centro_custos_pag && p.centro_custos_pag !== 'null');
  const semNadaCC = liquidadasPag.length - comIdCC.length - comSoTextoCC.length;
  console.log(`Total de contas a pagar carregadas: ${pagar.length} | liquidadas: ${liquidadasPag.length}`);
  console.log(`  Com id_centro_custos preenchido: ${comIdCC.length} (${(100*comIdCC.length/Math.max(liquidadasPag.length,1)).toFixed(1)}%)`);
  console.log(`  Só com texto (centro_custos_pag), sem id: ${comSoTextoCC.length} (${(100*comSoTextoCC.length/Math.max(liquidadasPag.length,1)).toFixed(1)}%)`);
  console.log(`  Sem nenhum dos dois: ${semNadaCC} (${(100*semNadaCC/Math.max(liquidadasPag.length,1)).toFixed(1)}%)`);
  console.log('\nAmostra de 5 (liquidadas, com qualquer coisa em centro de custo):');
  [...comIdCC, ...comSoTextoCC].slice(0, 5).forEach((p) => {
    console.log(`  id_conta_pag=${p.id_conta_pag} | fornecedor="${p.nome_fornecedor}" | id_centro_custos=${p.id_centro_custos} | centro_custos_pag="${p.centro_custos_pag}" | valor_pag=${p.valor_pag}`);
  });

  console.log('\n=== 2) Centro de custo em /ordens-compra (lista, até 500) ===\n');
  offset = 0; let ocs = [];
  while (ocs.length < 5000) {
    const r = await oppRequest('GET', `/ordens-compra?limit=250&offset=${offset}&lixeira=Nao`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    if (lista.length === 0) break;
    ocs.push(...lista);
    if (lista.length < 250) break;
    offset += 250;
  }
  console.log(`Total de OCs carregadas: ${ocs.length}`);
  if (ocs[0]) {
    console.log('Campos disponíveis numa OC (todos):', Object.keys(ocs[0]).join(', '));
    const temCC = ocs.filter((o) => Object.keys(o).some((k) => k.toLowerCase().includes('centro')));
    console.log(`OCs com ALGUM campo cujo nome contém "centro": ${temCC.length} de ${ocs.length}`);
  }

  console.log('\n=== 3) Taxa de sucesso da extração de OC por TEXTO (observacoes_pag/nome_conta) ===\n');
  const ocsConhecidas = new Set(ocs.map((o) => String(o.id_pedido)));
  let comTextoExtraido = 0, bateuOCReal = 0;
  const exemplos = [];
  liquidadasPag.forEach((p) => {
    const obs = p.observacoes_pag || '';
    const nome = p.nome_conta || '';
    const m = obs.match(/ordem(?:\s+de\s+compra)?\s+n(?:r?o\.?|[º°])\s*(\d+)/i)
           || obs.match(/\boc\s*[:\-]?\s*(\d+)/i)
           || obs.match(/\bpedido\s+n[º°]?\s*(\d+)/i)
           || nome.match(/\boc\s*[:\-]?\s*(\d+)/i);
    if (m) {
      comTextoExtraido++;
      const bate = ocsConhecidas.has(m[1]);
      if (bate) bateuOCReal++;
      if (exemplos.length < 8) exemplos.push({ id: p.id_conta_pag, obs: obs.slice(0, 80), extraido: m[1], bateu: bate });
    }
  });
  console.log(`Liquidadas com ALGUM texto que parece citar uma OC: ${comTextoExtraido} de ${liquidadasPag.length} (${(100*comTextoExtraido/Math.max(liquidadasPag.length,1)).toFixed(1)}%)`);
  console.log(`Desses, quantos bateram uma OC REAL que já está sincronizada: ${bateuOCReal}`);
  console.log('\nExemplos:');
  exemplos.forEach((e) => console.log(`  conta=${e.id} | obs="${e.obs}" | extraído="${e.extraido}" | bateu OC real? ${e.bateu ? 'SIM' : 'não'}`));

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
