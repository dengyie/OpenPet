const test = require('node:test')
const assert = require('node:assert/strict')

test('pet chat defaults initialize and deep clone streaming state', async () => {
  const { clonePetChatState, defaultPetChatState } = await import('../../src/control-center/src/lib/defaults.ts')
  const streaming = {
    requestId: 'stream-1',
    conversationId: 'control-center:cat:main',
    petPackId: 'cat',
    entrypoint: 'pet-chat',
    status: 'streaming',
    partialReply: 'Hello',
    partialReplyChars: 5,
    chunkCount: 1,
    canCancel: true,
    errorMessage: ''
  }

  assert.equal(defaultPetChatState.streaming, null)
  const cloned = clonePetChatState({ streaming })
  streaming.partialReply = 'mutated'

  assert.notEqual(cloned.streaming, streaming)
  assert.equal(cloned.streaming?.partialReply, 'Hello')
})
