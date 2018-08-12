const CryptoJS = require("crypto-js"),
    elliptic = require("elliptic"),
    _ = require("lodash"),
    utils = require("./utils");

const ec = new elliptic.ec("secp256k1");    

const COINBASE_AMOUNT = 50;

class TxOut {
    constructor(address, amount) {
        this.address = address;
        this.amount = amount;
    }
}

class TxIn {
    // txOutId
    // txOutIndex
    // Signature

}

class Transaction {
    //ID
    //txIns[]
    //txOuts[]
}

class UTxOut {
    constructor(txOutId, txOutIndex, address, amount) {
        this.txOutId = txOutId;
        this.txOutIndex = txOutIndex;
        this.address = address;
        this.amount = amount;
    }
}

const getTxId = tx => {
    const txInContent = tx.txIns
    .map(txIn => txIn.txOutId + txIn.txOutIndex)
    .reduce((a, b) => a + b, "");
    
    const txOutContent = tx.txOuts
    .map(txOut => txOut.address + txOut.amount)
    .reduce((a, b) => a + b, "");
    
    return CryptoJS.SHA256(txInContent + txOutContent).toString();
};

// const genesisTx = {
//     txIns: [{ signature: "", txOutId: "", txOutIndex: 0 }],
//     txOuts: [
//       {
//         address:
//           "043fdd20b80b8836486c4f76f8a918d256c3dea5d8e7e1029241e12ce30b7aeb09a25e172785179ca67f42e1c220bdb4019f3fff14f80802d36eb7582664377753",
//         amount: 50
//       }
//     ],
//     id: "ad67c73cd8e98af6db4ac14cc790664a890286d4b06c6da7ef223aef8c281e76"
//   };

//   console.log("id: ", getTxId(genesisTx));

const findUTxOut = (txOutId, txOutIndex, uTxOutList) => {
    return uTxOutList.find(uTxOut => uTxOut.txOutId === txOutId && uTxOut.txOutIndex === txOutIndex);
};

const signTxIn = (tx, txInIndex, privateKey, uTxOutList) => {
    const txIn = tx.txIns[txInIndex];
    const dataToSign = tx.id;

    
    const referencedUTxOut = findUTxOut(txIn.txOutId, txIn.txOutIndex, uTxOutList);
    if(referencedUTxOut === null || referencedUTxOut === undefined) {
        throw Error("Couldnt find the referenced uTxOut, not signing");
        return;
    }

    // 트랜잭션에서 돈을 보낼 때 없는 주소이거나 해서 에러가 나지 않도록 하기 위해서
    const referencedAddress = referencedUTxOut.address;
    if(getPublicKey(privateKey) !== referencedAddress) {
        return false;
    } 
    const key = ec.keyFromPrivate(privateKey, "hex");
    const signature = utils.toHexString(key.sign(dataToSign).toDER());
    return signature;
};

const getPublicKey = (privateKey) => {
    return ec.keyFromPrivate(privateKey, "hex").getPublic().encode("hex");
};

const updateUTxOuts = (newTxs, uTxOutList) => {
    const newUTxOuts = newTxs
    .map(tx => 
         tx.txOuts.map(
             (txOut, index) => new UTxOut(tx.id, index, txOut.address, txOut.amount)))
    .reduce((a, b) => a.concat(b), []);

    const spentTxOuts = newTxs.map(tx => tx.txIns)
    .reduce((a, b) => a.concat(b), [])
    .map(txIn => new UTxOut(txIn.txOutId, txIn.txOutIndex, "", 0));

    const resultingUTxOuts = uTxOutList
    .filter(uTxO => !findUTxOut(uTxO.txOutId, uTxO.txOutIndex, spentTxOuts))
    .concat(newUTxOuts);

    return resultingUTxOuts;
};

