# Connection Reliability Fixes

## Overview
This document tracks all connection reliability improvements needed for the Scout voice application. The goal is to enhance stability and production-readiness without changing the core functionality or user experience.

**Status Legend:** ✅ Complete | 🚧 In Progress | ⏳ Pending | ❌ Blocked

---

## 1. Immediate Fixes (Priority: CRITICAL)
*These issues are causing active disconnections and must be fixed first*

### 1.1 Standardize VAD Settings ⏳
**Problem:** VAD `voiceMs` is inconsistently set (750ms in some places, 500ms in others)
```javascript
// Current: Mixed settings
"voiceMs": 750  // Line 480
"voiceMs": 500  // Lines 505, 561, 759, 789
```
**Fix:** Standardize all to 750ms for better phone number capture
**Impact:** Prevents mid-sentence cutoffs
**Testing:** Make call, speak phone number with pauses

### 1.2 Fix LLM Timeout Configuration ⏳
**Problem:** LLM timeout hardcoded to 5 seconds, too short for complex queries
```javascript
// Current: Line 243
timeout: parseInt(process.env.LLM_TIMEOUT_MS) || 5000
```
**Fix:** Change default to 20000ms to match .env.example
**Impact:** Prevents timeout during high load
**Testing:** Test with complex multi-part questions

### 1.3 Handle Empty AI Responses ✅
**Problem:** AI sometimes returns empty or "..." responses causing confusion
**Fix:** Already implemented fallback message (Line 666-669)
**Testing:** Monitor logs for "Empty or invalid AI response detected"

### 1.4 Remove Duplicate Wrap-up Messages ✅
**Problem:** 60-second wrap-up message added multiple times
**Fix:** Already implemented check to add only once (Lines 612-616)
**Testing:** Call lasting >60 seconds should only show wrap-up once

---

## 2. Response Time Optimizations (Priority: HIGH)

### 2.1 Implement Response Streaming ⏳
**Problem:** Waiting for complete TTS generation before responding (2-3 second delay)
```javascript
// Current approach (blocking):
const audioId = await generateChatterboxTTS(greetingText, callSid);
greetingUrl = `${process.env.WEBHOOK_BASE_URL}/audio/generated/${audioId}`;
```
**Fix:** Return gather immediately, stream audio when ready
```javascript
// Proposed approach (non-blocking):
res.json([
  { verb: "say", text: "One moment please...", synthesizer: { vendor: "default" }},
  { verb: "gather", input: ["speech"], actionHook: "..." }
]);
// Generate TTS in background
setImmediate(() => generateAndCacheTTS(text, callSid));
```
**Impact:** Reduces perceived latency by 2-3 seconds
**Testing:** Measure time from speech end to response start

### 2.2 Pre-cache Common TTS Responses ⏳
**Problem:** Regenerating same greetings and common phrases repeatedly
```javascript
// Add TTS cache similar to responseCache
const ttsCache = new Map();
```
**Fix:** Pre-generate and cache common audio at startup
**Impact:** Instant response for cached phrases
**Testing:** Second call should have faster greeting

### 2.3 Parallel Processing ⏳
**Problem:** Sequential processing of LLM → TTS
**Fix:** Start TTS generation while LLM is still processing predictable parts
**Impact:** 30-50% reduction in total response time
**Testing:** Compare response times before/after

---

## 3. State Management (Priority: HIGH)

### 3.1 Add Redis for Conversation State ⏳
**Problem:** Conversations stored in memory, lost on restart
```javascript
// Current: In-memory
const conversations = new Map();

// Proposed: Redis
const redis = require('redis');
const client = redis.createClient({url: 'redis://redis:6379'});
```
**Fix:** Use Redis for persistent state storage
**Impact:** Survives container restarts, enables scaling
**Testing:** Restart container mid-conversation

### 3.2 Implement Call State Validation ⏳
**Problem:** No validation if call is still active
**Fix:** Check call status before processing
```javascript
async function isCallActive(callSid) {
  // Check with Jambonz API or status webhook
  return callStates.get(callSid) === 'in-progress';
}
```
**Impact:** Prevents processing for dead calls
**Testing:** Process webhook for terminated call

### 3.3 Session Recovery ⏳
**Problem:** No way to recover from temporary failures
**Fix:** Store conversation state with TTL, allow resume
**Impact:** Better user experience during network issues
**Testing:** Simulate network interruption

---

## 4. Connection Maintenance (Priority: MEDIUM)

### 4.1 Add Webhook Response Timeout Handling ⏳
**Problem:** No handling if webhook response takes too long
**Fix:** Add timeout handler with fallback response
```javascript
const timeoutPromise = new Promise((resolve) => {
  setTimeout(() => resolve(getFallbackResponse()), 4000);
});
const response = await Promise.race([generateResponse(), timeoutPromise]);
```
**Impact:** Prevents Jambonz timeout disconnections
**Testing:** Add artificial delay to response generation

