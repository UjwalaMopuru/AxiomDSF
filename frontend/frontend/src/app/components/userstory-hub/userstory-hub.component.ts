import { Component, Input, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WorkflowService, Workflow, StartWorkflowRequest } from '../../services/workflow.service';
import { SystemService, UserStory } from '../../services/system.service';
import { AgentOutputComponent } from '../agent-output/agent-output.component';
import { ApprovalPanelComponent } from '../approval-panel/approval-panel.component';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import { Subject, takeUntil, interval } from 'rxjs';

interface StoryTab {
  story: UserStory;
  active: boolean;
  workflows: Workflow[];
  currentAgent: number;
  status: 'idle' | 'running' | 'review' | 'completed' | 'failed';
  progress: number;
  expanded: boolean;
}

@Component({
  selector: 'app-userstory-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, AgentOutputComponent, ApprovalPanelComponent, MarkdownPipe],
  template: `
    <div class="story-hub" *ngIf="stories.length > 0">
      <!-- Hub Header -->
      <div class="hub-header">
        <div class="hub-title-area">
          <div class="hub-icon-wrap">
            <i class="fas fa-code-branch"></i>
          </div>
          <div>
            <h3>User Story Hub</h3>
            <p class="hub-subtitle">
              {{ stories.length }} stories generated &middot;
              {{ activeTabs.length }} running &middot;
              Select stories to run through remaining agents (Test Review Agent → Security)
            </p>
          </div>
        </div>
        <div class="hub-actions">
          <button class="hub-btn outline" (click)="toggleStoryPanel()" title="Toggle story sidebar">
            <i class="fas" [ngClass]="showStoryPanel ? 'fa-chevron-left' : 'fa-list'"></i>
            {{ showStoryPanel ? 'Hide Stories' : 'Show Stories' }}
          </button>
          <button class="hub-btn outline" (click)="refreshAll()" title="Refresh all statuses">
            <i class="fas fa-sync-alt" [class.fa-spin]="refreshing"></i>
          </button>
        </div>
      </div>

      <!-- Main Layout: Story Panel + Pipeline Tabs -->
      <div class="hub-layout" [class.panel-open]="showStoryPanel">
        <!-- Left: Story Selection Panel -->
        <aside class="story-panel" *ngIf="showStoryPanel">
          <div class="panel-search">
            <i class="fas fa-search"></i>
            <input type="text" placeholder="Filter stories..." [(ngModel)]="storyFilter"
                   (input)="filterStories()">
          </div>

          <div class="story-list">
            <div *ngFor="let story of filteredStories; let i = index"
                 class="story-card"
                 [class.selected]="isStoryInTabs(story)"
                 [class.running]="getStoryStatus(story) === 'running'"
                 [class.completed]="getStoryStatus(story) === 'completed'"
                 (click)="onStoryClick(story)">

              <div class="story-card-header">
                <span class="story-id">{{ story.storyId || 'US-' + (i + 1) }}</span>
                <span class="story-priority" [ngClass]="'priority-' + (story.priority || 'medium').toLowerCase()">
                  {{ story.priority || 'Medium' }}
                </span>
              </div>

              <h4 class="story-title">{{ story.title || 'User Story ' + (i + 1) }}</h4>

              <div class="story-card-footer">
                <div class="story-status-dot" [ngClass]="'status-' + getStoryStatus(story)"></div>
                <span class="story-status-text">{{ getStoryStatusLabel(story) }}</span>
                <button *ngIf="!isStoryInTabs(story)" class="story-run-btn"
                        (click)="launchStory(story); $event.stopPropagation()"
                        title="Run pipeline for this story">
                  <i class="fas fa-play"></i>
                </button>
                <button *ngIf="isStoryInTabs(story)" class="story-view-btn"
                        (click)="focusTab(story); $event.stopPropagation()"
                        title="View pipeline tab">
                  <i class="fas fa-eye"></i>
                </button>
              </div>

              <!-- Mini progress bar -->
              <div class="story-mini-progress" *ngIf="isStoryInTabs(story)">
                <div class="story-mini-fill" [style.width.%]="getStoryProgress(story)"></div>
              </div>
            </div>
          </div>

          <!-- Batch Actions -->
          <div class="batch-actions" *ngIf="stories.length > 1">
            <button class="hub-btn small primary" (click)="launchAllStories()"
                    [disabled]="allStoriesLaunched()">
              <i class="fas fa-rocket"></i> Launch All
            </button>
            <span class="batch-hint">Run all stories in parallel</span>
          </div>
        </aside>

        <!-- Right: Pipeline Tab Area -->
        <div class="pipeline-area">
          <!-- Tab Bar -->
          <div class="tab-bar" *ngIf="tabs.length > 0">
            <div *ngFor="let tab of tabs; let i = index"
                 class="tab-item"
                 [class.active]="tab === activeTab"
                 (click)="activeTab = tab">
              <div class="tab-status-indicator" [ngClass]="'ind-' + tab.status"></div>
              <span class="tab-label">{{ tab.story.storyId || 'US-' + (i + 1) }}</span>
              <span class="tab-title-short" [title]="tab.story.title">{{ truncate(tab.story.title, 20) }}</span>
              <div class="tab-progress-ring">
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="8" fill="none" stroke="#e0e0e0" stroke-width="2"/>
                  <circle cx="10" cy="10" r="8" fill="none" stroke="var(--primary-green)" stroke-width="2"
                          [attr.stroke-dasharray]="50.26"
                          [attr.stroke-dashoffset]="50.26 - (tab.progress / 100) * 50.26"
                          transform="rotate(-90 10 10)"/>
                </svg>
                <span class="ring-text">{{ tab.progress }}%</span>
              </div>
              <button class="tab-close" (click)="closeTab(tab); $event.stopPropagation()" title="Close tab">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <button class="tab-add" (click)="showStoryPanel = true" title="Add another story">
              <i class="fas fa-plus"></i>
            </button>
          </div>

          <!-- Active Tab Content -->
          <div class="tab-content" *ngIf="activeTab">
            <!-- Story Summary Banner -->
            <div class="story-banner" [class.expanded]="activeTab.expanded">
              <div class="banner-main" (click)="activeTab.expanded = !activeTab.expanded">
                <div class="banner-left">
                  <div class="banner-icon">📖</div>
                  <div>
                    <h4>{{ activeTab.story.storyId || 'User Story' }} — {{ activeTab.story.title }}</h4>
                    <div class="banner-meta">
                      <span class="meta-tag" [ngClass]="'priority-' + (activeTab.story.priority || 'medium').toLowerCase()">
                        {{ activeTab.story.priority || 'Medium' }}
                      </span>
                      <span class="meta-tag neutral">ID: {{ activeTab.story.id }}</span>
                      <span class="meta-tag" [ngClass]="'status-tag-' + activeTab.status">
                        {{ activeTab.status | titlecase }}
                      </span>
                    </div>
                  </div>
                </div>
                <i class="fas" [ngClass]="activeTab.expanded ? 'fa-chevron-up' : 'fa-chevron-down'" style="color:#999"></i>
              </div>
              <div class="banner-body" *ngIf="activeTab.expanded && activeTab.story.userStoryText">
                <div class="story-text-content" [innerHTML]="activeTab.story.userStoryText | markdown"></div>
              </div>
            </div>

            <!-- Agent Output Panel (only when pipeline is running or beyond) -->
            <ng-container *ngIf="activeTab.status !== 'idle'">
              <app-agent-output
                [workspaceId]="workspaceId"
                [requirementId]="requirementId"
                [userStoryId]="activeTab.story.id"
                [agentFilter]="postStoryAgentNumbers"
                (workflowUpdated)="onTabWorkflowUpdated($event)">
              </app-agent-output>
            </ng-container>

            <!-- Start Pipeline Button (when idle) -->
            <div class="start-pipeline-cta" *ngIf="activeTab.status === 'idle'">
              <div class="cta-icon">🚀</div>
              <h4>Ready to Start Pipeline</h4>
              <p>Click the button below to start running agents Test Review Agent → LLD → TDD → Coding → Static Analysis → Security for this user story.</p>
              <button class="hub-btn primary launch-btn" (click)="startPipelineForTab(activeTab)">
                <i class="fas fa-play"></i> Start Pipeline
              </button>
            </div>
          </div>

          <!-- Empty State when no tabs -->
          <div class="empty-pipeline" *ngIf="tabs.length === 0">
            <div class="empty-icon">
              <i class="fas fa-code-branch"></i>
            </div>
            <h3>Select a User Story to Begin</h3>
            <p>Choose one or more stories from the panel to run them through the remaining agents (Test Review Agent → LLD → TDD → Coding → Static Analysis → Security).</p>
            <button class="hub-btn primary" (click)="showStoryPanel = true">
              <i class="fas fa-list"></i> Open Story Panel
            </button>
          </div>
        </div>
      </div>

      <!-- Overview: All Stories Status Grid (always visible at bottom) -->
      <div class="stories-overview" *ngIf="tabs.length > 0">
        <h4><i class="fas fa-th-large"></i> All Active Pipelines</h4>
        <div class="overview-grid">
          <div *ngFor="let tab of tabs" class="overview-card"
               [class.active-card]="tab === activeTab"
               (click)="activeTab = tab">
            <div class="ov-header">
              <span class="ov-id">{{ tab.story.storyId || 'Story' }}</span>
              <span class="ov-status" [ngClass]="'ov-' + tab.status">
                <i class="fas" [ngClass]="getStatusIcon(tab.status)"></i>
                {{ tab.status | titlecase }}
              </span>
            </div>
            <div class="ov-title">{{ truncate(tab.story.title, 40) }}</div>
            <div class="ov-progress-wrap">
              <div class="ov-progress-bar">
                <div class="ov-progress-fill" [style.width.%]="tab.progress"
                     [ngClass]="'fill-' + tab.status"></div>
              </div>
              <span class="ov-pct">{{ tab.progress }}%</span>
            </div>
            <div class="ov-agents">
              <span *ngFor="let agent of postStoryAgents"
                    class="ov-agent-dot"
                    [class.ov-done]="isAgentDoneForTab(tab, agent.order)"
                    [class.ov-running]="isAgentRunningForTab(tab, agent.order)"
                    [class.ov-review]="isAgentInReviewForTab(tab, agent.order)"
                    [title]="agent.name">
              </span>
            </div>
            <!-- Code-TDD Loop Indicator -->
            <div class="ov-loop-arrow" title="Code ↔ TDD verification loop">
              <i class="fas fa-sync-alt"></i>
              <span>Code↔TDD</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .story-hub { width: 100%; }

    /* Hub Header */
    .hub-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 20px 24px; background: white; border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.06); margin-bottom: 16px;
    }
    .hub-title-area { display: flex; align-items: center; gap: 16px; }
    .hub-icon-wrap {
      width: 48px; height: 48px; border-radius: 14px;
      background: linear-gradient(135deg, var(--light-green), var(--primary-green));
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 1.3em;
    }
    .hub-header h3 { margin: 0; font-size: 1.15em; color: var(--dark-green); }
    .hub-subtitle { margin: 4px 0 0; font-size: 0.8em; color: #888; }
    .hub-actions { display: flex; gap: 8px; }
    .hub-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 8px; font-size: 0.82em;
      font-weight: 500; cursor: pointer; font-family: 'Poppins', sans-serif;
      transition: all 0.2s; border: none;
    }
    .hub-btn.outline {
      background: white; border: 1px solid #e0e0e0; color: #555;
    }
    .hub-btn.outline:hover { border-color: var(--primary-green); color: var(--primary-green); background: #f0fdf4; }
    .hub-btn.primary {
      background: linear-gradient(135deg, var(--light-green), var(--primary-green));
      color: white; box-shadow: 0 4px 12px rgba(58,125,68,0.25);
    }
    .hub-btn.primary:hover { transform: translateY(-1px); }
    .hub-btn.primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .hub-btn.small { padding: 6px 12px; font-size: 0.78em; }

    /* Layout */
    .hub-layout {
      display: flex; gap: 16px; min-height: 500px;
    }

    /* Story Panel */
    .story-panel {
      width: 320px; min-width: 320px; background: white;
      border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.06);
      display: flex; flex-direction: column; overflow: hidden;
      animation: slideInLeft 0.3s ease;
    }
    @keyframes slideInLeft {
      from { opacity: 0; transform: translateX(-20px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .panel-search {
      display: flex; align-items: center; gap: 8px; padding: 14px 16px;
      border-bottom: 1px solid #f0f0f0;
    }
    .panel-search i { color: #aaa; font-size: 0.85em; }
    .panel-search input {
      flex: 1; border: none; outline: none; font-family: 'Poppins', sans-serif;
      font-size: 0.85em; color: #333;
    }

    .story-list {
      flex: 1; overflow-y: auto; padding: 12px;
      display: flex; flex-direction: column; gap: 10px;
    }

    .story-card {
      padding: 14px; border: 1px solid #e9f5ee; border-radius: 10px;
      cursor: pointer; transition: all 0.25s; position: relative;
      background: #fafffe;
    }
    .story-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.08); border-color: var(--primary-green); }
    .story-card.selected { border-color: var(--primary-green); background: #f0fdf4; box-shadow: 0 0 0 2px rgba(58,125,68,0.15); }
    .story-card.running { border-left: 3px solid #3b82f6; }
    .story-card.completed { border-left: 3px solid #22c55e; }

    .story-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .story-id { font-weight: 700; font-size: 0.8em; color: var(--primary-green); }
    .story-priority {
      font-size: 0.65em; padding: 2px 8px; border-radius: 10px; font-weight: 600; color: white;
    }
    .priority-high, .priority-p0 { background: #ef4444; }
    .priority-medium, .priority-p1 { background: #f59e0b; }
    .priority-low, .priority-p2 { background: #22c55e; }
    .priority-critical { background: #7c3aed; }

    .story-title { font-size: 0.85em; font-weight: 500; color: #333; margin: 0 0 8px; line-height: 1.4; }

    .story-card-footer { display: flex; align-items: center; gap: 8px; }
    .story-status-dot { width: 8px; height: 8px; border-radius: 50%; }
    .status-idle { background: #d1d5db; }
    .status-running { background: #3b82f6; animation: pulse 1.5s infinite; }
    .status-review { background: #f59e0b; }
    .status-completed { background: #22c55e; }
    .status-failed { background: #ef4444; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

    .story-status-text { font-size: 0.72em; color: #888; flex: 1; }

    .story-run-btn, .story-view-btn {
      width: 28px; height: 28px; border-radius: 50%; border: none;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      font-size: 0.7em; transition: all 0.2s;
    }
    .story-run-btn { background: var(--primary-green); color: white; }
    .story-run-btn:hover { transform: scale(1.1); }
    .story-view-btn { background: #dbeafe; color: #2563eb; }
    .story-view-btn:hover { transform: scale(1.1); }

    .story-mini-progress { height: 3px; background: #e9f5ee; border-radius: 2px; margin-top: 8px; overflow: hidden; }
    .story-mini-fill { height: 100%; background: linear-gradient(90deg, var(--light-green), var(--primary-green)); border-radius: 2px; transition: width 0.5s; }

    .batch-actions {
      padding: 14px 16px; border-top: 1px solid #f0f0f0;
      display: flex; align-items: center; gap: 10px;
    }
    .batch-hint { font-size: 0.72em; color: #aaa; }

    /* Pipeline Area */
    .pipeline-area { flex: 1; min-width: 0; display: flex; flex-direction: column; }

    /* Tab Bar */
    .tab-bar {
      display: flex; align-items: center; gap: 4px;
      background: white; border-radius: 12px 12px 0 0;
      padding: 8px 12px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.04);
      overflow-x: auto; min-height: 48px;
    }
    .tab-item {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 14px; border-radius: 8px 8px 0 0;
      background: #f8f8f8; cursor: pointer; transition: all 0.2s;
      font-size: 0.8em; white-space: nowrap; border: 1px solid #e0e0e0;
      border-bottom: none; position: relative;
    }
    .tab-item:hover { background: #f0fdf4; }
    .tab-item.active {
      background: white; border-color: var(--primary-green);
      box-shadow: 0 -2px 8px rgba(58,125,68,0.08);
    }
    .tab-item.active::after {
      content: ''; position: absolute; bottom: -1px; left: 0; right: 0;
      height: 2px; background: white;
    }
    .tab-status-indicator { width: 6px; height: 6px; border-radius: 50%; }
    .ind-idle { background: #d1d5db; }
    .ind-running { background: #3b82f6; animation: pulse 1.5s infinite; }
    .ind-review { background: #f59e0b; }
    .ind-completed { background: #22c55e; }
    .ind-failed { background: #ef4444; }

    .tab-label { font-weight: 600; color: var(--primary-green); }
    .tab-title-short { color: #888; font-size: 0.9em; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }

    .tab-progress-ring { position: relative; width: 20px; height: 20px; }
    .tab-progress-ring svg { display: block; }
    .ring-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 6px; font-weight: 700; color: var(--primary-green); }

    .tab-close {
      background: none; border: none; color: #ccc; cursor: pointer;
      font-size: 0.8em; padding: 2px; transition: color 0.2s;
    }
    .tab-close:hover { color: #ef4444; }

    .tab-add {
      width: 32px; height: 32px; border-radius: 50%; border: 1px dashed #ccc;
      background: white; cursor: pointer; color: #aaa;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.2s; margin-left: 4px;
    }
    .tab-add:hover { border-color: var(--primary-green); color: var(--primary-green); background: #f0fdf4; }

    /* Tab Content */
    .tab-content {
      background: white; border-radius: 0 12px 12px 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.06); padding: 20px;
      flex: 1; border: 1px solid #e9f5ee; border-top: 2px solid var(--primary-green);
    }

    /* Story Banner */
    .story-banner {
      border: 1px solid #e9f5ee; border-radius: 10px; margin-bottom: 16px;
      overflow: hidden; transition: all 0.3s;
    }
    .banner-main {
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 18px; cursor: pointer; transition: background 0.2s;
    }
    .banner-main:hover { background: #f8fdf9; }
    .banner-left { display: flex; align-items: center; gap: 12px; }
    .banner-icon { font-size: 1.5em; }
    .banner-left h4 { margin: 0; font-size: 0.95em; color: #333; }
    .banner-meta { display: flex; gap: 6px; margin-top: 4px; }
    .meta-tag {
      font-size: 0.68em; padding: 2px 8px; border-radius: 10px;
      font-weight: 600; color: white;
    }
    .meta-tag.neutral { background: #6b7280; }
    .status-tag-idle { background: #9ca3af; }
    .status-tag-running { background: #3b82f6; }
    .status-tag-review { background: #f59e0b; }
    .status-tag-completed { background: #22c55e; }
    .status-tag-failed { background: #ef4444; }

    .banner-body { padding: 0 18px 16px; border-top: 1px solid #f0f0f0; margin-top: 0; }
    .story-text-content { font-size: 0.85em; color: #555; line-height: 1.7; max-height: 200px; overflow-y: auto; }

    /* Mini Pipeline */
    .mini-pipeline {
      margin-bottom: 16px; padding: 14px 18px; background: #f8fdf9;
      border: 1px solid #e9f5ee; border-radius: 10px;
    }
    .mini-pipeline-label { display: flex; justify-content: space-between; font-size: 0.78em; color: #888; margin-bottom: 8px; font-weight: 500; }
    .pipeline-pct { color: var(--primary-green); font-weight: 700; }
    .mini-pipeline-bar { height: 6px; background: #e9f5ee; border-radius: 3px; overflow: hidden; margin-bottom: 12px; }
    .mini-pipeline-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
    .fill-idle { background: #d1d5db; }
    .fill-running { background: linear-gradient(90deg, #60a5fa, #3b82f6); }
    .fill-review { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
    .fill-completed { background: linear-gradient(90deg, var(--light-green), var(--primary-green)); }
    .fill-failed { background: #ef4444; }

    .mini-agents { display: flex; justify-content: space-between; align-items: flex-start; }
    .leading-indicator {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      min-width: 36px; padding-top: 2px;
    }
    .lead-fork { font-size: 0.7em; color: #3A7D44; opacity: 0.6; }
    .lead-dots { display: flex; gap: 3px; }
    .ldot {
      width: 5px; height: 5px; border-radius: 50%; background: #3A7D44;
    }
    .ldot:nth-child(1) { opacity: 0.2; }
    .ldot:nth-child(2) { opacity: 0.35; }
    .ldot:nth-child(3) { opacity: 0.5; }
    .mini-agent-node {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      min-width: 60px; transition: all 0.2s;
    }
    .mini-agent-icon { font-size: 1.2em; }
    .mini-agent-name { font-size: 0.65em; color: #888; font-weight: 500; text-align: center; }
    .mini-agent-dot { width: 8px; height: 8px; border-radius: 50%; background: #e0e0e0; transition: all 0.3s; }
    .mini-agent-node.done .mini-agent-dot { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.4); }
    .mini-agent-node.running .mini-agent-dot { background: #3b82f6; animation: pulse 1.5s infinite; box-shadow: 0 0 6px rgba(59,130,246,0.4); }
    .mini-agent-node.review .mini-agent-dot { background: #f59e0b; box-shadow: 0 0 6px rgba(245,158,11,0.4); }
    .mini-agent-node.done .mini-agent-name { color: #22c55e; font-weight: 600; }
    .mini-agent-node.running .mini-agent-name { color: #3b82f6; font-weight: 600; }
    .mini-agent-node.review .mini-agent-name { color: #f59e0b; font-weight: 600; }

    /* Empty Pipeline */
    .empty-pipeline {
      text-align: center; padding: 60px 30px; background: white;
      border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.06);
    }
    .empty-icon { font-size: 3em; color: #ddd; margin-bottom: 16px; }
    .empty-pipeline h3 { color: #555; margin-bottom: 8px; }
    .empty-pipeline p { color: #999; max-width: 400px; margin: 0 auto 20px; font-size: 0.9em; }

    /* Overview Grid */
    .stories-overview {
      margin-top: 16px; padding: 20px; background: white;
      border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.06);
    }
    .stories-overview h4 { font-size: 0.95em; color: var(--dark-green); margin-bottom: 14px; }
    .stories-overview h4 i { margin-right: 8px; color: var(--primary-green); }
    .overview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
    .overview-card {
      padding: 14px; border: 1px solid #e9f5ee; border-radius: 10px;
      cursor: pointer; transition: all 0.25s; background: #fafffe;
    }
    .overview-card:hover { transform: translateY(-2px); box-shadow: 0 6px 14px rgba(0,0,0,0.08); }
    .overview-card.active-card { border-color: var(--primary-green); box-shadow: 0 0 0 2px rgba(58,125,68,0.15); }
    .ov-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .ov-id { font-weight: 700; font-size: 0.82em; color: var(--primary-green); }
    .ov-status { font-size: 0.7em; font-weight: 600; display: flex; align-items: center; gap: 4px; }
    .ov-idle { color: #9ca3af; }
    .ov-running { color: #3b82f6; }
    .ov-review { color: #f59e0b; }
    .ov-completed { color: #22c55e; }
    .ov-failed { color: #ef4444; }
    .ov-title { font-size: 0.82em; color: #555; margin-bottom: 8px; line-height: 1.3; }
    .ov-progress-wrap { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .ov-progress-bar { flex: 1; height: 4px; background: #e9f5ee; border-radius: 2px; overflow: hidden; }
    .ov-progress-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }
    .ov-pct { font-size: 0.7em; font-weight: 600; color: var(--primary-green); min-width: 30px; }
    .ov-agents { display: flex; gap: 4px; }
    .ov-agent-dot {
      width: 10px; height: 10px; border-radius: 50%; background: #e0e0e0;
      transition: all 0.3s;
    }
    .ov-agent-dot.ov-done { background: #22c55e; }
    .ov-agent-dot.ov-running { background: #3b82f6; animation: pulse 1.5s infinite; }
    .ov-agent-dot.ov-review { background: #f59e0b; }
    .ov-loop-arrow {
      display: flex; align-items: center; gap: 4px;
      font-size: 0.65em; color: #ea580c; font-weight: 600;
      padding: 2px 6px; background: #fff7ed; border: 1px solid #fed7aa;
      border-radius: 6px; margin-top: 4px;
    }
    .ov-loop-arrow i { font-size: 0.9em; }

    @media (max-width: 900px) {
      .hub-layout { flex-direction: column; }
      .story-panel { width: 100%; min-width: unset; }
      .overview-grid { grid-template-columns: 1fr; }
    }

    /* Start Pipeline CTA */
    .start-pipeline-cta {
      text-align: center; padding: 48px 24px; border: 2px dashed #e9f5ee;
      border-radius: 12px; background: #fafffe;
    }
    .cta-icon { font-size: 2.5em; margin-bottom: 12px; }
    .start-pipeline-cta h4 { margin: 0 0 8px; color: #2E673A; font-size: 1.1em; }
    .start-pipeline-cta p { margin: 0 0 20px; color: #888; font-size: 0.85em; max-width: 400px; display: inline-block; }
    .launch-btn { padding: 12px 28px !important; font-size: 0.95em !important; }
  `]
})
export class UserStoryHubComponent implements OnInit, OnDestroy {
  @Input() workspaceId!: number;
  @Input() requirementId!: number;
  @Output() workflowUpdated = new EventEmitter<Workflow>();

