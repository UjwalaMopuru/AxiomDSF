import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule, Params } from '@angular/router';
import { WorkspaceService, Workspace } from '../../services/workspace.service';
import { WorkflowService, Workflow } from '../../services/workflow.service';
import { SystemService, UserStory } from '../../services/system.service';
import { AgentOutputComponent } from '../../components/agent-output/agent-output.component';
import { UserStoryHubComponent } from '../../components/userstory-hub/userstory-hub.component';
import { CodeViewerComponent } from '../../components/code-viewer/code-viewer.component';
import { Subject, takeUntil, interval } from 'rxjs';

@Component({
  selector: 'app-workspace-detail',
  standalone: true,
  imports: [
    CommonModule, RouterModule, FormsModule,
    AgentOutputComponent,
    UserStoryHubComponent, CodeViewerComponent
  ],
  template: `
    <div class="ws-detail" *ngIf="workspace">
      <!-- Workspace Header -->
      <div class="ws-header">
        <div class="ws-header-left">
          <button class="back-btn" routerLink="/workspaces">
            <i class="fas fa-arrow-left"></i>
          </button>
          <div class="ws-header-info">
            <h1>{{ workspace.projectName }}</h1>
            <div class="ws-meta">
              <span class="ws-badge" [class.active]="workspace.status">
                <i class="fas fa-circle"></i> {{ workspace.status ? 'Active' : 'Inactive' }}
              </span>
              <span class="ws-tech" *ngIf="workspace.techStack">
                <i class="fas fa-layer-group"></i> {{ workspace.techStack }}
              </span>
              <span class="ws-id">#{{ workspace.id }}</span>
            </div>
          </div>
        </div>
        <div class="ws-header-right">
          <div class="ws-mode-badge" *ngIf="workspace.pipelineMode">
            <i class="fas" [ngClass]="workspace.pipelineMode === 'full-sequence' ? 'fa-stream' : 'fa-sitemap'"></i>
            {{ workspace.pipelineMode === 'full-sequence' ? 'Full Feature' : 'Per Story' }}
          </div>
          <div class="ws-azure-badge" *ngIf="workspace.azureDevOpsEnabled">
            <i class="fab fa-microsoft"></i> Azure DevOps
          </div>
          <div class="ws-progress" *ngIf="pipelineProgress >= 0">
            <div class="progress-ring">
              <svg width="48" height="48" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="20" fill="none" stroke="#e9f5ee" stroke-width="4"/>
                <circle cx="24" cy="24" r="20" fill="none" stroke="var(--primary-green)" stroke-width="4"
                        [attr.stroke-dasharray]="125.66"
                        [attr.stroke-dashoffset]="125.66 - (pipelineProgress / 100) * 125.66"
                        transform="rotate(-90 24 24)" stroke-linecap="round"/>
              </svg>
              <span class="ring-pct">{{ pipelineProgress }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Description -->
      <div class="ws-desc" *ngIf="workspace.description">
        <i class="fas fa-align-left"></i> {{ workspace.description }}
      </div>

      <!-- Tab Navigation -->
      <div class="tab-nav">
        <button class="tab-btn" [class.active]="activeTab === 'agents'"
                (click)="activeTab = 'agents'">
          <i class="fas fa-robot"></i> Agents
          <span class="tab-count" *ngIf="isFullSequence ? totalAgentsDone > 0 : sharedAgentsDone > 0">{{ isFullSequence ? totalAgentsDone + '/10' : sharedAgentsDone + '/4' }}</span>
        </button>
        <button class="tab-btn" *ngIf="!isFullSequence"
                [class.active]="activeTab === 'stories'"
                (click)="activeTab = 'stories'"
                [class.disabled-tab]="!storiesAvailable">
          <i class="fas fa-bookmark"></i> User Stories
          <span class="tab-count" *ngIf="storiesCount > 0">{{ storiesCount }}</span>
          <span class="lock-icon" *ngIf="!storiesAvailable"><i class="fas fa-lock"></i></span>
        </button>
        <button class="tab-btn" [class.active]="activeTab === 'code'"
                (click)="activeTab = 'code'"
                [class.disabled-tab]="!codeAvailable">
          <i class="fas fa-code"></i> Code
          <span class="lock-icon" *ngIf="!codeAvailable"><i class="fas fa-lock"></i></span>
        </button>
      </div>

      <!-- Tab Content -->
      <div class="tab-content">

        <!-- Agents Tab -->
        <div *ngIf="activeTab === 'agents'" class="agents-tab">
          <!-- Full Feature: All 10 agents -->
          <div *ngIf="isFullSequence">
            <div class="tab-intro">
              <h3><i class="fas fa-stream"></i> Full Feature Pipeline — All 10 Agents</h3>
              <p>All agents run sequentially for the entire workspace: Requirement → HLS → HLD → User Story → Test Review Agent → LLD → TDD → Coding → SCA → Security</p>
            </div>
            <div *ngIf="requirementId">
              <app-agent-output
                [workspaceId]="workspace.id!"
                [requirementId]="requirementId"
                (workflowUpdated)="onWorkflowUpdated($event)"
                (agentCompleted)="onAgentCompleted($event)">
              </app-agent-output>
            </div>
          </div>

          <!-- Per-Story: Shared agents 1-4 only -->
          <div *ngIf="!isFullSequence">
            <div class="tab-intro">
              <h3><i class="fas fa-sitemap"></i> Shared Pipeline — Agents 1-4</h3>
              <p>These agents run once for the entire workspace: Requirement → HLS → HLD → User Story</p>
            </div>
            <div *ngIf="requirementId">
              <app-agent-output
                [workspaceId]="workspace.id!"
                [requirementId]="requirementId"
                [agentFilter]="[1, 2, 3, 4]"
                (workflowUpdated)="onWorkflowUpdated($event)"
                (agentCompleted)="onAgentCompleted($event)">
              </app-agent-output>
            </div>
          </div>

          <div class="no-pipeline" *ngIf="!requirementId">
            <i class="fas fa-rocket"></i>
            <h4>No Pipeline Started</h4>
            <p>Start a workflow for this workspace from the <a routerLink="/workflow/start">Workflow Start</a> page.</p>
          </div>
        </div>

        <!-- User Stories Tab (only for per-story mode) -->
        <div *ngIf="activeTab === 'stories' && !isFullSequence" class="stories-tab">
          <div *ngIf="storiesAvailable && requirementId">
            <app-userstory-hub
              [workspaceId]="workspace.id!"
              [requirementId]="requirementId"
              (workflowUpdated)="onWorkflowUpdated($event)">
            </app-userstory-hub>
          </div>
          <div class="locked-tab" *ngIf="!storiesAvailable">
            <i class="fas fa-lock"></i>
            <h4>User Stories Not Available Yet</h4>
            <p>Complete the shared pipeline (agents 1-4) and approve the User Story agent output to unlock this tab.</p>
          </div>
        </div>

        <!-- Code Tab -->
        <div *ngIf="activeTab === 'code'" class="code-tab">
          <div *ngIf="codeAvailable && requirementId">
            <!-- Story selector for code -->
            <div class="code-story-selector" *ngIf="stories.length > 0">
              <label><i class="fas fa-bookmark"></i> View code for:</label>
              <select [(ngModel)]="selectedCodeStoryId" (ngModelChange)="onCodeStoryChange()">
                <option [ngValue]="undefined">All Stories (combined)</option>
                <option *ngFor="let s of stories" [ngValue]="s.id">
                  {{ s.storyId || 'US-' + s.id }} — {{ s.title }}
                </option>
              </select>
            </div>
            <app-code-viewer
              [workspaceId]="workspace.id!"
              [requirementId]="requirementId"
              [userStoryId]="selectedCodeStoryId">
            </app-code-viewer>
          </div>
          <div class="locked-tab" *ngIf="!codeAvailable">
            <i class="fas fa-lock"></i>
            <h4>Code Not Available Yet</h4>
            <p>Code will appear here once the Coding Agent (agent 8) completes for at least one user story.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div class="ws-loading" *ngIf="!workspace && !error">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Loading workspace...</p>
    </div>

    <!-- Error -->
    <div class="ws-error" *ngIf="error">
      <i class="fas fa-exclamation-triangle"></i>
      <p>{{ error }}</p>
      <button class="retry-btn" (click)="loadWorkspace()">
        <i class="fas fa-redo"></i> Retry
      </button>
    </div>
  `,
  styles: [`
    .ws-detail { width: 100%; }

    /* Header */
    .ws-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px;
    }
    .ws-header-left { display: flex; align-items: center; gap: 16px; }
    .ws-header-right { display: flex; align-items: center; gap: 10px; }
    .back-btn {
      width: 38px; height: 38px; border-radius: 10px; border: 1px solid #e0e0e0;
      background: white; cursor: pointer; color: #555; font-size: 14px;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s;
    }
    .back-btn:hover { border-color: var(--primary-green); color: var(--primary-green); background: #f0fdf4; }

    .ws-header-info h1 { margin: 0; font-size: 1.5em; color: var(--dark-green); }
    .ws-meta { display: flex; align-items: center; gap: 12px; margin-top: 4px; }
    .ws-badge {
      font-size: 0.72em; padding: 2px 10px; border-radius: 10px; font-weight: 600;
      background: #fee2e2; color: #991b1b; display: flex; align-items: center; gap: 4px;
    }
    .ws-badge i { font-size: 0.5em; }
    .ws-badge.active { background: #dcfce7; color: #166534; }
    .ws-tech { font-size: 0.8em; color: #888; display: flex; align-items: center; gap: 4px; }
    .ws-tech i { color: var(--primary-green); font-size: 0.85em; }
    .ws-id { font-size: 0.75em; color: #aaa; font-weight: 600; }

    .ws-mode-badge, .ws-azure-badge {
      font-size: 0.72em; padding: 4px 10px; border-radius: 8px;
      font-weight: 600; display: flex; align-items: center; gap: 5px;
    }
    .ws-mode-badge { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .ws-azure-badge { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

    .progress-ring { position: relative; width: 48px; height: 48px; }
    .progress-ring svg { display: block; }
    .ring-pct {
      position: absolute; inset: 0; display: flex; align-items: center;
      justify-content: center; font-size: 11px; font-weight: 700; color: var(--primary-green);
    }

    .ws-desc {
      padding: 10px 16px; background: #f8fdf9; border: 1px solid #e9f5ee;
      border-radius: 8px; font-size: 0.85em; color: #555; margin-bottom: 16px;
    }
    .ws-desc i { color: var(--primary-green); margin-right: 8px; }

    /* Tab Navigation */
    .tab-nav {
      display: flex; gap: 4px; background: white; padding: 6px 8px;
      border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      margin-bottom: 16px;
    }
    .tab-btn {
      display: flex; align-items: center; gap: 8px; padding: 10px 20px;
      border: none; border-radius: 8px; background: transparent;
      color: #888; font-weight: 500; font-size: 0.88em; cursor: pointer;
      font-family: 'Poppins', sans-serif; transition: all 0.2s;
    }
    .tab-btn:hover { background: #f0fdf4; color: var(--primary-green); }
    .tab-btn.active {
      background: linear-gradient(135deg, var(--light-green), var(--primary-green));
      color: white; box-shadow: 0 4px 12px rgba(58,125,68,0.25);
    }
    .tab-btn.active i { color: white; }
    .tab-btn i { color: var(--primary-green); }
    .tab-count {
      font-size: 0.72em; padding: 1px 7px; border-radius: 8px;
      background: rgba(58,125,68,0.12); color: var(--primary-green); font-weight: 600;
    }
    .tab-btn.active .tab-count { background: rgba(255,255,255,0.25); color: white; }
    .tab-btn.disabled-tab { opacity: 0.5; }
    .lock-icon { font-size: 0.7em; color: #aaa; margin-left: 2px; }
    .tab-btn.active .lock-icon { color: rgba(255,255,255,0.6); }

    /* Tab Content */
    .tab-content { animation: fadeIn 0.25s ease; }

    .tab-intro {
      margin-bottom: 16px; padding: 16px 20px; background: white;
      border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .tab-intro h3 { margin: 0 0 4px; font-size: 1em; color: var(--dark-green); }
    .tab-intro h3 i { margin-right: 8px; color: var(--primary-green); }
    .tab-intro p { margin: 0; font-size: 0.82em; color: #888; }

    .no-pipeline, .locked-tab {
      text-align: center; padding: 60px 24px; background: white;
      border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.06);
    }
    .no-pipeline i, .locked-tab i { font-size: 2.5em; color: #ddd; display: block; margin-bottom: 12px; }
    .no-pipeline h4, .locked-tab h4 { color: #555; margin: 0 0 8px; }
    .no-pipeline p, .locked-tab p { color: #999; font-size: 0.88em; margin: 0; max-width: 400px; display: inline-block; }
    .no-pipeline a { color: var(--primary-green); font-weight: 600; }

    .code-story-selector {
      display: flex; align-items: center; gap: 12px; margin-bottom: 14px;
      padding: 12px 16px; background: white; border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }
    .code-story-selector label {
      font-size: 0.85em; font-weight: 500; color: #555; white-space: nowrap;
    }
    .code-story-selector label i { margin-right: 6px; color: var(--primary-green); }
    .code-story-selector select {
      flex: 1; padding: 8px 12px; border: 1px solid #e0e0e0; border-radius: 8px;
      font-size: 0.85em; font-family: 'Poppins', sans-serif;
      background: white; cursor: pointer;
    }
    .code-story-selector select:focus { outline: none; border-color: var(--primary-green); }

    .ws-loading, .ws-error {
      text-align: center; padding: 60px; color: #555;
    }
    .ws-loading i, .ws-error i { font-size: 2em; display: block; margin-bottom: 12px; }
    .ws-loading i { color: var(--primary-green); }
    .ws-error i { color: #ef4444; }
    .retry-btn {
      margin-top: 12px; padding: 8px 16px; border: 1px solid #e0e0e0;
      border-radius: 8px; background: white; cursor: pointer;
      font-family: 'Poppins', sans-serif; font-size: 0.85em;;
      transition: all 0.2s;
    }
    .retry-btn:hover { border-color: var(--primary-green); color: var(--primary-green); }
    .retry-btn i { margin-right: 6px; }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 768px) {
      .ws-header { flex-direction: column; align-items: flex-start; gap: 12px; }
      .tab-nav { flex-direction: column; }
    }
  `]
})
export class WorkspaceDetailComponent implements OnInit, OnDestroy {
  workspace: Workspace | null = null;
  activeTab: 'agents' | 'stories' | 'code' = 'agents';
  requirementId = 0;
  workflows: Workflow[] = [];
  stories: UserStory[] = [];
  error: string | null = null;
  selectedCodeStoryId?: number;

