-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(20),
    wallet_address VARCHAR(100),
    
    -- KYC Status
    kyc_status VARCHAR(20) DEFAULT 'pending', -- pending, verified, rejected
    kyc_verified_at TIMESTAMP,
    kyc_rejection_reason TEXT,
    
    -- Personal Information
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    middle_name VARCHAR(100),
    date_of_birth DATE,
    gender VARCHAR(10), -- male, female, other
    
    -- Identity Documents
    bvn VARCHAR(11), -- Bank Verification Number
    nin VARCHAR(11), -- National Identity Number
    
    -- Address Information
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Nigeria',
    postal_code VARCHAR(20),
    
    -- Next of Kin
    nok_full_name VARCHAR(255),
    nok_relationship VARCHAR(50),
    nok_phone_number VARCHAR(20),
    nok_address TEXT,

    -- Metadata
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_email (email),
    INDEX idx_bvn (bvn),
    INDEX idx_nin (nin),
    INDEX idx_kyc_status (kyc_status)
);

-- Onramp Transactions Table (NGN to CNGN)
CREATE TABLE onramp_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Transaction Details
    reference VARCHAR(100) UNIQUE NOT NULL,
    amount DECIMAL(20, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'NGN',
    token_amount DECIMAL(20, 8), -- CNGN amount to receive
    token_type VARCHAR(20) DEFAULT 'CNGN', -- CNGN, USDC, USDT, etc.
    
    -- Status Tracking
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed, cancelled
    flint_transaction_id VARCHAR(100),
    
    -- Destination (User's wallet)
    destination_address VARCHAR(100) NOT NULL,
    
    -- Flint API Response Data
    network VARCHAR(20), -- base, bsc, ethereum, polygon, etc.
    notify_url TEXT,
    deposit_account JSONB, -- stores bank details from Flint response
    
    -- Metadata
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Indexes
    INDEX idx_user_id (user_id),
    INDEX idx_reference (reference),
    INDEX idx_status (status),
    INDEX idx_token_type (token_type),
    INDEX idx_created_at (created_at)
);

-- Offramp Transactions Table (CNGN to NGN)
CREATE TABLE offramp_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Transaction Details
    reference VARCHAR(100) UNIQUE NOT NULL,
    amount DECIMAL(20, 2) NOT NULL, -- Token amount
    fiat_amount DECIMAL(20, 2), -- NGN amount to receive
    currency VARCHAR(10) DEFAULT 'NGN',
    token_type VARCHAR(20) DEFAULT 'CNGN', -- CNGN, USDC, USDT, etc.
    
    -- Status Tracking
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed, cancelled
    flint_transaction_id VARCHAR(100),
    
    -- Destination (Bank Account)
    bank_code VARCHAR(10) NOT NULL,
    account_number VARCHAR(20) NOT NULL,
    account_name VARCHAR(255),
    bank_name VARCHAR(100),
    
    -- Flint API Response Data
    network VARCHAR(20), -- base, bsc, ethereum, polygon, etc.
    notify_url TEXT,
    
    -- Metadata
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Indexes
    INDEX idx_user_id (user_id),
    INDEX idx_reference (reference),
    INDEX idx_status (status),
    INDEX idx_token_type (token_type),
    INDEX idx_account_number (account_number),
    INDEX idx_created_at (created_at)
);

-- Swap Transactions Table (Token to Token swaps)
CREATE TABLE swap_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- Transaction Details
    reference VARCHAR(100) UNIQUE NOT NULL,
    
    -- From Token
    from_token_type VARCHAR(20) NOT NULL, -- CNGN, USDC, USDT, etc.
    from_amount DECIMAL(20, 8) NOT NULL,
    from_network VARCHAR(20), -- base, bsc, ethereum, polygon, etc.
    
    -- To Token
    to_token_type VARCHAR(20) NOT NULL, -- CNGN, USDC, USDT, etc.
    to_amount DECIMAL(20, 8) NOT NULL,
    to_network VARCHAR(20), -- base, bsc, ethereum, polygon, etc.
    
    -- Exchange Rate
    exchange_rate DECIMAL(20, 8) NOT NULL,
    
    -- Wallet Addresses
    source_address VARCHAR(100) NOT NULL,
    destination_address VARCHAR(100) NOT NULL,
    
    -- Status Tracking
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed, cancelled
    transaction_hash VARCHAR(100), -- blockchain transaction hash
    
    -- Fees
    fee_amount DECIMAL(20, 8),
    fee_currency VARCHAR(20),
    
    -- Metadata
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Indexes
    INDEX idx_user_id (user_id),
    INDEX idx_reference (reference),
    INDEX idx_status (status),
    INDEX idx_from_token (from_token_type),
    INDEX idx_to_token (to_token_type),
    INDEX idx_created_at (created_at)
);

-- Webhook Events Table (for onramp, offramp, and swap)
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type VARCHAR(10) NOT NULL, -- 'onramp', 'offramp', 'swap'
    transaction_id UUID NOT NULL, -- references onramp, offramp, or swap transaction
    reference VARCHAR(100) NOT NULL,
    
    -- Event Details
    event_type VARCHAR(50), -- status_update, completion, failure, etc.
    status VARCHAR(20),
    
    -- Raw Payload
    payload JSONB NOT NULL,
    
    -- Processing
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP,
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_reference (reference),
    INDEX idx_transaction_type (transaction_type),
    INDEX idx_processed (processed),
    INDEX idx_created_at (created_at)
);

-- Transaction Logs Table (for audit trail)
CREATE TABLE transaction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_type VARCHAR(10) NOT NULL, -- 'onramp', 'offramp', 'swap'
    transaction_id UUID NOT NULL,
    
    -- Log Details
    action VARCHAR(50) NOT NULL, -- created, status_changed, completed, failed, etc.
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    description TEXT,
    
    -- Additional Data
    metadata JSONB,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_transaction_type (transaction_type),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
);

-- Supported Tokens Table (for tracking available tokens)
CREATE TABLE supported_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_symbol VARCHAR(20) UNIQUE NOT NULL, -- CNGN, USDC, USDT, etc.
    token_name VARCHAR(100) NOT NULL, -- Canza Finance NGN, USD Coin, etc.
    token_address VARCHAR(100), -- smart contract address
    network VARCHAR(20) NOT NULL, -- base, bsc, ethereum, polygon, etc.
    decimals INT DEFAULT 18,
    is_active BOOLEAN DEFAULT TRUE,
    logo_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_token_symbol (token_symbol),
    INDEX idx_network (network),
    INDEX idx_is_active (is_active)
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_onramp_updated_at BEFORE UPDATE ON onramp_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_offramp_updated_at BEFORE UPDATE ON offramp_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_swap_updated_at BEFORE UPDATE ON swap_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tokens_updated_at BEFORE UPDATE ON supported_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();