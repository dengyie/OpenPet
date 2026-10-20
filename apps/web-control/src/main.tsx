import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createWebApi, normalizeCreatorRun } from './api.mjs'
import './styles.css'

type Json = Record<string, any>
type Job = Json & { jobId: string; status: string }
type Candidate = Json & {
  candidateId: string
  sha256: string
  relativePath: string
  technicalEligible: boolean
  recommended: boolean
}
type ActionReview = Json & { ok: boolean; candidates?: Candidate[]; failureCode?: string; warningCodes?: string[] }

const api = createWebApi()

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取参考图失败'))
    reader.onload = () => resolve(String(reader.result || '').split(',', 2)[1] || '')
    reader.readAsDataURL(file)
  })
}

function Login({ onLogin }: { onLogin: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return <main className="login-page"><section className="login-card">
    <div className="eyebrow">OPENPET <span>/</span> PRIVATE MESH</div>
    <h1>连接 OpenPet</h1>
    <p>控制台通过 EasyTier 私有网络连接广州 Backend。生成由 Backend 执行；Provider session 由桌面端连接提供，导入需要 Shell。</p>
    <form onSubmit={async (event) => {
      event.preventDefault()
      setBusy(true)
      setError('')
      try { await onLogin(password) } catch (reason) { setError(reason instanceof Error ? reason.message : '登录失败') }
      finally { setBusy(false) }
    }}>
      <label>Web 密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus autoComplete="current-password" /></label>
      <button className="primary" disabled={busy || !password}>{busy ? '连接中…' : '进入控制台'}</button>
    </form>
    {error ? <div className="error" role="alert">{error}</div> : null}
  </section></main>
}

function IdentityCandidateCard({
  candidate,
  runId,
  selected,
  disabled,
  confirming,
  onSelect,
  onAccept,
  onConfirm,
  onCancel
}: {
  candidate: Candidate
  runId: string
  selected: boolean
  disabled: boolean
  confirming: boolean
  onSelect: () => void
  onAccept: () => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const [preview, setPreview] = useState('')
  const [previewError, setPreviewError] = useState('')

  useEffect(() => {
    let canceled = false
    if (!candidate.previewable || !candidate.relativePath) return undefined
    void api.assetPreview(runId, candidate.relativePath).then((value) => {
      if (!canceled && value?.ok && typeof value.previewDataUrl === 'string') setPreview(value.previewDataUrl)
      else if (!canceled) setPreviewError(value?.message || '候选图暂不可预览')
    }).catch((reason) => {
      if (!canceled) setPreviewError(reason instanceof Error ? reason.message : '候选图暂不可预览')
    })
    return () => { canceled = true }
  }, [candidate.previewable, candidate.relativePath, runId])

  return <article className={`candidate-card ${selected ? 'selected' : ''}`}>
    <button type="button" className="candidate-choice" onClick={onSelect} disabled={disabled} aria-pressed={selected}>
      {preview ? <img className="candidate-preview" src={preview} alt={`候选 ${candidate.candidateId}`} />
        : <span className="candidate-preview placeholder">{previewError || '正在加载候选图…'}</span>}
      <span className="candidate-copy">
        <strong>{candidate.candidateId}</strong>
        <span>{candidate.recommended ? '推荐候选' : candidate.technicalEligible ? '可选，有质量提示' : '技术校验未通过'}</span>
        {typeof candidate.score === 'number' ? <span>质量分 {candidate.score}</span> : null}
        {Array.isArray(candidate.qualityWarningCodes) && candidate.qualityWarningCodes.length
          ? <span className="warning-text">{candidate.qualityWarningCodes.join(' · ')}</span> : null}
        <code title={candidate.sha256}>{candidate.sha256.slice(0, 16)}…</code>
      </span>
      <span className="radio-mark" aria-hidden="true" />
    </button>
    {confirming ? <div className="override-confirmation">
      <strong>仍采用未达推荐标准的候选？</strong>
      <span>自动质量提示会保留在 run 记录中，后续动作将以此形象为准。</span>
      <div className="row"><button type="button" className="primary" disabled={disabled} onClick={onConfirm}>确认并继续</button><button type="button" className="ghost" onClick={onCancel}>返回</button></div>
    </div> : null}
    {!confirming && selected ? <button type="button" className="secondary candidate-accept" disabled={disabled || !candidate.technicalEligible || !candidate.sha256} onClick={candidate.recommended ? onAccept : onSelect}>
      {candidate.recommended ? '接受此形象并生成动作' : '查看质量提示并选择'}
    </button> : null}
  </article>
}

function ActionCandidateCard({
  candidate,
  actionId,
  runId,
  selected,
  disabled,
  confirming,
  onSelect,
  onAccept,
  onConfirm,
  onCancel
}: {
  candidate: Candidate
  actionId: string
  runId: string
  selected: boolean
  disabled: boolean
  confirming: boolean
  onSelect: () => void
  onAccept: () => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const [preview, setPreview] = useState('')
  const [previewError, setPreviewError] = useState('')

  useEffect(() => {
    let canceled = false
    if (!candidate.previewable || !candidate.relativePath) return undefined
    void api.assetPreview(runId, candidate.relativePath).then((value) => {
      if (!canceled && value?.ok && typeof value.previewDataUrl === 'string') setPreview(value.previewDataUrl)
      else if (!canceled) setPreviewError(value?.message || '候选图暂不可预览')
    }).catch((reason) => {
      if (!canceled) setPreviewError(reason instanceof Error ? reason.message : '候选图暂不可预览')
    })
    return () => { canceled = true }
  }, [candidate.previewable, candidate.relativePath, runId])

  return <article className={`candidate-card ${selected ? 'selected' : ''}`}>
    <button type="button" className="candidate-choice" onClick={onSelect} disabled={disabled} aria-pressed={selected}>
      {preview ? <img className="candidate-preview" src={preview} alt={`${actionId} 动作候选 ${candidate.candidateId}`} />
        : <span className="candidate-preview placeholder">{previewError || '正在加载候选图…'}</span>}
      <span className="candidate-copy">
        <strong>{candidate.candidateId}</strong>
        <span>{candidate.recommended ? '推荐候选' : candidate.technicalEligible ? '可选，有质量提示' : '技术校验未通过'}</span>
        {typeof candidate.score === 'number' ? <span>质量分 {candidate.score}</span> : null}
        {Array.isArray(candidate.qualityWarningCodes) && candidate.qualityWarningCodes.length
          ? <span className="warning-text">{candidate.qualityWarningCodes.join(' · ')}</span> : null}
        <code title={candidate.sha256}>{candidate.sha256?.slice(0, 16)}…</code>
      </span>
      <span className="radio-mark" aria-hidden="true" />
    </button>
    {confirming ? <div className="override-confirmation">
      <strong>仍采用未达推荐标准的动作？</strong>
      <span>动作质量提示会保留在 run 记录中。</span>
      <div className="row"><button type="button" className="primary" disabled={disabled} onClick={onConfirm}>确认采用</button><button type="button" className="ghost" onClick={onCancel}>返回</button></div>
    </div> : null}
    {!confirming && selected ? <button type="button" className="secondary candidate-accept" disabled={disabled || !candidate.technicalEligible || !/^[a-f0-9]{64}$/i.test(candidate.sha256)} onClick={candidate.recommended ? onAccept : onSelect}>
      {candidate.recommended ? '采用此动作候选' : '查看质量提示并选择'}
    </button> : null}
  </article>
}

function App() {
  const [loggedIn, setLoggedIn] = useState(api.hasToken())
  const [health, setHealth] = useState<Json | null>(null)
  const [creator, setCreator] = useState<Json | null>(null)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [imageJob, setImageJob] = useState<Job | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [imageReference, setImageReference] = useState<{ relativePath: string; sha256: string } | null>(null)
  const [result, setResult] = useState<Json | null>(null)
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const [confirmingCandidateId, setConfirmingCandidateId] = useState('')
  const [selectedActionCandidateKey, setSelectedActionCandidateKey] = useState('')
  const [confirmingActionCandidateKey, setConfirmingActionCandidateKey] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    const [nextHealth, nextCreator] = await Promise.all([api.health(), api.creatorState()])
    setHealth(nextHealth)
    setCreator(nextCreator)
  }

  useEffect(() => {
    if (loggedIn) void refresh().catch((reason) => setMessage(reason instanceof Error ? reason.message : 'Backend 不可用'))
  }, [loggedIn])

  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return undefined
    let canceled = false
    const poll = async () => {
      try {
        const next = await api.job(job.jobId)
        if (canceled) return
        setJob(next)
        if (next.status === 'succeeded') {
          setResult(next.result || null)
          setMessage(next.result?.message || '任务完成，请检查生成结果。')
          await refresh()
        } else if (['failed', 'canceled', 'interrupted'].includes(next.status)) {
          setMessage(next.error?.message || `任务${next.status === 'failed' ? '失败' : '已停止'}`)
        }
      } catch (reason) {
        if (!canceled) setMessage(reason instanceof Error ? reason.message : '任务状态读取失败')
      }
    }
    void poll()
    const timer = window.setInterval(() => { void poll() }, 1500)
    return () => { canceled = true; window.clearInterval(timer) }
  }, [job?.jobId, job?.status])

  useEffect(() => {
    if (!imageJob || !['queued', 'running'].includes(imageJob.status)) return undefined
    let canceled = false
    const poll = async () => {
      try {
        const next = await api.job(imageJob.jobId)
        if (canceled) return
        setImageJob(next)
        if (next.status === 'succeeded') {
          const output = next.result?.outputs?.[0]
          const relativePath = output?.dataRelativePath
          if (typeof relativePath !== 'string' || !relativePath) throw new Error('Backend 图片任务已完成，但没有可用图片产物。')
          const preview = await api.imagePreview(relativePath)
          if (!canceled && typeof preview?.previewDataUrl === 'string' && /^[a-f0-9]{64}$/i.test(String(output?.sha256 || ''))) {
            setImagePreview(preview.previewDataUrl)
            setImageReference({ relativePath, sha256: String(output.sha256).toLowerCase() })
          } else if (!canceled) {
            throw new Error('图片预览或完整性校验信息不可用，不能继续 Creator 流程。')
          }
          if (!canceled) setMessage('Backend 图片已生成，可预览并继续完整宠物流程。')
        } else if (['failed', 'canceled', 'interrupted'].includes(next.status)) {
          setMessage(next.error?.message || `图片任务${next.status === 'failed' ? '失败' : '已停止'}`)
        }
      } catch (reason) {
        if (!canceled) setMessage(reason instanceof Error ? reason.message : '图片任务状态读取失败')
      }
    }
    void poll()
    const timer = window.setInterval(() => { void poll() }, 1500)
    return () => { canceled = true; window.clearInterval(timer) }
  }, [imageJob?.jobId, imageJob?.status])

  const rawRun = result?.run || creator?.backendLastRun || creator?.lastRun?.run || creator?.lastRun || null
  const diagnosticsFallback = result?.diagnostics || creator?.diagnostics || creator?.lastRun?.diagnostics || null
  const currentRun = normalizeCreatorRun(rawRun, diagnosticsFallback)
  const diagnostics = currentRun?.diagnostics || diagnosticsFallback
  const qualityFirst = currentRun?.qualityFirst || diagnostics?.progress?.qualityFirst || null
  const backendOwnedRun = currentRun?.creatorExecution === 'backend'
  const identityReview = qualityFirst?.identityReview || null
  const candidates = (identityReview?.candidates || []) as Candidate[]
  const progress = useMemo(() => Math.max(0, Math.min(100, Number(job?.progress?.percent || 0))), [job?.progress?.percent])
  const shellReady = creator?.dashboard?.available === true
  const active = Boolean(job && ['queued', 'running'].includes(job.status))

  if (!loggedIn) return <Login onLogin={async (password) => {
    await api.login(password)
    setLoggedIn(true)
  }} />

  const schedule = (promise: Promise<Json>, success: string) => {
    setBusy(true)
    setMessage('')
    void promise.then((next) => {
      setJob({ jobId: next.jobId, status: 'queued' })
      setMessage(success)
    }).catch((reason) => setMessage(reason instanceof Error ? reason.message : '请求失败')).finally(() => setBusy(false))
  }

  const generateImagePreview = async () => {
    if (!prompt.trim() || !file) {
      setMessage('图片预览需要形象描述和一张参考图。')
      return
    }
    if (file && (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_100_000)) {
      throw new Error('参考图必须是 PNG、JPEG 或 WebP，且不能超过 1.1 MB。')
    }
    const referenceImage = file ? {
      fileName: file.name,
      mimeType: file.type,
      dataBase64: await readFileBase64(file)
    } : undefined
    setBusy(true)
    setImagePreview('')
    setImageReference(null)
    setMessage('Backend 图片任务已提交。')
    try {
      const next = await api.generateImage({
        prompt: prompt.trim(),
        ...(referenceImage ? { referenceImage } : {})
      })
      setImageJob({ jobId: next.jobId, status: 'queued' })
    } finally {
      setBusy(false)
    }
  }

  const generate = async () => {
    if (!name.trim() || !prompt.trim() || (!file && !imageReference)) {
      setMessage('完整生成需要宠物名称、形象描述和参考图，或先生成 Backend 图片预览。')
      return
    }
    if (!imageReference && (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1_100_000)) {
      throw new Error('参考图必须是 PNG、JPEG 或 WebP，且不能超过 1.1 MB。')
    }
    const referenceImage = imageReference
      ? undefined
      : { fileName: file!.name, mimeType: file!.type, dataBase64: await readFileBase64(file!) }
    schedule(api.generate({
      backend: 'web',
      runId: `web-${Date.now()}`,
      characterName: name.trim(),
      stylePrompt: prompt.trim(),
      ...(imageReference ? { generatedImage: imageReference } : { referenceImage })
    }), 'Backend 全流程生成任务已提交。')
  }

  const acceptCandidate = (candidate: Candidate, override = false) => {
    if (!currentRun?.runId || !candidate.technicalEligible || !/^[a-f0-9]{64}$/i.test(candidate.sha256)) return
    schedule(api.approveIdentity(currentRun.runId, {
      candidateId: candidate.candidateId,
      sha256: candidate.sha256,
      ...(override ? { qualityOverride: true, acknowledgedWarningCodes: candidate.qualityWarningCodes || [] } : {})
    }), `已提交候选 ${candidate.candidateId}，Backend 将继续生成动作。`)
    setConfirmingCandidateId('')
  }

  const acceptActionCandidate = (actionId: string, candidate: Candidate, override = false) => {
    if (!currentRun?.runId || !candidate.technicalEligible || !/^[a-f0-9]{64}$/i.test(candidate.sha256)) return
    schedule(api.approveActionCandidate(currentRun.runId, {
      actionId,
      candidateId: candidate.candidateId,
      sha256: candidate.sha256,
      ...(override ? { qualityOverride: true, acknowledgedWarningCodes: candidate.qualityWarningCodes || [] } : {})
    }), `已提交 ${actionId} 动作候选 ${candidate.candidateId}，Backend 将继续校验并整理结果。`)
    setConfirmingActionCandidateKey('')
  }

  const logout = async () => {
    await api.logout()
    setLoggedIn(false)
    setHealth(null)
    setCreator(null)
    setJob(null)
    setImageJob(null)
    setImagePreview('')
    setResult(null)
  }

  return <main className="app-shell">
    <header className="topbar">
      <div><div className="eyebrow">OPENPET <span>/</span> CREATOR STUDIO</div><h1>新宠物生成工作台</h1><p>广州 Backend · EasyTier 私有网络</p></div>
      <div className="top-actions">
        <div className={`connection-pill ${health?.status === 'ok' ? 'online' : ''}`}><span />{health?.status === 'ok' ? 'Backend 在线' : 'Backend 未连接'}</div>
        <div className={`connection-pill ${shellReady ? 'online' : ''}`}><span />{shellReady ? '桌面 Shell 在线' : '等待桌面 Shell'}</div>
        <button className="ghost" onClick={() => void logout()}>退出</button>
      </div>
    </header>

    <div className="architecture-note"><strong>链路说明</strong><span>活动 Backend session 由桌面端连接并提供 Provider key；图片和完整 Creator 质量优先流程由广州 Backend 生成、审核和打包；桌面 Shell 负责本机宠物库导入与激活。</span></div>
    {message ? <div className="message" role="status">{message}</div> : null}

    <section className="workspace-grid">
      <article className="panel create-panel">
        <div className="panel-heading"><div><span className="step-number">01</span><h2>定义新形象</h2><p>上传正面参考图后提交生成。</p></div><span className="tag">quality-first</span></div>
        <label>宠物名称<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如 Mango Fox" maxLength={100} /></label>
        <label>形象与风格描述<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="橘金色的小狐狸，明亮像素风，正面站立，透明背景" rows={4} maxLength={8000} /></label>
        <label>参考图<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { setFile(event.target.files?.[0] || null); setImageReference(null); setImagePreview('') }} /></label>
        <div className="row upload-row">
          <span className="muted">{file ? file.name : '单张正面图 · 最大 1.1 MB；由 Backend 校验并暂存'}</span>
        </div>
        <button className="secondary wide" disabled={busy || Boolean(imageJob && ['queued', 'running'].includes(imageJob.status)) || !prompt.trim() || !file} onClick={() => void generateImagePreview().catch((reason) => setMessage(reason instanceof Error ? reason.message : '图片生成失败'))}>生成图片预览（Backend）</button>
        <button className="primary wide" disabled={busy || active || !name.trim() || !prompt.trim() || (!file && !imageReference)} onClick={() => void generate().catch((reason) => setMessage(reason instanceof Error ? reason.message : '生成任务提交失败'))}>提交 Backend 全流程生成</button>
        <p className="footnote">身份候选确认、动作生成与 QA、最终 package 都由 Backend 执行；活动 Provider session 由桌面端维持，Shell 负责本机导入和激活。</p>
      </article>

      <article className="panel task-panel">
        <div className="panel-heading"><div><span className="step-number">02</span><h2>生成进度</h2><p>进度由 Backend Job 队列汇报。</p></div><span className={`tag ${job?.status === 'failed' ? 'tag-error' : ''}`}>{job?.status || '尚未开始'}</span></div>
        {job ? <>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
          <div className="progress-label"><span>{job.progress?.phase || job.status}</span><strong>{progress}%</strong></div>
          {job.error?.message ? <div className="error" role="alert">{job.error.message}</div> : null}
        </> : <div className="empty-state"><span className="empty-icon">✦</span><strong>等待生成任务</strong><span>提交之后，这里会显示当前阶段与结果。</span></div>}
        {currentRun ? <div className="run-summary">
          <div className="run-heading"><span className="muted">最近的生成记录</span><code>{currentRun.runId || '处理中'}</code></div>
          <strong>{currentRun.message || currentRun.workflowState || qualityFirst?.phase || 'Creator 状态已更新'}</strong>
          {qualityFirst?.phase ? <span className="muted">阶段：{qualityFirst.phase}</span> : null}
        </div> : null}
        {imageJob ? <div className="run-summary image-run-summary">
          <div className="run-heading"><span className="muted">Backend 图片任务</span><code>{imageJob.jobId}</code></div>
          <strong>{imageJob.progress?.phase || imageJob.status}</strong>
          {imageJob.error?.message ? <div className="error" role="alert">{imageJob.error.message}</div> : null}
          {imagePreview ? <img className="generated-preview" src={imagePreview} alt="Backend 生成的宠物图片预览" /> : null}
          {imagePreview && imageReference ? <button className="secondary wide" disabled={busy || active || !name.trim() || !prompt.trim()} onClick={() => void generate().catch((reason) => setMessage(reason instanceof Error ? reason.message : 'Creator 流程提交失败'))}>以这张图继续完整宠物流程</button> : null}
        </div> : null}
      </article>
    </section>

    {identityReview?.status === 'pending' && currentRun?.runId ? <section className="panel review-panel">
      <div className="panel-heading"><div><span className="step-number">03</span><h2>选择形象候选</h2><p>逐张查看候选图；只有你确认后才会开始生成动作。</p></div><span className="tag">等待人工选择</span></div>
      <div className="candidate-grid">{candidates.map((candidate) => <IdentityCandidateCard
        key={candidate.candidateId}
        candidate={candidate}
        runId={currentRun.runId}
        selected={selectedCandidateId === candidate.candidateId}
        disabled={busy || active || (!backendOwnedRun && !shellReady) || !candidate.technicalEligible || !/^[a-f0-9]{64}$/i.test(candidate.sha256)}
        confirming={confirmingCandidateId === candidate.candidateId}
        onSelect={() => {
          setSelectedCandidateId(candidate.candidateId)
          if (!candidate.recommended) setConfirmingCandidateId(candidate.candidateId)
          else setConfirmingCandidateId('')
        }}
        onAccept={() => acceptCandidate(candidate)}
        onConfirm={() => acceptCandidate(candidate, true)}
        onCancel={() => setConfirmingCandidateId('')}
      />)}</div>
    </section> : null}

    {identityReview?.status === 'failed' && currentRun?.runId ? <section className="panel recovery-panel">
      <div><span className="step-number">03</span><h2>身份生成失败</h2><p>可以重新运行身份生成；这会再次调用图片 Provider。</p></div>
      <button className="secondary" disabled={busy || active || (!backendOwnedRun && !shellReady)} onClick={() => {
        if (!window.confirm('重新生成身份可能产生新的 Provider 用量，继续吗？')) return
        schedule(api.retryIdentity(currentRun.runId), '身份重试任务已提交。')
      }}>重试身份生成</button>
    </section> : null}

    {qualityFirst?.actionResults && Object.keys(qualityFirst.actionResults).length > 0 && currentRun?.runId ? <section className="panel review-panel">
      <div className="panel-heading"><div><span className="step-number">04</span><h2>动作候选与修复</h2><p>采用已有候选不新增图片费用；重试会重新调用图片 Provider。</p></div><span className="tag">{backendOwnedRun ? '广州 Backend 执行' : '桌面 Shell 执行'}</span></div>
      <div className="action-review-list">{Object.entries(qualityFirst.actionResults as Record<string, ActionReview>).map(([actionId, actionResult]) => {
        const candidates = Array.isArray(actionResult.candidates) ? actionResult.candidates : []
        const hasSelectableCandidates = candidates.some((candidate) => candidate.technicalEligible && /^[a-f0-9]{64}$/i.test(candidate.sha256 || ''))
        return <article className="action-review" key={actionId}>
          <div className="run-heading"><strong>{actionId}</strong><span className={`tag ${actionResult.ok ? '' : 'tag-error'}`}>{actionResult.ok ? '已通过' : actionResult.failureCode || '待处理'}</span></div>
          {actionResult.warningCodes?.length ? <p className="warning-text">{actionResult.warningCodes.join(' · ')}</p> : null}
          {candidates.length ? <div className="candidate-grid">{candidates.map((candidate) => {
            const candidateKey = `${actionId}:${candidate.candidateId}`
            return <ActionCandidateCard
              key={candidate.candidateId}
              candidate={candidate}
              actionId={actionId}
              runId={currentRun.runId}
              selected={selectedActionCandidateKey === candidateKey}
              disabled={busy || active || (!backendOwnedRun && !shellReady) || actionResult.ok || !candidate.technicalEligible || !/^[a-f0-9]{64}$/i.test(candidate.sha256 || '')}
              confirming={confirmingActionCandidateKey === candidateKey}
              onSelect={() => {
                setSelectedActionCandidateKey(candidateKey)
                if (!candidate.recommended) setConfirmingActionCandidateKey(candidateKey)
                else setConfirmingActionCandidateKey('')
              }}
              onAccept={() => acceptActionCandidate(actionId, candidate)}
              onConfirm={() => acceptActionCandidate(actionId, candidate, true)}
              onCancel={() => setConfirmingActionCandidateKey('')}
            />
          })}</div> : null}
          {!actionResult.ok ? <div className="row action-controls">
            {hasSelectableCandidates ? <span className="muted">可选择上方已生成候选，或重新生成此动作。</span> : <span className="muted">没有可采用的已生成候选。</span>}
            <button className="secondary" disabled={busy || active || (!backendOwnedRun && !shellReady)} onClick={() => {
              if (!window.confirm(`重试 ${actionId} 会再次调用图片 Provider，继续吗？`)) return
              schedule(api.retryAction(currentRun.runId, actionId), `${actionId} 动作重试已提交。`)
            }}>重试动作</button>
          </div> : null}
        </article>
      })}</div>
    </section> : null}

    {qualityFirst?.phase === 'recovery-required' && currentRun?.runId ? <section className="panel recovery-panel">
      <div><span className="step-number">03</span><h2>需要恢复处理</h2><p>Backend 已在 Creator run 中保留恢复清单和生成证据。可先重试身份或动作；导入恢复包仍需桌面 Shell。</p></div>
      <button className="secondary" disabled={busy || active || (!backendOwnedRun && !shellReady)} onClick={() => schedule(api.exportRecovery(currentRun.runId), '恢复包校验任务已提交。')}>校验恢复包</button>
    </section> : null}

    {currentRun?.runId && currentRun.mode !== 'web-image' && ['review-required', 'preview-ready', 'import-failed', 'ready_for_review'].includes(String(currentRun.workflowState)) ? <section className="panel import-panel">
      <div><span className="step-number">04</span><h2>检查并导入</h2><p>导入和激活会写入桌面宠物库；继续之前请确认形象与动作质量。</p></div>
      <button className="primary" disabled={busy || active || !shellReady} onClick={() => {
        if (!window.confirm('确认将这次生成的可用动作导入并激活到桌面宠物库？')) return
        schedule(api.importActions(currentRun.runId), '导入任务已提交，等待桌面 Shell 完成操作。')
      }}>确认导入并激活</button>
    </section> : null}

    <footer className="footer-note">Provider key 和 Shell bridge token 不进入浏览器存储；Web 登录令牌只保存在当前页面内存。</footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
