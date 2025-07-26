import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Counter } from "../target/types/counter";
import CounterIDL from "../target/idl/counter.json";

describe("counter", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Use the program ID from the IDL
  const program = new Program<Counter>(CounterIDL as any, CounterIDL.address, provider);

  // Generate a new keypair for the counter account
  const counter = Keypair.generate();

  it("Initializes the counter", async () => {
    // Airdrop some SOL to the payer if needed
    const sig = await provider.connection.requestAirdrop(
      provider.wallet.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    // Call the initialize instruction
    await program.methods
      .initialize()
      .accounts({
        counter: counter.publicKey,
        user: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([counter])
      .rpc();

    // Fetch the counter account and check its value
    const account = await program.account.counter.fetch(counter.publicKey);
    expect(account.count.toNumber()).toBe(0);
  });

  it("Increments the counter", async () => {
    // Call the increment instruction
    await program.methods
      .increment()
      .accounts({
        counter: counter.publicKey,
        user: provider.wallet.publicKey,
      })
      .rpc();

    // Fetch the counter account and check its value
    const account = await program.account.counter.fetch(counter.publicKey);
    expect(account.count.toNumber()).toBe(1);
  });

  it("Decrements the counter", async () => {
    // Call the decrement instruction
    await program.methods
      .decrement()
      .accounts({
        counter: counter.publicKey,
        user: provider.wallet.publicKey,
      })
      .rpc();

    // Fetch the counter account and check its value
    const account = await program.account.counter.fetch(counter.publicKey);
    expect(account.count.toNumber()).toBe(0);
  });
});

