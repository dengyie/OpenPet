const createBasicBehaviorPlugin = () => ({
  manifest: {
    id: 'official.basic-behavior',
    name: 'Basic Behavior',
    version: '1.0.0',
    description: 'Built-in pet behavior commands',
    permissions: ['pet:say'],
    commands: [
      { id: 'greet', title: '打招呼' },
      { id: 'rest', title: '休息' }
    ]
  },
  activate: (ctx) => ({
    greet: async () => {
      await ctx.pet.say({ text: '你好，我在这里' })
      return { ok: true }
    },
    rest: async () => {
      await ctx.pet.say({ text: '休息一下' })
      return { ok: true }
    }
  })
})

module.exports = { createBasicBehaviorPlugin }
