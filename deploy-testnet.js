/**
 * Deploy agent-wallet-v5.clar to Stacks Testnet with Clarity version 2
 * 
 * Usage: node deploy-testnet.js
 * 
 * This bypasses Clarinet and the Stacks Explorer Sandbox,
 * which both default to Clarity 3 (where as-contract is unavailable).
 */
import fs from "fs";
import dotenv from "dotenv";

// Load env from demo/agent/.env for the mnemonic
dotenv.config({ path: "./demo/agent/.env" });

import stxTx from "@stacks/transactions";
const {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  ClarityVersion,
  getAddressFromPrivateKey,
} = stxTx;

import stxNetwork from "@stacks/network";
const { STACKS_TESTNET } = stxNetwork;

import walletSdk from "@stacks/wallet-sdk";
const { generateWallet, generateNewAccount } = walletSdk;

async function main() {
  const mnemonic = process.env.AGENT_MNEMONIC;
  if (!mnemonic) {
    console.error("❌ No AGENT_MNEMONIC found in demo/agent/.env");
    process.exit(1);
  }

  // Derive the deployer key (account index 0 = CONTRACT_ADDRESS = STWEW038...)
  let wallet = await generateWallet({ secretKey: mnemonic, password: "" });
  const deployerKey = wallet.accounts[0].stxPrivateKey;
  const deployerAddress = getAddressFromPrivateKey(deployerKey, STACKS_TESTNET);

  console.log(`\n🚀 Deploying agent-wallet-v5 to Stacks Testnet`);
  console.log(`   Deployer: ${deployerAddress}`);
  console.log(`   Clarity version: 2 (supports as-contract)`);
  console.log(`   Network: testnet\n`);

  // Read the contract source
  const contractSource = fs.readFileSync("./contracts/agent-wallet-v5.clar", "utf-8");
  console.log(`   Contract size: ${contractSource.length} bytes`);

  // Build the deploy transaction with explicit ClarityVersion.Clarity2
  const txOptions = {
    codeBody: contractSource,
    contractName: "agent-wallet-v5",
    senderKey: deployerKey,
    network: STACKS_TESTNET,
    anchorMode: AnchorMode.OnChainOnly,
    clarityVersion: ClarityVersion.Clarity2,
    fee: 200000n, // 0.2 STX — generous for testnet
  };

  console.log(`   Building transaction...`);
  const tx = await makeContractDeploy(txOptions);

  console.log(`   Broadcasting...`);
  const result = await broadcastTransaction({ transaction: tx, network: STACKS_TESTNET });

  if (result.error) {
    console.error(`\n   ❌ Broadcast failed: ${result.error}`);
    console.error(`   Reason: ${result.reason}`);
    if (result.reason_data) console.error(`   Data: ${JSON.stringify(result.reason_data)}`);
    process.exit(1);
  }

  console.log(`\n   ✅ Transaction broadcast successfully!`);
  console.log(`   TxID: 0x${result.txid}`);
  console.log(`   Explorer: https://explorer.hiro.so/txid/0x${result.txid}?chain=testnet`);
  console.log(`\n   Wait ~10-30 minutes for the transaction to be mined on testnet.`);
}

main().catch((err) => {
  console.error("❌ Deploy error:", err.message);
  process.exit(1);
});
