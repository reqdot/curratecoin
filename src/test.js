const createTx = (receiverAddress, amount, privateKey, uTxOutList) => {
    const myAddress = getPublicKey(privateKey);
    const myUTxOuts = uTxOutList.filter(uTxOut => uTxOut.address === address);

    // 코인 배분 계산
    const { leftOverAmount, includedUTxOuts } = findAmount(amount, myUTxOuts);

    const txInIngre = myUTxOut => {
        const txIn = new txIn();
        txIn.txOutId = myUTxOut.txOutId;
        txIn.txOutIndex = myUTxOut.txOutIndex;
        return txIn;
    }


    // txIn 만들기
    const unsignedTxIn = includedUTxOuts.map(txInIngre);

    // tx 만들기
    const tx = new Transaction();

    tx.txIns = unsignedTxIn;

    tx.txOuts = createTxOut(receiverAddress, myAddress, amount, leftOverAmount);

    tx.id = getTxId(tx);

    tx.txIns = tx.txIns.map((txIn, index) => {
        txIn.signature = signTxIn(tx, index, privateKey, uTxOutList);
        return txIn;
    })
    
    return tx;
}



const createTxOut = (receiverAddress, myAddress, amount, leftOverAmount) => {
    const yourTxOut = new TxOut(receiverAddress, amount);
    
    if(leftOverAmount === 0) {
        return [yourTxOut];
    } else {
        const myTxOut = new TxOut(myAddress, leftOverAmount);
        return [yourTxOut, myTxOut];
    }

}

const findAmount = (amount, myUTxOuts) => {
    const currentAmount = 0;

    const includedUTxOuts = [];

    for(const myUTxOUt of myUTxOUts) {
        includedUTxOuts.push(myUTxOUt);

        currentAmount = currentAmount + myUTxOut.amount;

        if(currentAmount >= amount) {
            const leftOverAmount = currentAmount- amount;
            return { leftOverAmount, includedUTxOuts};
        }
    } 

    throw Error("");
    return false;

}

const createCoinbaseTx = (address, blockIndex) => {
    const tx = new Transaction();
    const txIn = new TxIn();
    txIn.txOutId = "";
    txIn.txOutIndex = blockIndex;
    txIn.signature = "";
    const txOut = new TxOut(address, COINBASE_AMOUNT);
    tx.txIns = [txIn];
    tx.txOuts = [txOut];
    tx.id = getTxId(tx);
    return tx;
}

const createNewBlock = () => {
    const newBlock = createCoinbaseTx(getPublicFromWallet(), getNewestBlock().index+1);

    const newData = [newBlock];
    createRawNewBlock(newData);
}