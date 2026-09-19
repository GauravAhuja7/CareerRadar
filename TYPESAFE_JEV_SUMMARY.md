# TypeSafe AI (Jev) - Core Documentation & Architecture Reference

> **Quick Reference**: Jev (`jev-latest`, `jev-1.13.0`) is TypeSafe's flagship **System One** model. Unlike generative "System Two" LLMs that generate freeform conversational text or hallucinate JSON schemas, Jev evaluates **state** against **typed primitives** and outputs calibrated mathematical probability distributions and confidence scores directly usable by application logic.

---

## 1. System One vs System Two

| Dimension | System Two (Generative LLMs) | System One (TypeSafe / Jev) |
| :--- | :--- | :--- |
| **Output Type** | Token-by-token free text generation | Typed mathematical probability distributions |
| **Speed / Latency** | Slow, streaming, variable token generation times | Ultra-fast single-pass parallel evaluation |
| **Determinism** | Stochastic text formatting, parsing errors, hallucinated keys | 100% type-safe JSON with guaranteed primitive structures |
| **Certainty & Calibration** | False confidence, hallucinations, verbal "I think..." | Explicit calibrated `confidence` (0.0 to 1.0) & `probabilities` |
| **Role in Systems** | Reasoning agent, text writer, creative engine | Fast decision gate, router, arbitrator, scorer, validator |

---

## 2. Core Primitives (Question Types)

All questions are sent in a dictionary under `"questions"` and evaluated simultaneously in parallel.

### A. `choice`
Picks one discrete option from a defined set of categorical criteria.
- **Request Parameters**:
  - `type`: `"choice"`
  - `instructions`: Question string (e.g. `"Which emergency action should be taken?"`)
  - `criteria`: Key-value map of identifier to descriptive definition.
- **Response Shape**:
  - `choice`: Selected string key (highest probability).
  - `probabilities`: Object mapping each option key to its probability (sum = 1.0).
  - `confidence`: Calibrated certainty score between `0.0` and `1.0`.

### B. `score`
Rates state along an ordered, continuous spectrum of descriptive levels (0 to N).
- **Request Parameters**:
  - `type`: `"score"`
  - `instructions`: What to measure (e.g. `"Customer risk level"`)
  - `criteria`: Array of strings defining levels from lowest (`0`) to highest (`N`).
- **Response Shape**:
  - `score`: Continuous floating-point value along the spectrum (e.g., `1.84` between level 1 and 2).
  - `legend`: Mapping of indices to level descriptions.
  - `probabilities`: Probability distribution across each level index.
  - `confidence`: Calibrated certainty score between `0.0` and `1.0`.

### C. `noul`
Evaluates a probabilistic yes/no proposition.
- **Request Parameters**:
  - `type`: `"noul"`
  - `instructions`: The proposition to evaluate (e.g. `"The user intends to execute a destructive financial transfer"`)
  - `criteria`: Optional `{ "true": "...", "false": "..." }` to clarify nuances.
- **Response Shape**:
  - `noul`: Floating-point probability between `0.0` and `1.0` representing $P(\text{yes})$.

---

## 3. Confidence & Calibration

- **Probability Distribution Shape**: A sharp peak indicates high confidence; a flat or multimodal distribution indicates ambiguity or lack of sufficient state context.
- **Confidence Property**: Jev computes `confidence` directly from the distribution.
- **Three-Tier Confidence Gating**:
  - **High Confidence ($\ge 0.85$)**: Autonomous immediate execution.
  - **Medium Confidence ($0.50 - 0.85$)**: Verification required (request user confirmation or secondary proof).
  - **Low Confidence ($< 0.50$)**: Fail-safe routing (escalate to human, ask clarifying questions, refuse risky action).

---

## 4. Architectural Patterns

1. **Speculative Fan-Out**:
   Send all primary and contingent questions in a single API call. Since all primitives evaluate in parallel without latency penalties, code can branch conditionally based on answers without multiple round-trips.
2. **Confidence-Gated Routing**:
   Use `confidence` as an independent orthogonal axis. The answer tells *what* to do; `confidence` gates *whether and how* to execute it safely.
3. **Composite Scoring**:
   Decompose complex multi-attribute judgments (e.g. career moves, investment choices, architecture tradeoffs) into atomic `score` primitives, then compute a deterministic weighted composite formula in code.
4. **Agent Orchestration & Context Triage**:
   System One acts as the reflex/governor layer: evaluating whether an autonomous agent has drifted, if user prompts contain latent risks, or choosing the exact optimal tool before spawning expensive generative subagents.

---

## 5. API Reference

- **Endpoint**: `POST https://api.typesafe.ai/v1/systemone`
- **Headers**:
  - `Authorization: Bearer <JEV_API_KEY>`
  - `Content-Type: application/json`
- **Body**:
  ```json
  {
    "model": "jev-latest",
    "state": "<context payload string or structured JSON>",
    "questions": {
      "<id>": { "type": "choice" | "score" | "noul", "instructions": "...", "criteria": ... }
    }
  }
  ```
- **Response**:
  ```json
  {
    "model": "jev-1.13.0",
    "answers": { "<id>": { ... } },
    "usage": { "input_tokens": 120, "output_tokens": 40 }
  }
  ```
