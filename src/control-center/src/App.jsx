import React, { useState } from 'react'
import { tabs } from './constants'
import { useAboutPane } from './hooks/useAboutPane'
import { useActionsPane } from './hooks/useActionsPane'
import { useAiPane } from './hooks/useAiPane'
import { useCatalogPane } from './hooks/useCatalogPane'
import { usePetSettingsPane } from './hooks/usePetSettingsPane'
import { usePluginsPane } from './hooks/usePluginsPane'
import { useServicePane } from './hooks/useServicePane'
import { AboutPane } from './panes/AboutPane'
import { ActionsPane } from './panes/ActionsPane'
import { AiPane } from './panes/AiPane'
import { CatalogPane } from './panes/CatalogPane'
import { PetPane } from './panes/PetPane'
import { PluginsPane } from './panes/PluginsPane'
import { ServicePane } from './panes/ServicePane'

export function App() {
  const [activeTab, setActiveTab] = useState('pet')
  const pet = usePetSettingsPane()
  const actions = useActionsPane()
  const ai = useAiPane()
  const plugins = usePluginsPane()
  const catalog = useCatalogPane()
  const service = useServicePane()
  const about = useAboutPane()
  const loading = pet.loading || actions.loading || ai.loading || plugins.loading || catalog.loading || service.loading || about.loading

  let page = <AboutPane {...about.paneProps} />
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
        {loading ? <div className="loading">加载中</div> : page}
      </div>
    </main>
  )
}
