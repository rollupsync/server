const { addresses } = require('./config')

module.exports = {
  normalizeHash,
  normalizeNumber,
}

function normalizeNumber(num) {
  return `0x${num.toString(16)}`
}

function normalizeHash(hash) {
  return hash.toLowerCase()
}

function verifyParams(network, method, params = []) {
  if (!addresses[network]) throw new Error(`Invalid network supplied: ${network}`)
  if (!Array.isArray(params)) throw new Error('Invalid params argument')
  const legalAddresses = addresses[network]
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
