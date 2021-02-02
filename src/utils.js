const { addresses } = require('./config')

module.exports = {
  normalizeHash,
  normalizeNumber,
  verifyParams,
  databaseIndex,
}

function normalizeNumber(num) {
  return `0x${num.toString(16)}`
}

function normalizeHash(hash) {
  if (!hash) return
  return `0x${hash.replace('0x', '').toLowerCase()}`
}

function verifyParams(network, method, params = []) {
  if (!addresses[network]) throw new Error(`Invalid network supplied: ${network}`)
  if (!Array.isArray(params)) throw new Error('Invalid params argument')
  const legalAddresses = addresses[network]
  if (method === 'eth_call') {
    const { to, from } = params[0]
    if (!legalAddresses[normalizeHash(to)] && !legalAddresses[normalizeHash(from)]) {
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
    if (!Array.isArray(address) && !legalAddresses[normalizeHash(address)]) {
      throw new Error(`Address ${address} is not whitelisted for ${method}`)
    } else {
      return
    }
    for (const addr of address) {
      if (legalAddresses[normalizeHash(addr)]) continue
      throw new Error(`Address ${addr} is not whitelisted for ${method}`)
    }
  } else if (method === 'eth_estimateGas') {
    const { from, to } = params[0]
    if (!legalAddresses[normalizeHash(from)] && !legalAddresses[normalizeHash(to)]) {
      throw new Error(`Neither ${from} or ${to} are whitelisted for ${method}`)
    }
  }
}

function databaseIndex(chainId) {
  const chainNum = (+normalizeNumber(chainId)).toString(10)
  const databaseIndex = {
    '1': 1,
    '3': 2,
    '4': 3,
    '5': 4,
    '42': 5,
  }
  if (isNaN(databaseIndex[chainNum])) {
    throw new Error(`Database improperly configured for network ${network}`)
  }
  return databaseIndex[chainNum]
}
