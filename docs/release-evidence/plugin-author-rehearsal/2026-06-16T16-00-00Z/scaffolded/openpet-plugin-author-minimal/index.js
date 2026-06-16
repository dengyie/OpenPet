module.exports = function activate(ctx) {
  return {
    run: async () => {
      const message = ctx.config.get('message') || 'Hello from OpenPet!'
      await ctx.pet.say(message)
      return { ok: true }
    }
  }
}
