import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { KeyIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../contexts/AuthContext'
import api from '../utils/api'

// Tela de troca de senha obrigatória — mostrada no lugar do dashboard quando
// user.deveTrocarSenha vem true do login (conta criada por um admin com senha
// temporária, ex.: novos usuários de leitura). Reusa a mesma rota PUT /auth/me/senha
// que o modal "Alterar Senha" do Sidebar já usa — só muda onde ela aparece e o
// que acontece depois (aqui não dá pra "Cancelar", e ao terminar vai pro dashboard
// em vez de só fechar um modal).
export default function TrocarSenhaObrigatoria() {
  const { user, atualizarUsuario } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ senhaAtual: '', novaSenha: '', confirmar: '' })
  const [salvando, setSalvando] = useState(false)

  if (!user) return <Navigate to="/login" replace />
  if (!user.deveTrocarSenha) return <Navigate to="/dashboard" replace />

  async function onSubmit(e) {
    e.preventDefault()
    if (form.novaSenha.length < 6) {
      toast.error('A nova senha precisa ter pelo menos 6 caracteres.')
      return
    }
    if (form.novaSenha !== form.confirmar) {
      toast.error('As senhas não coincidem.')
      return
    }
    setSalvando(true)
    try {
      await api.put('/auth/me/senha', { senhaAtual: form.senhaAtual, novaSenha: form.novaSenha })
      atualizarUsuario({ deveTrocarSenha: false })
      toast.success('Senha alterada! Bem-vindo(a) ao PAR.')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar senha. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(165deg, #10263F 0%, #0C1E33 55%, #081527 100%)',
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      padding: 20,
    }}>
      <form onSubmit={onSubmit} style={{
        background: '#fff',
        borderRadius: 18,
        padding: '32px 30px',
        width: 380,
        maxWidth: '100%',
        boxShadow: '0 24px 70px rgba(0,0,0,.35)',
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 9, background: '#00B5CC',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <KeyIcon style={{ width: 20, height: 20, color: '#fff' }} />
          </div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0F172A' }}>
            Defina sua senha
          </h1>
        </div>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
          {user.nome ? `Olá, ${user.nome.split(' ')[0]}. ` : ''}
          Essa é a sua primeira vez entrando no PAR — por segurança, escolha uma senha
          só sua antes de continuar. A senha temporária que você recebeu não vai
          funcionar mais depois disso.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: 'Senha temporária (a que você recebeu)', key: 'senhaAtual' },
            { label: 'Nova senha', key: 'novaSenha' },
            { label: 'Confirmar nova senha', key: 'confirmar' },
          ].map(({ label, key }) => (
            <div key={key}>
              <label style={{
                fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase',
                letterSpacing: '.05em', display: 'block', marginBottom: 4,
              }}>
                {label}
              </label>
              <input
                type="password"
                required
                autoComplete={key === 'senhaAtual' ? 'current-password' : 'new-password'}
                value={form[key]}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1.5px solid #E2E8F0', background: '#F8FAFC', fontSize: 14,
                  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          ))}
        </div>

        <button className="press-feedback"
          type="submit"
          disabled={salvando}
          style={{
            width: '100%', marginTop: 22, padding: 12, borderRadius: 9, border: 'none',
            background: '#00B5CC', color: '#fff', fontWeight: 700, fontSize: 14,
            cursor: salvando ? 'default' : 'pointer', opacity: salvando ? 0.75 : 1,
          }}
        >
          {salvando ? 'Salvando...' : 'Salvar e entrar'}
        </button>
      </form>
    </div>
  )
}
