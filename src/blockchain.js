const CryptoJS = require("crypto-js"),
    _  = require("lodash"),
    Wallet = require("./wallet"),
    Mempool = require("./memPool"),
    Transactions = require("./transactions"),
    hexToBinrary = require("hex-to-binary");
    
const { getBalance, getPublicFromWallet, createTx, getPrivateFromWallet } = Wallet;  

const { createCoinbaseTx, processTxs } = Transactions;

const { addToMempool, getMempool, updateMempool } = Mempool;

const BLOCK_GENERATION_INTERVAL = 10;
const DIFFICULTY_ADJUSTMENT_INTERVAL = 10;

class Block {
    constructor(index, hash, previousHash, timestamp, data, difficulty, nonce){
        this.index = index;
        this.hash = hash;
        this.previousHash = previousHash;
        this.timestamp = timestamp;
        this.data = data;
        this.difficulty = difficulty;
        this.nonce = nonce;
    }
}

const genesisTx = {
    txIns: [{ signature: "", txOutId: "", txOutIndex: 0 }],
    txOuts: [
      {
        address:
          "043fdd20b80b8836486c4f76f8a918d256c3dea5d8e7e1029241e12ce30b7aeb09a25e172785179ca67f42e1c220bdb4019f3fff14f80802d36eb7582664377753",
        amount: 50
      }
    ],
    id: "f312b4c81ff186fa1954d4e1a86f9e9fbb96b714bfe0d932984b8621a51a6340"
  };

const genesisBlock = new Block(
    0,
    "94f19aecd33c282d99d6a1c0c09421fb2dd0a71aa2509cfd4f191cc897656cf0",
    "",
    1533629395,
    [genesisTx],
    0,
    0
);

let blockchain = [genesisBlock];

let uTxOuts = processTxs(blockchain[0].data, [], 0);

const getNewestBlock = () => blockchain[blockchain.length - 1];

const getTimestamp = () => Math.round(new Date().getTime() / 1000);

const getBlockchain = () => blockchain;

const createHash = (index, previousHash, timestamp, data, difficulty, nonce) => 
CryptoJS.SHA256(
    index + previousHash + timestamp + JSON.stringify(data) + difficulty + nonce
).toString();


const createNewBlock = () => {
    const coinbaseTx = createCoinbaseTx(
        getPublicFromWallet(),
        getNewestBlock().index+1
    );
    const blockData = [coinbaseTx].concat(getMempool());
    return createNewRawBlock(blockData);
};

const createNewRawBlock = data => {
    const previousBlock = getNewestBlock();
    const newBlockIndex = previousBlock.index+1;
    const newTimestamp = getTimestamp();
    const difficulty = findDifficulty();
    const newBlock = findBlock(
        newBlockIndex,
        previousBlock.hash,
        newTimestamp,
        data,
        difficulty
    );
    addBlockToChain(newBlock);
    require("./p2p").broadcastNewBlock();
    return newBlock;

};

const findDifficulty = () => {
    const newestBlock = getNewestBlock();
    if(newestBlock.index % DIFFICULTY_ADJUSTMENT_INTERVAL === 0 && newestBlock.index !== 0) {
       return calculcateNewDifficulty(newestBlock, getBlockchain());
    } else {
        return newestBlock.difficulty;
    }
};

const calculcateNewDifficulty = (newestBlock, blockchain) => {
    const lastCalculatedBlock = blockchain[blockchain.length - DIFFICULTY_ADJUSTMENT_INTERVAL];
    const timeExpected = BLOCK_GENERATION_INTERVAL * DIFFICULTY_ADJUSTMENT_INTERVAL;
    const timeTaken = newestBlock.timestamp - lastCalculatedBlock.timestamp;
    if(timeTaken < timeExpected / 2) {
        return lastCalculatedBlock.difficulty + 1;
    } else if (timeTaken > timeExpected * 2) {
        return lastCalculatedBlock.difficulty - 1;
    } else {
        return lastCalculatedBlock.difficulty;
    }
};

const findBlock = (index, previousHash, timestamp, data, difficulty) => {
    let nonce = 0;
    
    while(true) {
        const hash = createHash(
            index,
            previousHash,
            timestamp,
            data,
            difficulty,
            nonce
        );

    if(hashMatchesDifficulty(hash, difficulty)) {
        return new Block(index, hash, previousHash, timestamp, data, difficulty, nonce);
    }
        nonce++;
    }
};