const isTxInStructureValid = (txIn) => {
    if(txIn === null) {
        console.log("The txIn appears to be null");
        return false;
    } else if(typeof txIn.signature !== "string") {
        console.log("The txIn doesn't have a valid signature");
        return false;
    } else if(typeof txIn.txOutId !== "string") {
        console.log("The txIn doesn't have a valid txOutId");
        return false;
    } else if(typeof txIn.txOutIndex !== "number") {
        console.log("The txIn doesn't have a valid txOutIndex");
        return false;
    } else {
        return true;
    }
}

const isAddressValid = (address) => {
    if(address.length !== 130) {
        console.log("The address length is not the expected one");
        return false;
    } else if(address.match("^[a-fA-F0-9]+$") === null) {
        console.log("The address doesn't match the hex patter");
        return false;
    } else if(!address.startsWith("04")) {
        console.log("The address doesn't start with 04");
        return false;
    } else {
        return true;
    }
}

const isTxOutStructureValid = (txOut) => {
    if(txOut === null) {
        return false;
    } else if(typeof txOut.address !== "string") {
        console.log("The txOut doesn't have a valid string as address");
        return false;
    } else if(!isAddressValid(txOut.address)) {
        console.log("The txOut doesn't have a valid address");
        return false;
    } else if(typeof txOut.amount !== "number") {
        console.log("The txOut doesn't have a valid amount");
        return false;
    } else {
        return true;
    }
}

const isTxStructureValid = (tx) => {
    if(typeof tx.id !== "string") {
        console.log("Tx ID is not valid");
        return false;
    } else if(!(tx.txIns instanceof Array)) {
        console.log("The txIns are not an array");
        return false;
    } else if(!tx.txIns.map(isTxInStructureValid).reduce((a, b) => a && b, true)) {
        console.log("The Structure of one of the txIn is not valid");
        return false;
    } else if(!(tx.txOuts instanceof Array)) {
        console.log("The txOuts are not an array");
        return false;
    } else if(!tx.txOuts.map(isTxOutStructureValid).reduce((a, b) => a && b, true)) {
        console.log("The structure of on of the txOut is not valid");
        return false;
    } else {
        return true;
    }
};

const validateTxIn = (txIn, tx, uTxOutList) => {
    // 레퍼런스하고 있는 uTxOut을 가져와야 함(class TxIn에서 txOutId나 txOutIndex는 하나씩임)
    const wantedTxOut = uTxOutList.find(uTxOut => uTxOut.txOutId === txIn.txOutId && uTxOut.txOutIndex === txIn.txOutIndex);
    if(wantedTxOut === undefined) {
        console.log("Didn't find the wanted uTxOut", JSON.stringify(tx));
        return false;
    // address: 퍼블릿 키, key: 시크릿 키(트랜잭션 아이디는 돈을 사용할 사람에 의해서 사인되었음을 체크) - 내가 주인임을 알 수 있음
    // 왜냐하면 주소가 트랜잭션 id로 사인을 증명할 수 있기 때문이다.
    } else {
        const address = wantedTxOut.address;
        const key = ec.keyFromPublic(address, "hex");
        return key.verify(tx.id, txIn.signature);
    }
}

const getAmountInTxIn = (txIn, uTxOutList) => findUTxOut(txIn.txOutId, txIn.txOutIndex, uTxOutList).amount;

const validateTx = (tx, uTxOutList) => {
    if(!isTxStructureValid(tx)) {
        console.log("Tx structure is invalid");
        return false;
    }
    // tx ID 검증
    if(getTxId(tx) !== tx.id) {
        console.log("Tx ID is not valid");
        return false;
    } 
    // txIns가 uTxOuts을 제대로 반영하는지 검증
    const hasValidTxIns = tx.txIns.map(txIn => validateTxIn(txIn, tx, uTxOutList));

    if(!hasValidTxIns) {
        console.log(`The tx: ${tx} doesn't have valid txIns`);
        return false;
    }

    const amountInTxIns = tx.txIns.map(txIn => getAmountInTxIn(txIn, uTxOutList)).reduce((a, b) => a + b, 0);

    const amountInTxOuts = tx.txOuts.map(txOut => txOut.amount).reduce((a, b) => a + b, 0);
    
    // txIns = txOuts 인지 검증
    if(amountInTxIns !== amountInTxOuts) {
        console.log(
            `The tx: ${tx} doesn't have the same amount in the txOut as in the txIns`
          );
        return false;
    } else {
        return true;
    }
};

