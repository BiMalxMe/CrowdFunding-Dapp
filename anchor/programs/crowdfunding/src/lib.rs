use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke, system_instruction};

// Program ID declaration (replace with your own ID when deploying)
declare_id!("CeS7WEPrgnfvgLrVPw3BmTDkt9hz6Cu9oUb1ZPjCMymm");

// Constants
pub const ANCHOR_DISCRIMINATOR_SIZE: usize = 8;

// Error Codes
#[error_code]
pub enum ErrorCode {
    #[msg("The program has already been initialized.")]
    AlreadyInitialized,
    #[msg("Title exceeds the maximum length of 64 characters.")]
    TitleTooLong,
    #[msg("Description exceeds the maximum length of 512 characters.")]
    DescriptionTooLong,
    #[msg("Image URL exceeds the maximum length of 256 characters.")]
    ImageUrlTooLong,
    #[msg("Invalid goal amount. Goal must be greater than zero.")]
    InvalidGoalAmount,
    #[msg("Unauthorized access.")]
    Unauthorized,
    #[msg("Campaign not found.")]
    CampaignNotFound,
    #[msg("Campaign is inactive.")]
    InactiveCampaign,
    #[msg("Donation amount must be at least 1 SOL.")]
    InvalidDonationAmount,
    #[msg("Campaign goal reached.")]
    CampaignGoalActualized,
    #[msg("Withdrawal amount must be at least 1 SOL.")]
    InvalidWithdrawalAmount,
    #[msg("Insufficient funds in the campaign.")]
    InsufficientFund,
    #[msg("The provided platform address is invalid.")]
    InvalidPlatformAddress,
    #[msg("Invalid platform fee percentage.")]
    InvalidPlatformFee,
}

// State Accounts
#[account]
#[derive(InitSpace)]
pub struct ProgramState {
    pub initialized: bool,
    pub campaign_count: u64,
    pub platform_fee: u64,
    pub platform_address: Pubkey,
}

#[account]
#[derive(InitSpace)]
pub struct Campaign {
    pub cid: u64,
    pub creator: Pubkey,
    #[max_len(64)]
    pub title: String,
    #[max_len(512)]
    pub description: String,
    #[max_len(256)]
    pub image_url: String,
    pub goal: u64,
    pub amount_raised: u64,
    pub timestamp: u64,
    pub donors: u64,
    pub withdrawals: u64,
    pub balance: u64,
    pub active: bool,
}

#[account]
#[derive(InitSpace)]
pub struct Transaction {
    pub owner: Pubkey,
    pub cid: u64,
    pub amount: u64,
    pub timestamp: u64,
    pub credited: bool,
}

// Program Module
#[program]
pub mod crowdfunding {
    use super::*;

    // Initialize the program
    pub fn initialize(ctx: Context<InitializeCtx>) -> Result<()> {
        let state = &mut ctx.accounts.program_state;
        let deployer = &ctx.accounts.deployer;

        if state.initialized {
            return Err(ErrorCode::AlreadyInitialized.into());
        }

        state.campaign_count = 0;
        state.platform_fee = 5;
        state.platform_address = deployer.key();
        state.initialized = true;

        Ok(())
    }

    // Create a new campaign
    pub fn create_campaign(
        ctx: Context<CreateCampaignCtx>,
        title: String,
        description: String,
        image_url: String,
        goal: u64,
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let state = &mut ctx.accounts.program_state;

        if title.len() > 64 {
            return Err(ErrorCode::TitleTooLong.into());
        }
        if description.len() > 512 {
            return Err(ErrorCode::DescriptionTooLong.into());
        }
        if image_url.len() > 256 {
            return Err(ErrorCode::ImageUrlTooLong.into());
        }
        if goal < 1_000_000_000 {
            return Err(ErrorCode::InvalidGoalAmount.into());
        }

        state.campaign_count += 1;

        campaign.cid = state.campaign_count;
        campaign.creator = ctx.accounts.creator.key();
        campaign.title = title;
        campaign.description = description;
        campaign.image_url = image_url;
        campaign.goal = goal;
        campaign.amount_raised = 0;
        campaign.donors = 0;
        campaign.withdrawals = 0;
        campaign.timestamp = Clock::get()?.unix_timestamp as u64;
        campaign.active = true;

        Ok(())
    }

