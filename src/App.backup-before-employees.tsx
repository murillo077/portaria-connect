import EmployeeManagement from './components/EmployeeManagement'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase, isSupabaseConfigured, type Delivery } from './lib/supabase'
import {
  Package, Search, Plus, LogOut, LayoutDashboard, Clock3,
  CheckCircle2, Camera, X, Building2, Boxes, RefreshCw,
  AlertCircle, CalendarDays, TrendingUp
} from 'lucide-react'

type Profile = {
  full_name: string
  role: string
  condominium_id: string
}

const dateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  })

const emptyForm = {
  recipient_name: '',
  block: '',
  apartment: '',
  description: ''
}

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)

  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')

  const [filter, setFilter] = useState<'all' | 'received' | 'collected'>('all')
  const [period, setPeriod] = useState<'7' | '30' | 'all'>('7')

  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null)
  const [form, setForm] = useState(emptyForm)

  // AUTENTICAÇÃO
  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let mounted = true

    supabase.auth.getSession().then(({ data, error: authError }) => {
      if (!mounted) return

      if (authError) setError(authError.message)
      setSession(data.session)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
      }
    )

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  // CARREGAMENTO DO PERFIL E DAS ENCOMENDAS
  useEffect(() => {
    if (!session || !supabase) {
      setProfile(null)
      setDeliveries([])
      setLoading(false)
      return
    }

    let active = true

    const load = async () => {
      setLoading(true)
      setError('')

      try {
        const { data: p, error: profileError } = await supabase!
          .from('profiles')
          .select('full_name, role, condominium_id')
          .eq('id', session.user.id)
          .single()

        if (profileError) throw profileError

        if (!p?.condominium_id) {
          throw new Error('Usuário sem condomínio vinculado.')
        }

        const { data, error: deliveryError } = await supabase!
          .from('deliveries')
          .select('*')
          .eq('condominium_id', p.condominium_id)
          .order('received_at', { ascending: false })

        if (deliveryError) throw deliveryError

        if (!active) return

        setProfile(p)
        setDeliveries(data || [])
      } catch (e: any) {
        if (active) {
          setError(
            e.message || 'Não foi possível carregar os dados.'
          )
          setProfile(null)
          setDeliveries([])
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    load()

    return () => {
      active = false
    }
  }, [session])

  // ATUALIZAR ENCOMENDAS
  const refresh = async () => {
    if (!supabase || !profile) return

    const { data, error: refreshError } = await supabase
      .from('deliveries')
      .select('*')
      .eq('condominium_id', profile.condominium_id)
      .order('received_at', { ascending: false })

    if (refreshError) {
      setError(refreshError.message)
      return
    }

    setDeliveries(data || [])
  }

  // FILTRO DE PERÍODO
  const periodDeliveries = useMemo(() => {
    if (period === 'all') return deliveries

    const days = Number(period)
    const startDate = new Date()

    startDate.setHours(0, 0, 0, 0)
    startDate.setDate(startDate.getDate() - (days - 1))

    return deliveries.filter(delivery => {
      return new Date(delivery.received_at) >= startDate
    })
  }, [deliveries, period])

  // PESQUISA E FILTROS
  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')

    return periodDeliveries.filter(delivery => {
      const searchableText = [
        delivery.recipient_name,
        delivery.block,
        delivery.apartment,
        delivery.description || ''
      ].join(' ').toLocaleLowerCase('pt-BR')

      const matchesSearch = searchableText.includes(normalizedQuery)
      const matchesStatus =
        filter === 'all' || delivery.status === filter

      return matchesSearch && matchesStatus
    })
  }, [periodDeliveries, query, filter])

  // INDICADORES
  const pending = deliveries.filter(
    d => d.status === 'received'
  ).length

  const collected = useMemo(() => {
    const startDate = new Date()
    startDate.setHours(0, 0, 0, 0)

    if (period !== 'all') {
      startDate.setDate(
        startDate.getDate() - (Number(period) - 1)
      )
    }

    return deliveries.filter(d => {
      if (d.status !== 'collected' || !d.collected_at) {
        return false
      }

      if (period === 'all') return true

      return new Date(d.collected_at) >= startDate
    }).length
  }, [deliveries, period])

  const totalCollected = deliveries.filter(
    d => d.status === 'collected'
  ).length

  // GRÁFICO DOS ÚLTIMOS 7 DIAS
  const chartDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date()

      day.setHours(0, 0, 0, 0)
      day.setDate(day.getDate() - (6 - index))

      const next = new Date(day)
      next.setDate(next.getDate() + 1)

      const count = deliveries.filter(d => {
        const received = new Date(d.received_at)
        return received >= day && received < next
      }).length

      return {
        label: day.toLocaleDateString('pt-BR', {
          weekday: 'short'
        }).replace('.', ''),
        count
      }
    })
  }, [deliveries])

  const maxChartCount = Math.max(
    1,
    ...chartDays.map(day => day.count)
  )

  // LOGIN E CADASTRO
  const authenticate = async (e: FormEvent) => {
    e.preventDefault()

    if (!supabase) return

    setError('')
    setNotice('')

    try {
      const result = authMode === 'login'
        ? await supabase.auth.signInWithPassword({
            email: email.trim(),
            password
          })
        : await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              data: { full_name: fullName.trim() }
            }
          })

      if (result.error) throw result.error

      if (authMode === 'signup') {
        setNotice(
          result.data.session
            ? 'Conta criada. Aguarde o vínculo do administrador ao condomínio.'
            : 'Conta criada. Confirme seu e-mail e aguarde o vínculo ao condomínio.'
        )
      }
    } catch (e: any) {
      setError(e.message || 'Falha na autenticação.')
    }
  }

  // REGISTRAR ENCOMENDA
  const addDelivery = async (e: FormEvent) => {
    e.preventDefault()

    if (!supabase || !profile || !session) return

    setError('')
    setSaving(true)

    try {
      // VALIDAR FOTO
      if (photo) {
        const allowedTypes = [
          'image/jpeg',
          'image/png',
          'image/webp'
        ]

        if (!allowedTypes.includes(photo.type)) {
          throw new Error(
            'Formato inválido. Envie JPG, PNG ou WEBP.'
          )
        }

        if (photo.size > 8 * 1024 * 1024) {
          throw new Error('A foto deve ter no máximo 8 MB.')
        }
      }

      let photo_url: string | null = null

      // ENVIAR FOTO AO STORAGE
      if (photo) {
        const ext = photo.type === 'image/jpeg'
          ? 'jpg'
          : photo.type === 'image/png'
            ? 'png'
            : 'webp'

        const path =
          profile.condominium_id +
          '/' +
          crypto.randomUUID() +
          '.' +
          ext

        const { error: uploadError } = await supabase.storage
          .from('delivery-photos')
          .upload(path, photo, {
            upsert: false,
            contentType: photo.type
          })

        if (uploadError) throw uploadError

        photo_url = path
      }

      // SALVAR ENCOMENDA
      const { error: insertError } = await supabase
        .from('deliveries')
        .insert({
          ...form,
          recipient_name: form.recipient_name.trim(),
          block: form.block.trim(),
          apartment: form.apartment.trim(),
          description: form.description.trim() || null,
          photo_url,
          status: 'received',
          condominium_id: profile.condominium_id,
          received_by: session.user.id
        })

      if (insertError) throw insertError

      setModal(false)
      setPhoto(null)
      setForm(emptyForm)

      setNotice('Encomenda registrada com sucesso.')

      await refresh()
    } catch (e: any) {
      setError(
        e.message || 'Não foi possível salvar a encomenda.'
      )
    } finally {
      setSaving(false)
    }
  }

  // CONFIRMAR RETIRADA
  const collect = async (item: Delivery) => {
    if (!supabase || !session || !profile) return
    if (item.status !== 'received') return

    setError('')

    const { error: updateError } = await supabase
      .from('deliveries')
      .update({
        status: 'collected',
        collected_at: new Date().toISOString(),
        collected_by: session.user.id
      })
      .eq('id', item.id)
      .eq('condominium_id', profile.condominium_id)
      .eq('status', 'received')

    if (updateError) {
      setError(updateError.message)
    } else {
      setNotice('Retirada registrada com sucesso.')
      await refresh()
    }
  }

  // SAIR DA CONFIGURAÇÃO
  if (!isSupabaseConfigured) {
    return <SetupScreen />
  }

  // TELA DE LOGIN
  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="brand-mark">
            <Package size={27} />
          </div>

          <p className="eyebrow">GESTÃO DE ENCOMENDAS</p>

          <h1>PORTARIA <span>CONNECT</span></h1>

          <p className="muted">
            Sua portaria mais organizada, segura e conectada.
          </p>

          <form onSubmit={authenticate} className="stack">
            {authMode === 'signup' && (
              <label>
                Nome completo
                <input
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Seu nome"
                />
              </label>
            )}

            <label>
              E-mail
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
              />
            </label>

            <label>
              Senha
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo de 6 caracteres"
              />
            </label>

            <button className="primary full" type="submit">
              {authMode === 'login'
                ? 'Entrar na plataforma'
                : 'Criar conta'}
            </button>
          </form>

          {error && <p className="error">{error}</p>}
          {notice && <p className="notice">{notice}</p>}

          <button
            className="text-button"
            onClick={() => {
              setAuthMode(
                authMode === 'login' ? 'signup' : 'login'
              )
              setError('')
              setNotice('')
            }}
          >
            {authMode === 'login'
              ? 'Primeiro acesso? Criar conta'
              : 'Já possui conta? Entrar'}
          </button>
        </div>
      </div>
    )
  }

  // AGUARDANDO PERFIL
  if (loading || !profile) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          {loading ? (
            <>
              <RefreshCw className="spin" />
              <h2>Carregando PORTARIA CONNECT...</h2>
            </>
          ) : (
            <>
              <AlertCircle size={32} />
              <h2>Não foi possível acessar o condomínio</h2>
              <p className="error">{error}</p>
              <button
                className="primary full"
                onClick={() => supabase?.auth.signOut()}
              >
                Sair da conta
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // DASHBOARD PRINCIPAL
  return (
    <div className="app-shell">

      <aside className="sidebar">
        <div className="logo">
          <div className="brand-mark">
            <Package />
          </div>

          <div>
            <strong>PORTARIA</strong>
            <b>CONNECT</b>
          </div>
        </div>

        <div className="side-label">MENU PRINCIPAL</div>

        <div className="nav-item active">
          <LayoutDashboard size={18} />
          Visão geral
        </div>

        <div className="side-bottom">
          <div className="profile-mini">
            <div className="avatar">
              {profile.full_name?.[0] || 'P'}
            </div>

            <div>
              <strong>{profile.full_name || 'Usuário'}</strong>
              <small>{profile.role || 'Portaria'}</small>
            </div>
          </div>

          <button
            className="logout"
            onClick={() => supabase?.auth.signOut()}
          >
            <LogOut size={17} />
            Sair
          </button>
        </div>
      </aside>

      <main className="main">

        <header className="topbar">
          <div>
            <p className="eyebrow">PAINEL DA PORTARIA</p>
            <h2>Visão geral</h2>
          </div>

          <div className="top-actions">
            <span className="live-dot">
              ● Sistema conectado
            </span>

            <button
              className="icon-btn"
              onClick={refresh}
              title="Atualizar"
            >
              <RefreshCw size={18} />
            </button>

            <button
              className="primary"
              onClick={() => {
                setError('')
                setModal(true)
              }}
            >
              <Plus size={18} />
              Nova encomenda
            </button>
          </div>
        </header>

        {error && (
          <div className="alert">
            <AlertCircle size={18} />
            {error}
            <button onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}

        {notice && (
          <div className="notice-bar">
            {notice}
            <button onClick={() => setNotice('')}>
              <X size={16} />
            </button>
          </div>
        )}

        <section className="welcome">
          <div>
            <span className="welcome-tag">
              CONTROLE DE RECEBIMENTOS
            </span>

            <h1>
              Olá, {profile.full_name?.split(' ')[0] || 'bem-vindo'} 👋
            </h1>

            <p>
              Acompanhe as encomendas recebidas no condomínio.
            </p>
          </div>

          <div className="welcome-icon">
            <Building2 size={42} />
          </div>
        </section>

        <div className="period-toolbar">
          <div className="period-heading">
            <CalendarDays size={17} />
            <span>Indicadores do período</span>
          </div>

          <div className="period-options">
            {(['7', '30', 'all'] as const).map(value => (
              <button
                key={value}
                className={
                  period === value
                    ? 'period-option selected'
                    : 'period-option'
                }
                onClick={() => setPeriod(value)}
              >
                {value === '7'
                  ? '7 dias'
                  : value === '30'
                    ? '30 dias'
                    : 'Todo o período'}
              </button>
            ))}
          </div>
        </div>

        <section className="stats">
          <Stat
            icon={<Boxes />}
            label="Encomendas no período"
            value={periodDeliveries.length}
            tone="blue"
          />

          <Stat
            icon={<Clock3 />}
            label="Aguardando retirada"
            value={pending}
            tone="orange"
          />

          <Stat
            icon={<CheckCircle2 />}
            label="Retiradas no período"
            value={collected}
            tone="green"
          />
        </section>

        <section className="analytics-grid">

          <div className="panel chart-panel">
            <div className="panel-head">
              <div>
                <h3>Recebimentos nos últimos 7 dias</h3>
                <p>
                  Volume de encomendas registradas por dia.
                </p>
              </div>

              <div className="chart-mark">
                <TrendingUp size={18} />
              </div>
            </div>

            <div className="bar-chart">
              {chartDays.map((day, index) => (
                <div className="bar-column" key={index}>
                  <strong>{day.count}</strong>

                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        height:
                          (day.count / maxChartCount * 100) + '%'
                      }}
                    />
                  </div>

                  <span>{day.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel summary-panel">
            <div className="panel-head">
              <div>
                <h3>Situação das encomendas</h3>
                <p>Resumo de todas as encomendas.</p>
              </div>
            </div>

            <div className="status-summary">
              <div className="summary-line">
                <span>
                  <i className="summary-dot waiting" />
                  Aguardando retirada
                </span>
                <strong>{pending}</strong>
              </div>

              <div className="summary-line">
                <span>
                  <i className="summary-dot collected" />
                  Retiradas
                </span>
                <strong>{totalCollected}</strong>
              </div>
            </div>

            <div className="summary-total">
              <span>Total registrado</span>
              <strong>{deliveries.length}</strong>
            </div>

            <div className="summary-progress">
              <div
                style={{
                  width:
                    (deliveries.length
                      ? totalCollected / deliveries.length * 100
                      : 0) + '%'
                }}
              />
            </div>

            <small className="summary-caption">
              {deliveries.length
                ? Math.round(
                    totalCollected / deliveries.length * 100
                  )
                : 0}
              % das encomendas foram retiradas
            </small>
          </div>
        </section>

        <section className="panel">

          <div className="panel-head">
            <div>
              <h3>Encomendas</h3>
              <p>
                Consulte e atualize as entregas do condomínio.
              </p>
            </div>

            <button
              className="outline"
              onClick={() => setModal(true)}
            >
              <Plus size={16} />
              Registrar
            </button>
          </div>

          <div className="toolbar">
            <div className="search">
              <Search size={18} />

              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por morador, bloco ou apartamento..."
              />
            </div>

            <div className="filters">
              {(['all', 'received', 'collected'] as const).map(f => (
                <button
                  key={f}
                  className={
                    filter === f
                      ? 'filter active-filter'
                      : 'filter'
                  }
                  onClick={() => setFilter(f)}
                >
                  {f === 'all'
                    ? 'Todas'
                    : f === 'received'
                      ? 'Pendentes'
                      : 'Retiradas'}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="empty">
              <Package size={34} />
              <strong>Nenhuma encomenda encontrada</strong>
              <span>
                Quando uma nova entrega chegar, registre por aqui.
              </span>
            </div>
          ) : (
            <div className="delivery-list">
              {visible.map(d => (
                <article
                  className="delivery-row"
                  key={d.id}
                >
                  <div className="parcel-icon">
                    <Package size={21} />
                  </div>

                  <div className="delivery-info">
                    <strong>{d.recipient_name}</strong>

                    <span>
                      Bloco {d.block} · Apartamento {d.apartment}
                    </span>

                    <small>
                      {d.description || 'Encomenda'} · Recebida em{' '}
                      {dateTime(d.received_at)}
                    </small>
                  </div>

                  <div className="delivery-status">
                    <span
                      className={
                        d.status === 'received'
                          ? 'status pending'
                          : 'status done'
                      }
                    >
                      {d.status === 'received'
                        ? 'Aguardando retirada'
                        : 'Retirada concluída'}
                    </span>

                    {d.status === 'collected' && d.collected_at && (
                      <small>
                        {dateTime(d.collected_at)}
                      </small>
                    )}
                  </div>

                  {d.status === 'received' && (
                    <button
                      className="collect-btn"
                      onClick={() => collect(d)}
                    >
                      <CheckCircle2 size={16} />
                      Confirmar retirada
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <footer>
          PORTARIA CONNECT · Gestão inteligente de encomendas
        </footer>
      </main>

      {/* MODAL DE NOVA ENCOMENDA */}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget && !saving) {
              setModal(false)
            }
          }}
        >
          <form
            className="modal"
            onSubmit={addDelivery}
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">NOVO REGISTRO</span>
                <h2>Registrar encomenda</h2>
              </div>

              <button
                type="button"
                className="icon-btn"
                disabled={saving}
                onClick={() => setModal(false)}
              >
                <X />
              </button>
            </div>

            <label>
              Nome completo do morador
              <input
                required
                value={form.recipient_name}
                onChange={e =>
                  setForm({
                    ...form,
                    recipient_name: e.target.value
                  })
                }
                placeholder="Nome e sobrenome"
              />
            </label>

            <div className="two-cols">
              <label>
                Bloco
                <input
                  required
                  value={form.block}
                  onChange={e =>
                    setForm({
                      ...form,
                      block: e.target.value
                    })
                  }
                  placeholder="Ex.: A"
                />
              </label>

              <label>
                Apartamento
                <input
                  required
                  value={form.apartment}
                  onChange={e =>
                    setForm({
                      ...form,
                      apartment: e.target.value
                    })
                  }
                  placeholder="Ex.: 102"
                />
              </label>
            </div>

            <label>
              Descrição (opcional)
              <input
                value={form.description}
                onChange={e =>
                  setForm({
                    ...form,
                    description: e.target.value
                  })
                }
                placeholder="Ex.: Caixa, envelope, mercado..."
              />
            </label>

            <label className="upload">
              <Camera size={20} />

              <span>
                <strong>
                  {photo
                    ? photo.name
                    : 'Adicionar foto da encomenda'}
                </strong>

                <small>
                  Imagem JPG, PNG ou WEBP (máx. 8 MB)
                </small>
              </span>

              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={e => {
                  setPhoto(e.target.files?.[0] || null)
                  e.target.value = ''
                }}
              />
            </label>

            {photo && (
              <button
                type="button"
                className="text-button"
                onClick={() => setPhoto(null)}
              >
                Remover foto
              </button>
            )}

            <button
              className="primary full"
              disabled={saving}
              type="submit"
            >
              {saving
                ? 'Salvando...'
                : 'Registrar recebimento'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

// COMPONENTE DOS INDICADORES
function Stat({
  icon,
  label,
  value,
  tone
}: {
  icon: any
  label: string
  value: number
  tone: string
}) {
  return (
    <div className="stat-card">
      <div className={'stat-icon ' + tone}>
        {icon}
      </div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

// TELA DE CONFIGURAÇÃO
function SetupScreen() {
  return (
    <div className="auth-shell">
      <div className="auth-card setup">
        <div className="brand-mark">
          <Package size={27} />
        </div>

        <p className="eyebrow">PRIMEIRA CONFIGURAÇÃO</p>

        <h1>PORTARIA <span>CONNECT</span></h1>

        <h2>Conecte seu projeto Supabase</h2>

        <p className="muted">
          O aplicativo já está preparado. Para ativar login,
          banco de dados e fotos, configure as variáveis de
          ambiente no arquivo .env.
        </p>

        <ol>
          <li>
            Crie um projeto Supabase exclusivo para o PORTARIA CONNECT.
          </li>
          <li>
            Copie a URL do projeto e a chave pública.
          </li>
          <li>
            Crie um arquivo .env na pasta do projeto.
          </li>
          <li>
            Execute o script supabase/schema.sql no SQL Editor.
          </li>
        </ol>

        <p className="muted small">
          Não coloque a chave service_role no frontend ou no GitHub.
        </p>
      </div>
    </div>
  )
}
