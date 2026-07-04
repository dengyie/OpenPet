const readJsonStdin = async () => {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
  const input = Buffer.concat(chunks).toString('utf-8').trim()
  if (!input) return {}
  try {
    return JSON.parse(input)
  } catch (_) {
    throw new Error('Command input must be valid JSON')
  }
}

const writeJsonStdout = (value) => {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

const runJsonCommand = async (fn) => {
  try {
    const input = await readJsonStdin()
    writeJsonStdout(await fn(input))
  } catch (error) {
    writeJsonStdout({
      ok: false,
      error: error?.message || 'Command failed'
    })
    process.exitCode = 1
  }
}

module.exports = {
  readJsonStdin,
  runJsonCommand,
  writeJsonStdout
}