  pipelineProgress = -1;
  sharedAgentsDone = 0;
  totalAgentsDone = 0;
  isFullSequence = false;
  storiesAvailable = false;
  codeAvailable = false;
  storiesCount = 0;
  sharedPhaseNeedsApproval = false;

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private workspaceService: WorkspaceService,
    private workflowService: WorkflowService,
    private systemService: SystemService
  ) {}

  ngOnInit() {
    this.route.params.subscribe((params: Params) => {
      const id = params['id'];
      if (id) {
        this.loadWorkspace(Number(id));
      }
    });

    // Auto-refresh every 6 seconds
    interval(6000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.workspace?.id && this.requirementId) {
        this.refreshPipelineState();
      }
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadWorkspace(id?: number) {
    const wsId = id || this.workspace?.id;
    if (!wsId) return;
    this.error = null;

    this.workspaceService.getWorkspaceById(wsId).subscribe({
      next: (ws: Workspace) => {
        this.workspace = ws;
        this.loadPipelineData();
      },
      error: () => { this.error = `Workspace #${wsId} not found.`; }
    });
  }

  private loadPipelineData() {
    if (!this.workspace?.id) return;

    // Get workflows for this specific workspace
    this.workflowService.getWorkflowsByContext(this.workspace.id, 0).subscribe({
      next: (wsWfs: Workflow[]) => {
        // If no workflows with requirementId=0, get all and filter
        if (wsWfs.length === 0) {
          this.workflowService.getAllWorkflows().subscribe({
            next: (allWfs: Workflow[]) => {
              const filtered = allWfs.filter(w => w.workspaceId === this.workspace!.id);
              this.workflows = filtered;
              if (filtered.length > 0) {
                this.requirementId = filtered.find(w => w.requirementId)?.requirementId || 0;
                this.updatePipelineState();
                this.loadStories();
              }
            },
            error: () => {}
          });
        } else {
          this.workflows = wsWfs;
          this.requirementId = wsWfs.find(w => w.requirementId)?.requirementId || 0;
          this.updatePipelineState();
          this.loadStories();
        }
      },
      error: () => {}
    });
  }

  private refreshPipelineState() {
    if (!this.workspace?.id) return;
    this.workflowService.getWorkflowsByContext(this.workspace.id, this.requirementId).subscribe({
      next: (wfs: Workflow[]) => {
        this.workflows = wfs;
        this.updatePipelineState();
      },
      error: () => {}
    });
  }

  private updatePipelineState() {
    // Detect pipeline mode from any workflow record
    const anyWithMode = this.workflows.find(w => w.pipelineMode);
    this.isFullSequence = anyWithMode?.pipelineMode === 'full-sequence';

    // If full-sequence and user somehow landed on stories tab, redirect to agents
    if (this.isFullSequence && this.activeTab === 'stories') {
      this.activeTab = 'agents';
    }

    const sharedWfs = this.workflows.filter(w => !w.userStoryId && w.sequenceNumber <= 4);
    this.sharedAgentsDone = sharedWfs.filter(w => ['APPROVED', 'COMPLETED'].includes(w.state)).length;
    this.sharedPhaseNeedsApproval = sharedWfs.some(w => w.state === 'IN_REVIEW');

    // Total agents done (for full-sequence mode display)
    this.totalAgentsDone = this.workflows.filter(w => ['APPROVED', 'COMPLETED'].includes(w.state)).length;

    // Stories available if agent 4 is completed (only relevant for per-story mode)
    const agent4Done = sharedWfs.some(w => w.sequenceNumber === 4 && ['APPROVED', 'COMPLETED'].includes(w.state));
    this.storiesAvailable = agent4Done && !this.isFullSequence;

    // Code available if any coding agent (8) completed
    this.codeAvailable = this.workflows.some(w =>
      w.sequenceNumber === 8 && ['APPROVED', 'COMPLETED', 'IN_REVIEW'].includes(w.state)
    );

    // Overall progress
    const completedCount = this.workflows.filter(w => ['APPROVED', 'COMPLETED'].includes(w.state)).length;
    const total = Math.max(this.workflows.length, 1);
    this.pipelineProgress = Math.round((completedCount / total) * 100);
  }

  private loadStories() {
    if (!this.requirementId) return;
    this.systemService.getUserStoriesByRequirement(this.requirementId).subscribe({
      next: (stories: UserStory[]) => {
        this.stories = stories;
        this.storiesCount = stories.length;
      },
      error: () => {}
    });
  }

  onWorkflowUpdated(wf: Workflow) {
    this.refreshPipelineState();
    this.loadStories();
    // Auto-switch to User Stories tab when UserStoryAgent (agent 4) is approved
    if (wf.agentName === 'UserStoryAgent' && wf.state === 'APPROVED') {
      this.storiesAvailable = true;
      this.activeTab = 'stories';
    }
  }

  onAgentCompleted(agentName: string) {
    // When UserStory agent reaches IN_REVIEW, load stories (they may be available in DB)
    // But don't enable the tab until APPROVED
    if (agentName === 'UserStoryAgent') {
      this.loadStories();
    }
  }

  onCodeStoryChange() {
    // Triggers ngOnChanges in code-viewer via [userStoryId] binding
  }
}