const hashMatchesDifficulty = (hash, difficulty=0) => {
    const hashInBinary = hexToBinrary(hash);
    const requiredZeros = "0".repeat(difficulty);
    return hashInBinary.startsWith(requiredZeros);
};

const getBlocksHash = (block) => createHash(block.index, block.previousHash, block.timestamp, block.data, block.difficulty, block.nonce);

const isTimeStampValid = (newBlock, oldBlock) => {
    return (oldBlock.timestamp - 60 < newBlock.timestamp && newBlock.timestamp - 60 < getTimestamp());
}

const isBlockValid = (candidateBlock, latestBlock) => {
    if(!isBlockStructureValid(candidateBlock)) {
        console.log('The candidate block structure is not valid');
        return false;
    } else if(latestBlock.index + 1 !== candidateBlock.index) {
        console.log('The candidate block doesnt have a valid index');
        return false;
    } else if(latestBlock.hash !== candidateBlock.previousHash) {
        console.log('The previousHash of the candidate block is not the hash of the latest block');
        return false;
    } else if(getBlocksHash(candidateBlock) !== candidateBlock.hash) {
        console.log('The has of this block is invalid');
        return false;
    } else if(!isTimeStampValid(candidateBlock, latestBlock)) {
        console.log('The timestamp of this block is dodgy');
        return false;
    }
    return true;
};

const isBlockStructureValid = (block) => {
    return (
        typeof block.index === "number" 
        && typeof block.hash ==="string" 
        && typeof block.previousHash === "string" 
        && typeof block.timestamp === "number" 
        && typeof block.data === "object"
    );
};

const isChainValid = (candidateChain) => {
    const isGenesisValid = block => {
        return JSON.stringify(block) === JSON.stringify(genesisBlock);
    };

    if(!isGenesisValid(candidateChain[0])) {
        console.log("The candidateChain's genesisBlock is not the same as our genesisBlock");
        return null;
    };

let foreignUTxOuts = [];

    for(let i = 0; i < candidateChain.length; i++) {
        const currentBlock = candidateChain[i];
        if(i !== 0 && !isBlockValid(currentBlock, candidateChain[i - 1])) {
            return null;
        }

        foreignUTxOuts = processTxs(currentBlock.data, foreignUTxOuts, currentBlock.index);

        if(foreignUTxOuts === null) {
            return null;
        }
    }
    return foreignUTxOuts;
};

const sumDifficulty = anyBlockchain => anyBlockchain.map(block => block.difficulty).map(difficulty => Math.pow(2, difficulty)).reduce((a, b) => a + b);

const replaceChain = candidateChain => {
    const foreignUTxOuts = isChainValid(candidateChain);
    const validChain = foreignUTxOuts !== null;
    if(validChain && sumDifficulty(candidateChain) > sumDifficulty(getBlockchain())) {
        blockchain = candidateChain;
        uTxOuts = foreignUTxOuts;
        updateMempool(uTxOuts);
        require("./p2p").broadcastNewBlock();
        return true;
    } else {
        return false;
    }
};

const addBlockToChain = candidateBlock => {
    if(isBlockValid(candidateBlock, getNewestBlock())) {

        const processedTxs = processTxs(candidateBlock.data, uTxOuts, candidateBlock.index);
        if(processedTxs === null) {
            console.log("Couldnt process txs");
            return false;
        } else {
            blockchain.push(candidateBlock);
            uTxOuts = processedTxs;
            updateMempool(uTxOuts);
            return true;
        }
        return true;
    } else {
        return false;
    }
};

const getUTxOutList = () => _.cloneDeep(uTxOuts);

const getAccountBalance = () => getBalance(getPublicFromWallet(), uTxOuts);

const sendTx = (address, amount) => {
    const tx = createTx(address, amount, getPrivateFromWallet(), getUTxOutList(), getMempool());
    addToMempool(tx, getUTxOutList());
    require("./p2p").broadcastMempool();
    return tx;
};

const handleIncomingTx = (tx) => {
    addToMempool(tx, getUTxOutList());
};

module.exports = {
    replaceChain,
    addBlockToChain,
    isBlockStructureValid,
    getNewestBlock,
    getBlockchain,
    createNewBlock,
    getAccountBalance,
    sendTx,
    handleIncomingTx,
    getUTxOutList
};

