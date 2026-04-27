import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Params } from '@angular/router';
import { WorkspaceService, Workspace } from '../../services/workspace.service';
import { WorkflowService, Workflow } from '../../services/workflow.service';
import { AgentOutputComponent } from '../../components/agent-output/agent-output.component';
import { ApprovalPanelComponent } from '../../components/approval-panel/approval-panel.component';
import { UserStoryHubComponent } from '../../components/userstory-hub/userstory-hub.component';
import { Subject, takeUntil, interval } from 'rxjs';

interface WorkspaceGroup {
  workspaceId: number;
  workspaceName: string;
  workflows: Workflow[];
  expanded: boolean;
}

interface PipelineContext {
  workspaceId: number;
  requirementId: number;
  workspaceName: string;
  highestSequence: number;
  sharedWorkflows: Workflow[];
  allWorkflows: Workflow[];
  overallState: string;
  overallProgress: number;
  reachedBranching: boolean;
  pipelineMode: string;
}

// Top-level shared agents only (1-4) — per-story agents shown in UserStoryHub
const SHARED_AGENTS = [
  { order: 1, name: 'Requirement', icon: '📋', phase: 'shared' },
  { order: 2, name: 'HLS', icon: '🏗️', phase: 'shared' },
  { order: 3, name: 'HLD', icon: '📐', phase: 'shared' },
  { order: 4, name: 'User Story', icon: '📖', phase: 'shared' },
];

// Per-story agents (5-10) — new pipeline order
const PER_STORY_AGENTS = [
  { order: 5, name: 'Test Review Agent', icon: '✅', phase: 'per-story' },
  { order: 6, name: 'LLD', icon: '⚙️', phase: 'per-story' },
  { order: 7, name: 'TDD', icon: '🧪', phase: 'per-story' },
  { order: 8, name: 'Coding', icon: '💻', phase: 'per-story' },
  { order: 9, name: 'Static Analysis', icon: '🔍', phase: 'per-story' },
  { order: 10, name: 'Security', icon: '🔐', phase: 'per-story' },
];

