# Live Trading Architecture (Phase 2)

**Status**: Architecture specification only - NOT IMPLEMENTED in MVP  
**Purpose**: Comprehensive design for transitioning from paper to live trading  
**Prerequisites**: Legal compliance, KYC/AML, regulatory licensing

---

## Overview

This document describes the architecture for Phase 2: Live Trading on Polymarket. It builds upon the Paper Trading MVP (docs/design-specs.md) and adds:

1. **Credential Management**: Secure storage and usage of Polymarket API keys
2. **Order Execution**: Real trade submission to Polymarket CLOB
3. **Compliance**: KYC/AML, regulatory requirements
4. **Enhanced Security**: Custodial key management
5. **Risk Management**: Additional safeguards for real money

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Mobile App    │───▶│  Elysia API     │───▶│    Supabase     │
│  (Expo + RN)    │◄────│   (Bun)         │◄────│  (PostgreSQL)   │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
             ┌───────────┐ ┌──────────┐ ┌──────────────┐
             │OpenRouter │ │ Inngest  │ │  Polymarket  │
             │ (AI)      │ │ (Jobs)   │ │  (CLOB)      │
             └───────────┘ └──────────┘ └──────┬───────┘
                                               │
                                       ┌───────▼─────────┐
                                       │  Polygon        │
                                       │  (Blockchain)   │
                                       └─────────────────┘
```

**Key Addition**: Direct integration with Polymarket CLOB for order signing and submission.

---

## Credential Management

### 1. Credential Import Flow

**User Journey**:
1. User navigates to Settings → Credentials
2. Guided flow to create Polymarket proxy wallet
3. Export API credentials from Polymarket
4. Paste into secure form in app
5. **Validation**: Backend tests credentials immediately
6. **Encryption**: Credentials encrypted via Supabase Vault
7. **Storage**: Stored in `api_credentials` table

**Validation Steps**:
```typescript
// 1. Test API authentication
const testResponse = await polymarketApi.testKey(apiKey, apiSecret);
if (!testResponse.success) throw new Error('Invalid API credentials');

// 2. Test private key (sign test message)
const testSignature = await signTestMessage(privateKey);
if (!verifySignature(testSignature)) throw new Error('Invalid private key');

// 3. Check wallet has USDC and MATIC
const balances = await getWalletBalances(address);
if (balances.usdc < 10) warn('Low USDC balance');
if (balances.matic < 0.1) warn('Low MATIC for gas');

// 4. Store encrypted
await db.api_credentials.create({
  user_id: user.id,
  api_key: await vault.encrypt(apiKey),
  api_secret: await vault.encrypt(apiSecret),
  passphrase: await vault.encrypt(passphrase),
  private_key: await vault.encrypt(privateKey),
  validation_status: 'valid',
  validated_at: now()
});
```

### 2. Encryption Strategy

**At Rest**:
- Supabase Vault (AES-256-GCM) for all credential fields
- Column-level encryption on `api_key`, `api_secret`, `passphrase`, `private_key`
- Encryption keys managed by Supabase, rotated automatically

**In Transit**:
- TLS 1.3 for all API communication
- Certificate pinning on mobile app (optional)

**In Memory**:
- Keys decrypted only during signing operations
- Maximum 30-second window for key in memory
- Explicit memory clearing after use:
```typescript
const decryptedKey = await vault.decrypt(encryptedKey);
try {
  const signature = await signOrder(decryptedKey, order);
  return signature;
} finally {
  // Explicitly clear memory
  decryptedKey.fill(0);
}
```

### 3. Key Export Flow

**Security Requirements**:
1. **Re-authentication**: User must re-enter OAuth credentials
2. **MFA Challenge**: If MFA enabled, require code
3. **24-Hour Delay**: Keys available after 24-hour waiting period
4. **Email Confirmation**: Notification sent on export request and completion
5. **One-Time Display**: Keys shown once, never stored client-side
6. **Audit Trail**: Log all exports with IP, timestamp, device

**Implementation**:
```typescript
// Request export
POST /credentials/export/request
- Verify user authentication (fresh)
- Check no export in last 30 days
- Create export_request record with 24h delay
- Send confirmation email

