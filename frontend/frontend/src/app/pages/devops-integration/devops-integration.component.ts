import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DevOpsService, DevOpsConnection, WorkItem,
  Repo, Branch, PushFile, CreateWorkItemRequest, BatchCreateWorkItemsRequest
} from '../../services/devops.service';
import { SystemService, UserStory } from '../../services/system.service';
import { WorkflowService } from '../../services/workflow.service';
import { WorkspaceService, Workspace } from '../../services/workspace.service';
import { RequirementService } from '../../services/requirement.service';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

@Component({
  selector: 'app-devops-integration',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownPipe],
  template: `
    <div class="devops-page">
      <!-- Page Header -->
      <div class="page-header">
        <h1><i class="fab fa-microsoft"></i> Azure DevOps Integration</h1>
        <p class="page-subtitle">Pull work items from Boards & push generated code to your repository</p>
      </div>

      <!-- Connection Card -->
      <div class="connection-card data-card" [class.connected]="isConnected">
        <div class="conn-header">
          <div class="conn-icon" [class.active]="isConnected">
            <i class="fas" [ngClass]="isConnected ? 'fa-plug-circle-check' : 'fa-plug'"></i>
          </div>
          <div class="conn-title">
            <h3>{{ isConnected ? 'Connected to Azure DevOps' : 'Connect to Azure DevOps' }}</h3>
            <p *ngIf="isConnected" class="conn-info">
              <i class="fas fa-building"></i> {{ connection.organization }} /
              <i class="fas fa-project-diagram"></i> {{ connection.project }}
            </p>
          </div>
          <button *ngIf="isConnected" class="disconnect-btn" (click)="disconnect()">
            <i class="fas fa-unlink"></i> Disconnect
          </button>
        </div>

        <div class="conn-form" *ngIf="!isConnected">
          <div class="conn-fields">
            <div class="input-group">
              <label><i class="fas fa-building"></i> Organization</label>
              <input type="text" [(ngModel)]="connection.organization"
                     placeholder="e.g., NextSTEP2" autocomplete="off">
            </div>
            <div class="input-group">
              <label><i class="fas fa-project-diagram"></i> Project</label>
              <input type="text" [(ngModel)]="connection.project"
                     placeholder="e.g., AxiomDSF" autocomplete="off">
            </div>
            <div class="input-group">
              <label><i class="fas fa-key"></i> Personal Access Token (PAT)</label>
              <div class="pat-wrapper">
                <input [type]="showPat ? 'text' : 'password'" [(ngModel)]="connection.pat"
                       placeholder="Enter your Azure DevOps PAT" autocomplete="off">
                <button class="eye-btn" (click)="showPat = !showPat">
                  <i class="fas" [ngClass]="showPat ? 'fa-eye-slash' : 'fa-eye'"></i>
                </button>
              </div>
              <span class="hint">
                <i class="fas fa-info-circle"></i>
                Create a PAT at dev.azure.com with <strong>Code (Read & Write)</strong> and <strong>Work Items (Read)</strong> scopes
              </span>
            </div>
          </div>
          <button class="connect-btn" (click)="testConnection()"
                  [disabled]="connecting || !connection.organization || !connection.project || !connection.pat">
            <i class="fas" [ngClass]="connecting ? 'fa-spinner fa-spin' : 'fa-plug'"></i>
            {{ connecting ? 'Connecting...' : 'Connect' }}
          </button>
          <div class="conn-error" *ngIf="connectionError">
            <i class="fas fa-exclamation-triangle"></i> {{ connectionError }}
          </div>
        </div>
      </div>

      <!-- Tabs (only when connected) -->
      <div *ngIf="isConnected">
        <div class="tab-nav">
          <button class="tab-btn" [class.active]="activeTab === 'pull'"
                  (click)="activeTab = 'pull'">
            <i class="fas fa-download"></i> Pull from Boards
          </button>
          <button class="tab-btn" [class.active]="activeTab === 'push'"
                  (click)="activeTab = 'push'; loadRepos()">
            <i class="fas fa-upload"></i> Push Code
          </button>
          <button class="tab-btn" [class.active]="activeTab === 'stories'"
                  (click)="activeTab = 'stories'">
            <i class="fas fa-book-open"></i> Push User Stories
          </button>
        </div>

        <!-- ═══════════ PULL TAB ═══════════ -->
        <div *ngIf="activeTab === 'pull'" class="tab-content">
          <!-- Filters -->
          <div class="filter-bar data-card">
            <div class="filter-row">
              <div class="filter-group">
                <label><i class="fas fa-filter"></i> Work Item Type</label>
                <select [(ngModel)]="pullFilter.workItemType" (change)="fetchWorkItems()">
                  <option value="All">All Types</option>
                  <option value="User Story">User Story</option>
                  <option value="Task">Task</option>
                  <option value="Feature">Feature</option>
                  <option value="Bug">Bug</option>
                  <option value="Epic">Epic</option>
                </select>
              </div>
              <div class="filter-group">
                <label><i class="fas fa-flag"></i> State</label>
                <select [(ngModel)]="pullFilter.state" (change)="fetchWorkItems()">
                  <option value="All">All States</option>
                  <option value="New">New</option>
                  <option value="Active">Active</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
              <div class="filter-group">
                <label><i class="fas fa-sort-numeric-down"></i> Max Results</label>
                <select [(ngModel)]="pullFilter.top" (change)="fetchWorkItems()">
                  <option [ngValue]="10">10</option>
                  <option [ngValue]="25">25</option>
                  <option [ngValue]="50">50</option>
                  <option [ngValue]="100">100</option>
                </select>
              </div>
              <button class="refresh-btn" (click)="fetchWorkItems()" [disabled]="loadingWorkItems">
                <i class="fas fa-sync-alt" [class.fa-spin]="loadingWorkItems"></i> Refresh
              </button>
            </div>
          </div>

          <!-- Loading State -->
          <div *ngIf="loadingWorkItems" class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Fetching work items from Azure DevOps...</p>
          </div>

          <!-- Empty State -->
          <div *ngIf="!loadingWorkItems && workItems.length === 0" class="empty-state data-card">
            <i class="fas fa-inbox"></i>
            <p *ngIf="!pullError">No work items found. Try changing the filters above.</p>
            <p *ngIf="pullError" style="color: #ef4444;">
              <i class="fas fa-exclamation-triangle"></i> Error: {{ pullError }}
            </p>
          </div>

          <!-- Work Items Grid -->
          <div class="work-items-grid" *ngIf="!loadingWorkItems && workItems.length > 0">
            <div class="wi-card data-card" *ngFor="let wi of workItems"
                 [class.selected]="selectedWorkItem?.id === wi.id"
                 (click)="selectWorkItem(wi)">
              <div class="wi-top">
                <span class="wi-type" [class]="'type-' + getTypeClass(wi)">
                  {{ getTypeIcon(wi) }} {{ wi.fields['System.WorkItemType'] }}
                </span>
                <span class="wi-id">#{{ wi.id }}</span>
              </div>
              <h4 class="wi-title">{{ wi.fields['System.Title'] }}</h4>
              <div class="wi-meta">
                <span class="wi-state" [class]="'state-' + getStateClass(wi)">
                  <i class="fas fa-circle"></i> {{ wi.fields['System.State'] }}
                </span>
                <span class="wi-priority" *ngIf="wi.fields['Microsoft.VSTS.Common.Priority']">
                  P{{ wi.fields['Microsoft.VSTS.Common.Priority'] }}
                </span>
                <span class="wi-assigned" *ngIf="wi.fields['System.AssignedTo']?.displayName">
                  <i class="fas fa-user"></i> {{ wi.fields['System.AssignedTo']?.displayName }}
                </span>
              </div>
              <div class="wi-tags" *ngIf="wi.fields['System.Tags']">
                <span class="wi-tag" *ngFor="let tag of splitTags(wi)">{{ tag }}</span>
              </div>
            </div>
          </div>

          <!-- Selected Work Item Detail + Import -->
          <div class="wi-detail-panel data-card" *ngIf="selectedWorkItem">
            <div class="detail-header">
              <h3>
                <span class="wi-type-badge" [class]="'type-' + getTypeClass(selectedWorkItem)">
                  {{ selectedWorkItem.fields['System.WorkItemType'] }}
                </span>
                #{{ selectedWorkItem.id }} — {{ selectedWorkItem.fields['System.Title'] }}
              </h3>
              <button class="close-detail" (click)="selectedWorkItem = null">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="detail-body">
              <div class="detail-section" *ngIf="selectedWorkItem.fields['System.Description']">
                <h4><i class="fas fa-align-left"></i> Description</h4>
                <div class="detail-html" [innerHTML]="selectedWorkItem.fields['System.Description']"></div>
              </div>
              <div class="detail-section" *ngIf="selectedWorkItem.fields['Microsoft.VSTS.Common.AcceptanceCriteria']">
                <h4><i class="fas fa-check-double"></i> Acceptance Criteria</h4>
                <div class="detail-html" [innerHTML]="selectedWorkItem.fields['Microsoft.VSTS.Common.AcceptanceCriteria']"></div>
              </div>
              <div class="detail-section">
                <h4><i class="fas fa-info-circle"></i> Details</h4>
                <div class="detail-grid">
                  <div><strong>State:</strong> {{ selectedWorkItem.fields['System.State'] }}</div>
                  <div><strong>Priority:</strong> {{ selectedWorkItem.fields['Microsoft.VSTS.Common.Priority'] || 'N/A' }}</div>
                  <div><strong>Area:</strong> {{ selectedWorkItem.fields['System.AreaPath'] || 'N/A' }}</div>
                  <div><strong>Created:</strong> {{ selectedWorkItem.fields['System.CreatedDate'] | date:'medium' }}</div>
                </div>
              </div>
            </div>
            <div class="detail-actions">
              <h4><i class="fas fa-file-import"></i> Use as Requirement</h4>
              <p class="import-hint">Import this work item's description as a requirement in an AxiomDSF workspace.</p>
              <div class="import-row">
                <select [(ngModel)]="importWorkspaceId">
                  <option [ngValue]="null">Select Workspace...</option>
                  <option *ngFor="let ws of workspaces" [ngValue]="ws.id">{{ ws.projectName }} (#{{ ws.id }})</option>
                </select>
                <button class="import-btn" (click)="importAsRequirement()"
                        [disabled]="importing || !importWorkspaceId">
                  <i class="fas" [ngClass]="importing ? 'fa-spinner fa-spin' : 'fa-file-import'"></i>
                  {{ importing ? 'Importing...' : 'Import to Workspace' }}
                </button>
              </div>
              <div class="import-success" *ngIf="importSuccess">
                <i class="fas fa-check-circle"></i> {{ importSuccess }}
              </div>
            </div>
          </div>
        </div>

        <!-- ═══════════ PUSH USER STORIES TAB ═══════════ -->
        <div *ngIf="activeTab === 'stories'" class="tab-content">
          <div class="push-section data-card">
            <h3><i class="fas fa-book-open"></i> Push User Stories to Azure DevOps</h3>
            <p class="push-hint">Push AI-generated user stories from the User Story agent to Azure DevOps Boards.</p>

            <!-- Step 1: Select Workspace -->
            <div class="push-step">
              <div class="step-label"><span class="step-num">1</span> Select Workspace</div>
              <select [(ngModel)]="storyPushConfig.workspaceId" (change)="onStoryWorkspaceChange()">
                <option [ngValue]="null">Select Workspace...</option>
                <option *ngFor="let ws of workspaces" [ngValue]="ws.id">{{ ws.projectName }} (#{{ ws.id }})</option>
              </select>
            </div>

            <!-- Loading -->
            <div *ngIf="loadingStories" class="inline-loading">
              <i class="fas fa-spinner fa-spin"></i> Loading user stories...
            </div>

            <!-- Step 2: Review User Stories -->
            <div class="push-step" *ngIf="storyPushConfig.workspaceId && userStories.length > 0 && !loadingStories">
              <div class="step-label"><span class="step-num">2</span> Select User Stories ({{ userStories.length }} found)</div>
              <div class="files-preview">
                <div class="file-item" *ngFor="let s of userStories; let i = index">
                  <input type="checkbox" [(ngModel)]="s.selected" [id]="'story-'+i">
                  <label [for]="'story-'+i">
                    <i class="fas fa-book"></i>
                    <span class="file-path">{{ s.storyId }} — {{ s.title }}</span>
                    <span class="file-size">{{ s.priority }}</span>
                  </label>
                </div>
              </div>
              <div class="push-actions">
                <button class="select-all-btn" (click)="toggleAllStories(true)">
                  <i class="fas fa-check-double"></i> Select All
                </button>
                <button class="select-all-btn" (click)="toggleAllStories(false)">
                  <i class="fas fa-times"></i> Deselect All
                </button>
              </div>
            </div>

            <!-- No stories -->
            <div class="push-step" *ngIf="storyPushConfig.workspaceId && userStories.length === 0 && !loadingStories">
              <div class="no-code-msg">
                <i class="fas fa-exclamation-circle"></i> No user stories found for this workspace.
                Run the User Story agent first.
              </div>
            </div>

            <!-- Step 3: Configure -->
            <div class="push-step" *ngIf="getSelectedStories().length > 0">
              <div class="step-label"><span class="step-num">3</span> Configure Push</div>
              <div class="branch-config">
                <div class="input-group">
                  <label>Work Item Type in Azure DevOps</label>
                  <select [(ngModel)]="storyPushConfig.workItemType">
                    <option value="User Story">User Story</option>
                    <option value="Feature">Feature</option>
                    <option value="Task">Task</option>
                  </select>
                </div>
                <div class="input-group">
                  <label>Tags (optional, semicolon-separated)</label>
                  <input type="text" [(ngModel)]="storyPushConfig.tags"
                         placeholder="e.g., AxiomDSF;AI-Generated">
                </div>
              </div>
            </div>

            <!-- Push Button -->
            <div class="push-final" *ngIf="getSelectedStories().length > 0">
              <button class="push-btn" (click)="pushStoriesToDevOps()"
                      [disabled]="pushingStories">
                <i class="fas" [ngClass]="pushingStories ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'"></i>
                {{ pushingStories ? 'Pushing...' : 'Push ' + getSelectedStories().length + ' user stories to Azure DevOps' }}
              </button>
              <div class="push-success" *ngIf="storyPushSuccess">
                <i class="fas fa-check-circle"></i> {{ storyPushSuccess }}
              </div>
              <div class="push-error" *ngIf="storyPushError">
                <i class="fas fa-exclamation-triangle"></i> {{ storyPushError }}
              </div>
            </div>
          </div>
        </div>

        <!-- ═══════════ PUSH TAB ═══════════ -->
        <div *ngIf="activeTab === 'push'" class="tab-content">
          <div class="push-section data-card">
            <h3><i class="fas fa-code-branch"></i> Push Generated Code to Azure DevOps</h3>
            <p class="push-hint">Select a workspace's generated code to push to an Azure DevOps repository.</p>

            <!-- Step 1: Select Workspace -->
            <div class="push-step">
              <div class="step-label"><span class="step-num">1</span> Select Workspace</div>
              <select [(ngModel)]="pushConfig.workspaceId" (change)="onPushWorkspaceChange()">
                <option [ngValue]="null">Select Workspace...</option>
                <option *ngFor="let ws of workspaces" [ngValue]="ws.id">{{ ws.projectName }} (#{{ ws.id }})</option>
              </select>
            </div>

            <!-- Step 2: Select Repository -->
            <div class="push-step" *ngIf="pushConfig.workspaceId">
              <div class="step-label"><span class="step-num">2</span> Target Repository</div>
              <div *ngIf="loadingRepos" class="inline-loading">
                <i class="fas fa-spinner fa-spin"></i> Loading repos...
              </div>
              <select *ngIf="!loadingRepos" [(ngModel)]="pushConfig.repositoryId" (change)="onRepoChange()">
                <option value="">Select Repository...</option>
                <option *ngFor="let repo of repos" [value]="repo.id">{{ repo.name }}</option>
              </select>
            </div>

            <!-- Step 3: Branch Config -->
            <div class="push-step" *ngIf="pushConfig.repositoryId">
              <div class="step-label"><span class="step-num">3</span> Branch Configuration</div>
              <div class="branch-config">
                <div class="input-group">
                  <label>Source Branch (base)</label>
                  <select [(ngModel)]="pushConfig.sourceBranch">
                    <option value="main">main</option>
                    <option *ngFor="let b of branches" [value]="getBranchShortName(b)">
                      {{ getBranchShortName(b) }}
                    </option>
                  </select>
                </div>
                <div class="input-group">
                  <label>New Branch Name</label>
                  <input type="text" [(ngModel)]="pushConfig.branchName"
                         placeholder="e.g., feature/axiomdsf-generated-code">
                </div>
                <div class="input-group">
                  <label>Commit Message</label>
                  <input type="text" [(ngModel)]="pushConfig.commitMessage"
                         placeholder="Code generated by AxiomDSF AI Pipeline">
                </div>
              </div>
            </div>

            <!-- Step 4: Files Preview -->
            <div class="push-step" *ngIf="pushConfig.branchName && codeFiles.length > 0">
              <div class="step-label"><span class="step-num">4</span> Files to Push ({{ codeFiles.length }})</div>
              <div class="files-preview">
                <div class="file-item" *ngFor="let f of codeFiles; let i = index">
                  <input type="checkbox" [(ngModel)]="f.selected" [id]="'file-'+i">
                  <label [for]="'file-'+i">
                    <i class="fas fa-file-code"></i>
                    <span class="file-path">{{ f.path }}</span>
                    <span class="file-size">{{ f.content.length }} chars</span>
                  </label>
                </div>
              </div>
              <div class="push-actions">
                <button class="select-all-btn" (click)="toggleAllFiles(true)">
                  <i class="fas fa-check-double"></i> Select All
                </button>
                <button class="select-all-btn" (click)="toggleAllFiles(false)">
                  <i class="fas fa-times"></i> Deselect All
                </button>
              </div>
            </div>

            <div class="push-step" *ngIf="pushConfig.branchName && codeFiles.length === 0 && !loadingCode">
              <div class="no-code-msg">
                <i class="fas fa-exclamation-circle"></i> No generated code found for this workspace.
                Run the Coding agent first.
              </div>
            </div>

            <!-- Push Button -->
            <div class="push-final" *ngIf="pushConfig.branchName && getSelectedFiles().length > 0">
              <button class="push-btn" (click)="pushToDevOps()"
                      [disabled]="pushing || getSelectedFiles().length === 0">
                <i class="fas" [ngClass]="pushing ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt'"></i>
                {{ pushing ? 'Pushing...' : 'Push ' + getSelectedFiles().length + ' files to Azure DevOps' }}
              </button>
              <div class="push-success" *ngIf="pushSuccess">
                <i class="fas fa-check-circle"></i> {{ pushSuccess }}
              </div>
              <div class="push-error" *ngIf="pushError">
                <i class="fas fa-exclamation-triangle"></i> {{ pushError }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .devops-page { animation: fadeIn 0.3s ease; }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .page-header { margin-bottom: 24px; }
    .page-header h1 {
      font-size: 1.6em; font-weight: 700; color: var(--dark-green, #2E673A);
      margin: 0 0 6px;
    }
    .page-header h1 i { margin-right: 10px; color: #0078D4; }
    .page-subtitle { color: #64748b; font-size: 0.9em; margin: 0; }

    /* Connection Card */
    .connection-card {
      background: white; border-radius: 14px; padding: 24px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.06);
      margin-bottom: 24px; border: 2px solid #e5e7eb;
      transition: border-color 0.3s;
    }
    .connection-card.connected { border-color: #22c55e; }
    .conn-header {
      display: flex; align-items: center; gap: 16px; margin-bottom: 8px;
    }
    .conn-icon {
      width: 48px; height: 48px; border-radius: 14px;
      background: #f1f5f9; display: flex; align-items: center; justify-content: center;
      font-size: 1.4em; color: #94a3b8; transition: all 0.3s;
    }
    .conn-icon.active { background: #dcfce7; color: #22c55e; }
    .conn-title h3 { margin: 0; font-size: 1.1em; }
    .conn-info { margin: 4px 0 0; font-size: 0.82em; color: #64748b; }
    .conn-info i { margin: 0 4px; }
    .disconnect-btn {
      margin-left: auto; padding: 8px 16px; border: 1px solid #ef4444;
      color: #ef4444; background: white; border-radius: 8px;
      cursor: pointer; font-size: 0.85em; font-weight: 500;
      transition: all 0.2s; font-family: 'Poppins', sans-serif;
    }
    .disconnect-btn:hover { background: #fef2f2; }

    .conn-form { margin-top: 16px; }
    .conn-fields {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
      margin-bottom: 16px;
    }
    .conn-fields .input-group:last-child { grid-column: 1 / -1; }
    .input-group label {
      display: block; font-size: 0.82em; font-weight: 600; color: #555;
      margin-bottom: 6px;
    }
    .input-group label i { margin-right: 6px; color: var(--primary-green, #3A7D44); }
    .input-group input, .input-group select, .input-group textarea {
      width: 100%; padding: 10px 14px; border: 1px solid #e0e0e0;
      border-radius: 8px; font-size: 0.9em; font-family: 'Poppins', sans-serif;
      transition: border-color 0.2s; box-sizing: border-box;
    }
    .input-group input:focus, .input-group select:focus {
      outline: none; border-color: var(--primary-green, #3A7D44);
      box-shadow: 0 0 0 3px rgba(58,125,68,0.1);
    }
    .pat-wrapper { position: relative; }
    .pat-wrapper input { padding-right: 40px; }
    .eye-btn {
      position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
      background: none; border: none; color: #94a3b8; cursor: pointer;
      padding: 4px; font-size: 0.9em;
    }
    .hint {
      display: block; margin-top: 6px; font-size: 0.75em; color: #94a3b8;
    }
    .hint i { margin-right: 4px; }

    .connect-btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 12px 24px; background: linear-gradient(135deg, #0078D4, #005A9E);
      color: white; border: none; border-radius: 8px; font-size: 0.95em;
      font-weight: 600; cursor: pointer; font-family: 'Poppins', sans-serif;
      transition: all 0.2s;
    }
    .connect-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,120,212,0.3); }
    .connect-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .conn-error {
      margin-top: 12px; padding: 10px 14px; background: #fef2f2;
      border: 1px solid #fecaca; border-radius: 8px;
      color: #dc2626; font-size: 0.85em;
    }
    .conn-error i { margin-right: 6px; }

    /* Tabs */
    .tab-nav {
      display: flex; gap: 4px; margin-bottom: 20px;
      background: #f1f5f9; padding: 4px; border-radius: 12px;
    }
    .tab-btn {
      flex: 1; padding: 12px 16px; border: none; background: transparent;
      border-radius: 10px; font-weight: 600; font-size: 0.9em;
      cursor: pointer; font-family: 'Poppins', sans-serif;
      color: #64748b; transition: all 0.2s;
      display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .tab-btn.active {
      background: white; color: var(--primary-green, #3A7D44);
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .tab-btn:hover:not(.active) { color: var(--primary-green, #3A7D44); }

    /* Filter Bar */
    .filter-bar { padding: 16px; margin-bottom: 20px; }
    .filter-row {
      display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap;
    }
    .filter-group { display: flex; flex-direction: column; gap: 4px; }
    .filter-group label {
      font-size: 0.78em; font-weight: 600; color: #64748b;
    }
    .filter-group label i { margin-right: 4px; }
    .filter-group select {
      padding: 8px 12px; border: 1px solid #e0e0e0; border-radius: 8px;
      font-size: 0.88em; font-family: 'Poppins', sans-serif;
      cursor: pointer; min-width: 140px; box-sizing: border-box;
    }
    .filter-group select:focus {
      outline: none; border-color: var(--primary-green, #3A7D44);
    }
    .refresh-btn {
      padding: 8px 16px; border: 1px solid var(--primary-green, #3A7D44);
      color: var(--primary-green, #3A7D44); background: white;
      border-radius: 8px; cursor: pointer; font-size: 0.85em;
      font-family: 'Poppins', sans-serif; font-weight: 500;
      display: flex; align-items: center; gap: 6px; transition: all 0.2s;
    }
    .refresh-btn:hover:not(:disabled) {
      background: var(--primary-green, #3A7D44); color: white;
    }
    .refresh-btn:disabled { opacity: 0.5; }

    /* States */
    .loading-state, .empty-state {
      text-align: center; padding: 48px 24px; color: #94a3b8;
    }
    .loading-state i, .empty-state i { font-size: 2em; margin-bottom: 12px; display: block; }

    /* Work Items Grid */
    .work-items-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 16px; margin-bottom: 20px;
    }
    .wi-card {
      padding: 16px; cursor: pointer; transition: all 0.2s;
      border: 2px solid transparent; border-radius: 12px;
    }
    .wi-card:hover { border-color: #dbeafe; transform: translateY(-2px); }
    .wi-card.selected {
      border-color: var(--primary-green, #3A7D44);
      box-shadow: 0 4px 16px rgba(58,125,68,0.15);
    }
    .wi-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .wi-type {
      font-size: 0.75em; font-weight: 600; padding: 3px 10px;
      border-radius: 20px; display: inline-flex; align-items: center; gap: 4px;
    }
    .type-userstory { background: #dbeafe; color: #2563eb; }
    .type-task { background: #fef3c7; color: #92400e; }
    .type-feature { background: #ede9fe; color: #7c3aed; }
    .type-bug { background: #fecaca; color: #dc2626; }
    .type-epic { background: #ffedd5; color: #c2410c; }
    .wi-id { font-size: 0.8em; color: #94a3b8; font-weight: 500; }
    .wi-title {
      font-size: 0.95em; font-weight: 600; color: #1e293b;
      margin: 0 0 10px; line-height: 1.4;
    }
    .wi-meta {
      display: flex; flex-wrap: wrap; gap: 10px; font-size: 0.78em;
      color: #64748b; align-items: center;
    }
    .wi-state {
      display: inline-flex; align-items: center; gap: 4px;
      font-weight: 500;
    }
    .wi-state i { font-size: 0.5em; }
    .state-new i { color: #94a3b8; }
    .state-active i { color: #2563eb; }
    .state-resolved i { color: #22c55e; }
    .state-closed i { color: #64748b; }
    .wi-priority {
      padding: 1px 8px; background: #f59e0b; color: white;
      border-radius: 8px; font-weight: 600; font-size: 0.85em;
    }
    .wi-assigned i { margin-right: 3px; }
    .wi-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .wi-tag {
      font-size: 0.7em; padding: 2px 8px; background: #f1f5f9;
      border-radius: 12px; color: #475569;
    }

    /* Detail Panel */
    .wi-detail-panel {
      padding: 24px; margin-top: 20px; border: 2px solid var(--primary-green, #3A7D44);
      border-radius: 14px;
    }
    .detail-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 20px;
    }
    .detail-header h3 { margin: 0; font-size: 1.05em; line-height: 1.5; }
    .wi-type-badge {
      display: inline-block; font-size: 0.72em; padding: 2px 10px;
      border-radius: 12px; margin-right: 8px; font-weight: 600;
    }
    .close-detail {
      background: none; border: none; cursor: pointer; color: #94a3b8;
      font-size: 1.1em; padding: 4px;
    }
    .close-detail:hover { color: #ef4444; }
    .detail-section { margin-bottom: 20px; }
    .detail-section h4 {
      font-size: 0.9em; color: var(--primary-green, #3A7D44);
      margin: 0 0 8px;
    }
    .detail-section h4 i { margin-right: 6px; }
    .detail-html {
      font-size: 0.88em; line-height: 1.6; color: #334155;
      max-height: 200px; overflow-y: auto; padding: 12px;
      background: #f8fafc; border-radius: 8px;
    }
    .detail-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
      font-size: 0.88em; color: #475569;
    }
    .detail-actions {
      border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px;
    }
    .detail-actions h4 {
      margin: 0 0 6px; font-size: 0.95em;
      color: var(--primary-green, #3A7D44);
    }
    .detail-actions h4 i { margin-right: 6px; }
    .import-hint { font-size: 0.82em; color: #94a3b8; margin: 0 0 12px; }
    .import-row {
      display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
    }
    .import-row select {
      flex: 1; padding: 10px 14px; border: 1px solid #e0e0e0;
      border-radius: 8px; font-size: 0.9em; min-width: 200px;
      font-family: 'Poppins', sans-serif;
    }
    .import-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 20px; background: var(--primary-green, #3A7D44);
      color: white; border: none; border-radius: 8px;
      font-weight: 600; font-size: 0.9em; cursor: pointer;
      font-family: 'Poppins', sans-serif; transition: all 0.2s;
    }
    .import-btn:hover:not(:disabled) { transform: translateY(-1px); }
    .import-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .import-success {
      margin-top: 12px; padding: 10px 14px; background: #dcfce7;
      border-radius: 8px; color: #166534; font-size: 0.88em;
    }
    .import-success i { margin-right: 6px; }

    /* Push Section */
    .push-section { padding: 24px; }
    .push-section h3 {
      margin: 0 0 6px; font-size: 1.1em; color: var(--dark-green, #2E673A);
    }
    .push-section h3 i { margin-right: 8px; }
    .push-hint { font-size: 0.85em; color: #94a3b8; margin: 0 0 24px; }
    .push-step { margin-bottom: 24px; }
    .step-label {
      display: flex; align-items: center; gap: 10px;
      font-weight: 600; font-size: 0.92em; color: #1e293b;
      margin-bottom: 10px;
    }
    .step-num {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 50%;
      background: var(--primary-green, #3A7D44); color: white;
      font-size: 0.82em; font-weight: 700;
    }
    .push-step select, .push-step input {
      width: 100%; padding: 10px 14px; border: 1px solid #e0e0e0;
      border-radius: 8px; font-size: 0.9em; font-family: 'Poppins', sans-serif;
      box-sizing: border-box;
    }
    .push-step select:focus, .push-step input:focus {
      outline: none; border-color: var(--primary-green, #3A7D44);
      box-shadow: 0 0 0 3px rgba(58,125,68,0.1);
    }
    .inline-loading { font-size: 0.88em; color: #64748b; padding: 8px 0; }
    .inline-loading i { margin-right: 6px; }
    .branch-config {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
    }
    .branch-config .input-group:last-child { grid-column: 1 / -1; }
    .branch-config label {
      display: block; font-size: 0.82em; font-weight: 500;
      color: #555; margin-bottom: 6px;
    }

    /* Files Preview */
    .files-preview {
      max-height: 300px; overflow-y: auto; border: 1px solid #e5e7eb;
      border-radius: 8px; padding: 4px 0;
    }
    .file-item {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 14px; transition: background 0.15s;
    }
    .file-item:hover { background: #f8fafc; }
    .file-item input[type="checkbox"] {
      width: 16px; height: 16px; cursor: pointer;
      accent-color: var(--primary-green, #3A7D44);
    }
    .file-item label {
      display: flex; align-items: center; gap: 8px;
      cursor: pointer; flex: 1; font-size: 0.88em;
    }
    .file-item label i { color: #64748b; }
    .file-path { color: #1e293b; font-family: 'Consolas', 'Courier New', monospace; }
    .file-size { margin-left: auto; color: #94a3b8; font-size: 0.8em; }
    .push-actions {
      display: flex; gap: 8px; margin-top: 10px;
    }
    .select-all-btn {
      padding: 6px 14px; border: 1px solid #e0e0e0; background: white;
      border-radius: 6px; cursor: pointer; font-size: 0.82em;
      font-family: 'Poppins', sans-serif; transition: all 0.2s;
    }
    .select-all-btn:hover { background: #f1f5f9; }
    .select-all-btn i { margin-right: 4px; }

    .no-code-msg {
      padding: 16px; background: #fffbeb; border: 1px solid #fef3c7;
      border-radius: 8px; color: #92400e; font-size: 0.88em;
    }
    .no-code-msg i { margin-right: 6px; }

    .push-final { margin-top: 16px; }
    .push-btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 14px 28px; background: linear-gradient(135deg, #0078D4, #005A9E);
      color: white; border: none; border-radius: 10px; font-size: 1em;
      font-weight: 600; cursor: pointer; font-family: 'Poppins', sans-serif;
      transition: all 0.2s;
    }
    .push-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(0,120,212,0.3); }
    .push-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .push-success {
      margin-top: 12px; padding: 12px 16px; background: #dcfce7;
      border: 1px solid #bbf7d0; border-radius: 8px;
      color: #166534; font-size: 0.9em;
    }
    .push-success i { margin-right: 6px; }
    .push-error {
      margin-top: 12px; padding: 12px 16px; background: #fef2f2;
      border: 1px solid #fecaca; border-radius: 8px;
      color: #dc2626; font-size: 0.9em;
    }
    .push-error i { margin-right: 6px; }

    /* Dark mode */
    :host-context(.dark) .connection-card,
    :host-context(.dark) .wi-card,
    :host-context(.dark) .wi-detail-panel,
    :host-context(.dark) .push-section,
    :host-context(.dark) .filter-bar {
      background: #1e293b; color: #e2e8f0;
      border-color: #334155;
    }
    :host-context(.dark) .wi-title { color: #f1f5f9; }
    :host-context(.dark) .page-header h1 { color: #e2e8f0; }
    :host-context(.dark) .input-group input,
    :host-context(.dark) .input-group select,
    :host-context(.dark) .push-step select,
    :host-context(.dark) .push-step input,
    :host-context(.dark) .import-row select,
    :host-context(.dark) .filter-group select {
      background: #0f172a; color: #e2e8f0;
      border-color: #334155;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .conn-fields { grid-template-columns: 1fr; }
      .work-items-grid { grid-template-columns: 1fr; }
      .branch-config { grid-template-columns: 1fr; }
      .filter-row { flex-direction: column; }
      .import-row { flex-direction: column; }
    }

    .data-card {
      background: white; border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }

    /* Dark mode */
    :host-context(body.dark-mode) .data-card,
    :host-context(body.dark-mode) .config-card,
    :host-context(body.dark-mode) .connection-card,
    :host-context(body.dark-mode) .import-card {
      background: #16213e !important; color: #e0e0e0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border-color: #2a2a4a !important;
    }
    :host-context(body.dark-mode) h2, :host-context(body.dark-mode) h3 { color: #86efac; }
    :host-context(body.dark-mode) input,
    :host-context(body.dark-mode) select,
    :host-context(body.dark-mode) textarea {
      background: #1e293b !important; color: #e0e0e0 !important;
      border-color: #374151 !important;
    }
    :host-context(body.dark-mode) label { color: #d1d5db; }
    :host-context(body.dark-mode) .filter-row { color: #9ca3af; }
    :host-context(body.dark-mode) table th { background: #1e293b !important; color: #86efac !important; }
    :host-context(body.dark-mode) table td { color: #d1d5db; border-color: #2a2a4a !important; }
    :host-context(body.dark-mode) table tr:hover { background: #1e293b !important; }
  `]
})
export class DevOpsIntegrationComponent implements OnInit {