  stories: UserStory[] = [];
  filteredStories: UserStory[] = [];
  tabs: StoryTab[] = [];
  activeTab: StoryTab | null = null;
  showStoryPanel = true;
  storyFilter = '';
  refreshing = false;
  private destroy$ = new Subject<void>();

  postStoryAgents = [
    { name: 'Test Review Agent', icon: '✅', order: 5 },
    { name: 'LLD', icon: '⚙️', order: 6 },
    { name: 'TDD', icon: '🧪', order: 7 },
    { name: 'Coding', icon: '💻', order: 8 },
    { name: 'Static Analysis', icon: '🔍', order: 9 },
    { name: 'Security', icon: '🔐', order: 10 },
  ];

  postStoryAgentNumbers = [5, 6, 7, 8, 9, 10];

  constructor(
    private workflowService: WorkflowService,
    private systemService: SystemService
  ) {}

  ngOnInit() {
    this.loadStories();
    // Poll every 5 seconds to update statuses
    interval(5000).pipe(takeUntil(this.destroy$)).subscribe(() => this.updateAllTabStatuses());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadStories() {
    this.systemService.getUserStoriesByRequirement(this.requirementId).subscribe({
      next: (stories) => {
        this.stories = stories;
        this.filteredStories = stories;
        // Auto-open any stories that already have workflows
        this.initializeExistingTabs();
      },
      error: () => {}
    });
  }

  private initializeExistingTabs() {
    this.workflowService.getWorkflowsByContext(this.workspaceId, this.requirementId).subscribe({
      next: (wfs) => {
        const storyIds = new Set(wfs.filter(w => w.userStoryId).map(w => w.userStoryId!));
        for (const sid of storyIds) {
          const story = this.stories.find(s => s.id === sid);
          if (story && !this.isStoryInTabs(story)) {
            const storyWfs = wfs.filter(w => w.userStoryId === sid);
            this.addTab(story, storyWfs);
          }
        }
      },
      error: () => {}
    });
  }

  filterStories() {
    const q = this.storyFilter.toLowerCase();
    this.filteredStories = this.stories.filter(s =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.storyId || '').toLowerCase().includes(q) ||
      (s.priority || '').toLowerCase().includes(q)
    );
  }

