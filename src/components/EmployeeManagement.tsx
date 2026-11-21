
import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import {
  Users, Plus, RefreshCw, Pencil, Trash2,
  Lock, Unlock, ArrowLeft, X, ShieldCheck
} from 'lucide-react'

type Employee = {
  id: string
  full_name: string
  email: string
  role: 'admin' | 'guard'
  active: boolean
  created_at: string
}

type Props = {
  onBack: () => void
}

const emptyForm = {
  fullName: '',
  email: '',
  password: '',
  role: 'guard' as 'admin' | 'guard'
}

export default function EmployeeManagement({ onBack }: Props) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  const loadEmployees = async () => {
    if (!supabase) return

    setLoading(true)
    setError('')

    const { data, error } = await supabase.functions.invoke(
      'manage-users',
      { body: { action: 'list' } }
    )

    if (error) {
      setError(error.message)
    } else if (data?.error) {
      setError(data.error)
    } else {
      setEmployees(data.users || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadEmployees()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setModal(true)
  }

  const openEdit = (employee: Employee) => {
    setEditing(employee.id)
    setForm({
      fullName: employee.full_name,
      email: employee.email,
      password: '',
      role: employee.role
    })
    setError('')
    setModal(true)
  }

  const saveEmployee = async (e: FormEvent) => {
    e.preventDefault()

    if (!supabase) return

    setSaving(true)
    setError('')
    setNotice('')

    try {
      const body: Record<string, unknown> = {
        action: editing ? 'update' : 'create',
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        role: form.role
      }

      if (editing) {
        body.userId = editing
        if (form.password) body.password = form.password
      } else {
        body.password = form.password
      }

      const { data, error } = await supabase.functions.invoke(
        'manage-users',
        { body }
      )

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      setModal(false)
      setForm(emptyForm)
      setNotice(data.message || 'Operação realizada com sucesso.')

      await loadEmployees()
    } catch (err: any) {
      setError(err.message || 'Não foi possível salvar o funcionário.')
    } finally {
      setSaving(false)
    }
  }

  const toggleEmployee = async (employee: Employee) => {
    if (!supabase) return

    const action = employee.active ? 'bloquear' : 'desbloquear'

    if (!window.confirm(`Deseja ${action} ${employee.full_name}?`)) {
      return
    }

    setError('')
    setNotice('')

    const { data, error } = await supabase.functions.invoke(
      'manage-users',
      {
        body: {
          action: 'toggle',
          userId: employee.id,
          active: !employee.active
        }
      }
    )

    if (error || data?.error) {
      setError(data?.error || error?.message || 'Falha ao alterar acesso.')
      return
    }

    setNotice(data.message)
    await loadEmployees()
  }

  const deleteEmployee = async (employee: Employee) => {
    if (!supabase) return

    if (!window.confirm(
      `ATENÇÃO: deseja excluir permanentemente ${employee.full_name}?`
    )) return

    setError('')
    setNotice('')

    const { data, error } = await supabase.functions.invoke(
      'manage-users',
      {
        body: {
          action: 'delete',
          userId: employee.id
        }
      }
    )

    if (error || data?.error) {
      setError(data?.error || error?.message || 'Falha ao excluir.')
      return
    }

    setNotice(data.message)
    await loadEmployees()
  }

  return (
    <div className="main">
      <header className="topbar">
        <div>
          <p className="eyebrow">ADMINISTRAÇÃO</p>
          <h2>Funcionários</h2>
        </div>

        <div className="top-actions">
          <button className="outline" onClick={onBack}>
            <ArrowLeft size={17} />
            Voltar
          </button>

          <button className="icon-btn" onClick={loadEmployees}>
            <RefreshCw size={18} />
          </button>

          <button className="primary" onClick={openCreate}>
            <Plus size={18} />
            Novo funcionário
          </button>
        </div>
      </header>

      {error && (
        <div className="alert">
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
          <span className="welcome-tag">CONTROLE DE ACESSO</span>
          <h1>Equipe da portaria</h1>
          <p>Cadastre e gerencie os acessos dos funcionários do condomínio.</p>
        </div>
        <div className="welcome-icon">
          <Users size={42} />
        </div>
      </section>

      <section className="stats">
        <div className="stat-card">
          <div className="stat-icon blue"><Users /></div>
          <div>
            <span>Total de funcionários</span>
            <strong>{employees.length}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green"><ShieldCheck /></div>
          <div>
            <span>Ativos</span>
            <strong>{employees.filter(e => e.active).length}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange"><Lock /></div>
          <div>
            <span>Bloqueados</span>
            <strong>{employees.filter(e => !e.active).length}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Funcionários cadastrados</h3>
            <p>Usuários vinculados ao seu condomínio.</p>
          </div>
        </div>

        {loading ? (
          <div className="empty">
            <RefreshCw className="spin" />
            <strong>Carregando funcionários...</strong>
          </div>
        ) : employees.length === 0 ? (
          <div className="empty">
            <Users size={34} />
            <strong>Nenhum funcionário encontrado</strong>
            <span>Cadastre o primeiro funcionário.</span>
          </div>
        ) : (
          <div className="delivery-list">
            {employees.map(employee => (
              <article className="delivery-row" key={employee.id}>
                <div className="parcel-icon">
                  <Users size={21} />
                </div>

                <div className="delivery-info">
                  <strong>{employee.full_name}</strong>
                  <span>{employee.email}</span>
                  <small>
                    Perfil: {employee.role === 'admin' ? 'Administrador' : 'Portaria'}
                  </small>
                </div>

                <div className="delivery-status">
                  <span className={
                    employee.active ? 'status done' : 'status pending'
                  }>
                    {employee.active ? 'Ativo' : 'Bloqueado'}
                  </span>
                </div>

                <div style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap'
                }}>
                  <button
                    className="icon-btn"
                    title="Editar"
                    onClick={() => openEdit(employee)}
                  >
                    <Pencil size={17} />
                  </button>

                  <button
                    className="icon-btn"
                    title={employee.active ? 'Bloquear' : 'Desbloquear'}
                    onClick={() => toggleEmployee(employee)}
                  >
                    {employee.active
                      ? <Lock size={17} />
                      : <Unlock size={17} />}
                  </button>

                  <button
                    className="icon-btn"
                    title="Excluir"
                    onClick={() => deleteEmployee(employee)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {modal && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={saveEmployee}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">
                  {editing ? 'ATUALIZAÇÃO' : 'NOVO ACESSO'}
                </span>
                <h2>{editing ? 'Editar funcionário' : 'Cadastrar funcionário'}</h2>
              </div>

              <button
                type="button"
                className="icon-btn"
                onClick={() => setModal(false)}
                disabled={saving}
              >
                <X />
              </button>
            </div>

            <label>
              Nome completo
              <input
                required
                value={form.fullName}
                onChange={e => setForm({ ...form, fullName: e.target.value })}
                placeholder="Nome do funcionário"
              />
            </label>

            <label>
              E-mail
              <input
                type="email"
                required
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="funcionario@email.com"
              />
            </label>

            <label>
              {editing ? 'Nova senha (opcional)' : 'Senha'}
              <input
                type="password"
                required={!editing}
                minLength={8}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder={editing ? 'Deixe vazio para manter a atual' : 'Mínimo de 8 caracteres'}
              />
            </label>

            <label>
              Perfil de acesso
              <select
                value={form.role}
                onChange={e => setForm({
                  ...form,
                  role: e.target.value as 'admin' | 'guard'
                })}
              >
                <option value="guard">Funcionário da portaria</option>
                <option value="admin">Administrador</option>
              </select>
            </label>

            <button className="primary full" disabled={saving} type="submit">
              {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Cadastrar funcionário'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
