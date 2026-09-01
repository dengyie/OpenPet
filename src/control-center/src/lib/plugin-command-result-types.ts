export type ReturnTypeOfCommandPreview = {
  pluginId: string
  commandId: string
  exitCode: number | null
  message: string
  stdout: string
  stderr: string
  resultText: string
  details: Array<{ label: string, value: string }>
}
