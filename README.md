# AxiomDSF - AI-Powered DevSecOps Framework

[![Java](https://img.shields.io/badge/Java-21-orange)](https://openjdk.java.net/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.2.0-brightgreen)](https://spring.io/projects/spring-boot)
[![Angular](https://img.shields.io/badge/Angular-17-red)](https://angular.io/)
[![Maven](https://img.shields.io/badge/Maven-3.9.6-blue)](https://maven.apache.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

AxiomDSF is an enterprise-grade DevSecOps platform that automates software delivery by combining a Spring Boot microservice backend, Angular frontend, SQLite persistence, and AI-driven agent orchestration.

## 🚀 Project Overview

AxiomDSF enables an end-to-end intelligent workflow where requirements are refined, architecture is designed, user stories are generated, code is produced, and quality/security reviews are applied automatically.

This repository contains:
- A modular Maven multi-project backend with business, gateway, persistence, and configuration services
- An Angular 17 frontend application for workspace and workflow management
- A GitHub Copilot CLI-based AI agent orchestration engine
- Preconfigured agent definitions under `.github/agents`
- Azure DevOps integration support for publishing generated outputs

## 🌟 Why AxiomDSF

- Fast prototype and delivery of application solutions
- Structured AI agent pipeline for SDLC automation
- Clear separation of concerns with HLS, HLD, LLD, coding, testing, and review phases
- Built-in support for code quality and security analysis
- Designed for interview/demo-ready presentations and technical storytelling

## 🧠 Agent Pipeline

The platform executes an ordered AI workflow as defined in `config/src/main/resources/application.yaml`:

1. **RequirementAnalysisRefinementAgent** - Analyzes and refines raw requirements
2. **HLSAgent** - Creates high-level solution architecture, tech stack, and deployment strategy
3. **HLDAgent** - Generates high-level design with containers, components, and integration flows
4. **UserStoryAgent** - Produces INVEST-compliant user stories and acceptance criteria
5. **TRReviewAgent** - Reviews test coverage and generates BDD-style test scenarios
6. **LLDAgent** - Creates low-level design with class, data model, and sequence details
7. **TDDAgent** - Converts design and test review into runnable TDD test plans
8. **CodingAgent** - Generates implementation code from LLD and TDD inputs
9. **StaticCodeAnalysisAgent** - Analyzes code quality, smells, and technical debt
10. **SecurityAgent** - Performs security analysis and provides remediation recommendations

## 🏗 Architecture

AxiomDSF is organized as a multi-module Java application plus an Angular client.

- `business/` - Core workflow orchestration, agent execution, services, and domain logic
- `config/` - Application configuration and environment setup
- `gateway/` - API gateway layer for incoming requests
- `persistence/` - Database access, JPA entities, migrations
- `frontend/frontend/` - Angular SPA user interface
- `.github/agents/` - Agent prompt and instruction definitions
- `workspaces/` - Generated workspace artifacts and agent outputs

## 🔧 Prerequisites

- Java 21 or higher
- Maven 3.9.6 or higher
- Node.js 18+ and npm
- GitHub CLI (`gh`) logged in
- GitHub Copilot CLI installed and authorized for agent execution

> If you do not have a Copilot subscription, the core UI and backend still run, but AI agent execution will be disabled or require a mock/alternative implementation.

## 📦 Setup & Run

### 1. Clone the repo

```bash
git clone https://github.com/UjwalaMopuru/AxiomDSF.git
cd AxiomDSF
```

### 2. Build the backend

```bash
mvn clean install
```

### 3. Start the backend server

```bash
mvn spring-boot:run
```

The backend listens on `http://localhost:8080`.

### 4. Install frontend dependencies

```bash
cd frontend/frontend
npm install
```

### 5. Start the frontend

```bash
npm start
```

The frontend opens at `http://localhost:4200`.

## 📖 Usage

### Web UI

1. Open `http://localhost:4200`
2. Create or select a workspace
3. Upload or enter requirements
4. Start a workflow
5. Review agent outputs and workflow status

### API Docs

- Swagger UI: `http://localhost:8080/swagger-ui.html`
- OpenAPI JSON: `http://localhost:8080/v3/api-docs`

### Important Endpoints

- `GET /api/workspaces`
- `POST /api/workspaces`
- `POST /api/workflows`
- `GET /api/agents/{id}/output`

## ⚙️ Configuration

Primary config files:

- `config/src/main/resources/application.yaml`
- `business/src/main/resources/application.yaml`
- `persistence/src/main/resources/application.yaml`

Sample runtime settings:

```bash
SPRING_DATASOURCE_URL=jdbc:sqlite:data/axiomdsf.db
AGENT_EXECUTION_PROVIDER=github-api
AGENT_EXECUTION_COPILOT_COMMAND="gh copilot"
AGENT_EXECUTION_TIMEOUT_MINUTES=240
LOGGING_LEVEL_COM_MPHASIS=DEBUG
```

## 🧪 Testing

### Backend tests

```bash
mvn test
```

### Frontend tests

```bash
cd frontend/frontend
npm test
```

### Integration tests

```bash
mvn verify
```

## 🚀 Deployment

### Production build

```bash
mvn clean package -DskipTests
cd frontend/frontend
npm run build --prod
```

### Docker build (optional)

```bash
docker build -t axiomdsf-backend .
docker build -t axiomdsf-frontend .
```

> Docker Compose support can be added using standard multi-container configuration.

## 📂 Project Structure

```
AxiomDSF/
├── business/                 # Backend business logic, orchestration, services
├── config/                   # Application and runtime configuration
├── gateway/                  # API gateway and routing layer
├── persistence/              # Database and JPA persistence layer
├── frontend/                 # Angular frontend application
│   └── frontend/
├── .github/                  # Agent definitions and GitHub workflows
│   └── agents/
├── workspaces/               # Generated workspace artifacts and outputs
├── pom.xml                   # Maven parent POM
└── README.md                 # Project documentation
```

## 🤝 Contributing

1. Fork this repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "Add feature"
4. Push to your branch: `git push origin feature/your-feature`
5. Open a pull request

## 📝 License

This project is licensed under the MIT License. See `LICENSE` for details.

## ✨ Notes for Interview/Demo

- The codebase shows a complete full-stack implementation
- The AI agent pipeline is explicitly configured and traceable
- The web UI, API docs, and backend services can all be demonstrated
- Real AI execution depends on GitHub Copilot CLI availability

## 🙏 Acknowledgments

- GitHub Copilot for AI agent orchestration concepts
- Spring Boot for the backend architecture
- Angular for the frontend UI
- Maven for project management
- SQLite for lightweight persistence
