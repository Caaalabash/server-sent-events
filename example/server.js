const http = require('http')
const fs = require('fs')
const url = require('url')
const SSE = require('../index')

http.createServer((req, res) => {
  if (req.url === '/connect') {
    const lastEventId = Number(req.headers['last-event-id']) || 0
    const sse = new SSE({
      setHeaderFunc: headers => res.writeHead(200, headers),
      lastEventId
    })
    let i = 0
    setInterval(() => {
      sse.send('sse-test', String(++i))
    }, 3000)
    sse.stream.pipe(res)
  } else if (req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.write(fs.readFileSync(__dirname + req.url))
    res.end()
  }
}).listen(8080)