@Component({
  selector: 'app-workflow-status',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AgentOutputComponent, ApprovalPanelComponent, UserStoryHubComponent],
  template: `
    <div class="workflow-status">

      <!-- Page Header -->
      <div class="page-header">
        <div class="header-left">
          <h1><i class="fas fa-clipboard-list"></i> Workflow Status</h1>
          <p class="page-subtitle">Monitor and manage your AI agent pipelines</p>
        </div>
        <button class="refresh-global-btn" (click)="refreshEverything()" [disabled]="loadingAll">
          <i class="fas" [ngClass]="loadingAll ? 'fa-spinner fa-spin' : 'fa-sync-alt'"></i>
          Refresh
        </button>
      </div>

      <!-- Context Selector — compact bar -->
      <section class="context-bar" [class.has-context]="!!pipeline">
        <form [formGroup]="statusForm" (ngSubmit)="onCheckStatus()" class="context-form">
          <div class="ctx-field">
            <label><i class="fas fa-folder"></i> Workspace</label>
            <select formControlName="workspaceId" class="ctx-select">
              <option value="" disabled>Select workspace...</option>
              <option *ngFor="let ws of workspaces" [value]="ws.id">{{ ws.projectName }}</option>
            </select>
          </div>
          <div class="ctx-field">
            <label><i class="fas fa-clipboard"></i> Requirement ID</label>
            <input type="number" formControlName="requirementId" placeholder="e.g. 1" class="ctx-input">
          </div>
          <button type="submit" class="ctx-btn"
                  [disabled]="!statusForm.valid || checking">
            <i class="fas" [ngClass]="checking ? 'fa-spinner fa-spin' : 'fa-arrow-right'"></i>
            {{ checking ? 'Loading...' : 'View Pipeline' }}
          </button>
        </form>
      </section>

      <!-- ============ PIPELINE VIEW ============ -->
      <div *ngIf="pipeline" class="pipeline-view">

        <!-- Pipeline Header Card -->
        <div class="pipeline-header-card">
          <div class="ph-left">
            <div class="ph-icon"><i class="fas fa-project-diagram"></i></div>
            <div>
              <h2>{{ pipeline.workspaceName }}</h2>
              <span class="ph-meta">Requirement #{{ pipeline.requirementId }}</span>
            </div>
          </div>
          <div class="ph-right">
            <span class="state-pill" [ngClass]="getOverallStateClass(pipeline.overallState)">
              <i class="fas" [ngClass]="getStateIcon(pipeline.overallState)"></i>
              {{ pipeline.overallState }}
            </span>
            <div class="ph-progress-wrap">
              <div class="ph-progress-bar"><div class="ph-progress-fill" [style.width.%]="pipeline.overallProgress"></div></div>
              <span class="ph-pct">{{ pipeline.overallProgress }}%</span>
            </div>
          </div>
        </div>

        <!-- Phase 1: Shared Pipeline (Agents 1-4) -->
        <section class="phase-section">
          <div class="phase-header" (click)="showSharedPhase = !showSharedPhase">
            <div class="phase-title">
              <span class="phase-number">1</span>
              <div>
                <h3>Shared Pipeline</h3>
                <span class="phase-desc">Requirement → HLS → HLD → User Story (runs once)</span>
              </div>
            </div>
            <div class="phase-right">
              <span class="phase-badge" [ngClass]="getSharedPhaseBadgeClass()">
                {{ getSharedPhaseLabel() }}
              </span>
              <i class="fas" [ngClass]="showSharedPhase ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
            </div>
          </div>
          <div class="phase-body" *ngIf="showSharedPhase">
            <app-agent-output
              [workspaceId]="pipeline.workspaceId"
              [requirementId]="pipeline.requirementId"
              [agentFilter]="[1,2,3,4]"
              (workflowUpdated)="onWorkflowUpdated($event)">
            </app-agent-output>
          </div>
        </section>

        <!-- Branch Divider -->
        <div class="branch-divider" *ngIf="pipeline.reachedBranching && !isFullSequenceMode()">
          <div class="branch-line-left"></div>
          <div class="branch-badge">
            <i class="fas fa-code-branch"></i>
            User Story Branching &mdash; Each story runs its own pipeline (Test Review Agent → Security)
          </div>
          <div class="branch-line-right"></div>
        </div>

        <!-- Phase 2: Per-Story Pipeline (Agents 5-10) — only for per-story mode -->
        <section class="phase-section" *ngIf="pipeline.reachedBranching && !isFullSequenceMode()">
          <div class="phase-header" (click)="showStoryPhase = !showStoryPhase">
            <div class="phase-title">
              <span class="phase-number">2</span>
              <div>
                <h3>Per-Story Pipeline</h3>
                <span class="phase-desc">Test Review Agent → LLD → TDD → Coding → Static Analysis → Security (per user story)</span>
              </div>
            </div>
            <div class="phase-right">
              <span class="phase-badge badge-story">
                <i class="fas fa-layer-group"></i> Story Hub
              </span>
              <i class="fas" [ngClass]="showStoryPhase ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
            </div>
          </div>
          <div class="phase-body" *ngIf="showStoryPhase">
            <app-userstory-hub
              [workspaceId]="pipeline.workspaceId"
              [requirementId]="pipeline.requirementId"
              (workflowUpdated)="onWorkflowUpdated($event)">
            </app-userstory-hub>
          </div>
        </section>

        <!-- Phase 2: Full Feature Pipeline (Agents 5-10) — for full-sequence mode -->
        <section class="phase-section" *ngIf="pipeline.reachedBranching && isFullSequenceMode()">
          <div class="phase-header" (click)="showStoryPhase = !showStoryPhase">
            <div class="phase-title">
              <span class="phase-number">2</span>
              <div>
                <h3>Full Feature Pipeline</h3>
                <span class="phase-desc">Test Review Agent → LLD → TDD → Coding → Static Analysis → Security (all stories together)</span>
              </div>
            </div>
            <div class="phase-right">
              <span class="phase-badge badge-linear">
                <i class="fas fa-stream"></i> Sequential
              </span>
              <i class="fas" [ngClass]="showStoryPhase ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
            </div>
          </div>
          <div class="phase-body" *ngIf="showStoryPhase">
            <!-- TDD-Coding Loop Indicator -->
            <div class="loop-banner">
              <i class="fas fa-sync-alt"></i>
              <span>Code ↔ TDD Verification Loop: Coding agent validates against TDD test cases. If any test fails, code is automatically reworked.</span>
            </div>
            <app-agent-output
              [workspaceId]="pipeline.workspaceId"
              [requirementId]="pipeline.requirementId"
              [agentFilter]="[5,6,7,8,9,10]"
              (workflowUpdated)="onWorkflowUpdated($event)">
            </app-agent-output>
          </div>
        </section>

        <!-- Waiting for branching -->
        <div class="waiting-branch" *ngIf="!pipeline.reachedBranching">
          <div class="waiting-icon"><i class="fas fa-hourglass-half"></i></div>
          <h4>Waiting for User Story Agent</h4>
          <p>The {{ isFullSequenceMode() ? 'full feature' : 'per-story' }} pipeline will activate once Agent 4 (User Story) completes and generates stories.</p>
        </div>
      </div>

      <!-- ============ ALL WORKFLOWS OVERVIEW ============ -->
      <section class="overview-section">
        <div class="overview-header">
          <h3><i class="fas fa-th-large"></i> All Pipelines</h3>
          <div class="overview-actions">
            <div class="view-toggle">
              <button class="toggle-btn" [class.active]="viewMode === 'grouped'" (click)="viewMode = 'grouped'" title="Group by workspace">
                <i class="fas fa-layer-group"></i>
              </button>
              <button class="toggle-btn" [class.active]="viewMode === 'flat'" (click)="viewMode = 'flat'" title="Flat list">
                <i class="fas fa-th-large"></i>
              </button>
            </div>
          </div>
        </div>

        <div *ngIf="loadingAll" class="loading-state">
          <i class="fas fa-spinner fa-spin"></i> Loading workflows...
        </div>

        <div *ngIf="!loadingAll && workflows.length === 0" class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>No workflows found. Start a new pipeline from the <a routerLink="/workflow/start">Workflow Start</a> page.</p>
        </div>

        <!-- Grouped View -->
        <div *ngIf="!loadingAll && viewMode === 'grouped' && workspaceGroups.length > 0">
          <div *ngFor="let group of workspaceGroups" class="workspace-group">
            <div class="group-header" (click)="group.expanded = !group.expanded">
              <div class="group-title">
                <i class="fas" [ngClass]="group.expanded ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
                <i class="fas fa-folder-open group-icon"></i>
                <strong>{{ group.workspaceName }}</strong>
                <span class="group-count">{{ group.workflows.length }}</span>
              </div>
              <div class="group-summary">
                <span class="mini-badge bg-green" *ngIf="countByState(group.workflows, 'complete') > 0">{{ countByState(group.workflows, 'complete') }}</span>
                <span class="mini-badge bg-blue" *ngIf="countByState(group.workflows, 'progress') > 0">{{ countByState(group.workflows, 'progress') }}</span>
                <span class="mini-badge bg-purple" *ngIf="countByState(group.workflows, 'review') > 0">{{ countByState(group.workflows, 'review') }}</span>
                <span class="mini-badge bg-red" *ngIf="countByState(group.workflows, 'fail') > 0">{{ countByState(group.workflows, 'fail') }}</span>
              </div>
            </div>
            <div class="group-body" *ngIf="group.expanded">
              <div *ngFor="let wf of group.workflows" class="wf-card"
                   (click)="quickView(wf)">
                <div class="wf-card-top">
                  <span class="wf-id">#{{ wf.id }}</span>
                  <span class="state-pill small" [ngClass]="getStateClass(wf.state)">{{ wf.state }}</span>
                </div>
                <div class="wf-card-info">
                  <span *ngIf="wf.requirementId"><i class="fas fa-clipboard"></i> Req #{{ wf.requirementId }}</span>
                  <span *ngIf="wf.agentName"><i class="fas fa-robot"></i> {{ formatAgentName(wf.agentName) }}</span>
                  <span *ngIf="wf.userStoryId"><i class="fas fa-bookmark"></i> Story #{{ wf.userStoryId }}</span>
                </div>
                <div class="wf-card-progress">
                  <div class="wf-card-bar"><div class="wf-card-fill" [style.width.%]="(wf.sequenceNumber / 10) * 100"></div></div>
                  <span class="wf-card-step">{{ wf.sequenceNumber }}/10</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Flat View -->
        <div *ngIf="!loadingAll && viewMode === 'flat' && workflows.length > 0" class="flat-grid">
          <div *ngFor="let wf of workflows" class="wf-card" (click)="quickView(wf)">
            <div class="wf-card-top">
              <span class="wf-id">#{{ wf.id }}</span>
              <span class="state-pill small" [ngClass]="getStateClass(wf.state)">{{ wf.state }}</span>
            </div>
            <div class="wf-card-info">
              <span><i class="fas fa-folder"></i> {{ getWorkspaceName(wf.workspaceId) }}</span>
              <span *ngIf="wf.requirementId"><i class="fas fa-clipboard"></i> Req #{{ wf.requirementId }}</span>
              <span *ngIf="wf.agentName"><i class="fas fa-robot"></i> {{ formatAgentName(wf.agentName) }}</span>
            </div>
            <div class="wf-card-progress">
              <div class="wf-card-bar"><div class="wf-card-fill" [style.width.%]="(wf.sequenceNumber / 10) * 100"></div></div>
              <span class="wf-card-step">{{ wf.sequenceNumber }}/10</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .workflow-status { width: 100%; }

    /* Page Header */
    .page-header {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;
    }
    .header-left h1 { font-size: 1.5em; margin: 0 0 2px; }
    .header-left h1 i { margin-right: 10px; color: #3A7D44; }
    .page-subtitle { color: #6b7280; font-size: 0.85em; margin: 0; }
    .refresh-global-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 18px; border: 1px solid #e0e0e0; border-radius: 8px;
      background: white; color: #3A7D44; font-weight: 500; font-size: 0.85em;
      cursor: pointer; transition: all 0.2s; font-family: 'Poppins', sans-serif;
    }
    .refresh-global-btn:hover { border-color: #3A7D44; background: #f0fdf4; }
    .refresh-global-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Context Selector Bar */
    .context-bar {
      background: white; border-radius: 12px; padding: 16px 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.06); margin-bottom: 20px;
      border: 1px solid #e9f5ee; transition: all 0.3s;
    }
    .context-bar.has-context { border-color: #3A7D44; border-left: 4px solid #3A7D44; }
    .context-form { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
    .ctx-field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 180px; }
    .ctx-field label {
      font-size: 0.75em; font-weight: 600; color: #888; text-transform: uppercase;
      letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;
    }
    .ctx-field label i { color: #3A7D44; font-size: 0.9em; }
    .ctx-select, .ctx-input {
      padding: 9px 12px; border: 1px solid #e0e0e0; border-radius: 8px;
      font-family: 'Poppins', sans-serif; font-size: 0.88em; background: #fafffe;
    }
    .ctx-select:focus, .ctx-input:focus {
      outline: none; border-color: #3A7D44; box-shadow: 0 0 0 3px rgba(58,125,68,0.08);
    }
    .ctx-btn {
      display: inline-flex; align-items: center; gap: 6px; padding: 9px 20px;
      background: linear-gradient(135deg, #5DBB63, #3A7D44); color: white;
      border: none; border-radius: 8px; font-weight: 600; font-size: 0.85em;
      cursor: pointer; transition: all 0.2s; font-family: 'Poppins', sans-serif;
      box-shadow: 0 3px 10px rgba(58,125,68,0.25); white-space: nowrap; height: 40px;
    }
    .ctx-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 5px 14px rgba(58,125,68,0.35); }
    .ctx-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Pipeline View */
    .pipeline-view { animation: fadeIn 0.3s ease; }

    /* Pipeline Header Card */
    .pipeline-header-card {
      display: flex; justify-content: space-between; align-items: center;
      background: white; padding: 20px 24px; border-radius: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.06); margin-bottom: 16px;
      border-left: 4px solid #3A7D44;
    }
    .ph-left { display: flex; align-items: center; gap: 14px; }
    .ph-icon {
      width: 44px; height: 44px; border-radius: 12px;
      background: linear-gradient(135deg, #f0fdf4, #dcfce7);
      display: flex; align-items: center; justify-content: center;
      color: #3A7D44; font-size: 1.2em;
    }
    .ph-left h2 { margin: 0; font-size: 1.1em; color: #2E673A; }
    .ph-meta { font-size: 0.8em; color: #888; }
    .ph-right { display: flex; align-items: center; gap: 20px; }
    .ph-progress-wrap { display: flex; align-items: center; gap: 8px; min-width: 140px; }
    .ph-progress-bar { flex: 1; height: 6px; background: #e9f5ee; border-radius: 3px; overflow: hidden; }
    .ph-progress-fill { height: 100%; background: linear-gradient(90deg, #5DBB63, #3A7D44); border-radius: 3px; transition: width 0.5s; }
    .ph-pct { font-size: 0.82em; font-weight: 700; color: #3A7D44; min-width: 32px; }

    /* State Pills */
    .state-pill {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 14px; border-radius: 16px; font-size: 0.78em;
      font-weight: 600; color: white;
    }
    .state-pill.small { font-size: 0.7em; padding: 3px 10px; }
    .sp-running { background: linear-gradient(135deg, #5DBB63, #3A7D44); }
    .sp-completed { background: #22c55e; }
    .sp-pending { background: #94a3b8; }
    .sp-failed { background: #ef4444; }
    .sp-review { background: #6C63FF; }

    /* Agent Timeline */
    .agent-timeline {
      display: flex; align-items: flex-start; justify-content: center; gap: 0;
      padding: 24px 12px 20px; background: white; border-radius: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.06); margin-bottom: 16px;
      overflow-x: auto;
    }
    .timeline-node {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      position: relative; min-width: 72px; flex: 1;
    }
    .tl-connector {
      position: absolute; top: 18px; right: 50%; width: 100%; height: 2px;
      background: #e0e0e0; z-index: 0;
    }
    .tl-connector.done-connector { background: #22c55e; }
    .tl-connector.branch-connector {
      background: repeating-linear-gradient(90deg, #3A7D44 0, #3A7D44 4px, transparent 4px, transparent 8px);
    }
    .tl-dot {
      width: 36px; height: 36px; border-radius: 50%;
      background: #f8f8f8; border: 2px solid #e0e0e0;
      display: flex; align-items: center; justify-content: center;
      z-index: 1; transition: all 0.3s; position: relative;
    }
    .tl-icon { font-size: 1em; }
    .tl-label { font-size: 0.68em; color: #888; font-weight: 500; text-align: center; }
    .tl-phase-tag {
      font-size: 0.6em; background: #f0fdf4; color: #3A7D44;
      padding: 2px 8px; border-radius: 8px; font-weight: 600;
      border: 1px solid #dcfce7; display: flex; align-items: center; gap: 3px;
    }

    /* Branch trailing indicator */
    .timeline-branch-indicator {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      min-width: 60px; padding-top: 6px;
    }
    .branch-dots { display: flex; gap: 4px; align-items: center; height: 36px; }
    .bdot {
      width: 6px; height: 6px; border-radius: 50%; background: #3A7D44; opacity: 0.5;
    }
    .bdot:nth-child(2) { opacity: 0.35; }
    .bdot:nth-child(3) { opacity: 0.2; }
    .branch-fork {
      display: flex; align-items: center; gap: 4px;
      font-size: 0.6em; color: #3A7D44; font-weight: 600;
      background: #f0fdf4; padding: 2px 8px; border-radius: 8px;
      border: 1px solid #dcfce7;
    }
    .branch-fork i { font-size: 0.9em; }

    .timeline-node.done .tl-dot { background: #dcfce7; border-color: #22c55e; }
    .timeline-node.done .tl-label { color: #22c55e; font-weight: 600; }
    .timeline-node.active .tl-dot {
      background: linear-gradient(135deg, #dbeafe, #bfdbfe);
      border-color: #3b82f6; animation: activePulse 2s infinite;
    }
    .timeline-node.active .tl-label { color: #3b82f6; font-weight: 600; }
    .timeline-node.review .tl-dot { background: #fff7ed; border-color: #f59e0b; }
    .timeline-node.review .tl-label { color: #f59e0b; font-weight: 600; }
    .timeline-node.future .tl-dot { background: #f8f8f8; border-color: #e0e0e0; opacity: 0.6; }
    .timeline-node.future .tl-label { opacity: 0.5; }

    @keyframes activePulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.2); }
      50% { box-shadow: 0 0 0 8px rgba(59,130,246,0); }
    }

    /* Phase Sections */
    .phase-section {
      background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.06);
      margin-bottom: 16px; overflow: hidden;
    }
    .phase-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 20px; cursor: pointer; transition: background 0.2s;
      border-bottom: 1px solid transparent;
    }
    .phase-header:hover { background: #fafffe; }
    .phase-title { display: flex; align-items: center; gap: 14px; }
    .phase-number {
      width: 30px; height: 30px; border-radius: 50%;
      background: linear-gradient(135deg, #5DBB63, #3A7D44);
      color: white; display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 0.85em; flex-shrink: 0;
    }
    .phase-title h3 { margin: 0; font-size: 1em; color: #2E673A; }
    .phase-desc { font-size: 0.78em; color: #888; margin-top: 2px; }
    .phase-right { display: flex; align-items: center; gap: 12px; }
    .phase-right > i { color: #aaa; font-size: 0.85em; }
    .phase-badge {
      font-size: 0.72em; padding: 3px 12px; border-radius: 12px;
      font-weight: 600; color: white;
    }
    .badge-done { background: #22c55e; }
    .badge-active { background: linear-gradient(135deg, #5DBB63, #3A7D44); }
    .badge-review { background: #6C63FF; }
    .badge-pending { background: #94a3b8; }
    .badge-story { background: linear-gradient(135deg, #60a5fa, #3b82f6); }
    .badge-linear { background: linear-gradient(135deg, #fb923c, #ea580c); }
    .phase-body {
      padding: 20px; border-top: 1px solid #e9f5ee;
      animation: slideDown 0.3s ease;
    }

    /* Loop Banner */
    .loop-banner {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 18px; margin-bottom: 16px;
      background: linear-gradient(135deg, #fff7ed, #ffedd5);
      border: 1px solid #fed7aa; border-radius: 10px;
      color: #9a3412; font-size: 0.85em; font-weight: 500;
    }
    .loop-banner i { font-size: 1.2em; color: #ea580c; }
    @keyframes slideDown {
      from { opacity: 0; max-height: 0; }
      to { opacity: 1; max-height: 2000px; }
    }

    /* Branch Divider */
    .branch-divider {
      display: flex; align-items: center; gap: 16px;
      padding: 12px 0; margin: 4px 0;
    }
    .branch-line-left, .branch-line-right {
      flex: 1; height: 2px;
      background: linear-gradient(90deg, transparent, #3A7D44, transparent);
    }
    .branch-badge {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 20px; background: linear-gradient(135deg, #f0fdf4, #dcfce7);
      border: 2px solid #3A7D44; border-radius: 24px;
      font-size: 0.78em; font-weight: 600; color: #2E673A;
      white-space: nowrap; box-shadow: 0 4px 12px rgba(58,125,68,0.12);
    }
    .branch-badge i { color: #3A7D44; }

    /* Waiting for branching */
    .waiting-branch {
      text-align: center; padding: 40px; background: white;
      border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.06);
      margin-top: 16px;
    }
    .waiting-icon { font-size: 2.5em; color: #d1d5db; margin-bottom: 12px; }
    .waiting-branch h4 { color: #555; margin: 0 0 6px; font-size: 1em; }
    .waiting-branch p { color: #999; font-size: 0.85em; margin: 0; max-width: 400px; display: inline-block; }

    /* Overview Section */
    .overview-section {
      background: white; border-radius: 12px; padding: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.06); margin-top: 24px;
    }
    .overview-header {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;
    }
    .overview-header h3 { margin: 0; font-size: 1em; color: #2E673A; }
    .overview-header h3 i { margin-right: 8px; color: #3A7D44; }
    .overview-actions { display: flex; gap: 8px; }

    .view-toggle { display: flex; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; }
    .toggle-btn {
      background: white; border: none; padding: 5px 10px; cursor: pointer;
      color: #666; transition: all 0.2s; font-size: 12px;
    }
    .toggle-btn.active { background: #3A7D44; color: white; }
    .toggle-btn:hover:not(.active) { background: #f0fdf4; }

    .loading-state { text-align: center; padding: 30px; color: #3A7D44; }
    .empty-state { text-align: center; padding: 40px; color: #aaa; font-size: 0.9em; }
    .empty-state i { font-size: 2em; color: #ddd; display: block; margin-bottom: 8px; }
    .empty-state a { color: #3A7D44; text-decoration: underline; }

    /* Workspace Groups */
    .workspace-group {
      border: 1px solid #e9f5ee; border-radius: 10px; margin-bottom: 10px; overflow: hidden;
    }
    .group-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px; background: #f8fdf9; cursor: pointer; transition: background 0.2s;
    }
    .group-header:hover { background: #f0fdf4; }
    .group-title { display: flex; align-items: center; gap: 8px; font-size: 0.9em; }
    .group-title i:first-child { color: #3A7D44; font-size: 0.75em; width: 14px; }
    .group-icon { color: #3A7D44; }
    .group-count {
      font-size: 0.7em; background: #3A7D44; color: white;
      padding: 1px 8px; border-radius: 10px; font-weight: 600;
    }
    .group-summary { display: flex; gap: 4px; }
    .mini-badge {
      width: 18px; height: 18px; border-radius: 50%; font-size: 0.6em;
      font-weight: 700; color: white; display: flex; align-items: center;
      justify-content: center;
    }
    .bg-green { background: #22c55e; }
    .bg-blue { background: #3b82f6; }
    .bg-purple { background: #6C63FF; }
    .bg-red { background: #ef4444; }

    .group-body {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 10px; padding: 12px; background: white;
    }

    /* Workflow Cards */
    .flat-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px; max-height: 480px; overflow-y: auto;
    }
    .wf-card {
      padding: 12px 14px; border: 1px solid #e9f5ee; border-radius: 10px;
      background: #fafffe; cursor: pointer; transition: all 0.2s;
    }
    .wf-card:hover {
      transform: translateY(-2px); box-shadow: 0 4px 12px rgba(58,125,68,0.1);
      border-color: #3A7D44;
    }
    .wf-card-top {
      display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;
    }
    .wf-id { font-weight: 700; color: #3A7D44; font-size: 0.82em; }
    .wf-card-info { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
    .wf-card-info span {
      font-size: 0.72em; color: #666; display: flex; align-items: center; gap: 4px;
    }
    .wf-card-info i { color: #aaa; font-size: 0.85em; }
    .wf-card-progress { display: flex; align-items: center; gap: 8px; }
    .wf-card-bar { flex: 1; height: 4px; background: #e9f5ee; border-radius: 2px; overflow: hidden; }
    .wf-card-fill { height: 100%; background: linear-gradient(90deg, #5DBB63, #3A7D44); border-radius: 2px; transition: width 0.3s; }
    .wf-card-step { font-size: 0.68em; color: #3A7D44; font-weight: 600; min-width: 28px; }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 768px) {
      .page-header { flex-direction: column; align-items: flex-start; gap: 10px; }
      .context-form { flex-direction: column; }
      .pipeline-header-card { flex-direction: column; gap: 12px; }
      .agent-timeline { justify-content: flex-start; gap: 0; }
      .flat-grid, .group-body { grid-template-columns: 1fr; }
    }
  `]
})
export class WorkflowStatusComponent implements OnInit, OnDestroy {
  statusForm: FormGroup;
  workspaces: Workspace[] = [];
  workflows: Workflow[] = [];
  workspaceGroups: WorkspaceGroup[] = [];

