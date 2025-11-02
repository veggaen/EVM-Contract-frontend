# Deployment Parameters for Dev-Mode Contract

## Contract Configuration

### Basic Info
- **name_**: `MrManMan`
- **symbol_**: `MMM`
- **premintRecipient_**: `0x7941E2333247c49162f42B4b8ac1beD1Ce3d30a7`
- **totalSupply_**: `1000000000000000000000000` (1,000,000 tokens with 18 decimals)
- **premintInfo_**: `["2500", "0", "0"]` (25% premint = 250,000 tokens)
- **phaseCount_**: `7` (phases 0-6)
- **minContributionWei_**: `1000000000000000` (0.001 ETH minimum)

### Phase Durations
- **phaseDurations_**: `["900", "86400"]`
  - Phase 0 duration: 900 seconds (15 minutes)
  - Default duration: 86400 seconds (1 day) - will be overridden by customDurations

### Phase Allocations
- **customAllocs_**: 
  - Phase 0: `[0, 10000000000000000000000]` (10,000 tokens)
  - Phase 1: `[1, 100000000000000000000000]` (100,000 tokens)
  - Phase 4: `[4, 250000000000000000000000]` (250,000 tokens)
  - Phases 2, 3, 5, 6: Use baseline/default distribution

### Custom Durations
- **customDurations_**: 
  - `[0, 900]` - Phase 0: 15 minutes
  - `[1, 900]` - Phase 1: 15 minutes
  - `[2, 900]` - Phase 2: 15 minutes
  - `[3, 900]` - Phase 3: 15 minutes
  - `[4, 900]` - Phase 4: 15 minutes
  - `[5, 3600]` - Phase 5: 1 hour
  - `[6, 3600]` - Phase 6: 1 hour

### Random Phases
- **randomPhases_**: `[3, 500000000000000000000000]`
  - Phase 3: Random reward between 100,000 and 500,000 tokens

### Staking Parameters
- **stakingParams_**: `[1, 3650, 2592000, 9000]`
  - Min stake days: 1
  - Max stake days: 3650
  - Grace period: 2592000 seconds (30 days)
  - Early penalty max: 9000 basis points (90%)

## Remix Deployment Format

Copy these values into Remix Deploy tab:

```
name_: MrManMan
symbol_: MMM
premintRecipient_: 0x7941E2333247c49162f42B4b8ac1beD1Ce3d30a7
totalSupply_: 1000000000000000000000000
premintInfo_: ["2500", "0", "0"]
phaseCount_: 7
phaseDurations_: ["900", "86400"]
minContributionWei_: 1000000000000000
customAllocs_: [[0, 10000000000000000000000], [1, 100000000000000000000000], [4, 250000000000000000000000]]
customDurations_: [[0, 900], [1, 900], [2, 900], [3, 900], [4, 900], [5, 3600], [6, 3600]]
randomPhases_: [[3, 500000000000000000000000]]
stakingParams_: [1, 3650, 2592000, 9000]
```

## Phase Summary

| Phase | Duration | Allocation | Type |
|-------|----------|------------|------|
| 0 | 15 min | 10,000 tokens | Custom |
| 1 | 15 min | 100,000 tokens | Custom |
| 2 | 15 min | Baseline/Default | Default |
| 3 | 15 min | 100,000-500,000 tokens | Random |
| 4 | 15 min | 250,000 tokens | Custom |
| 5 | 1 hour | Baseline/Default | Default |
| 6 | 1 hour | Baseline/Default | Default |

## Notes

- Phase 3 uses random rewards: minimum 100,000 tokens, maximum 500,000 tokens
- Phases 2, 5, and 6 will use the baseline distribution formula (default behavior)
- Total time for all phases: (5 × 15 min) + (2 × 1 hour) = 75 minutes + 2 hours = 3 hours 15 minutes
- After deployment, update `lib/wagmi.ts` with the new contract address