  onStoryClick(story: UserStory) {
    if (this.isStoryInTabs(story)) {
      this.focusTab(story);
    } else {
      // Open the tab in idle state — do NOT auto-launch pipeline
      const tab = this.addTab(story, []);
      this.activeTab = tab;
    }
  }

  launchStory(story: UserStory) {
    if (this.isStoryInTabs(story)) {
      const existingTab = this.tabs.find(t => t.story.id === story.id);
      if (existingTab && existingTab.status === 'idle') {
        this.activeTab = existingTab;
        this.startPipelineForTab(existingTab);
      } else {
        this.focusTab(story);
      }
      return;
    }
    const tab = this.addTab(story, []);
    this.activeTab = tab;
    this.startPipelineForTab(tab);
  }

  startPipelineForTab(tab: StoryTab) {
    if (tab.status === 'running') return;
    tab.status = 'running';
    const story = tab.story;
    // Start the workflow scoped to THIS specific user story
    const req: StartWorkflowRequest = {
      workspaceId: this.workspaceId,
      requirementId: this.requirementId,
      requirementText: story.userStoryText || story.title || '',
      userStoryText: story.userStoryText || '',
      agentName: 'TRReviewAgent',
      userStoryId: story.id
    };
    this.workflowService.startWorkflow(req).subscribe({
      next: (wf) => {
        tab.workflows = [wf];
        tab.status = this.computeStatus([wf]);
        this.updateTabProgress(tab);
      },
      error: () => { tab.status = 'failed'; }
    });
  }

