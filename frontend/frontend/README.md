# AxiomDSF Frontend

A clean, minimal Angular 17 UI for the AxiomDSF workspace management system.

## Features

- **Dashboard**: Quick overview with workspace count and shortcuts
- **Workspace List**: View all workspaces in a Material table
- **Create Workspace**: Form to create new workspaces

## Setup

### Prerequisites

- Node.js 18+ with npm
- Angular CLI 17

### Installation

```bash
# Install dependencies
npm install

# Build Angular Material theme (if needed)
npm install @angular/material @angular/cdk
```

### Running the Development Server

```bash
# Start the development server
npm start

# Application will be available at http://localhost:4200
```

The frontend will automatically open. Navigate to `http://localhost:4200` in your browser.

## Project Structure

```
src/
├── app/
│   ├── app.component.ts          # Main layout with sidebar
│   ├── app.routes.ts              # Application routing
│   ├── services/
│   │   └── workspace.service.ts   # Backend API integration
│   └── pages/
│       ├── dashboard/
│       ├── workspace-list/
│       └── workspace-create/
├── main.ts                        # Bootstrap file
├── index.html                     # Entry HTML
└── styles.css                     # Global styles
```

## Backend Integration

The frontend connects to the backend at `http://localhost:8080/api/workspace`

### API Endpoints Used

- `GET /api/workspace/list` - List all workspaces
- `POST /api/workspace/create` - Create a new workspace

### Workspace Model

```typescript
interface Workspace {
  id?: number;
  name: string;
  description?: string;
  techStack?: string;
}
```

## Build for Production

```bash
npm run build
```

Build artifacts will be stored in the `dist/` directory.

## Technologies Used

- Angular 17
- Angular Material 17
- RxJS 7
- TypeScript 5.2
