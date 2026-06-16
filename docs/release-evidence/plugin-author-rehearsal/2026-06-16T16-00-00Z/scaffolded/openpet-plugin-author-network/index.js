module.exports = function activate(ctx) {
  return {
    run: async () => {
      const path = ctx.config.get('path') || '/status'
      const normalizedPath = path.startsWith('/') ? path : `/${path}`
      const response = await ctx.network.fetch(`https://api.example.com${normalizedPath}`, {
        headers: { accept: 'application/json' }
      })
      if (ctx.config.get('announce')) {
        await ctx.pet.say(`Network request completed with status ${response.status}`)
      }
      return { ok: response.ok, status: response.status }
    }
  }
}
