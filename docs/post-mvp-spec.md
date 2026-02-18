# Polymancer Post-MVP Spec

Features and improvements planned after MVP launch.

## Trading & Markets

### Live Trading
- Enable pmxt live adapter for real trading
- Requires legal review before activation
- Hard guardrail: disabled by default, require explicit opt-in

### Kalshi Support
- Add Kalshi markets via pmxt SDK
- Expand market universe beyond Polymarket

### Market Data Caching
- Redis/TTL caching for pmxt market data
- Reduce API calls, improve latency
- Cache invalidation strategy

---

## User Interface

### Web Dashboard
- Web UI using existing backend
- Desktop experience for power users
- Same functionality as mobile app

---

## Agent Capabilities

### Hedge Discovery
- Agent tool for finding hedging opportunities
- Scans markets for logical relationships
- Uses LLM to analyze coverage tiers:
  - T1 (≥95%): Near-arbitrage
  - T2 (90-95%): Strong hedge
  - T3 (85-90%): Moderate coverage
- Returns hedge recommendations before trade execution

### Enhanced Research
- Expanded Valyu API capabilities
- Deeper market analysis
- More comprehensive signal detection

---

## LLM & Models

### Model Selection Refinement
- Final LLM model selection for different contexts
- Optimize cost/quality tradeoffs based on MVP data
- Consider fine-tuned models for specific tasks

---

## Open Items (TBD)

- Valyu API rate limits and cost estimation
- Caching strategy and exact TTL values
- Web UI surface and features
- Hedge discovery implementation details
- Agent model selection optimization
