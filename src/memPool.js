const _ = require("lodash"),
    Transactions = require("./transactions");

// 검증이 안 된 tx는 블록에 포함시키지 않음
const { validateTx } = Transactions;

let mempool = [];

const getMempool = () => _.cloneDeep(mempool);

// mempool에 있는 모든 tx 가져오기
const getTxInsInPool = mempool => {
    return _(mempool).map(tx => tx.txIns)
    .flatten()
    .value();
}

// mempool에 사용된 tx인지 확인(더블스펜딩 방지)
const isTxValidForPool = (tx, mempool) => {
    const txInsInPool = getTxInsInPool(mempool);

    const isTxInAlreadyInPool = (txIns, txIn) => {
        return _.find(txIns, txInInPool => {
            return (
                txIn.txOutIndex === txInInPool.txOutIndex &&
                txIn.txOutId === txInInPool.txOutId
            );
        });
    };

    for(const txIn of tx.txIns) {
        if(isTxInAlreadyInPool(txInsInPool, txIn)) {
            return false;
        }
    }
    return true;
};

const hasTxIn = (txIn, uTxOutList) => {
    const foundTxIn = uTxOutList.find(uTxO => uTxO.txOutId === txIn.txOutId && uTxO.txOutIndex === txIn.txOutIndex);

    return foundTxIn !== undefined;
    
}
// #72
// 트랜잭션이 많고, 이전 거래가 있으면 에러 날 수 있으므로 블록이 업데이트될 때마다, 
// 블록이 블록체인에 추가될 때마다 멤풀은 비어있어야 함
const updateMempool = uTxOutList => {
    const invalidTxs = [];

    for(const tx of mempool) {
        for(const txIn of tx.txIns) {
            if(!hasTxIn(txIn, uTxOutList)) {
                invalidTxs.push(tx);
                break;
            }
        }
    }

    if(invalidTxs.length > 0) {
       mempool = _.without(mempool, ...invalidTxs);
    }
}

// mempool에 tx 추가
const addToMempool = (tx, uTxOutList) => {
    // tx가 유효한지 먼저 검증하고
    if(!validateTx(tx, uTxOutList)) {
        throw Error("This tx is invalid. Will not add it to pool.");   
    // tx가 mempool에 혹시 있지는 않은지 검증     
    } else if(!isTxValidForPool(tx, mempool)) {
        throw Error("This tx is not valid for the pool. Will not add it.");
    }
    mempool.push(tx);
};

module.exports = {
    addToMempool,
    getMempool,
    updateMempool
}