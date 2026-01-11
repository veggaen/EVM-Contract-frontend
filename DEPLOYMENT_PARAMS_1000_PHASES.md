# Deployment Parameters for 1000 Phases Contract

## Requirements
- **Total Phases**: 1000
- **Phase 0-10**: 1 hour each, 50,000 tokens each
- **Phase 11**: 2 hours, random 0-1,000,000 tokens
- **Phase 12-999**: 1 day each, baseline allocation (distributed from remaining supply)

## Constructor Parameters

### Basic Parameters
```
name_: "MrManMan"
symbol_: "MMM"
premintRecipient_: 0x7941E2333247c49162f42B4b8ac1beD1Ce3d30a7
totalSupply_: 1000000000000000000000000 (1 billion tokens with 18 decimals)
premintInfo_: ["2500", "0", "0"] (25% premint, 250M tokens)
phaseCount_: 1000
phaseDurations_: ["3600", "86400"] (Phase 0: 1hr=3600s, default: 1day=86400s)
minContributionWei_: 1000000000000000 (0.001 ETH)
```

### Custom Allocations (Phases 0-10 only)
```json
customAllocs_: [
  [0, "50000000000000000000000"],   // Phase 0: 50,000 tokens
  [1, "50000000000000000000000"],   // Phase 1: 50,000 tokens
  [2, "50000000000000000000000"],   // Phase 2: 50,000 tokens
  [3, "50000000000000000000000"],   // Phase 3: 50,000 tokens
  [4, "50000000000000000000000"],   // Phase 4: 50,000 tokens
  [5, "50000000000000000000000"],   // Phase 5: 50,000 tokens
  [6, "50000000000000000000000"],   // Phase 6: 50,000 tokens
  [7, "50000000000000000000000"],   // Phase 7: 50,000 tokens
  [8, "50000000000000000000000"],   // Phase 8: 50,000 tokens
  [9, "50000000000000000000000"],   // Phase 9: 50,000 tokens
  [10, "50000000000000000000000"]   // Phase 10: 50,000 tokens
]
// Phase 11: SKIPPED - it's a random phase
// Phases 12-999: Use baseline allocation (no custom allocation needed)
```

### Custom Durations
```json
customDurations_: [
  [1, "3600"],   // Phase 1: 1 hour
  [2, "3600"],   // Phase 2: 1 hour
  [3, "3600"],   // Phase 3: 1 hour
  [4, "3600"],   // Phase 4: 1 hour
  [5, "3600"],   // Phase 5: 1 hour
  [6, "3600"],   // Phase 6: 1 hour
  [7, "3600"],   // Phase 7: 1 hour
  [8, "3600"],   // Phase 8: 1 hour
  [9, "3600"],   // Phase 9: 1 hour
  [10, "3600"],  // Phase 10: 1 hour
  [11, "7200"]   // Phase 11: 2 hours
]
// Phase 0 uses PHASE_0_DURATION (3600 = 1 hour)
// Phases 12-999 use default PHASE_DURATION (86400 = 1 day)
```

### Random Phases
```json
randomPhases_: [
  [11, "1000000000000000000000000"]  // Phase 11: Random 0-1,000,000 tokens (1M with 18 decimals)
]
```

### Staking Parameters
```
stakingParams_: ["1", "3650", "2592000", "9000"]
// minStakeDays: 1
// maxStakeDays: 3650
// gracePeriodSec: 2592000 (30 days)
// earlyPenaltyMaxBps: 9000 (90%)
```

## For Remix Deployment (Compact Format)

Copy these parameters into Remix:

**Basic Params:**
```
name_: MrManMan
symbol_: MMM
premintRecipient_: 0x7941E2333247c49162f42B4b8ac1beD1Ce3d30a7
totalSupply_: 1000000000000000000000000
premintInfo_: ["2500", "0", "0"]
phaseCount_: 1000
phaseDurations_: ["3600", "86400"]
minContributionWei_: 1000000000000000
```

**Custom Allocations (11 phases):**
```
customAllocs_: [
  [0, "50000000000000000000000"],
  [1, "50000000000000000000000"],
  [2, "50000000000000000000000"],
  [3, "50000000000000000000000"],
  [4, "50000000000000000000000"],
  [5, "50000000000000000000000"],
  [6, "50000000000000000000000"],
  [7, "50000000000000000000000"],
  [8, "50000000000000000000000"],
  [9, "50000000000000000000000"],
  [10, "50000000000000000000000"]
]
```

**Custom Durations (11 phases):**
```
customDurations_: [
  [1, "3600"],
  [2, "3600"],
  [3, "3600"],
  [4, "3600"],
  [5, "3600"],
  [6, "3600"],
  [7, "3600"],
  [8, "3600"],
  [9, "3600"],
  [10, "3600"],
  [11, "7200"]
]
```

**Random Phases:**
```
randomPhases_: [[11, "1000000000000000000000000"]]
```

**Staking:**
```
stakingParams_: ["1", "3650", "2592000", "9000"]
```

## Token Distribution Summary
- **Phases 0-10**: 11 phases × 50,000 = 550,000 tokens (fixed)
- **Phase 11**: Random 0-1,000,000 tokens
- **Phases 12-999**: 988 phases using baseline allocation
  - Remaining supply: 750,000,000 - 550,000 = 749,450,000 tokens (excluding random phase)
  - Baseline phases share this amount based on weights

## Baseline Allocation Explanation

Phases 12-999 will automatically receive tokens based on the baseline distribution:
- The contract reserves 10% of baseline tokens for the first 10 baseline phases (BASELINE_FIRST_N_DAYS = 10)
- The remaining 90% is distributed evenly among all other baseline phases
- Since phases 0-11 are custom/random, phases 12-21 get the 10% share
- Phases 22-999 get the remaining 90% share

**Calculation for phases 12-999:**
- Remaining supply after custom allocations: ~749,450,000 tokens
- Phases 12-21 (10 phases): Share 10% = ~74,945,000 tokens / 10 = ~7,494,500 tokens per phase
- Phases 22-999 (978 phases): Share 90% = ~674,505,000 tokens / 978 = ~689,680 tokens per phase

## Time Distribution Summary
- **Phases 0-10**: 11 phases × 1 hour = 11 hours
- **Phase 11**: 2 hours
- **Phases 12-999**: 988 phases × 1 day = 988 days
- **Total Duration**: ~999 days = ~2.74 years

## Important Notes

1. **Phase 0 duration**: Uses `PHASE_0_DURATION` (3600 = 1 hour), so you don't need to include it in `customDurations_`

2. **Random Phase**: Phase 11 will generate a random value between 0 and 1,000,000 tokens when someone first mints from it after it ends

3. **Baseline Phases**: Phases 12-999 automatically use baseline allocation based on weights:
   - Phases 12-21: Get 10% of baseline tokens (higher per-phase allocation)
   - Phases 22-999: Get 90% of baseline tokens (shared equally)

4. **Gas Considerations**: With 1000 phases, deploying with only 11 custom allocations is very gas-efficient. The baseline system handles the rest automatically.

5. **Total Supply Check**: 
   - Premint: 250,000,000 tokens
   - Custom (phases 0-10): 550,000 tokens
   - Random max: 1,000,000 tokens
   - **Total reserved**: ~251,550,000 tokens
   - **Remaining for baseline**: ~748,450,000 tokens ✅

6. **Contract Support**: The contract already supports up to 1000 phases (hardcoded limit in constructor)