  // Connection
  connection: DevOpsConnection = {
    organization: 'NextSTEP2',
    project: 'AxiomDSF',
    pat: ''
  };
  showPat = false;
  isConnected = false;
  connecting = false;
  connectionError = '';

  // Tabs
  activeTab: 'pull' | 'push' | 'stories' = 'pull';

  // Pull
  pullFilter = {
    workItemType: 'All',
    state: 'All',
    top: 50
  };
  workItems: WorkItem[] = [];
  loadingWorkItems = false;
  selectedWorkItem: WorkItem | null = null;
  pullError = '';

  // Import
  workspaces: Workspace[] = [];
  importWorkspaceId: number | null = null;
  importing = false;
  importSuccess = '';

  // Push
  repos: Repo[] = [];
  branches: Branch[] = [];
  loadingRepos = false;
  loadingCode = false;
  pushing = false;
  pushSuccess = '';
  pushError = '';
  pushConfig = {
    workspaceId: null as number | null,
    repositoryId: '',
    sourceBranch: 'main',
    branchName: '',
    commitMessage: 'Code generated by AxiomDSF AI Pipeline'
  };
  codeFiles: { path: string; content: string; selected: boolean }[] = [];

  // Push User Stories
  userStories: (UserStory & { selected: boolean })[] = [];
  loadingStories = false;
  pushingStories = false;
  storyPushSuccess = '';
  storyPushError = '';
  storyPushConfig = {
    workspaceId: null as number | null,
    workItemType: 'User Story',
    tags: 'AxiomDSF;AI-Generated'
  };

