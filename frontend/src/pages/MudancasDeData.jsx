import { useState, useEffect, useMemo } from "react"
import { toast } from "react-hot-toast"
import { CalendarDaysIcon, ArrowPathIcon, ArrowDownTrayIcon, DocumentTextIcon } from "@heroicons/react/24/outline"
import api from "../utils/api"
import { useTheme } from "../contexts/ThemeContext"
import { useAuth } from "../contexts/AuthContext"

const fmtR = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)
// Aceita "2026-12-09" (planejamento) e "09/12/2026" (OPP) e devolve DD/MM/AAAA.
const dataBR = (v) => {
  const s = String(v || "")
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10).split("-").reverse().join("/")
  return s.slice(0, 10)
}
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const urlSegura = (u) => (/^https:\/\//.test(String(u || "")) ? u : "")

const MOTIVOS = {
  recebida_no_opp: "Já recebida no OPP",
  a_vencer_sem_titulo: "A vencer, título ainda não lançado no OPP",
  vencida_sem_titulo: "Venceu e não há título: conferir",
  sem_vinculo_com_opp: "Planejamento sem vínculo com o OPP",
  sem_data: "Medição sem data planejada",
  sem_centro_de_custo: "Título sem centro de custo (tesouraria, ajuste ou antigo)",
  sem_planejamento_aprovado: "Centro de custo sem planejamento aprovado",
  medicao_nao_planejada: "Projeto planejado, sem medição com esse valor",
}

// Colunas de cada lista: uma definição só alimenta a tabela, a planilha e o PDF.
const SENTIDO = (a) => (a.sentido === "opp_depois" ? "OPP depois" : "OPP antes")
const COLUNAS = {
  divergentes: [
    { t: "Projeto", w: 25, f: (a) => a.projeto },
    { t: "Etapa", w: 12, f: (a) => a.etapa },
    { t: "Valor", w: 10, align: "right", f: (a) => fmtR(a.valor), csv: (a) => String(a.valor).replace(".", ",") },
    { t: "Data\nplanejada", w: 8, f: (a) => dataBR(a.dataPlanejadaPar) },
    { t: "Vencimento\natual (OPP)", w: 9, f: (a) => dataBR(a.vencimentoAtualOPP) },
    { t: "Vencimento\nsugerido", w: 9, bold: true, f: (a) => dataBR(a.vencimentoSugerido) },
    { t: "Dif.\n(dias)", w: 6, align: "right", f: (a) => `${a.diferencaDias > 0 ? "+" : ""}${a.diferencaDias}`, csv: (a) => a.diferencaDias },
    { t: "Sentido", w: 8, selo: true, f: SENTIDO },
    { t: "ClickUp", w: 6, link: (a) => a.linkClickUp, rotulo: "Projeto" },
    { t: "OPP", w: 7, link: (a) => a.linkOPP, rotulo: "Ajustar" },
  ],
  semTitulo: [
    { t: "Projeto", w: 28, f: (m) => m.projeto },
    { t: "Etapa", w: 15, f: (m) => m.etapa },
    { t: "Valor", w: 11, align: "right", f: (m) => fmtR(m.valor), csv: (m) => String(m.valor).replace(".", ",") },
    { t: "Data\nplanejada", w: 10, f: (m) => dataBR(m.dataPrevisao) },
    { t: "Motivo provável", w: 28, f: (m) => MOTIVOS[m.motivo] || m.motivo },
    { t: "ClickUp", w: 8, link: (m) => m.linkClickUp, rotulo: "Projeto" },
  ],
  semMedicao: [
    { t: "Descrição do título no OPP", w: 38, f: (t) => t.descricao },
    { t: "Valor", w: 12, align: "right", f: (t) => fmtR(t.valor), csv: (t) => String(t.valor).replace(".", ",") },
    { t: "Vencimento", w: 11, f: (t) => dataBR(t.vencimento) },
    { t: "Motivo provável", w: 31, f: (t) => MOTIVOS[t.motivo] || t.motivo },
    { t: "OPP", w: 8, link: (t) => t.linkOPP, rotulo: "Abrir" },
  ],
}
const ABAS = {
  divergentes: { rotulo: "Datas divergentes", titulo: "Datas divergentes", vazio: "Nenhuma data divergente. O planejamento e o OPP estão de acordo nos títulos comparados.", campo: "ajustes" },
  semTitulo: { rotulo: "Medições sem título no OPP", titulo: "Medições do Par sem título aberto no OPP", vazio: "Nenhuma medição sem título.", campo: "semTitulo" },
  semMedicao: { rotulo: "Títulos do OPP sem medição", titulo: "Títulos abertos do OPP sem medição aprovada no Par", vazio: "Nenhum título sem medição.", campo: "semMedicao" },
}

function useColors() {
  const { isDark } = useTheme()
  return {
    bg: isDark ? "#0F172A" : "#F8FAFC", surface: isDark ? "#1E293B" : "#ffffff", surface2: isDark ? "#253348" : "#F1F5F9",
    border: isDark ? "#334155" : "#E2E8F0", text1: isDark ? "#F1F5F9" : "#0F172A", text2: isDark ? "#94A3B8" : "#64748B", roxo: "#7C3AED",
  }
}

function Cartao({ titulo, valor, sub, cor, C, onClick, ativo }) {
  return (
    <div onClick={onClick} style={{
      background: C.surface, border: `1.5px solid ${ativo ? C.roxo : C.border}`, borderRadius: 12, padding: "12px 14px", flex: 1, minWidth: 140,
      cursor: onClick ? "pointer" : "default",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.text2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor || C.text1, marginTop: 4 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: C.text2, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Selo({ texto }) {
  const depois = texto === "OPP depois"
  return <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: depois ? "#FEF3C7" : "#DBEAFE", color: depois ? "#92400E" : "#1E40AF", whiteSpace: "nowrap" }}>{texto}</span>
}

function Tabela({ cols, linhas, C }) {
  const th = { textAlign: "left", padding: "8px 8px", fontSize: 10, fontWeight: 700, color: C.text2, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1.5px solid ${C.border}`, whiteSpace: "pre-line", lineHeight: 1.25, verticalAlign: "bottom" }
  const td = { padding: "7px 8px", fontSize: 12, color: C.text1, borderBottom: `1px solid ${C.border}`, verticalAlign: "top", overflowWrap: "anywhere", lineHeight: 1.3 }
  return (
    <div style={{ background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
        <colgroup>{cols.map((c, i) => <col key={i} style={{ width: `${c.w}%` }} />)}</colgroup>
        <thead><tr style={{ background: C.surface2 }}>{cols.map((c, i) => <th key={i} style={{ ...th, textAlign: c.align || "left" }}>{c.t}</th>)}</tr></thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              {cols.map((c, j) => {
                const estilo = { ...td, textAlign: c.align || "left", fontWeight: c.bold ? 700 : 400 }
                if (c.link) {
                  const u = urlSegura(c.link(l))
                  return <td key={j} style={estilo}>{u ? <a href={u} target="_blank" rel="noopener noreferrer" style={{ color: "#2563EB", fontWeight: 700, textDecoration: "none" }}>{c.rotulo} ↗</a> : <span style={{ color: C.text2 }}>sem link</span>}</td>
                }
                const v = c.f(l)
                return <td key={j} style={estilo}>{c.selo ? <Selo texto={v} /> : v}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Planilha: separador ";" e BOM, para abrir certo no Excel em portugues. Os links entram como colunas.
function baixarCSV(cols, linhas, nomeArquivo) {
  const cab = cols.map((c) => c.t.replace("\n", " "))
  const lin = linhas.map((l) => cols.map((c) => (c.link ? c.link(l) || "" : (c.csv ? c.csv(l) : c.f(l)))))
  const e = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const texto = "﻿" + [cab, ...lin].map((r) => r.map(e).join(";")).join("\r\n")
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url; a.download = nomeArquivo; a.click(); URL.revokeObjectURL(url)
}

// Relatorio em PDF: abre uma pagina de impressao A4 paisagem; no dialogo, escolher "Salvar como PDF".
function gerarPDF({ titulo, subtitulo, cols, linhas, cartoes, regra, emitidoPor, nota }) {
  const agora = new Date()
  const emissao = `${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
  const cabecalho = cols.map((c) => `<th style="width:${c.w}%;text-align:${c.align || "left"}">${esc(c.t).replace("\n", "<br>")}</th>`).join("")
  const corpo = linhas.map((l) => `<tr>${cols.map((c) => {
    const al = `text-align:${c.align || "left"}`
    if (c.link) { const u = urlSegura(c.link(l)); return `<td style="${al}">${u ? `<a href="${esc(u)}">${esc(c.rotulo)}</a>` : "-"}</td>` }
    const v = c.f(l)
    if (c.selo) return `<td style="${al}"><span class="selo ${v === "OPP depois" ? "dep" : "ant"}">${esc(v)}</span></td>`
    return `<td style="${al}${c.bold ? ";font-weight:700" : ""}">${esc(v)}</td>`
  }).join("")}</tr>`).join("")
  const cards = cartoes.map((c) => `<div class="card"><div class="cl">${esc(c.t)}</div><div class="cv">${esc(c.v)}</div>${c.s ? `<div class="cs">${esc(c.s)}</div>` : ""}</div>`).join("")
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)} - ${esc(emissao)}</title><style>
@page { size: A4 landscape; margin: 12mm 10mm 15mm 10mm;
  @bottom-left { content: "Par · Jota Barros Projetos · emitido em ${esc(emissao)}"; font: 7.5pt Arial, sans-serif; color: #64748B; }
  @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 7.5pt Arial, sans-serif; color: #64748B; } }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Arial, Helvetica, sans-serif; color: #0F172A; margin: 0; font-size: 9pt; }
.topo { display: flex; align-items: center; gap: 14px; border-bottom: 2.5px solid #122D57; padding-bottom: 8px; margin-bottom: 10px; }
.topo img { height: 38px; }
.topo .tt { flex: 1; } .topo h1 { font-size: 16pt; margin: 0; color: #122D57; } .topo .st { font-size: 9.5pt; color: #475569; margin-top: 2px; }
.topo .em { text-align: right; font-size: 8.5pt; color: #334155; line-height: 1.5; } .topo .em b { color: #0F172A; }
.cards { display: flex; gap: 8px; margin-bottom: 9px; } .card { flex: 1; border: 1px solid #CBD5E1; border-top: 3px solid #7C3AED; border-radius: 6px; padding: 6px 9px; }
.cl { font-size: 7pt; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: .05em; } .cv { font-size: 14pt; font-weight: 800; margin-top: 2px; } .cs { font-size: 7.5pt; color: #64748B; }
.regra { font-size: 8pt; color: #334155; background: #F1F5F9; border-left: 3px solid #7C3AED; padding: 6px 9px; margin-bottom: 9px; line-height: 1.45; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead { display: table-header-group; } tr { break-inside: avoid; page-break-inside: avoid; }
th { background: #122D57; color: #fff; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .03em; padding: 6px 6px; line-height: 1.25; vertical-align: bottom; }
td { font-size: 8pt; padding: 5px 6px; border-bottom: 1px solid #E2E8F0; vertical-align: top; overflow-wrap: anywhere; line-height: 1.3; }
tbody tr:nth-child(even) td { background: #F8FAFC; }
a { color: #1D4ED8; font-weight: 700; text-decoration: none; }
.selo { display: inline-block; padding: 1px 6px; border-radius: 99px; font-size: 7pt; font-weight: 700; white-space: nowrap; } .selo.dep { background: #FEF3C7; color: #92400E; } .selo.ant { background: #DBEAFE; color: #1E40AF; }
.fim { margin-top: 10px; font-size: 7.5pt; color: #64748B; line-height: 1.45; }
.vazio { padding: 24px; text-align: center; color: #64748B; border: 1px solid #E2E8F0; border-radius: 6px; }
</style></head><body>
<div class="topo"><img src="${esc(window.location.origin)}/logo.png" alt="" onerror="this.style.display='none'">
<div class="tt"><h1>${esc(titulo)}</h1><div class="st">${esc(subtitulo)}</div></div>
<div class="em">Emitido em <b>${esc(emissao)}</b><br>Emitido por <b>${esc(emitidoPor || "-")}</b></div></div>
<div class="cards">${cards}</div>
<div class="regra">${esc(regra)}</div>
${linhas.length ? `<table><thead><tr>${cabecalho}</tr></thead><tbody>${corpo}</tbody></table>` : `<div class="vazio">Nenhum item nesta lista.</div>`}
<div class="fim">${esc(nota)}</div>
</body></html>`
  const janela = window.open("", "_blank")
  if (!janela) { toast.error("O navegador bloqueou a janela do relatório. Libere os pop-ups para este site."); return }
  janela.document.open(); janela.document.write(html); janela.document.close()
  const imprimir = () => { try { janela.focus(); janela.print() } catch { /* o usuario imprime na mao */ } }
  const img = janela.document.querySelector("img")
  if (img && !img.complete) { img.onload = imprimir; img.onerror = imprimir; setTimeout(imprimir, 2500) } else setTimeout(imprimir, 400)
}

export default function MudancasDeData() {
  const C = useColors()
  const { user } = useAuth()
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState("")
  const [aba, setAba] = useState("divergentes")
  const [filtro, setFiltro] = useState("todos")
  const [busca, setBusca] = useState("")

  async function carregar() {
    setCarregando(true); setErro("")
    try { const { data } = await api.get("/mudancas-de-data"); setDados(data) }
    catch (e) { const msg = e?.response?.data?.error || "Não foi possível carregar a lista."; setErro(msg); toast.error(msg) }
    finally { setCarregando(false) }
  }
  useEffect(() => { carregar() }, [])

  const trocarAba = (a) => { setAba(a); setFiltro("todos"); setBusca("") }
  const cols = COLUNAS[aba]
  const todas = dados?.[ABAS[aba].campo] || []
  const campoFiltro = aba === "divergentes" ? "sentido" : "motivo"
  const opcoes = useMemo(() => {
    const cont = {}
    todas.forEach((x) => { cont[x[campoFiltro]] = (cont[x[campoFiltro]] || 0) + 1 })
    return Object.entries(cont).map(([k, n]) => [k, n, k === "opp_depois" ? "OPP vence depois" : k === "opp_antes" ? "OPP vence antes" : (MOTIVOS[k] || k)])
  }, [todas, campoFiltro])
  const visiveis = useMemo(() => todas.filter((x) => {
    if (filtro !== "todos" && x[campoFiltro] !== filtro) return false
    const q = busca.trim().toLowerCase()
    return !q || cols.some((c) => !c.link && String(c.f(x)).toLowerCase().includes(q))
  }), [todas, filtro, busca, cols, campoFiltro])
  const soma = (l) => l.reduce((s, x) => s + (x.valor || 0), 0)

  const resumo = dados?.resumo
  const cartoes = resumo ? [
    { t: "Comparadas", v: String(resumo.pares), s: "medições com título no OPP" },
    { t: "Dentro da regra", v: String(resumo.ok) },
    { t: "Datas divergentes", v: String(resumo.divergentes), s: fmtR(soma(dados.ajustes)) },
    { t: "Medições sem título", v: String(resumo.semTitulo), s: fmtR(soma(dados.semTitulo)) },
    { t: "Títulos sem medição", v: String(resumo.semMedicao), s: fmtR(soma(dados.semMedicao)) },
  ] : []
  const regraTexto = dados ? `Vencimento esperado no OPP: a data planejada da medição mais ${dados.regra.prazoDias} dias, ou a própria data planejada, com tolerância de ${dados.regra.toleranciaDias} dias. O Par só mostra a diferença: o financeiro ajusta o vencimento no OPP, pelo botão "Ajustar" de cada linha.` : ""
  const nota = "Os pares são ligados pelo centro de custo do OPP quando o planejamento tem esse vínculo e, sem ele, por valor e nome do projeto: confira cada um antes de ajustar o OPP. O link do ClickUp abre a tarefa do projeto, não a da medição."
  const filtroTxt = filtro === "todos" ? "" : ` · filtro: ${opcoes.find((o) => o[0] === filtro)?.[2] || filtro}`
  const hoje = new Date().toISOString().slice(0, 10)

  const chip = (id, rotulo, n) => (
    <button key={id} onClick={() => setFiltro(id)} style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${filtro === id ? C.roxo : C.border}`, background: filtro === id ? "#F5F3FF" : C.surface, color: filtro === id ? C.roxo : C.text2 }}>{rotulo} ({n})</button>
  )
  const botao = { display: "flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 8, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }

  return (
    <div style={{ paddingBottom: 60 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <CalendarDaysIcon width={24} color={C.roxo} />
        <span style={{ fontWeight: 900, fontSize: 18, color: C.text1, textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>Mudanças de data de recebimento</span>
        <button disabled={!dados} onClick={() => gerarPDF({ titulo: "Mudanças de data de recebimento", subtitulo: `${ABAS[aba].titulo}${filtroTxt}`, cols, linhas: visiveis, cartoes, regra: regraTexto, emitidoPor: user?.nome, nota })}
          style={{ ...botao, border: "1.5px solid #C4B5FD", background: "#F5F3FF", color: C.roxo, opacity: dados ? 1 : 0.5 }}><DocumentTextIcon width={15} /> Gerar PDF</button>
        <button disabled={!visiveis.length} onClick={() => baixarCSV(cols, visiveis, `mudancas-de-data-${aba}-${hoje}.csv`)}
          style={{ ...botao, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text1, opacity: visiveis.length ? 1 : 0.5 }}><ArrowDownTrayIcon width={15} /> Baixar planilha</button>
        <button onClick={carregar} style={{ ...botao, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text2, fontWeight: 600 }}><ArrowPathIcon width={15} /> Atualizar</button>
      </div>
      {dados && <p style={{ fontSize: 12.5, color: C.text2, margin: "0 0 14px", maxWidth: 1000, lineHeight: 1.5 }}>{regraTexto}</p>}

      {carregando && <div style={{ padding: 40, textAlign: "center", color: C.text2 }}>Comparando o planejamento com o OPP...</div>}
      {!carregando && erro && <div style={{ padding: 16, borderRadius: 12, background: "#FEF2F2", border: "1.5px solid #FECACA", color: "#991B1B", fontSize: 14 }}>{erro}</div>}

      {!carregando && !erro && dados && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <Cartao C={C} {...{ titulo: cartoes[0].t, valor: cartoes[0].v, sub: cartoes[0].s }} />
            <Cartao C={C} {...{ titulo: cartoes[1].t, valor: cartoes[1].v }} cor="#16A34A" />
            <Cartao C={C} {...{ titulo: cartoes[2].t, valor: cartoes[2].v, sub: cartoes[2].s }} cor={resumo.divergentes ? "#DC2626" : "#16A34A"} ativo={aba === "divergentes"} onClick={() => trocarAba("divergentes")} />
            <Cartao C={C} {...{ titulo: cartoes[3].t, valor: cartoes[3].v, sub: cartoes[3].s }} ativo={aba === "semTitulo"} onClick={() => trocarAba("semTitulo")} />
            <Cartao C={C} {...{ titulo: cartoes[4].t, valor: cartoes[4].v, sub: cartoes[4].s }} ativo={aba === "semMedicao"} onClick={() => trocarAba("semMedicao")} />
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {Object.entries(ABAS).map(([id, a]) => (
              <button key={id} onClick={() => trocarAba(id)} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${aba === id ? C.roxo : C.border}`, background: aba === id ? C.roxo : C.surface, color: aba === id ? "#fff" : C.text2 }}>
                {a.rotulo} ({(dados[a.campo] || []).length})
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            {chip("todos", "Todos", todas.length)}
            {opcoes.map(([k, n, rotulo]) => chip(k, rotulo, n))}
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar"
              style={{ flex: 1, minWidth: 160, padding: "6px 11px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text1, fontSize: 12.5 }} />
          </div>

          {visiveis.length === 0
            ? <div style={{ padding: 36, textAlign: "center", color: C.text2, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12 }}>{todas.length === 0 ? ABAS[aba].vazio : "Nenhum resultado para este filtro."}</div>
            : <Tabela cols={cols} linhas={visiveis} C={C} />}
          <p style={{ fontSize: 11.5, color: C.text2, marginTop: 10, lineHeight: 1.5 }}>
            {visiveis.length} item(ns), somando {fmtR(soma(visiveis))}. {nota}
          </p>
        </>
      )}
    </div>
  )
}
