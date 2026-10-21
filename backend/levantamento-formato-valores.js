// LEVANTAMENTO SOMENTE LEITURA — nenhum UPDATE/INSERT/DELETE neste script.
// Rodar de dentro da pasta backend/ do projeto (usa o node_modules e o .env de lá):
//   node levantamento-formato-valores.js
require('dotenv').config();
const fs = require('fs');
const { Client } = require('pg');

function classificar(v) {
  const s = String(v ?? '').trim();
  if (s === '') return 'VAZIO';
  const temPonto = s.includes('.');
  const temVirgula = s.includes(',');
  if (temPonto && temVirgula) {
    if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) return 'BR_COM_MILHAR';
    return 'OUTRO';
  }
  if (!temPonto && temVirgula) {
    if (/^\d+,\d{1,2}$/.test(s)) return 'BR_SEM_MILHAR';
    return 'OUTRO';
  }
  if (temPonto && !temVirgula) {
    if (/^\d+\.\d{1,2}$/.test(s)) return 'EN'; // este é o único que o parseBR lê errado
    return 'OUTRO';
  }
  if (/^\d+$/.test(s)) return 'INTEIRO_SEM_SEPARADOR';
  return 'OUTRO';
}

// Só EN (e OUTRO, por segurança) são realmente lidos errado pelo parseBR do
// resto do sistema. INTEIRO_SEM_SEPARADOR e BR_SEM_MILHAR são formatos
// válidos, o parseBR lê os dois certo — não contar como problema.
function ehProblema(cat) {
  return cat === 'EN' || cat === 'OUTRO';
}

async function contarCampo(client, tabela, campoValor, campoId, campoNome) {
  // Nunca deixa uma coluna que não existe (código e banco divergiram)
  // derrubar o levantamento inteiro — reporta o erro nesse campo e segue
  // pros outros.
  let res;
  try {
    res = await client.query(`SELECT "${campoId}" as id, "${campoNome}" as nome, "${campoValor}" as valor FROM "${tabela}"`);
  } catch (err) {
    return { total: 0, contagem: {}, quebrados: [], erro: err.message };
  }
  const contagem = {};
  const quebrados = [];
  for (const row of res.rows) {
    const cat = classificar(row.valor);
    contagem[cat] = (contagem[cat] || 0) + 1;
    if (ehProblema(cat)) quebrados.push({ id: row.id, nome: row.nome, valor: row.valor, categoria: cat });
  }
  return { total: res.rows.length, contagem, quebrados };
}

async function contarMedicoesJSON(client) {
  const res = await client.query(`SELECT "ID", "Nome_Projeto", "Dados_JSON" FROM "Planejamentos"`);
  const contagem = {};
  const quebrados = [];
  let totalMedicoes = 0;
  for (const row of res.rows) {
    let dados;
    try { dados = JSON.parse(row.Dados_JSON || '{}'); } catch { continue; }
    const medicoes = Array.isArray(dados.medicoes) ? dados.medicoes : [];
    for (const med of medicoes) {
      totalMedicoes++;
      const cat = classificar(med.valor);
      contagem[cat] = (contagem[cat] || 0) + 1;
      if (ehProblema(cat)) quebrados.push({ idPlanejamento: row.ID, projeto: row.Nome_Projeto, etapa: med.etapa || med.descricao || '', valor: med.valor, categoria: cat });
    }
  }
  return { total: totalMedicoes, contagem, quebrados };
}

async function contarMedicoesTabela(client) {
  const res = await client.query(`SELECT "ID_Medicao", "ID_Projeto", "Etapa", "Valor" FROM "Medicoes"`);
  const contagem = {};
  const quebrados = [];
  for (const row of res.rows) {
    const cat = classificar(row.Valor);
    contagem[cat] = (contagem[cat] || 0) + 1;
    if (ehProblema(cat)) quebrados.push({ idMedicao: row.ID_Medicao, idProjeto: row.ID_Projeto, etapa: row.Etapa, valor: row.Valor, categoria: cat });
  }
  return { total: res.rows.length, contagem, quebrados };
}

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  });
  try {
    await client.connect();
    console.log('Conectado ao banco com sucesso.\n');

    const resultado = {
      Planejamentos_Valor_Contrato: await contarCampo(client, 'Planejamentos', 'Valor_Contrato', 'ID', 'Nome_Projeto'),
      Projetos_Valor_Global: await contarCampo(client, 'Projetos_Contratos', 'Valor_Global', 'ID_Projeto', 'Nome'),
      Medicoes_tabela_real_Valor: await contarMedicoesTabela(client),
      Medicoes_dentro_planejamento: await contarMedicoesJSON(client),
      // Novo nesta versão — as duas tabelas do sync automático a cada 2h:
      Financeiro_OPP_Valor: await contarCampo(client, 'Financeiro_OPP', 'Valor', 'ID_OPP', 'Descricao'),
      OrdensCompra_OPP_Valor_Total: await contarCampo(client, 'OrdensCompra_OPP', 'Valor_Total', 'ID_OC', 'Nome_Fornecedor'),
      OrdensCompra_OPP_Valor_Liquidado: await contarCampo(client, 'OrdensCompra_OPP', 'Valor_Liquidado', 'ID_OC', 'Nome_Fornecedor'),
      // Novo nesta versão — campo de Terceirizados, gravado até hoje (21/10)
      // com String() cru em vez de formatarBR() (corrigido agora no routes/
      // terceirizados.js). Isso só diz se JÁ EXISTE dado gravado errado —
      // a leitura já foi corrigida pra ler os dois formatos independente
      // do resultado aqui. "Valor_Estimado" foi removido do levantamento:
      // a coluna não existe na tabela real (ver erro reportado antes) —
      // ver colunas-reais.js pra conferir o schema de verdade.
      Terceirizados_Valor_Contratado: await contarCampo(client, 'Terceirizados', 'Valor_Contratado', 'ID', 'Fornecedor'),
    };

    fs.writeFileSync('levantamento-resultado-completo.json', JSON.stringify(resultado, null, 2));

    const resumo = {};
    for (const [chave, r] of Object.entries(resultado)) {
      resumo[chave] = { total: r.total, contagem: r.contagem, qtdQuebrados: r.quebrados.length };
    }
    console.log('=== RESUMO (contagem por formato — só EN/OUTRO são realmente lidos errado) ===');
    console.log(JSON.stringify(resumo, null, 2));
    console.log('\nLista completa dos quebrados salva em: levantamento-resultado-completo.json');
    console.log('Pra ver só os quebrados de cada campo:');
    console.log(`  node -e "const d=require('./levantamento-resultado-completo.json'); for (const k in d) if (d[k].quebrados.length) console.log(k, JSON.stringify(d[k].quebrados, null, 2));"`);
  } catch (err) {
    console.error('ERRO:', err.message);
  } finally {
    await client.end();
  }
})();