const validateCoinbaseTx = (tx, blockIndex) => {
    if(getTxId(tx) !== tx.id) {
        console.log("Invalid Coinbase tx ID");
        return false;
        // 블록체인에서 주는 1개의 인풋 밖에 없음
    } else if(tx.txIns.length !== 1) {
        console.log("Coinbase TX should only have one input");
        return false;
        //TxIn은 txOutIndex 참조했지만, uTxOuts가 없으므로 그냥 블록 인덱스 참조
    } else if(tx.txIns[0].txOutIndex !== blockIndex) {
        console.log(
            "The txOutIndex of the Coinbase Tx should be the same as the Block Index"
          );
        return false;
        // 받는 사람은 채굴자 한 명 뿐임
    } else if(tx.txOuts.length !== 1) {
        console.log("Coinbase TX should only have one output");
        return false;
        // 채굴 한 번에 50코인씩만 주어짐
    } else if(tx.txOuts[0].amount !== COINBASE_AMOUNT) {
        console.log(
            `Coinbase TX should have an amount of only ${COINBASE_AMOUNT} and it has ${
              tx.txOuts[0].amount
            }`
          );
        return false;
    } else {
        return true;
    }
};

const createCoinbaseTx = (address, blockIndex) => {
    const tx = new Transaction();
    const txIn = new TxIn();
    txIn.signature = "";
    txIn.txOutId = "";
    txIn.txOutIndex = blockIndex;
    tx.txIns = [txIn];
    tx.txOuts = [new TxOut(address, COINBASE_AMOUNT)];
    tx.id = getTxId(tx);
    return tx;
};

const hasDuplicated = (txIns) => {
    const groups = _.countBy(txIns, txIn => txIn.txOutId + txIn.txOutIndex);

    return _(groups).map(value => {
        if(value > 1) {
            console.log("Found a duplicated txIn");
            return true;
        } else {
            return false;
        }
    })
    // groups array의 true를 가졌는지 체크함
    .includes(true);
};

// 모든 트랜잭션을 검증
const validateBlockTxs = (txs, uTxOutList, blockIndex) => {
    // tx = txIns + txOuts + ID
    // console.log("txs", JSON.stringify(txs));
    
    // 코인베이스 트랜잭션 검증
    const coinbaseTx = txs[0];
    if(!validateCoinbaseTx(coinbaseTx, blockIndex)) {
        console.log("Coinbase Tx is invalid");
    }

    // 일반 트랜잭션 검증
    const txIns = _(txs).map(tx => tx.txIns).flatten().value();

    // 더블 스펜딩 막기 위해서
    if(hasDuplicated(txIns)){
        console.log("Found duplicated txIns");
        return false;
    }

    const nonCoinbaseTxs = txs.slice(1);
    return nonCoinbaseTxs.map(tx => validateTx(tx, uTxOutList)).reduce((a, b) => a && b, true);
}; 

// 인풋을 아웃풋으로 변환
const processTxs = (txs, uTxOutList, blockIndex) => {
    // all txs를 검증
    if(!validateBlockTxs(txs, uTxOutList, blockIndex)) {
        return null;
    }

    // uTxOut(unspent)를 업데이트
    return updateUTxOuts(txs, uTxOutList);
}

module.exports = {
    getPublicKey,
    getTxId,
    signTxIn,
    TxIn,
    Transaction,
    TxOut,
    createCoinbaseTx,
    processTxs,
    validateTx
};