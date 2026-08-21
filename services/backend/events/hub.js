import {
	EVENT_NAMES,
	EVENT_SYSTEM_EVENTS_DROPPED,
	EVENT_TOPIC,
	SSE_BUFFER_MAX_FRAMES,
	SSE_HEARTBEAT_MS,
	SSE_TOPICS,
} from "@openpet/contracts"

export const HEARTBEAT_MS = SSE_HEARTBEAT_MS
export const CLIENT_STALE_MS = 45_000
export const MAX_BUFFERED_FRAMES = SSE_BUFFER_MAX_FRAMES

const EVENT_NAME_SET = new Set(EVENT_NAMES)
const TOPIC_SET = new Set(SSE_TOPICS)

function frame(id, name, payload) {
	return `id: ${id}\nevent: ${name}\ndata: ${JSON.stringify(payload ?? null)}\n\n`
}

function validateTopics(topics) {
	const values = topics === undefined ? [...SSE_TOPICS] : [...topics]
	for (const topic of values) {
		if (!TOPIC_SET.has(topic)) throw new TypeError(`未知 SSE topic: ${topic}`)
	}
	return new Set(values)
}

export function createEventHub({ logger, now = () => Date.now(), heartbeatMs = HEARTBEAT_MS } = {}) {
	let nextId = 1
	const clients = new Set()

	function write(client, value) {
		if (client.closed) return true
		try {
			const accepted = client.sink.write(value)
			client.lastFrameAt = now()
			if (accepted !== false) return true
			client.paused = true
			if (typeof client.sink.once === "function") client.sink.once("drain", () => flush(client))
			return false
		} catch (error) {
			logger?.warn?.("SSE 客户端写入失败", { error: String(error) })
			close(client)
			return false
		}
	}

	function flush(client) {
		if (client.closed || client.paused) return
		while (client.queue.length > 0 && !client.paused && !client.closed) {
			const item = client.queue.shift()
			write(client, item.text)
		}
	}

	function enqueue(client, item) {
		if (client.closed) return
		client.queue.push(item)
		if (client.queue.length > MAX_BUFFERED_FRAMES) {
			const index = client.queue.findIndex((entry) => entry.name === "log.appended")
			if (index >= 0) client.queue.splice(index, 1)
			else client.queue.shift()
			client.dropped += 1
			reportDrops(client)
		}
		flush(client)
	}

	function publish(name, payload) {
		if (!EVENT_NAME_SET.has(name)) throw new TypeError(`未知 SSE event: ${name}`)
		const topic = EVENT_TOPIC[name]
		const item = { id: nextId++, name, topic, text: frame(nextId - 1, name, payload) }
		for (const client of clients) {
			if (!client.topics.has(topic) && topic !== "system") continue
			enqueue(client, item)
		}
		return item.id
	}

	function reportDrops(client) {
		if (client.dropped === 0 || client.closed) return
		const dropped = client.dropped
		client.dropped = 0
		const item = {
			id: nextId++,
			name: EVENT_SYSTEM_EVENTS_DROPPED,
			topic: "system",
			text: frame(nextId - 1, EVENT_SYSTEM_EVENTS_DROPPED, {
				topic: "logs",
				dropped,
				since: new Date(now()).toISOString(),
			}),
		}
		client.queue.push(item)
		if (client.queue.length > MAX_BUFFERED_FRAMES) client.queue.shift()
		flush(client)
	}

	function subscribe({ topics, sink } = {}) {
		if (!sink || typeof sink.write !== "function") throw new TypeError("SSE subscribe 需要 sink.write")
		const client = {
			topics: validateTopics(topics),
			sink,
			queue: [],
			dropped: 0,
			paused: false,
			closed: false,
			lastFrameAt: now(),
			heartbeat: null,
		}
		client.heartbeat = setInterval(() => {
			if (client.closed) return
			write(client, ": ping\n\n")
			reportDrops(client)
		}, heartbeatMs)
		client.heartbeat?.unref?.()
		clients.add(client)
		return {
			unsubscribe: () => close(client),
			stats: () => ({ queued: client.queue.length, dropped: client.dropped, lastFrameAt: client.lastFrameAt }),
		}
	}

	function close(client) {
		if (!client || client.closed) return
		client.closed = true
		clearInterval(client.heartbeat)
		clients.delete(client)
		try {
			client.sink.end?.()
		} catch {
			// 客户端已经断开。
		}
	}

	function closeAll() {
		for (const client of [...clients]) close(client)
	}

	return {
		subscribe,
		publish,
		stats: () => ({ clients: clients.size, nextId }),
		closeAll,
	}
}
