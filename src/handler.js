const Web3 = require('web3')
const Redis = require('ioredis')
const Websocket = require('ws')
const path = require('path')
const axios = require('axios')
const { providerUrls, methods } = require('./config')
const {
  verifyParams,
  normalizeHash,
  normalizeNumber,
  databaseIndex,
} = require('./utils')
const CacheWorker = require('./cache_worker')

const storageByNetwork = {}

module.exports = async (network) => {
  const provider = providerUrls[network]
  if (!provider) {
    throw new Error(`No provider found for network: ${network}`)
  }
  const web3 = new Web3(provider)
  const chainId = await web3.eth.getChainId()
  const worker = new CacheWorker(network, provider, chainId)
  storageByNetwork[network] = {
    logBoundsByAddress: {},
    latestBlock: (await web3.eth.getBlock('latest')),
    chainId,
    worker,
  }
  worker.syncContracts().catch(console.log) // asynchronously start processing

  let latestBlock = 0
  web3.eth.subscribe('newBlockHeaders', async (err, { number }) => {
    if (err) return
    if (!number) return
    latestBlock = number
    const blockPromise = web3.eth.getBlock(number)
    await Promise.race([
      new Promise(r => setTimeout(r, 500)),
      worker.syncContracts(number),
    ])
    const block = await blockPromise
    if (latestBlock !== number) return // in case two blocks arrive quickly
    storageByNetwork[network].latestBlock = block
  })

  const redis = new Redis({
    host: 'redis',
    port: 6379,
    db: databaseIndex(chainId),
  })

  /** request handler **/
  return async (info = {}, skipCache = false) => {
    const { jsonrpc, method, params, id } = info

    if (jsonrpc !== '2.0') {
      throw new Error('jsonrpc version 2.0 required')
    }
    if (!methods[method]) {
      throw new Error(`Method ${method} is not allowed`)
    }
    if (!skipCache) {
      try {
        verifyParams(network, method, params)
      } catch (err) {
        throw new Error(err.toString())
      }

      const cachedResult = await loadCache(network, redis, method, params)
      if (cachedResult) {
        console.log(`[${+new Date()}] ${method} cache hit`)
        return {
          id,
          jsonrpc,
          result: typeof cachedResult === 'string' ? tryJSONParse(cachedResult) : cachedResult,
        }
      } else {
        if (method === 'eth_getBlockByNumber') {
          console.log(method, params)
        }
        console.log(`[${+new Date()}] ${method} cache miss`)
      }
    }
    const data = await proxyReq(provider, info)
    cache(network, redis, method, params, data.result).catch(console.log)
    return data
  }
}

async function proxyReq(url, data) {
  if (url.indexOf('http') === 0 || url.indexOf('https') === 0) {
    // use axios
    const { data: _data } = await axios({
      method: 'post',
      url,
      data,
    })
    return _data
  } else if (url.indexOf('ws') === 0 || url.indexOf('wss') === 0) {
    // use ws
    return await new Promise((rs, rj) => {
      const ws = new Websocket(url)
      const timer = setTimeout(() => {
        rj(new Error('Socket timeout'))
        ws.close()
      }, 10000)
      ws.on('open', () => {
        ws.send(JSON.stringify(data))
      })
      ws.on('message', (_data) => {
        rs(JSON.parse(_data))
        clearInterval(timer)
        ws.close()
      })
    })
  }
  throw new Error(`Invalid url: "${url}"`)
}

function tryJSONParse(data) {
  try {
    return JSON.parse(data)
  } catch (e) {
    return data
  }
}

async function loadCache(network, redis, method, params = []) {
  const { latestBlock } = storageByNetwork[network]
  switch (method) {
    case 'eth_chainId':
      return storageByNetwork[network].chainId
    case 'eth_blockNumber':
      return normalizeNumber(latestBlock.number)
    case 'eth_getTransactionByHash':
      return await redis.get(`tx_${normalizeHash(params[0])}`)
    case 'eth_getBlockByNumber':
      if (params[0] === 'latest' && params[1] === false && latestBlock) {
        return latestBlock
      }
      if (isNaN(params[0])) return
      if (params[1]) {
        return await redis.get(`block_${normalizeNumber(params[0])}_full`)
      } else {
        return await redis.get(`block_${normalizeNumber(params[0])}`)
      }
      break
    case 'eth_getLogs':
      const { address, fromBlock, toBlock, topics } = params[0]
      if (!fromBlock || !toBlock) return
      const start = +fromBlock
      const end = toBlock === 'latest' || toBlock > +latestBlock.number ? +latestBlock.number : +toBlock
      const addresses = [address].flat()
      const promises = []
      for (const addr of addresses) {
        promises.push(Promise.all([
          storageByNetwork[network].worker.earliestLog(addr),
          storageByNetwork[network].worker.latestLog(addr),
        ]))
      }
      const ranges = await Promise.all(promises)
      for (const [ earliest, latest ] of ranges) {
        if (!earliest || +earliest > start) return
        if (!latest || +latest < end) return
      }
      const _promises = []
      for (const addr of addresses) {
        const key = `log_${normalizeHash(addr)}`
        _promises.push(
          redis.zrangebyscore(key, start, end)
        )
      }
      const results = await Promise.all(_promises)
      const final = []
      for (const range of results) {
        for (const item of range) {
          const parsed = JSON.parse(item)
          // filter by topic here
          if (!topicMatch(parsed, topics)) continue
          final.push(parsed)
        }
      }
      return final
    default:
      break
  }
}

function topicMatch(_event, topics) {
  if (!topics) return true // no filter so match anything
  for (const [index, topic] of Object.entries(topics)) {
    if (topic === null) continue // match anything
    let foundMatch = false
    for (const t of [topic].flat()) {
      if (normalizeHash(_event.topics[index]) === normalizeHash(t)) {
        foundMatch = true
        break
      }
    }
    if (!foundMatch) return false
  }
  return true
}

async function cache(network, redis, method, params = [], result) {
  const resultString = JSON.stringify(result)
  const { latestBlock } = storageByNetwork[network]
  switch (method) {
    case 'eth_getTransactionByHash':
      await redis.set(`tx_${normalizeHash(params[0])}`, resultString)
      break
    case 'eth_getBlockByNumber':
      if (isNaN(params[0])) break
      if (params[1]) {
        await redis.set(`block_${normalizeNumber(params[0])}_full`, resultString)
      } else {
        await redis.set(`block_${normalizeNumber(params[0])}`, resultString)
      }
      break
    default:
      break
  }
}

const logPath = path.join(__dirname, 'requests.log')
let logPromise = Promise.resolve()
function log(method, params = []) {
  logPromise = logPromise.then(() => new Promise((rs, rj) => {
    fs.appendFile(logPath, `method: ${method}; args: ${JSON.stringify(params)}\n`, (err) => {
      if (err) rj(err)
      else rs()
    })
  }))
}
