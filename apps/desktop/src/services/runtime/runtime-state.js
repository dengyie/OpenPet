const cloneValue = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

const createRuntimeState = (initialSnapshot = {}) => {
  let snapshot = cloneValue(initialSnapshot)
  const listeners = new Set()

  const getSnapshot = () => cloneValue(snapshot)

  const notify = () => {
    const nextSnapshot = getSnapshot()
    for (const listener of [...listeners]) {
      listener(nextSnapshot)
    }
  }

  const replace = (nextSnapshot) => {
    snapshot = cloneValue(nextSnapshot)
    notify()
    return getSnapshot()
  }

  const patch = (partialSnapshot) => replace({ ...snapshot, ...partialSnapshot })

  const subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return { getSnapshot, replace, patch, subscribe }
}

module.exports = { createRuntimeState }
