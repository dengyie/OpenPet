module.exports = function activate(ctx) {
  return {
    ask: async () => {
      const prompt = ctx.config.get('prompt') || 'Suggest one cozy action for my desktop pet.'
      const conversationId = ctx.config.get('conversationId') || 'default'
      const response = await ctx.ai.chat({ message: prompt, conversationId })
      if (ctx.config.get('announce')) {
        await ctx.pet.say('AI response is ready.')
      }
      return { ok: true, response }
    }
  }
}