// Complete export (after 24h)
POST /credentials/export/complete
- Verify export_request exists and delay passed
- Decrypt credentials
- Return plaintext (one-time)
- Mark as exported in audit log
- Send completion notification
```

### 4. Key Rotation

**Automatic Rotation**:
- 90-day rotation reminder
- Push notification: "Your API keys are 90 days old. Rotate for security."
- Grace period: 30 days to rotate before mandatory pause

**Manual Rotation**:
1. User imports new credentials
2. System validates new credentials
3. Atomic swap: new credentials active, old marked deprecated
4. 7-day overlap: both keys work during transition
5. Revoke old keys on Polymarket
6. Delete old credentials from database

---

## Unlock Mechanism (Paper → Live)

### Requirements

**Current Paper Trading**:
- 24-hour minimum paper trading
- 10 executed trades minimum
- **BUG FIX**: Count only THIS bot's paper trades (not all-time)

**Additional Live Requirements**:
1. **KYC Verification**: Identity verified via SumSub/Onfido
2. **Risk Acknowledgment**: 
   - Complete 5-question risk quiz
   - Type acknowledgment: "I understand I may lose real money"
   - 24-hour cooling off period after unlock
3. **Tier Verification**: User must have paid tier (Basic or Pro)
4. **Credential Validation**: API credentials tested and valid
5. **Minimum Balance**: Paper balance shows understanding (no minimum, but tracked)

### Unlock Flow

```
Paper Trading Complete (24h + 10 trades)
    ↓
KYC Verification Required
    ↓
Identity Documents Uploaded → SumSub Review
    ↓
KYC Approved
    ↓
Risk Quiz + Acknowledgment
    ↓
24-Hour Cooling Off Period
    ↓
UNLOCKED - Eligible for Live Trading
    ↓
User Explicitly Activates Live Mode
    ↓
BOT GOES LIVE (type='live')
```

**Important**: Unlock is eligibility, not automatic activation. User must explicitly choose to go live.

---

## Live Trading Execution

### Differences from Paper Trading

| Aspect | Paper | Live |
|--------|-------|------|
| Execution | Simulated against order book | Real order submission to CLOB |
| Slippage | Predicted from book | Actual fill price |
| Fees | Simulated (2%) | Actual Polymarket fees |
| Balance | Paper balance tracking | Real USDC balance |
| Speed | Instant simulation | Network latency + blockchain confirmation |
| Risk | Virtual loss | Real monetary loss |

### Execution Flow

```
Step 1-6: Same as paper trading (FOK simulation, risk validation)
    ↓
Step 7: LIVE EXECUTION (different from paper)
    ↓
7a: Load decrypted credentials from Vault
7b: Construct EIP-712 order structure
7c: Sign order with private key
7d: Submit signed order to Polymarket CLOB
7e: Wait for confirmation (poll transaction status)
7f: Get actual fill price from response
7g: Calculate actual slippage vs predicted
    ↓
Step 8: Record with actual execution data
```

### Order Signing (EIP-712)

```typescript
import { ClobClient } from '@polymarket/clob-client';

// Load credentials
const credentials = await db.api_credentials.get(userId);
const privateKey = await vault.decrypt(credentials.private_key);

// Initialize CLOB client
const clobClient = new ClobClient({
  host: 'https://clob.polymarket.com',
  chainId: 137, // Polygon
  wallet: new Wallet(privateKey)
});

// Create and sign order
const order = await clobClient.createOrder({
  tokenId: market.tokenId,
  side: Side.BUY,
  size: shares,
  price: price,
  feeRateBps: 200, // 2%
});

const signedOrder = await clobClient.signOrder(order);

// Submit order
const response = await clobClient.postOrder(signedOrder, OrderType.FOK);

// Handle response
if (response.status === 'matched') {
  // Order filled
  const fillPrice = response.price;
  const filledSize = response.size;
} else if (response.status === 'rejected') {
  // FOK rejected - insufficient liquidity
}
```

### Transaction Monitoring

**States**:
1. **Submitted**: Order sent to Polymarket
2. **Pending**: Awaiting blockchain confirmation
3. **Confirmed**: On-chain, 1+ block confirmations
4. **Finalized**: 12+ blocks, considered final
5. **Failed**: Rejected or failed on-chain

**Monitoring**:
- Background job polls transaction status every 30 seconds
- Alert if pending > 5 minutes
- Track transaction_hash in trade_logs
- Handle blockchain reorgs (rare but possible)

---

## Risk Management (Live)

### Additional Live-Only Risk Checks

1. **Gas Balance Check**:
   - Verify wallet has >0.1 MATIC for gas
   - Alert user if low
   - Block trades if <0.01 MATIC

2. **USDC Balance Check**:
   - Verify sufficient USDC for trade
   - Check both allowance and balance
   - Alert if USDC.e approval needed

3. **Slippage Differential Monitoring**:
   - Track predicted vs actual slippage
   - Alert if live slippage consistently > predicted by 1%
   - Adjust user slippage thresholds based on historical data

4. **Daily Loss Limits (Enforced)**:
   - Hard stop when daily loss limit hit
   - Cannot override until next day
   - Automatic bot pause

5. **Circuit Breakers**:
   - If >20% of live bots fail in 10 minutes → pause all live trading
   - If Polymarket API error rate >50% → pause all live trading
   - Manual resume required

### Emergency Procedures

**Per-User Emergency Stop**:
```sql
-- Freeze specific user
UPDATE users SET trading_frozen = true WHERE id = 'user_id';
-- Immediate effect: all bots paused
```

**Per-Bot Emergency Stop**:
```sql
-- Emergency stop specific bot
UPDATE bots SET 
  status = 'paused',
  emergency_stopped = true,
  emergency_stopped_at = now(),
  emergency_stopped_reason = 'User request'
WHERE id = 'bot_id';
```

**Position Liquidation**:
- Emergency stop can include "close all positions"
- Market sell all holdings immediately
- Track emergency liquidation P&L separately
- Notify user of liquidation results

---

## Compliance & Legal

### KYC/AML Requirements

**Identity Verification**:
- **Provider**: SumSub, Onfido, or Jumio
- **Documents**: Government ID, proof of address
- **Liveness Check**: Selfie verification
- **Review Time**: Automatic (<5 min) or manual (24-48h)

**Ongoing Monitoring**:
- Daily sanctions list screening (OFAC, UN, EU)
- Transaction monitoring for suspicious activity
- Automated alerts for high-risk patterns

### Regulatory Considerations

**Potential Licenses Required**:
1. **MSB Registration** (FinCEN) - If transmitting money
2. **Money Transmitter Licenses** - State-by-state (US)
3. **CFTC/NFA Registration** - If trading derivatives
4. **Securities Registration** - If prediction markets deemed securities

**Recommendation**: Engage crypto-specialized legal counsel before Phase 2 launch.

### Data Retention

**Regulatory Requirements**:
- Trade records: 7 years
- KYC documents: 5 years after account closure
- Audit logs: 7 years
- Suspicious activity reports: 5 years

**Audit Trail**:
- Immutable log of all administrative actions
- Cryptographically signed trade logs
- Regular third-party audits

---

## Paper vs Live Behavioral Differences

### Network Latency

**Paper**: Instant execution simulation
**Live**: 200-500ms network latency + blockchain confirmation

**Mitigation**:
- Add 200ms artificial delay to paper (optional)
- Use stale order book (5-min old) for paper simulation
- Track latency impact on fills

### Market Impact

**Paper**: Uses current order book (no impact modeled)
**Live**: Large trades move the market

**Mitigation**:
- Calculate market impact: `trade_size / order_book_depth`
- Reject if impact >10%
- Warn user: "This trade would move the market significantly"

### Price Movement

**Paper**: Price at decision = price at execution
**Live**: Price can move between decision and execution

**Mitigation**:
- Record price at decision time
- Record price at execution time
- Reject if price moved >1% against user
- Configurable: `max_acceptable_price_movement_percent`

---

## Testing Strategy

### Shadow Trading

**Phase 2 Pre-Launch**:
- Run paper and live in parallel for 30 days
- Submit live trades with minimum size ($0.01)
- Compare paper predictions vs live results
- Adjust algorithms based on divergence

### Testnet Integration

**Polymarket Testnet**:
- Test all live trading logic on testnet first
- Use testnet USDC (no real money)
- Verify end-to-end flow before mainnet

### Graduated Rollout

**Week 1-2**: $1 max trade size
**Week 3-4**: $10 max trade size  
**Week 5+**: Full limits

**User Tiers**:
- New live users: $100 daily limit for first month
- Verified users: Full limits after 30 days

---

## Migration from Paper to Live

### Schema Changes

```sql
-- Add to trade_logs
ALTER TABLE trade_logs ADD COLUMN type ENUM('paper', 'live');
ALTER TABLE trade_logs ADD COLUMN transaction_hash VARCHAR(66);
ALTER TABLE trade_logs ADD COLUMN confirmation_blocks INTEGER;

-- Add to bots
ALTER TABLE bots ADD COLUMN is_unlocked_for_live BOOLEAN DEFAULT false;
ALTER TABLE bots ADD COLUMN unlocked_at TIMESTAMPTZ;
ALTER TABLE bots ADD COLUMN kyc_verified BOOLEAN DEFAULT false;

-- Add to users
ALTER TABLE users ADD COLUMN kyc_status ENUM('unverified', 'pending', 'verified', 'rejected');
ALTER TABLE users ADD COLUMN kyc_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN trading_frozen BOOLEAN DEFAULT false;
```

### Data Migration

1. **Existing Paper Bots**: All remain paper-only
2. **New Bots**: Can be created as live (if user unlocked)
3. **User Choice**: Can have both paper and live bots
4. **Gradual Transition**: Users can test strategies in paper before live

---

## Security Checklist

### Before Phase 2 Launch

- [ ] Security audit by third-party firm
- [ ] Penetration testing (credentials, API, webhooks)
- [ ] Bug bounty program established
- [ ] Incident response plan documented
- [ ] Key management procedures tested
- [ ] Disaster recovery tested (credential corruption scenario)
- [ ] Compliance review completed
- [ ] Legal opinion obtained on regulatory status
- [ ] Insurance secured (if available)
- [ ] Customer support trained on live trading issues

### Ongoing Security

- [ ] Quarterly security audits
- [ ] Monthly access reviews
- [ ] Weekly vulnerability scans
- [ ] Real-time monitoring for anomalies
- [ ] Annual penetration testing

---

## Cost Considerations

### Additional Costs (Phase 2)

| Item | Estimated Monthly Cost |
|------|----------------------|
| KYC Provider (SumSub) | $0.50 - $2.00 per verification |
| Enhanced Monitoring | $200 - $500 |
| Security Audit | $10,000 - $50,000 (one-time) |
| Legal Counsel | $5,000 - $20,000 (ongoing) |
| Compliance Software | $500 - $2,000 |
| Insurance | $1,000 - $5,000 |

**Total Additional Monthly**: ~$7,000 - $30,000+

---

## Timeline Estimate

**Phase 2 Development**: 3-6 months
**Legal/Compliance**: 2-4 months (parallel)
**Security Audit**: 1-2 months
**Testing**: 1-2 months

**Total Time to Live Trading**: 6-12 months from Phase 1 completion

---

## Conclusion

Live trading transforms Polymancer from a simulation tool into a financial service. The complexity increases 10x, requiring:

1. **Legal Compliance**: KYC, AML, regulatory licenses
2. **Security**: Custodial key management, encryption, audits
3. **Risk Management**: Real money safeguards, circuit breakers
4. **Operations**: 24/7 monitoring, incident response

**Recommendation**: Do not attempt Phase 2 until:
- Legal counsel confirms regulatory pathway
- Security audit passed
- Compliance infrastructure operational
- 12-month runway secured

Paper trading MVP is the foundation. Live trading is a regulated financial service requiring a different operational maturity.
