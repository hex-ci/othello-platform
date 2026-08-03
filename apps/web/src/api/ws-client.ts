/**
 * WebSocket 客户端（T06）。
 * 首帧 auth 鉴权（令牌不走 URL，§4.3）；统一信封 { type, payload, ts }；
 * 自动 ping 心跳；类型化事件订阅。
 */
import type { ErrorCode } from '@othello-platform/shared'

type Handler = (payload: unknown) => void

export interface WsClientOptions {
  onStatus?: (status: 'connecting' | 'open' | 'closed') => void
  onError?: (code: ErrorCode, msg: string) => void
}

const PING_INTERVAL_MS = 20_000

/** 内部事件：断线后成功重连（供 store 补发 reconnect，T13） */
export const WS_RECONNECT_EVENT = '__ws_reconnected__'

export class WsClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<Handler>>()
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private closedByUser = false
  /** 鉴权失败（JWT 失效）：停止自动重连，清 token 跳 login */
  private authFailed = false
  /** 是否已成功连接过（用于区分首连与断线重连） */
  private hasOpenedOnce = false
  /** 连接建立前的待发消息队列（避免早期 send 丢失） */
  private outbox: { type: string, payload?: unknown }[] = []

  constructor(private readonly opts: WsClientOptions = {}) {}

  connect(): void {
    // 幂等：已连接/连接中则跳过
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }
    const token = localStorage.getItem('token')
    if (!token) {
      this.opts.onError?.('AUTH_REQUIRED', '缺少登录令牌')
      return
    }

    this.closedByUser = false
    // 每次新连接重置鉴权失败标记（用户重新登录后允许重连）
    this.authFailed = false
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    this.opts.onStatus?.('connecting')
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    this.ws = ws

    ws.onopen = () => {
      const isReconnect = this.hasOpenedOnce
      this.hasOpenedOnce = true
      // 首帧 auth
      this.rawSend('auth', { token })
      this.flushOutbox()
      this.opts.onStatus?.('open')
      this.startPing()
      // 断线重连：派发内部事件，供 store 补发 reconnect（T13）
      if (isReconnect) {
        const set = this.handlers.get(WS_RECONNECT_EVENT)
        if (set) for (const h of set) h(undefined)
      }
    }

    ws.onmessage = (event) => {
      let msg: { type?: string, payload?: unknown }
      try {
        msg = JSON.parse(event.data as string) as { type?: string, payload?: unknown }
      }
      catch {
        return
      }
      if (!msg.type) return
      if (msg.type === 'error') {
        const p = msg.payload as { code: ErrorCode, msg: string }
        this.opts.onError?.(p.code, p.msg)
        // 鉴权失败统一处理：清 token + 标记 + 跳登录页（toast 在 login 页落地，避免整页跳转销毁）
        if (p.code === 'INVALID_TOKEN' || p.code === 'AUTH_REQUIRED') {
          this.authFailed = true
          localStorage.removeItem('token')
          localStorage.removeItem('refreshToken')
          sessionStorage.setItem('auth_expired', p.msg ?? '登录已失效，请重新登录')
          // 仅在非登录页时跳转，避免循环
          if (!location.pathname.startsWith('/login')) {
            const redirect = encodeURIComponent(location.pathname + location.search)
            location.replace(`/login?redirect=${redirect}`)
          }
        }
      }
      const set = this.handlers.get(msg.type)
      if (set) for (const h of set) h(msg.payload)
    }

    ws.onclose = () => {
      this.stopPing()
      this.opts.onStatus?.('closed')
      // 非主动关闭且非鉴权失败则 3s 后自动重连（鉴权失败已跳登录页，不再死循环重连）
      if (!this.closedByUser && !this.authFailed) {
        setTimeout(() => this.connect(), 3_000)
      }
    }
  }

  on(type: string, handler: Handler): () => void {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler)
    return () => set?.delete(handler)
  }

  send(type: string, payload?: unknown): void {
    // 连接未就绪时入队，待 onopen 后 flush（避免早期 send 丢失）
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.rawSend(type, payload)
    }
    else {
      this.outbox.push({ type, payload })
    }
  }

  private flushOutbox(): void {
    for (const msg of this.outbox) this.rawSend(msg.type, msg.payload)
    this.outbox = []
  }

  private rawSend(type: string, payload?: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload, ts: Date.now() }))
    }
  }

  private startPing(): void {
    this.stopPing()
    this.pingTimer = setInterval(() => this.rawSend('ping'), PING_INTERVAL_MS)
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  close(): void {
    this.closedByUser = true
    this.stopPing()
    this.ws?.close()
    this.ws = null
  }
}

/** 全局单例（登录后建立） */
let sharedClient: WsClient | null = null

export function getWsClient(opts?: WsClientOptions): WsClient {
  if (!sharedClient) sharedClient = new WsClient(opts)
  return sharedClient
}

export function closeWsClient(): void {
  sharedClient?.close()
  sharedClient = null
}
