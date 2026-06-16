module.exports = function activate(ctx) {
  return {
    increment: async () => {
      const label = ctx.config.get('label') || 'Counter'
      const step = ctx.config.get('step') || 1
      const current = await ctx.storage.get('count', 0)
      const next = current + step
      await ctx.storage.set('count', next)
      await ctx.pet.say(`${label}: ${next}`)
      return { ok: true, count: next }
    }
  }
}
