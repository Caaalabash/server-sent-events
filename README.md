## Server-sent Events

A NodeJS wrapper for [Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

## API

### new SSE(options)

This will create an `SSE` instance

+ Properties:
  + `uid`: used for defining an unique conversation
  + `stream`: event stream, send to client directly
  + `transformStream`: extra stream, process by `processChunkFunc` function then send to `stream`
  
+ Options:
  + `genId`: Function - How to generate uid, by default, it's uuid/v4
  + `heartBeatInterval`: Number - Keep alive milliseconds, by default, it's 5000
  + `setHeaderFunc`: Function - A function that set response headers, by default, it's `noop`
  + `connectEventName`: String - Connect event name, by default, it's sse-connect
  + `transformEventName`: String - EventName for transformStream, by default, it's sse-data
  + `processChunk`: Function - A function that process `transformStream` receive data
  
+ Methods:
  + `send(event, payload)`: Send custom event to client, support string/object
  + `sendFromStream(readableStream)`: Send stream to transformStream
  + `static getInstance(uid)`: get instance by uid

## EXAMPLE

server

````
const fs = require('fs')
const path = require('path')
const SSE = require('node-sse')

module.exports = {
  /**
   * Connect with client, client will receive `sse-connect` event with payload uid
   */
  async startConnection(ctx) {
    const sse = new SSE({
      setHeaderFunc: ctx.set.bind(ctx),
      processChunkFunc: chunk => JSON.stringify({ result: chunk.toString() })
    })
    ctx.body = sse.stream
  },
  /**
   * Send file through SSE
   */
  async getLogData(ctx) {
    const { uid } = ctx.query

    const sseInstance = SSE.getInstance(uid)
    if (sseInstance) {
      sseInstance.send('reset-log', '')
      sseInstance.sendFromStream(fs.createReadStream('test.log', { highWaterMark: 1024 * 6, encoding: 'utf8' }))
    }

    return ctx.status = 200
  }
}
````

client

````
startConnect() {
  const eventSource = new EventSource('/api/sse/connect')
  // receive uid  
  eventSource.addEventListener('sse-connect', e => {
    this.uid = e.data
  })
  // receive log data
  eventSource.addEventListener('sse-data', e => {
    this.originData += JSON.parse(e.data).result
  })

  eventSource.addEventListener('reset-log', e => {
    this.originData = ''
  })
},
````