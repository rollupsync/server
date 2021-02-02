const Redis = require('ioredis')
const Web3 = require('web3')
const { contracts, providerUrls } = require('./config')
const {
  verifyParams,
  normalizeHash,
  normalizeNumber,
  databaseIndex,
} = require('./utils')

// Primarily used for synchronizing event logs for a contract
module.exports = class CacheWorker {
  constructor(network, providerUrl, chainId) {
    if (!providerUrl) {
      console.log(`Error: no provider url for network ${network}`)
      process.exit(1)
    }
    const networkContracts = contracts[network]
    if (!networkContracts) {
      console.log(`Error: no contracts for network ${network}`)
      process.exit(1)
    }
    this.network = network
    this.chainId = chainId
    this.providerUrl = providerUrl
    this.networkContracts = networkContracts
    this.scanning = false
    this.scanQueued = false
    this.web3 = new Web3(this.providerUrl)
    // const chainId = await this.web3.eth.getChainId()
    this.redis = new Redis({
      host: 'redis',
      port: 6379,
      db: databaseIndex(chainId),
    })
  }

  async syncContracts(blockNumber) {
    if (this.scanning) {
      this.scanQueued = true
      return
    }
    this.scanning = true
    const promises = []
    const latestBlock = blockNumber || (await this.web3.eth.getBlockNumber())
    for (const { address } of this.networkContracts) {
      promises.push(this._scan(address, +latestBlock))
    }
    try {
      await Promise.all(promises)
    } catch (err) {
      console.log(`Error scanning ${this.network} contracts`)
    }
    this.scanning = false
    if (this.scanQueued) {
      this.scanQueued = false
      await this.syncContracts()
    }
  }

  async _scan(address, finalBlock) {
    const [
      earliestLogBlock,
      latestLogBlock,
    ] = await Promise.all([
      this.earliestLog(address),
      this.latestLog(address),
    ])
    const { genesisBlock } = this.networkContracts
      .find(({ address: _address }) => normalizeHash(_address) === normalizeHash(address))
    if (!genesisBlock) {
      throw new Error(`No genesis block specified for contract ${address} in network ${this.network}`)
    }
    if (+earliestLogBlock < genesisBlock) {
      await this.updateEarliestLog(address, genesisBlock)
    }
    const startBlock = Math.max(genesisBlock, +latestLogBlock)
    if (startBlock === +latestLogBlock && finalBlock === +latestLogBlock) return
    let offset = 0
    let batchCount = 1000
    for (;;) {
      const fromBlock = startBlock + offset
      const toBlock = Math.min(startBlock + offset + batchCount, finalBlock)
      console.log(`Loading blocks ${fromBlock} to ${toBlock}`)
      const logs = await this.web3.eth.getPastLogs({
        address,
        toBlock,
        fromBlock,
      })
      for (const log of logs) {
        // shouldn't get any pending events but just in case
        if (log.blockNumber === null) continue
        const key = `log_${normalizeHash(log.address)}`
        await this.redis.zadd(key, +log.blockNumber, JSON.stringify(log))
      }
      await this.updateLatestLog(address, toBlock)
      if (toBlock >= finalBlock) break
      offset += batchCount + 1
    }
  }

  // Return the block number of the earliest scanned block logs for an address
  async earliestLog(address) {
    const earlyKey = `logs_${normalizeHash(address)}_earliest`
    const result = await this.redis.get(earlyKey)
    return result || 0
  }

  // Return the block number of the latest scanned block logs for an address
  async latestLog(address) {
    const lateKey = `logs_${normalizeHash(address)}_latest`
    const result = await this.redis.get(lateKey)
    return result || 0
  }

  async updateEarliestLog(address, blockNumber) {
    const earlyKey = `logs_${normalizeHash(address)}_earliest`
    this.redis.set(earlyKey, normalizeNumber(blockNumber))
  }

  async updateLatestLog(address, blockNumber) {
    const lateKey = `logs_${normalizeHash(address)}_latest`
    this.redis.set(lateKey, normalizeNumber(blockNumber))
  }
}
