# AxiomDSF

**AI-Powered Software Development Factory**

*Project Guide & Tutorial for Incoming Team*

*Version 1.0 | April 2026*

---

## Table of Contents

1. [GitHub Copilot & GitHub CLI Configuration](#1-github-copilot--github-cli-configuration)
2. [Creating a Custom Agent](#2-creating-a-custom-agent)
3. [Invoking GitHub CLI Directly from Code](#3-invoking-github-cli-directly-from-code)
4. [Axiom DSF — Core Idea & Architecture](#4-axiom-dsf--core-idea--architecture)
5. [Design Patterns](#5-design-patterns)
6. [Agents in the System](#6-agents-in-the-system)
7. [How the Orchestrator Works](#7-how-the-orchestrator-works)
8. [End-to-End System Flow](#8-end-to-end-system-flow)
9. [Workflow Execution](#9-workflow-execution)
10. [Command Line Interface (CLI)](#10-command-line-interface-cli)
11. [User Interface (Angular Frontend)](#11-user-interface-angular-frontend)
12. [MCP Integration (Azure DevOps)](#12-mcp-integration-azure-devops)
13. [Commands to Build & Run the Application](#13-commands-to-build--run-the-application)
14. [Project Directory Reference](#14-project-directory-reference)

---

## 1. GitHub Copilot & GitHub CLI Configuration

### What is GitHub Copilot CLI?

GitHub Copilot is an AI-powered coding assistant. In AxiomDSF we use the **Copilot CLI extension** (`@github/copilot-cli`) to run AI agents from the command line. Each agent receives a structured markdown prompt and returns structured output — no IDE needed.

### Prerequisites

- **Node.js ≥ 18** — required for the Copilot CLI npm package.
- **GitHub CLI (`gh`)** — install from `https://cli.github.com`.
- **Copilot CLI extension** — installed via `gh extension install github/gh-copilot`.
- A GitHub account with an active **Copilot license** (Individual, Business, or Enterprise).

### Installation & Login

```bash
# Install GitHub CLI (Windows - winget)
winget install --id GitHub.cli

# Authenticate
gh auth login          # Follow the browser-based OAuth flow

# Install the Copilot extension
gh extension install github/gh-copilot

# Verify
gh copilot --version
```

### Configuration Used in AxiomDSF

The backend knows the absolute path to the Copilot CLI binary. This is set in `config/src/main/resources/application.yaml`:

```yaml
agent:
  execution:
    provider: copilot-cli
    copilot-command: C:\Users\<your-user>\AppData\Roaming\npm\copilot.cmd
    timeout-minutes: 60
```

> **Tip:** Update `copilot-command` to match your local npm global path. Run `where copilot` or `npm root -g` to find it.

---

## 2. Creating a Custom Agent

### Agent Definition Files

Every agent is defined as a **Markdown file** inside `.github/agents/`. The file name follows the pattern `<AgentName>.agent.md`.

### File Structure (AIM Model)

All AxiomDSF agents follow a consistent **AIM Model**:

```markdown
---
name: MyNewAgent
description: Brief role description
tools:
  - view
---

> OUTPUT DISCIPLINE: ONLY structured markdown. NO thinking, NO narration.
> Start directly with a # heading. Lines like "Let me..." are FORBIDDEN.

# AIM MODEL

## A — Act as
Describe the agent's persona and responsibility.

## I — Inputs are
List what artifacts this agent receives.

## M — Mission is
Describe the deliverables and output format.

# CORE INSTRUCTIONS
## You MUST:
- Rule 1
- Rule 2

## You MUST NOT:
- Anti-pattern 1

# OUTPUT TEMPLATE
<Markdown structure the agent must follow>
```

### Step-by-Step: Adding a New Agent

1. Create `.github/agents/MyNewAgent.agent.md` using the AIM template above.

2. Register the agent in `config/src/main/resources/application.yaml` under `agent.pipeline.agents`:

```yaml
- agentType: MY_NEW_AGENT
  agentName: MyNewAgent
  agentFilePath: MyNewAgent.agent.md
  outputDirectory: mynewagent/
  nextAgent: <NextAgentName or null>
  executionOrder: 11
  enabled: true
  mandatory: false
  dependencies:
    - CODING
```

3. Add the enum value in `business/.../model/AgentType.java`:

```java
MY_NEW_AGENT
```

4. Register it in the CLI's `AgentRegistry.java` with sequence, name, short name, I/O files.

5. Rebuild & test.

> **Key Rules for Agent Prompts:**
> - Output discipline is critical — agents must not produce narration or "thinking" text.
> - Mermaid diagrams are mandatory for HLD agent (enforced in prompt).
> - TDD agent must produce ≥70% compilable test code.
> - Coding agent outputs must compile and run without modification.

---

## 3. Invoking GitHub CLI Directly from Code

### How AxiomDSF Calls Copilot

The class `CopilotAgentService.java` (in the `business` module) launches Copilot as an **OS process** via Java's `ProcessBuilder`.

#### The Command Constructed

```
copilot.cmd --agent {AgentName}
            -p "{combined prompt text}"
            --allow-all
            --no-ask-user
            --output-format text
            --add-dir .github
            --add-dir {workspace-directory}
```

#### Execution Flow Inside `CopilotAgentService`

1. **Prompt Preparation** — A combined `_Prompt.md` file is created containing agent name, project context, output file reference, detailed instructions, and full input content.
2. **Process Launch** — `ProcessBuilder` starts `copilot.cmd` with the arguments above. Working directory is set to the workspace root. Stderr is redirected to stdout. Stdin is redirected to NUL (EOF).
3. **Monitoring** — A background thread reads stdout to prevent pipe buffer blocking. The main thread waits with a configurable timeout (default 60 minutes).
4. **Output Collection** — Preferred: read from the output file the agent was instructed to write. Fallback: use captured stdout.
5. **Sanitisation** — CLI noise is stripped using regex patterns (tool-use bullets, session stats, narration lines). Clean markdown is written back to the output file.

#### Key Method Signatures

```java
public String invokeAgent(Workspace workspace, String agentName)
public String invokeAgent(Workspace workspace, String agentName, Long userStoryId)
```

#### Output Sanitisation Patterns Removed

```
Lines starting with: ●, ✗, └, "Path does not", "Total usage est:",
"API time spent:", "Total session time:" ...

Narration patterns truncated at:
"I need to write", "Let me create", "$outputPath", "## Write the file"
```

> **Tip:** If you need to debug agent invocation, look at the `_Prompt.md` file generated inside each agent's output directory — it contains the exact prompt sent to Copilot.

---

## 4. Axiom DSF — Core Idea & Architecture

### What is AxiomDSF?

**AxiomDSF (Axiom Development Software Factory)** is a multi-module application that automates the entire Software Development Lifecycle (SDLC) using a pipeline of 10 AI agents. You provide a raw software requirement and the system produces — through a chain of AI-driven steps — refined requirements, architecture documents, user stories, test cases, implementation code, code analysis, and a security report.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AxiomDSF System                          │
│                                                                 │
│  ┌──────────┐   ┌──────────────┐   ┌────────────────────────┐  │
│  │ Angular  │   │  Spring Boot │   │   GitHub Copilot CLI   │  │
│  │ Frontend │──▶│  REST API    │──▶│   (10 AI Agents)       │  │
│  │ (Port    │   │  (Port 8080) │   │                        │  │
│  │  4200)   │   │              │   └────────────────────────┘  │
│  └──────────┘   │              │                                │
│                 │              │   ┌────────────────────────┐  │
│  ┌──────────┐   │              │──▶│   Azure DevOps API     │  │
│  │   CLI    │──▶│              │   │   (Wiki, Work Items,   │  │
│  │  (REPL)  │   │              │   │    Branches)           │  │
│  └──────────┘   └──────┬───────┘   └────────────────────────┘  │
│                        │                                        │
│                 ┌──────▼───────┐                                │
│                 │   SQLite DB  │                                │
│                 │ (axiomdsf.db)│                                │
│                 └──────────────┘                                │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend Framework | Spring Boot 4.0.3, Java 17 |
| Build Tool | Maven (multi-module) |
| Database | SQLite 3.45 with Hibernate Community Dialects (WAL mode, pool size 1) |
| API Documentation | SpringDoc OpenAPI / Swagger UI 2.5.0 |
| Frontend | Angular 17, Angular Material, TypeScript 5.2, RxJS 7 |
| AI Integration | GitHub Copilot CLI (process-based invocation) |
| External Services | Azure DevOps REST API (branches, wikis, work items) |
| CLI | Standalone Java JAR (JARs-with-dependencies) |
| Async Execution | ThreadPoolTaskExecutor (4–8 core threads) |

### Maven Modules

| Module | Artifact ID | Responsibility |
|--------|-------------|---------------|
| `config` | axiomdsf-config | Shared configuration, application.yaml, agent pipeline properties |
| `persistence` | axiomdsf-persistence | JPA entities, Spring Data repositories, port/adapter implementations |
| `business` | axiomdsf-business | Core services, DTOs, orchestrator, agent invocation, MCP tools |
| `gateway` | axiomdsf-gateway | External API integrations (Azure DevOps) |
| `resource` | studentapi-resource | REST controllers, Spring Boot main class, OpenAPI config |
| `frontend` | frontend | Angular 17 web application |
| `CommandLineInterface` | axiomdsf-cli | Standalone CLI for local workspace/workflow orchestration |

---

## 5. Design Patterns

### Hexagonal Architecture (Ports & Adapters)

The codebase strictly follows **Hexagonal Architecture**. Business logic never depends on infrastructure — it talks through interfaces (ports).

```
              ┌─────────────────────────────────┐
              │     REST Controllers (resource)  │  ◀── Inbound Adapter
              └──────────────┬──────────────────┘
                             │ calls
              ┌──────────────▼──────────────────┐
              │  Use Case Ports (business/port)  │  ◀── Inbound Port
              │  WorkflowUseCase                 │
              │  WorkspaceUseCase                │
              └──────────────┬──────────────────┘
                             │ implemented by
              ┌──────────────▼──────────────────┐
              │   Services (business/service)    │  ◀── Application Core
              │   WorkflowService                │
              │   OrchestratorService             │
              └──────────────┬──────────────────┘
                             │ depends on
              ┌──────────────▼──────────────────┐
              │ Persistence Ports (port/out)     │  ◀── Outbound Port
              │ WorkflowPersistencePort          │
              │ WorkspacePersistencePort          │
              └──────────────┬──────────────────┘
                             │ implemented by
              ┌──────────────▼──────────────────┐
              │ Adapters (persistence/adapter)   │  ◀── Outbound Adapter
              │ WorkflowPersistenceAdapter       │
              └──────────────┬──────────────────┘
                             │ uses
              ┌──────────────▼──────────────────┐
              │ Spring Data JPA Repositories     │
              │ SQLite Database                  │
              └─────────────────────────────────┘
```

### Other Patterns Used

| Pattern | Where | Description |
|---------|-------|-------------|
| State Machine | `AgentState.java` | Explicit state enum with `canTransitionTo()` validation: INIT → IN_PROGRESS → IN_REVIEW → APPROVED/REWORK/FAILED |
| Event Sourcing (Audit) | `AgentStateTransition` entity | Every state change is recorded as an immutable transition row |
| Pipeline / Chain of Responsibility | `AgentPipelineProperties` | Agents linked via `nextAgent` field forming an ordered chain |
| Async Task Execution | `agentExecutor` thread pool | Agent invocations run asynchronously; UI/API returns immediately |
| Template Method | Agent markdown files | AIM model provides a consistent template all agents follow |
| Repository Pattern | Spring Data JPA repos | Database access abstracted behind repository interfaces |
| DTO Pattern | `CreateWorkspaceRequest`, etc. | Request/Response DTOs decouple API layer from domain |

---

## 6. Agents in the System

AxiomDSF has **10 AI agents**, each responsible for one phase of the SDLC. They execute sequentially, with each agent's output becoming the next agent's input.

| # | Agent Name | Short | Role | Mandatory | Input File | Output File |
|---|-----------|-------|------|-----------|------------|-------------|
| 1 | RequirementAnalysisRefinementAgent | REQ | Transforms raw requirement text into a structured, scoped requirement package with acceptance criteria | Yes | `input_raw_requirement.md` | `output_refined_requirement.md` |
| 2 | HLSAgent | HLS | Produces a High-Level Solution: tech stack, architecture decisions, component overview, NFRs, risks, deployment strategy | Yes | `input_refined_requirement.md` | `output_high_level_solution.md` |
| 3 | HLDAgent | HLD | High-Level Design with container decomposition, component interactions, integration points, Mermaid diagrams | Yes | `input_hls_solution.md` | `output_high_level_design.md` |
| 4 | UserStoryAgent | US | Converts HLD into INVEST-compliant user stories (As a… I want… so that…), acceptance criteria, edge cases | Yes | `input_hld_blueprint.md` | `output_user_stories.md` |
| 5 | TRReviewAgent | TR | Test Review — generates BDD Gherkin scenarios, test coverage plan | No | `input_user_stories.md` | `output_test_review.md` |
| 6 | LLDAgent | LLD | Low-Level Design — class definitions, method signatures, data models, sequence flows | Yes | `input_trreview_and_hld.md` | `output_low_level_design.md` |
| 7 | TDDAgent | TDD | Converts BDD scenarios into compilable, runnable test code (≥70% code, framework-specific) | No | `input_lld_and_trreview.md` | `output_tdd_test_strategy.md` |
| 8 | CodingAgent | CODE | Implements all source code from LLD specs and TDD test cases — must compile and run without changes | Yes | `input_lld_and_tdd.md` | `output_implemented_code.md` |
| 9 | StaticCodeAnalysisAgent | SCA | Code quality analysis — smells, complexity, duplication, technical debt, fix recommendations | No | `input_source_code.md` | `output_static_analysis.md` |
| 10 | SecurityAgent | SEC | Security audit — vulnerabilities, CWE/OWASP mapping, CVSS scores, remediation steps | No | `input_security_code.md` | `output_security_analysis.md` |

### Agent Chaining

Each agent's YAML config has a `nextAgent` field creating a linked chain:

```
REQ ──▶ HLS ──▶ HLD ──▶ UserStory ──▶ TRReview ──▶ LLD ──▶ TDD ──▶ Coding ──▶ SCA ──▶ Security
 (1)     (2)     (3)       (4)          (5)        (6)     (7)      (8)       (9)       (10)
```

### What Each Agent Produces (Detail)

#### Agent 1 — RequirementAnalysisRefinementAgent

- Structured Summary of the requirement
- Refined Scope (in-scope / out-of-scope)
- Constraints and assumptions
- Open Questions (minimal, precise)
- Deterministic, testable Acceptance Criteria
- Handoff Summary for the HLS Agent

#### Agent 2 — HLSAgent

- Architecture overview and decisions
- Tech stack selection with justification
- Component overview
- Non-Functional Requirements (NFRs)
- Risks and mitigation
- Deployment strategy

#### Agent 3 — HLDAgent

- System context (actors, boundaries)
- Container decomposition table (name, responsibility, tech, collaborators)
- Component interactions per container
- Integration points (internal/external, sync/async)
- Use-case sequence descriptions
- **Mandatory: 2+ Mermaid diagrams** (container flowchart + sequence diagram)

#### Agent 4 — UserStoryAgent

- Individual `US-XXX-[Title].md` files per story
- Combined `UserStoryAgent_Output.md`
- Each story: 300–500 words, "As a… I want… so that…" format
- 3–5 acceptance criteria per story (Given/When/Then)
- 2–3 edge cases, dependencies, TDD tags

#### Agent 5 — TRReviewAgent

- BDD feature files with Gherkin scenarios
- Given/When/Then steps, priority tags (P0/P1/P2)
- Generates test *scenarios*, not test code (that's TDDAgent's job)

#### Agent 6 — LLDAgent

- Package structure
- Class/interface definitions with full method signatures
- Data models (entities, DTOs, enums)
- Mermaid sequence diagrams for key flows
- Error handling strategy, configuration specs

#### Agent 7 — TDDAgent

- Full, compilable test source files (≥70% code)
- Framework detection (JUnit 5, pytest, Jest, etc.)
- Minimum 5 complete test files
- Organized by priority: P0 → P1 → P2

#### Agent 8 — CodingAgent

- Every class/interface as `### FILE:` code block
- Build files (pom.xml), configs (application.yaml), entry points
- Backend apps run on port 9090 (not 8080)
- Must compile, run, and pass all TDD tests without modification

#### Agent 9 — StaticCodeAnalysisAgent

- Code smell detection, complexity metrics
- Best practice violations, technical debt assessment
- Prioritised fix recommendations

#### Agent 10 — SecurityAgent

- Vulnerability inventory with CVSS scores
- OWASP Top 10 mapping
- Compliance gaps (GDPR, etc.)
- Remediation steps + extra `security-report.json`

---

## 7. How the Orchestrator Works

The **OrchestratorService** is the brain of the pipeline. It manages which agent runs when, handles state transitions, and supports both automatic advancement and human approval gates.

### Key Methods

| Method | Purpose |
|--------|---------|
| `startOrchestration()` | Entry point — creates a workflow record (state: INIT), prepares the input file, and queues the first (or specified) agent for async execution. |
| `advanceToNextAgent()` | Called after an agent's output is approved. Loads the selected agents list, finds the next one in sequence, and kicks off orchestration for it. |
| `reworkAgent()` | Re-runs an agent with user feedback. Deletes old output, prepares a new input with rework comments, transitions state from REWORK → IN_PROGRESS. |
| `initiateAgent()` | Creates the Workflow DB record and invokes the agent asynchronously via the thread pool executor. |
| `invokeAgentInBackground()` | Background thread that calls `CopilotAgentService`, transitions IN_PROGRESS → IN_REVIEW on success, and handles UserStory output parsing. |
| `processUserStoryOutput()` | Special logic for Agent 4 — parses the combined output into individual `US-*.md` files, saves them to the database, and creates Azure DevOps work items. |

### State Machine

Every workflow/agent execution goes through these states:

```
                    ┌─────────────────────────────────┐
                    │                                 │
                    ▼                                 │
  INIT ──▶ IN_PROGRESS ──▶ IN_REVIEW ──▶ APPROVED ──▶ (Next Agent)
                │               │
                │               ▼
                │           REWORK ──▶ IN_PROGRESS (loop back)
                │
                ▼
             FAILED
```

The `AgentState.canTransitionTo()` method enforces valid transitions — you cannot skip states.

### Pipeline Modes

| Mode | Behaviour |
|------|-----------|
| **full-sequence** | All 10 agents run sequentially end-to-end for the entire requirement. |
| **per-story** (default) | Agents 1–4 (Requirement → UserStory) run once as a *shared pipeline*. After User Stories are generated, each story gets its own pipeline from Agent 5–10 (TRReview → Security). Stories can be picked and processed independently. |

### Async Execution

Agent invocations are dispatched to a `ThreadPoolTaskExecutor` named `agentExecutor` (4–8 core threads). The API/CLI returns immediately; the agent runs in the background. State transitions are tracked in the database so any client can poll for progress.

---

## 8. End-to-End System Flow

### Full Pipeline Sequence

```
User provides raw requirement (text or file)
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Agent 1: RequirementAnalysisRefinementAgent                │
│  Input:  input_raw_requirement.md                           │
│  Output: output_refined_requirement.md                      │
│  → Structured summary, scope, constraints, acceptance       │
│    criteria, handoff for HLS                                │
└──────────────────────┬──────────────────────────────────────┘
      APPROVE          │
    ┌──────────────────▼──────────────────────────────────────┐
    │  Agent 2: HLSAgent                                      │
    │  Input:  output_refined_requirement.md (renamed)        │
    │  Output: output_high_level_solution.md                  │
    │  → Architecture, tech stack, NFRs, risks                │
    └──────────────────┬──────────────────────────────────────┘
          APPROVE      │
        ┌──────────────▼──────────────────────────────────────┐
        │  Agent 3: HLDAgent                                  │
        │  Output: output_high_level_design.md                │
        │  → Containers, components, Mermaid diagrams         │
        └──────────────┬──────────────────────────────────────┘
              APPROVE  │
            ┌──────────▼──────────────────────────────────────┐
            │  Agent 4: UserStoryAgent                        │
            │  Output: output_user_stories.md + US-*.md files │
            │  → INVEST user stories, acceptance criteria     │
            └──────────┬──────────────────────────────────────┘
                  APPROVE
                       │
          ┌────────────┴────────────────────────────┐
          │  PER-STORY MODE:                        │  FULL-SEQUENCE MODE:
          │  Pick a story (US-001, US-002...)        │  Continue straight to
          │  Each story gets Agents 5→10             │  Agent 5 → 10
          └─────────────────────────────────────────┘
                       │
          ┌────────────▼────────────────────────────┐
          │  Agent 5: TRReviewAgent (optional)      │
          │  Agent 6: LLDAgent                      │
          │  Agent 7: TDDAgent (optional)           │
          │  Agent 8: CodingAgent                   │
          │  Agent 9: StaticCodeAnalysisAgent (opt)  │
          │  Agent 10: SecurityAgent (optional)     │
          └─────────────────────────────────────────┘
                       │
                  ✅ PIPELINE COMPLETE
```

### Component Interaction Flow

```
REST Controller (resource/)
    │ calls
    ▼
WorkflowService (implements WorkflowUseCase)
    ├──▶ WorkflowPersistencePort.save()           [Create workflow record]
    ├──▶ AzureDevOpsIntegrationService             [Create branches, wiki]
    │       └──▶ AzureDevOpsMcpService             [REST calls to Azure]
    ├──▶ OrchestratorService.startOrchestration()
    │       ├──▶ CopilotAgentService.invokeAgent() [Process: copilot.cmd]
    │       ├──▶ FileStorageService                [Read/write agent files]
    │       └──▶ EventService.publishEvent()       [Audit logging]
    └──▶ FileStorageService.saveRequirement()
```

---

## 9. Workflow Execution

### Starting a Workflow (Backend API)

1. Client sends `POST /workflow/start` with a `StartWorkflowRequest` (workspaceId, requirementText, selectedAgents, pipelineMode).
2. `WorkflowController` delegates to `WorkflowService.startWorkflow()`.
3. A `Requirement` record is saved to the database.
4. If Azure DevOps is enabled, `AzureDevOpsIntegrationService.onRequirementCreated()` creates branches and wiki structure.
5. `OrchestratorService.startOrchestration()` is called — it creates a `Workflow` record in INIT state and dispatches the first agent asynchronously.
6. The API returns immediately with the workflow ID and status.

### Approving / Reworking

1. Client sends `POST /workflow/approve` with `WorkflowApprovalRequest` (workspaceId, requirementId, agentNumber, decision: APPROVE | REJECT | REWORK, comments).
2. On **APPROVE**: state transitions to APPROVED, then `advanceToNextAgent()` kicks off the next agent.
3. On **REWORK**: state transitions to REWORK. The agent is re-invoked with the original input + user feedback comments appended.
4. On **REJECT**: pipeline stops at that point.

### Per-Story Workflow

1. After Agent 4 (UserStory) completes, individual story files are created and saved.
2. User picks a story via `pick-story` (CLI) or the UI.
3. A new sub-pipeline starts from Agent 5 scoped to that specific user story.
4. Each agent within the per-story pipeline has its own approval gate.
5. Multiple stories can be processed independently (different user story IDs).

### Key Data Model

```
Workspace (1) ──▶ (N) Requirement
Workspace (1) ──▶ (N) UserStory
Workspace (1) ──▶ (N) Workflow
Workspace (1) ──▶ (N) Event

Workflow (1) ──▶ (N) AgentStateTransition

Workflow fields:
  id, workspaceId, requirementId, userStoryId, agentName,
  state, sequenceNumber, inputFilePath, outputFilePath,
  inputWikiUrl, outputWikiUrl, completionStatus,
  pipelineMode, selectedAgents, createdAt
```

---

## 10. Command Line Interface (CLI)

### Overview

The CLI (`CommandLineInterface` module) is a standalone Java application that provides a **REPL (Read-Eval-Print Loop)** for orchestrating the entire SDLC pipeline from a terminal. It communicates with the Spring Boot backend via REST API and can also invoke Copilot directly.

### Key Classes

| Class | Purpose |
|-------|---------|
| `AxiomDsfCli` | Main entry point. Displays banner, starts the `pipeline>` prompt, and loops reading commands. |
| `CommandRouter` | Parses the first word of input and routes to the correct handler: `workspace`, `workflow`, `help`, `exit`. |
| `WorkspaceCommandHandler` | Handles `workspace create`, `workspace list`, `workspace get`. Creates workspace directories, syncs to backend API. |
| `WorkflowCommandHandler` | Handles `workflow start`, `workflow status`, `workflow approve`, `workflow output`, `workflow run-agent`, `workflow pick-story`, `workflow approve-story`, `workflow story-status`. Invokes Copilot directly and polls for output. |
| `AgentRegistry` | Defines the 10-agent pipeline with sequence numbers, names, short names, and I/O file paths. |
| `ApiClient` | HTTP client (Java HttpClient) for REST calls to `http://localhost:8080`. 30-second timeout. |
| `WorkspaceManager` | File-based workspace state management (creates directories, writes JSON state). |
| `PipelineState` | In-memory + file-based state tracking per workspace (`state.json` with file locking). |

### CLI Commands Reference

| Command | Description |
|---------|-------------|
| `workspace create --name <n> --desc <d> --tech <t>` | Create a new workspace directory with project metadata |
| `workspace list` | List all workspaces (table format: ID, name, tech, requirements) |
| `workspace get --name <name>` | Show workspace details + associated requirements |
| `workflow start --workspace <id> --text "<req>"` | Start a new workflow with inline requirement text |
| `workflow start --workspace <id> --file <path>` | Start a new workflow from a requirement file |
| `workflow status --workspace <id> --requirement <id>` | Check current agent progress and state |
| `workflow approve --workspace <id> --requirement <id>` | Approve/reject/rework the current agent output (interactive) |
| `workflow output --agent <1-10> --workspace <id>` | View the output of a specific agent |
| `workflow run-agent --workspace <id> --agent <name>` | Run a single agent directly |
| `workflow pick-story --workspace <id> --requirement <id> --story US-001` | Start per-story pipeline for a specific user story |
| `workflow approve-story --workspace <id> --requirement <id> --story US-001` | Approve current agent in a story pipeline |
| `workflow story-status --workspace <id> --requirement <id>` | View status of all story pipelines |
| `help` | Show all commands and pipeline overview |
| `exit` | Exit the CLI |

### How the CLI Invokes Copilot

1. The CLI auto-detects `copilot.cmd` on the system PATH (runs `copilot --version` to verify).
2. It constructs the same command the backend uses (agent name, prompt, `--allow-all`, etc.).
3. Output is polled every 3 seconds, checking the agent output file (up to ~5 hours timeout).
4. CLI noise is filtered using the same regex patterns as the backend.

---

## 11. User Interface (Angular Frontend)

### Overview

The frontend is an **Angular 17** single-page application with **Angular Material** components. It communicates with the Spring Boot backend at `http://localhost:8080`.

### Pages & Routing

| Route | Component | Description |
|-------|-----------|-------------|
| `/dashboard` | DashboardComponent | Welcome page with live health indicator (UP/DOWN, memory, uptime), workspace/workflow stats, time-based greeting |
| `/workspaces` | WorkspaceListComponent | Grid of workspace cards (project name, tech stack, pipeline mode, Azure DevOps indicator). Delete support. Empty state messaging. |
| `/workspaces/create` | WorkspaceCreateComponent | Multi-section form: Basic Info + Azure DevOps config (collapsible) + Pipeline Mode selector. Reactive form validation. Tech stack dependency suggestions. |
| `/workspaces/:id` | WorkspaceDetailComponent | Workspace details with associated workflows list |
| `/workflow/start` | WorkflowStartComponent | Start a new workflow — select workspace, paste/upload requirement |
| `/workflow/status` | WorkflowStatusComponent | Real-time workflow status with agent progress visualisation |
| `/devops` | DevOpsIntegrationComponent | Azure DevOps configuration and sync controls |
| `/about` | AboutComponent | Project information and architecture overview |

### Key Services

| Service | Base URL | Methods |
|---------|----------|---------|
| `workspace.service.ts` | `/workspace` | `listWorkspaces()`, `getWorkspaceById(id)`, `createWorkspace(data)`, `updateWorkspace(id, data)`, `deleteWorkspace(id)`, `getWorkspaceByName(name)`, `validateAzureDevOpsConnection(config)` |
| `workflow.service.ts` | `/workflow` | Start, approve, status, list workflows |
| `system.service.ts` | `/api/health` | Health check, memory, uptime, stats |
| `requirement.service.ts` | `/requirement` | CRUD for requirements |
| `devops.service.ts` | `/workspace` | Azure DevOps validation |

### UI Features

- **Sidebar navigation** with active route highlighting and dynamic workspace shortcuts
- **Dark mode** toggle with theme colour configuration
- **Responsive design** — sidebar collapses on mobile
- **Login screen** — gated behind `isLoggedIn` flag
- **Live health** — pulsing indicator showing backend UP/DOWN status
- **Animated stat cards** on dashboard (workspace count, workflow count, agent count)

---

## 12. MCP Integration (Azure DevOps)

### What is MCP?

**Model Context Protocol (MCP)** is a mechanism that lets AI agents call external tools. In AxiomDSF, MCP tools allow the orchestrator to interact with Azure DevOps (create branches, save files, manage work items) as part of the agent pipeline.

### Key MCP Classes

#### AzureDevOpsMcpTools.java

Defines Spring AI Function Calling tools as `Function<Request, Response>` beans:

| Tool Function | Purpose |
|--------------|---------|
| `createWorkspaceBranch()` | Creates a workspace branch in Azure DevOps repository |
| `createRequirementFolder()` | Creates per-requirement folder structure (Mode 1 per-story pipeline) |
| `createUserStoryFolder()` | Creates story-level folder structures |
| `saveAgentFile()` | Persists agent input/output files to the repository |
| `readFile()` | Reads file content from the repository |
| `createWorkItem()` | Creates Azure DevOps work items (User Stories, Test Cases) |
| `queryWorkItems()` | Queries work items by type/state |

#### AzureDevOpsMcpService.java

Core protocol implementation that makes REST calls to the Azure DevOps API:

- **Branch management**: `createWorkspaceBranch()`, `createUserStoryBranch()` (refs/heads/…)
- **Repository cleanup**: `cleanBranch()` deletes all inherited files from parent branch
- **Initial commit handling**: `createInitialCommit()` handles empty repository scenarios
- **Conflict handling**: Idempotent operations with HTTP 409 conflict tolerance
- **SSL/TLS**: Creates a self-signed certificate-trusting `RestTemplate` for internal corporate environments

#### AzureDevOpsIntegrationService.java

High-level orchestration service that ties MCP operations into the workflow lifecycle:

- `onRequirementCreated(workspaceId, requirementId)` — Called when a workflow starts; cleans the repo branch, creates folder structures, creates wiki branch, publishes code wiki with a home page.

### Azure DevOps Configuration

When creating a workspace with Azure DevOps enabled, provide:

| Field | Description |
|-------|-------------|
| Organization URL | e.g. `https://dev.azure.com/your-org` |
| Project | Azure DevOps project name |
| Repository | Target Git repository name |
| Personal Access Token | PAT with Code (Read/Write), Wiki, Work Items permissions |
| Development Branch | Branch for code (default: workspace name-based) |
| Wiki Branch | Branch for wiki content |

---

## 13. Commands to Build & Run the Application

### Prerequisites

- **Java 17+** (JDK, not JRE)
- **Maven 3.9+** (or use the bundled `mvnw` / `mvnw.cmd`)
- **Node.js ≥ 18** and **npm** (for the Angular frontend)
- **GitHub Copilot CLI** installed and authenticated (see Section 1)

### Backend (Spring Boot)

```bash
# Navigate to project root
cd AxiomDSF

# Full build (all modules)
mvnw.cmd clean install -DskipTests

# Run the Spring Boot application (port 8080)
mvnw.cmd -pl resource spring-boot:run

# Or run the built JAR directly
java -jar resource\target\studentapi-resource-0.0.1-SNAPSHOT.jar
```

> **Note:** The database file `data/axiomdsf.db` (SQLite) is auto-used. DDL is set to `none` — the schema must already exist. If starting fresh, ensure the database has the required tables.

### Frontend (Angular)

```bash
# Navigate to the frontend module
cd frontend\frontend

# Install dependencies
npm install

# Start the development server (port 4200)
ng serve
# or
npm start

# Build for production
ng build --configuration production
```

The Angular app proxies API calls to `http://localhost:8080`.

### CLI (Command Line Interface)

```bash
# Build the CLI JAR
mvnw.cmd -pl CommandLineInterface clean package -DskipTests

# Run the CLI
java -jar CommandLineInterface\target\axiomdsf-cli-1.0-SNAPSHOT-jar-with-dependencies.jar

# The CLI starts a REPL:
# pipeline> help
# pipeline> workspace create --name "my-project" --desc "Demo" --tech "Java, Spring Boot"
# pipeline> workflow start --workspace 1 --text "Build a todo app with REST API"
```

### Quick Start (All Components)

```bash
# Terminal 1 — Backend
mvnw.cmd clean install -DskipTests && mvnw.cmd -pl resource spring-boot:run

# Terminal 2 — Frontend
cd frontend\frontend && npm install && ng serve

# Terminal 3 — CLI (optional)
java -jar CommandLineInterface\target\axiomdsf-cli-1.0-SNAPSHOT-jar-with-dependencies.jar
```

### Access Points

| Component | URL |
|-----------|-----|
| Backend API | `http://localhost:8080` |
| Swagger UI | `http://localhost:8080/swagger-ui.html` |
| Frontend UI | `http://localhost:4200` |
| Health Check | `http://localhost:8080/api/health` |

### Common API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/workspace/create` | Create a workspace |
| GET | `/workspace/list` | List all workspaces |
| GET | `/workspace/{id}` | Get workspace by ID |
| DELETE | `/workspace/{id}` | Delete workspace |
| POST | `/workflow/start` | Start a workflow |
| GET | `/workflow/status/{wsId}/{reqId}` | Get workflow status |
| POST | `/workflow/approve` | Approve/reject/rework agent output |
| GET | `/workflow/all` | List all workflows |
| GET | `/api/health` | System health & stats |

---

## 14. Project Directory Reference

```
AxiomDSF/
├── .github/
│   └── agents/                              # Copilot agent definition files
│       ├── RequirementAnalysisRefinementAgent.agent.md
│       ├── HLSAgent.agent.md
│       ├── HLDAgent.agent.md
│       ├── UserStoryAgent.agent.md
│       ├── TRReviewAgent.agent.md
│       ├── LLDAgent.agent.md
│       ├── TDDAgent.agent.md
│       ├── CodingAgent.agent.md
│       ├── StaticCodeAnalysisAgent.agent.md
│       └── SecurityAgent.agent.md
│
├── config/                                  # Shared configuration module
│   └── src/main/resources/
│       └── application.yaml                 # DB, pipeline, agent settings
│
├── persistence/                             # Database layer
│   └── src/main/java/.../
│       ├── entity/                          # JPA entities (Workspace, Workflow, etc.)
│       ├── repository/                      # Spring Data JPA repositories
│       ├── adapter/                         # Port implementations (Hexagonal)
│       └── port/out/                        # Outbound port interfaces
│
├── business/                                # Core business logic
│   └── src/main/java/.../
│       ├── service/
│       │   ├── OrchestratorService.java     # Pipeline orchestration engine
│       │   ├── CopilotAgentService.java     # Copilot CLI invocation
│       │   ├── WorkflowService.java         # Workflow CRUD & state
│       │   ├── WorkspaceService.java        # Workspace management
│       │   ├── AzureDevOpsIntegrationService.java
│       │   ├── AzureDevOpsMcpService.java   # MCP protocol impl
│       │   ├── EventService.java            # Audit events
│       │   ├── FileStorageService.java      # File I/O
│       │   └── mcp/
│       │       └── AzureDevOpsMcpTools.java # MCP tool functions
│       ├── dto/                             # Request/Response DTOs
│       ├── model/
│       │   ├── AgentType.java               # 10-agent enum
│       │   └── AgentState.java              # State machine enum
│       ├── config/
│       │   ├── AgentConfigProperties.java   # Per-agent config
│       │   └── AgentPipelineProperties.java # Pipeline sequencing
│       └── port/in/                         # Inbound port interfaces (use cases)
│
├── gateway/                                 # External API integrations
│
├── resource/                                # REST controllers & Spring Boot main
│   └── src/main/java/.../
│       ├── AxiomDsfApplication.java         # Main class (port 8080)
│       ├── controller/
│       │   ├── WorkspaceController.java
│       │   ├── WorkflowController.java
│       │   ├── SystemController.java        # /api/health
│       │   ├── RequirementController.java
│       │   ├── UserStoryController.java
│       │   └── SpaForwardController.java    # Angular routing support
│       └── config/
│           └── WebConfig.java               # CORS configuration
│
├── frontend/                                # Angular 17 application
│   └── frontend/
│       └── src/app/
│           ├── app.component.ts             # Root layout + sidebar
│           ├── app.routes.ts                # Route definitions
│           ├── services/                    # API service classes
│           └── pages/                       # Page components
│               ├── dashboard/
│               ├── workspace-list/
│               ├── workspace-create/
│               ├── workspace-detail/
│               ├── workflow-start/
│               ├── workflow-status/
│               ├── devops-integration/
│               └── about/
│
├── CommandLineInterface/                    # Standalone CLI tool
│   └── src/main/java/.../cli/
│       ├── AxiomDsfCli.java                 # REPL main entry
│       ├── CommandRouter.java               # Command dispatcher
│       ├── WorkspaceCommandHandler.java
│       ├── WorkflowCommandHandler.java
│       ├── AgentRegistry.java               # 10-agent pipeline defs
│       ├── ApiClient.java                   # REST HTTP client
│       ├── WorkspaceManager.java            # File-based state
│       └── PipelineState.java               # State tracking
│
├── data/
│   └── axiomdsf.db                          # SQLite database
│
├── workspaces/                              # Sample workspace outputs
│   ├── workspace-1_to do app/
│   ├── workspace-4_foody/
│   └── ...
│
├── pom.xml                                  # Parent Maven POM
├── mvnw / mvnw.cmd                          # Maven wrapper
├── approve.json                             # Sample approval payload
└── test-body.json                           # Sample workspace creation payload
```

---

*AxiomDSF Project Guide & Tutorial — Prepared for Team Handover — April 2026*
