-- init-mysql.sql
-- Khởi tạo Database cho Ads Campaign Manager

CREATE DATABASE IF NOT EXISTS ads_manager DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ads_manager;

-- 1. Bảng lưu trữ Cấu hình doanh nghiệp
CREATE TABLE IF NOT EXISTS business_config (
    id VARCHAR(64) PRIMARY KEY,
    owner_name VARCHAR(128) NOT NULL,
    business_name VARCHAR(128) NOT NULL,
    primary_objective VARCHAR(255),
    currency VARCHAR(10) DEFAULT 'VND',
    timezone VARCHAR(64) DEFAULT 'Asia/Ho_Chi_Minh',
    last_ai_analysis_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Bảng lưu trữ Snapshot các Chiến dịch (để Report và Lịch sử theo thời gian)
CREATE TABLE IF NOT EXISTS campaign_snapshots (
    id VARCHAR(128) PRIMARY KEY, -- vd: snapshotId_campaignId
    campaign_id VARCHAR(128) NOT NULL,
    campaign_name VARCHAR(255) NOT NULL,
    business_id VARCHAR(64) NOT NULL,
    spend_today DECIMAL(15, 2) DEFAULT 0,
    budget DECIMAL(15, 2) DEFAULT 0,
    roas DECIMAL(10, 2) DEFAULT 0,
    ctr DECIMAL(10, 4) DEFAULT 0,
    cpa DECIMAL(15, 2) DEFAULT 0,
    status VARCHAR(64),
    learning_phase BOOLEAN DEFAULT FALSE,
    snapshot_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES business_config(id) ON DELETE CASCADE,
    INDEX idx_campaign_date (campaign_id, snapshot_date)
);

-- 3. Bảng lưu trữ Đề xuất của AI (Proposals)
CREATE TABLE IF NOT EXISTS proposals (
    id VARCHAR(128) PRIMARY KEY,
    business_id VARCHAR(64) NOT NULL,
    campaign_id VARCHAR(128),
    title VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL,
    reason TEXT NOT NULL,
    impact ENUM('high', 'medium', 'low') NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    command_hint VARCHAR(128),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES business_config(id) ON DELETE CASCADE
);

-- 4. Bảng lưu trữ Mệnh lệnh của Sếp (Boss Instructions)
CREATE TABLE IF NOT EXISTS boss_instructions (
    id VARCHAR(128) PRIMARY KEY,
    business_id VARCHAR(64) NOT NULL,
    instruction_text TEXT NOT NULL,
    status ENUM('queued', 'acknowledged', 'completed', 'failed') DEFAULT 'queued',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (business_id) REFERENCES business_config(id) ON DELETE CASCADE
);

-- 5. Bảng Webhook Events (Lưu event thô từ Meta API)
CREATE TABLE IF NOT EXISTS webhook_events (
    id VARCHAR(128) PRIMARY KEY,
    business_id VARCHAR(64),
    event_type VARCHAR(128) NOT NULL,
    payload JSON NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (business_id) REFERENCES business_config(id) ON DELETE SET NULL
);
