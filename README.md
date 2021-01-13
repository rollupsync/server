# rollup-sync

An cache system to improve rollup sync performance.

`rollup client` <--> `redis` <--> `geth`

## Usage

See the [verifiers](https://github.com/rollupsync/verifiers) repo for preconfigured rollup nodes.

## Available Endpoints

The following endpoints are available for synchronizing rollups.

### Mainnet

Urls:
- `https://mainnet.rollupsync.com`
- `wss://mainnet.rollupsync.com/ws`

Supported rollups:
- [Fuel](https://fuel.sh)

### Görli

Urls:
- `https://goerli.rollupsync.com`
- `wss://goerli.rollupsync.com/ws`

Supported rollups:

### Kovan

Urls:
- `https://kovan.rollupsync.com`
- `wss://kovan.rollupsync.com/ws`

### Testing

The current implementation supports the Optimism rollup on the kovan network. To test sync performance set the following in your Optimism verifier `docker-compose.env`:

```sh
ETH1_HTTP=http://kovan.rollupsync.com
L1_NODE_WEB3_URL=http://kovan.rollupsync.com
```

Then run the following to sync from scratch:

```sh
docker rm verifier_verifier_1
docker rm verifier_fraud_prover_1
docker volume rm verifier_verifier
```

Then start the sync with `npm start`
