import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { WorkspaceService, Workspace } from '../../services/workspace.service';
import { WorkflowService, Workflow } from '../../services/workflow.service';
import { SystemService, SystemHealth } from '../../services/system.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="dashboard">
      <!-- Welcome + Live Health -->
      <section class="welcome-section">
        <div class="welcome-message">
          <h2>{{ greeting }}, Developer!</h2>
          <p>Welcome to <strong>AxiomDSF</strong> — your AI-Powered Software Development Factory.</p>
          <div class="tech-badges">
            <span class="tech-badge"><i class="fas fa-coffee"></i> Spring Boot 4</span>
            <span class="tech-badge"><i class="fab fa-angular"></i> Angular 17</span>
            <span class="tech-badge"><i class="fas fa-database"></i> SQLite</span>
            <span class="tech-badge"><i class="fas fa-robot"></i> 10 AI Agents</span>
          </div>
        </div>
        <div class="health-card" [class.online]="healthStatus === 'UP'" [class.offline]="healthStatus === 'DOWN'">
          <div class="health-pulse" [class.active]="healthStatus === 'UP'"></div>
          <div class="health-content">
            <h4><i class="fas fa-heartbeat"></i> Live System</h4>
            <div class="health-grid" *ngIf="health">
              <div class="health-item">
                <span class="hl">Status</span>
                <span class="hv" [class.up]="healthStatus === 'UP'">{{ healthStatus }}</span>
              </div>
              <div class="health-item">
                <span class="hl">Uptime</span>
                <span class="hv">{{ health.uptime }}</span>
              </div>
              <div class="health-item">
                <span class="hl">Memory</span>
                <div class="mem-bar">
                  <div class="mem-fill" [style.width.%]="memPercent"></div>
                </div>
                <span class="hv small">{{ health.memory.usedMB }}MB / {{ health.memory.maxMB }}MB</span>
              </div>
              <div class="health-item">
                <span class="hl">JVM</span>
                <span class="hv small">Java {{ health.jvm.version }}</span>
              </div>
            </div>
            <div *ngIf="!health" class="health-loading">
              <i class="fas fa-spinner fa-spin"></i> Connecting...
            </div>
          </div>
        </div>
      </section>

      <!-- Animated Stats Cards -->
      <section class="stats-section">
        <div class="stat-card bounce-in" *ngFor="let stat of stats; let i = index"
             [style.animation-delay]="(i * 100) + 'ms'">
          <div class="stat-ribbon" [style.background]="stat.color"></div>
          <div class="stat-body">
            <div class="stat-icon-circle" [style.background]="stat.color + '22'" [style.color]="stat.color">
              <i [class]="stat.icon"></i>
            </div>
            <div class="stat-info">
              <span class="stat-label">{{ stat.label }}</span>
              <span class="stat-value">
                <span *ngIf="loading" class="stat-skeleton"></span>
                <span *ngIf="!loading">{{ stat.value }}</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Content Grid -->
      <section class="content-grid">
        <!-- Quick Actions -->
        <div class="data-card">
          <h3><i class="fas fa-bolt"></i> Quick Actions</h3>
          <div class="quick-actions">
            <a routerLink="/workspaces/create" class="action-card">
              <div class="action-icon" style="background: linear-gradient(135deg, #22c55e, #16a34a)">
                <i class="fas fa-plus-circle"></i>
              </div>
              <span class="action-title">New Workspace</span>
              <span class="action-desc">Create a project</span>
            </a>
            <a routerLink="/workflow/start" class="action-card">
              <div class="action-icon" style="background: linear-gradient(135deg, #3b82f6, #2563eb)">
                <i class="fas fa-rocket"></i>
              </div>
              <span class="action-title">Start Workflow</span>
              <span class="action-desc">Launch AI pipeline</span>
            </a>
            <a routerLink="/workflow/status" class="action-card">
              <div class="action-icon" style="background: linear-gradient(135deg, #8b5cf6, #6d28d9)">
                <i class="fas fa-clipboard-list"></i>
              </div>
              <span class="action-title">View Status</span>
              <span class="action-desc">Monitor progress</span>
            </a>
            <a routerLink="/workspaces" class="action-card">
              <div class="action-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706)">
                <i class="fas fa-folder-open"></i>
              </div>
              <span class="action-title">Workspaces</span>
              <span class="action-desc">Browse all projects</span>
            </a>
          </div>
        </div>

        <!-- Recent Workflows -->
        <div class="data-card">
          <h3><i class="fas fa-history"></i> Recent Workflows</h3>
          <div *ngIf="recentWorkflows.length === 0 && !loading" class="empty-state">
            <i class="fas fa-inbox"></i>
            <p>No workflows yet. Start one to see progress here.</p>
          </div>
          <ul class="activity-list" *ngIf="recentWorkflows.length > 0">
            <li *ngFor="let wf of recentWorkflows; let i = index"
                class="activity-item" [style.animation-delay]="(i * 80) + 'ms'">
              <div class="activity-icon" [ngClass]="getStateClass(wf.state)">
                <i class="fas" [ngClass]="getWorkflowIcon(wf.state)"></i>
              </div>
              <div class="activity-info">
                <strong>Workflow #{{ wf.id }}</strong>
                <span class="activity-agent">{{ wf.agentName ? formatAgentName(wf.agentName) : 'Pipeline' }}</span>
              </div>
              <div class="activity-right">
                <span class="status-pill" [ngClass]="getStateClass(wf.state)">{{ wf.state }}</span>
                <div class="mini-progress">
                  <div class="mini-fill" [style.width.%]="(wf.sequenceNumber / 10) * 100"></div>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <!-- Pipeline Visual -->
      <section class="pipeline-section data-card">
        <h3><i class="fas fa-sitemap"></i> Agent Pipeline Overview</h3>
        <p class="pipeline-desc">AxiomDSF orchestrates 10 specialised AI agents to transform requirements into production-ready code.</p>
        <div class="pipeline-visual">
          <div class="pipe-node" *ngFor="let agent of pipelineAgents; let i = index; let last = last"
               [style.animation-delay]="(i * 60) + 'ms'">
            <div class="pipe-icon-wrap">
              <div class="pipe-num">{{ i + 1 }}</div>
              <div class="pipe-icon">{{ agent.icon }}</div>
            </div>
            <div class="pipe-name">{{ agent.name }}</div>
            <div class="pipe-arrow" *ngIf="!last">
              <i class="fas fa-chevron-right" style="color: var(--primary-green); font-size: 0.7em;"></i>
            </div>
          </div>
        </div>
      </section>

      <!-- Keyboard Shortcuts Hint -->
      <section class="shortcuts-hint data-card">
        <h3><i class="fas fa-keyboard"></i> Keyboard Shortcuts</h3>
        <div class="shortcut-grid">
          <div class="shortcut-item"><kbd>Alt</kbd> + <kbd>D</kbd> <span>Dashboard</span></div>
          <div class="shortcut-item"><kbd>Alt</kbd> + <kbd>W</kbd> <span>Workspaces</span></div>
          <div class="shortcut-item"><kbd>Alt</kbd> + <kbd>N</kbd> <span>New Workspace</span></div>
          <div class="shortcut-item"><kbd>Alt</kbd> + <kbd>S</kbd> <span>Start Workflow</span></div>
          <div class="shortcut-item"><kbd>Alt</kbd> + <kbd>T</kbd> <span>CLI Terminal</span></div>
          <div class="shortcut-item"><kbd>Alt</kbd> + <kbd>K</kbd> <span>Toggle Dark Mode</span></div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .dashboard { width: 100%; }
    .welcome-section {
      display: flex; justify-content: space-between; gap: 24px;
      margin-bottom: 28px; flex-wrap: wrap; align-items: stretch;
    }
    .welcome-message { flex: 1; min-width: 300px; }
    .welcome-message h2 { font-size: 1.8em; margin-bottom: 8px; }
    .welcome-message p { color: #6b7280; font-size: 0.95em; }
    .tech-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    .tech-badge {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 14px; border-radius: 20px; font-size: 0.8em; font-weight: 500;
      background: rgba(58,125,68,0.08); color: var(--primary-green);
      border: 1px solid rgba(58,125,68,0.15);
    }
    .tech-badge i { font-size: 0.9em; }

    .health-card {
      min-width: 320px; max-width: 380px; position: relative;
      background: white; border-radius: 14px; padding: 20px 24px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
      border-left: 4px solid #ccc; overflow: hidden; transition: border-color 0.3s;
    }
    .health-card.online { border-left-color: #22c55e; }
    .health-card.offline { border-left-color: #ef4444; }
    .health-pulse {
      position: absolute; top: 18px; right: 18px;
      width: 12px; height: 12px; border-radius: 50%; background: #ccc;
    }
    .health-pulse.active {
      background: #22c55e;
      box-shadow: 0 0 0 0 rgba(34,197,94,0.4);
      animation: healthPulse 2s infinite;
    }
    @keyframes healthPulse {
      0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.4); }
      70% { box-shadow: 0 0 0 10px rgba(34,197,94,0); }
      100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
    }
    .health-content h4 { margin-bottom: 12px; font-size: 0.95em; color: var(--dark-green); }
    .health-content h4 i { margin-right: 6px; color: #22c55e; }
    .health-grid { display: flex; flex-direction: column; gap: 8px; }
    .health-item { display: flex; align-items: center; gap: 8px; }
    .hl { font-size: 0.78em; font-weight: 600; color: #999; min-width: 55px; text-transform: uppercase; letter-spacing: 0.5px; }
    .hv { font-size: 0.88em; font-weight: 500; color: #333; }
    .hv.up { color: #22c55e; font-weight: 700; }
    .hv.small { font-size: 0.78em; color: #666; }
    .mem-bar { flex: 1; height: 8px; background: #e9f5ee; border-radius: 4px; overflow: hidden; max-width: 100px; }
    .mem-fill { height: 100%; background: linear-gradient(90deg, #22c55e, #3A7D44); border-radius: 4px; transition: width 0.5s; }
    .health-loading { text-align: center; padding: 16px; color: #999; font-size: 0.85em; }

    .stats-section {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 18px; margin-bottom: 28px;
    }
    .stat-card {
      background: white; border-radius: 12px; overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.06);
      transition: all 0.3s ease; animation: fadeSlideUp 0.4s ease-out both;
    }
    .stat-card:hover { transform: translateY(-5px); box-shadow: 0 8px 24px rgba(0,0,0,0.1); }
    .stat-ribbon { height: 4px; width: 100%; }
    .stat-body { display: flex; align-items: center; padding: 20px; gap: 16px; }
    .stat-icon-circle {
      width: 52px; height: 52px; min-width: 52px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center; font-size: 1.3em;
    }
    .stat-info { display: flex; flex-direction: column; }
    .stat-label { font-size: 0.8em; color: #888; font-weight: 500; margin-bottom: 2px; }
    .stat-value { font-size: 1.6em; font-weight: 700; color: #333; }
    .stat-skeleton { display: inline-block; width: 40px; height: 24px; background: #f0f0f0; border-radius: 4px; animation: shimmer 1.5s infinite; }
    @keyframes shimmer { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
    @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }

    .content-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 24px; margin-bottom: 28px;
    }
    .data-card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
    .data-card h3 { font-size: 1.05em; margin-bottom: 18px; color: var(--dark-green); }
    .data-card h3 i { margin-right: 10px; color: var(--primary-green); }

    .quick-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .action-card {
      display: flex; flex-direction: column; align-items: center;
      padding: 20px 14px; border-radius: 12px; border: 1px solid #f0f0f0;
      text-decoration: none; color: #333; transition: all 0.3s; text-align: center; background: #fafffe;
    }
    .action-card:hover { transform: translateY(-5px); box-shadow: 0 8px 20px rgba(0,0,0,0.08); border-color: var(--primary-green); }
    .action-icon {
      width: 48px; height: 48px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 1.2em; margin-bottom: 10px;
    }
    .action-title { font-weight: 600; font-size: 0.9em; }
    .action-desc { font-size: 0.75em; color: #999; margin-top: 2px; }

    .activity-list { list-style: none; padding: 0; }
    .activity-item {
      display: flex; align-items: center; padding: 12px 0;
      border-bottom: 1px dashed #f0f0f0; gap: 12px; animation: fadeSlideUp 0.3s ease-out both;
    }
    .activity-item:last-child { border-bottom: none; }
    .activity-icon {
      width: 36px; height: 36px; min-width: 36px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center; font-size: 0.85em;
    }
    .activity-icon.state-completed { background: #dcfce7; color: #16a34a; }
    .activity-icon.state-running { background: #dbeafe; color: #2563eb; }
    .activity-icon.state-pending { background: #fef3c7; color: #d97706; }
    .activity-icon.state-failed { background: #fef2f2; color: #dc2626; }
    .activity-icon.state-review { background: #f3e8ff; color: #7c3aed; }
    .activity-info { flex: 1; }
    .activity-info strong { font-size: 0.9em; }
    .activity-agent { display: block; font-size: 0.78em; color: #999; }
    .activity-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .status-pill {
      display: inline-block; padding: 2px 10px; border-radius: 12px;
      font-size: 0.68em; font-weight: 600; color: white;
    }
    .status-pill.state-completed { background: #22c55e; }
    .status-pill.state-running { background: #3b82f6; }
    .status-pill.state-pending { background: #f59e0b; }
    .status-pill.state-failed { background: #ef4444; }
    .status-pill.state-review { background: #8b5cf6; }
    .mini-progress { width: 60px; height: 4px; background: #e9f5ee; border-radius: 2px; overflow: hidden; }
    .mini-fill { height: 100%; background: var(--gradient-primary); border-radius: 2px; }
    .empty-state { text-align: center; padding: 30px; color: #aaa; }
    .empty-state i { font-size: 2.5em; margin-bottom: 10px; display: block; color: #ddd; }

    .pipeline-section { margin-bottom: 28px; }
    .pipeline-desc { color: #6b7280; margin-bottom: 20px; font-size: 0.9em; }
    .pipeline-visual { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .pipe-node { display: flex; align-items: center; gap: 4px; animation: fadeSlideUp 0.4s ease-out both; }
    .pipe-icon-wrap { display: flex; flex-direction: column; align-items: center; min-width: 72px; text-align: center; }
    .pipe-num {
      font-size: 0.55em; font-weight: 700; color: white;
      background: var(--primary-green); width: 18px; height: 18px;
      border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 3px;
    }
    .pipe-icon {
      font-size: 1.6em; padding: 8px; background: #f0fdf4;
      border: 2px solid #d1fae5; border-radius: 10px; transition: all 0.3s;
    }
    .pipe-node:hover .pipe-icon {
      transform: scale(1.15); border-color: var(--primary-green);
      box-shadow: 0 4px 12px rgba(58,125,68,0.15);
    }
    .pipe-name { font-size: 0.65em; color: #666; font-weight: 500; text-align: center; min-width: 60px; }
    .pipe-arrow { color: var(--primary-green); margin: 0 2px; align-self: center; }

    .shortcuts-hint { margin-bottom: 28px; }
    .shortcut-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .shortcut-item { display: flex; align-items: center; gap: 8px; font-size: 0.85em; color: #555; }
    .shortcut-item span { color: #888; font-size: 0.85em; }
    kbd {
      display: inline-block; padding: 3px 8px; border: 1px solid #ddd;
      border-radius: 4px; background: #f8f8f8; font-size: 0.85em;
      font-family: 'Consolas', monospace; font-weight: 600; color: #555;
      box-shadow: 0 1px 2px rgba(0,0,0,0.08);
    }

    @media (max-width: 768px) {
      .welcome-section { flex-direction: column; }
      .health-card { max-width: 100%; }
      .stats-section, .content-grid { grid-template-columns: 1fr; }
      .quick-actions { grid-template-columns: 1fr; }
    }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy {
  greeting: string;
  loading = true;
  recentWorkflows: Workflow[] = [];
  health: SystemHealth | null = null;
  healthStatus = 'DOWN';
  memPercent = 0;
  private destroy$ = new Subject<void>();

  stats = [
    { label: 'Total Workspaces', value: '0', icon: 'fas fa-folder-open', color: '#22c55e' },
    { label: 'Total Workflows', value: '0', icon: 'fas fa-project-diagram', color: '#3b82f6' },
    { label: 'Active Pipelines', value: '0', icon: 'fas fa-spinner', color: '#f59e0b' },
    { label: 'Completed', value: '0', icon: 'fas fa-check-circle', color: '#8b5cf6' },
  ];

  pipelineAgents = [
    { name: 'Requirement', icon: '📋' }, { name: 'HLS', icon: '🏗️' },
    { name: 'HLD', icon: '📐' }, { name: 'User Story', icon: '📖' },
    { name: 'Test Review Agent', icon: '✅' }, { name: 'LLD', icon: '⚙️' },
    { name: 'TDD', icon: '🧪' }, { name: 'Coding', icon: '💻' },
    { name: 'Static Analysis', icon: '🔍' }, { name: 'Security', icon: '🔐' },
  ];

  constructor(
    private workspaceService: WorkspaceService,
    private workflowService: WorkflowService,
    private systemService: SystemService
  ) {
    const hour = new Date().getHours();
    this.greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
  }

  ngOnInit() {
    this.loadData();
    this.systemService.healthPolling$.pipe(takeUntil(this.destroy$)).subscribe(h => {
      if (h) {
        this.health = h;
        this.healthStatus = h.status;
        this.memPercent = Math.round((h.memory.usedMB / h.memory.maxMB) * 100);
        this.stats[0].value = String(h.stats.workspaces >= 0 ? h.stats.workspaces : 0);
        this.stats[1].value = String(h.stats.totalWorkflows >= 0 ? h.stats.totalWorkflows : 0);
        this.stats[2].value = String(h.stats.activeWorkflows >= 0 ? h.stats.activeWorkflows : 0);
        this.stats[3].value = String(h.stats.completedWorkflows >= 0 ? h.stats.completedWorkflows : 0);
      } else { this.healthStatus = 'DOWN'; }
    });
  }

  ngOnDestroy() { this.destroy$.next(); this.destroy$.complete(); }

  loadData() {
    this.loading = true;
    this.workflowService.getAllWorkflows().subscribe({
      next: (wfs) => { this.recentWorkflows = wfs.slice(-5).reverse(); this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  formatAgentName(name: string): string {
    return name.replace('Agent', '').replace(/([A-Z])/g, ' $1').trim();
  }

  getWorkflowIcon(state: string): string {
    if (!state) return 'fa-circle';
    const s = state.toLowerCase();
    if (s.includes('complete') || s.includes('approved')) return 'fa-check';
    if (s.includes('running') || s.includes('progress')) return 'fa-cog fa-spin';
    if (s.includes('fail') || s.includes('reject')) return 'fa-times';
    if (s.includes('review')) return 'fa-eye';
    return 'fa-clock';
  }

  getStateClass(state: string): string {
    if (!state) return 'state-pending';
    const s = state.toLowerCase();
    if (s.includes('complete') || s.includes('approved')) return 'state-completed';
    if (s.includes('running') || s.includes('progress')) return 'state-running';
    if (s.includes('fail') || s.includes('reject')) return 'state-failed';
    if (s.includes('review')) return 'state-review';
    return 'state-pending';
  }
}
