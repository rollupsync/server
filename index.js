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
].reduce(objectify, {})

app.post('/', async (req, res) => {
  const { jsonrpc, method, params, id } = req.body

  if (jsonrpc !== '2.0') {
    console.log(jsonrpc)
    res.status(400).json({ message: `jsonrpc version 2.0 required` })
    return
  }
  // if (!legalMethods[method]) {
  //   res.status(405).json({ message: `Method ${method} is not allowed` })
  //   return
  // }
  log(method, params)

  const gethUrl = 'https://kovan.infura.io/v3/6d3a403359fb4784b12a4cf6ed9f8ddd'

  const { data, ...o } = await axios.post(gethUrl, req.body)
  console.log(data, o)
  res.json(data)
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
