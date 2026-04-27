import { Injectable } from '@angular/core';

/**
 * AxiomDSF AI Assistant — lightweight, fully client-side chatbot.
 *
 * Uses TF-IDF-inspired keyword scoring against a curated knowledge base
 * so answers are instant, require zero network calls, and have zero
 * compliance risk.  The service interface (ask()) is intentionally simple
 * so you can later swap in a real LLM (Phi-3 / MiniLM via Transformers.js
 * or a backend endpoint) without touching the component layer.
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  suggestions?: string[];
}

interface KnowledgeEntry {
  keywords: string[];
  question: string;
  answer: string;
  category: string;
  followUps?: string[];
}

@Injectable({ providedIn: 'root' })
export class ChatbotService {

  private history: ChatMessage[] = [];
  private lastCategory: string | null = null;
  private contextTopics: string[] = [];

  // Synonym map for fuzzy matching
  private readonly synonyms: Record<string, string[]> = {
    'create': ['make', 'new', 'add', 'setup', 'init', 'initialize'],
    'delete': ['remove', 'drop', 'destroy', 'erase'],
    'start': ['run', 'begin', 'launch', 'trigger', 'execute', 'kick'],
    'stop': ['halt', 'end', 'terminate', 'kill', 'abort', 'cancel'],
    'view': ['see', 'show', 'display', 'list', 'browse', 'look', 'check'],
    'fix': ['solve', 'repair', 'resolve', 'debug', 'troubleshoot'],
    'error': ['bug', 'issue', 'problem', 'fail', 'crash', 'broken'],
    'agent': ['bot', 'ai', 'copilot', 'assistant'],
    'workspace': ['project', 'repo', 'repository'],
    'workflow': ['pipeline', 'process', 'flow', 'job', 'execution'],
    'approve': ['accept', 'confirm', 'ok', 'pass', 'green'],
    'reject': ['deny', 'decline', 'fail', 'block', 'stop'],
    'rework': ['redo', 'retry', 'rerun', 'again', 'revise'],
    'output': ['result', 'artifact', 'artefact', 'deliverable', 'product'],
  };

  private readonly knowledgeBase: KnowledgeEntry[] = [
    // ── General ──────────────────────────────────────────────
    {
      category: 'general',
      keywords: ['what', 'axiomdsf', 'axiom', 'dsf', 'about', 'app', 'application', 'platform', 'overview'],
      question: 'What is AxiomDSF?',
      answer:
        'AxiomDSF (Axiom Digital Software Factory) is an AI-powered software engineering platform that automates the full SDLC — from requirement analysis through coding and security review. ' +
        'It orchestrates a pipeline of specialised AI agents, each handling one phase (requirements → HLS → HLD → user stories → Test Review Agent → LLD → TDD → coding → static analysis → security).',
      followUps: ['How does AxiomDSF work?', 'What AI agents are available?', 'What tech stack does it use?']
    },
    {
      category: 'general',
      keywords: ['how', 'work', 'working', 'process', 'flow', 'pipeline', 'orchestrate'],
      question: 'How does AxiomDSF work?',
      answer:
        'AxiomDSF works through an automated pipeline:\n' +
        '1. You create a **Workspace** (project context).\n' +
        '2. You start a **Workflow** by providing a requirement.\n' +
        '3. The orchestrator runs AI agents sequentially: Requirement → HLS → HLD → User Story → Test Review Agent → LLD → TDD → Coding → Static Code Analysis → Security.\n' +
        '4. After each agent completes, you can **approve**, **rework**, or **reject** the output.\n' +
        '5. All artefacts are version-tracked and stored per workspace.',
      followUps: ['How do I create a workspace?', 'How do I start a workflow?', 'What AI agents are available?']
    },
    {
      category: 'general',
      keywords: ['tech', 'stack', 'technology', 'built', 'framework', 'spring', 'angular'],
      question: 'What tech stack does AxiomDSF use?',
      answer:
        '**Backend:** Spring Boot 4, Java 17+, Spring Data JPA, SQLite, Hibernate.\n' +
        '**Frontend:** Angular 17 (standalone components).\n' +
        '**AI Integration:** GitHub Copilot CLI agents (configurable).\n' +
        '**API Docs:** SpringDoc / Swagger UI at `/swagger-ui.html`.',
      followUps: ['What is the project architecture?', 'How do I start the backend?']
    },

    // ── Workspaces ───────────────────────────────────────────
    {
      category: 'workspace',
      keywords: ['workspace', 'create', 'new', 'project', 'setup'],
      question: 'How do I create a workspace?',
      answer:
        'Navigate to **Create Workspace** in the sidebar (or call `POST /workspace/create`).\n' +
        'Provide a **project name**, optional **description**, **tech stack**, and a **location** (directory path). The workspace is the top-level container for all requirements, user stories, and workflows.',
      followUps: ['How do I start a workflow?', 'How do I view all workspaces?']
    },
    {
      category: 'workspace',
      keywords: ['workspace', 'list', 'view', 'all', 'show', 'browse'],
      question: 'How do I view all workspaces?',
      answer:
        'Click **Workspaces** in the sidebar to see all created workspaces. The API endpoint is `GET /workspace/list`. Each workspace shows its name, tech stack, and status.'
    },
    {
      category: 'workspace',
      keywords: ['workspace', 'find', 'search', 'name', 'get'],
      question: 'How do I find a workspace by name?',
      answer:
        'Use the **search** feature on the Workspaces page, or call `GET /workspace/getByName?name=YourProjectName` directly.'
    },

    // ── Workflows ────────────────────────────────────────────
    {
      category: 'workflow',
      keywords: ['workflow', 'start', 'run', 'begin', 'trigger', 'launch', 'execute'],
      question: 'How do I start a workflow?',
      answer:
        'Go to **Start Workflow** in the sidebar. Select a workspace, provide a requirement (text or file path), and click Start.\n' +
        'API: `POST /workflow/start` with `{ workspaceId, requirementText }`. The orchestrator will begin executing agents from the first enabled one in the pipeline.',
      followUps: ['How do I check workflow status?', 'How do I approve or reject output?', 'What AI agents are available?']
    },
    {
      category: 'workflow',
      keywords: ['workflow', 'status', 'check', 'progress', 'monitor', 'track'],
      question: 'How do I check workflow status?',
      answer:
        'Click **Workflow Status** in the sidebar. You can view the current agent, its state (PENDING / RUNNING / AWAITING_APPROVAL / COMPLETED), and all past transitions.\n' +
        'API: `GET /workflow/status/{workspaceId}/{requirementId}`.'
    },
    {
      category: 'workflow',
      keywords: ['approve', 'approval', 'reject', 'rework', 'review', 'decision'],
      question: 'How do I approve or reject an agent\'s output?',
      answer:
        'When an agent reaches **AWAITING_APPROVAL**, click the Approve / Rework / Reject button on the Workflow Status page.\n' +
        '• **APPROVE** → moves to the next agent.\n' +
        '• **REWORK** → re-runs the current agent.\n' +
        '• **REJECT** → stops the workflow.\n' +
        'API: `POST /workflow/approve` with `{ workspaceId, requirementId, decision: "APPROVE" | "REWORK" | "REJECT" }`.',
      followUps: ['What are the agent states?', 'Can I revert a workflow?']
    },
    {
      category: 'workflow',
      keywords: ['revert', 'rollback', 'version', 'undo', 'previous'],
      question: 'Can I revert a workflow to a previous version?',
      answer:
        'Yes! Use `POST /workflow/revert` with `{ workspaceId, requirementId, version }` to roll back to an earlier agent output. This is useful if a later agent produced unsatisfactory results.'
    },

    // ── Agents ───────────────────────────────────────────────
    {
      category: 'agents',
      keywords: ['agent', 'agents', 'list', 'types', 'what', 'available', 'ai'],
      question: 'What AI agents are available?',
      answer:
        'AxiomDSF ships with 10 pipeline agents (in order):\n' +
        '1. **Requirement** — analyses and refines raw requirements\n' +
        '2. **HLS** — High-Level Solution design\n' +
        '3. **HLD** — High-Level Design (architecture)\n' +
        '4. **User Story** — generates user stories from HLD\n' +
        '5. **Test Review Agent** — Test review scenarios\n' +
        '6. **LLD** — Low-Level Design (detailed component design)\n' +
        '7. **TDD** — Test-Driven Development test specs\n' +
        '8. **Coding** — generates implementation code\n' +
        '9. **Static Code Analysis** — quality & lint checks\n' +
        '10. **Security** — security review & vulnerability scan',
      followUps: ['How do I configure agents?', 'What are the agent states?', 'How do I start a workflow?']
    },
    {
      category: 'agents',
      keywords: ['agent', 'configure', 'config', 'pipeline', 'order', 'enable', 'disable', 'skip'],
      question: 'How do I configure agents?',
      answer:
        'Agent configuration is in `config/src/main/resources/application.yaml` under `agent.pipeline.agents`. Each agent has:\n' +
        '• `agentType` / `agentName` — identity\n' +
        '• `executionOrder` — sequence in the pipeline\n' +
        '• `enabled` — set `false` to skip an agent\n' +
        '• `dependencies` — which agents must complete first\n' +
        '• `outputDirectory` — where outputs are saved\n' +
        'Restart the backend after changes.'
    },
    {
      category: 'agents',
      keywords: ['agent', 'state', 'states', 'lifecycle', 'pending', 'running', 'awaiting'],
      question: 'What are the agent states?',
      answer:
        'An agent transitions through these states:\n' +
        '• **PENDING** → queued, waiting for dependencies\n' +
        '• **RUNNING** → currently executing\n' +
        '• **AWAITING_APPROVAL** → finished, waiting for human review\n' +
        '• **APPROVED** → human approved, next agent can start\n' +
        '• **REWORK** → re-executing after human feedback\n' +
        '• **REJECTED** → workflow stopped\n' +
        '• **COMPLETED** → final state after all agents finish'
    },

    // ── User Stories ─────────────────────────────────────────
    {
      category: 'userstory',
      keywords: ['user', 'story', 'stories', 'save', 'create', 'manage'],
      question: 'How are user stories managed?',
      answer:
        'User stories are generated by the **User Story Agent** and stored in the database. You can also manually save stories via `POST /userstory/save`.\n' +
        'Query stories by workspace (`GET /userstory/workspace/{id}`) or by requirement (`GET /userstory/requirement/{id}`).'
    },

    // ── API ──────────────────────────────────────────────────
    {
      category: 'api',
      keywords: ['api', 'endpoint', 'endpoints', 'rest', 'swagger', 'docs', 'documentation', 'url'],
      question: 'Where can I see the API documentation?',
      answer:
        'Swagger UI is available at **http://localhost:8080/swagger-ui.html** when the backend is running.\n' +
        'Key endpoints:\n' +
        '• `POST /workspace/create` — create workspace\n' +
        '• `GET  /workspace/list` — list workspaces\n' +
        '• `POST /workflow/start` — start workflow\n' +
        '• `GET  /workflow/status/{wsId}/{reqId}` — check status\n' +
        '• `POST /workflow/approve` — approve/reject\n' +
        '• `GET  /workflow/all` — list all workflows\n' +
        '• `POST /workflow/revert` — revert to version'
    },

    // ── Running the App ──────────────────────────────────────
    {
      category: 'setup',
      keywords: ['run', 'start', 'launch', 'setup', 'install', 'backend', 'server', 'boot'],
      question: 'How do I start the backend?',
      answer:
        'From the project root:\n' +
        '```\n.\\mvnw.cmd spring-boot:run -pl resource\n```\n' +
        'This starts the Spring Boot server on **http://localhost:8080**.\n' +
        'Make sure the `data/` directory exists (for SQLite). Create it if needed: `mkdir data`.'
    },
    {
      category: 'setup',
      keywords: ['frontend', 'ui', 'angular', 'npm', 'start', 'serve', 'port', '4200'],
      question: 'How do I start the frontend?',
      answer:
        'From `frontend/frontend/`:\n' +
        '```\nnpm.cmd install   # first time only\nnpm.cmd start     # starts on http://localhost:4200\n```\n' +
        'Use `npm.cmd` (not `npm`) if PowerShell blocks unsigned scripts.'
    },

    // ── Database ─────────────────────────────────────────────
    {
      category: 'database',
      keywords: ['database', 'db', 'sqlite', 'data', 'storage', 'schema', 'tables'],
      question: 'What database does AxiomDSF use?',
      answer:
        'AxiomDSF uses **SQLite** stored at `data/axiomdsf.db`. Tables include:\n' +
        '• `workspace` — projects\n' +
        '• `requirement` — requirements per workspace\n' +
        '• `user_story` — user stories\n' +
        '• `workflow` — workflow state & agent tracking\n' +
        '• `event` — event log\n' +
        '• `agent_state_transition` — agent state history\n' +
        'Schema is auto-created via `schema.sql` on startup.'
    },

    // ── Troubleshooting ──────────────────────────────────────
    {
      category: 'troubleshooting',
      keywords: ['error', 'fail', 'bug', 'issue', 'problem', 'fix', 'not', 'working', 'crash', 'port'],
      question: 'Common issues and fixes?',
      answer:
        '**"data directory does not exist"** → Run `mkdir data` in the project root.\n\n' +
        '**Port 8080 already in use** → Kill the existing process or change the port in `application.yaml`.\n\n' +
        '**npm execution policy error** → Use `npm.cmd` instead of `npm`, or run: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`.\n\n' +
        '**CORS errors** → The backend has CORS configured via `WebConfig`. Ensure the frontend runs on `localhost:4200`.'
    },
    {
      category: 'troubleshooting',
      keywords: ['cors', 'cross', 'origin', 'blocked', 'access', 'control'],
      question: 'How to fix CORS errors?',
      answer:
        'CORS is configured in `resource/src/main/java/.../resource/config/WebConfig.java`. By default it allows `http://localhost:4200`. If you run the frontend on a different port, update that config and restart the backend.'
    },

    // ── Architecture ─────────────────────────────────────────
    {
      category: 'architecture',
      keywords: ['architecture', 'module', 'modules', 'structure', 'project', 'hex', 'hexagonal', 'layer'],
      question: 'What is the project architecture?',
      answer:
        'AxiomDSF follows **hexagonal (ports & adapters) architecture** with these Maven modules:\n' +
        '• **config** — shared `application.yaml`\n' +
        '• **persistence** — JPA entities, repositories, persistence adapters\n' +
        '• **business** — DTOs, services, orchestrator, use-case ports\n' +
        '• **gateway** — external integrations\n' +
        '• **resource** — REST controllers, Spring Boot entry point\n' +
        '• **CommandLineInterface** — standalone CLI client\n' +
        '• **frontend/** — Angular 17 SPA'
    },

    // ── CLI ──────────────────────────────────────────────────
    {
      category: 'cli',
      keywords: ['cli', 'command', 'line', 'terminal', 'interface', 'commandline'],
      question: 'Is there a CLI?',
      answer:
        'Yes! The **CommandLineInterface** module provides a standalone CLI that communicates with the backend REST API. Build it with:\n' +
        '```\n.\\mvnw.cmd package -pl CommandLineInterface\n```\n' +
        'Then run: `java -jar CommandLineInterface/target/axiomdsf-cli-*-jar-with-dependencies.jar`'
    },

    // ── Greetings / meta ─────────────────────────────────────
    {
      category: 'meta',
      keywords: ['hello', 'hi', 'hey', 'greet', 'good', 'morning', 'afternoon', 'evening'],
      question: 'Greeting',
      answer: 'Hello! 👋 I\'m the AxiomDSF Assistant. Ask me anything about workspaces, workflows, agents, APIs, or how to use this platform!'
    },
    {
      category: 'meta',
      keywords: ['thank', 'thanks', 'bye', 'goodbye', 'see', 'later'],
      question: 'Thanks / Goodbye',
      answer: 'You\'re welcome! Feel free to ask anytime. Happy building! 🚀'
    },
    {
      category: 'meta',
      keywords: ['help', 'can', 'what', 'ask', 'do', 'assist', 'support', 'questions'],
      question: 'What can you help with?',
      answer:
        'I can help with:\n' +
        '• **Workspaces** — creating, listing, finding\n' +
        '• **Workflows** — starting, monitoring, approving\n' +
        '• **AI Agents** — what they do, how to configure them\n' +
        '• **API Endpoints** — all REST APIs and Swagger\n' +
        '• **Setup & Running** — starting backend/frontend\n' +
        '• **Architecture** — project structure & modules\n' +
        '• **Troubleshooting** — common errors & fixes\n\n' +
        'Just type your question!'
    },

    // ── Dependency Suggestions ───────────────────────────────
    {
      category: 'features',
      keywords: ['dependency', 'dependencies', 'suggest', 'recommendation', 'library', 'package', 'module'],
      question: 'How do dependency suggestions work?',
      answer:
        'When creating a workspace, type your **tech stack** (e.g., "Java, Spring Boot, Angular") in the Tech Stack field. ' +
        'AxiomDSF will automatically suggest relevant dependencies categorized by type (Framework, Testing, Database, etc.). ' +
        'Click any suggestion chip to include it. Selected dependencies are appended to your tech stack when creating the workspace.',
      followUps: ['How do I create a workspace?', 'What tech stack does AxiomDSF use?']
    },

    // ── Login & Theme ────────────────────────────────────────
    {
      category: 'features',
      keywords: ['login', 'user', 'account', 'sign', 'username', 'auth', 'authentication'],
      question: 'How does login work?',
      answer:
        'AxiomDSF uses a lightweight local login. Enter your **username** on the login screen and click Sign In. ' +
        'Your name is saved in browser localStorage and used for personalization (avatar, greeting). ' +
        'To log out, click the user avatar in the header and select **Logout**.',
      followUps: ['How do I change the theme?', 'What is AxiomDSF?']
    },
    {
      category: 'features',
      keywords: ['theme', 'color', 'colour', 'style', 'appearance', 'random', 'dark', 'light'],
      question: 'Can I change the color theme?',
      answer:
        'AxiomDSF applies a **random color theme** every time you open or refresh the app. There are 8 themes: Forest Green, Ocean Blue, Royal Purple, Ruby Red, Amber Gold, Teal Wave, Rose Pink, and Indigo Night. ' +
        'You can also switch themes manually using the CLI terminal: type `theme` to see all options.',
      followUps: ['How do I use the CLI terminal?']
    },

    // ── CLI Terminal ─────────────────────────────────────────
    {
      category: 'features',
      keywords: ['cli', 'terminal', 'console', 'command', 'type', 'shell', 'prompt'],
      question: 'How do I use the CLI terminal?',
      answer:
        'Click the **terminal icon** (⌨) in the sidebar to toggle the built-in CLI panel. Available commands:\n' +
        '• `help` — list all commands\n' +
        '• `workspace list` — show workspaces\n' +
        '• `workspace create <name>` — create a workspace\n' +
        '• `workflow all` — show all workflows\n' +
        '• `workflow status <id>` — check workflow\n' +
        '• `agents` — list pipeline agents\n' +
        '• `theme` — list/change color themes\n' +
        '• `clear` — clear the terminal',
      followUps: ['What is AxiomDSF?', 'How do I start a workflow?']
    },

    // ── Snake Game ───────────────────────────────────────────
    {
      category: 'features',
      keywords: ['snake', 'game', 'play', 'fun', 'easter', 'egg', 'wait', 'waiting', 'bored'],
      question: 'Is there a snake game?',
      answer:
        'Yes! 🐍 While waiting for agents to process, a **Snake game** appears in the agent output panel. Use **arrow keys** to control the snake, eat the food to grow, and try not to hit the walls or yourself! ' +
        'Your high score is tracked during the session.',
      followUps: ['What are the agent states?', 'How long do agents take?']
    },

    // ── Agent Notifications ──────────────────────────────────
    {
      category: 'features',
      keywords: ['notification', 'alert', 'popup', 'toast', 'notify', 'complete', 'done', 'finished'],
      question: 'How do agent notifications work?',
      answer:
        'When an agent completes its work, a **toast notification** appears in the top-right corner showing the agent name and status. ' +
        'Notifications auto-dismiss after a few seconds. Each agent only triggers one notification per workflow run.',
      followUps: ['How do I approve or reject output?', 'What are the agent states?']
    },

    // ── Download & View ──────────────────────────────────────
    {
      category: 'features',
      keywords: ['download', 'export', 'save', 'file', 'copy', 'clipboard', 'open', 'window', 'tab'],
      question: 'Can I download or copy agent output?',
      answer:
        'Yes! Each agent output panel has three action buttons:\n' +
        '• **Download** — saves the output as a `.md` file\n' +
        '• **Copy** — copies the output text to your clipboard\n' +
        '• **Open in New Window** — opens the output in a separate browser window with formatted HTML\n' +
        'These are available in the agent output viewer toolbar.',
      followUps: ['Where is the code output folder?', 'How do I check workflow status?']
    },

    // ── Coding Agent Output ──────────────────────────────────
    {
      category: 'agents',
      keywords: ['code', 'coding', 'folder', 'path', 'directory', 'output', 'generated', 'where', 'find', 'location'],
      question: 'Where is the generated code output?',
      answer:
        'Code generated by the **Coding Agent** is saved in the workspace directory at:\n' +
        '`workspaces/workspace-{id}/coding/`\n\n' +
        'The full path is displayed in the agent output panel when the Coding Agent completes. ' +
        'You can also find all agent outputs organized by folder in the workspace directory.',
      followUps: ['What AI agents are available?', 'Can I download agent output?']
    },

    // ── Parallel Execution ───────────────────────────────────
    {
      category: 'agents',
      keywords: ['parallel', 'concurrent', 'simultaneous', 'together', 'same', 'time', 'speed', 'fast', 'performance'],
      question: 'Do agents run in parallel?',
      answer:
        'Yes! AxiomDSF supports **parallel agent execution** when agents have independent dependencies. ' +
        'For example, after the **Test Review Agent** completes, both **Static Code Analysis** and **Security** agents launch simultaneously since they both only depend on the Coding output. ' +
        'The system automatically detects which agents have all dependencies satisfied and launches them in parallel. ' +
        'The pipeline is only marked complete when ALL agents have been approved.',
      followUps: ['What AI agents are available?', 'How does AxiomDSF work?']
    },

    // ── Best Practices ───────────────────────────────────────
    {
      category: 'tips',
      keywords: ['tip', 'tips', 'best', 'practice', 'recommend', 'advice', 'suggestion', 'improve'],
      question: 'Any tips for using AxiomDSF?',
      answer:
        '**Tips for best results:**\n' +
        '1. Write clear, detailed requirements — the better your input, the better each agent\'s output.\n' +
        '2. Review and **approve** each agent output carefully before moving to the next.\n' +
        '3. Use **rework** instead of reject if the output is close but needs adjustment.\n' +
        '4. Set the correct **tech stack** when creating a workspace — agents use this context.\n' +
        '5. Check the **Workflow Status** page to monitor progress across all workflows.\n' +
        '6. Use the **chatbot** (me!) for quick answers instead of searching docs.',
      followUps: ['How do I start a workflow?', 'How do I create a workspace?']
    },

    // ── What's New ───────────────────────────────────────────
    {
      category: 'features',
      keywords: ['new', 'feature', 'features', 'update', 'changelog', 'release', 'latest', 'recent'],
      question: 'What are the latest features?',
      answer:
        '**Recent additions:**\n' +
        '• 🎨 **Random color themes** — fresh look every session\n' +
        '• 🔐 **User login** — personalized experience\n' +
        '• ⌨️ **CLI terminal** — command-line access in the UI\n' +
        '• 🐍 **Snake game** — play while agents work\n' +
        '• 📥 **Download/Copy/Open** — export agent outputs easily\n' +
        '• 🔔 **Agent notifications** — toast alerts on completion\n' +
        '• ⚡ **Parallel execution** — Static & Security agents run concurrently\n' +
        '• 📦 **Dependency suggestions** — tech stack recommendations\n' +
        '• 📊 **Grouped workflow view** — organized by workspace\n' +
        '• ✅ **Better approval guide** — clear approve/reject/rework explanations',
      followUps: ['How does AxiomDSF work?', 'Any tips for using AxiomDSF?']
    }
  ];

  /** Get chat history */
  getHistory(): ChatMessage[] {
    return this.history;
  }

  /** Clear chat history */
  clearHistory(): void {
    this.history = [];
  }

  /** Send a question, get an answer */
  async ask(userInput: string): Promise<string> {
    const userMsg: ChatMessage = {
      role: 'user',
      text: userInput,
      timestamp: new Date()
    };
    this.history.push(userMsg);

    // Small typing delay for natural feel
    await this.delay(300 + Math.random() * 400);

    const { answer, followUps, category } = this.findBestAnswer(userInput);

    // Track conversation context
    if (category) {
      this.lastCategory = category;
      if (!this.contextTopics.includes(category)) {
        this.contextTopics.push(category);
        if (this.contextTopics.length > 5) this.contextTopics.shift();
      }
    }

    const assistantMsg: ChatMessage = {
      role: 'assistant',
      text: answer,
      timestamp: new Date(),
      suggestions: followUps
    };
    this.history.push(assistantMsg);

    return answer;
  }

  /** Get follow-up suggestions from last response */
  getLastSuggestions(): string[] {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].role === 'assistant' && this.history[i].suggestions?.length) {
        return this.history[i].suggestions!;
      }
    }
    return [];
  }

  // ── Scoring Engine ───────────────────────────────────────

  private findBestAnswer(query: string): { answer: string; followUps: string[]; category: string | null } {
    const tokens = this.tokenize(query);
    if (tokens.length === 0) {
      return {
        answer: 'Could you rephrase that? I\'m here to help with anything about AxiomDSF — workspaces, workflows, agents, APIs, and more!',
        followUps: ['What is AxiomDSF?', 'What can you help with?', 'How does AxiomDSF work?'],
        category: null
      };
    }

    // Expand tokens with synonyms
    const expandedTokens = this.expandWithSynonyms(tokens);

    let bestScore = 0;
    let bestEntry: KnowledgeEntry | null = null;
    let secondBest: KnowledgeEntry | null = null;
    let secondScore = 0;

    // IDF-like weighting: rarer keywords score higher
    const df: Record<string, number> = {};
    for (const entry of this.knowledgeBase) {
      const entryTokens = new Set(entry.keywords);
      for (const t of expandedTokens) {
        if (entryTokens.has(t)) {
          df[t] = (df[t] || 0) + 1;
        }
      }
    }

    for (const entry of this.knowledgeBase) {
      const entryKeywords = new Set(entry.keywords);
      let score = 0;

      for (const token of expandedTokens) {
        if (entryKeywords.has(token)) {
          const idf = 1 / (df[token] || 1);
          // Original tokens get full weight, synonym expansions get half
          const weight = tokens.includes(token) ? 1 + idf : 0.5 + (idf * 0.5);
          score += weight;
        }
        // Partial / substring match (lower weight)
        for (const kw of entry.keywords) {
          if (kw !== token && (kw.includes(token) || token.includes(kw))) {
            score += tokens.includes(token) ? 0.3 : 0.15;
          }
        }
      }

      // Bonus for matching the question string directly
      const questionTokens = this.tokenize(entry.question);
      const overlap = tokens.filter(t => questionTokens.includes(t)).length;
      score += overlap * 0.5;

      // Context bonus: slight preference for entries in the same category as recent conversation
      if (this.lastCategory && entry.category === this.lastCategory) {
        score += 0.3;
      }
      // Broader context bonus
      if (this.contextTopics.includes(entry.category)) {
        score += 0.1;
      }

      if (score > bestScore) {
        secondScore = bestScore;
        secondBest = bestEntry;
        bestScore = score;
        bestEntry = entry;
      } else if (score > secondScore) {
        secondScore = score;
        secondBest = entry;
      }
    }

    if (bestEntry && bestScore >= 1.0) {
      let followUps = bestEntry.followUps || [];
      // If there's a strong second match in a different category, suggest it
      if (secondBest && secondScore >= 1.0 && secondBest.category !== bestEntry.category) {
        const secondQ = secondBest.question;
        if (!followUps.includes(secondQ)) {
          followUps = [...followUps, secondQ];
        }
      }
      return { answer: bestEntry.answer, followUps, category: bestEntry.category };
    }

    // If no good match, suggest based on context or popular topics
    const defaultSuggestions = this.lastCategory
      ? this.knowledgeBase
          .filter(e => e.category === this.lastCategory && e.followUps?.length)
          .slice(0, 3)
          .map(e => e.question)
      : ['What is AxiomDSF?', 'How do I create a workspace?', 'What AI agents are available?'];

    return {
      answer: 'I\'m not sure about that. Try asking about **workspaces**, **workflows**, **agents**, **API endpoints**, **setup**, or **architecture**. I\'m here to help! 💡',
      followUps: defaultSuggestions,
      category: null
    };
  }

  /** Expand tokens with synonyms for fuzzy matching */
  private expandWithSynonyms(tokens: string[]): string[] {
    const expanded = new Set(tokens);
    for (const token of tokens) {
      // Check if token IS a synonym → add the canonical form
      for (const [canonical, syns] of Object.entries(this.synonyms)) {
        if (syns.includes(token)) {
          expanded.add(canonical);
        }
        if (token === canonical) {
          for (const s of syns) expanded.add(s);
        }
      }
    }
    return [...expanded];
  }

  private tokenize(text: string): string[] {
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'it', 'its', 'this', 'that',
      'and', 'or', 'but', 'if', 'then', 'so', 'no', 'not', 'up', 'out',
      'my', 'your', 'i', 'me', 'we', 'you', 'they', 'them', 'he', 'she'
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !stopWords.has(w));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
