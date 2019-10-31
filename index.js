const { PassThrough } = require('stream')
const uuid = require('uuid/v4')

const connectionMap = new Map()

/**
 * Transform stream: convert Buffer to Event stream format
 */
class BufferToSSE extends PassThrough {
  /**
   * @param {String} eventName - Event name for transformStream.on('data')
   * @param {Function} processChunk - A function to process chunk
   */
  constructor({ eventName, processChunk }) {
    super()
    this.eventName = eventName
    this.processChunk = processChunk
  }
  _transform(chunk, encoding, callback) {
    callback(null, `event: ${this.eventName}\ndata: ${this.processChunk(chunk)}\n\n`)
  }
}

/**
 * Server-sent Events Wrapper
 */
class SSE {
  /**
   * @param {Function} genId - A function that generate uuid, by default, it's uuid/v4
   * @param {Number} heartBeatInterval - Keep alive milliseconds, by default, it's 5000
   * @param {Function} setHeaderFunc - A function that set response headers, by default, it's noop
   * @param {String} connectEventName - Connect event name, by default, it's sse-connect
   * @param {String} transformEventName - Event name for transformStream.on('data')
   * @param {Function} processChunk - A function to process chunk
   */
  constructor({
    genId = () => uuid(),
    heartBeatInterval = 5000,
    setHeaderFunc = () => {},
    processChunk = chunk => chunk.toString(),
    connectEventName = 'sse-connect',
    transformEventName = 'sse-data'
  }) {
    this.uid = genId()
    this.heartBeatInterval = heartBeatInterval
    this.setHeaderFunc = setHeaderFunc
    this.connectEventName = connectEventName

    this.transformStream = new BufferToSSE({ eventName: transformEventName, processChunk })
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

    this.stream.write(`event: ${event}\ndata: ${payload}\n\n`)
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
    this.send(this.connectEventName, this.uid)
    this._writeKeepAliveStream()
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
}

module.exports = SSE