  constructor(
    private devOpsService: DevOpsService,
    private workflowService: WorkflowService,
    private workspaceService: WorkspaceService,
    private requirementService: RequirementService,
    private systemService: SystemService
  ) {}

  ngOnInit() {
    this.loadWorkspaces();
    // Restore saved connection (minus PAT)
    const saved = localStorage.getItem('axiomdsf_devops_conn');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.connection.organization = parsed.organization || this.connection.organization;
        this.connection.project = parsed.project || this.connection.project;
      } catch {}
    }
  }

  loadWorkspaces() {
    this.workspaceService.listWorkspaces().subscribe({
      next: ws => this.workspaces = ws,
      error: () => {}
    });
  }

  // ─── Connection ───

  testConnection() {
    this.connecting = true;
    this.connectionError = '';
    this.devOpsService.testConnection(this.connection).subscribe({
      next: (res) => {
        this.connecting = false;
        if (res.connected) {
          this.isConnected = true;
          localStorage.setItem('axiomdsf_devops_conn', JSON.stringify({
            organization: this.connection.organization,
            project: this.connection.project
          }));
          this.fetchWorkItems();
        } else {
          this.connectionError = res.error || 'Connection failed. Check your PAT and project details.';
        }
      },
      error: (err) => {
        this.connecting = false;
        this.connectionError = err.error?.error || 'Connection failed. Check your PAT and project details.';
      }
    });
  }

  disconnect() {
    this.isConnected = false;
    this.connection.pat = '';
    this.workItems = [];
    this.selectedWorkItem = null;
    this.repos = [];
    this.branches = [];
    this.codeFiles = [];
  }

  // ─── Pull (Work Items) ───

  fetchWorkItems() {
    this.loadingWorkItems = true;
    this.selectedWorkItem = null;
    this.importSuccess = '';
    this.pullError = '';
    this.devOpsService.getWorkItems(
      this.connection,
      this.pullFilter.workItemType,
      this.pullFilter.state,
      this.pullFilter.top
    ).subscribe({
      next: (res) => {
        this.loadingWorkItems = false;
        const items = (res as any).value || [];
        this.workItems = items;
        if ((res as any).error) {
          this.pullError = (res as any).error;
        } else if (items.length === 0) {
          this.pullError = '';
        }
      },
      error: (err) => {
        this.loadingWorkItems = false;
        this.workItems = [];
        this.pullError = err.error?.error || err.error?.message || err.message || 'Failed to fetch work items. Check your PAT permissions.';
        console.error('Azure DevOps fetch error:', err);
      }
    });
  }

  selectWorkItem(wi: WorkItem) {
    this.selectedWorkItem = this.selectedWorkItem?.id === wi.id ? null : wi;
    this.importSuccess = '';
  }

  getTypeClass(wi: WorkItem): string {
    const t = (wi.fields['System.WorkItemType'] || '').toLowerCase().replace(/\s/g, '');
    if (t.includes('userstory')) return 'userstory';
    if (t.includes('task')) return 'task';
    if (t.includes('feature')) return 'feature';
    if (t.includes('bug')) return 'bug';
    if (t.includes('epic')) return 'epic';
    return 'task';
  }

  getTypeIcon(wi: WorkItem): string {
    const t = this.getTypeClass(wi);
    const icons: Record<string, string> = {
      userstory: '📖', task: '✅', feature: '🌟', bug: '🐛', epic: '🏔️'
    };
    return icons[t] || '📋';
  }

  getStateClass(wi: WorkItem): string {
    return (wi.fields['System.State'] || '').toLowerCase().replace(/\s/g, '');
  }

  splitTags(wi: WorkItem): string[] {
    const tags = wi.fields['System.Tags'] || '';
    return tags.split(';').map(t => t.trim()).filter(t => t);
  }

  // ─── Import as Requirement ───

  importAsRequirement() {
    if (!this.selectedWorkItem || !this.importWorkspaceId) return;
    this.importing = true;
    this.importSuccess = '';

    // Build requirement text from work item
    const wi = this.selectedWorkItem;
    let reqText = `# ${wi.fields['System.WorkItemType']} #${wi.id}: ${wi.fields['System.Title']}\n\n`;

    if (wi.fields['System.Description']) {
      // Strip HTML tags for plain text
      reqText += `## Description\n${this.stripHtml(wi.fields['System.Description'])}\n\n`;
    }
    if (wi.fields['Microsoft.VSTS.Common.AcceptanceCriteria']) {
      reqText += `## Acceptance Criteria\n${this.stripHtml(wi.fields['Microsoft.VSTS.Common.AcceptanceCriteria'])}\n\n`;
    }
    reqText += `## Metadata\n- State: ${wi.fields['System.State']}\n- Priority: ${wi.fields['Microsoft.VSTS.Common.Priority'] || 'N/A'}\n`;
    if (wi.fields['System.Tags']) {
      reqText += `- Tags: ${wi.fields['System.Tags']}\n`;
    }

    this.requirementService.create(this.importWorkspaceId, reqText).subscribe({
      next: (req) => {
        this.importing = false;
        this.importSuccess = `Requirement #${req.id} created in workspace #${this.importWorkspaceId}. Ready to start a workflow!`;
      },
      error: () => {
        this.importing = false;
        this.importSuccess = '';
      }
    });
  }

  private stripHtml(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  // ─── Push (Git) ───

  loadRepos() {
    if (this.repos.length > 0 || !this.isConnected) return;
    this.loadingRepos = true;
    this.devOpsService.listRepos(this.connection).subscribe({
      next: (res) => {
        this.loadingRepos = false;
        this.repos = (res as any).value || [];
      },
      error: () => { this.loadingRepos = false; }
    });
  }

  onRepoChange() {
    this.branches = [];
    this.pushConfig.sourceBranch = 'main';
    if (!this.pushConfig.repositoryId) return;

    this.devOpsService.listBranches(this.connection, this.pushConfig.repositoryId).subscribe({
      next: (res) => {
        this.branches = (res as any).value || [];
        // Auto-select default branch
        const mainBranch = this.branches.find(b => b.name.includes('main') || b.name.includes('master'));
        if (mainBranch) {
          this.pushConfig.sourceBranch = this.getBranchShortName(mainBranch);
        }
      },
      error: () => {}
    });
  }

  getBranchShortName(b: Branch): string {
    return b.name.replace('refs/heads/', '');
  }

  onPushWorkspaceChange() {
    this.codeFiles = [];
    this.pushSuccess = '';
    this.pushError = '';
    if (!this.pushConfig.workspaceId) return;

    // Auto-set branch name
    const ws = this.workspaces.find(w => w.id === this.pushConfig.workspaceId);
    if (ws) {
      const sanitized = ws.projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      this.pushConfig.branchName = `feature/axiomdsf-${sanitized}`;
    }

    this.loadCodeFiles();
  }

  loadCodeFiles() {
    if (!this.pushConfig.workspaceId) return;
    this.loadingCode = true;
    this.codeFiles = [];

    // Load code output from the latest workflow for this workspace
    // First get all workflows for this workspace
    this.workflowService.getAllWorkflows().subscribe({
      next: (workflows) => {
        const wsWorkflows = workflows.filter(
          w => w.workspaceId === this.pushConfig.workspaceId && w.sequenceNumber === 8
        );

        if (wsWorkflows.length === 0) {
          this.loadingCode = false;
          return;
        }

        // Get code output for the first coding workflow found
        const codingWf = wsWorkflows[0];
        this.workflowService.getAgentOutput(
          8, codingWf.workspaceId, codingWf.requirementId!, codingWf.userStoryId
        ).subscribe({
          next: (res) => {
            this.loadingCode = false;
            this.parseCodeFiles(res.content || '');
          },
          error: () => { this.loadingCode = false; }
        });
      },
      error: () => { this.loadingCode = false; }
    });
  }

  parseCodeFiles(codeOutput: string) {
    if (!codeOutput) return;
    this.codeFiles = [];

    // Strategy 1: ### FILE: path/file.ext patterns
    const fileHeaderPattern = /### FILE:\s*(.+?)\s*\n```(\w*)\s*\n([\s\S]*?)```/g;
    let match;
    let found = false;

    while ((match = fileHeaderPattern.exec(codeOutput)) !== null) {
      found = true;
      this.codeFiles.push({
        path: match[1].trim(),
        content: match[3].trim(),
        selected: true
      });
    }

    // Strategy 2: ```lang\n// file: path\n... patterns
    if (!found) {
      const codeBlockPattern = /```(\w*)\s*\n([\s\S]*?)```/g;
      let blockIndex = 0;
      while ((match = codeBlockPattern.exec(codeOutput)) !== null) {
        blockIndex++;
        const lang = match[1] || 'txt';
        const block = match[2];
        const lines = block.split('\n');

        let fileName: string | null = null;
        let content = block;

        for (let i = 0; i < Math.min(3, lines.length); i++) {
          const fm = lines[i].match(/(?:\/\/|#|--|\/\*)\s*(?:file(?:name)?|path)\s*:\s*(.+)/i);
          if (fm) {
            fileName = fm[1].trim().replace(/\*\//, '').trim();
            content = lines.slice(i + 1).join('\n');
            break;
          }
        }

        if (!fileName) {
          const ext: Record<string, string> = {
            java: '.java', ts: '.ts', html: '.html', css: '.css',
            python: '.py', py: '.py', js: '.js', xml: '.xml', yaml: '.yaml',
            json: '.json', sql: '.sql', txt: '.txt'
          };
          fileName = `code-snippet-${blockIndex}${ext[lang] || '.txt'}`;
        }

        this.codeFiles.push({ path: fileName, content: content.trim(), selected: true });
      }
    }
  }

  getSelectedFiles(): { path: string; content: string }[] {
    return this.codeFiles.filter(f => f.selected).map(f => ({ path: f.path, content: f.content }));
  }

  toggleAllFiles(selected: boolean) {
    this.codeFiles.forEach(f => f.selected = selected);
  }

  pushToDevOps() {
    const selectedFiles = this.getSelectedFiles();
    if (selectedFiles.length === 0 || !this.pushConfig.repositoryId || !this.pushConfig.branchName) return;

    this.pushing = true;
    this.pushSuccess = '';
    this.pushError = '';

    this.devOpsService.pushCode({
      ...this.connection,
      repositoryId: this.pushConfig.repositoryId,
      branchName: this.pushConfig.branchName,
      sourceBranch: this.pushConfig.sourceBranch,
      commitMessage: this.pushConfig.commitMessage,
      files: selectedFiles
    }).subscribe({
      next: (res) => {
        this.pushing = false;
        if (res.success) {
          this.pushSuccess = `Successfully pushed ${res.filesCount} files to branch '${res.branch}'!`;
        } else {
          this.pushError = res.error || 'Push failed.';
        }
      },
      error: (err) => {
        this.pushing = false;
        this.pushError = err.error?.error || 'Push failed. Check your PAT permissions.';
      }
    });
  }

  // ─── Push User Stories ───

  onStoryWorkspaceChange() {
    this.userStories = [];
    this.storyPushSuccess = '';
    this.storyPushError = '';
    if (!this.storyPushConfig.workspaceId) return;

    this.loadingStories = true;
    this.systemService.getUserStoriesByWorkspace(this.storyPushConfig.workspaceId).subscribe({
      next: (stories: UserStory[]) => {
        this.loadingStories = false;
        this.userStories = stories.map(s => ({ ...s, selected: true }));
      },
      error: () => { this.loadingStories = false; }
    });
  }

  getSelectedStories(): (UserStory & { selected: boolean })[] {
    return this.userStories.filter(s => s.selected);
  }

  toggleAllStories(selected: boolean) {
    this.userStories.forEach(s => s.selected = selected);
  }

  pushStoriesToDevOps() {
    const selected = this.getSelectedStories();
    if (selected.length === 0) return;

    this.pushingStories = true;
    this.storyPushSuccess = '';
    this.storyPushError = '';

    const workItems = selected.map(s => ({
      title: `${s.storyId}: ${s.title}`,
      description: s.userStoryText || `<p><strong>${s.title}</strong></p><p>Priority: ${s.priority}</p>`,
      tags: this.storyPushConfig.tags || 'AxiomDSF',
      priority: s.priority === 'High' ? 1 : s.priority === 'Medium' ? 2 : 3
    }));

    this.devOpsService.createWorkItemsBatch({
      organization: this.connection.organization,
      project: this.connection.project,
      pat: this.connection.pat,
      workItemType: this.storyPushConfig.workItemType,
      workItems
    }).subscribe({
      next: (res: any) => {
        this.pushingStories = false;
        if (res.successCount > 0) {
          this.storyPushSuccess = `Successfully pushed ${res.successCount}/${res.totalCount} user stories to Azure DevOps as ${this.storyPushConfig.workItemType}s!`;
        }
        if (res.failCount > 0) {
          this.storyPushError = `${res.failCount} stories failed to push.`;
        }
      },
      error: (err: any) => {
        this.pushingStories = false;
        this.storyPushError = err.error?.error || 'Failed to push user stories.';
      }
    });
  }
}
