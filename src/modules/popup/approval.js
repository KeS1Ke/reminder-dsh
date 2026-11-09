import { excerpt } from './summary.js'

/** Share the exact pending Remote event with DSH's existing approval card. */
export function attachApprovalNotifications(ctx, notify) {
  const { approval, typertGateway: gateway } = ctx
  const logger = ctx.logger('reminder-approval')
  // The gateway's public pending-event list omits request identity and cannot settle events.
  if (!(gateway.pendingRemoteEvents instanceof Map) || typeof gateway.settleRemoteEvent !== 'function') {
    logger.warn('当前 DSH 版本无法将审批请求接入 Windows 通知。')
    return
  }
  const lifetime = new AbortController()
  const requests = new WeakMap()
  ctx.effect(() => () => lifetime.abort())
  ctx.on('approval/request', (request, next) => {
    const previous = requests.get(request)
    if (previous) {
      // Reusing a request object would make its pending event ambiguous.
      previous.abort()
      return next()
    }
    const session = request.agent.session
    const pending = new AbortController()
    requests.set(request, pending)
    const decision = next()
    const signal = AbortSignal.any([lifetime.signal, pending.signal, ...(request.signal ? [request.signal] : [])])
    const finish = () => pending.abort()
    void Promise.resolve(decision).then(finish, finish)

    // Forwarding to the gateway runs asynchronously. Leave DSH's answerer in charge of the request.
    setImmediate(() => {
      if (signal.aborted) return
      const event = [...gateway.pendingRemoteEvents.values()].find(item =>
        item.frame?.event === 'approval/request' && item.source?.request === request && item.source.context?.subject === request.agent)
      if (!event) return
      const description = request.reason
      const message = typeof description === 'string' && description.trim()
        ? excerpt(description, 220) : '点击通知查看请求详情。'
      void Promise.resolve().then(() => notify({
        sessionId: session.id,
        title: `需要审批 · ${excerpt(request.toolName, 64)}`,
        message, signal,
        onDecision(outcome) {
          if (signal.aborted || request.agent.session !== session || approval.effectivePolicy(session) !== 'ask'
            || gateway.pendingRemoteEvents.get(event.id) !== event
            || (outcome !== 'allowed-once' && outcome !== 'rejected')) {
            throw new Error('审批请求已失效，请回到 DSH 查看。')
          }
          gateway.settleRemoteEvent(event, { kind: 'result', value: outcome })
        },
      })).catch(error => {
        if (!signal.aborted) logger.warn(`审批通知失败：${error instanceof Error ? error.message : String(error)}`)
      })
    })
    return decision
  }, { prepend: true })
}