    // Update campaign details
    pub fn update_campaign(
        ctx: Context<UpdateCampaignCtx>,
        cid: u64,
        title: String,
        description: String,
        image_url: String,
        goal: u64,
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let creator = &mut ctx.accounts.creator;

        if campaign.creator != creator.key() {
            return Err(ErrorCode::Unauthorized.into());
        }

        if campaign.cid != cid {
            return Err(ErrorCode::CampaignNotFound.into());
        }

        if title.len() > 64 {
            return Err(ErrorCode::TitleTooLong.into());
        }
        if description.len() > 512 {
            return Err(ErrorCode::DescriptionTooLong.into());
        }
        if image_url.len() > 256 {
            return Err(ErrorCode::ImageUrlTooLong.into());
        }
        if goal < 1_000_000_000 {
            return Err(ErrorCode::InvalidGoalAmount.into());
        }

        campaign.title = title;
        campaign.description = description;
        campaign.image_url = image_url;
        campaign.goal = goal;

        Ok(())
    }

    // Delete (deactivate) a campaign
    pub fn delete_campaign(ctx: Context<DeleteCampaignCtx>, cid: u64) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let creator = &mut ctx.accounts.creator;

        if campaign.creator != creator.key() {
            return Err(ErrorCode::Unauthorized.into());
        }

        if campaign.cid != cid {
            return Err(ErrorCode::CampaignNotFound.into());
        }

        if !campaign.active {
            return Err(ErrorCode::InactiveCampaign.into());
        }

        campaign.active = false;

        Ok(())
    }

    // Donate to a campaign
    pub fn donate(ctx: Context<DonateCtx>, cid: u64, amount: u64) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let donor = &mut ctx.accounts.donor;
        let transaction = &mut ctx.accounts.transaction;

        if campaign.cid != cid {
            return Err(ErrorCode::CampaignNotFound.into());
        }

        if !campaign.active {
            return Err(ErrorCode::InactiveCampaign.into());
        }

        if amount < 1_000_000_000 {
            return Err(ErrorCode::InvalidDonationAmount.into());
        }

        if campaign.amount_raised >= campaign.goal {
            return Err(ErrorCode::CampaignGoalActualized.into());
        }

        let tx_instruction = system_instruction::transfer(
            &donor.key(),
            &campaign.key(),
            amount,
        );

        let result = invoke(
            &tx_instruction,
            &[donor.to_account_info(), campaign.to_account_info()],
        );

        if let Err(e) = result {
            msg!("Donation transfer failed: {:?}", e);
            return Err(e.into());
        }

        campaign.amount_raised += amount;
        campaign.balance += amount;
        campaign.donors += 1;

        transaction.amount = amount;
        transaction.cid = cid;
        transaction.owner = donor.key();
        transaction.timestamp = Clock::get()?.unix_timestamp as u64;
        transaction.credited = true;

        Ok(())
    }

    // Withdraw funds from a campaign
    pub fn withdraw(ctx: Context<WithdrawCtx>, cid: u64, amount: u64) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let creator = &ctx.accounts.creator;
        let transaction = &mut ctx.accounts.transaction;
        let state = &mut ctx.accounts.program_state;
        let platform_account_info = &ctx.accounts.platform_address;

        if campaign.cid != cid {
            return Err(ErrorCode::CampaignNotFound.into());
        }

        if campaign.creator != creator.key() {
            return Err(ErrorCode::Unauthorized.into());
        }

        //fixing the amount such that  less than 1 sol cant be deducted
        if amount < 1_000_000_000 {
            return Err(ErrorCode::InvalidWithdrawalAmount.into());
        }

        if amount > campaign.balance {
            return Err(ErrorCode::CampaignGoalActualized.into());
        }

        if platform_account_info.key() != state.platform_address {
            return Err(ErrorCode::InvalidPlatformAddress.into());
        }

        let rent_balance = Rent::get()?.minimum_balance(campaign.to_account_info().data_len());
        if amount > **campaign.to_account_info().lamports.borrow() - rent_balance {
            msg!("Withdrawal exceed campaign's usable balance");
            return Err(ErrorCode::InsufficientFund.into());
        }

        let platform_fee = amount * state.platform_fee / 100;
        let creator_amount = amount - platform_fee;

        **campaign.to_account_info().try_borrow_mut_lamports()? -= creator_amount;
        **creator.to_account_info().try_borrow_mut_lamports()? += creator_amount;

        **campaign.to_account_info().try_borrow_mut_lamports()? -= platform_fee;
        **platform_account_info.to_account_info().try_borrow_mut_lamports()? += platform_fee;

        campaign.withdrawals += 1;
        campaign.balance -= amount;

        transaction.amount = amount;
        transaction.cid = cid;
        transaction.owner = creator.key();
        transaction.timestamp = Clock::get()?.unix_timestamp as u64;
        transaction.credited = false;

        Ok(())
    }

    // Update platform settings
    pub fn update_platform_settings(
        ctx: Context<UpdatePlatformSettingsCtx>,
        new_platform_fee: u64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.program_state;
        let updater = &ctx.accounts.updater;

        if updater.key() != state.platform_address {
            return Err(ErrorCode::Unauthorized.into());
        }

        if !(1..=15).contains(&new_platform_fee) {
            return Err(ErrorCode::InvalidPlatformFee.into());
        }

        state.platform_fee = new_platform_fee;

        Ok(())
    }
}

