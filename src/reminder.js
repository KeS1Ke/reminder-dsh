import { createUserMessage } from '@deepseek-ai/dsh-llm/message'

/** Register live events only: restored history and initially idle agents do not notify. */
export function attachReminder(ctx, notify, reportError) {
  const activities = new WeakMap()
  const closedAgents = new WeakSet()
  const notifications = new Map()
  let disposed = false
  const isMain = session => session.header.origin !== 'subagent'
    && !(session.header.delegationDepth > 0)

  ctx.on('agent/status', ({ agent, status }) => {
    const session = agent.session
    if (disposed || !isMain(session)) return
    if (status === 'running') {
      if (!activities.has(session)) activities.set(session, { completed: false, text: '' })
      return
    }
    if (status !== 'idle') return
    const activity = activities.get(session)
    activities.delete(session)
    if (!activity?.completed) return
    const controller = new AbortController()
    const pending = notifications.get(agent) ?? new Set()
    pending.add(controller)
    notifications.set(agent, pending)
    // Consume before launching the subprocess so repeated idle events cannot duplicate it.
    try {
      Promise.resolve(notify({
        sessionId: session.id, completedText: activity.text,
        route: agent.model?.current(), signal: controller.signal,
        onReply(text) {
          if (disposed || closedAgents.has(agent) || agent.session !== session) {
            throw new Error('原会话已关闭或切换，请回到 DSH 回复。')
          }
          return agent.followup(createUserMessage({
            content: [{ type: 'text', text }], source: { kind: 'user' },
          }))
        },
      })).catch(error => {
        if (!disposed && !controller.signal.aborted) reportError(error)
      }).finally(() => {
        pending.delete(controller)
        if (!pending.size) notifications.delete(agent)
      })
    } catch (error) {
      pending.delete(controller)
      if (!pending.size) notifications.delete(agent)
      reportError(error)
    }
  })

  ctx.on('session/event', (session, event) => {
    if (disposed) return
    const activity = activities.get(session)
    if (!activity) return
    if (event.type === 'turn/start') {
      activity.completed = false
      activity.text = ''
    }
    if (event.type === 'assistant/message') {
      const content = event.data.message.content
      // Keep only the final, uninterrupted user-visible answer; never reasoning/tool payloads.
      activity.text = event.data.interrupted || content.some(block => block.type === 'tool-call')
        ? '' : content.filter(block => block.type === 'text').map(block => block.text).join('\n')
    }
    if (event.type === 'turn/end') activity.completed = event.data.reason.kind === 'completed'
  })
  ctx.on('agent/error', ({ agent }) => activities.delete(agent.session))
  ctx.on('agent/disposed', ({ agent }) => {
    activities.delete(agent.session)
    closedAgents.add(agent)
    for (const controller of notifications.get(agent) ?? []) controller.abort()
    notifications.delete(agent)
  })
  ctx.effect(() => () => {
    disposed = true
    for (const pending of notifications.values()) for (const controller of pending) controller.abort()
    notifications.clear()
  })
}
