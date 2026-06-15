module.exports = function activate(ctx) {
  const normalizeMinutes = (value, fallback) => {
    const minutes = Number(value)
    return Number.isFinite(minutes) && minutes > 0 ? minutes : fallback
  }

  return {
    start: async (payload = {}) => {
      const config = ctx.config.get()
      const label = String(payload.label || config.label || 'Focus')
      const minutes = normalizeMinutes(payload.minutes, normalizeMinutes(config.minutes, 25))
      const previousSessions = await ctx.storage.get('sessionsCompleted', 0)
      const sessionsCompleted = Number(previousSessions || 0) + 1
      await ctx.storage.set('sessionsCompleted', sessionsCompleted)
      await ctx.storage.set('lastSession', {
        label,
        minutes,
        strictMode: Boolean(config.strictMode)
      })

      const strictSuffix = config.strictMode ? ' No distractions.' : ''
      await ctx.pet.say(`${label} started for ${minutes} minutes.${strictSuffix}`)

      return {
        ok: true,
        label,
        minutes,
        sessionsCompleted,
        strictMode: Boolean(config.strictMode)
      }
    },

    reset: async () => {
      await ctx.storage.set('sessionsCompleted', 0)
      await ctx.storage.remove('lastSession')
      await ctx.pet.say('Focus timer sessions reset.')
      return { ok: true, sessionsCompleted: 0 }
    }
  }
}
