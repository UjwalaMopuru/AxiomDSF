import { Component, Input, OnInit, OnDestroy, Output, EventEmitter, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { WorkflowService, Workflow, WorkflowApprovalRequest, WorkflowDecision } from '../../services/workflow.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { Subject, takeUntil, interval } from 'rxjs';

declare var mermaid: any;

interface AgentConfig {
  agentNumber: number;
  agentName: string;
  agentType: string;
  icon: string;
  displayName: string;
  description: string;
}

@Component({
  selector: 'app-agent-output',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MarkdownPipe],
  template: `
    <div class="agent-panel" *ngIf="workspaceId && requirementId">
      <div class="panel-header">
        <h3><i class="fas fa-sitemap"></i> Agent Pipeline</h3>
        <p class="subtitle">Select an agent to view its output</p>
      </div>

      <!-- Timeline -->
      <div class="timeline-container">
        <div class="timeline-track"></div>
        <div class="timeline-agents">
          <button *ngFor="let agent of filteredAgents; let i = index"
                  class="agent-node"
                  [class.active]="agent.agentNumber === selectedAgent"
                  [class.completed]="isAgentCompleted(agent.agentNumber)"
                  [class.running]="isAgentRunning(agent.agentNumber)"
                  [class.in-review]="isAgentInReview(agent.agentNumber)"
                  [disabled]="loading"
                  (click)="selectAgent(agent.agentNumber)">
            <div class="node-icon">{{ agent.icon }}</div>
            <div class="node-dot"></div>
            <div class="node-label">{{ agent.displayName }}</div>
            <div class="running-tag" *ngIf="isAgentRunning(agent.agentNumber)">
              <span class="pulse-dot"></span> Running
            </div>
            <div class="review-tag" *ngIf="isAgentInReview(agent.agentNumber)">
              <i class="fas fa-eye"></i> Review
            </div>
          </button>
        </div>
      </div>

      <!-- Notification Toast -->
      <div class="notification-toast" *ngIf="notification" [class.show]="notification"
           [ngClass]="notificationType">
        <i class="fas" [ngClass]="notificationType === 'success' ? 'fa-check-circle' : 'fa-info-circle'"></i>
        <span>{{ notification }}</span>
        <button class="toast-close" (click)="notification = null"><i class="fas fa-times"></i></button>
      </div>

      <!-- Output Section -->
      <div class="output-section">
        <div *ngIf="!selectedAgent" class="empty-output">
          <i class="fas fa-arrow-up"></i>
          <p>Select an agent above to view its output</p>
        </div>

        <div *ngIf="selectedAgent">
          <div class="output-header" *ngIf="selectedAgentConfig">
            <span class="output-icon">{{ selectedAgentConfig.icon }}</span>
            <div class="output-title-area">
              <h4>{{ selectedAgentConfig.displayName }}</h4>
              <p class="agent-desc">{{ selectedAgentConfig.description }}</p>
            </div>
            <!-- Action buttons -->
            <div class="output-actions" *ngIf="output">
              <button class="icon-action-btn" title="Download output" (click)="downloadOutput()">
                <i class="fas fa-download"></i>
              </button>
              <button class="icon-action-btn" title="Open in new window" (click)="openInNewWindow()">
                <i class="fas fa-external-link-alt"></i>
              </button>
              <button class="icon-action-btn" title="Copy to clipboard" (click)="copyToClipboard()">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </div>

          <!-- Code folder location for CodingAgent -->
          <div *ngIf="selectedAgentConfig?.agentName === 'CodingAgent' && output" class="code-folder-info">
            <i class="fas fa-folder-open"></i>
            <span>Output code folder: <strong>workspaces/workspace-{{workspaceId}}/coding/</strong></span>
          </div>

          <!-- Wiki URL Links -->
          <div *ngIf="selectedWorkflow && (selectedWorkflow.inputWikiUrl || selectedWorkflow.outputWikiUrl)" class="wiki-urls-bar">
            <a *ngIf="selectedWorkflow.inputWikiUrl" [href]="selectedWorkflow.inputWikiUrl" target="_blank" rel="noopener" class="wiki-link input-link" title="View input on Azure DevOps Wiki">
              <i class="fas fa-sign-in-alt"></i> Input Wiki
            </a>
            <a *ngIf="selectedWorkflow.outputWikiUrl" [href]="selectedWorkflow.outputWikiUrl" target="_blank" rel="noopener" class="wiki-link output-link" title="View output on Azure DevOps Wiki">
              <i class="fas fa-sign-out-alt"></i> Output Wiki
            </a>
          </div>

          <div *ngIf="loading" class="loading-output">
            <i class="fas fa-spinner fa-spin"></i> Loading output...
          </div>

          <div *ngIf="!loading && output" class="output-content md-rendered" [innerHTML]="output | markdown"></div>

          <div *ngIf="!loading && !output && !isApprovalReady" class="waiting-section">
            <div class="empty-output">
              <i class="fas fa-hourglass-half"></i>
              <p>No output generated for this agent yet. Waiting for agent to complete...</p>
            </div>
            <!-- Snake Game while waiting -->
            <div class="snake-game-container" *ngIf="showSnakeGame">
              <div class="game-header">
                <span>🐍 Snake Game — Kill time while waiting!</span>
                <span class="game-score">Score: {{ snakeScore }}</span>
              </div>
              <canvas #snakeCanvas width="300" height="300" class="snake-canvas"
                      tabindex="0" (keydown)="onSnakeKey($event)"></canvas>
              <div class="game-controls">
                <button class="game-btn" (click)="startSnakeGame()">{{ snakeGameRunning ? 'Restart' : 'Start Game' }}</button>
                <span class="game-hint">Use arrow keys to play</span>
              </div>
            </div>
            <button class="toggle-game-btn" (click)="showSnakeGame = !showSnakeGame">
              <i class="fas fa-gamepad"></i> {{ showSnakeGame ? 'Hide Game' : 'Play Snake while waiting' }}
            </button>
          </div>

          <!-- Empty output notice when in review -->
          <div *ngIf="!loading && !output && isApprovalReady" class="empty-review-notice">
            <div class="empty-output">
              <i class="fas fa-exclamation-triangle" style="color: #e67e22;"></i>
              <p>Agent completed but produced no output. You may <strong>Rework</strong> to re-run the agent with feedback.</p>
            </div>
          </div>

          <!-- Approval Section -->
          <div *ngIf="!loading && isApprovalReady" class="approval-section">
            <h4><i class="fas fa-gavel"></i> Agent Output Review</h4>
            <div class="approval-guide">
              <div class="guide-item approve-guide">
                <i class="fas fa-check-circle"></i>
                <div>
                  <strong>Approve</strong>
                  <p>Output looks good. Proceed to the next agent in the pipeline.</p>
                </div>
              </div>
              <div class="guide-item reject-guide">
                <i class="fas fa-times-circle"></i>
                <div>
                  <strong>Reject</strong>
                  <p>Output is unacceptable. Stop the entire workflow pipeline.</p>
                </div>
              </div>
              <div class="guide-item rework-guide">
                <i class="fas fa-redo"></i>
                <div>
                  <strong>Rework</strong>
                  <p>Output needs improvement. Re-run this agent with your feedback comments.</p>
                </div>
              </div>
            </div>
            <form [formGroup]="approvalForm">
              <textarea formControlName="comments" placeholder="Add feedback comments (required for Rework, optional for Approve/Reject)" rows="2"></textarea>
              <div class="approval-buttons">
                <button type="button" class="approve-btn" (click)="submitDecision('APPROVE')" [disabled]="approvalSubmitting">
                  <i class="fas fa-check-circle"></i> Approve
                </button>
                <button type="button" class="reject-btn" (click)="submitDecision('REJECT')" [disabled]="approvalSubmitting">
                  <i class="fas fa-times-circle"></i> Reject
                </button>
                <button type="button" class="rework-btn" (click)="submitDecision('REWORK')" [disabled]="approvalSubmitting">
                  <i class="fas fa-redo"></i> Rework
                </button>
                <i *ngIf="approvalSubmitting" class="fas fa-spinner fa-spin"></i>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .agent-panel {
      background: white; border-radius: 10px; padding: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    .panel-header h3 { font-size: 1em; margin-bottom: 4px; color: #2E673A; }
    .panel-header h3 i { margin-right: 8px; color: #3A7D44; }
    .subtitle { font-size: 0.8em; color: #999; margin: 0; }

    /* Notification Toast */
    .notification-toast {
      position: fixed; top: 80px; right: 24px; z-index: 9999;
      display: flex; align-items: center; gap: 10px;
      padding: 12px 20px; border-radius: 10px; font-size: 0.9em;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15); animation: slideInRight 0.4s ease;
      max-width: 400px;
    }
    .notification-toast.success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .notification-toast.info { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
    .toast-close { background: none; border: none; cursor: pointer; color: inherit; opacity: 0.6; padding: 2px; }
    .toast-close:hover { opacity: 1; }
    @keyframes slideInRight {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    /* Timeline */
    .timeline-container {
      position: relative; padding: 24px 16px;
      background: linear-gradient(180deg, #f8fdf9, #fff);
      border-radius: 10px; margin: 16px 0; overflow-x: auto;
      border: 1px solid #e9f5ee;
    }
    .timeline-track {
      position: absolute; top: 50%; left: 16px; right: 16px; height: 3px;
      background: linear-gradient(90deg, #5DBB63, #3A7D44);
      border-radius: 2px; z-index: 0;
    }
    .timeline-agents {
      display: flex; align-items: center; gap: 0;
      position: relative; z-index: 1; min-width: 100%; padding: 20px 0;
    }
    .agent-node {
      display: flex; flex-direction: column; align-items: center;
      flex: 1; min-width: 90px; background: none; border: none;
      cursor: pointer; font-family: 'Poppins', sans-serif;
      font-size: 11px; color: #666; position: relative;
      transition: all 0.3s ease; padding: 0;
    }
    .agent-node:hover:not(:disabled) { color: #3A7D44; transform: translateY(-4px); }
    .agent-node:disabled { opacity: 0.5; cursor: not-allowed; }

    .node-icon {
      font-size: 28px; padding: 10px; background: white;
      border: 2px solid #e0e0e0; border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06); transition: all 0.3s;
      min-width: 48px; height: 48px;
      display: flex; align-items: center; justify-content: center;
    }
    .agent-node.completed .node-icon {
      background: #dcfce7; border-color: #22c55e;
      box-shadow: 0 4px 12px rgba(34,197,94,0.2);
    }
    .agent-node.running .node-icon {
      background: #fef2f2; border-color: #ef4444;
      animation: pulse-icon 1.5s ease infinite;
    }
    .agent-node.active .node-icon {
      background: #eff6ff; border-color: #3A7D44;
      box-shadow: 0 4px 12px rgba(58,125,68,0.2);
    }

    .node-dot {
      width: 12px; height: 12px; border-radius: 50%;
      background: #e0e0e0; margin: 6px 0; transition: all 0.3s;
      border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.1);
    }
    .agent-node.completed .node-dot { background: #22c55e; }
    .agent-node.running .node-dot { background: #ef4444; width: 16px; height: 16px; }
    .agent-node.active .node-dot { background: #3A7D44; width: 14px; height: 14px; }

    .node-label {
      font-size: 10px; font-weight: 500; max-width: 75px;
      text-align: center; word-break: break-word;
    }
    .agent-node.completed .node-label { color: #22c55e; font-weight: 600; }
    .agent-node.running .node-label { color: #ef4444; font-weight: 600; }
    .agent-node.active .node-label { color: #3A7D44; font-weight: 600; }

    .running-tag {
      position: absolute; top: -20px; background: #ef4444;
      color: white; padding: 3px 10px; border-radius: 10px;
      font-size: 9px; font-weight: 600; display: flex;
      align-items: center; gap: 4px;
    }
    .review-tag {
      position: absolute; top: -20px; background: #f59e0b;
      color: white; padding: 3px 10px; border-radius: 10px;
      font-size: 9px; font-weight: 600; display: flex;
      align-items: center; gap: 4px;
    }
    .agent-node.in-review .node-dot { background: #f59e0b; box-shadow: 0 0 8px rgba(245, 158, 11, 0.5); }
    .agent-node.in-review .node-label { color: #f59e0b; font-weight: 600; }
    .pulse-dot {
      width: 5px; height: 5px; border-radius: 50%;
      background: white; animation: blink 1s infinite;
    }

    @keyframes pulse-icon {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.08); }
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    /* Output */
    .output-section { border-top: 1px solid #e0e0e0; padding-top: 16px; }
    .output-header {
      display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
    }
    .output-icon { font-size: 1.6em; }
    .output-title-area { flex: 1; }
    .output-header h4 { margin: 0; font-size: 0.95em; color: #333; }
    .agent-desc { margin: 0; font-size: 0.8em; color: #999; }

    .output-actions { display: flex; gap: 6px; }
    .icon-action-btn {
      width: 34px; height: 34px; border-radius: 8px; border: 1px solid #e0e0e0;
      background: white; cursor: pointer; display: flex; align-items: center;
      justify-content: center; color: #3A7D44; transition: all 0.2s; font-size: 13px;
    }
    .icon-action-btn:hover { background: #f0fdf4; border-color: #3A7D44; transform: translateY(-1px); }

    .code-folder-info {
      display: flex; align-items: center; gap: 8px; padding: 10px 14px;
      background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;
      font-size: 0.85em; color: #92400e; margin-bottom: 12px;
    }
    .code-folder-info i { color: #f59e0b; }

    .wiki-urls-bar {
      display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;
    }
    .wiki-link {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 6px; font-size: 0.8em;
      text-decoration: none; font-weight: 500; transition: all 0.2s;
    }
    .wiki-link i { font-size: 0.9em; }
    .wiki-link.input-link {
      background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;
    }
    .wiki-link.input-link:hover { background: #dbeafe; }
    .wiki-link.output-link {
      background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;
    }
    .wiki-link.output-link:hover { background: #dcfce7; }

    .loading-output {
      text-align: center; padding: 30px; color: #3A7D44;
    }

    .output-content {
      font-family: 'Poppins', sans-serif;
      font-size: 13.5px; line-height: 1.8;
      word-wrap: break-word; overflow-wrap: break-word;
      background: #f8fdf9;
      border: 1px solid #e9f5ee; border-radius: 10px;
      padding: 28px 32px;
    }
    /* Prevent first/last child margin from cropping content */
    :host ::ng-deep .output-content > :first-child { margin-top: 0 !important; padding-top: 0 !important; }
    :host ::ng-deep .output-content > :last-child { margin-bottom: 0 !important; padding-bottom: 0 !important; }

    /* ── Markdown Preview Styles ──────────────────────── */
    :host ::ng-deep .md-rendered h1,
    :host ::ng-deep .md-rendered h2,
    :host ::ng-deep .md-rendered h3,
    :host ::ng-deep .md-rendered h4,
    :host ::ng-deep .md-rendered h5,
    :host ::ng-deep .md-rendered h6 {
      margin: 20px 0 10px; color: #2E673A; font-weight: 600;
      line-height: 1.3;
    }
    :host ::ng-deep .md-rendered .md-h1 {
      font-size: 1.6em; border-bottom: 2px solid #c8e6c9;
      padding-bottom: 8px; margin-top: 28px;
    }
    :host ::ng-deep .md-rendered .md-h1:first-child { margin-top: 0; }
    :host ::ng-deep .md-rendered .md-h2 {
      font-size: 1.35em; border-bottom: 1px solid #e9f5ee;
      padding-bottom: 6px; margin-top: 24px;
    }
    :host ::ng-deep .md-rendered .md-h2:first-child { margin-top: 0; }
    :host ::ng-deep .md-rendered .md-h3 { font-size: 1.2em; margin-top: 20px; }
    :host ::ng-deep .md-rendered .md-h4 { font-size: 1.08em; margin-top: 16px; }
    :host ::ng-deep .md-rendered .md-h5 { font-size: 1em; margin-top: 14px; }
    :host ::ng-deep .md-rendered .md-h6 { font-size: 0.95em; margin-top: 12px; color: #4a7c59; }

    :host ::ng-deep .md-rendered .md-p {
      margin: 6px 0; line-height: 1.8;
    }

    :host ::ng-deep .md-rendered .md-spacer {
      height: 8px;
    }

    :host ::ng-deep .md-rendered strong { font-weight: 600; color: #1a1a1a; }
    :host ::ng-deep .md-rendered em { font-style: italic; color: #444; }
    :host ::ng-deep .md-rendered del { text-decoration: line-through; color: #999; }

    :host ::ng-deep .md-rendered .md-code-block {
      background: #1e1e2e; color: #cdd6f4; padding: 16px 20px;
      border-radius: 8px; overflow-x: auto; font-size: 12.5px;
      font-family: 'Consolas', 'Courier New', monospace;
      line-height: 1.6; margin: 14px 0;
      border: 1px solid #334155;
    }
    :host ::ng-deep .md-rendered .md-code-block code {
      background: none; padding: 0; color: inherit; font-size: inherit;
    }

    /* Mermaid diagram container */
    :host ::ng-deep .md-rendered .mermaid {
      background: #f8f9fa; padding: 20px; border-radius: 10px;
      margin: 16px 0; text-align: center;
      border: 1px solid #e0e0e0;
      overflow-x: auto;
    }
    :host ::ng-deep .md-rendered .mermaid svg {
      max-width: 100%; height: auto;
    }

    :host ::ng-deep .md-rendered .md-inline-code {
      background: rgba(58, 125, 68, 0.1); color: #2E673A;
      padding: 2px 7px; border-radius: 4px; font-size: 12px;
      font-family: 'Consolas', 'Courier New', monospace;
      border: 1px solid rgba(58, 125, 68, 0.15);
    }

    :host ::ng-deep .md-rendered .md-list {
      margin: 6px 0; padding-left: 28px;
    }
    :host ::ng-deep .md-rendered .md-list li {
      margin: 5px 0; line-height: 1.7;
    }
    :host ::ng-deep .md-rendered .md-list .md-list {
      margin: 4px 0; padding-left: 24px;
    }
    :host ::ng-deep .md-rendered ul.md-list { list-style-type: disc; }
    :host ::ng-deep .md-rendered ul.md-list ul.md-list { list-style-type: circle; }
    :host ::ng-deep .md-rendered ul.md-list ul.md-list ul.md-list { list-style-type: square; }
    :host ::ng-deep .md-rendered ol.md-list { list-style-type: decimal; }
    :host ::ng-deep .md-rendered ol.md-list ol.md-list { list-style-type: lower-alpha; }

    :host ::ng-deep .md-rendered .md-hr {
      border: none; border-top: 2px solid #d4edda; margin: 24px 0;
    }

    :host ::ng-deep .md-rendered .md-blockquote {
      border-left: 4px solid #3A7D44; padding: 12px 20px;
      margin: 14px 0; background: rgba(58, 125, 68, 0.04);
      color: #555; font-style: italic; border-radius: 0 8px 8px 0;
    }
    :host ::ng-deep .md-rendered .md-blockquote br { margin-bottom: 4px; }

    :host ::ng-deep .md-rendered .md-table-wrapper {
      overflow-x: auto; margin: 16px 0; border-radius: 8px;
      border: 1px solid #c8e6c9;
    }
    :host ::ng-deep .md-rendered .md-table {
      width: 100%; border-collapse: collapse;
      font-size: 12.5px; margin: 0;
    }
    :host ::ng-deep .md-rendered .md-table th {
      background: linear-gradient(135deg, #e8f5e9, #c8e6c9);
      color: #2E673A; font-weight: 600; padding: 10px 14px;
      text-align: left; border: 1px solid #c8e6c9;
      white-space: nowrap;
    }
    :host ::ng-deep .md-rendered .md-table td {
      padding: 10px 14px; border: 1px solid #e9f5ee;
      vertical-align: top; line-height: 1.6;
    }
    :host ::ng-deep .md-rendered .md-table tr:nth-child(even) {
      background: rgba(58, 125, 68, 0.03);
    }
    :host ::ng-deep .md-rendered .md-table tr:hover {
      background: rgba(58, 125, 68, 0.06);
    }

    :host ::ng-deep .md-rendered a {
      color: #3A7D44; text-decoration: underline;
    }
    :host ::ng-deep .md-rendered a:hover { color: #2E673A; }

    :host ::ng-deep .md-rendered img.md-img {
      max-width: 100%; border-radius: 8px; margin: 12px 0;
    }

    .empty-output {
      text-align: center; padding: 30px; color: #aaa;
    }
    .empty-output i { font-size: 1.8em; margin-bottom: 8px; display: block; color: #ddd; }

    /* Waiting section with snake game */
    .waiting-section { text-align: center; }
    .toggle-game-btn {
      margin-top: 12px; padding: 8px 18px; border: 1px solid #e0e0e0;
      border-radius: 20px; background: white; cursor: pointer;
      font-family: 'Poppins', sans-serif; font-size: 0.8em; color: #666;
      transition: all 0.2s;
    }
    .toggle-game-btn:hover { border-color: #3A7D44; color: #3A7D44; background: #f0fdf4; }
    .toggle-game-btn i { margin-right: 6px; }

    .snake-game-container {
      margin: 16px auto; max-width: 320px; background: #1a1a2e;
      border-radius: 12px; padding: 16px; animation: fadeIn 0.3s ease;
    }
    .game-header {
      display: flex; justify-content: space-between; align-items: center;
      color: #4ade80; font-size: 0.8em; margin-bottom: 10px; font-weight: 500;
    }
    .game-score { color: #fbbf24; font-weight: 700; }
    .snake-canvas {
      display: block; margin: 0 auto; border: 2px solid #334155;
      border-radius: 6px; background: #0f172a; outline: none;
    }
    .game-controls {
      display: flex; align-items: center; justify-content: center;
      gap: 12px; margin-top: 10px;
    }
    .game-btn {
      padding: 6px 16px; border: none; border-radius: 6px;
      background: #4ade80; color: #0f172a; font-weight: 600; font-size: 0.8em;
      cursor: pointer; font-family: 'Poppins', sans-serif;
    }
    .game-btn:hover { background: #22c55e; }
    .game-hint { font-size: 0.7em; color: #94a3b8; }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Approval Section */
    .approval-section {
      margin-top: 16px; padding: 16px; border-radius: 8px;
      background: rgba(58,125,68,0.03); border: 1px solid #e9f5ee;
    }
    .approval-section h4 {
      margin: 0 0 12px; font-size: 0.9em; color: #3A7D44;
    }
    .approval-section h4 i { margin-right: 6px; }
    .approval-guide {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px;
    }
    .guide-item {
      display: flex; gap: 8px; padding: 10px; border-radius: 8px; font-size: 0.78em;
      align-items: flex-start;
    }
    .guide-item i { font-size: 1.2em; margin-top: 2px; }
    .guide-item strong { display: block; margin-bottom: 2px; }
    .guide-item p { margin: 0; color: #666; line-height: 1.4; }
    .approve-guide { background: #dcfce7; color: #166534; }
    .approve-guide i { color: #22c55e; }
    .reject-guide { background: #fef2f2; color: #991b1b; }
    .reject-guide i { color: #ef4444; }
    .rework-guide { background: #f5f3ff; color: #5b21b6; }
    .rework-guide i { color: #6C63FF; }
    .approval-section textarea {
      width: 100%; padding: 10px; border: 1px solid #e0e0e0;
      border-radius: 6px; font-family: 'Poppins', sans-serif;
      font-size: 0.9em; margin-bottom: 12px; resize: vertical;
    }
    .approval-section textarea:focus {
      outline: none; border-color: #3A7D44;
    }
    .approval-buttons {
      display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
    }
    .approve-btn, .reject-btn, .rework-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 18px; border: none; border-radius: 6px;
      font-weight: 500; font-size: 0.85em; cursor: pointer;
      font-family: 'Poppins', sans-serif; transition: all 0.3s;
    }
    .approve-btn { background: #22c55e; color: white; }
    .approve-btn:hover { background: #16a34a; }
    .reject-btn { background: white; color: #ef4444; border: 1px solid #ef4444; }
    .reject-btn:hover { background: #fef2f2; }
    .rework-btn { background: white; color: #6C63FF; border: 1px solid #6C63FF; }
    .rework-btn:hover { background: #f5f3ff; }
    .approve-btn:disabled, .reject-btn:disabled, .rework-btn:disabled {
      opacity: 0.5; cursor: not-allowed;
    }

    @media (max-width: 768px) {
      .approval-guide { grid-template-columns: 1fr; }
    }
  `]
})
export class AgentOutputComponent implements OnInit, OnDestroy {
  @Input() workspaceId!: number;
  @Input() requirementId!: number;
  @Input() userStoryId?: number;
  @Input() agentFilter?: number[];
  @Output() workflowUpdated = new EventEmitter<Workflow>();
  @Output() agentCompleted = new EventEmitter<string>();

