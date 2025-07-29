# CrowdFunding Dapp

A decentralized crowdfunding platform built on Solana using Anchor.

## Overview
<img width="1113" height="438" alt="Screen Shot 2025-07-28 at 11 10 39" src="https://github.com/user-attachments/assets/7e23d191-18f4-434b-810e-e94a7897ab12" />

CrowdFunding Dapp enables anyone to create, manage, and contribute to fundraising campaigns on the Solana blockchain. Campaign creators can set funding goals, share their stories, and securely withdraw raised funds. Donors can transparently support causes they care about, with all transactions recorded on-chain.

## Features

- **Create Campaigns:** Launch your own fundraising campaign with a title, description, image, and funding goal.
- **Donate Securely:** Contribute SOL to campaigns directly from your wallet.
- **Transparent Withdrawals:** Campaign creators can withdraw funds, with platform fees handled automatically.
- **Platform Governance:** Platform settings (like fees) are managed on-chain for transparency.

## Tech Stack

- **Solana**: High-performance blockchain for fast, low-cost transactions.
- **Anchor**: Framework for Solana smart contract development.
- **TypeScript/Javascript**: For tests and client interaction.

## Getting Started

1. **Clone the repository**
2. **Install dependencies**  
   `npm install`
3. **Build and test the program**  
   `anchor build && anchor test`

## Tests

The project includes a comprehensive test suite covering all major functionalities:

- Program initialization
- Campaign creation, update, and deletion
- Donations (including edge cases)
- Withdrawals (including authorization and minimum amount checks)
- Platform settings updates

To run the tests:
