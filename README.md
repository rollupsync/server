# rollup-sync

An intermediary server to improve rollup sync performance.

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
