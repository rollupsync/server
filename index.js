const axios = require('axios')
const express = require('express')
const fs = require('fs')
const path = require('path')

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
].reduce(objectify, {})

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
    console.log(jsonrpc)
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

  const { data } = await axios({
    method: 'post',
    url: gethUrl,
    responseType: 'stream',
    data: req.body,
  })
  data.pipe(res)
})

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
