import { useState, useEffect, useMemo } from "react"
import { toast } from "react-hot-toast"
import { CalendarDaysIcon, ArrowPathIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline"
import api from "../utils/api"
import { useTheme } from "../contexts/ThemeContext"

const fmtR = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)
const dataBR = (iso) => (iso ? String(iso).split("-").reverse().join("/") : "")

function useColors() {
  const { isDark } = useTheme()
  return {
    bg: isDark ? "#0F172A" : "#F8FAFC",
    surface: isDark ? "#1E293B" : "#ffffff",
    surface2: isDark ? "#253348" : "#F8FAFC",
    border: isDark ? "#334155" : "#E2E8F0",
    text1: isDark ? "#F1F5F9" : "#0F172A",
    text2: isDark ? "#94A3B8" : "#64748B",
    roxo: "#7C3AED",
  }
}

function Cartao({ titulo, valor, sub, cor, C }) {
  return (
    <div style={{ background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "16px 18px", flex: 1, minWidth: 170 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.text2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{titulo}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: cor || C.text1, marginTop: 6 }}>{valor}</div>
      {sub && <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function Selo({ sentido }) {
  const depois = sentido === "opp_depois"
  return (
    <span style={{
      display: "inline-block", padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700,
      background: depois ? "#FEF3C7" : "#DBEAFE", color: depois ? "#92400E" : "#1E40AF",
    }}>
      {depois ? "OPP vence depois" : "OPP vence antes"}
    </span>
  )
}

// Planilha para a Roberta ajustar o OPP: separador ";" e BOM, para abrir certo no Excel em portugues.
function baixarCSV(ajustes) {
  const cab = ["Projeto", "Etapa", "Valor", "Data planejada (Par)", "Vencimento atual (OPP)", "Vencimento sugerido", "Diferenca (dias)", "Sentido", "Titulo OPP"]
  const lin = ajustes.map((a) => [
    a.projeto, a.etapa, String(a.valor).replace(".", ","), dataBR(a.dataPlanejadaPar), dataBR(a.vencimentoAtualOPP),
    dataBR(a.vencimentoSugerido), a.diferencaDias, a.sentido === "opp_depois" ? "OPP vence depois" : "OPP vence antes", a.tituloId,
  ])
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const texto = "﻿" + [cab, ...lin].map((l) => l.map(esc).join(";")).join("\r\n")
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `mudancas-de-data-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function MudancasDeData() {
  const C = useColors()
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState("")
  const [filtro, setFiltro] = useState("todas")
  const [busca, setBusca] = useState("")

  async function carregar() {
    setCarregando(true)
    setErro("")
    try {
      const { data } = await api.get("/mudancas-de-data")
      setDados(data)
    } catch (e) {
      const msg = e?.response?.data?.error || "Não foi possível carregar a lista."
      setErro(msg)
      toast.error(msg)
    } finally {
      setCarregando(false)
    }
  }
  useEffect(() => { carregar() }, [])

  const ajustes = dados?.ajustes || []
  const visiveis = useMemo(() => ajustes.filter((a) => {
    if (filtro === "depois" && a.sentido !== "opp_depois") return false
    if (filtro === "antes" && a.sentido !== "opp_antes") return false
    const q = busca.trim().toLowerCase()
    return !q || `${a.projeto} ${a.etapa} ${a.tituloId}`.toLowerCase().includes(q)
  }), [ajustes, filtro, busca])
  const totalVisivel = visiveis.reduce((s, a) => s + (a.valor || 0), 0)

  const chip = (id, rotulo) => (
    <button key={id} onClick={() => setFiltro(id)} style={{
      padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
      border: `1.5px solid ${filtro === id ? C.roxo : C.border}`,
      background: filtro === id ? "#F5F3FF" : C.surface, color: filtro === id ? C.roxo : C.text2,
    }}>{rotulo}</button>
  )

  const th = { textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 700, color: C.text2, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1.5px solid ${C.border}`, whiteSpace: "nowrap" }
  const td = { padding: "10px 12px", fontSize: 13, color: C.text1, borderBottom: `1px solid ${C.border}`, verticalAlign: "top" }

  return (
    <div style={{ paddingBottom: 60 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
        <CalendarDaysIcon width={24} color={C.roxo} />
        <span style={{ fontWeight: 900, fontSize: 18, color: C.text1, textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>
          Mudanças de data de recebimento
        </span>
        <button onClick={() => baixarCSV(visiveis)} disabled={!visiveis.length}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1.5px solid #C4B5FD", background: "#F5F3FF", color: C.roxo, fontWeight: 700, fontSize: 13, cursor: visiveis.length ? "pointer" : "not-allowed", opacity: visiveis.length ? 1 : 0.5 }}>
          <ArrowDownTrayIcon width={15} /> Baixar planilha
        </button>
        <button onClick={carregar}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text2, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          <ArrowPathIcon width={15} /> Atualizar
        </button>
      </div>
      <p style={{ fontSize: 13, color: C.text2, margin: "0 0 18px", maxWidth: 900, lineHeight: 1.5 }}>
        Compara a data planejada de cada medição, no Par, com o vencimento do título em aberto no OPP. O vencimento esperado é a data planejada mais {dados?.regra?.prazoDias ?? 30} dias,
        ou a própria data planejada, com tolerância de {dados?.regra?.toleranciaDias ?? 5} dias. O Par só mostra a diferença: quem ajusta o vencimento no OPP é o financeiro, por esta lista.
      </p>

      {carregando && <div style={{ padding: 40, textAlign: "center", color: C.text2 }}>Comparando o planejamento com o OPP...</div>}

      {!carregando && erro && (
        <div style={{ padding: 18, borderRadius: 12, background: "#FEF2F2", border: "1.5px solid #FECACA", color: "#991B1B", fontSize: 14 }}>
          {erro}
        </div>
      )}

      {!carregando && !erro && dados && (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
            <Cartao C={C} titulo="Comparadas" valor={dados.resumo.pares} sub="medições com título no OPP" />
            <Cartao C={C} titulo="Dentro da regra" valor={dados.resumo.ok} cor="#16A34A" />
            <Cartao C={C} titulo="Datas divergentes" valor={dados.resumo.divergentes} cor={dados.resumo.divergentes ? "#DC2626" : "#16A34A"} sub={fmtR(ajustes.reduce((s, a) => s + (a.valor || 0), 0))} />
            <Cartao C={C} titulo="Títulos sem medição" valor={dados.resumo.semMedicao} sub="no OPP, sem medição aprovada no Par" />
            <Cartao C={C} titulo="Medições sem título" valor={dados.resumo.semTitulo} sub="no Par, sem título aberto no OPP" />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            {chip("todas", `Todas (${ajustes.length})`)}
            {chip("depois", `OPP vence depois (${ajustes.filter((a) => a.sentido === "opp_depois").length})`)}
            {chip("antes", `OPP vence antes (${ajustes.filter((a) => a.sentido === "opp_antes").length})`)}
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar projeto, etapa ou título"
              style={{ flex: 1, minWidth: 220, padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text1, fontSize: 13 }} />
          </div>

          {visiveis.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: C.text2, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14 }}>
              {ajustes.length === 0 ? "Nenhuma data divergente. O planejamento e o OPP estão de acordo nos títulos comparados." : "Nenhum resultado para este filtro."}
            </div>
          ) : (
            <div style={{ background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                <thead>
                  <tr style={{ background: C.surface2 }}>
                    <th style={th}>Projeto</th><th style={th}>Etapa</th><th style={{ ...th, textAlign: "right" }}>Valor</th>
                    <th style={th}>Data planejada (Par)</th><th style={th}>Vencimento atual (OPP)</th><th style={th}>Vencimento sugerido</th>
                    <th style={{ ...th, textAlign: "right" }}>Diferença</th><th style={th}>Sentido</th><th style={th}>Título OPP</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((a, i) => (
                    <tr key={`${a.tituloId}-${i}`}>
                      <td style={{ ...td, maxWidth: 280 }}>{a.projeto}</td>
                      <td style={td}>{a.etapa}</td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{fmtR(a.valor)}</td>
                      <td style={td}>{dataBR(a.dataPlanejadaPar)}</td>
                      <td style={td}>{dataBR(a.vencimentoAtualOPP)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{dataBR(a.vencimentoSugerido)}</td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{a.diferencaDias > 0 ? "+" : ""}{a.diferencaDias} d</td>
                      <td style={td}><Selo sentido={a.sentido} /></td>
                      <td style={td}>{a.tituloId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 12, color: C.text2, marginTop: 10 }}>
            {visiveis.length} título(s) na lista, somando {fmtR(totalVisivel)}. Os pares são ligados pelo centro de custo do OPP quando o planejamento tem esse vínculo e, sem ele, por valor e nome do projeto: confira cada um antes de ajustar o OPP.
          </p>
        </>
      )}
    </div>
  )
}