  launchAllStories() {
    for (const story of this.stories) {
      if (!this.isStoryInTabs(story)) {
        this.launchStory(story);
      }
    }
  }

  allStoriesLaunched(): boolean {
    return this.stories.every(s => this.isStoryInTabs(s));
  }

  private addTab(story: UserStory, workflows: Workflow[]): StoryTab {
    const tab: StoryTab = {
      story,
      active: true,
      workflows,
      currentAgent: 5,
      status: workflows.length > 0 ? this.computeStatus(workflows) : 'idle',
      progress: 0,
      expanded: false
    };
    this.updateTabProgress(tab);
    this.tabs.push(tab);
    if (!this.activeTab) this.activeTab = tab;
    return tab;
  }

  closeTab(tab: StoryTab) {
    // Don't delete the tab — just switch away from it.
    // The tab (and its progress) remains in the list.
    if (this.activeTab === tab) {
      const idx = this.tabs.indexOf(tab);
      this.activeTab = this.tabs[idx === 0 ? 1 : idx - 1] || null;
    }
  }

  focusTab(story: UserStory) {
    const tab = this.tabs.find(t => t.story.id === story.id);
    if (tab) this.activeTab = tab;
  }

  toggleStoryPanel() {
    this.showStoryPanel = !this.showStoryPanel;
  }