### 4.2 Implement Service Health Checks ⏳
**Problem:** No proactive detection of service failures
**Fix:** Add health checks for Ollama, TTS services
```javascript
async function checkServiceHealth() {
  const health = {
    ollama: await checkOllama(),
    chatterbox: await checkChatterbox(),
    coqui: await checkCoqui()
  };
  return health;
}
```
**Impact:** Faster failover to backup services
**Testing:** Stop a service, verify fallback works

### 4.3 Add Connection Quality Monitoring ⏳
**Problem:** No visibility into connection quality
**Fix:** Track metrics per call
```javascript
const callMetrics = {
  responseTimeP50: 0,
  responseTimeP99: 0,
  timeouts: 0,
  errors: 0
};
```
**Impact:** Identify problematic patterns
**Testing:** Generate metrics report after calls

---

## 5. Production Hardening (Priority: MEDIUM)

### 5.1 Circuit Breakers ⏳
**Problem:** Cascading failures when services are down
**Fix:** Implement circuit breaker pattern
```javascript
const CircuitBreaker = require('opossum');
const ollamaBreaker = new CircuitBreaker(generateOllamaResponse, {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
});
```
**Impact:** Faster recovery from service failures
**Testing:** Overload service, verify circuit opens

### 5.2 Exponential Backoff Retry ⏳
**Problem:** Simple retries can overwhelm recovering services
**Fix:** Add exponential backoff
```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}
```
**Impact:** Better recovery behavior
**Testing:** Simulate intermittent failures

### 5.3 Graceful Degradation ⏳
**Problem:** All-or-nothing service responses
**Fix:** Provide degraded but functional service
```javascript
// If Chatterbox fails, try Coqui
// If Coqui fails, use default TTS
// If all fail, use pre-recorded message
```
**Impact:** Service stays up even with failures
**Testing:** Fail each service tier progressively

---

## 6. Monitoring & Observability (Priority: LOW)

### 6.1 Add Detailed Performance Metrics ⏳
**Problem:** Limited visibility into performance bottlenecks
**Fix:** Add detailed timing for each stage
```javascript
const timing = {
  sttStart: Date.now(),
  sttEnd: 0,
  llmStart: 0,
  llmEnd: 0,
  ttsStart: 0,
  ttsEnd: 0,
  totalEnd: 0
};
```
**Impact:** Identify optimization opportunities
**Testing:** Review metrics dashboard

### 6.2 Call Drop Analysis ⏳
**Problem:** No root cause analysis for disconnections
**Fix:** Log detailed state at disconnection
```javascript
function logDisconnection(callSid, reason) {
  logger.error('Call disconnected', {
    callSid,
    reason,
    duration: Date.now() - callStartTimes.get(callSid),
    lastResponse: conversations.get(callSid)?.slice(-1)[0],
    metrics: performanceMetrics.get(callSid)
  });
}
```
**Impact:** Better debugging of issues
**Testing:** Review logs after disconnections

### 6.3 Add Debug Mode ⏳
**Problem:** Hard to troubleshoot production issues
**Fix:** Add debug mode with verbose logging
```javascript
if (process.env.DEBUG_MODE === 'true') {
  logger.setLevel('debug');
  // Log all webhook payloads
  // Log all service requests/responses
}
```
**Impact:** Easier production debugging
**Testing:** Enable debug mode, verify verbose logs

---

## Implementation Order

### Phase 1: Critical Fixes (Week 1)
1. [ ] 1.1 - Standardize VAD Settings
2. [ ] 1.2 - Fix LLM Timeout Configuration
3. [ ] 2.1 - Implement Response Streaming
4. [ ] 4.1 - Add Webhook Response Timeout Handling

### Phase 2: Stability (Week 2)
1. [ ] 3.1 - Add Redis for Conversation State
2. [ ] 2.2 - Pre-cache Common TTS Responses
3. [ ] 4.2 - Implement Service Health Checks
4. [ ] 5.1 - Circuit Breakers

### Phase 3: Optimization (Week 3)
1. [ ] 2.3 - Parallel Processing
2. [ ] 3.2 - Implement Call State Validation
3. [ ] 5.2 - Exponential Backoff Retry
4. [ ] 5.3 - Graceful Degradation

### Phase 4: Observability (Week 4)
1. [ ] 6.1 - Add Detailed Performance Metrics
2. [ ] 6.2 - Call Drop Analysis
3. [ ] 6.3 - Add Debug Mode
4. [ ] 3.3 - Session Recovery

---

## Testing Strategy

### Load Testing
```bash
# Simulate 10 concurrent calls for 5 minutes
npm run test:load -- --concurrent 10 --duration 300
```

### Chaos Testing
```bash
# Randomly kill services during calls
npm run test:chaos -- --services ollama,chatterbox
```

### Performance Baseline
- P50 Response Time: < 1.5s
- P99 Response Time: < 3s
- Error Rate: < 0.1%
- Call Success Rate: > 99.9%

---

## Success Metrics

- **Before:** ~20% call drop rate, 3-5 second response times
- **Target:** <1% call drop rate, <2 second response times
- **Measurement:** Track daily metrics in production

---

## Notes

- All changes must maintain backward compatibility
- No changes to user experience or conversation flow
- Prioritize fixes that reduce call drops
- Test each fix in isolation before combining

Last Updated: 2024-08-26