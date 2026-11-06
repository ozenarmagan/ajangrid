import { useEffect, useState } from 'react'
import { Sidebar, type View } from './components/Sidebar'
import { StoreProvider, useStore, useTeamAgents } from './store'
import { CommandCenter } from './views/CommandCenter'
import { AgentEditor } from './views/AgentEditor'
import { EnginesView } from './views/EnginesView'

function Shell(): React.JSX.Element {
  const { data, error, setError, startRun } = useStore()
  const agents = useTeamAgents()
  const [view, setView] = useState<View>('command')
  const [selected, setSelected] = useState<string | null>(null)
  const theme = data?.settings.theme ?? 'dark'

  // Ekip değişince ya da seçili ajan silinince geçerli bir ajana düş.
  // Ajanlar ekranında selected = null "yeni ajan" formu demektir.
  const fallback = agents.find((a) => a.isManager)?.id ?? agents[0]?.id ?? null
  const current =
    view === 'agents' && selected === null
      ? null
      : agents.some((a) => a.id === selected)
        ? selected
        : fallback

  useEffect(() => {
    document.body.className = theme === 'light' ? 't-light' : 't-dark'
  }, [theme])

  if (!data) return <div className={`app t-${theme}`} />

  // Kenar çubuğunda ajana tıklamak: Komuta Merkezi'nde o ajanın kartını aç
  // (Ajanlar ekranındaysa o ajanı düzenle)
  const selectAgent = (id: string): void => {
    setSelected(id)
    if (view === 'engines') setView('command')
  }
  const focusId = agents.find((a) => a.id === current && !a.isManager)?.id ?? null

  return (
    <div className={`app t-${theme}`}>
      <Sidebar
        view={view}
        setView={setView}
        selectedAgentId={current}
        onSelectAgent={selectAgent}
        onNewAgent={() => {
          setSelected(null)
          setView('agents')
        }}
      />
      <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', position: 'relative' }}>
        {view === 'command' ? (
          <CommandCenter
            focusId={focusId}
            setFocusId={(id) => setSelected(id)}
            theme={theme}
            onEditAgent={(id) => {
              setSelected(id)
              setView('agents')
            }}
          />
        ) : null}
        {view === 'agents' ? (
          <AgentEditor
            key={`${current ?? 'yeni'}-${data.settings.activeTeamId}`}
            agentId={current}
            onSaved={(id) => setSelected(id)}
            onDeleted={() => setSelected(null)}
            onTest={(id) => {
              setSelected(id)
              setView('command')
              startRun(
                id,
                'Bu bir bağlantı testidir. Kendini ve görevini tek cümleyle tanıt; dosya oluşturma.'
              )
            }}
          />
        ) : null}
        {view === 'engines' ? <EnginesView /> : null}

        {error ? (
          <div
            role="alert"
            style={{
              position: 'absolute',
              right: 20,
              bottom: 20,
              maxWidth: 440,
              background: 'var(--panel)',
              border: '1px solid rgba(248,113,113,.5)',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              boxShadow: '0 10px 30px rgba(0,0,0,.25)'
            }}
          >
            <span style={{ color: 'var(--red-fg)', lineHeight: 1.5, fontSize: 13 }}>{error}</span>
            <button className="btn btn-sm" onClick={() => setError(null)}>
              Kapat
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function App(): React.JSX.Element {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
