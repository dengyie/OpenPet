const readStdinJson = async () => new Promise((resolve, reject) => {
  let text = ''
  process.stdin.setEncoding('utf-8')
  process.stdin.on('data', (chunk) => { text += chunk })
  process.stdin.on('end', () => {
    try {
      resolve(text.trim() ? JSON.parse(text) : {})
    } catch (_) {
      reject(new Error('Agent Awareness command input must be JSON'))
    }
  })
  process.stdin.on('error', reject)
})

const writeResult = (value) => {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

const runCommand = async (handler) => {
  try {
    const context = await readStdinJson()
    writeResult({ ok: true, ...(await handler(context)) })
  } catch (error) {
    writeResult({ ok: false, error: error.message || 'Agent Awareness command failed' })
    process.exitCode = 1
  }
}

module.exports = { runCommand }