  agents: AgentConfig[] = [];
  filteredAgents: AgentConfig[] = [];
  selectedAgent: number | null = null;
  selectedAgentConfig: AgentConfig | null = null;
  output: string | null = null;
  loading = false;
  approvalSubmitting = false;
  isApprovalReady = false;
  approvalForm: FormGroup;
  currentWorkflow: Workflow | null = null;
  selectedWorkflow: Workflow | null = null;
  allWorkflows: Workflow[] = [];
  notification: string | null = null;
  notificationType: 'success' | 'info' = 'info';
  private destroy$ = new Subject<void>();
  private notifiedAgents = new Set<string>();

  // Snake game
  showSnakeGame = false;
  snakeScore = 0;
  snakeGameRunning = false;
  private snakeIntervalId: any = null;
  private snake: {x: number, y: number}[] = [];
  private food = {x: 0, y: 0};
  private direction = {x: 1, y: 0};
  private gridSize = 15;
  private tileCount = 20;

  private mermaidReady = false;

  constructor(private workflowService: WorkflowService, private fb: FormBuilder, private el: ElementRef) {
    this.approvalForm = this.fb.group({ comments: [''] });
    this.loadMermaidCDN();
  }

  private loadMermaidCDN() {
    if (typeof mermaid !== 'undefined') {
      mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
      this.mermaidReady = true;
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
    script.onload = () => {
      mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
      this.mermaidReady = true;
    };
    document.head.appendChild(script);
  }

  ngOnInit() {
    this.loadAgentPipelineConfig();
    this.updateAgentStatuses();
    interval(3000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.updateAgentStatuses();
      if (this.selectedAgent) this.checkApprovalStatus();
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.snakeIntervalId) clearInterval(this.snakeIntervalId);
  }

  private renderMermaidDiagrams(retryCount = 0) {
    const delay = retryCount === 0 ? 300 : 500;
    setTimeout(async () => {
      try {
        if (!this.mermaidReady || typeof mermaid === 'undefined') {
          // Retry up to 15 times (~8s total) while waiting for CDN to load
          if (retryCount < 15) {
            this.renderMermaidDiagrams(retryCount + 1);
          }
          return;
        }
        const container = this.el.nativeElement as HTMLElement;
        const mermaidDivs = container.querySelectorAll('.mermaid:not([data-processed])');
        if (mermaidDivs.length === 0) return;
        // Render each diagram individually so one failure doesn't block others
        for (let idx = 0; idx < mermaidDivs.length; idx++) {
          const div = mermaidDivs[idx] as HTMLElement;
          if (!div.id) div.id = `mermaid-${Date.now()}-${idx}`;
          // textContent auto-decodes HTML entities back to original mermaid syntax
          const originalCode = div.textContent || '';
          try {
            await mermaid.run({ nodes: [div] });
          } catch (e) {
            console.warn('Mermaid diagram render error for diagram ' + idx + ':', e);
            // Show the raw mermaid code as a styled code block instead of error
            div.classList.remove('mermaid');
            div.classList.add('mermaid-fallback');
            div.setAttribute('data-processed', 'true');
            div.innerHTML = `<pre class="md-code-block"><code class="lang-mermaid">${originalCode.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
          }
        }
      } catch (e) {
        console.warn('Mermaid rendering error:', e);
      }
    }, delay);
  }

  loadAgentPipelineConfig() {
    this.workflowService.getAgentPipelineConfig().subscribe({
      next: (configs: any[]) => {
        this.agents = configs.map((c, i) => ({
          agentNumber: c.executionOrder || (i + 1),
          agentName: c.agentName,
          agentType: c.agentType,
          icon: this.getIcon(c.agentType),
          displayName: this.getDisplayName(c.agentName),
          description: this.getDesc(c.agentName)
        }));
        // Apply agent filter if provided (e.g., show only agents 5-10 for per-story context)
        this.filteredAgents = this.agentFilter
          ? this.agents.filter(a => this.agentFilter!.includes(a.agentNumber))
          : this.agents;
      },
      error: () => {}
    });
  }

  getIcon(type: string): string {
    return ({ REQUIREMENT: '📋', HLS: '🏗️', HLD: '📐', USER_STORY: '📖', LLD: '⚙️', TDD: '🧪', TR_REVIEW: '✅', CODING: '💻', STATIC_CODE_ANALYSIS: '🔍', SECURITY: '🔐' } as any)[type] || '🤖';
  }

  getDisplayName(name: string): string {
    if (name === 'TRReviewAgent') return 'Test Review Agent';
    return name.replace('Agent', '').replace(/([A-Z])/g, ' $1').trim();
  }

  getDesc(name: string): string {
    return ({ RequirementAnalysisRefinementAgent: 'Analyze and refine requirements', HLSAgent: 'High-level solution design', HLDAgent: 'High-level architecture', UserStoryAgent: 'Create user stories', LLDAgent: 'Low-level detailed design', TDDAgent: 'Test-driven development', TRReviewAgent: 'Test review scenarios', CodingAgent: 'Code implementation', StaticCodeAnalysisAgent: 'Code quality analysis', SecurityAgent: 'Security assessment' } as any)[name] || 'Agent output';
  }

  selectAgent(num: number) {
    if (this.loading) return;
    this.selectedAgent = num;
    this.selectedAgentConfig = this.agents.find(a => a.agentNumber === num) || null;
    this.selectedWorkflow = this.allWorkflows.find(w => w.sequenceNumber === num) || null;
    this.output = null;
    this.isApprovalReady = false;
    this.loading = true;
    this.workflowService.getAgentOutput(num, this.workspaceId, this.requirementId, this.userStoryId).subscribe({
      next: (res) => {
        this.loading = false;
        const content = res?.content;
        if (content == null) { this.output = null; return; }
        this.output = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        // Update selectedWorkflow wiki URLs from agent-output response (freshest data)
        if (res?.inputWikiUrl || res?.outputWikiUrl) {
          if (!this.selectedWorkflow) {
            this.selectedWorkflow = { workspaceId: this.workspaceId, state: res?.state || '', sequenceNumber: num, completionStatus: false } as any;
          }
          if (res.inputWikiUrl) this.selectedWorkflow!.inputWikiUrl = res.inputWikiUrl;
          if (res.outputWikiUrl) this.selectedWorkflow!.outputWikiUrl = res.outputWikiUrl;
        }
        // Scroll the page so the output header is visible
        setTimeout(() => {
          const el = document.querySelector('.output-header');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        this.renderMermaidDiagrams();
        this.checkApprovalStatus();
      },
      error: () => { this.loading = false; this.output = null; }
    });
  }

  checkApprovalStatus() {
    // Always use context-aware endpoint for proper workspace+requirement+story scoping
    const obs = this.workflowService.getWorkflowsByContext(this.workspaceId, this.requirementId, this.userStoryId);
    obs.subscribe({
      next: (wfs) => {
        const filtered = wfs.filter(w => w.sequenceNumber === this.selectedAgent && w.state === 'IN_REVIEW');
        const wf = filtered.length > 0 ? filtered[0] : undefined;
        if (wf && !this.isApprovalReady) {
          this.isApprovalReady = true;
          if (this.selectedAgent && !this.loading) this.reloadOutput();
        } else if (!wf && this.isApprovalReady) {
          this.isApprovalReady = false;
        }
      },
      error: () => {}
    });
  }

  private reloadOutput() {
    if (!this.selectedAgent) return;
    this.loading = true;
    this.workflowService.getAgentOutput(this.selectedAgent, this.workspaceId, this.requirementId, this.userStoryId).subscribe({
      next: (res) => {
        this.loading = false;
        const content = res?.content;
        this.output = content == null ? null : typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        setTimeout(() => {
          const el = document.querySelector('.output-header');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        this.renderMermaidDiagrams();
      },
      error: () => { this.loading = false; }
    });
  }

  submitDecision(decision: WorkflowDecision) {
    if (this.approvalSubmitting) return;
    this.approvalSubmitting = true;
    const req: WorkflowApprovalRequest = {
      workspaceId: this.workspaceId,
      requirementId: this.requirementId,
      decision,
      comments: this.approvalForm.value.comments?.trim() || undefined,
      agentNumber: this.selectedAgent || undefined,
      userStoryId: this.userStoryId
    };
    this.workflowService.approveWorkflow(req).subscribe({
      next: (wf) => {
        this.approvalSubmitting = false;
        this.workflowUpdated.emit(wf);
        this.approvalForm.reset();
        this.isApprovalReady = false;
        this.output = null;
        this.showNotification(
          decision === 'APPROVE' ? 'Agent approved! Moving to next agent...' :
          decision === 'REJECT' ? 'Workflow rejected.' :
          'Rework requested. Agent will re-run with feedback.',
          decision === 'APPROVE' ? 'success' : 'info'
        );
        if (decision === 'APPROVE') {
          setTimeout(() => this.selectAgent(this.selectedAgent || 1), 1000);
        }
      },
      error: () => { this.approvalSubmitting = false; }
    });
  }

  isAgentRunning(num: number): boolean {
    if (this.allWorkflows.length > 0) {
      return this.allWorkflows.some(w => w.sequenceNumber === num && w.state === 'IN_PROGRESS');
    }
    return !!this.currentWorkflow && this.currentWorkflow.sequenceNumber === num && this.currentWorkflow.state === 'IN_PROGRESS';
  }

  isAgentCompleted(num: number): boolean {
    if (this.allWorkflows.length > 0) {
      return this.allWorkflows.some(w => w.sequenceNumber === num
        && ['APPROVED', 'COMPLETED'].includes(w.state));
    }
    if (!this.currentWorkflow) return false;
    return num < this.currentWorkflow.sequenceNumber ||
      (num === this.currentWorkflow.sequenceNumber && ['APPROVED', 'COMPLETED'].includes(this.currentWorkflow.state));
  }

  isAgentInReview(num: number): boolean {
    if (this.allWorkflows.length > 0) {
      return this.allWorkflows.some(w => w.sequenceNumber === num && w.state === 'IN_REVIEW');
    }
    return !!this.currentWorkflow && this.currentWorkflow.sequenceNumber === num && this.currentWorkflow.state === 'IN_REVIEW';
  }

  private updateAgentStatuses() {
    // Always use context-aware endpoint — filters by workspace + requirement + optional userStory
    const obs = this.workflowService.getWorkflowsByContext(this.workspaceId, this.requirementId, this.userStoryId);
    obs.subscribe({
      next: (wfs) => {
        const reqWfs = wfs;
        this.allWorkflows = reqWfs;
        // Refresh selectedWorkflow with latest data (wiki URLs may have been set)
        if (this.selectedAgent) {
          this.selectedWorkflow = reqWfs.find(w => w.sequenceNumber === this.selectedAgent) || this.selectedWorkflow;
        }
        if (reqWfs.length > 0) {
          // Notify for any agents that reached IN_REVIEW
          for (const wf of reqWfs) {
            if (wf.state === 'IN_REVIEW' && wf.agentName && !this.notifiedAgents.has(wf.agentName)) {
              this.notifiedAgents.add(wf.agentName);
              const displayName = this.getDisplayName(wf.agentName);
              this.showNotification(`${displayName} has completed! Ready for review.`, 'success');
              this.agentCompleted.emit(wf.agentName);
            }
          }
          // Set currentWorkflow to the latest active one (IN_PROGRESS or IN_REVIEW)
          const active = reqWfs.filter(w => ['IN_PROGRESS', 'IN_REVIEW'].includes(w.state));
          this.currentWorkflow = active.length > 0 ? active[active.length - 1] : reqWfs[reqWfs.length - 1];
        }
      },
      error: () => {}
    });
  }

  showNotification(message: string, type: 'success' | 'info') {
    this.notification = message;
    this.notificationType = type;
    setTimeout(() => this.notification = null, 5000);
  }

  // Download output
  downloadOutput() {
    if (!this.output || !this.selectedAgentConfig) return;
    const blob = new Blob([this.output], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.selectedAgentConfig.agentName}_output.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Open in new window
  openInNewWindow() {
    if (!this.output || !this.selectedAgentConfig) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) {
      // Use the markdown pipe to render the content as HTML with mermaid divs
      const pipe = new (MarkdownPipe as any)(
        { bypassSecurityTrustHtml: (html: string) => html } as any
      );
      const renderedHtml = pipe.transform(this.output);
      win.document.write(`
        <!DOCTYPE html><html><head><title>${this.escapeHtml(this.selectedAgentConfig.displayName)} Output</title>
        <style>body{font-family:'Segoe UI',sans-serif;padding:30px;max-width:900px;margin:0 auto;line-height:1.7;color:#333}
        h1,h2,h3{color:#2E673A}pre{background:#1e1e2e;color:#cdd6f4;padding:16px;border-radius:8px;overflow-x:auto}
        code{background:#f0f0f0;padding:2px 6px;border-radius:4px;font-size:13px}
        table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px}th{background:#e8f5e9}
        .mermaid{text-align:center;margin:16px 0}
        .md-code-block{background:#1e1e2e;color:#cdd6f4;padding:16px;border-radius:8px;overflow-x:auto}
        .md-table-wrapper{overflow-x:auto}.md-table{border-collapse:collapse;width:100%}
        .md-table th,.md-table td{border:1px solid #ddd;padding:8px}.md-table th{background:#e8f5e9}
        .md-blockquote{border-left:3px solid #2E673A;padding-left:12px;color:#555;margin:8px 0}</style>
        <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"><\/script>
        </head>
        <body><h1>${this.escapeHtml(this.selectedAgentConfig.displayName)} Output</h1>
        <div id="content">${renderedHtml}</div>
        <script>mermaid.initialize({startOnLoad:false,theme:'default',securityLevel:'loose'});
        mermaid.run({nodes:document.querySelectorAll('.mermaid')});<\/script>
        </body></html>`);
      win.document.close();
    }
  }

  // Copy to clipboard
  copyToClipboard() {
    if (!this.output) return;
    navigator.clipboard.writeText(this.output).then(() => {
      this.showNotification('Output copied to clipboard!', 'success');
    });
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Snake Game ─────────────────────────────
  startSnakeGame() {
    if (this.snakeIntervalId) clearInterval(this.snakeIntervalId);
    this.snake = [{x: 10, y: 10}];
    this.direction = {x: 1, y: 0};
    this.snakeScore = 0;
    this.snakeGameRunning = true;
    this.placeFood();
    this.snakeIntervalId = setInterval(() => this.snakeGameLoop(), 120);
    // Focus canvas
    setTimeout(() => {
      const canvas = document.querySelector('.snake-canvas') as HTMLCanvasElement;
      canvas?.focus();
    }, 100);
  }

  onSnakeKey(event: KeyboardEvent) {
    event.preventDefault();
    switch(event.key) {
      case 'ArrowUp': if (this.direction.y !== 1) this.direction = {x: 0, y: -1}; break;
      case 'ArrowDown': if (this.direction.y !== -1) this.direction = {x: 0, y: 1}; break;
      case 'ArrowLeft': if (this.direction.x !== 1) this.direction = {x: -1, y: 0}; break;
      case 'ArrowRight': if (this.direction.x !== -1) this.direction = {x: 1, y: 0}; break;
    }
  }

  private snakeGameLoop() {
    const head = {x: this.snake[0].x + this.direction.x, y: this.snake[0].y + this.direction.y};
    // Wall collision
    if (head.x < 0 || head.x >= this.tileCount || head.y < 0 || head.y >= this.tileCount) {
      this.endSnakeGame(); return;
    }
    // Self collision
    if (this.snake.some(s => s.x === head.x && s.y === head.y)) {
      this.endSnakeGame(); return;
    }
    this.snake.unshift(head);
    if (head.x === this.food.x && head.y === this.food.y) {
      this.snakeScore += 10;
      this.placeFood();
    } else {
      this.snake.pop();
    }
    this.drawSnake();
  }

  private placeFood() {
    this.food = {
      x: Math.floor(Math.random() * this.tileCount),
      y: Math.floor(Math.random() * this.tileCount)
    };
  }

  private drawSnake() {
    const canvas = document.querySelector('.snake-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const size = this.gridSize;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Food
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(this.food.x * size + size/2, this.food.y * size + size/2, size/2 - 2, 0, Math.PI * 2);
    ctx.fill();
    // Snake
    this.snake.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#4ade80' : '#22c55e';
      ctx.fillRect(seg.x * size + 1, seg.y * size + 1, size - 2, size - 2);
    });
  }

  private endSnakeGame() {
    if (this.snakeIntervalId) clearInterval(this.snakeIntervalId);
    this.snakeGameRunning = false;
  }
}
