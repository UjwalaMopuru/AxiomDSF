import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { WorkspaceService, Workspace } from '../../services/workspace.service';

@Component({
  selector: 'app-workspace-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="workspace-list">
      <div class="page-header">
        <h1><i class="fas fa-folder-open"></i> Workspaces</h1>
        <a routerLink="/workspaces/create" class="action-btn primary">
          <i class="fas fa-plus-circle"></i> Create Workspace
        </a>
      </div>

      <!-- Loading -->
      <div *ngIf="loading" class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Loading workspaces...</p>
      </div>

      <!-- Empty -->
      <div *ngIf="!loading && workspaces.length === 0" class="empty-state data-card">
        <i class="fas fa-inbox"></i>
        <p>No workspaces yet. <a routerLink="/workspaces/create">Create one</a> to get started.</p>
      </div>

      <!-- Workspace Cards -->
      <div class="workspace-grid" *ngIf="!loading && workspaces.length > 0">
        <div class="workspace-card bounce-in" *ngFor="let ws of workspaces; let i = index"
             [routerLink]="['/workspaces', ws.id]" style="cursor:pointer">
          <div class="card-header gradient-box">
            <div class="card-id">#{{ ws.id }}</div>
            <h3>{{ ws.projectName }}</h3>
          </div>
          <div class="card-body">
            <div class="card-field">
              <i class="fas fa-align-left"></i>
              <span>{{ ws.description || 'No description' }}</span>
            </div>
            <div class="card-field">
              <i class="fas fa-layer-group"></i>
              <span>{{ ws.techStack || 'Not specified' }}</span>
            </div>
            <div class="card-field" *ngIf="ws.location">
              <i class="fas fa-folder"></i>
              <span class="location-text">{{ ws.location }}</span>
            </div>
          </div>
          <div class="card-footer">
            <span class="status-badge" [class.active]="ws.status">
              <i class="fas fa-circle"></i> {{ ws.status ? 'Active' : 'Inactive' }}
            </span>
            <span class="card-mode" *ngIf="ws.pipelineMode">
              {{ ws.pipelineMode === 'full-sequence' ? 'Full Seq' : 'Per Story' }}
            </span>
            <span class="azure-indicator" *ngIf="ws.azureDevOpsEnabled" title="Azure DevOps enabled">
              <i class="fab fa-microsoft"></i>
            </span>
            <button class="delete-btn" (click)="deleteWorkspace(ws, $event)" title="Delete workspace">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Table View -->
      <div class="table-section data-card" *ngIf="!loading && workspaces.length > 0">
        <h3><i class="fas fa-table"></i> All Workspaces</h3>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Project Name</th>
                <th>Description</th>
                <th>Tech Stack</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let ws of workspaces">
                <td>{{ ws.id }}</td>
                <td><strong>{{ ws.projectName }}</strong></td>
                <td>{{ ws.description || '-' }}</td>
                <td>{{ ws.techStack || '-' }}</td>
                <td>{{ ws.pipelineMode === 'full-sequence' ? 'Full Seq' : 'Per Story' }}</td>
                <td>
                  <span class="status-badge small" [class.active]="ws.status">
                    {{ ws.status ? 'Active' : 'Inactive' }}
                  </span>
                </td>
                <td>
                  <button class="table-delete-btn" (click)="deleteWorkspace(ws, $event)" title="Delete">
                    <i class="fas fa-trash-alt"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Error -->
      <div *ngIf="error" class="error-banner">
        <i class="fas fa-exclamation-triangle"></i>
        <span>{{ error }}</span>
        <button class="retry-btn" (click)="loadWorkspaces()"><i class="fas fa-redo"></i> Retry</button>
      </div>
    </div>
  `,
  styles: [`
    .workspace-list { width: 100%; }

    .page-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 28px;
    }
    .page-header h1 { margin: 0; font-size: 1.6em; }
    .page-header h1 i { margin-right: 12px; color: #3A7D44; }
    .action-btn {
      display: inline-flex; align-items: center; padding: 12px 20px;
      border-radius: 8px; font-weight: 500; font-size: 0.9em;
      cursor: pointer; transition: all 0.3s ease; text-decoration: none;
      font-family: 'Poppins', sans-serif;
    }
    .action-btn.primary {
      background: linear-gradient(135deg, #5DBB63, #3A7D44);
      color: white; box-shadow: 0 4px 12px rgba(58,125,68,0.3);
    }
    .action-btn.primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(58,125,68,0.4); }
    .action-btn i { margin-right: 8px; }

    .loading-state {
      text-align: center; padding: 60px; color: #3A7D44;
    }
    .loading-state i { font-size: 2em; margin-bottom: 12px; display: block; }

    .empty-state {
      text-align: center; padding: 60px; color: #6b7280;
    }
    .empty-state i { font-size: 3em; color: #ddd; margin-bottom: 12px; display: block; }
    .empty-state a { color: #3A7D44; font-weight: 600; }

    .data-card {
      background: white; padding: 24px; border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08); margin-bottom: 24px;
    }
    .data-card h3 { font-size: 1.1em; margin-bottom: 16px; color: #2E673A; }
    .data-card h3 i { margin-right: 8px; color: #3A7D44; }

    /* Grid of cards */
    .workspace-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 20px; margin-bottom: 28px;
    }
    .workspace-card {
      background: white; border-radius: 10px; overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08); transition: all 0.3s ease;
    }
    .workspace-card:hover {
      transform: translateY(-5px); box-shadow: 0 8px 24px rgba(58,125,68,0.15);
    }
    .card-header {
      padding: 20px; position: relative;
    }
    .card-header h3 { margin: 0; font-size: 1.2em; color: white; }
    .card-id {
      position: absolute; top: 12px; right: 16px;
      background: rgba(255,255,255,0.2); padding: 2px 10px;
      border-radius: 12px; font-size: 0.75em; font-weight: 600;
    }
    .card-body { padding: 16px 20px; }
    .card-field {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 8px 0; font-size: 0.9em; color: #555;
      border-bottom: 1px dashed #f0f0f0;
    }
    .card-field:last-child { border-bottom: none; }
    .card-field i { color: #3A7D44; width: 16px; text-align: center; margin-top: 3px; }
    .location-text {
      font-size: 0.8em; word-break: break-all; color: #888;
    }
    .card-footer {
      padding: 12px 20px; border-top: 1px solid #f0f0f0;
      display: flex; justify-content: flex-end;
    }

    .status-badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 12px; border-radius: 12px; font-size: 0.8em; font-weight: 600;
      background: #fee2e2; color: #991b1b;
    }
    .status-badge.active { background: #dcfce7; color: #166534; }
    .status-badge.small { font-size: 0.75em; padding: 2px 8px; }
    .status-badge i { font-size: 0.5em; }

    /* Table */
    .table-wrapper { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    table th, table td {
      padding: 12px 16px; text-align: left;
      border-bottom: 1px solid #e0e0e0; font-size: 0.9em;
    }
    table th {
      background: #e9f5ee; color: #2E673A; font-weight: 600;
    }
    table tr:hover { background: #f8fdf9; }

    .error-banner {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 20px; background: #fef2f2; border: 1px solid #fecaca;
      border-radius: 8px; color: #991b1b; margin-top: 16px;
    }
    .retry-btn {
      margin-left: auto; padding: 8px 16px; background: #3A7D44;
      color: white; border: none; border-radius: 6px; cursor: pointer;
      font-family: 'Poppins', sans-serif; font-weight: 500;
    }
    .retry-btn:hover { background: #2E673A; }

    .card-footer { display: flex; align-items: center; gap: 8px; }
    .card-mode { font-size: 0.7em; color: #1d4ed8; background: #eff6ff; padding: 2px 8px; border-radius: 6px; font-weight: 500; }
    .azure-indicator { color: #166534; font-size: 0.85em; }
    .delete-btn, .table-delete-btn {
      background: none; border: none; cursor: pointer; color: #aaa;
      padding: 4px 6px; border-radius: 4px; margin-left: auto; transition: all 0.2s;
    }
    .delete-btn:hover, .table-delete-btn:hover { color: #ef4444; background: #fee2e2; }

    @media (max-width: 768px) {
      .page-header { flex-direction: column; gap: 12px; align-items: flex-start; }
      .workspace-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class WorkspaceListComponent implements OnInit {
  workspaces: Workspace[] = [];
  loading = true;
  error: string | null = null;

  constructor(private workspaceService: WorkspaceService) {}

  ngOnInit() { this.loadWorkspaces(); }

  loadWorkspaces() {
    this.loading = true;
    this.error = null;
    this.workspaceService.listWorkspaces().subscribe({
      next: (data: Workspace[]) => { this.workspaces = data; this.loading = false; },
      error: (_err: any) => {
        this.error = 'Failed to load workspaces. Ensure the backend is running on port 8080.';
        this.loading = false;
      }
    });
  }

  deleteWorkspace(ws: Workspace, event: Event) {
    event.stopPropagation();
    if (!confirm(`Delete workspace "${ws.projectName}"? This cannot be undone.`)) return;
    this.workspaceService.deleteWorkspace(ws.id!).subscribe({
      next: () => { this.workspaces = this.workspaces.filter(w => w.id !== ws.id); },
      error: () => { this.error = 'Failed to delete workspace.'; }
    });
  }
}
