const readStdinJson = async () => new Promise((resolve, reject) => {
  let text = ''
  process.stdin.setEncoding('utf-8')
  process.stdin.on('data', (chunk) => { text += chunk })
  process.stdin.on('end', () => {
    try {
      resolve(text.trim() ? JSON.parse(text) : {})
    } catch (error) {
      reject(new Error('Creator Studio command input must be JSON'))
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
    const result = await handler(context)
    writeResult({ ok: true, ...result })
  } catch (error) {
    writeResult({ ok: false, error: error.message || 'Creator Studio command failed' })
    process.exitCode = 1
  }
}

module.exports = { runCommand }
