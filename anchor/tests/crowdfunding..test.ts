import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { Keypair, PublicKey } from '@solana/web3.js'
import { Crowdfunding } from "../target/types/crowdfunding" // <--- Update this to your program's type
import { expect, it, beforeAll } from '@jest/globals';
import { describe } from 'node:test'; // Keep if you use it for structure, otherwise Jest's describe is usually enough.

// Ensure this matches the address in your IDL
const crowdfundingAddress = new PublicKey("CeS7WEPrgnfvgLrVPw3BmTDkt9hz6Cu9oUb1ZPjCMymm");
const IDL = require("../target/idl/crowdfunding.json"); // <--- Update this to your program's IDL

describe("crowdfunding", () => {
    let context;
    let provider: BankrunProvider;
    let crowdfundingProgram: anchor.Program<Crowdfunding>;
    let deployer: Keypair; // To simulate the deployer of the program

    // PDA for the program_state account
    let programStatePda: PublicKey;

    beforeAll(async () => {
        // Start Anchor with your program
        context = await startAnchor("", [{ name: "crowdfunding", programId: crowdfundingAddress }], []);
        provider = new BankrunProvider(context);

        // A Keypair to act as the deployer (signer for the initialize instruction)
        deployer = Keypair.generate();
        await provider.connection.requestAirdrop(deployer.publicKey, anchor.web3.LAMPORTS_PER_SOL * 10); // Airdrop some SOL

        crowdfundingProgram = new Program<Crowdfunding>(IDL, provider);

        // Derive the PDA for the ProgramState account
        [programStatePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("program_state")],
            crowdfundingAddress
        );
    });

    it('should initialize the program state', async () => {
        // Get initial balance of the deployer
        const initialDeployerBalance = await provider.connection.getBalance(deployer.publicKey);
        console.log("Deployer initial balance:", initialDeployerBalance);

        // Call the initialize instruction
        await crowdfundingProgram.methods
            .initialize()
            .accounts({
              
                // deployer: deployer.publicKey,
                // systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([deployer]) // The deployer is a signer
            .rpc();

        console.log("Program initialized successfully.");

        // Fetch the program_state account data
        const programState = await crowdfundingProgram.account.programState.fetch(programStatePda);

        // Assertions
        expect(programState.initialized).toBe(true);
        expect(programState.campaignCount.toNumber()).toBe(0);
        // Assuming a default platform_fee is set to 0 initially if not specified by initialize
        // Or if there's a default in the program, you'd assert that default
        // The IDL doesn't show platform_fee being set by initialize, so it will be its default (0)
        expect(programState.platformFee.toNumber()).toBe(0);

        // Check if platform_address is deployer's public key (assuming the program sets it to deployer)
        // If your initialize sets the platform_address to the deployer, assert it here.
        // Based on your IDL, `initialize` does not take `platform_address` as an argument
        // and does not explicitly set it to the deployer. It's likely set to a default value (e.g., system_program.programId or another default Pubkey::default())
        // or set to the deployer's key within the program's `initialize` logic.
        // For now, let's assume it's set to the deployer's public key. If not, adjust this expectation.
        expect(programState.platformAddress.toBase58()).toEqual(deployer.publicKey.toBase58());

        const finalDeployerBalance = await provider.connection.getBalance(deployer.publicKey);
        console.log("Deployer final balance:", finalDeployerBalance);
        expect(finalDeployerBalance).toBeLessThan(initialDeployerBalance); // Should be less due to transaction fees
    });
});