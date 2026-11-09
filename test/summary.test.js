import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeCompletion, excerpt } from '../src/modules/popup/summary.js'

const config = { summaryMaxChars: 180, summaryTimeoutSeconds: 2, message: '任务已结束。' }
const completion = () => ({
  completedText: '已添加快速回复输入框，关闭在左、发送在右。32 项测试通过，Windows 界面尚未实测。',
  route: { provider: 'deepseek', model: 'deepseek-chat' },
  signal: new AbortController().signal, sessionId: 'original-session',
})
function model(chunks, inspect = () => {}) {
  return { prepareCall: async (route, signal) => ({
    config: route,
    stream: async function* (options) {
      inspect(route, options, signal)
      yield* chunks
    },
  }) }
}

test('uses the session model for an auxiliary summary, keeping failure caveats in the prompt', async () => {
  const errors = [], data = completion()
  const llm = model([
    { type: 'reasoning-delta', text: 'private reasoning' },
    { type: 'text-delta', text: '已完成快速回复；测试通过，Windows 界面待验证。' },
    { type: 'finish', reason: { kind: 'stop' } },
  ], (route, options, signal) => {
    assert.equal(route.model, data.route.model)
    assert.equal(route.maxTokens, 512)
    assert.equal(options.purpose, 'reminder-dsh-summary')
    assert.equal(options.sessionId, 'original-session')
    assert.equal(options.signal, signal)
    assert.equal(JSON.parse(options.messages[0].content[0].text).finalAssistantReply, data.completedText)
    assert.match(options.system, /保留关键失败、未完成事项/)
    assert.equal(options.tools, undefined)
  })
  const text = await summarizeCompletion(llm, config, data, error => errors.push(error))
  assert.equal(text, '已完成快速回复；测试通过，Windows 界面待验证。')
  assert.deepEqual(errors, [])
})

test('summary failure clearly labels a final-answer excerpt instead', async () => {
  const errors = []
  const llm = model([{ type: 'finish', reason: { kind: 'error' } }])
  const text = await summarizeCompletion(llm, config, completion(), error => errors.push(error))
  assert.match(text, /^AI 总结暂不可用。上一轮最终回复摘录：/)
  assert.match(text, /Windows 界面尚未实测/)
  assert.equal(errors.length, 1)
})

test('missing final answer never fabricates a task summary or calls the model', async () => {
  const text = await summarizeCompletion({}, config, { ...completion(), completedText: '' }, () => {})
  assert.match(text, /没有可供总结的最终文字回复/)
})

test('timeout aborts model work and still returns a notification excerpt', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let signal
  const llm = { prepareCall: async (_route, value) => { signal = value; return new Promise(() => {}) } }
  const pending = summarizeCompletion(llm, config, completion(), () => {})
  t.mock.timers.tick(2000)
  assert.match(await pending, /AI 总结暂不可用/)
  assert.equal(signal.aborted, true)
})

test('session disposal cancels summary without returning a stale notification', async () => {
  const controller = new AbortController()
  const llm = { prepareCall: async () => new Promise(() => {}) }
  const pending = summarizeCompletion(llm, config, { ...completion(), signal: controller.signal }, () => {})
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
})

test('output limits preserve Unicode characters', () => {
  assert.equal(excerpt('🐳🐳🐳🐳', 3), '🐳🐳…')
})