// Contexts
#[derive(Accounts)]
pub struct InitializeCtx<'info> {
    #[account(
        init,
        payer = deployer,
        space = ANCHOR_DISCRIMINATOR_SIZE + ProgramState::INIT_SPACE,
        seeds = [b"program_state"],
        bump
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(mut)]
    pub deployer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateCampaignCtx<'info> {
    #[account(mut)]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        init,
        payer = creator,
        space = ANCHOR_DISCRIMINATOR_SIZE + Campaign::INIT_SPACE,
        seeds = [
            b"campaign",
            (program_state.campaign_count + 1).to_le_bytes().as_ref()
        ],
        bump
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(cid: u64)]
pub struct UpdateCampaignCtx<'info> {
    #[account(
        mut,
        seeds = [
            b"campaign",
            cid.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(cid: u64)]
pub struct DeleteCampaignCtx<'info> {
    #[account(
        mut,
        seeds = [
            b"campaign",
            cid.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(cid: u64)]
pub struct DonateCtx<'info> {
    #[account(
        mut,
        seeds = [
            b"campaign",
            cid.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(
        init,
        payer = donor,
        space = ANCHOR_DISCRIMINATOR_SIZE + Transaction::INIT_SPACE,
        seeds = [
            b"donor",
            donor.key().as_ref(),
            cid.to_le_bytes().as_ref(),
            (campaign.donors + 1).to_le_bytes().as_ref()
        ],
        bump
    )]
    pub transaction: Account<'info, Transaction>,

    #[account(mut)]
    pub donor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(cid: u64)]
pub struct WithdrawCtx<'info> {
    #[account(
        mut,
        seeds = [
            b"campaign",
            cid.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(
        init,
        payer = creator,
        space = ANCHOR_DISCRIMINATOR_SIZE + Transaction::INIT_SPACE,
        seeds = [
            b"withdraw",
            creator.key().as_ref(),
            cid.to_le_bytes().as_ref(),
            (campaign.withdrawals + 1).to_le_bytes().as_ref()
        ],
        bump
    )]
    pub transaction: Account<'info, Transaction>,

    #[account(mut)]
    pub program_state: Account<'info, ProgramState>,

    /// CHECK: This is the platform's account which must match program_state.platform_address
    #[account(mut)]
    pub platform_address: AccountInfo<'info>,

    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdatePlatformSettingsCtx<'info> {
    #[account(mut)]
    pub updater: Signer<'info>,

    #[account(
        mut,
        seeds = [b"program_state"],
        bump
    )]
    pub program_state: Account<'info, ProgramState>,
}