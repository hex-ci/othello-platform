/**
 * 连接注册表 + 广播抽象层（§6.1）。
 * v1 为进程内实现 InProcessBroadcaster；后续可换 Redis/NATS 而不改业务代码。
 */
import type { ClientConnection } from './connection.js'

/** 广播抽象：v1 进程内，后续可接 Redis/NATS pub/sub（§6.1 预留） */
export interface Broadcaster {
  sendToUser(userId: number, type: string, payload?: unknown): void
  sendToUsers(userIds: Iterable<number>, type: string, payload?: unknown): void
}

export class ConnectionHub implements Broadcaster {
  /** userId → 该用户的活跃连接（支持多端登录）。键归一化为 number（pg BIGINT 返回字符串，统一转换避免键类型不一致） */
  private byUser = new Map<number, Set<ClientConnection>>()

  add(conn: ClientConnection): void {
    if (conn.userId === null) return
    const key = Number(conn.userId)
    let set = this.byUser.get(key)
    if (!set) {
      set = new Set()
      this.byUser.set(key, set)
    }
    set.add(conn)
  }

  remove(conn: ClientConnection): void {
    if (conn.userId === null) return
    const key = Number(conn.userId)
    const set = this.byUser.get(key)
    if (!set) return
    set.delete(conn)
    if (set.size === 0) this.byUser.delete(key)
  }

  isOnline(userId: number): boolean {
    const set = this.byUser.get(Number(userId))
    return !!set && set.size > 0
  }

  /** 当前在线用户 id 列表 */
  onlineUserIds(): number[] {
    return [...this.byUser.keys()]
  }

  sendToUser(userId: number, type: string, payload?: unknown): void {
    const set = this.byUser.get(Number(userId))
    if (!set) return
    for (const conn of set) conn.send(type, payload)
  }

  sendToUsers(userIds: Iterable<number>, type: string, payload?: unknown): void {
    for (const id of userIds) this.sendToUser(id, type, payload)
  }

  /** 广播给所有在线连接（公共聊天，T10） */
  broadcastToAllOnline(type: string, payload?: unknown): void {
    for (const set of this.byUser.values()) {
      for (const conn of set) conn.send(type, payload)
    }
  }
}