  refreshAll() {
    this.refreshing = true;
    this.loadStories();
    this.updateAllTabStatuses();
    setTimeout(() => this.refreshing = false, 1000);
  }

  private updateAllTabStatuses() {
    for (const tab of this.tabs) {
      if (tab.story.id) {
        this.workflowService.getWorkflowsByUserStory(tab.story.id).subscribe({
          next: (wfs) => {
            tab.workflows = wfs;
            tab.status = this.computeStatus(wfs);
            this.updateTabProgress(tab);
          },
          error: () => {}
        });
      }
    }
  }

  private computeStatus(wfs: Workflow[]): 'idle' | 'running' | 'review' | 'completed' | 'failed' {
    if (wfs.length === 0) return 'idle';
    if (wfs.some(w => w.state === 'IN_PROGRESS')) return 'running';
    if (wfs.some(w => w.state === 'IN_REVIEW')) return 'review';
    if (wfs.some(w => (w.state || '').includes('FAIL') || (w.state || '').includes('REJECT'))) return 'failed';
    const completedCount = wfs.filter(w => ['APPROVED', 'COMPLETED'].includes(w.state)).length;
    if (completedCount >= 6) return 'completed'; // All 6 post-story agents done
    return 'running';
  }

  private updateTabProgress(tab: StoryTab) {
    const completedAgents = tab.workflows.filter(w =>
      ['APPROVED', 'COMPLETED'].includes(w.state) && w.sequenceNumber >= 5
    ).length;
    tab.progress = Math.round((completedAgents / 6) * 100);
    const latest = tab.workflows.reduce((max, w) =>
      w.sequenceNumber > (max?.sequenceNumber || 0) ? w : max, null as Workflow | null);
    if (latest) tab.currentAgent = latest.sequenceNumber;
  }

