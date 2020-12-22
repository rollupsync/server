const axios = require('axios')
const express = require('express')
const fs = require('fs')
const path = require('path')
const Redis = require('ioredis')

const redis = new Redis({
  host: 'redis',
  port: 6379,
  db: 0,
})

const app = express()
app.use(express.json())

// Make all entries in array keyed to value true in object
const objectify = (obj, key) => ({ ...obj, [key]: true })

const legalMethods = [
  'eth_chainId',
  'eth_syncing',
  'eth_call',
  'net_version',
  'eth_getBlockByNumber',
  'eth_getLogs',
  'eth_getTransactionByHash',
  'eth_blockNumber',
  'eth_estimateGas',
  'eth_getTransactionCount',
  'eth_gasPrice',
  'eth_sendRawTransaction',
  'eth_sendTransaction'
].reduce(objectify, {})

const legalAddresses = [
  // optimism kovan
  '0x661e90a3cd113456c1a1f09b1bd3fb5fccf496fd',
  '0xbc3d14f201194611ece12aa5567e1a950982f6a5',
  '0xa9c7b1fcbf097d1e58e06d9c4499c4ce42c88e3e',
  '0x199e3167815fd8f7776e45bc2874effa3301977b',
  '0xf226e579003311c0f7fa40e4460a76f5f08fdf82',
].reduce(objectify, {})

const logBoundsByAddress = {}

function verifyParams(method, params = []) {
  if (!Array.isArray(params)) {
    throw new Error('Invalid params argument')
  }
  if (method === 'eth_call') {
    const { to, from } = params[0]
    if (!legalAddresses[to] && !legalAddresses[from]) {
      throw new Error(`Neither ${to} or ${from} are whitelisted for ${method}`)
    }
  } else if (method === 'eth_getBlockByNumber') {
    if (params[1] === true) {
      console.log('getBlockByNumber', params)
    }
    // if (params[1] !== false) {
    //   throw new Error('Unable to retrieve full tx objects')
    // }
  } else if (method === 'eth_getLogs') {
    const { address } = params[0]
    if (!Array.isArray(address) && !legalAddresses[address]) {
      throw new Error(`Address ${address} is not whitelisted for ${method}`)
    } else {
      return
    }
    for (const addr of address) {
      if (legalAddresses[addr]) continue
      throw new Error(`Address ${addr} is not whitelisted for ${method}`)
    }
  } else if (method === 'eth_estimateGas') {
    const { from, to } = params[0]
    if (!legalAddresses[from] && !legalAddresses[to]) {
      throw new Error(`Neither ${from} or ${to} are whitelisted for ${method}`)
    }
  }
}

app.post('/', async (req, res) => {
  const { jsonrpc, method, params, id } = req.body

  if (jsonrpc !== '2.0') {
    res.status(400).json({ message: `jsonrpc version 2.0 required` })
    return
  }
  if (!legalMethods[method]) {
    res.status(405).json({ message: `Method ${method} is not allowed` })
    return
  }
  log(method, params)
  try {
    verifyParams(method, params)
  } catch (err) {
    res.status(401).json({ message: err.toString() })
    return
  }
  const gethUrl = 'https://kovan.infura.io/v3/6d3a403359fb4784b12a4cf6ed9f8ddd'

  // const { data } = await axios({
  //   method: 'post',
  //   url: gethUrl,
  //   responseType: 'stream',
  //   data: req.body,
  // })
  // data.pipe(res)
  const cachedResult = await loadCache(method, params)
  if (cachedResult) {
    console.log(`[${+new Date()}] ${method} cache hit`)
    res.json({
      id,
      jsonrpc,
      result: typeof cachedResult === 'string' ? JSON.parse(cachedResult) : cachedResult,
    })
    return
  } else {
    console.log(`[${+new Date()}] ${method} cache miss`)
  }
  const { data } = await axios.post(gethUrl, req.body)
  if (method === 'eth_getLogs') {
    console.log(method, params)
    console.log(data)
  }
  res.json(data)
  await cache(method, params, data.result)
})

async function loadCache(method, params = []) {
  switch (method) {
    case 'eth_getTransactionByHash':
      return await redis.get(`tx_${normalizeHash(params[0])}`)
    case 'eth_getBlockByNumber':
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
      const end = +toBlock
      const addresses = [address].flat()
      const promises = []
      for (const addr of addresses) {
        promises.push(loadLogBounds(addr))
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
          redis.zrange(key, start, end)
        )
      }
      const results = await Promise.all(_promises)
      const final = []
      for (const range of results) {
        for (const item of range) {
          const parsed = JSON.parse(r)
          // filter by topic here
          if (topics.length) {
            let include = false
            for (const t of topics) {
              if (parsed.topics.map(t => t.replace('0x', '').toLowerCase()).indexOf(t.toLowerCase().replace('0x', '')) !== -1) include = true
            }
            if (!include) continue
          }
          final.push(JSON.parse(r))
        }
      }
      return final
    default:
      break
  }
}

async function cache(method, params = [], result) {
  const resultString = JSON.stringify(result)
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
    case 'eth_getLogs':
      const { address, fromBlock, toBlock, topics } = params[0]
      if (!fromBlock || !toBlock) return
      const start = +fromBlock
      const end = +toBlock
      const addresses = [address].flat()

      const promises = []
      for (const logOutput of result) {
        const key = `log_${normalizeHash(logOutput.address)}`
        promises.push(redis.zadd(key, +logOutput.blockNumber, JSON.stringify(logOutput)))
      }
      await Promise.all(promises)

      for (const addr of addresses) {
        // update earliest and latest block
        const [ earliest, latest ] = await loadLogBounds(addr)
        const earlyKey = `logs_${normalizeHash(addr)}_earliest`
        const lateKey = `logs_${normalizeHash(addr)}_latest`
        const promises = []
        if (!earliest || start < +earliest) {
          // update
          promises.push(redis.set(earlyKey, normalizeNumber(start)))
          logBoundsByAddress[normalizeHash(addr)][0] = start
        }
        if (!latest || end > +latest) {
          // update
          promises.push(redis.set(lateKey, normalizeNumber(end)))
          logBoundsByAddress[normalizeHash(addr)][1] = end
        }
        await Promise.all(promises)
      }
      break
    default:
      break
  }
}

async function loadLogBounds(_addr) {
  const addr = normalizeHash(_addr)
  if (logBoundsByAddress[addr]) {
    return logBoundsByAddress[addr]
  }
  const earlyKey = `logs_${addr}_earliest`
  const lateKey = `logs_${addr}_latest`
  const results = await Promise.all([
    redis.get(earlyKey),
    redis.get(lateKey),
  ])
  if (!results[0] || !results[1]) {
    logBoundsByAddress[addr] = [0, 0]
  } else {
    logBoundsByAddress[addr] = results
  }
  return logBoundsByAddress[addr]
}

function normalizeNumber(num) {
  return `0x${num.toString(16)}`
}

function normalizeHash(hash) {
  return hash.toLowerCase()
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

app.listen(4000)
