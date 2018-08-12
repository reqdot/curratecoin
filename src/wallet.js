const elliptic = require("elliptic"),
    path = require("path"),
    fs = require("fs"),
    _ = require("lodash"),
    Transactions = require("./transactions");

const { getPublicKey, getTxId, signTxIn, TxIn, Transaction, TxOut } = Transactions;

const ec = new elliptic.ec("secp256k1");   

const privateKeyLocation = path.join(__dirname, "privateKey");

const generatePrivateKey = () => {
    const keyPair = ec.genKeyPair();
    const privateKey = keyPair.getPrivate();
    return privateKey.toString(16);
};

const getPrivateFromWallet = () => {
    const buffer = fs.readFileSync(privateKeyLocation, "utf8");
    return buffer.toString();
};

const getPublicFromWallet = () => {
    const privateKey = getPrivateFromWallet();
    const key = ec.keyFromPrivate(privateKey, "hex");
    return key.getPublic().encode("hex");
};

const getBalance = (address, uTxOuts) => {
    return _(uTxOuts)
    .filter(uTxO => uTxO.address === address)
    .map(uTxO => uTxO.amount)
    .sum();
};

const initWallet = () => {
    if(fs.existsSync(privateKeyLocation)) {
        return;
    }
    const newPrivateKey = generatePrivateKey();

    fs.writeFileSync(privateKeyLocation, newPrivateKey);
};

// 내가 진짜 돈을 가졌는지, unspent를 다 합쳐서 내가 원하는 수량이 되는지 확인
const findAmountInUTxOut = (amountNeeded, myUTxOuts) => {
    // 코인 수 변수 만들고
    let currentAmount = 0;

    // unspent를 모을 array 변수 만들고
    const includedUTxOuts = [];

    for(const myUTxOut of myUTxOuts) {
        includedUTxOuts.push(myUTxOut);
        currentAmount = currentAmount + myUTxOut.amount;
        if(currentAmount >= amountNeeded) {
            const leftOverAmount = currentAmount - amountNeeded;
            return { includedUTxOuts, leftOverAmount };
        }
    }
    // 수량 부족 시
    throw Error("Not enough founds");
    return false;
};

// leftOverAmount는 남은 돈은 나에게 주기 위해서 필요
const createTxOuts = (receiverAddress, myAddress, amount, leftOverAmount) => {
    // 사용된 돈을 TxOut으로 만듬
    const receiverTxOut = new TxOut(receiverAddress, amount);

    // 남은 돈이 없으면 그냥 남 준 것만 트랜잭션 리턴
    if(leftOverAmount === 0) {
        return [receiverTxOut];

    // 남은 돈이 있으면 내 계좌도 트랜잭션 만들어 리턴    
    } else {
        const leftOverTxOut = new TxOut(myAddress, leftOverAmount);
        return [receiverTxOut, leftOverTxOut];
    }
}

// 두 번째 tx를 생성할 때에도 같은 uTxOutList를 사용하기 때문에 두 번쨰 트랜잭션이 안 된다.
// 따라서 멤풀 안에 있는 사용된 uTxOutList(이제는 멤풀 밖에 존재하는)를 없애기(createTx에서 myUTxOuts을 필터링)
const filterUTxOutsFromMempool = (uTxOutList, mempool) => {
    const txIns = _(mempool).map(tx => tx.txIns).flatten().value();

    const removables = [];

    for(const uTxOut of uTxOutList) {
        const txIn = _.find(txIns, txIn => txIn.txOutIndex === uTxOut.txOutIndex && txIn.txOutId === uTxOut.txOutId);
        if(txIn !== undefined){
            removables.push(uTxOut);
        }
    }

    return _.without(uTxOutList, ...removables);
}

// privateKey는 unspent를 내가 소유했는지 증명하기 위해서
const createTx = (receiverAddress, amount, privateKey, uTxOutList, memPool) => {
    // 내 주소
    const myAddress = getPublicKey(privateKey);

    // 내가 가진 uTxO를 얻어야 함
    const myUTxOuts = uTxOutList.filter(uTxO => uTxO.address ===  myAddress);

    const filteredUTxOuts = filterUTxOutsFromMempool(myUTxOuts, memPool);

    // 내가 진짜 돈을 가졌는지, unspent를 다 합쳐서 내가 원하는 수량이 되는지 확인
    // unspent를 넣은 배열과 돈 지급하고 남은 돈을 받아옴
    const { includedUTxOuts, leftOverAmount } = findAmountInUTxOut(
        amount, 
        filteredUTxOuts
    );

    // unspent를 가져다가 txIn으로 만듬(create TxIn)
    const toUnsignedTxIn = uTxOut => {
        const txIn = new TxIn();
        txIn.txOutId = uTxOut.txOutId;
        txIn.txOutIndex = uTxOut.txOutIndex;
        return txIn;
    }

    const unsignedTxIns = includedUTxOuts.map(toUnsignedTxIn);
    
    // create Tx
    const tx = new Transaction();

    // 사인 전의 인풋들을 대입(array 형태 [])
    tx.txIns = unsignedTxIns;

    // 남에게 주는 것과 나에게 주는 것 트랜잭션 생성(array 형태 [])
    tx.txOuts = createTxOuts(receiverAddress, myAddress, amount, leftOverAmount);

    // 트랜잭션 아이디 만들기
    tx.id = getTxId(tx);

    // 서명
    tx.txIns = tx.txIns.map((txIn, index) => {
        txIn.signature = signTxIn(tx, index, privateKey, uTxOutList);
        return txIn;
    });
    return tx;
};

module.exports = {
    initWallet,
    getBalance,
    getPublicFromWallet,
    createTx,
    getPrivateFromWallet
};
