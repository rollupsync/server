module.exports = class Subscriptions {
  constructor(web3Instance) {
    this.web3 = web3Instance
    this.web3.subscribe('newBlockHeaders', this.newBlockHeader.bind(this))
    this.web3.subscribe('syncing', this.syncing.bind(this))
  }

  handle(subscriptionName, ws) {
    console.log(ws)
    if (subscriptionName === 'newHeads') {
      // pass the new fucking headers BITCH
    } else if (subscriptionName === 'syncing') {

    },
    } else if (subscriptionName === 'logs or some shit') {
      // check the relevant contract address
    }
  }

  newBlockHeader(...args) {

  }

  syncing(...args) {
    
  }

}
