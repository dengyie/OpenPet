import React, { useEffect, useState } from 'react'
import { tabs } from './constants.ts'
import { useAboutPane } from './hooks/useAboutPane.ts'
import { useActionsPane } from './hooks/useActionsPane.ts'
import { useAiPane } from './hooks/useAiPane.ts'
import { useCatalogPane } from './hooks/useCatalogPane.ts'
import { useCreatorPane } from './hooks/useCreatorPane.ts'
import { usePetSettingsPane } from './hooks/usePetSettingsPane.ts'
import { usePluginsPane } from './hooks/usePluginsPane.ts'
import { useServicePane } from './hooks/useServicePane.ts'
import { AboutPane } from './panes/AboutPane.tsx'
import { ActionsPane } from './panes/ActionsPane.tsx'
import { AiPane } from './panes/AiPane.tsx'
import { CatalogPane } from './panes/CatalogPane.tsx'
import { CreatorPane } from './panes/CreatorPane.tsx'
import { PetPane } from './panes/PetPane.tsx'
import { PluginsPane } from './panes/PluginsPane.tsx'
import { ServicePane } from './panes/ServicePane.tsx'
import { JobPanel } from './features/jobs/JobPanel.tsx'

export function App() {
  const [activeTab, setActiveTab] = useState('pet')
  const [secretStorageSecurity, setSecretStorageSecurity] = useState(
    () => globalThis.window?.openpetBackend?.getSecretStorageSecurity?.() ?? null
  )
  useEffect(() => {
    return globalThis.window?.openpetBackend?.onSecretStorageSecurityChanged?.(setSecretStorageSecurity)
  }, [])
  const creator = useCreatorPane(activeTab === 'create')
  const pet = usePetSettingsPane()
  const actions = useActionsPane()
  const ai = useAiPane(activeTab)
  const plugins = usePluginsPane()
  const catalog = useCatalogPane()
  const service = useServicePane()
  const about = useAboutPane()
  const loading = (activeTab === 'create' && creator.loading) || pet.loading || actions.loading || ai.loading || plugins.loading || catalog.loading || service.loading || about.loading

  let page = <AboutPane {...about.paneProps} />
  if (activeTab === 'create') page = <CreatorPane {...creator.paneProps} />
  if (activeTab === 'pet') page = <PetPane {...pet.paneProps} />
  if (activeTab === 'actions') page = <ActionsPane {...actions.paneProps} />
  if (activeTab === 'ai') page = <AiPane {...ai.paneProps} />
  if (activeTab === 'plugins') page = <PluginsPane {...plugins.paneProps} />
  if (activeTab === 'catalog') page = <CatalogPane {...catalog.paneProps} />
  if (activeTab === 'service') page = <ServicePane {...service.paneProps} />

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>OpenPet</strong>
          <span>Control Center</span>
        </div>
        <nav className="nav" aria-label="Control Center">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="content">
        {secretStorageSecurity?.encryptionAvailable === false && secretStorageSecurity.warning ? (
          <div className="secret-storage-warning" role="alert" data-testid="secret-storage-warning">
            {secretStorageSecurity.warning}
          </div>
        ) : null}
        {loading ? <div className="loading">加载中</div> : page}
        <JobPanel />
      </div>
    </main>
  )
}
