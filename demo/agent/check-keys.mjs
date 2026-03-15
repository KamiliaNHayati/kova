// save as check-keys.mjs, run with: node check-keys.mjs
import "dotenv/config";
import walletSdk from "@stacks/wallet-sdk";
import stxTx from "@stacks/transactions";
import stxNetwork from "@stacks/network";

const { generateWallet, generateNewAccount } = walletSdk;
const { getAddressFromPrivateKey } = stxTx;
const { STACKS_TESTNET } = stxNetwork;

let wallet = await generateWallet({ secretKey: process.env.AGENT_MNEMONIC, password: "" });
for (let i = 0; i <= 12; i++) {
    while (wallet.accounts.length <= i) wallet = generateNewAccount(wallet);
    const addr = getAddressFromPrivateKey(wallet.accounts[i].stxPrivateKey, STACKS_TESTNET);
    console.log(`Index ${i}: ${addr}`);
}