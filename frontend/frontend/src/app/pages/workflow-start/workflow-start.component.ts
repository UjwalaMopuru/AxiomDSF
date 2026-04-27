import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { WorkspaceService, Workspace } from '../../services/workspace.service';
import { WorkflowService, StartWorkflowRequest } from '../../services/workflow.service';
import { RequirementService, Requirement } from '../../services/requirement.service';

@Component({
  selector: 'app-workflow-start',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(10px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ],
  template: `
    <div class="workflow-start">
      <div class="page-header">
        <h1><i class="fas fa-rocket"></i> Start New Workflow</h1>
        <p class="page-subtitle">Launch the AI agent pipeline in 4 easy steps</p>
      </div>

      <!-- Stepper -->
      <div class="stepper">
        <div *ngFor="let s of steps; let i = index"
             class="step-item"
             [class.active]="step === i + 1"
             [class.done]="step > i + 1"
             (click)="goToStep(i + 1)">
          <div class="step-circle">
            <i *ngIf="step > i + 1" class="fas fa-check"></i>
            <span *ngIf="step <= i + 1">{{ i + 1 }}</span>
          </div>
          <div class="step-label">{{ s }}</div>
        </div>
        <div class="step-line">
          <div class="step-line-fill" [style.width.%]="((step - 1) / (steps.length - 1)) * 100"></div>
        </div>
      </div>

      <div class="step-content">
        <!-- STEP 1: Select Workspace -->
        <div class="card" *ngIf="step === 1" @fadeIn>
          <div class="card-header">
            <div class="card-icon green"><i class="fas fa-folder-open"></i></div>
            <div>
              <h3>Select Workspace</h3>
              <p>Choose the workspace where the pipeline will run.</p>
            </div>
          </div>

          <form [formGroup]="workflowForm">
            <div class="input-group">
              <label>Workspace <span class="req">*</span></label>
              <div class="workspace-grid" *ngIf="workspaces.length > 0">
                <div *ngFor="let ws of workspaces" class="ws-card"
                     [class.selected]="workflowForm.get('workspaceId')?.value == ws.id"
                     (click)="selectWorkspace(ws)">
                  <div class="ws-icon"><i class="fas fa-project-diagram"></i></div>
                  <div class="ws-info">
                    <strong>{{ ws.projectName }}</strong>
                    <span class="ws-id">ID: {{ ws.id }}</span>
                  </div>
                  <i class="fas fa-check-circle ws-check" *ngIf="workflowForm.get('workspaceId')?.value == ws.id"></i>
                </div>
              </div>
              <div *ngIf="workspaces.length === 0" class="no-workspaces">
                <i class="fas fa-exclamation-circle"></i>
                <span>No workspaces found. <a routerLink="/workspaces/create">Create one first</a>.</span>
              </div>
            </div>
          </form>
        </div>

        <!-- STEP 2: Select or Add Requirement -->
        <div class="card" *ngIf="step === 2" @fadeIn>
          <div class="card-header">
            <div class="card-icon blue"><i class="fas fa-file-alt"></i></div>
            <div>
              <h3>Select or Add Requirement</h3>
              <p>Pick an existing requirement for <strong>{{ getSelectedWorkspaceName() }}</strong>, or create a new one.</p>
            </div>
          </div>

          <!-- Existing Requirements -->
          <div class="req-list-section" *ngIf="existingRequirements.length > 0 && !addingNew">
            <label class="section-label"><i class="fas fa-list"></i> Existing Requirements</label>
            <div class="req-card-list">
              <div *ngFor="let req of existingRequirements" class="req-card"
                   [class.selected]="selectedRequirement?.id === req.id"
                   (click)="selectRequirement(req)">
                <div class="req-card-top">
                  <span class="req-card-id">#{{ req.id }}</span>
                  <i class="fas fa-check-circle req-card-check" *ngIf="selectedRequirement?.id === req.id"></i>
                </div>
                <div class="req-card-text">{{ (req.requirementText || '') | slice:0:200 }}{{ (req.requirementText || '').length > 200 ? '...' : '' }}</div>
                <div class="req-card-meta" *ngIf="req.createdAt">{{ req.createdAt | date:'short' }}</div>
              </div>
            </div>
          </div>

          <div class="req-divider" *ngIf="existingRequirements.length > 0">
            <span class="divider-line"></span>
            <span class="divider-text">OR</span>
            <span class="divider-line"></span>
          </div>

          <!-- Add New Requirement -->
          <div class="new-req-section">
            <button *ngIf="!addingNew && existingRequirements.length > 0" class="add-new-req-btn" (click)="addingNew = true; selectedRequirement = null">
              <i class="fas fa-plus-circle"></i> Add New Requirement
            </button>
            <div *ngIf="addingNew || existingRequirements.length === 0">
              <label class="section-label"><i class="fas fa-pen"></i> New Requirement</label>
              <!-- Input Type Toggle -->
              <div class="input-type-toggle">
                <button type="button" class="type-btn" [class.active]="inputType === 'text'"
                        (click)="setInputType('text')">
                  <i class="fas fa-keyboard"></i> <span>Type Text</span>
                </button>
                <button type="button" class="type-btn" [class.active]="inputType === 'file'"
                        (click)="setInputType('file')">
                  <i class="fas fa-file-upload"></i> <span>Upload File</span>
                </button>
              </div>

              <form [formGroup]="workflowForm">
                <!-- Text Input -->
                <div class="input-group" *ngIf="inputType === 'text'">
                  <textarea formControlName="requirementText"
                            placeholder="Describe your software requirements in detail..."
                            rows="6" class="req-textarea"></textarea>
                  <div class="textarea-footer">
                    <span class="char-count" [class.warn]="getReqLength() > 5000">{{ getReqLength() }} characters</span>
                    <span class="hint">Be specific — include features, constraints, tech stack.</span>
                  </div>
                </div>

                <!-- File Input -->
                <div class="input-group" *ngIf="inputType === 'file'">
                  <div class="file-drop-zone" (click)="fileInput.click()"
                       (dragover)="$event.preventDefault()" (drop)="onFileDrop($event)"
                       [class.has-file]="selectedFileName" [class.dragging]="isDragging"
                       (dragenter)="isDragging = true" (dragleave)="isDragging = false">
                    <input #fileInput type="file" accept=".txt,.md,.doc,.docx"
                           (change)="onFileSelected($event)" style="display:none">
                    <div *ngIf="!selectedFileName && !readingFile" class="drop-content">
                      <div class="drop-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                      <p class="drop-main">Drag & drop or <span class="link">browse</span></p>
                      <p class="drop-hint">Supports .txt, .md — max 10MB</p>
                    </div>
                    <div *ngIf="readingFile" class="reading-indicator">
                      <i class="fas fa-spinner fa-spin"></i> <span>Reading file...</span>
                    </div>
                    <div *ngIf="selectedFileName && !readingFile" class="file-selected">
                      <div class="file-icon"><i class="fas fa-file-alt"></i></div>
                      <div class="file-info">
                        <span class="file-name">{{ selectedFileName }}</span>
                        <span class="file-size">{{ getReqLength() }} chars</span>
                      </div>
                      <button type="button" class="clear-file" (click)="clearFile(); $event.stopPropagation()">
                        <i class="fas fa-trash-alt"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </form>

              <button *ngIf="addingNew && existingRequirements.length > 0" class="cancel-new-btn"
                      (click)="addingNew = false; workflowForm.patchValue({requirementText: ''})">
                <i class="fas fa-times"></i> Cancel — Use Existing
              </button>
            </div>
          </div>

          <!-- Advanced Options -->
          <div class="advanced-section">
            <button type="button" class="advanced-toggle" (click)="showAdvanced = !showAdvanced">
              <i class="fas" [ngClass]="showAdvanced ? 'fa-chevron-up' : 'fa-chevron-down'"></i>
              Advanced Options
            </button>
            <div class="advanced-body" *ngIf="showAdvanced">
              <form [formGroup]="workflowForm">
                <div class="input-group">
                  <label><i class="fas fa-robot"></i> Start from Specific Agent</label>
                  <select formControlName="agentName" class="select-input">
                    <option value="">Full Pipeline (Requirement → Security)</option>
                    <option value="HLSAgent">HLS Agent</option>
                    <option value="HLDAgent">HLD Agent</option>
                    <option value="UserStoryAgent">User Story Agent</option>
                    <option value="TRReviewAgent">Test Review Agent</option>
                    <option value="LLDAgent">LLD Agent</option>
                    <option value="TDDAgent">TDD Agent</option>
                    <option value="CodingAgent">Coding Agent</option>
                    <option value="StaticCodeAnalysisAgent">Static Analysis Agent</option>
                    <option value="SecurityAgent">Security Agent</option>
                  </select>
                </div>
                <div class="input-group">
                  <label><i class="fas fa-book-open"></i> Pre-defined User Story (Optional)</label>
                  <textarea formControlName="userStoryText"
                            placeholder="If you already have a user story, paste it here."
                            rows="3"></textarea>
                </div>
              </form>
            </div>
          </div>
        </div>

        <!-- STEP 3: Pipeline Mode -->
        <div class="card" *ngIf="step === 3" @fadeIn>
          <div class="card-header">
            <div class="card-icon orange"><i class="fas fa-route"></i></div>
            <div>
              <h3>Choose Pipeline Mode</h3>
              <p>Select how the AI agents should process your requirements.</p>
            </div>
          </div>

          <div class="pipeline-mode-grid">
            <!-- Per-Story Mode -->
            <div class="mode-card" [class.selected]="selectedPipelineMode === 'per-story'"
                 (click)="selectedPipelineMode = 'per-story'">
              <div class="mode-icon">
                <i class="fas fa-code-branch"></i>
              </div>
              <div class="mode-badge recommended">Recommended</div>
              <h4>Per-Story Pipeline</h4>
              <p class="mode-desc">
                User stories are <strong>split individually</strong>. Each story runs through its own
                Test Review Agent → LLD → TDD → Coding → SCA → Security pipeline independently.
              </p>
              <div class="mode-flow">
                <div class="mode-flow-shared">
                  <span class="mode-chip">📋 Req</span>
                  <i class="fas fa-arrow-right mode-arr"></i>
                  <span class="mode-chip">🏗️ HLS</span>
                  <i class="fas fa-arrow-right mode-arr"></i>
                  <span class="mode-chip">📐 HLD</span>
                  <i class="fas fa-arrow-right mode-arr"></i>
                  <span class="mode-chip">📖 US</span>
                </div>
                <div class="mode-branch-indicator">
                  <i class="fas fa-code-branch"></i> Splits per story
                </div>
                <div class="mode-flow-per">
                  <span class="mode-chip small">✅ Test Review Agent</span>
                  <i class="fas fa-arrow-right mode-arr"></i>
                  <span class="mode-chip small">⚙️ LLD</span>
                  <i class="fas fa-arrow-right mode-arr"></i>
                  <span class="mode-chip small">🧪 TDD</span>
                  <i class="fas fa-arrow-right mode-arr"></i>
                  <span class="mode-chip small">💻 Code</span>
                  <i class="fas fa-arrow-right mode-arr"></i>
                  <span class="mode-chip small">🔍 SCA</span>
                  <i class="fas fa-arrow-right mode-arr"></i>
                  <span class="mode-chip small">🔐 Sec</span>
                </div>
                <!-- TDD Loop Arrow -->
                <div class="mode-loop-indicator">
                  <span class="loop-label">🔄 Code ↔ TDD verification loop</span>
                </div>
              </div>
              <ul class="mode-pros">
                <li><i class="fas fa-check"></i> Granular control per story</li>
                <li><i class="fas fa-check"></i> Parallel execution possible</li>
                <li><i class="fas fa-check"></i> Individual approvals</li>
                <li><i class="fas fa-check"></i> Isolated, downloadable per-story code</li>
              </ul>
              <div class="mode-select-indicator" *ngIf="selectedPipelineMode === 'per-story'">
                <i class="fas fa-check-circle"></i> Selected
              </div>
            </div>

            <!-- Full Feature Mode -->
            <div class="mode-card" [class.selected]="selectedPipelineMode === 'full-sequence'"
                 (click)="selectedPipelineMode = 'full-sequence'">
              <div class="mode-icon">
                <i class="fas fa-stream"></i>
              </div>
              <div class="mode-badge">All-in-One</div>
              <h4>Full Feature Pipeline</h4>
              <p class="mode-desc">
                All user stories are processed <strong>together as a whole</strong>. Each agent runs once
                for the complete set of stories in a single sequential flow.
              </p>
              <div class="mode-flow">
                <div class="mode-flow-linear">
                  <span class="mode-chip">📋 Req</span>
                  <i class="fas fa-arrow-right mode-arr"></i>
                  <span class="mode-chip">🏗️ HLS</span>
                  <i class="fas fa-arrow-right mode-arr"></i>
                  <span class="mode-chip">📐 HLD</span>
                  <i class="fas fa-arrow-right mode-arr"></i>
                  <span class="mode-chip">📖 US</span>
                  <i class="fas fa-arrow-right mode-arr"></i>
                  <span class="mode-chip">✅ Test Review Agent</span>
                </div>
                <div class="mode-flow-linear">
                  <span class="mode-chip">⚙️ LLD</span>
                  <i class="fas fa-arrow-right mode-arr"></i>
                  <span class="mode-chip">🧪 TDD</span>
                  <i class="fas fa-arrow-right mode-arr"></i>
                  <span class="mode-chip">💻 Code</span>
                  <i class="fas fa-arrow-right mode-arr"></i>
                  <span class="mode-chip">🔍 SCA</span>
                  <i class="fas fa-arrow-right mode-arr"></i>
                  <span class="mode-chip">🔐 Sec</span>
                </div>
                <div class="mode-loop-indicator">
                  <span class="loop-label">🔄 Code ↔ TDD verification loop</span>
                </div>
              </div>
              <ul class="mode-pros">
                <li><i class="fas fa-check"></i> Simpler sequential flow</li>
                <li><i class="fas fa-check"></i> Holistic code generation</li>
                <li><i class="fas fa-check"></i> Single approval per agent</li>
                <li><i class="fas fa-check"></i> Complete project in one ZIP</li>
              </ul>
              <div class="mode-select-indicator" *ngIf="selectedPipelineMode === 'full-sequence'">
                <i class="fas fa-check-circle"></i> Selected
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 4: Review & Launch -->
        <div class="card" *ngIf="step === 4" @fadeIn>
          <div class="card-header">
            <div class="card-icon purple"><i class="fas fa-rocket"></i></div>
            <div>
              <h3>Review & Launch</h3>
              <p>Confirm your configuration and start the AI agent pipeline.</p>
            </div>
          </div>

          <div class="review-grid">
            <div class="review-item">
              <div class="review-label"><i class="fas fa-folder-open"></i> Workspace</div>
              <div class="review-value">
                <strong>{{ getSelectedWorkspaceName() }}</strong>
                <span class="review-meta">ID: {{ workflowForm.get('workspaceId')?.value }}</span>
              </div>
            </div>
            <div class="review-item">
              <div class="review-label"><i class="fas fa-file-alt"></i> Requirement</div>
              <div class="review-value">
                <strong *ngIf="selectedRequirement">Requirement #{{ selectedRequirement.id }}</strong>
                <strong *ngIf="!selectedRequirement">New Requirement</strong>
                <pre class="review-text">{{ getReviewReqText() | slice:0:300 }}{{ getReviewReqText().length > 300 ? '...' : '' }}</pre>
                <span class="review-meta">{{ getReviewReqText().length }} characters</span>
              </div>
            </div>
            <div class="review-item">
              <div class="review-label"><i class="fas fa-robot"></i> Pipeline</div>
              <div class="review-value">
                <strong>{{ workflowForm.get('agentName')?.value || 'Full Pipeline' }}</strong>
                <span class="review-meta">{{ workflowForm.get('agentName')?.value ? 'Starting from specific agent' : '10 agents: Requirement → Security' }}</span>
              </div>
            </div>
            <div class="review-item">
              <div class="review-label"><i class="fas fa-route"></i> Pipeline Mode</div>
              <div class="review-value">
                <strong>{{ selectedPipelineMode === 'per-story' ? '🔀 Per-Story Pipeline' : '➡️ Full Feature Pipeline' }}</strong>
                <span class="review-meta">{{ selectedPipelineMode === 'per-story' ? 'Each story processed independently' : 'All stories processed together' }}</span>
              </div>
            </div>
          </div>

          <!-- Pipeline Preview -->
          <div class="pipeline-preview">
            <div class="pp-label">Agent Pipeline Execution Order</div>
            <div class="pp-agents">
              <div *ngFor="let a of pipelineAgents; let i = index" class="pp-agent"
                   [class.skipped]="isAgentSkipped(a.name)">
                <div class="pp-icon">{{ a.icon }}</div>
                <div class="pp-name">{{ a.label }}</div>
                <i class="fas fa-chevron-right pp-arrow" *ngIf="i < pipelineAgents.length - 1"></i>
              </div>
            </div>
          </div>

          <!-- Launch Button -->
          <div class="launch-section">
            <button class="launch-btn" (click)="onSubmit()" [disabled]="!isFormValid() || submitting">
              <div class="launch-btn-content">
                <i class="fas" [ngClass]="submitting ? 'fa-spinner fa-spin' : 'fa-rocket'"></i>
                <span>{{ submitting ? 'Launching Pipeline...' : 'Launch Workflow' }}</span>
              </div>
              <div class="launch-btn-glow"></div>
            </button>
          </div>

          <!-- Result -->
          <div *ngIf="result" class="result-panel" @fadeIn>
            <div class="result-icon">
              <div class="success-ring"><i class="fas fa-check"></i></div>
            </div>
            <h3>Pipeline Launched Successfully!</h3>
            <div class="result-details">
              <div class="rd-item"><span>Workflow ID</span><strong>#{{ result.id }}</strong></div>
              <div class="rd-item"><span>Requirement ID</span><strong>#{{ result.requirementId }}</strong></div>
              <div class="rd-item"><span>State</span><span class="state-badge">{{ result.state }}</span></div>
              <div class="rd-item" *ngIf="result.agentName"><span>Current Agent</span><strong>{{ getAgentDisplayName(result.agentName) }}</strong></div>
            </div>
            <button class="view-status-btn" (click)="goToStatus()">
              <i class="fas fa-external-link-alt"></i> Go to Workspace
            </button>
          </div>

          <!-- Error -->
          <div *ngIf="errorMsg" class="error-panel" @fadeIn>
            <i class="fas fa-exclamation-triangle"></i>
            <div>
              <strong>Failed to Start</strong>
              <p>{{ errorMsg }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Navigation Buttons -->
      <div class="nav-buttons">
        <button class="nav-btn back" (click)="prevStep()" *ngIf="step > 1 && !result">
          <i class="fas fa-arrow-left"></i> Back
        </button>
        <div class="nav-spacer"></div>
        <button class="nav-btn next" (click)="nextStep()" *ngIf="step < 4" [disabled]="!canProceed()">
          Next <i class="fas fa-arrow-right"></i>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .workflow-start { width: 100%; max-width: 860px; }
    .page-header { margin-bottom: 28px; }
    .page-header h1 { font-size: 1.6em; margin-bottom: 4px; }
    .page-header h1 i { margin-right: 12px; color: #3A7D44; }
    .page-subtitle { color: #6b7280; font-size: 0.9em; margin: 0; }

    /* Stepper */
    .stepper {
      display: flex; justify-content: space-between; align-items: flex-start;
      position: relative; margin-bottom: 32px; padding: 0 20px;
    }
    .step-item {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      position: relative; z-index: 1; cursor: pointer; min-width: 80px;
    }
    .step-circle {
      width: 40px; height: 40px; border-radius: 50%;
      background: #e5e7eb; color: #9ca3af;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 0.9em; transition: all 0.3s;
      border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .step-item.active .step-circle {
      background: linear-gradient(135deg, #5DBB63, #3A7D44);
      color: white; transform: scale(1.1);
      box-shadow: 0 4px 16px rgba(58,125,68,0.35);
    }
    .step-item.done .step-circle {
      background: #22c55e; color: white;
    }
    .step-label { font-size: 0.78em; font-weight: 500; color: #9ca3af; text-align: center; }
    .step-item.active .step-label { color: #3A7D44; font-weight: 600; }
    .step-item.done .step-label { color: #22c55e; }
    .step-line {
      position: absolute; top: 20px; left: 60px; right: 60px; height: 3px;
      background: #e5e7eb; border-radius: 2px; z-index: 0;
    }
    .step-line-fill {
      height: 100%; background: linear-gradient(90deg, #22c55e, #3A7D44);
      border-radius: 2px; transition: width 0.5s;
    }

    /* Cards */
    .card {
      background: white; border-radius: 14px; padding: 32px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06); margin-bottom: 16px;
      border: 1px solid #f0f0f0;
    }
    .card-header {
      display: flex; align-items: flex-start; gap: 16px; margin-bottom: 28px;
    }
    .card-icon {
      width: 50px; height: 50px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 1.2em; flex-shrink: 0;
    }
    .card-icon.blue { background: linear-gradient(135deg, #60a5fa, #3b82f6); }
    .card-icon.green { background: linear-gradient(135deg, #5DBB63, #3A7D44); }
    .card-icon.purple { background: linear-gradient(135deg, #a78bfa, #7c3aed); }
    .card-header h3 { margin: 0 0 4px; font-size: 1.15em; color: #1f2937; }
    .card-header p { margin: 0; font-size: 0.85em; color: #6b7280; }

    /* Input Type Toggle */
    .input-type-toggle {
      display: flex; gap: 12px; margin-bottom: 24px;
    }
    .type-btn {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px;
      padding: 14px; border: 2px solid #e5e7eb; border-radius: 12px;
      background: white; cursor: pointer; font-family: 'Poppins', sans-serif;
      font-weight: 500; font-size: 0.9em; color: #6b7280; transition: all 0.3s;
    }
    .type-btn:hover { border-color: #93c5fd; background: #eff6ff; }
    .type-btn.active {
      border-color: #3A7D44; background: #f0fdf4; color: #3A7D44;
      box-shadow: 0 0 0 3px rgba(58,125,68,0.1);
    }
    .type-btn i { font-size: 1.1em; }

    /* Input Groups */
    .input-group { margin-bottom: 20px; }
    .input-group label {
      display: block; margin-bottom: 8px; font-weight: 500;
      font-size: 0.88em; color: #374151;
    }
    .input-group label i { margin-right: 6px; color: #3A7D44; }
    .req { color: #ef4444; }
    .input-group textarea, .input-group input, .select-input {
      width: 100%; padding: 12px 14px; border: 1px solid #e0e0e0;
      border-radius: 10px; font-size: 0.9em; font-family: 'Poppins', sans-serif;
      transition: all 0.3s; background: white; resize: vertical;
    }
    .input-group textarea:focus, .input-group input:focus, .select-input:focus {
      outline: none; border-color: #3A7D44;
      box-shadow: 0 0 0 3px rgba(58,125,68,0.08);
    }
    .req-textarea { min-height: 120px; line-height: 1.7; }
    .textarea-footer {
      display: flex; justify-content: space-between; margin-top: 6px;
    }
    .char-count { font-size: 0.75em; color: #9ca3af; }
    .char-count.warn { color: #f59e0b; }
    .hint { font-size: 0.78em; color: #9ca3af; }

    /* File Drop Zone */
    .file-drop-zone {
      border: 2px dashed #d1d5db; border-radius: 14px; padding: 40px 24px;
      text-align: center; cursor: pointer; transition: all 0.3s; background: #fafbfc;
    }
    .file-drop-zone:hover, .file-drop-zone.dragging {
      border-color: #3A7D44; background: #f0fdf4;
    }
    .file-drop-zone.has-file { border-color: #22c55e; border-style: solid; background: #f0fdf4; }
    .drop-icon { font-size: 2.5em; color: #3A7D44; margin-bottom: 12px; }
    .drop-main { color: #374151; font-weight: 500; margin: 0 0 4px; }
    .drop-main .link { color: #3b82f6; text-decoration: underline; }
    .drop-hint { color: #9ca3af; font-size: 0.82em; margin: 0; }
    .reading-indicator {
      display: flex; align-items: center; justify-content: center; gap: 10px; color: #3A7D44;
    }
    .file-selected {
      display: flex; align-items: center; gap: 16px; text-align: left;
    }
    .file-icon { font-size: 2em; color: #3A7D44; }
    .file-info { display: flex; flex-direction: column; flex: 1; }
    .file-name { font-weight: 600; color: #1f2937; }
    .file-size { font-size: 0.8em; color: #6b7280; }
    .clear-file {
      width: 36px; height: 36px; border-radius: 50%; border: 1px solid #fecaca;
      background: #fef2f2; color: #ef4444; cursor: pointer; display: flex;
      align-items: center; justify-content: center; transition: all 0.2s;
    }
    .clear-file:hover { background: #fee2e2; transform: scale(1.05); }

    /* Requirement Preview */
    .req-preview {
      border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; margin-top: 12px;
    }
    .preview-header {
      display: flex; align-items: center; gap: 8px; padding: 10px 14px;
      background: #f9fafb; cursor: pointer; font-size: 0.82em; color: #6b7280;
      font-weight: 500; transition: background 0.2s;
    }
    .preview-header:hover { background: #f3f4f6; }
    .preview-badge {
      margin-left: auto; background: #e5e7eb; padding: 2px 8px;
      border-radius: 10px; font-size: 0.85em;
    }
    .preview-body { padding: 14px; background: #fafbfc; }
    .preview-body pre {
      margin: 0; white-space: pre-wrap; word-break: break-word;
      font-size: 0.82em; color: #374151; line-height: 1.7;
      font-family: 'Poppins', sans-serif;
    }

    /* Workspace Grid */
    .workspace-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }
    .ws-card {
      display: flex; align-items: center; gap: 12px; padding: 16px;
      border: 2px solid #e5e7eb; border-radius: 12px;
      cursor: pointer; transition: all 0.3s; background: white; position: relative;
    }
    .ws-card:hover { border-color: #93c5fd; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
    .ws-card.selected {
      border-color: #3A7D44; background: #f0fdf4;
      box-shadow: 0 0 0 3px rgba(58,125,68,0.12);
    }
    .ws-icon {
      width: 40px; height: 40px; border-radius: 10px; background: #eff6ff;
      display: flex; align-items: center; justify-content: center;
      color: #3b82f6; font-size: 1em;
    }
    .ws-card.selected .ws-icon { background: #dcfce7; color: #22c55e; }
    .ws-info { display: flex; flex-direction: column; }
    .ws-info strong { font-size: 0.88em; color: #1f2937; }
    .ws-id { font-size: 0.72em; color: #9ca3af; }
    .ws-check { position: absolute; top: 8px; right: 8px; color: #22c55e; font-size: 1em; }
    .no-workspaces {
      display: flex; align-items: center; gap: 8px; padding: 20px;
      background: #fef2f2; border-radius: 10px; color: #991b1b; font-size: 0.88em;
    }
    .no-workspaces a { color: #3b82f6; }

    /* Advanced Section */
    .advanced-section { margin-top: 20px; }
    .advanced-toggle {
      display: flex; align-items: center; gap: 8px;
      background: none; border: 1px solid #e5e7eb; border-radius: 8px;
      padding: 10px 16px; cursor: pointer; font-family: 'Poppins', sans-serif;
      font-size: 0.85em; color: #6b7280; font-weight: 500; width: 100%;
      transition: all 0.2s;
    }
    .advanced-toggle:hover { background: #f9fafb; border-color: #d1d5db; }
    .advanced-body { padding: 20px 0 0; }

    /* Review Grid */
    .review-grid { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; }
    .review-item {
      display: flex; gap: 16px; padding: 16px; background: #f9fafb;
      border-radius: 10px; border: 1px solid #f0f0f0;
    }
    .review-label {
      min-width: 130px; font-size: 0.82em; font-weight: 600;
      color: #6b7280; display: flex; align-items: flex-start; gap: 6px;
    }
    .review-label i { color: #3A7D44; }
    .review-value { flex: 1; }
    .review-value strong { color: #1f2937; font-size: 0.92em; display: block; }
    .review-meta { font-size: 0.78em; color: #9ca3af; }
    .review-text {
      margin: 0 0 4px; white-space: pre-wrap; word-break: break-word;
      font-size: 0.82em; color: #374151; line-height: 1.6;
      font-family: 'Poppins', sans-serif; max-height: 100px; overflow-y: auto;
    }

    /* Pipeline Preview */
    .pipeline-preview {
      padding: 20px; background: linear-gradient(135deg, #f0fdf4, #ecfdf5);
      border-radius: 12px; margin-bottom: 24px; border: 1px solid #bbf7d0;
    }
    .pp-label { font-size: 0.82em; font-weight: 600; color: #166534; margin-bottom: 14px; }
    .pp-agents {
      display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
    }
    .pp-agent {
      display: flex; align-items: center; gap: 4px; font-size: 0.78em;
      padding: 4px 10px; background: white; border-radius: 8px;
      border: 1px solid #bbf7d0; color: #166534; font-weight: 500;
      transition: all 0.2s;
    }
    .pp-agent.skipped { opacity: 0.35; text-decoration: line-through; }
    .pp-icon { font-size: 1.1em; }
    .pp-arrow { color: #86efac; font-size: 0.7em; margin: 0 2px; }

    /* Launch Button */
    .launch-section { text-align: center; margin-bottom: 24px; }
    .launch-btn {
      position: relative; overflow: hidden;
      background: linear-gradient(135deg, #5DBB63, #3A7D44);
      color: white; border: none; border-radius: 14px;
      padding: 16px 48px; font-size: 1.05em; font-weight: 600;
      cursor: pointer; font-family: 'Poppins', sans-serif;
      box-shadow: 0 6px 24px rgba(58,125,68,0.35);
      transition: all 0.3s;
    }
    .launch-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 32px rgba(58,125,68,0.45);
    }
    .launch-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .launch-btn-content { display: flex; align-items: center; gap: 10px; position: relative; z-index: 1; }
    .launch-btn-glow {
      position: absolute; inset: -2px; border-radius: 16px;
      background: linear-gradient(135deg, rgba(93,187,99,0.4), rgba(58,125,68,0.4));
      filter: blur(12px); z-index: 0; opacity: 0;
      transition: opacity 0.3s;
    }
    .launch-btn:hover .launch-btn-glow { opacity: 1; }

    /* Result Panel */
    .result-panel {
      text-align: center; padding: 32px; border-radius: 14px;
      background: linear-gradient(135deg, #f0fdf4, #dcfce7);
      border: 1px solid #bbf7d0;
    }
    .result-icon { margin-bottom: 16px; }
    .success-ring {
      width: 64px; height: 64px; border-radius: 50%;
      background: #22c55e; color: white; display: inline-flex;
      align-items: center; justify-content: center; font-size: 1.5em;
      box-shadow: 0 8px 24px rgba(34,197,94,0.3);
      animation: popIn 0.4s ease;
    }
    @keyframes popIn { from { transform: scale(0); } to { transform: scale(1); } }
    .result-panel h3 { color: #166534; margin: 0 0 20px; }
    .result-details {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px; text-align: center; margin-bottom: 20px;
    }
    .rd-item { padding: 12px; background: white; border-radius: 10px; overflow: hidden; }
    .rd-item span:first-child { font-size: 0.78em; color: #6b7280; display: block; margin-bottom: 4px; }
    .rd-item strong { color: #166534; word-break: break-word; overflow-wrap: break-word; font-size: 0.85em; }
    .state-badge {
      display: inline-block; padding: 3px 12px; border-radius: 12px;
      background: #22c55e; color: white; font-size: 0.82em; font-weight: 600;
    }
    .view-status-btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 24px; border: 2px solid #3A7D44; border-radius: 10px;
      background: white; color: #3A7D44; cursor: pointer;
      font-family: 'Poppins', sans-serif; font-weight: 500; font-size: 0.9em;
      transition: all 0.3s;
    }
    .view-status-btn:hover { background: #f0fdf4; transform: translateY(-1px); }

    /* Error Panel */
    .error-panel {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 20px; border-radius: 12px;
      background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
    }
    .error-panel i { font-size: 1.3em; margin-top: 2px; }
    .error-panel strong { display: block; margin-bottom: 4px; }
    .error-panel p { margin: 0; font-size: 0.88em; }

    /* Navigation Buttons */
    .nav-buttons {
      display: flex; align-items: center; margin-top: 8px;
    }
    .nav-spacer { flex: 1; }
    .nav-btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 20px; border: 1px solid #e0e0e0; border-radius: 10px;
      background: white; cursor: pointer; font-family: 'Poppins', sans-serif;
      font-weight: 500; font-size: 0.9em; color: #374151; transition: all 0.3s;
    }
    .nav-btn:hover:not(:disabled) { border-color: #3A7D44; color: #3A7D44; background: #f0fdf4; }
    .nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .nav-btn.next {
      background: linear-gradient(135deg, #5DBB63, #3A7D44);
      color: white; border: none;
      box-shadow: 0 4px 12px rgba(58,125,68,0.25);
    }
    .nav-btn.next:hover:not(:disabled) { transform: translateY(-1px); }

    /* Requirement Cards */
    .section-label {
      display: flex; align-items: center; gap: 8px;
      font-size: 0.85em; font-weight: 600; color: #374151; margin-bottom: 12px;
    }
    .section-label i { color: #3A7D44; }
    .req-card-list {
      display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;
    }
    .req-card {
      padding: 14px 16px; border: 2px solid #e5e7eb; border-radius: 12px;
      cursor: pointer; transition: all 0.3s; background: white; position: relative;
    }
    .req-card:hover { border-color: #93c5fd; background: #f9fafb; }
    .req-card.selected {
      border-color: #3A7D44; background: #f0fdf4;
      box-shadow: 0 0 0 3px rgba(58,125,68,0.12);
    }
    .req-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .req-card-id { font-size: 0.78em; font-weight: 700; color: #3A7D44; }
    .req-card-check { color: #22c55e; }
    .req-card-text { font-size: 0.85em; color: #374151; line-height: 1.6; }
    .req-card-meta { font-size: 0.72em; color: #9ca3af; margin-top: 6px; }

    .req-divider {
      display: flex; align-items: center; gap: 12px; margin: 20px 0;
    }
    .divider-line { flex: 1; height: 1px; background: #e5e7eb; }
    .divider-text { font-size: 0.8em; font-weight: 600; color: #9ca3af; }

    .add-new-req-btn {
      display: flex; align-items: center; gap: 8px; width: 100%;
      padding: 14px; border: 2px dashed #d1d5db; border-radius: 12px;
      background: white; cursor: pointer; font-family: 'Poppins', sans-serif;
      font-size: 0.9em; font-weight: 500; color: #3A7D44; transition: all 0.3s;
      justify-content: center;
    }
    .add-new-req-btn:hover { border-color: #3A7D44; background: #f0fdf4; }

    .cancel-new-btn {
      display: flex; align-items: center; gap: 6px; margin-top: 12px;
      padding: 8px 16px; border: 1px solid #e5e7eb; border-radius: 8px;
      background: white; cursor: pointer; font-family: 'Poppins', sans-serif;
      font-size: 0.82em; color: #6b7280; transition: all 0.2s;
    }
    .cancel-new-btn:hover { background: #f9fafb; border-color: #d1d5db; }

    /* Pipeline Mode Selection */
    .card-icon.orange { background: linear-gradient(135deg, #fb923c, #ea580c); }
    .pipeline-mode-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
    }
    .mode-card {
      position: relative; padding: 28px 24px; border: 2px solid #e5e7eb;
      border-radius: 16px; cursor: pointer; transition: all 0.3s;
      background: white; overflow: hidden;
    }
    .mode-card:hover { border-color: #93c5fd; transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
    .mode-card.selected {
      border-color: #3A7D44; background: linear-gradient(135deg, #f0fdf4, #ecfdf5);
      box-shadow: 0 0 0 3px rgba(58,125,68,0.15), 0 8px 24px rgba(58,125,68,0.12);
    }
    .mode-icon {
      width: 56px; height: 56px; border-radius: 16px;
      background: linear-gradient(135deg, #eff6ff, #dbeafe);
      display: flex; align-items: center; justify-content: center;
      color: #3b82f6; font-size: 1.5em; margin-bottom: 16px;
    }
    .mode-card.selected .mode-icon {
      background: linear-gradient(135deg, #dcfce7, #bbf7d0); color: #22c55e;
    }
    .mode-badge {
      position: absolute; top: 16px; right: 16px;
      padding: 3px 10px; border-radius: 8px; font-size: 0.7em;
      font-weight: 600; background: #f3f4f6; color: #6b7280;
    }
    .mode-badge.recommended { background: #fef3c7; color: #92400e; }
    .mode-card h4 { margin: 0 0 8px; font-size: 1.05em; color: #1f2937; }
    .mode-desc { font-size: 0.82em; color: #6b7280; line-height: 1.6; margin: 0 0 16px; }
    .mode-flow {
      padding: 14px; background: #f9fafb; border-radius: 10px;
      margin-bottom: 16px; border: 1px solid #f0f0f0;
    }
    .mode-card.selected .mode-flow { background: #ecfdf5; border-color: #bbf7d0; }
    .mode-flow-shared, .mode-flow-per, .mode-flow-linear {
      display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 8px;
    }
    .mode-chip {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 3px 8px; background: white; border-radius: 6px;
      font-size: 0.72em; font-weight: 500; border: 1px solid #e5e7eb;
      white-space: nowrap;
    }
    .mode-chip.small { font-size: 0.68em; padding: 2px 6px; }
    .mode-arr { font-size: 0.6em; color: #9ca3af; }
    .mode-branch-indicator {
      font-size: 0.72em; color: #7c3aed; font-weight: 600;
      padding: 4px 0; display: flex; align-items: center; gap: 4px;
    }
    .mode-loop-indicator {
      margin-top: 8px; padding-top: 8px; border-top: 1px dashed #d1d5db;
    }
    .loop-label {
      font-size: 0.72em; color: #ea580c; font-weight: 600;
      display: flex; align-items: center; gap: 4px;
    }
    .mode-pros {
      list-style: none; padding: 0; margin: 0 0 8px;
    }
    .mode-pros li {
      display: flex; align-items: center; gap: 8px;
      font-size: 0.8em; color: #374151; padding: 4px 0;
    }
    .mode-pros li i { color: #22c55e; font-size: 0.85em; }
    .mode-select-indicator {
      display: flex; align-items: center; gap: 6px; justify-content: center;
      padding: 8px; background: #dcfce7; border-radius: 8px;
      color: #166534; font-weight: 600; font-size: 0.85em;
    }

    @media (max-width: 640px) {
      .card { padding: 20px; }
      .workspace-grid { grid-template-columns: 1fr; }
      .pp-agents { flex-direction: column; }
      .result-details { grid-template-columns: 1fr 1fr; }
      .pipeline-mode-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class WorkflowStartComponent implements OnInit {
  workflowForm: FormGroup;
  workspaces: Workspace[] = [];
  existingRequirements: Requirement[] = [];
  selectedRequirement: Requirement | null = null;
  addingNew = false;
  submitting = false;
  result: any = null;
  errorMsg: string | null = null;
  inputType: 'text' | 'file' = 'text';
  selectedFileName = '';
  readingFile = false;
  isDragging = false;
  showPreview = false;
  showAdvanced = false;
  step = 1;
  steps = ['Workspace', 'Requirement', 'Pipeline Mode', 'Review & Launch'];
  selectedPipelineMode: 'per-story' | 'full-sequence' = 'per-story';

  pipelineAgents = [
    { name: 'RequirementAnalysisRefinementAgent', icon: '📋', label: 'Requirement' },
    { name: 'HLSAgent', icon: '🏗️', label: 'HLS' },
    { name: 'HLDAgent', icon: '📐', label: 'HLD' },
    { name: 'UserStoryAgent', icon: '📖', label: 'User Story' },
    { name: 'TRReviewAgent', icon: '✅', label: 'Test Review Agent' },
    { name: 'LLDAgent', icon: '⚙️', label: 'LLD' },
    { name: 'TDDAgent', icon: '🧪', label: 'TDD' },
    { name: 'CodingAgent', icon: '💻', label: 'Coding' },
    { name: 'StaticCodeAnalysisAgent', icon: '🔍', label: 'Static Analysis' },
    { name: 'SecurityAgent', icon: '🔐', label: 'Security' },
  ];

  constructor(
    private fb: FormBuilder,
    private workspaceService: WorkspaceService,
    private workflowService: WorkflowService,
    private requirementService: RequirementService,
    private router: Router
  ) {
    this.workflowForm = this.fb.group({
      workspaceId: ['', Validators.required],
      requirementText: [''],
      inputFilePath: [''],
      userStoryText: [''],
      agentName: ['']
    });
  }

  ngOnInit() {
    this.workspaceService.listWorkspaces().subscribe({
      next: (ws: Workspace[]) => this.workspaces = ws,
      error: () => {}
    });
  }

  // Navigation
  nextStep() { if (this.canProceed() && this.step < 4) this.step++; }
  prevStep() { if (this.step > 1) this.step--; }
  goToStep(s: number) { if (s <= this.step || (s === this.step + 1 && this.canProceed())) this.step = s; }

  canProceed(): boolean {
    if (this.step === 1) return !!this.workflowForm.get('workspaceId')?.value;
    if (this.step === 2) return this.selectedRequirement !== null || this.getReqLength() > 0;
    if (this.step === 3) return !!this.selectedPipelineMode;
    return true;
  }

  selectWorkspace(ws: Workspace) {
    this.workflowForm.patchValue({ workspaceId: ws.id });
    // Load existing requirements for this workspace
    this.existingRequirements = [];
    this.selectedRequirement = null;
    this.addingNew = false;
    if (ws.id) {
      this.requirementService.getByWorkspace(ws.id).subscribe({
        next: (reqs: Requirement[]) => this.existingRequirements = reqs,
        error: () => {}
      });
    }
  }

  selectRequirement(req: Requirement) {
    this.selectedRequirement = req;
    this.addingNew = false;
    this.workflowForm.patchValue({ requirementText: '' });
  }

  getReviewReqText(): string {
    if (this.selectedRequirement) return this.selectedRequirement.requirementText || '';
    return this.workflowForm.get('requirementText')?.value || '';
  }

  getSelectedWorkspaceName(): string {
    const wsId = this.workflowForm.get('workspaceId')?.value;
    const ws = this.workspaces.find(w => w.id == wsId);
    return ws?.projectName || 'Unknown';
  }

  getReqLength(): number {
    return (this.workflowForm.get('requirementText')?.value || '').length;
  }

  isAgentSkipped(agentName: string): boolean {
    const selected = this.workflowForm.get('agentName')?.value;
    if (!selected) return false;
    const selectedIdx = this.pipelineAgents.findIndex(a => a.name === selected);
    const currentIdx = this.pipelineAgents.findIndex(a => a.name === agentName);
    return currentIdx < selectedIdx;
  }

  setInputType(type: 'text' | 'file') {
    this.inputType = type;
    if (type === 'text') {
      this.workflowForm.patchValue({ inputFilePath: '' });
      this.clearFile();
    } else {
      this.workflowForm.patchValue({ requirementText: '' });
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) this.readFile(file);
  }

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
    const file = event.dataTransfer?.files[0];
    if (file) this.readFile(file);
  }

  private readFile(file: File) {
    this.selectedFileName = file.name;
    this.readingFile = true;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.workflowForm.patchValue({
        inputFilePath: file.name,
        requirementText: e.target.result
      });
      this.readingFile = false;
    };
    reader.onerror = () => {
      this.clearFile();
      this.readingFile = false;
    };
    reader.readAsText(file);
  }

  clearFile() {
    this.selectedFileName = '';
    this.workflowForm.patchValue({ inputFilePath: '', requirementText: '' });
  }

  isFormValid(): boolean {
    const wsValid = !!this.workflowForm.get('workspaceId')?.value;
    const reqValid = this.selectedRequirement !== null || this.getReqLength() > 0;
    return wsValid && reqValid;
  }

  onSubmit() {
    if (!this.isFormValid() || this.submitting) return;
    this.submitting = true;
    this.result = null;
    this.errorMsg = null;

    const req: StartWorkflowRequest = {
      workspaceId: this.workflowForm.value.workspaceId,
      userStoryText: this.workflowForm.value.userStoryText || undefined,
      agentName: this.workflowForm.value.agentName || undefined,
      pipelineMode: this.selectedPipelineMode
    };

    if (this.selectedRequirement) {
      req.requirementId = this.selectedRequirement.id;
      req.requirementText = this.selectedRequirement.requirementText;
    } else {
      req.requirementText = this.workflowForm.value.requirementText;
    }

    if (this.inputType === 'file' && this.selectedFileName) {
      req.inputFilePath = this.selectedFileName;
    }

    this.workflowService.startWorkflow(req).subscribe({
      next: (res: any) => { this.result = res; this.submitting = false; },
      error: (err: any) => {
        this.submitting = false;
        if (err.status === 0) {
          this.errorMsg = 'Cannot connect to backend. Ensure it is running on port 8080.';
        } else {
          this.errorMsg = err.error?.error || err.error?.message || 'Failed to start workflow.';
        }
      }
    });
  }

  goToStatus() {
    if (this.result?.workspaceId) {
      this.router.navigate(['/workspaces', this.result.workspaceId]);
    } else {
      this.router.navigate(['/workspaces']);
    }
  }

  getAgentDisplayName(agentName: string): string {
    const agent = this.pipelineAgents.find(a => a.name === agentName);
    return agent ? agent.label : agentName;
  }

  onReset() {
    this.workflowForm.reset();
    this.result = null;
    this.errorMsg = null;
    this.inputType = 'text';
    this.selectedFileName = '';
    this.showPreview = false;
    this.showAdvanced = false;
    this.step = 1;
    this.existingRequirements = [];
    this.selectedRequirement = null;
    this.addingNew = false;
  }
}
