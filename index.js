const express = require('express')
const Websocket = require('ws')
const handlerCreator = require('./src/handler')

const networks = [
  'mainnet',
  'goerli',
]

// handler functions keyed to network name
const handlers = networks.reduce((acc, network) => {
  return { ...(acc || {}), [network]: handlerCreator(network) }
})

/** http server **/
const app = express()
app.use(express.json())
app.enable('trust proxy')

app.post('/', async (req, res) => {
  const network = req.hostname.split('.').shift().toLowerCase()
  if (!handlers[network]) {
    res.status(404).json({ message: `Invalid network: ${network}`})
    return
  }
  try {
    const handler = await handlers[network]
    const data = await handler(req.body)
    res.json(data)
  } catch (err) {
    res.status(422).json({ message: err.toString() })
  }
})

app.listen(8545)

/** ws server **/
const wss = new Websocket.Server({
  port: 8546,
  perMessageDeflate: {
    zlibDeflateOptions: {
      // See zlib defaults.
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    // Other options settable:
    clientNoContextTakeover: true, // Defaults to negotiated value.
    serverNoContextTakeover: true, // Defaults to negotiated value.
    serverMaxWindowBits: 10, // Defaults to negotiated value.
    // Below options specified as default values.
    concurrencyLimit: 10, // Limits zlib concurrency for perf.
    threshold: 1024 // Size (in bytes) below which messages
    // should not be compressed.
  }
})

wss.on('connection', (ws, req) => {
  const host = req.headers['host'] || req.headers['x-forwarded-for'] || ''
  const network = host.split('.').shift().toLowerCase()
  ws.on('message', async (message) => {
    let data
    try {
      data = JSON.parse(message)
    } catch (err) {
      // dunno what to do here...
      console.log('parse error')
      return
    }
    if (!handlers[network]) {
      ws.send(JSON.stringify({
        jsonrpc: data.jsonrpc,
        id: data.id,
        message: 'Invalid network'
      }))
      return
    }
    try {
      const handler = await handlers[network]
      const res = await handler(data)
      ws.send(JSON.stringify(res))
    } catch (err) {
      console.log(err)
      ws.send(JSON.stringify({ id: data.id, jsonrpc: data.jsonrpc, err: err.toString() }))
    }
  })
})
