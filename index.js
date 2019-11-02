const { Transform, PassThrough } = require('stream')
const uuid = require('uuid/v4')

const connectionMap = new Map()
let messageId = 0

function wrapWithMessageId(message) {
  if (!this.withMessageId) return message
  return `id: ${messageId++}\n${message}`
}

/**
 * Transform stream: convert Buffer to Event stream format
 */
class BufferToSSE extends Transform {
  /**
   * @param {Object} options - Pass from SSE
   */
  constructor(options) {
    super()
    this.eventName = options.eventName
    this.processChunk = options.processChunk
    this.withMessageId = options.withMessageId
  }
  _transform(chunk, encoding, callback) {
    callback(null, wrapWithMessageId.apply(this, [`event: ${this.eventName}\ndata: ${this.processChunk(chunk)}\n\n`]))
  }
}
/**
 * Server-sent Events Wrapper
 */
class SSE {
  /**
   * @param {Function} setHeaderFunc - How to write response headers? This is relate to framework.
   * @param {Function} [genId] - How to generate sse conversation uuid? By default, it's `uuid/v4`.
   * @param {Function} [processChunk] - How to transform chunkData to sse stream? By default, just `.toString()`.
   * @param {Number} [heartBeatInterval] - Keep alive milliseconds, by default, it's 5000.
   * @param {Number} [retryTime] - Reconnect SSE interval, by default, it's 5000.
   * @param {String} [connectEventName] - Connect event name, by default, it's sse-connect.
   * @param {String} [transformEventName] - Event name for transformStream.on('data').
   * @param {Boolean} [withMessageId] - Send message with message id, by default, it's true, increase from 0.
   */
  constructor({
    setHeaderFunc = null,
    genId = () => uuid(),
    processChunk = chunk => chunk.toString(),
    heartBeatInterval = 5000,
    retryTime = 5000,
    connectEventName = 'sse-connect',
    transformEventName = 'sse-data',
    withMessageId = true
  }) {
    if (typeof setHeaderFunc !== 'function') {
      throw new TypeError('option setHeaderFunc is required')
    }

    this.setHeaderFunc = setHeaderFunc
    this.heartBeatInterval = heartBeatInterval
    this.retryTime = retryTime
    this.connectEventName = connectEventName
    this.withMessageId = withMessageId

    this.uid = genId()
    this.transformStream = new BufferToSSE({ eventName: transformEventName, processChunk, withMessageId })
    this.stream = new PassThrough()
    this.transformStream.pipe(this.stream)

    this._setup()
  }
  /**
   * Get SSE Instance by uid
   * @param {String|Number} uid - uuid
   */
  static getInstance(uid) {
    return connectionMap.get(uid)
  }
  /**
   * Send Custom Events from server
   * @param {String} event - event name
   * @param {Object|String} data - payload
   */
  send(event, data) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data)

    this.stream.write(wrapWithMessageId.apply(this, [`event: ${event}\ndata: ${payload}\n\n`]))
  }
  /**
   * Send Custom Events from stream
   * @param {ReadableStream} readable - ReadableStream, eg. fs.createReadStream
   */
  sendFromStream(readable) {
    readable.pipe(this.transformStream, { end: false })
  }
  /**
   * Prepare response headers && Start heart beat!
   */
  _setup() {
    this.setHeaderFunc({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    })
    this._writeKeepAliveStream()
    this._setRetryInterval()
    this.send(this.connectEventName, this.uid)

    const timer = setInterval(this._writeKeepAliveStream.bind(this), this.heartBeatInterval)

    this.stream.on('close', () => {
      clearInterval(timer)
      connectionMap.delete(this.uid)
      this.transformStream.destroy()
    })
    connectionMap.set(this.uid, this)
  }
  /**
   * Keep Alive
   */
  _writeKeepAliveStream() {
    this.stream.write(': \n\n')
  }
  /**
   * Set Retry Interval
   */
  _setRetryInterval() {
    this.stream.write(`retry: ${this.retryTime}\n`)
  }
}

module.exports = SSE