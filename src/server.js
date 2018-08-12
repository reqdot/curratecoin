const express = require("express"),
    _ = require("lodash"),
    bodyParser = require("body-parser"),
    morgan = require("morgan"),
    Blockchain = require("./blockchain"),
    P2P = require("./p2p"),
    Mempool = require("./memPool"),
    Wallet = require("./wallet");

    const { getBlockchain, createNewBlock, getAccountBalance, sendTx, getUTxOutList } = Blockchain;
    const { startP2PServer, connectToPeers } = P2P;
    const { initWallet, getPublicFromWallet, getBalance } = Wallet;
    const { getMempool } = Mempool;

    const PORT = process.env.HTTP_PORT || 3000;
    
    const app = express();
    
    app.use(bodyParser.json());
    app.use(morgan("combined"));

    app
    .route("/blocks")
    .get((req, res) => {
        res.send(getBlockchain());
    })
    .post((req, res) => {
        const newBlock = createNewBlock();
        res.send(newBlock);
    });

    app.post("/peers", (req, res) => {
        const { body: { peer } } = req;
        connectToPeers(peer);
       
        // kill the connection
        res.send();
    });

    app.get("/me/balance", (req, res) => {
        const balance = getAccountBalance();
        res.send({ balance });
    });

    app.get("/me/address", (req, res) => {
        res.send(getPublicFromWallet());
    });

    app.get("/blocks/:hash", (req, res) => {
        const { params: { hash } } = req;
        const blcok = _.find(getBlockchain(), { hash });
        if(block === undefined) {
            res.status(400).send("Block not found");
        } else {
            res.send(block);
        }
    })

    app.route("/transactions")
        .get((req, res) => {
            res.send(getMempool());
        })
        .post((req, res) => {
            // sendTx에 throw Error를 하고 있으니 try-catch 사용
            try {
                const { body: { address, amount } } = req;
                if(address === undefined || amount === undefined) { 
                    throw Error("Please specify and address and an amount");
                } else {
                    const resPonse = sendTx(address, amount);
                    res.send(resPonse);
                }
            } catch(e) {
                res.status(400).send(e.message);
            }
        });

    app.get("/address/:address", (req, res) => {
        const { params: { address }} = req;
        const balance = getBalance(address, getUTxOutList());
        res.send({ balance });

    })    

    const server = app.listen(PORT, () => console.log(`curratecoin HTTP server running on ${PORT}`));

    // 서버 시작 전에 initwallet();
    initWallet();
    startP2PServer(server);
