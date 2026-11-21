import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase, isSupabaseConfigured, type Delivery } from './lib/supabase'
import { Package, Search, Plus, LogOut, LayoutDashboard, Clock3, CheckCircle2, Camera, X, Building2, Boxes, RefreshCw, AlertCircle, CalendarDays, TrendingUp, Users, UserPlus, UserCheck, UserX } from 'lucide-react'

type Profile = { full_name: string; role: string; condominium_id: string }
type ManagedUser = { id: string; full_name: string; role: string; active: boolean; created_at: string }
const dateTime = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

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
  const [form, setForm] = useState({ recipient_name: '', block: '', apartment: '', description: '' })
  const [view, setView] = useState<'dashboard' | 'users'>('dashboard')
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSaving, setUserSaving] = useState(false)
  const [newUser, setNewUser] = useState({ full_name: '', email: '', password: '' })

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || !supabase) { setProfile(null); setDeliveries([]); setLoading(false); return }
    let active = true
    const load = async () => {
      setLoading(true); setError('')
      const { data: p, error: pError } = await supabase!.from('profiles').select('full_name, role, condominium_id').eq('id', session.user.id).single()
      if (pError) { if (active) { setError('Seu usuário ainda não está vinculado a um condomínio. Peça ao administrador para concluir seu cadastro no banco de dados.'); setLoading(false) } return }
      const { data, error: dError } = await supabase!.from('deliveries').select('*').eq('condominium_id', p.condominium_id).order('received_at', { ascending: false })
      if (!active) return
      if (dError) setError(dError.message)
      setProfile(p); setDeliveries(data || []); setLoading(false)
    }
    load()
    return () => { active = false }
  }, [session])


  const loadUsers = async () => {
    if (!supabase || profile?.role !== 'admin') return
    setUsersLoading(true)
    const { data, error: e } = await supabase.functions.invoke('manage-users', { body: { action: 'list' } })
    if (e || data?.error) setError(data?.error || e?.message || 'Não foi possível carregar os usuários.')
    else setUsers(data?.users || [])
    setUsersLoading(false)
  }

  const createGuard = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setUserSaving(true); setError(''); setNotice('')
    const { data, error: e2 } = await supabase.functions.invoke('manage-users', { body: { action: 'create', ...newUser } })
    if (e2 || data?.error) setError(data?.error || e2?.message || 'Não foi possível cadastrar o funcionário.')
    else {
      setNotice('Funcionário cadastrado com sucesso.')
      setNewUser({ full_name: '', email: '', password: '' })
      await loadUsers()
    }
    setUserSaving(false)
  }

  const toggleGuard = async (user: ManagedUser) => {
    if (!supabase) return
    const { data, error: e } = await supabase.functions.invoke('manage-users', { body: { action: 'update_status', user_id: user.id, active: !user.active } })
    if (e || data?.error) setError(data?.error || e?.message || 'Não foi possível alterar o acesso.')
    else {
      setNotice(user.active ? 'Acesso do funcionário desativado.' : 'Acesso do funcionário ativado.')
      await loadUsers()
    }
  }

  useEffect(() => { if (view === 'users' && profile?.role === 'admin') loadUsers() }, [view, profile?.role])

  const refresh = async () => {
    if (!supabase) return
    const { data, error: e } = await supabase.from('deliveries').select('*').eq('condominium_id', profile?.condominium_id || '').order('received_at', { ascending: false })
    if (e) setError(e.message); else setDeliveries(data || [])
  }

  const visible = useMemo(() => periodDeliveries.filter(d => {
    const text = [d.recipient_name, d.block, d.apartment, d.description || ''].join(' ').toLowerCase()
    return text.includes(query.toLowerCase()) && (filter === 'all' || d.status === filter)
  }), [periodDeliveries, query, filter])
  const periodDeliveries = useMemo(() => {
    if (period === 'all') return deliveries
    const days = Number(period)
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    from.setDate(from.getDate() - (days - 1))
    return deliveries.filter(d => new Date(d.received_at) >= from)
  }, [deliveries, period])
  const pending = deliveries.filter(d => d.status === 'received').length
  const collected = periodDeliveries.filter(d => d.status === 'collected').length
  const chartDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const day = new Date()
    day.setHours(0, 0, 0, 0)
    day.setDate(day.getDate() - (6 - index))
    const next = new Date(day)
    next.setDate(next.getDate() + 1)
    const count = deliveries.filter(d => {
      const received = new Date(d.received_at)
      return received >= day && received < next
    }).length
    return { label: day.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), count }
  }), [deliveries])
  const maxChartCount = Math.max(1, ...chartDays.map(day => day.count))

  const authenticate = async (e: FormEvent) => {
    e.preventDefault(); if (!supabase) return
    setError(''); setNotice('')
    const result = authMode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
    if (result.error) setError(result.error.message)
    else if (authMode === 'signup') setNotice('Conta criada. O administrador precisa vincular seu usuário ao condomínio antes do primeiro acesso.')
  }

  const addDelivery = async (e: FormEvent) => {
    e.preventDefault(); if (!supabase || !profile) return
    setSaving(true); setError('')
    try {
      let photo_url: string | null = null
      if (photo) {
        const ext = photo.name.split('.').pop() || 'jpg'
        const path = profile.condominium_id + '/' + crypto.randomUUID() + '.' + ext
        const { error: uploadError } = await supabase.storage.from('delivery-photos').upload(path, photo, { upsert: false })
        if (uploadError) throw uploadError
        photo_url = path
      }
      const { error: insertError } = await supabase.from('deliveries').insert({
        ...form, photo_url, status: 'received', condominium_id: profile.condominium_id,
        received_by: session.user.id
      })
      if (insertError) throw insertError
      setModal(false); setPhoto(null); setForm({ recipient_name: '', block: '', apartment: '', description: '' })
      setNotice('Encomenda registrada com sucesso.'); await refresh()
    } catch (e: any) { setError(e.message || 'Não foi possível salvar a encomenda.') }
    finally { setSaving(false) }
  }

  const collect = async (item: Delivery) => {
    if (!supabase) return
    const { error: e } = await supabase.from('deliveries').update({ status: 'collected', collected_at: new Date().toISOString(), collected_by: session.user.id }).eq('id', item.id)
    if (e) setError(e.message); else { setNotice('Retirada registrada.'); await refresh() }
  }

  if (!isSupabaseConfigured) return <SetupScreen />
  if (!session) return <div className="auth-shell"><div className="auth-card"><div className="brand-mark"><Package size={27}/></div><p className="eyebrow">GESTÃO DE ENCOMENDAS</p><h1>PORTARIA <span>CONNECT</span></h1><p className="muted">Sua portaria mais organizada, segura e conectada.</p><form onSubmit={authenticate} className="stack">{authMode === 'signup' && <label>Nome completo<input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Seu nome"/></label>}<label>E-mail<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com"/></label><label>Senha<input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo de 6 caracteres"/></label><button className="primary full" type="submit">{authMode === 'login' ? 'Entrar na plataforma' : 'Criar conta'}</button></form>{error && <p className="error">{error}</p>}{notice && <p className="notice">{notice}</p>}<button className="text-button" onClick={() => {setAuthMode(authMode === 'login' ? 'signup' : 'login'); setError('')}}>{authMode === 'login' ? 'Primeiro acesso? Criar conta' : 'Já possui conta? Entrar'}</button></div></div>

  return <div className="app-shell"><aside className="sidebar"><div className="logo"><div className="brand-mark"><Package/></div><div><strong>PORTARIA</strong><b>CONNECT</b></div></div><div className="side-label">MENU PRINCIPAL</div><button className={view === 'dashboard' ? "nav-item active" : "nav-item"} onClick={() => setView('dashboard')}><LayoutDashboard size={18}/> Visão geral</button>{profile?.role === 'admin' && <button className={view === 'users' ? "nav-item active" : "nav-item"} onClick={() => setView('users')}><Users size={18}/> Funcionários</button>}<div className="side-bottom"><div className="profile-mini"><div className="avatar">{profile?.full_name?.[0] || 'P'}</div><div><strong>{profile?.full_name || 'Usuário'}</strong><small>{profile?.role || 'Portaria'}</small></div></div><button className="logout" onClick={() => supabase?.auth.signOut()}><LogOut size={17}/> Sair</button></div></aside>
    <main className="main"><header className="topbar"><div><p className="eyebrow">PAINEL DA PORTARIA</p><h2>Visão geral</h2></div><div className="top-actions"><span className="live-dot">● Sistema conectado</span><button className="icon-btn" onClick={refresh} title="Atualizar"><RefreshCw size={18}/></button><button className="primary" onClick={() => setModal(true)}><Plus size={18}/> Nova encomenda</button></div></header>
      {error && <div className="alert"><AlertCircle size={18}/>{error}<button onClick={() => setError('')}><X size={16}/></button></div>}{notice && <div className="notice-bar">{notice}<button onClick={() => setNotice('')}><X size={16}/></button></div>}
      {view === 'dashboard' ? <>
      <section className="welcome"><div><span className="welcome-tag">CONTROLE DE RECEBIMENTOS</span><h1>Olá, {profile?.full_name?.split(' ')[0] || 'bem-vindo'} 👋</h1><p>Acompanhe as encomendas recebidas no condomínio.</p></div><div className="welcome-icon"><Building2 size={42}/></div></section>
      <div className="period-toolbar">
        <div className="period-heading"><CalendarDays size={17}/><span>Indicadores do período</span></div>
        <div className="period-options">
          {(['7', '30', 'all'] as const).map(value => <button key={value} className={period === value ? 'period-option selected' : 'period-option'} onClick={() => setPeriod(value)}>{value === '7' ? '7 dias' : value === '30' ? '30 dias' : 'Todo o período'}</button>)}
        </div>
      </div>
      <section className="stats"><Stat icon={<Boxes/>} label="Encomendas no período" value={periodDeliveries.length} tone="blue"/><Stat icon={<Clock3/>} label="Aguardando retirada" value={pending} tone="orange"/><Stat icon={<CheckCircle2/>} label="Retiradas no período" value={collected} tone="green"/></section>
      <section className="analytics-grid">
        <div className="panel chart-panel">
          <div className="panel-head"><div><h3>Recebimentos nos últimos 7 dias</h3><p>Volume de encomendas registradas por dia.</p></div><div className="chart-mark"><TrendingUp size={18}/></div></div>
          <div className="bar-chart">{chartDays.map((day, index) => <div className="bar-column" key={index}><strong>{day.count}</strong><div className="bar-track"><div className="bar-fill" style={{ height: (day.count / maxChartCount * 100) + '%' }}/></div><span>{day.label}</span></div>)}</div>
        </div>
        <div className="panel summary-panel">
          <div className="panel-head"><div><h3>Situação das encomendas</h3><p>Resumo de todas as encomendas.</p></div></div>
          <div className="status-summary"><div className="summary-line"><span><i className="summary-dot waiting"/>Aguardando retirada</span><strong>{pending}</strong></div><div className="summary-line"><span><i className="summary-dot collected"/>Retiradas</span><strong>{deliveries.filter(d => d.status === 'collected').length}</strong></div></div>
          <div className="summary-total"><span>Total registrado</span><strong>{deliveries.length}</strong></div>
          <div className="summary-progress"><div style={{ width: (deliveries.length ? deliveries.filter(d => d.status === 'collected').length / deliveries.length * 100 : 0) + '%' }}/></div>
          <small className="summary-caption">{deliveries.length ? Math.round(deliveries.filter(d => d.status === 'collected').length / deliveries.length * 100) : 0}% das encomendas foram retiradas</small>
        </div>
      </section>
      <section className="panel"><div className="panel-head"><div><h3>Encomendas</h3><p>Consulte e atualize as entregas do condomínio.</p></div><button className="outline" onClick={() => setModal(true)}><Plus size={16}/> Registrar</button></div><div className="toolbar"><div className="search"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por morador, bloco ou apartamento..."/></div><div className="filters">{(['all','received','collected'] as const).map(f => <button key={f} className={filter === f ? 'filter active-filter' : 'filter'} onClick={() => setFilter(f)}>{f === 'all' ? 'Todas' : f === 'received' ? 'Pendentes' : 'Retiradas'}</button>)}</div></div>
        {loading ? <div className="empty"><RefreshCw className="spin"/> Carregando encomendas...</div> : visible.length === 0 ? <div className="empty"><Package size={34}/><strong>Nenhuma encomenda encontrada</strong><span>Quando uma nova entrega chegar, registre por aqui.</span></div> : <div className="delivery-list">{visible.map(d => <article className="delivery-row" key={d.id}><div className="parcel-icon"><Package size={21}/></div><div className="delivery-info"><strong>{d.recipient_name}</strong><span>Bloco {d.block} · Apartamento {d.apartment}</span><small>{d.description || 'Encomenda'} · Recebida em {dateTime(d.received_at)}</small></div><div className="delivery-status"><span className={d.status === 'received' ? 'status pending' : 'status done'}>{d.status === 'received' ? 'Aguardando retirada' : 'Retirada concluída'}</span>{d.status === 'collected' && d.collected_at && <small>{dateTime(d.collected_at)}</small>}</div>{d.status === 'received' && <button className="collect-btn" onClick={() => collect(d)}><CheckCircle2 size={16}/> Confirmar retirada</button>}</article>)}</div>}
      </section>
      <footer>PORTARIA CONNECT · Gestão inteligente de encomendas</footer>
      </> : <section className="panel" style={{ marginTop: 24 }}>
        <div className="panel-head"><div><h3>Gestão de funcionários</h3><p>Cadastre funcionários e controle o acesso à portaria.</p></div><button className="outline" onClick={loadUsers}><RefreshCw size={16}/> Atualizar lista</button></div>
        <form className="stack" onSubmit={createGuard} style={{ maxWidth: 620, marginBottom: 28 }}>
          <h3>Novo funcionário</h3>
          <label>Nome completo<input required value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })} placeholder="Nome e sobrenome"/></label>
          <label>E-mail de acesso<input type="email" required value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} placeholder="funcionario@email.com"/></label>
          <label>Senha inicial<input type="password" required minLength={8} value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} placeholder="Mínimo de 8 caracteres"/></label>
          <button className="primary" type="submit" disabled={userSaving}><UserPlus size={17}/>{userSaving ? ' Cadastrando...' : ' Cadastrar funcionário'}</button>
        </form>
        <div className="panel-head"><div><h3>Equipe cadastrada</h3><p>{users.length} usuário(s) vinculado(s) a este condomínio.</p></div></div>
        {usersLoading ? <div className="empty"><RefreshCw className="spin"/> Carregando funcionários...</div> : users.length === 0 ? <div className="empty">Nenhum funcionário encontrado.</div> : <div className="delivery-list">{users.map(u => <article className="delivery-row" key={u.id}>
          <div className="parcel-icon"><Users size={20}/></div><div className="delivery-info"><strong>{u.full_name}</strong><span>{u.role === 'admin' ? 'Administrador' : 'Funcionário da portaria'}</span><small>{u.created_at ? 'Cadastrado em ' + new Date(u.created_at).toLocaleDateString('pt-BR') : ''}</small></div>
          <div className="delivery-status"><span className={u.active ? 'status done' : 'status pending'}>{u.active ? 'Acesso ativo' : 'Acesso desativado'}</span></div>
          {u.role === 'guard' && <button className="collect-btn" onClick={() => toggleGuard(u)}>{u.active ? <UserX size={16}/> : <UserCheck size={16}/>}{u.active ? ' Desativar' : ' Ativar'}</button>}
        </article>)}</div>}
      </section>}
      <footer>PORTARIA CONNECT · Gestão inteligente de encomendas</footer>
    </main>
    {modal && <div className="modal-backdrop" onMouseDown={e => {if(e.target === e.currentTarget) setModal(false)}}><form className="modal" onSubmit={addDelivery}><div className="modal-head"><div><span className="eyebrow">NOVO REGISTRO</span><h2>Registrar encomenda</h2></div><button type="button" className="icon-btn" onClick={() => setModal(false)}><X/></button></div><label>Nome completo do morador<input required value={form.recipient_name} onChange={e => setForm({...form, recipient_name:e.target.value})} placeholder="Nome e sobrenome"/></label><div className="two-cols"><label>Bloco<input required value={form.block} onChange={e => setForm({...form, block:e.target.value})} placeholder="Ex.: A"/></label><label>Apartamento<input required value={form.apartment} onChange={e => setForm({...form, apartment:e.target.value})} placeholder="Ex.: 102"/></label></div><label>Descrição (opcional)<input value={form.description} onChange={e => setForm({...form, description:e.target.value})} placeholder="Ex.: Caixa, envelope, mercado..."/></label><label className="upload"><Camera size={20}/><span><strong>{photo ? photo.name : 'Adicionar foto da encomenda'}</strong><small>Imagem JPG, PNG ou WEBP (máx. 8 MB)</small></span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setPhoto(e.target.files?.[0] || null)}/></label>{photo && <button type="button" className="text-button" onClick={() => setPhoto(null)}>Remover foto</button>}<button className="primary full" disabled={saving}>{saving ? 'Salvando...' : 'Registrar recebimento'}</button></form></div>}
  </div>
}

function Stat({icon,label,value,tone}:{icon:any;label:string;value:number;tone:string}) { return <div className="stat-card"><div className={'stat-icon '+tone}>{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div> }
function SetupScreen() { return <div className="auth-shell"><div className="auth-card setup"><div className="brand-mark"><Package size={27}/></div><p className="eyebrow">PRIMEIRA CONFIGURAÇÃO</p><h1>PORTARIA <span>CONNECT</span></h1><h2>Conecte seu projeto Supabase</h2><p className="muted">O aplicativo já está preparado. Para ativar login, banco de dados e fotos, configure as variáveis de ambiente no arquivo <code>.env</code>.</p><ol><li>Crie um projeto Supabase exclusivo para o PORTARIA CONNECT.</li><li>Copie a URL do projeto e a chave pública (anon/publishable).</li><li>Crie um arquivo <code>.env</code> na pasta do projeto usando o <code>.env.example</code> como modelo.</li><li>Execute o script <code>supabase/schema.sql</code> no SQL Editor do Supabase.</li></ol><p className="muted small">Não coloque a chave service_role no frontend ou no GitHub.</p></div></div> }
