import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Crowdfunding } from "../target/types/crowdfunding";
import { expect, it, beforeAll, describe } from "@jest/globals";

const crowdfundingAddress = new PublicKey(
  "CeS7WEPrgnfvgLrVPw3BmTDkt9hz6Cu9oUb1ZPjCMymm"
);
const IDL = require("../target/idl/crowdfunding.json");

describe("crowdfunding", () => {
  let context: any;
  let provider: BankrunProvider;
  let crowdfundingProgram: anchor.Program<Crowdfunding>;
  let deployer: Keypair;
  let creator: Keypair;
  let donor1: Keypair;
  let donor2: Keypair;
  let transactionPda1: PublicKey;
  let withdrawlPDA: PublicKey;

  let programStatePda: PublicKey;
  let campaignPda: PublicKey;

  const campaignId = new anchor.BN(1);
  const campaignTitle = "Save the Whales";
  const campaignDescription =
    "A campaign to protect endangered whale species in our oceans.";
  const campaignImageUrl = "https://example.com/bimal-image.jpg";
  const campaignGoal = new anchor.BN(10 * LAMPORTS_PER_SOL); // 10 SOL goal

  beforeAll(async () => {
    context = await startAnchor(
      "",
      [{ name: "crowdfunding", programId: crowdfundingAddress }],
      []
    );
    provider = new BankrunProvider(context);

    // Generate keypairs
    deployer = Keypair.generate();
    creator = Keypair.generate();
    donor1 = Keypair.generate();
    donor2 = Keypair.generate();

    // Fund accounts
    const accounts = [deployer, creator, donor1, donor2];
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

    crowdfundingProgram = new Program<Crowdfunding>(
      IDL as anchor.Idl,
      provider
    );

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
    it("should initialize the program state", async () => {
      const initialDeployerBalance = await context.banksClient.getBalance(
        deployer.publicKey
      );
      console.log("Deployer initial balance:", initialDeployerBalance);

      await crowdfundingProgram.methods
        .initialize()
        .accounts({
          deployer: deployer.publicKey,
        })
        .signers([deployer])
        .rpc();

      console.log("Program initialized successfully.");

      const programState = await crowdfundingProgram.account.programState.fetch(
        programStatePda
      );

      expect(programState.initialized).toBe(true);
      expect(programState.campaignCount.toNumber()).toBe(0);
      expect(programState.platformFee.toNumber()).toBe(5);
      expect(programState.platformAddress.toBase58()).toEqual(
        deployer.publicKey.toBase58()
      );

      const finalDeployerBalance = await context.banksClient.getBalance(
        deployer.publicKey
      );
      console.log("Deployer final balance:", finalDeployerBalance);
      expect(finalDeployerBalance).toBeLessThan(initialDeployerBalance);
    });
  });

  describe("Create Campaign", () => {
    it("should create a new campaign", async () => {
      const initialCreatorBalance = await context.banksClient.getBalance(
        creator.publicKey
      );

      await crowdfundingProgram.methods
        .createCampaign(
          campaignTitle,
          campaignDescription,
          campaignImageUrl,
          campaignGoal
        )
        .accounts({
          creator: creator.publicKey,
          campaign: campaignPda,
          programState: programStatePda,
        })
        .signers([creator])
        .rpc();

      console.log("Campaign created successfully.");

      // Verify campaign data
      const campaign = await crowdfundingProgram.account.campaign.fetch(
        campaignPda
      );
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
      const programState = await crowdfundingProgram.account.programState.fetch(
        programStatePda
      );
      expect(programState.campaignCount.toNumber()).toBe(1);

      const finalCreatorBalance = await context.banksClient.getBalance(
        creator.publicKey
      );
      expect(finalCreatorBalance).toBeLessThan(initialCreatorBalance);
    });
    it("should fail to create campaign with zero goal", async () => {
      const [invalidCampaignPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("campaign"),
          new anchor.BN(2).toArrayLike(Buffer, "le", 8),
        ],
        crowdfundingAddress
      );

      try {
        await crowdfundingProgram.methods
          .createCampaign(
            "Valid Title",
            campaignDescription,
            campaignImageUrl,
            new anchor.BN(0)
          )
          .accounts({
            creator: creator.publicKey,
            campaign: invalidCampaignPda,
            programState: programStatePda,
          })
          .signers([creator])
          .rpc();

        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.error.errorCode.code).toBe("InvalidGoalAmount");
      }
    });
    it("should fail to create campaign with invalid title", async () => {
      const [campaignPdaforlongtitle] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("campaign"),
          new anchor.BN(2).toArrayLike(Buffer, "le", 8),
        ],
        crowdfundingAddress
      );
      const longTitle = "A".repeat(65);

      try {
        await crowdfundingProgram.methods
          .createCampaign(
            longTitle,
            campaignDescription,
            campaignImageUrl,
            campaignGoal
          )
          .accounts({
            creator: creator.publicKey,
            campaign: campaignPdaforlongtitle,
            programState: programStatePda,
          })
          .signers([creator])
          .rpc();

        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.error.errorCode.code).toBe("TitleTooLong");
      }
    });
  });
  describe("Update Campaign", () => {
    it("should update campaign details", async () => {
      const newTitle = "Save All Marine Life";
      const newDescription = "Expanded campaign to protect all marine species.";
      const newImageUrl = "https://example.com/marine-life.jpg";
      const newGoal = new anchor.BN(15 * LAMPORTS_PER_SOL);

      const initialCreatorBalance = await context.banksClient.getBalance(
        creator.publicKey
      );

      await crowdfundingProgram.methods
        .updateCampaign(
          campaignId,
          newTitle,
          newDescription,
          newImageUrl,
          newGoal
        )
        .accounts({
          creator: creator.publicKey,
        })
        .signers([creator])
        .rpc();

      console.log("Campaign updated successfully.");

      const campaign = await crowdfundingProgram.account.campaign.fetch(
        campaignPda
      );
      console.log(campaign);
      expect(campaign.title).toBe(newTitle);
      expect(campaign.description).toBe(newDescription);
      expect(campaign.imageUrl).toBe(newImageUrl);
      expect(campaign.goal.toNumber()).toBe(newGoal.toNumber());

      // Verify other fields remain unchanged
      expect(campaign.cid.toNumber()).toBe(1);
      expect(campaign.creator.toBase58()).toEqual(creator.publicKey.toBase58());
      expect(campaign.amountRaised.toNumber()).toBe(0);
      expect(campaign.donors.toNumber()).toBe(0);
      expect(campaign.active).toBe(true);

      const finalCreatorBalance = await context.banksClient.getBalance(
        creator.publicKey
      );
      expect(finalCreatorBalance).toBeLessThanOrEqual(initialCreatorBalance);
    });
    it("should fail to update campaign with unauthorized user", async () => {
      try {
        await crowdfundingProgram.methods
          .updateCampaign(
            campaignId,
            "Unauthorized Update",
            campaignDescription,
            campaignImageUrl,
            campaignGoal
          )
          .accounts({
            creator: donor1.publicKey, // Wrong creator
          })
          .signers([donor1])
          .rpc();
      } catch (error: any) {
        expect(error.error.errorCode.code).toBe("Unauthorized");
      }
    });
  });

  describe("Donate", () => {
    const donationAmount1 = new anchor.BN(2 * LAMPORTS_PER_SOL); // 2 SOL
    const donationAmount2 = new anchor.BN(3 * LAMPORTS_PER_SOL); // 3 SOL

    it("should allow first donation", async () => {
      const initialDonorBalance = await context.banksClient.getBalance(
        donor1.publicKey
      );
      const initialCampaignBalance = await context.banksClient.getBalance(
        campaignPda
      );

      // Get current campaign state to calculate donor count
      const campaignBefore = await crowdfundingProgram.account.campaign.fetch(
        campaignPda
      );
      const nextDonorCount = campaignBefore.donors.add(new anchor.BN(1));

      // PDa creation itself
      const [transactionPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("donor"),
          donor1.publicKey.toBuffer(),
          campaignId.toArrayLike(Buffer, "le", 8),
          nextDonorCount.toArrayLike(Buffer, "le", 8),
        ],
        crowdfundingAddress
      );

      //sending the create pda on chain
      await crowdfundingProgram.methods
        .donate(campaignId, donationAmount1)
        .accounts({
          donor: donor1.publicKey,
          transaction: transactionPda,
        })
        .signers([donor1])
        .rpc();

      //  detching and testing.
      const campaign = await crowdfundingProgram.account.campaign.fetch(
        campaignPda
      );
      // console.log("___________________________________________________________________________")
      // console.log(campaign)
      expect(campaign.amountRaised.toNumber()).toBe(donationAmount1.toNumber());
      expect(campaign.donors.toNumber()).toBe(1);
      expect(campaign.balance.toNumber()).toBe(donationAmount1.toNumber());

      // Verify transaction record
      const transaction = await crowdfundingProgram.account.transaction.fetch(
        transactionPda
      );
      expect(transaction.owner.toBase58()).toBe(donor1.publicKey.toBase58());
      expect(transaction.cid.toNumber()).toBe(campaignId.toNumber());
      expect(transaction.amount.toNumber()).toBe(donationAmount1.toNumber());
      expect(transaction.credited).toBe(true);

      // Verify balances
      const finalDonorBalance = await context.banksClient.getBalance(
        donor1.publicKey
      );
      const finalCampaignBalance = await context.banksClient.getBalance(
        campaignPda
      );

      expect(finalDonorBalance).toBeLessThan(initialDonorBalance);
      expect(finalCampaignBalance).toBeGreaterThan(initialCampaignBalance);
    });
    it("should allow second donation from different donor", async () => {
      const campaignBefore = await crowdfundingProgram.account.campaign.fetch(
        campaignPda
      );
      const nextDonorCount = campaignBefore.donors.add(new anchor.BN(1));

      const [transactionPda1] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("donor"),
          donor2.publicKey.toBuffer(),
          campaignId.toArrayLike(Buffer, "le", 8),
          nextDonorCount.toArrayLike(Buffer, "le", 8),
        ],
        crowdfundingAddress
      );
      await crowdfundingProgram.methods
        .donate(campaignId, donationAmount2)
        .accounts({
          donor: donor2.publicKey,
          transaction: transactionPda1,
        })
        .signers([donor2])
        .rpc();

      // Verify campaign updated
      const campaign = await crowdfundingProgram.account.campaign.fetch(
        campaignPda
      );
      expect(campaign.amountRaised.toNumber()).toBe(
        donationAmount1.add(donationAmount2).toNumber()
      );
      expect(campaign.donors.toNumber()).toBe(2);
      expect(campaign.balance.toNumber()).toBe(
        donationAmount1.add(donationAmount2).toNumber()
      );
    });
    it("should fail donation with insufficient amount", async () => {
      const campaignBefore = await crowdfundingProgram.account.campaign.fetch(
        campaignPda
      );
      const nextDonorCount = campaignBefore.donors.add(new anchor.BN(1));

      const [invalidTransactionPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("donor"),
          donor1.publicKey.toBuffer(),
          campaignId.toArrayLike(Buffer, "le", 8),
          nextDonorCount.toArrayLike(Buffer, "le", 8),
        ],
        crowdfundingAddress
      );
      try {
        await crowdfundingProgram.methods
          //less than 1 sol cant be donated
          .donate(campaignId, new anchor.BN(0.5 * LAMPORTS_PER_SOL))
          .accounts({
            donor: donor1.publicKey,
            transaction: invalidTransactionPda,
          })
          .signers([donor1])
          .rpc();

        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.error.errorCode.code).toBe("InvalidDonationAmount");
      }
    });
  });
  describe("Withdraw", () => {
    const withdrawAmount = new anchor.BN(1.1 * LAMPORTS_PER_SOL); // 1.1 SOL
    const donationAmount1 = new anchor.BN(2 * LAMPORTS_PER_SOL); // 2 SOL
    const donationAmount2 = new anchor.BN(3 * LAMPORTS_PER_SOL); // 3 SOL

    it("should allow creator to withdraw funds", async () => {
        const campaignBefore = await crowdfundingProgram.account.campaign.fetch(campaignPda);
        const nextWithdrawlCount = campaignBefore.withdrawals.add(new anchor.BN(1));

        const initialCreatorBalance = await context.banksClient.getBalance(creator.publicKey);
        const initialCampaignBalance = await context.banksClient.getBalance(campaignPda);
        const initialPlatformBalance = await context.banksClient.getBalance(deployer.publicKey);

        const [withdrawlPDA] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("withdraw"),
                creator.publicKey.toBuffer(),
                campaignId.toArrayLike(Buffer, "le", 8),
                nextWithdrawlCount.toArrayLike(Buffer, "le", 8),
            ],
            crowdfundingAddress
        );

        await crowdfundingProgram.methods
            .withdraw(campaignId, withdrawAmount)
            .accounts({
                creator: creator.publicKey,
                transaction: withdrawlPDA,
                programState: programStatePda,
                platformAddress: deployer.publicKey,
            })
            .signers([creator])
            .rpc();

        // Verify campaign updated
        const campaign = await crowdfundingProgram.account.campaign.fetch(campaignPda);
        expect(campaign.withdrawals.toNumber()).toBe(1); 
        expect(campaign.balance.toNumber()).toBe(
            donationAmount1.add(donationAmount2).sub(withdrawAmount).toNumber()
        );

        // Verify balances changed
        const finalCreatorBalance = await context.banksClient.getBalance(creator.publicKey);
        const finalCampaignBalance = await context.banksClient.getBalance(campaignPda);
        const finalPlatformBalance = await context.banksClient.getBalance(deployer.publicKey);

        expect(finalCreatorBalance).toBeGreaterThan(initialCreatorBalance);
        expect(finalCampaignBalance).toBeLessThan(initialCampaignBalance);
        expect(finalPlatformBalance).toBeGreaterThan(initialPlatformBalance); // Platform fee
    });
    
});
});
