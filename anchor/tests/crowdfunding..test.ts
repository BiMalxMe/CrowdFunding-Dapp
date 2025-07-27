import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { Crowdfunding } from "../target/types/crowdfunding"
import { expect, it, beforeAll, describe } from '@jest/globals';

const crowdfundingAddress = new PublicKey("CeS7WEPrgnfvgLrVPw3BmTDkt9hz6Cu9oUb1ZPjCMymm");
const IDL = require("../target/idl/crowdfunding.json");

describe("crowdfunding", () => {
    let context: any;
    let provider: BankrunProvider;
    let crowdfundingProgram: anchor.Program<Crowdfunding>;
    let deployer: Keypair;
    let creator: Keypair;

    let programStatePda: PublicKey;
    let campaignPda: PublicKey;

    const campaignId = new anchor.BN(1);
    const campaignTitle = "Save the Whales";
    const campaignDescription = "A campaign to protect endangered whale species in our oceans.";
    const campaignImageUrl = "https://example.com/whale-image.jpg";
    const campaignGoal = new anchor.BN(10 * LAMPORTS_PER_SOL); // 10 SOL goal

    beforeAll(async () => {
        context = await startAnchor("", [{ name: "crowdfunding", programId: crowdfundingAddress }], []);
        provider = new BankrunProvider(context);

        // Generate keypairs
        deployer = Keypair.generate();
        creator = Keypair.generate();

        // Fund accounts
        const accounts = [deployer, creator];
        for (const account of accounts) {
            const fundAmount = LAMPORTS_PER_SOL * 20; // 20 SOL each
            const transferTransaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: provider.wallet.publicKey,
                    toPubkey: account.publicKey,
                    lamports: fundAmount,
                })
            );
            if (provider.sendAndConfirm) {
                await provider.sendAndConfirm(transferTransaction);
            }
        }

        crowdfundingProgram = new Program<Crowdfunding>(IDL as anchor.Idl, provider);

        // Derive PDAs
        [programStatePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("program_state")],
            crowdfundingAddress
        );

        [campaignPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("campaign"), campaignId.toArrayLike(Buffer, "le", 8)],
            crowdfundingAddress
        );
    });

    describe("Initialize", () => {
        it('should initialize the program state', async () => {
            const initialDeployerBalance = await context.banksClient.getBalance(deployer.publicKey);
            console.log("Deployer initial balance:", initialDeployerBalance);

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
            expect(programState.platformFee.toNumber()).toBe(5);
            expect(programState.platformAddress.toBase58()).toEqual(deployer.publicKey.toBase58());

            const finalDeployerBalance = await context.banksClient.getBalance(deployer.publicKey);
            console.log("Deployer final balance:", finalDeployerBalance);
            expect(finalDeployerBalance).toBeLessThan(initialDeployerBalance);
        });
    });

    describe("Create Campaign", () => {
        it('should create a new campaign', async () => {
            const initialCreatorBalance = await context.banksClient.getBalance(creator.publicKey);

            await crowdfundingProgram.methods
                .createCampaign(campaignTitle, campaignDescription, campaignImageUrl, campaignGoal)
                .accounts({
                    creator: creator.publicKey,
                    campaign: campaignPda,
                    programState: programStatePda,
                })
                .signers([creator])
                .rpc();

            console.log("Campaign created successfully.");

            // Verify campaign data
            const campaign = await crowdfundingProgram.account.campaign.fetch(campaignPda);
            expect(campaign.cid.toNumber()).toBe(1);
            expect(campaign.creator.toBase58()).toEqual(creator.publicKey.toBase58());
            expect(campaign.title).toBe(campaignTitle);
            expect(campaign.description).toBe(campaignDescription);
            expect(campaign.imageUrl).toBe(campaignImageUrl);
            expect(campaign.goal.toNumber()).toBe(campaignGoal.toNumber());
            expect(campaign.amountRaised.toNumber()).toBe(0);
            expect(campaign.donors.toNumber()).toBe(0);
            expect(campaign.withdrawals.toNumber()).toBe(0);
            expect(campaign.balance.toNumber()).toBe(0);
            expect(campaign.active).toBe(true);

            // Verify program state updated
            const programState = await crowdfundingProgram.account.programState.fetch(programStatePda);
            expect(programState.campaignCount.toNumber()).toBe(1);

            const finalCreatorBalance = await context.banksClient.getBalance(creator.publicKey);
            expect(finalCreatorBalance).toBeLessThan(initialCreatorBalance);
        });
    });
     it('should fail to create campaign with zero goal', async () => {
            const [invalidCampaignPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("campaign"), new anchor.BN(2).toArrayLike(Buffer, "le", 8)],
                crowdfundingAddress
            );

            try {
                await crowdfundingProgram.methods
                    .createCampaign("Valid Title", campaignDescription, campaignImageUrl, new anchor.BN(0))
                    .accounts({
                        creator: creator.publicKey,
                        campaign: invalidCampaignPda,
                        programState: programStatePda,
                    })
                    .signers([creator])
                    .rpc();
                
                expect(true).toBe(false); // Should not reach here
            } catch (error : any) {
                expect(error.error.errorCode.code).toBe("InvalidGoalAmount");
            }
        });
});