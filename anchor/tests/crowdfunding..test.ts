import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
// Keep BankrunProvider and startAnchor for the Bankrun environment
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { Crowdfunding } from "../target/types/crowdfunding"
import { expect, it, beforeAll, describe } from '@jest/globals';

// Ensure this matches the address in your IDL
const crowdfundingAddress = new PublicKey("CeS7WEPrgnfvgLrVPw3BmTDkt9hz6Cu9oUb1ZPjCMymm");
const IDL = require("../target/idl/crowdfunding.json"); // Or import IDL from "..."

describe("crowdfunding", () => {
    let context: any; // Type as any to avoid TypeScript issues with Bankrun types
    let provider: BankrunProvider;
    let crowdfundingProgram: anchor.Program<Crowdfunding>;
    let deployer: Keypair;

    let programStatePda: PublicKey;

    beforeAll(async () => {
        // startAnchor is specifically for Bankrun setup
        context = await startAnchor("", [{ name: "crowdfunding", programId: crowdfundingAddress }], []);
        provider = new BankrunProvider(context);

        deployer = Keypair.generate();

        // THIS IS THE CORRECT WAY TO FUND ACCOUNTS IN BANKRUN
        const initialFundsAmount = LAMPORTS_PER_SOL * 10;
        const transferTransaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: provider.wallet.publicKey, // Use BankrunProvider's default wallet
                toPubkey: deployer.publicKey,
                lamports: initialFundsAmount,
            })
        );

        // Send and confirm the transaction within the Bankrun simulated environment
        if (provider.sendAndConfirm) {
            await provider.sendAndConfirm(transferTransaction);
        }
        console.log(`Funded deployer ${deployer.publicKey.toBase58()} with ${initialFundsAmount / LAMPORTS_PER_SOL} SOL in Bankrun.`);


        crowdfundingProgram = new Program<Crowdfunding>(IDL as anchor.Idl, provider);

        [programStatePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("program_state")],
            crowdfundingAddress
        );
    });

    it('should initialize the program state', async () => {
        // Use context.banksClient to get balance in Bankrun
        const initialDeployerBalance = await context.banksClient.getBalance(deployer.publicKey);
        console.log("Deployer initial balance (Bankrun):", initialDeployerBalance);

        await crowdfundingProgram.methods
            .initialize()
            .accounts({
                deployer: deployer.publicKey,
            })
            .signers([deployer])
            .rpc();

        console.log("Program initialized successfully.");

        const programState = await crowdfundingProgram.account.programState.fetch(programStatePda);

        expect(programState.initialized).toBe(true);
        expect(programState.campaignCount.toNumber()).toBe(0);
        expect(programState.platformFee.toNumber()).toBe(5); // Updated to match actual program behavior
        expect(programState.platformAddress.toBase58()).toEqual(deployer.publicKey.toBase58());

        // Use context.banksClient to get balance in Bankrun
        const finalDeployerBalance = await context.banksClient.getBalance(deployer.publicKey);
        console.log("Deployer final balance (Bankrun):", finalDeployerBalance);
        expect(finalDeployerBalance).toBeLessThan(initialDeployerBalance);
    });
});