  isStoryInTabs(story: UserStory): boolean {
    return this.tabs.some(t => t.story.id === story.id);
  }

  getStoryStatus(story: UserStory): string {
    const tab = this.tabs.find(t => t.story.id === story.id);
    return tab ? tab.status : 'idle';
  }

  getStoryStatusLabel(story: UserStory): string {
    const status = this.getStoryStatus(story);
    return { idle: 'Not started', running: 'Running', review: 'In Review', completed: 'Completed', failed: 'Failed' }[status] || 'Unknown';
  }

  getStoryProgress(story: UserStory): number {
    const tab = this.tabs.find(t => t.story.id === story.id);
    return tab ? tab.progress : 0;
  }

  get activeTabs(): StoryTab[] {
    return this.tabs.filter(t => t.status === 'running' || t.status === 'review');
  }

  isAgentDoneForTab(tab: StoryTab, order: number): boolean {
    return tab.workflows.some(w => w.sequenceNumber === order && ['APPROVED', 'COMPLETED'].includes(w.state));
  }

  isAgentRunningForTab(tab: StoryTab, order: number): boolean {
    return tab.workflows.some(w => w.sequenceNumber === order && w.state === 'IN_PROGRESS');
  }

  isAgentInReviewForTab(tab: StoryTab, order: number): boolean {
    return tab.workflows.some(w => w.sequenceNumber === order && w.state === 'IN_REVIEW');
  }

  getStatusIcon(status: string): string {
    return { idle: 'fa-circle', running: 'fa-cog fa-spin', review: 'fa-eye', completed: 'fa-check-circle', failed: 'fa-times-circle' }[status] || 'fa-circle';
  }

  truncate(text: string | undefined, max: number): string {
    if (!text) return '';
    return text.length > max ? text.substring(0, max) + '...' : text;
  }

  onTabWorkflowUpdated(wf: Workflow) {
    this.workflowUpdated.emit(wf);
    // Refresh the active tab
    if (this.activeTab && this.activeTab.story.id) {
      this.workflowService.getWorkflowsByUserStory(this.activeTab.story.id).subscribe({
        next: (wfs) => {
          if (this.activeTab) {
            this.activeTab.workflows = wfs;
            this.activeTab.status = this.computeStatus(wfs);
            this.updateTabProgress(this.activeTab);
          }
        },
        error: () => {}
      });
    }
  }
}