  pipeline: PipelineContext | null = null;
  checking = false;
  loadingAll = false;
  viewMode: 'grouped' | 'flat' = 'grouped';
  showSharedPhase = true;
  showStoryPhase = true;

  allAgents = SHARED_AGENTS;
  private workspaceMap = new Map<number, string>();
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private workspaceService: WorkspaceService,
    private workflowService: WorkflowService
  ) {
    this.statusForm = this.fb.group({
      workspaceId: ['', Validators.required],
      requirementId: ['', Validators.required]
    });
  }

  ngOnInit() {
    this.workspaceService.listWorkspaces().subscribe({
      next: (ws: Workspace[]) => {
        this.workspaces = ws;
        ws.forEach(w => { if (w.id) this.workspaceMap.set(w.id, w.projectName); });
        this.loadAllWorkflows();
        this.checkRouteParams();
      },
      error: () => { this.loadAllWorkflows(); }
    });

    // Auto-refresh pipeline every 8 seconds
    interval(8000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.pipeline) this.refreshPipeline();
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkRouteParams() {
    this.route.queryParams.subscribe((params: Params) => {
      const wsId = params['workspaceId'];
      const reqId = params['requirementId'];
      if (wsId && reqId) {
        this.statusForm.patchValue({ workspaceId: wsId, requirementId: reqId });
        this.onCheckStatus();
      }
    });
  }

  loadAllWorkflows() {
    this.loadingAll = true;
    this.workflowService.getAllWorkflows().subscribe({
      next: (wfs: Workflow[]) => {
        this.workflows = wfs;
        this.buildWorkspaceGroups();
        this.loadingAll = false;
      },
      error: () => { this.loadingAll = false; }
    });
  }

  private buildWorkspaceGroups() {
    const grouped = new Map<number, Workflow[]>();
    for (const wf of this.workflows) {
      const wsId = wf.workspaceId;
      if (!grouped.has(wsId)) grouped.set(wsId, []);
      grouped.get(wsId)!.push(wf);
    }
    this.workspaceGroups = Array.from(grouped.entries()).map(([wsId, wfs]) => ({
      workspaceId: wsId,
      workspaceName: this.getWorkspaceName(wsId),
      workflows: wfs,
      expanded: true
    }));
  }

  onCheckStatus() {
    if (!this.statusForm.valid || this.checking) return;
    this.checking = true;
    this.pipeline = null;
    const { workspaceId, requirementId } = this.statusForm.value;
    const wsId = Number(workspaceId);
    const reqId = Number(requirementId);

    // Fetch ALL workflows for this workspace+requirement to build pipeline context
    this.workflowService.getWorkflowsByContext(wsId, reqId).subscribe({
      next: (wfs: Workflow[]) => {
        this.buildPipelineContext(wsId, reqId, wfs);
        this.checking = false;
      },
      error: () => { this.checking = false; }
    });
  }

  private buildPipelineContext(wsId: number, reqId: number, wfs: Workflow[]) {
    const sharedWfs = wfs.filter(w => !w.userStoryId && w.sequenceNumber <= 4);
    const highestSeq = wfs.reduce((max, w) => Math.max(max, w.sequenceNumber), 0);
    const completedCount = wfs.filter(w => ['APPROVED', 'COMPLETED'].includes(w.state)).length;
    const totalExpected = Math.max(wfs.length, 1);
    const progress = Math.round((completedCount / totalExpected) * 100);

    let overallState = 'PENDING';
    if (wfs.some(w => w.state === 'IN_PROGRESS')) overallState = 'IN_PROGRESS';
    else if (wfs.some(w => w.state === 'IN_REVIEW')) overallState = 'IN_REVIEW';
    else if (wfs.every(w => ['APPROVED', 'COMPLETED'].includes(w.state)) && wfs.length > 0) overallState = 'COMPLETED';
    else if (wfs.some(w => (w.state || '').includes('FAIL') || (w.state || '').includes('REJECT'))) overallState = 'FAILED';

    this.pipeline = {
      workspaceId: wsId,
      requirementId: reqId,
      workspaceName: this.getWorkspaceName(wsId),
      highestSequence: highestSeq,
      sharedWorkflows: sharedWfs,
      allWorkflows: wfs,
      overallState,
      overallProgress: progress,
      reachedBranching: sharedWfs.some(w => w.sequenceNumber === 4 && ['APPROVED', 'COMPLETED'].includes(w.state)),
      pipelineMode: wfs.length > 0 && wfs[0].pipelineMode ? wfs[0].pipelineMode : 'per-story'
    };
  }

  private refreshPipeline() {
    if (!this.pipeline) return;
    const { workspaceId, requirementId } = this.pipeline;
    this.workflowService.getWorkflowsByContext(workspaceId, requirementId).subscribe({
      next: (wfs: Workflow[]) => this.buildPipelineContext(workspaceId, requirementId, wfs),
      error: () => {}
    });
  }

  refreshEverything() {
    this.loadAllWorkflows();
    if (this.pipeline) this.refreshPipeline();
  }

  quickView(wf: Workflow) {
    this.statusForm.patchValue({
      workspaceId: wf.workspaceId,
      requirementId: wf.requirementId
    });
    this.onCheckStatus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Timeline helpers
  isAgentDone(order: number): boolean {
    if (!this.pipeline) return false;
    return this.pipeline.allWorkflows.some(w =>
      w.sequenceNumber === order && ['APPROVED', 'COMPLETED'].includes(w.state)
    );
  }

  isAgentActive(order: number): boolean {
    if (!this.pipeline) return false;
    return this.pipeline.allWorkflows.some(w =>
      w.sequenceNumber === order && w.state === 'IN_PROGRESS'
    );
  }

  isAgentReview(order: number): boolean {
    if (!this.pipeline) return false;
    return this.pipeline.allWorkflows.some(w =>
      w.sequenceNumber === order && w.state === 'IN_REVIEW'
    );
  }

  isAgentFuture(order: number): boolean {
    if (!this.pipeline) return true;
    return !this.pipeline.allWorkflows.some(w => w.sequenceNumber === order);
  }

  sharedPhaseNeedsApproval(): boolean {
    if (!this.pipeline) return false;
    return this.pipeline.sharedWorkflows.some(w => w.state === 'IN_REVIEW');
  }

  getSharedPhaseBadgeClass(): string {
    if (!this.pipeline) return 'badge-pending';
    const wfs = this.pipeline.sharedWorkflows;
    if (wfs.length === 0) return 'badge-pending';
    if (wfs.some(w => w.state === 'IN_REVIEW')) return 'badge-review';
    if (wfs.every(w => ['APPROVED', 'COMPLETED'].includes(w.state))) return 'badge-done';
    if (wfs.some(w => w.state === 'IN_PROGRESS')) return 'badge-active';
    return 'badge-pending';
  }

  getSharedPhaseLabel(): string {
    if (!this.pipeline) return 'Pending';
    const wfs = this.pipeline.sharedWorkflows;
    if (wfs.length === 0) return 'Pending';
    if (wfs.some(w => w.state === 'IN_REVIEW')) return 'In Review';
    if (wfs.every(w => ['APPROVED', 'COMPLETED'].includes(w.state))) return 'Completed';
    if (wfs.some(w => w.state === 'IN_PROGRESS')) return 'Running';
    return 'Pending';
  }

  getWorkspaceName(wsId: number): string {
    return this.workspaceMap.get(wsId) || `Workspace #${wsId}`;
  }

  formatAgentName(name: string): string {
    return name.replace('Agent', '').replace(/([A-Z])/g, ' $1').trim();
  }

  getStateClass(state: string): string {
    if (!state) return 'sp-pending';
    const s = state.toLowerCase();
    if (s.includes('approved') || s.includes('complete') || s.includes('success')) return 'sp-completed';
    if (s.includes('reject') || s.includes('fail') || s.includes('error')) return 'sp-failed';
    if (s.includes('review')) return 'sp-review';
    if (s.includes('running') || s.includes('progress')) return 'sp-running';
    return 'sp-pending';
  }

  getOverallStateClass(state: string): string {
    return this.getStateClass(state);
  }

  getStateIcon(state: string): string {
    const s = (state || '').toLowerCase();
    if (s.includes('progress') || s.includes('running')) return 'fa-cog fa-spin';
    if (s.includes('complete') || s.includes('approved')) return 'fa-check-circle';
    if (s.includes('review')) return 'fa-eye';
    if (s.includes('fail') || s.includes('reject')) return 'fa-times-circle';
    return 'fa-clock';
  }

  countByState(wfs: Workflow[], type: string): number {
    return wfs.filter(w => {
      const s = (w.state || '').toLowerCase();
      if (type === 'complete') return s.includes('complete') || s.includes('approved');
      if (type === 'progress') return s.includes('progress') || s.includes('running');
      if (type === 'review') return s.includes('review');
      if (type === 'fail') return s.includes('fail') || s.includes('reject');
      return false;
    }).length;
  }

  onWorkflowUpdated(updated: Workflow) {
    this.refreshPipeline();
    this.workflows = this.workflows.map(w => w.id === updated.id ? updated : w);
    this.buildWorkspaceGroups();
  }

  isFullSequenceMode(): boolean {
    return this.pipeline?.pipelineMode === 'full-sequence';
  }
}
