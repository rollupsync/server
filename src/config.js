// Make all entries in array keyed to value true in object
const objectify = (obj, key) => ({ ...obj, [key]: true })

const addressObjectify = (obj, key) => ({ ...obj, [key.toLowerCase()]: true })

const {
  MAINNET_URL,
  GOERLI_URL,
  KOVAN_URL,
} = process.env

module.exports = {
  providerUrls: {
    mainnet: MAINNET_URL,
    goerli: GOERLI_URL,
    kovan: KOVAN_URL,
  },
  addresses: {
    mainnet: [
      '0x6b175474e89094c44da98b954eedeac495271d0f', // dai
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // usdc
      '0x59bD11F8a5a833f26723D044CbB501a40C9C5E43', // fuel-js
    ].reduce(addressObjectify, {}),
    kovan: [
      '0x7c5FCcCd3C94Faf14A3a9391a7C52B734Ac9Fbd2', // fuel-js
      /** optimism kovan **/
      '0x661e90a3cd113456c1a1f09b1bd3fb5fccf496fd',
      '0xbc3d14f201194611ece12aa5567e1a950982f6a5',
      '0xa9c7b1fcbf097d1e58e06d9c4499c4ce42c88e3e',
      '0x199e3167815fd8f7776e45bc2874effa3301977b',
      '0xf226e579003311c0f7fa40e4460a76f5f08fdf82',
      /** arbitrum kovan **/
      '0xE681857DEfE8b454244e701BA63EfAa078d7eA85',
    ].reduce(addressObjectify, {}),
    ropsten: [
      '0xB6A6412290f8A0d6B2E492E47DD82D010EC85c0a', // fuel-js
    ].reduce(addressObjectify, {}),
    rinkeby: [
      '0x40e070e36c39763805e9d8e3770E8dcD146a0b5F', // fuel-js
    ].reduce(addressObjectify, {}),
    goerli: [
      '0x0000000000000000000000000000000000000000'
    ].reduce(addressObjectify, {})
  },
  methods: [
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
    'eth_sendTransaction',
    'eth_getCode',
    'eth_getBalance',
  ].reduce(objectify, {}),
}
