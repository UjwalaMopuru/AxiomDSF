import { Routes } from '@angular/router';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { WorkspaceListComponent } from './pages/workspace-list/workspace-list.component';
import { WorkspaceCreateComponent } from './pages/workspace-create/workspace-create.component';
import { WorkspaceDetailComponent } from './pages/workspace-detail/workspace-detail.component';
import { WorkflowStartComponent } from './pages/workflow-start/workflow-start.component';
import { WorkflowStatusComponent } from './pages/workflow-status/workflow-status.component';
import { DevOpsIntegrationComponent } from './pages/devops-integration/devops-integration.component';
import { AboutComponent } from './pages/about/about.component';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'workspaces', component: WorkspaceListComponent },
  { path: 'workspaces/create', component: WorkspaceCreateComponent },
  { path: 'workspaces/:id', component: WorkspaceDetailComponent },
  { path: 'workflow/start', component: WorkflowStartComponent },
  { path: 'workflow/status', component: WorkflowStatusComponent },
  { path: 'devops', component: DevOpsIntegrationComponent },
  { path: 'about', component: AboutComponent },
  { path: '**', redirectTo: 'dashboard' }
];
