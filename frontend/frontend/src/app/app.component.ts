import { Component, OnInit, HostListener, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ChatbotWidgetComponent } from './components/chatbot-widget/chatbot-widget.component';
import { WorkspaceService, Workspace } from './services/workspace.service';
import { WorkflowService, StartWorkflowRequest, WorkflowApprovalRequest } from './services/workflow.service';
import { RequirementService } from './services/requirement.service';
import { SystemService } from './services/system.service';
import { DevOpsService, DevOpsConnection } from './services/devops.service';

interface ThemeColors {
  primary: string;
  light: string;
  dark: string;
  name: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ChatbotWidgetComponent],
  template: `
    <div class="app-container" *ngIf="isLoggedIn; else loginScreen" [class.dark]="darkMode">
      <!-- Sidebar -->
      <aside class="sidebar" [class.open]="sidebarOpen" [class.dark-sidebar]="darkMode">
        <div class="sidebar-header">
          <i class="fas fa-microchip logo-icon"></i>
          <h1>AxiomDSF</h1>
        </div>
        <div class="theme-indicator" title="Theme: {{ currentTheme.name }}">
          <span class="theme-dot" [style.background]="currentTheme.primary"></span>
          <span class="theme-name">{{ currentTheme.name }}</span>
        </div>
        <nav class="sidebar-nav">
          <ul>
            <li [class.active]="isActive('/dashboard')">
              <a routerLink="/dashboard" (click)="closeSidebar()">
                <i class="fas fa-tachometer-alt"></i> Dashboard
              </a>
            </li>
            <li [class.active]="isActive('/workspaces')">
              <a routerLink="/workspaces" (click)="closeSidebar()">
                <i class="fas fa-folder-open"></i> Workspaces
              </a>
            </li>
            <!-- Dynamic workspace list -->
            <li *ngFor="let ws of sidebarWorkspaces" class="ws-sub-item"
                [class.active]="isActive('/workspaces/' + ws.id)">
              <a [routerLink]="['/workspaces', ws.id]" (click)="closeSidebar()">
                <i class="fas fa-cube"></i> {{ ws.projectName }}
              </a>
            </li>
            <li [class.active]="isActive('/workspaces/create')">
              <a routerLink="/workspaces/create" (click)="closeSidebar()">
                <i class="fas fa-plus-circle"></i> Create Workspace
              </a>
            </li>

            <div class="nav-divider"></div>
            <div class="nav-section-title">Workflows</div>

            <li [class.active]="isActive('/workflow/start')">
              <a routerLink="/workflow/start" (click)="closeSidebar()">
                <i class="fas fa-rocket"></i> Start Workflow
              </a>
            </li>
            <li [class.active]="isActive('/workflow/status')">
              <a routerLink="/workflow/status" (click)="closeSidebar()">
                <i class="fas fa-clipboard-list"></i> Workflow Status
              </a>
            </li>

            <div class="nav-divider"></div>
            <div class="nav-section-title">Tools</div>

            <li [class.active]="isActive('/devops')">
              <a routerLink="/devops" (click)="closeSidebar()">
                <i class="fab fa-microsoft"></i> Azure DevOps
              </a>
            </li>
            <li>
              <a (click)="toggleCliPanel(); closeSidebar()" style="cursor:pointer">
                <i class="fas fa-terminal"></i> CLI Terminal
              </a>
            </li>
          </ul>
        </nav>
        <div class="sidebar-footer">
          <a (click)="toggleDarkMode()" style="cursor:pointer">
            <i class="fas" [class.fa-moon]="!darkMode" [class.fa-sun]="darkMode"></i>
            {{ darkMode ? 'Light Mode' : 'Dark Mode' }}
            <kbd style="margin-left:auto;font-size:0.7em;opacity:0.6;background:#e5e7eb;padding:2px 6px;border-radius:4px">Alt+K</kbd>
          </a>
          <a routerLink="/about"><i class="fas fa-info-circle"></i> About</a>
          <a href="/swagger-ui.html" target="_blank"><i class="fas fa-book"></i> API Docs</a>
          <a (click)="logout()" style="cursor:pointer"><i class="fas fa-sign-out-alt"></i> Logout</a>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="main-content">
        <header class="main-header">
          <div class="header-left">
            <i class="fas fa-bars menu-toggle" (click)="toggleSidebar()"></i>
            <h2>{{ getPageTitle() }}</h2>
          </div>
          <div class="header-actions">
            <span class="greeting">{{ greeting }}, {{ username }}!</span>
            <i class="fas fa-bell notification-icon" (click)="toggleCliPanel()"></i>
            <!-- Profile Dropdown -->
            <div class="profile-wrapper" (click)="profileOpen = !profileOpen">
              <div class="user-avatar" title="{{ username }}">
                <span class="avatar-initials">{{ getInitials() }}</span>
              </div>
              <div class="profile-dropdown" *ngIf="profileOpen" (click)="$event.stopPropagation()">
                <div class="profile-card">
                  <div class="profile-avatar-lg">
                    <span>{{ getInitials() }}</span>
                  </div>
                  <div class="profile-name">{{ username }}</div>
                  <div class="profile-role">Developer</div>
                </div>
                <div class="profile-divider"></div>
                <button class="profile-item" (click)="toggleDarkMode(); profileOpen = false">
                  <i class="fas" [class.fa-moon]="!darkMode" [class.fa-sun]="darkMode"></i>
                  {{ darkMode ? 'Light Mode' : 'Dark Mode' }}
                </button>
                <button class="profile-item" (click)="toggleCliPanel(); profileOpen = false">
                  <i class="fas fa-terminal"></i> CLI Terminal
                </button>
                <div class="profile-divider"></div>
                <button class="profile-item logout-item" (click)="logout(); profileOpen = false">
                  <i class="fas fa-sign-out-alt"></i> Sign Out
                </button>
              </div>
            </div>
          </div>
        </header>
        <div class="content-area">
          <router-outlet></router-outlet>
        </div>
      </main>

      <!-- CLI Terminal Panel -->
      <div class="cli-overlay" *ngIf="showCliPanel" (click)="showCliPanel = false"></div>
      <div class="cli-panel" [class.open]="showCliPanel" [class.fullscreen]="cliFullscreen"
           [style.height.px]="cliFullscreen ? undefined : cliHeight">
        <div class="cli-resize-handle" (mousedown)="onCliResizeStart($event)"></div>
        <div class="cli-header">
          <span><i class="fas fa-terminal"></i> AxiomDSF CLI</span>
          <div class="cli-header-actions">
            <button (click)="cliFullscreen = !cliFullscreen" title="Toggle fullscreen">
              <i class="fas" [class.fa-expand]="!cliFullscreen" [class.fa-compress]="cliFullscreen"></i>
            </button>
            <button (click)="showCliPanel = false" title="Close"><i class="fas fa-times"></i></button>
          </div>
        </div>
        <div class="cli-body" #cliBody>
          <div class="cli-line" *ngFor="let line of cliHistory">
            <span [class]="line.type" [innerHTML]="line.text"></span>
          </div>
        </div>
        <div class="cli-input-row">
          <span class="cli-prompt">axiomdsf&gt;</span>
          <input #cliInput type="text" [(ngModel)]="cliCommand"
                 (keydown)="onCliKeydown($event)"
                 placeholder="Type a command (help for list)..."
                 class="cli-input-field"
                 autocomplete="off" spellcheck="false">
        </div>
      </div>

      <!-- AI Assistant Chat Widget -->
      <app-chatbot-widget></app-chatbot-widget>
    </div>

    <!-- Login Screen -->
    <ng-template #loginScreen>
      <div class="login-container">
        <!-- Animated background particles -->
        <div class="login-bg-shapes">
          <div class="shape shape-1"></div>
          <div class="shape shape-2"></div>
          <div class="shape shape-3"></div>
          <div class="shape shape-4"></div>
          <div class="shape shape-5"></div>
        </div>

        <div class="login-card">
          <!-- Logo Section -->
          <div class="login-header">
            <div class="login-logo-ring">
              <i class="fas fa-microchip"></i>
            </div>
            <h1>Axiom<span>DSF</span></h1>
            <p class="login-tagline">AI-Powered Software Development Factory</p>
          </div>

          <!-- Login Form -->
          <div class="login-form">
            <label class="login-label">What should we call you?</label>
            <div class="login-input-wrapper">
              <i class="fas fa-user login-input-icon"></i>
              <input type="text" [(ngModel)]="loginUsername" placeholder="Enter your name"
                     (keydown.enter)="login()" autocomplete="off" maxlength="30">
            </div>
            <button class="login-btn" (click)="login()" [disabled]="!loginUsername.trim()">
              Get Started <i class="fas fa-arrow-right"></i>
            </button>
          </div>

          <!-- Footer -->
          <div class="login-footer">
            <div class="login-features">
              <span><i class="fas fa-robot"></i> 10 AI Agents</span>
              <span><i class="fas fa-code"></i> Auto Code Gen</span>
              <span><i class="fas fa-shield-alt"></i> Security Scans</span>
            </div>
          </div>
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100vh; }
    .app-container { display: flex; width: 100vw; height: 100vh; overflow: hidden; }

    /* --- Login Screen --- */
    .login-container {
      width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      position: relative; overflow: hidden;
    }
    .login-bg-shapes { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    .shape {
      position: absolute; border-radius: 50%; opacity: 0.08;
      background: linear-gradient(135deg, #5DBB63, #3A7D44);
      animation: floatShape 20s ease-in-out infinite;
    }
    .shape-1 { width: 300px; height: 300px; top: -80px; left: -80px; animation-delay: 0s; }
    .shape-2 { width: 200px; height: 200px; top: 60%; right: -50px; animation-delay: -5s; }
    .shape-3 { width: 150px; height: 150px; bottom: -40px; left: 30%; animation-delay: -10s; }
    .shape-4 { width: 100px; height: 100px; top: 20%; right: 20%; animation-delay: -3s; opacity: 0.05; }
    .shape-5 { width: 250px; height: 250px; bottom: 10%; right: 40%; animation-delay: -7s; opacity: 0.04; }
    @keyframes floatShape {
      0%, 100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-30px) scale(1.05); }
    }

    .login-card {
      background: rgba(255,255,255,0.03); backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 24px; padding: 48px 44px; max-width: 420px; width: 90%;
      text-align: center; animation: loginAppear 0.6s ease;
      box-shadow: 0 24px 80px rgba(0,0,0,0.4);
    }
    @keyframes loginAppear {
      from { opacity: 0; transform: translateY(20px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .login-header { margin-bottom: 36px; }
    .login-logo-ring {
      width: 80px; height: 80px; margin: 0 auto 16px; border-radius: 22px;
      background: linear-gradient(135deg, #5DBB63, #3A7D44);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 8px 32px rgba(93,187,99,0.3);
      animation: logoPulse 3s ease-in-out infinite;
    }
    .login-logo-ring i { font-size: 36px; color: white; }
    @keyframes logoPulse {
      0%, 100% { box-shadow: 0 8px 32px rgba(93,187,99,0.3); }
      50% { box-shadow: 0 8px 48px rgba(93,187,99,0.5); }
    }
    .login-header h1 {
      color: #f1f5f9; font-size: 2em; margin: 0; font-weight: 700; letter-spacing: 1px;
    }
    .login-header h1 span { color: #5DBB63; }
    .login-tagline { color: #64748b; font-size: 0.85em; margin: 6px 0 0; }

    .login-form { margin-bottom: 28px; }
    .login-label {
      display: block; text-align: left; color: #94a3b8; font-size: 0.82em;
      font-weight: 500; margin-bottom: 10px;
    }
    .login-input-wrapper {
      position: relative; margin-bottom: 20px;
    }
    .login-input-icon {
      position: absolute; left: 16px; top: 50%; transform: translateY(-50%);
      color: #475569; font-size: 0.9em; transition: color 0.3s;
    }
    .login-input-wrapper input {
      width: 100%; padding: 14px 16px 14px 44px; border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px; font-size: 0.95em; font-family: 'Poppins', sans-serif;
      background: rgba(255,255,255,0.05); color: #e2e8f0; transition: all 0.3s;
      box-sizing: border-box;
    }
    .login-input-wrapper input::placeholder { color: #475569; }
    .login-input-wrapper input:focus {
      outline: none; border-color: #5DBB63;
      box-shadow: 0 0 0 3px rgba(93,187,99,0.15);
      background: rgba(255,255,255,0.08);
    }
    .login-input-wrapper input:focus + .login-input-icon,
    .login-input-wrapper input:focus ~ .login-input-icon { color: #5DBB63; }

    .login-btn {
      width: 100%; padding: 14px; border: none; border-radius: 12px;
      background: linear-gradient(135deg, #5DBB63, #3A7D44);
      color: white; font-size: 1em; font-weight: 600; cursor: pointer;
      font-family: 'Poppins', sans-serif; transition: all 0.3s;
      display: flex; align-items: center; justify-content: center; gap: 10px;
    }
    .login-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(93,187,99,0.35);
    }
    .login-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .login-btn i { transition: transform 0.3s; }
    .login-btn:hover:not(:disabled) i { transform: translateX(4px); }

    .login-footer { margin-top: 8px; }
    .login-features {
      display: flex; justify-content: center; gap: 18px; flex-wrap: wrap;
    }
    .login-features span {
      font-size: 0.72em; color: #475569; display: flex; align-items: center; gap: 5px;
    }
    .login-features span i { color: #5DBB63; font-size: 0.9em; }

    /* --- Sidebar --- */
    .sidebar {
      width: 260px; min-width: 260px; background-color: #ffffff;
      padding: 20px 15px; display: flex; flex-direction: column;
      border-right: 1px solid var(--border-color);
      box-shadow: 2px 0 5px rgba(0,0,0,0.05);
      transition: left 0.3s ease; z-index: 1001;
    }
    .sidebar-header {
      display: flex; align-items: center; margin-bottom: 12px; padding-left: 10px;
    }
    .logo-icon { font-size: 28px; color: var(--primary-green); margin-right: 12px; }
    .sidebar-header h1 {
      font-size: 1.5em; color: var(--primary-green); margin: 0; font-weight: 700; letter-spacing: 0.5px;
    }
    .theme-indicator {
      display: flex; align-items: center; gap: 6px; padding: 4px 12px;
      margin-bottom: 16px; font-size: 0.72em; color: #999;
    }
    .theme-dot { width: 10px; height: 10px; border-radius: 50%; }
    .theme-name { text-transform: capitalize; }

    .sidebar-nav { flex: 1; overflow-y: auto; min-height: 0; }
    .sidebar-nav ul { list-style: none; padding: 0; }
    .sidebar-nav ul li { margin-bottom: 4px; }
    .sidebar-nav ul li a {
      display: flex; align-items: center; padding: 12px 15px; color: #555;
      border-radius: 8px; font-weight: 500; font-size: 14px;
      transition: all 0.3s ease; cursor: pointer;
    }
    .sidebar-nav ul li a i {
      margin-right: 12px; width: 20px; text-align: center;
      color: var(--primary-green); font-size: 16px;
    }
    .sidebar-nav ul li a:hover {
      background: linear-gradient(135deg, var(--light-green), var(--primary-green));
      color: white;
    }
    .sidebar-nav ul li a:hover i { color: white; }
    .sidebar-nav ul li.active a {
      background: linear-gradient(135deg, var(--light-green), var(--primary-green));
      color: white; box-shadow: 0 4px 12px rgba(58, 125, 68, 0.3);
    }
    .sidebar-nav ul li.active a i { color: white; }

    .nav-divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(58, 125, 68, 0.2), transparent);
      margin: 16px 0;
    }
    .nav-section-title {
      padding: 8px 15px; font-size: 11px; font-weight: 600;
      color: var(--primary-green); text-transform: uppercase; letter-spacing: 1.5px;
    }

    .ws-sub-item a {
      padding-left: 34px !important; font-size: 13px !important;
    }
    .ws-sub-item a i { font-size: 12px !important; color: #999 !important; }
    .ws-sub-item.active a i { color: white !important; }

    .sidebar-footer {
      margin-top: auto; padding-top: 20px; border-top: 1px solid var(--border-color);
    }
    .sidebar-footer a {
      display: flex; align-items: center; padding: 10px 15px; color: #555;
      border-radius: 6px; font-weight: 500; font-size: 13px; cursor: pointer;
      transition: background 0.3s;
    }
    .sidebar-footer a:hover { background-color: #e9ecef; }
    .sidebar-footer a i { margin-right: 10px; color: var(--primary-green); }

    /* --- Main Content --- */
    .main-content {
      flex-grow: 1; overflow-y: auto; display: flex; flex-direction: column;
      background: var(--background);
    }
    .main-header {
      background: #ffffff; padding: 0 30px; height: 64px;
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid var(--border-color); box-shadow: var(--shadow);
      position: sticky; top: 0; z-index: 100;
    }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .menu-toggle {
      display: none; font-size: 1.4em; color: var(--primary-green); cursor: pointer;
    }
    .main-header h2 { margin: 0; font-size: 1.4em; font-weight: 600; color: var(--dark-green); }
    .header-actions { display: flex; align-items: center; gap: 20px; }
    .greeting { font-size: 0.9em; color: var(--text-muted); font-weight: 400; }
    .notification-icon {
      font-size: 1.3em; color: var(--primary-green); cursor: pointer; transition: transform 0.2s;
    }
    .notification-icon:hover { transform: scale(1.15); }
    .user-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg, var(--light-green), var(--primary-green));
      display: flex; align-items: center; justify-content: center; cursor: pointer;
      transition: box-shadow 0.2s;
    }
    .user-avatar:hover { box-shadow: 0 0 0 3px rgba(93,187,99,0.25); }
    .avatar-initials { color: white; font-weight: 700; font-size: 0.8em; }

    /* Profile Dropdown */
    .profile-wrapper { position: relative; }
    .profile-dropdown {
      position: absolute; top: calc(100% + 10px); right: 0;
      background: white; border-radius: 14px; min-width: 240px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.12); border: 1px solid #f0f0f0;
      animation: dropIn 0.2s ease; z-index: 9999; overflow: hidden;
    }
    @keyframes dropIn {
      from { opacity: 0; transform: translateY(-8px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .profile-card {
      padding: 20px; text-align: center;
      background: linear-gradient(135deg, #f0fdf4, #ecfccb);
    }
    .profile-avatar-lg {
      width: 56px; height: 56px; border-radius: 50%; margin: 0 auto 10px;
      background: linear-gradient(135deg, var(--light-green), var(--primary-green));
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 16px rgba(58,125,68,0.25);
    }
    .profile-avatar-lg span {
      color: white; font-weight: 700; font-size: 1.2em;
    }
    .profile-name {
      font-weight: 600; font-size: 1em; color: #1e293b; margin-bottom: 2px;
    }
    .profile-role {
      font-size: 0.75em; color: #64748b; font-weight: 500;
    }
    .profile-divider {
      height: 1px; background: #f0f0f0; margin: 0;
    }
    .profile-item {
      display: flex; align-items: center; gap: 10px; width: 100%;
      padding: 12px 20px; border: none; background: none; cursor: pointer;
      font-family: 'Poppins', sans-serif; font-size: 0.85em; color: #555;
      transition: background 0.2s;
    }
    .profile-item:hover { background: #f8fafc; }
    .profile-item i { width: 18px; text-align: center; color: var(--primary-green); font-size: 0.95em; }
    .profile-item.logout-item { color: #dc2626; }
    .profile-item.logout-item i { color: #dc2626; }
    .profile-item.logout-item:hover { background: #fef2f2; }

    .content-area { padding: 25px 30px; flex-grow: 1; }

    /* --- CLI Panel --- */
    .cli-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 2000;
    }
    .cli-panel {
      position: fixed; bottom: 0; left: 260px; right: 0; height: 360px;
      background: #1e1e2e; z-index: 2001; transform: translateY(100%);
      transition: transform 0.3s ease; display: flex; flex-direction: column;
      border-top: 2px solid #4ade80;
    }
    .cli-panel.open { transform: translateY(0); }
    .cli-panel.fullscreen { left: 0 !important; top: 0; height: 100vh !important; border-top: none; }
    .cli-resize-handle {
      position: absolute; top: -4px; left: 0; right: 0; height: 8px;
      cursor: ns-resize; z-index: 10;
    }
    .cli-resize-handle:hover { background: rgba(74, 222, 128, 0.2); }
    .cli-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 16px; background: #181825; color: #4ade80;
      font-family: 'Consolas', 'Courier New', monospace; font-size: 0.85em; font-weight: 600;
    }
    .cli-header i { margin-right: 8px; }
    .cli-header-actions { display: flex; gap: 4px; }
    .cli-header-actions button {
      background: none; border: none; color: #94a3b8; cursor: pointer;
      font-size: 1em; padding: 4px 8px; border-radius: 4px; transition: all 0.2s;
    }
    .cli-header-actions button:hover { color: #f87171; background: rgba(248,113,113,0.1); }
    .cli-body {
      flex: 1; overflow-y: auto; padding: 12px 16px;
      font-family: 'Consolas', 'Courier New', monospace; font-size: 0.82em; line-height: 1.6;
    }
    .cli-line { margin-bottom: 2px; white-space: pre-wrap; word-break: break-word; }
    .cli-line .command { color: #4ade80; }
    .cli-line .output { color: #cdd6f4; }
    .cli-line .error { color: #f87171; }
    .cli-line .info { color: #89b4fa; }
    .cli-line .success { color: #a6e3a1; }
    .cli-line .warn { color: #f9e2af; }
    .cli-line .dim { color: #6c7086; }
    .cli-line .table-header { color: #cba6f7; font-weight: bold; }
    .cli-line .table-row { color: #bac2de; }
    .cli-line .table-border { color: #45475a; }
    .cli-line .highlight { color: #f5c2e7; }
    .cli-line .agent-name { color: #89dceb; }
    .cli-input-row {
      display: flex; align-items: center; padding: 8px 16px; background: #181825;
      border-top: 1px solid #313244;
    }
    .cli-prompt { color: #4ade80; font-family: 'Consolas', monospace; font-size: 0.85em; margin-right: 8px; white-space: nowrap; }
    .cli-input-field {
      flex: 1; background: transparent; border: none; color: #cdd6f4;
      font-family: 'Consolas', 'Courier New', monospace; font-size: 0.85em; outline: none;
    }

    /* --- Responsive --- */
    @media (max-width: 768px) {
      .sidebar {
        position: fixed; left: -280px; top: 0; height: 100%;
        transition: left 0.3s ease;
      }
      .sidebar.open { left: 0; }
      .menu-toggle { display: inline-block !important; }
      .main-content { width: 100%; }
      .header-actions .greeting { display: none; }
      .content-area { padding: 15px; }
      .cli-panel { left: 0; }
    }

    @media (min-width: 769px) {
      .menu-toggle { display: none !important; }
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Dark mode component overrides */
    .dark-sidebar {
      background-color: #16213e !important;
      border-right-color: #2a2a4a !important;
    }
    .dark-sidebar .sidebar-nav ul li a { color: #c0c0c0; }
    .dark-sidebar .sidebar-footer a { color: #c0c0c0; }
    .dark-sidebar .sidebar-footer a:hover { background-color: #1e293b; }
    .dark-sidebar .sidebar-header h1 { color: var(--light-green); }
    .dark .main-header {
      background: #16213e !important;
      border-bottom-color: #2a2a4a !important;
    }
    .dark .main-header h2 { color: #e0e0e0; }
    .dark .greeting { color: #9ca3af; }
    .dark .main-content { background: #1a1a2e; }
    .dark .login-container { background: linear-gradient(135deg, #0a0f1a 0%, #111827 100%); }
    .dark .login-card { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.06); }
    .dark .profile-dropdown { background: #1e293b; border-color: #334155; }
    .dark .profile-card { background: linear-gradient(135deg, #1e3a2f, #1a2e23); }
    .dark .profile-name { color: #e2e8f0; }
    .dark .profile-divider { background: #334155; }
    .dark .profile-item { color: #94a3b8; }
    .dark .profile-item:hover { background: #334155; }
  `]
})
export class AppComponent implements OnInit, AfterViewChecked {
  title = 'AxiomDSF';
  sidebarOpen = false;
  greeting: string;
  private cliShouldScroll = false;

  // Login
  isLoggedIn = false;
  username = 'Developer';
  loginUsername = '';
  profileOpen = false;

  // CLI
  showCliPanel = false;
  cliCommand = '';
  cliHistory: { text: string; type: string }[] = [];
  cliFullscreen = false;
  cliHeight = 360;
  private cliCommandHistory: string[] = [];
  private cliHistoryIndex = -1;
  private cliResizing = false;
  @ViewChild('cliBody') private cliBody!: ElementRef;
  @ViewChild('cliInput') private cliInputEl!: ElementRef;

  private allCliCommands = [
    'help', 'clear', 'cls',
    'workspace list', 'workspace create', 'workspace get', 'workspace open',
    'requirement list', 'requirement add',
    'workflow start', 'workflow status', 'workflow all', 'workflow approve', 'workflow reject', 'workflow rework',
    'agent output', 'agent list', 'agents',
    'health', 'status',
    'userstory list',
    'navigate', 'goto', 'nav',
    'devops connect', 'devops disconnect', 'devops pull', 'devops push-code', 'devops push-stories',
    'devmode', 'devmode run',
    'theme', 'dark', 'light', 'fullscreen',
    'export', 'history', 'whoami', 'logout', 'version', 'uptime',
    'shortcut', 'shortcuts', 'alias',
  ];

  // CLI DevOps state
  private cliDevOpsConn: DevOpsConnection = { organization: '', project: '', pat: '' };
  private cliDevOpsConnected = false;

  // Dark mode
  darkMode = false;

  // Sidebar workspaces
  sidebarWorkspaces: Workspace[] = [];

  // Theme
  currentTheme: ThemeColors;
  private themes: ThemeColors[] = [
    { primary: '#3A7D44', light: '#5DBB63', dark: '#2E673A', name: 'Forest Green' },
    { primary: '#2563EB', light: '#60A5FA', dark: '#1E40AF', name: 'Ocean Blue' },
    { primary: '#7C3AED', light: '#A78BFA', dark: '#5B21B6', name: 'Royal Purple' },
    { primary: '#DC2626', light: '#F87171', dark: '#991B1B', name: 'Ruby Red' },
    { primary: '#D97706', light: '#FBBF24', dark: '#92400E', name: 'Amber Gold' },
    { primary: '#0D9488', light: '#2DD4BF', dark: '#115E59', name: 'Teal Wave' },
    { primary: '#DB2777', light: '#F472B6', dark: '#9D174D', name: 'Rose Pink' },
    { primary: '#4F46E5', light: '#818CF8', dark: '#3730A3', name: 'Indigo Night' },
  ];

  constructor(
    private router: Router,
    private workspaceService: WorkspaceService,
    private workflowService: WorkflowService,
    private requirementService: RequirementService,
    private systemService: SystemService,
    private devOpsService: DevOpsService
  ) {
    const hour = new Date().getHours();
    if (hour < 12) this.greeting = 'Good Morning';
    else if (hour < 18) this.greeting = 'Good Afternoon';
    else this.greeting = 'Good Evening';

    // Random theme
    this.currentTheme = this.themes[Math.floor(Math.random() * this.themes.length)];

    // Check if user is already logged in
    const savedUser = localStorage.getItem('axiomdsf_user');
    if (savedUser) {
      this.username = savedUser;
      this.isLoggedIn = true;
    }

    // Restore dark mode preference
    this.darkMode = localStorage.getItem('axiomdsf_dark_mode') === 'true';
    if (this.darkMode) {
      document.body.classList.add('dark-mode');
    }
  }

  ngOnInit() {
    this.applyTheme();
    this.cliHistory.push({ text: '┌─────────────────────────────────────────────────┐', type: 'dim' });
    this.cliHistory.push({ text: '│  <span class="info">AxiomDSF CLI</span> v1.0 — AI-Powered Software Factory     │', type: 'dim' });
    this.cliHistory.push({ text: '│  Type <span class="success">help</span> for commands · <span class="success">help &lt;cmd&gt;</span> for details  │', type: 'dim' });
    this.cliHistory.push({ text: '│  <span class="warn">↑↓</span> history · <span class="warn">Tab</span> autocomplete · <span class="warn">Alt+T</span> toggle      │', type: 'dim' });
    this.cliHistory.push({ text: '└─────────────────────────────────────────────────┘', type: 'dim' });
    this.loadSidebarWorkspaces();
  }

  ngAfterViewChecked() {
    if (this.cliShouldScroll && this.cliBody?.nativeElement) {
      this.cliBody.nativeElement.scrollTop = this.cliBody.nativeElement.scrollHeight;
      this.cliShouldScroll = false;
    }
  }

  loadSidebarWorkspaces() {
    this.workspaceService.listWorkspaces().subscribe({
      next: (ws) => { this.sidebarWorkspaces = ws; },
      error: () => {}
    });
  }

  applyTheme() {
    const root = document.documentElement;
    root.style.setProperty('--primary-green', this.currentTheme.primary);
    root.style.setProperty('--light-green', this.currentTheme.light);
    root.style.setProperty('--dark-green', this.currentTheme.dark);
    root.style.setProperty('--gradient-primary', `linear-gradient(135deg, ${this.currentTheme.light}, ${this.currentTheme.primary})`);
  }

  login() {
    const name = this.loginUsername.trim();
    if (!name) return;
    this.username = name;
    this.isLoggedIn = true;
    localStorage.setItem('axiomdsf_user', name);
  }

  logout() {
    this.isLoggedIn = false;
    this.username = 'Developer';
    this.loginUsername = '';
    localStorage.removeItem('axiomdsf_user');
  }

  getInitials(): string {
    return this.username.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  }

  toggleSidebar() { this.sidebarOpen = !this.sidebarOpen; }
  closeSidebar() { if (window.innerWidth < 769) this.sidebarOpen = false; }
  toggleCliPanel() { this.showCliPanel = !this.showCliPanel; }

  toggleDarkMode() {
    this.darkMode = !this.darkMode;
    document.body.classList.toggle('dark-mode', this.darkMode);
    localStorage.setItem('axiomdsf_dark_mode', String(this.darkMode));
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent) {
    if (!event.altKey || !this.isLoggedIn) return;
    // Don't trigger shortcuts when typing in inputs
    const tag = (event.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    switch (event.key.toLowerCase()) {
      case 'd': event.preventDefault(); this.router.navigate(['/dashboard']); break;
      case 'w': event.preventDefault(); this.router.navigate(['/workspaces']); break;
      case 'n': event.preventDefault(); this.router.navigate(['/workspaces/create']); break;
      case 's': event.preventDefault(); this.router.navigate(['/workflow/start']); break;
      case 't': event.preventDefault(); this.toggleCliPanel(); break;
      case 'k': event.preventDefault(); this.toggleDarkMode(); break;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.profile-wrapper')) {
      this.profileOpen = false;
    }
  }

  isActive(path: string): boolean {
    return window.location.pathname === path;
  }

  getPageTitle(): string {
    const path = window.location.pathname;
    const titles: Record<string, string> = {
      '/dashboard': 'Dashboard Overview',
      '/workspaces': 'Workspaces',
      '/workspaces/create': 'Create Workspace',
      '/workflow/start': 'Start Workflow',
      '/workflow/status': 'Workflow Status',
      '/devops': 'Azure DevOps Integration',
      '/about': 'About',
    };
    if (path.match(/^\/workspaces\/\d+/)) return 'Workspace Detail';
    return titles[path] || 'AxiomDSF';
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // === CLI Engine ===================================================

  private cliPush(text: string, type: string = 'output') {
    this.cliHistory.push({ text, type });
    this.cliShouldScroll = true;
  }

  private cliTable(headers: string[], rows: string[][]) {
    const colWidths = headers.map((h, i) =>
      Math.max(h.length, ...rows.map(r => (r[i] || '').length))
    );
    const border = '┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐';
    const separator = '├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤';
    const bottom = '└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘';
    const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length));

    this.cliPush(border, 'table-border');
    this.cliPush('│ ' + headers.map((h, i) => pad(h, colWidths[i])).join(' │ ') + ' │', 'table-header');
    this.cliPush(separator, 'table-border');
    rows.forEach(row => {
      this.cliPush('│ ' + row.map((c, i) => pad(c || '', colWidths[i])).join(' │ ') + ' │', 'table-row');
    });
    this.cliPush(bottom, 'table-border');
  }

  onCliKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.executeCliCommand();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.cliCommandHistory.length > 0) {
        if (this.cliHistoryIndex < this.cliCommandHistory.length - 1) this.cliHistoryIndex++;
        this.cliCommand = this.cliCommandHistory[this.cliCommandHistory.length - 1 - this.cliHistoryIndex];
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (this.cliHistoryIndex > 0) {
        this.cliHistoryIndex--;
        this.cliCommand = this.cliCommandHistory[this.cliCommandHistory.length - 1 - this.cliHistoryIndex];
      } else {
        this.cliHistoryIndex = -1;
        this.cliCommand = '';
      }
    } else if (event.key === 'Tab') {
      event.preventDefault();
      this.cliAutocomplete();
    } else if (event.key === 'l' && event.ctrlKey) {
      event.preventDefault();
      this.cliHistory = [];
    }
  }

  private cliAutocomplete() {
    const partial = this.cliCommand.toLowerCase().trim();
    if (!partial) return;
    const matches = this.allCliCommands.filter(c => c.startsWith(partial));
    if (matches.length === 1) {
      this.cliCommand = matches[0] + ' ';
    } else if (matches.length > 1) {
      this.cliPush('<span class="dim">Suggestions:</span> ' + matches.map(m => `<span class="success">${m}</span>`).join('  '), 'output');
    }
  }

  onCliResizeStart(event: MouseEvent) {
    if (this.cliFullscreen) return;
    this.cliResizing = true;
    const startY = event.clientY;
    const startHeight = this.cliHeight;
    const onMove = (e: MouseEvent) => {
      if (!this.cliResizing) return;
      this.cliHeight = Math.max(200, Math.min(window.innerHeight - 80, startHeight + (startY - e.clientY)));
    };
    const onUp = () => {
      this.cliResizing = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  executeCliCommand() {
    const raw = this.cliCommand.trim();
    if (!raw) return;
    this.cliPush(`<span class="command">&gt; ${this.escapeHtml(raw)}</span>`, 'output');
    this.cliCommand = '';
    this.cliCommandHistory.push(raw);
    this.cliHistoryIndex = -1;

    // Parse: support quoted strings for multi-word args
    const tokens = this.parseCliTokens(raw);
    const cmd = tokens[0]?.toLowerCase() || '';
    const sub = tokens[1]?.toLowerCase() || '';
    const args = tokens.slice(2);

    switch (cmd) {
      case 'help': this.cliHelp(sub); break;
      case 'clear': case 'cls': this.cliHistory = []; break;

      // === Workspace ===
      case 'workspace': case 'ws':
        this.cliWorkspace(sub, args, tokens); break;

      // === Requirement ===
      case 'requirement': case 'req':
        this.cliRequirement(sub, args, tokens); break;

      // === Workflow ===
      case 'workflow': case 'wf':
        this.cliWorkflow(sub, args, tokens); break;

      // === Agent ===
      case 'agent': case 'agents':
        if (cmd === 'agents' || sub === 'list' || sub === 'pipeline') this.cliAgentList();
        else if (sub === 'output' || sub === 'view') this.cliAgentOutput(args);
        else this.cliAgentList();
        break;

      // === User Story ===
      case 'userstory': case 'story': case 'us':
        this.cliUserStory(sub, args); break;

      // === Navigation ===
      case 'navigate': case 'goto': case 'nav': case 'open': case 'cd':
        this.cliNavigate(sub || args[0]); break;

      // === DevOps ===
      case 'devops': case 'azure':
        this.cliDevOps(sub, args, tokens); break;

      // === Developer Mode ===
      case 'devmode': case 'dev':
        this.cliDevMode(sub, args, tokens); break;

      // === System ===
      case 'health': case 'status': this.cliHealth(); break;
      case 'version': this.cliPush('<span class="info">AxiomDSF CLI v1.0.0</span> — Angular 17 · Spring Boot', 'output'); break;
      case 'uptime': this.cliUptime(); break;
      case 'whoami': this.cliPush(`<span class="success">${this.escapeHtml(this.username)}</span> (Developer)`, 'output'); break;

      // === Appearance ===
      case 'theme': this.cliTheme(sub); break;
      case 'dark': this.cliSetDarkMode(true); break;
      case 'light': this.cliSetDarkMode(false); break;
      case 'fullscreen': case 'fs': this.cliFullscreen = !this.cliFullscreen; break;

      // === Misc ===
      case 'history':
        if (this.cliCommandHistory.length === 0) { this.cliPush('No command history.', 'dim'); }
        else { this.cliCommandHistory.forEach((c, i) => this.cliPush(`  <span class="dim">${i + 1}.</span> ${this.escapeHtml(c)}`, 'output')); }
        break;
      case 'shortcut': case 'shortcuts': case 'keys': this.cliShortcuts(); break;
      case 'export':
        this.cliExport(sub, args); break;
      case 'logout': case 'exit':
        if (cmd === 'exit') { this.showCliPanel = false; }
        else { this.logout(); this.showCliPanel = false; }
        break;

      default:
        this.cliPush(`<span class="error">Unknown command:</span> <span class="warn">${this.escapeHtml(cmd)}</span>. Type <span class="success">help</span> for available commands.`, 'output');
    }
  }

  private parseCliTokens(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    for (const ch of input) {
      if (inQuote) {
        if (ch === quoteChar) { inQuote = false; }
        else { current += ch; }
      } else if (ch === '"' || ch === "'") {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === ' ') {
        if (current) { tokens.push(current); current = ''; }
      } else {
        current += ch;
      }
    }
    if (current) tokens.push(current);
    return tokens;
  }

  // ── Help ─────────────────────────────────────────
  private cliHelp(topic: string) {
    if (!topic) {
      this.cliPush('', 'output');
      this.cliPush('<span class="info">━━━ WORKSPACE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>', 'output');
      this.cliPush('  <span class="success">workspace list</span>                        List all workspaces', 'output');
      this.cliPush('  <span class="success">workspace create</span> &lt;name&gt; [tech] [desc] Create a workspace', 'output');
      this.cliPush('  <span class="success">workspace get</span> &lt;name&gt;                  Get workspace by name', 'output');
      this.cliPush('  <span class="success">workspace open</span> &lt;id&gt;                   Open workspace in GUI', 'output');
      this.cliPush('', 'output');
      this.cliPush('<span class="info">━━━ REQUIREMENT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>', 'output');
      this.cliPush('  <span class="success">requirement list</span> &lt;workspaceId&gt;        List requirements', 'output');
      this.cliPush('  <span class="success">requirement add</span> &lt;wsId&gt; &lt;text&gt;         Add a requirement', 'output');
      this.cliPush('', 'output');
      this.cliPush('<span class="info">━━━ WORKFLOW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>', 'output');
      this.cliPush('  <span class="success">workflow start</span> &lt;wsId&gt; [reqId] [text]  Start a workflow', 'output');
      this.cliPush('  <span class="success">workflow status</span> &lt;wsId&gt; &lt;reqId&gt;        Check workflow status', 'output');
      this.cliPush('  <span class="success">workflow all</span>                           List all workflows', 'output');
      this.cliPush('  <span class="success">workflow approve</span> &lt;wsId&gt; &lt;reqId&gt; [msg] Approve current agent', 'output');
      this.cliPush('  <span class="success">workflow reject</span> &lt;wsId&gt; &lt;reqId&gt; [msg]  Reject workflow', 'output');
      this.cliPush('  <span class="success">workflow rework</span> &lt;wsId&gt; &lt;reqId&gt; &lt;msg&gt;  Rework with feedback', 'output');
      this.cliPush('', 'output');
      this.cliPush('<span class="info">━━━ AGENTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>', 'output');
      this.cliPush('  <span class="success">agents</span>                                Show agent pipeline', 'output');
      this.cliPush('  <span class="success">agent output</span> &lt;num&gt; &lt;wsId&gt; &lt;reqId&gt;     View agent output', 'output');
      this.cliPush('', 'output');
      this.cliPush('<span class="info">━━━ USER STORIES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>', 'output');
      this.cliPush('  <span class="success">userstory list</span> &lt;wsId&gt;                 List user stories', 'output');
      this.cliPush('', 'output');
      this.cliPush('<span class="info">━━━ NAVIGATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>', 'output');
      this.cliPush('  <span class="success">goto</span> &lt;page&gt;                            Navigate to page', 'output');
      this.cliPush('  Pages: dashboard, workspaces, create, workflow, status, devops', 'dim');
      this.cliPush('', 'output');
      this.cliPush('<span class="info">━━━ AZURE DEVOPS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>', 'output');
      this.cliPush('  <span class="success">devops connect</span> &lt;org&gt; &lt;project&gt; &lt;pat&gt;  Connect to Azure DevOps', 'output');
      this.cliPush('  <span class="success">devops disconnect</span>                     Disconnect', 'output');
      this.cliPush('  <span class="success">devops pull</span> [type] [state] [top]       Pull work items', 'output');
      this.cliPush('  <span class="success">devops push-code</span> &lt;wsId&gt; &lt;repo&gt; &lt;branch&gt; Push code', 'output');
      this.cliPush('  <span class="success">devops push-stories</span> &lt;wsId&gt;            Push user stories', 'output');
      this.cliPush('', 'output');
      this.cliPush('<span class="info">━━━ DEVELOPER MODE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>', 'output');
      this.cliPush('  <span class="success">devmode</span>                               Toggle developer mode info', 'output');
      this.cliPush('  <span class="success">devmode run</span> &lt;agentNum&gt; &lt;wsId&gt; &lt;reqId&gt;  Run agent directly', 'output');
      this.cliPush('  <span class="success">devmode start</span> &lt;wsId&gt; &lt;reqId&gt;           Start fresh workflow', 'output');
      this.cliPush('', 'output');
      this.cliPush('<span class="info">━━━ SYSTEM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>', 'output');
      this.cliPush('  <span class="success">health</span>                                System health & stats', 'output');
      this.cliPush('  <span class="success">whoami</span>                                Show current user', 'output');
      this.cliPush('  <span class="success">version</span>                               Show version info', 'output');
      this.cliPush('  <span class="success">uptime</span>                                Show backend uptime', 'output');
      this.cliPush('', 'output');
      this.cliPush('<span class="info">━━━ APPEARANCE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>', 'output');
      this.cliPush('  <span class="success">theme</span> [name]                           Change/cycle theme', 'output');
      this.cliPush('  <span class="success">dark</span> / <span class="success">light</span>                          Toggle dark/light mode', 'output');
      this.cliPush('  <span class="success">fullscreen</span>                            Toggle CLI fullscreen', 'output');
      this.cliPush('', 'output');
      this.cliPush('<span class="info">━━━ MISC ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>', 'output');
      this.cliPush('  <span class="success">export</span> agent &lt;num&gt; &lt;wsId&gt; &lt;reqId&gt;      Download agent output', 'output');
      this.cliPush('  <span class="success">history</span>                               Show command history', 'output');
      this.cliPush('  <span class="success">shortcuts</span>                             Show keyboard shortcuts', 'output');
      this.cliPush('  <span class="success">clear</span>                                 Clear terminal', 'output');
      this.cliPush('  <span class="success">exit</span>                                  Close CLI panel', 'output');
      this.cliPush('  <span class="success">logout</span>                                Sign out', 'output');
      this.cliPush('', 'output');
      this.cliPush('<span class="dim">Aliases: ws=workspace, req=requirement, wf=workflow, us=userstory, nav=goto</span>', 'output');
    } else {
      this.cliHelpDetail(topic);
    }
  }

  private cliHelpDetail(topic: string) {
    const details: Record<string, string[]> = {
      'workspace': [
        '<span class="info">workspace (alias: ws)</span>',
        '',
        '  <span class="success">workspace list</span>',
        '    List all workspaces with ID, name, tech stack, and status.',
        '',
        '  <span class="success">workspace create</span> &lt;name&gt; [techStack] [description]',
        '    Create a new workspace. Use quotes for multi-word values.',
        '    Example: ws create "My Project" "Java,Angular" "E-commerce app"',
        '',
        '  <span class="success">workspace get</span> &lt;name&gt;',
        '    Look up a workspace by its project name.',
        '',
        '  <span class="success">workspace open</span> &lt;id&gt;',
        '    Navigate to the workspace detail page in the GUI.',
      ],
      'requirement': [
        '<span class="info">requirement (alias: req)</span>',
        '',
        '  <span class="success">requirement list</span> &lt;workspaceId&gt;',
        '    List all requirements for a workspace.',
        '',
        '  <span class="success">requirement add</span> &lt;workspaceId&gt; &lt;requirementText&gt;',
        '    Create a new requirement. Use quotes for the text.',
        '    Example: req add 1 "Build a REST API for student management"',
      ],
      'workflow': [
        '<span class="info">workflow (alias: wf)</span>',
        '',
        '  <span class="success">workflow start</span> &lt;wsId&gt; [reqId] [requirementText]',
        '    Start a workflow. Provide either reqId or requirementText.',
        '    Example: wf start 1 5',
        '    Example: wf start 1 - "Build a login system"',
        '',
        '  <span class="success">workflow status</span> &lt;wsId&gt; &lt;reqId&gt;',
        '    Show current status of a workflow.',
        '',
        '  <span class="success">workflow all</span>',
        '    List all workflows across all workspaces.',
        '',
        '  <span class="success">workflow approve</span> &lt;wsId&gt; &lt;reqId&gt; [comments]',
        '    Approve the current agent\'s output. Pipeline moves forward.',
        '',
        '  <span class="success">workflow reject</span> &lt;wsId&gt; &lt;reqId&gt; [comments]',
        '    Reject the workflow. Stops the pipeline entirely.',
        '',
        '  <span class="success">workflow rework</span> &lt;wsId&gt; &lt;reqId&gt; &lt;comments&gt;',
        '    Request rework with feedback. Agent re-runs with comments.',
        '    Comments are <span class="error">required</span> for rework.',
      ],
      'agent': [
        '<span class="info">agents / agent</span>',
        '',
        '  <span class="success">agents</span> (or agent list)',
        '    Show the 10-agent pipeline with execution order.',
        '',
        '  <span class="success">agent output</span> &lt;agentNumber&gt; &lt;wsId&gt; &lt;reqId&gt;',
        '    View the output of a specific agent. Output is displayed as raw markdown.',
        '    Example: agent output 2 1 5    (view HLS output)',
      ],
      'goto': [
        '<span class="info">goto / navigate / nav</span>',
        '',
        '  <span class="success">goto</span> &lt;page&gt;',
        '    Navigate to a page without using the sidebar.',
        '',
        '  Available pages:',
        '    <span class="success">dashboard</span>    — Dashboard overview',
        '    <span class="success">workspaces</span>   — Workspace list',
        '    <span class="success">create</span>       — Create workspace',
        '    <span class="success">workflow</span>     — Start workflow',
        '    <span class="success">status</span>       — Workflow status',
        '    <span class="success">devops</span>       — Azure DevOps integration',
        '    <span class="success">ws &lt;id&gt;</span>      — Open specific workspace',
      ],
      'health': [
        '<span class="info">health / status</span>',
        '  Show system health including backend status, memory usage,',
        '  JVM info, uptime, and workspace/workflow statistics.',
      ],
      'theme': [
        '<span class="info">theme</span>',
        '',
        '  <span class="success">theme</span>            — Cycle to next random theme',
        '  <span class="success">theme list</span>       — Show all available themes',
        '  <span class="success">theme</span> &lt;name&gt;      — Apply a specific theme by name',
        '  Available: Forest Green, Ocean Blue, Royal Purple, Ruby Red,',
        '             Amber Gold, Teal Wave, Rose Pink, Indigo Night',
      ],
      'export': [
        '<span class="info">export</span>',
        '',
        '  <span class="success">export agent</span> &lt;num&gt; &lt;wsId&gt; &lt;reqId&gt;',
        '    Download the agent output as a .md file.',
        '    Example: export agent 3 1 5    (download HLD output)',
      ],
      'devops': [
        '<span class="info">devops (alias: azure)</span>',
        '',
        '  <span class="success">devops connect</span> &lt;organization&gt; &lt;project&gt; &lt;pat&gt;',
        '    Connect to Azure DevOps with the given credentials.',
        '    Example: devops connect MyOrg MyProject abcdef12345',
        '',
        '  <span class="success">devops disconnect</span>',
        '    Disconnect from Azure DevOps.',
        '',
        '  <span class="success">devops pull</span> [type] [state] [top]',
        '    Pull work items. Type: All, User Story, Task, Feature, Bug, Epic.',
        '    Example: devops pull "User Story" Active 20',
        '',
        '  <span class="success">devops push-code</span> &lt;wsId&gt; &lt;repoName&gt; &lt;branchName&gt;',
        '    Push coding agent output to a DevOps git repo.',
        '',
        '  <span class="success">devops push-stories</span> &lt;wsId&gt;',
        '    Push user stories from a workspace to DevOps Boards.',
      ],
      'devmode': [
        '<span class="info">devmode (alias: dev)</span>',
        '',
        '  <span class="success">devmode</span>',
        '    Show developer mode status and info.',
        '',
        '  <span class="success">devmode run</span> &lt;agentNumber&gt; &lt;wsId&gt; &lt;reqId&gt;',
        '    Run a specific agent directly for testing.',
        '    Example: devmode run 3 1 5   (run HLD agent on ws:1 req:5)',
        '',
        '  <span class="success">devmode start</span> &lt;wsId&gt; &lt;reqId&gt;',
        '    Start a fresh full-feature-pipeline workflow for testing.',
      ],
    };
    // Merge aliases
    details['ws'] = details['workspace'];
    details['req'] = details['requirement'];
    details['wf'] = details['workflow'];
    details['navigate'] = details['goto'];
    details['nav'] = details['goto'];
    details['status'] = details['health'];
    details['azure'] = details['devops'];
    details['dev'] = details['devmode'];

    const help = details[topic];
    if (help) {
      help.forEach(line => this.cliPush(line || '', line ? 'output' : 'output'));
    } else {
      this.cliPush(`<span class="error">No help available for:</span> ${this.escapeHtml(topic)}`, 'output');
    }
  }

  // ── Workspace ────────────────────────────────────
  private cliWorkspace(sub: string, args: string[], tokens: string[]) {
    switch (sub) {
      case 'list': case 'ls':
        this.cliPush('<span class="dim">Fetching workspaces...</span>', 'output');
        this.workspaceService.listWorkspaces().subscribe({
          next: (ws) => {
            if (ws.length === 0) { this.cliPush('No workspaces found. Create one with: <span class="success">workspace create &lt;name&gt;</span>', 'warn'); return; }
            this.cliTable(
              ['ID', 'Project Name', 'Tech Stack', 'Status'],
              ws.map(w => [String(w.id || '-'), w.projectName, w.techStack || '-', w.status ? '● Active' : '○ Inactive'])
            );
            this.cliPush(`<span class="dim">${ws.length} workspace(s) found.</span>`, 'output');
          },
          error: () => this.cliPush('<span class="error">✗ Failed to fetch workspaces. Is the backend running?</span>', 'output')
        });
        break;
      case 'create': case 'new':
        const wsName = args[0];
        if (!wsName) { this.cliPush('<span class="error">Usage:</span> workspace create &lt;name&gt; [techStack] [description]', 'output'); return; }
        const wsTech = args[1] || '';
        const wsDesc = args[2] || '';
        this.cliPush(`<span class="dim">Creating workspace "${this.escapeHtml(wsName)}"...</span>`, 'output');
        this.workspaceService.createWorkspace({
          projectName: wsName, techStack: wsTech, description: wsDesc
        }).subscribe({
          next: (w) => {
            this.cliPush(`<span class="success">✓ Workspace created!</span>`, 'output');
            this.cliTable(['Field', 'Value'], [
              ['ID', String(w.id)],
              ['Name', w.projectName],
              ['Tech', w.techStack || '-'],
              ['Desc', w.description || '-'],
            ]);
            this.loadSidebarWorkspaces();
          },
          error: (e) => this.cliPush(`<span class="error">✗ Failed to create workspace: ${e.message || 'Unknown error'}</span>`, 'output')
        });
        break;
      case 'get': case 'find':
        const findName = args[0];
        if (!findName) { this.cliPush('<span class="error">Usage:</span> workspace get &lt;name&gt;', 'output'); return; }
        this.workspaceService.getWorkspaceByName(findName).subscribe({
          next: (w) => {
            this.cliTable(['Field', 'Value'], [
              ['ID', String(w.id)],
              ['Name', w.projectName],
              ['Tech', w.techStack || '-'],
              ['Desc', w.description || '-'],
              ['Location', w.location || '-'],
              ['Status', w.status ? '● Active' : '○ Inactive'],
            ]);
          },
          error: () => this.cliPush(`<span class="error">✗ Workspace "${this.escapeHtml(findName)}" not found.</span>`, 'output')
        });
        break;
      case 'open': case 'view':
        const wsId = args[0];
        if (!wsId) { this.cliPush('<span class="error">Usage:</span> workspace open &lt;id&gt;', 'output'); return; }
        this.router.navigate(['/workspaces', wsId]);
        this.cliPush(`<span class="success">✓ Navigated to workspace #${this.escapeHtml(wsId)}</span>`, 'output');
        break;
      default:
        this.cliPush('<span class="error">Usage:</span> workspace &lt;list|create|get|open&gt; — type <span class="success">help workspace</span> for details', 'output');
    }
  }

  // ── Requirement ──────────────────────────────────
  private cliRequirement(sub: string, args: string[], tokens: string[]) {
    switch (sub) {
      case 'list': case 'ls':
        const rWsId = parseInt(args[0]);
        if (!rWsId) { this.cliPush('<span class="error">Usage:</span> requirement list &lt;workspaceId&gt;', 'output'); return; }
        this.cliPush('<span class="dim">Fetching requirements...</span>', 'output');
        this.requirementService.getByWorkspace(rWsId).subscribe({
          next: (reqs) => {
            if (reqs.length === 0) { this.cliPush(`No requirements found for workspace #${rWsId}.`, 'warn'); return; }
            this.cliTable(
              ['ID', 'Text', 'Created'],
              reqs.map(r => [String(r.id || '-'), (r.requirementText || '').substring(0, 60) + ((r.requirementText || '').length > 60 ? '...' : ''), r.createdAt || '-'])
            );
          },
          error: () => this.cliPush('<span class="error">✗ Failed to fetch requirements.</span>', 'output')
        });
        break;
      case 'add': case 'create': case 'new':
        const addWsId = parseInt(args[0]);
        const reqText = tokens.slice(3).join(' ') || args.slice(1).join(' ');
        if (!addWsId || !reqText) {
          this.cliPush('<span class="error">Usage:</span> requirement add &lt;workspaceId&gt; &lt;requirementText&gt;', 'output');
          return;
        }
        this.cliPush('<span class="dim">Creating requirement...</span>', 'output');
        this.requirementService.create(addWsId, reqText).subscribe({
          next: (r) => {
            this.cliPush(`<span class="success">✓ Requirement #${r.id} created for workspace #${addWsId}</span>`, 'output');
            this.cliPush(`  Text: ${this.escapeHtml(r.requirementText)}`, 'output');
          },
          error: () => this.cliPush('<span class="error">✗ Failed to create requirement.</span>', 'output')
        });
        break;
      default:
        this.cliPush('<span class="error">Usage:</span> requirement &lt;list|add&gt; — type <span class="success">help requirement</span> for details', 'output');
    }
  }

  // ── Workflow ─────────────────────────────────────
  private cliWorkflow(sub: string, args: string[], tokens: string[]) {
    switch (sub) {
      case 'start': case 'run':
        const sWsId = parseInt(args[0]);
        if (!sWsId) { this.cliPush('<span class="error">Usage:</span> workflow start &lt;wsId&gt; [reqId] [text]', 'output'); return; }
        const reqIdOrText = args[1];
        const reqId = parseInt(reqIdOrText);
        const reqText = isNaN(reqId) ? tokens.slice(3).join(' ') || args.slice(1).join(' ') : (args[2] ? tokens.slice(4).join(' ') : undefined);

        const startReq: StartWorkflowRequest = { workspaceId: sWsId };
        if (!isNaN(reqId) && reqIdOrText !== '-') {
          startReq.requirementId = reqId;
        }
        if (reqText && reqText !== '-') {
          startReq.requirementText = reqText;
        }

        this.cliPush('<span class="dim">Starting workflow...</span>', 'output');
        this.workflowService.startWorkflow(startReq).subscribe({
          next: (wf) => {
            this.cliPush(`<span class="success">✓ Workflow started!</span>`, 'output');
            this.cliTable(['Field', 'Value'], [
              ['Workflow ID', String(wf.id || '-')],
              ['Workspace', String(wf.workspaceId)],
              ['Requirement', String(wf.requirementId || '-')],
              ['Agent', wf.agentName || '-'],
              ['State', `<span class="agent-name">${wf.state}</span>`],
              ['Step', `${wf.sequenceNumber}/10`],
            ]);
          },
          error: (e) => this.cliPush(`<span class="error">✗ Failed to start workflow: ${e.error?.message || e.message || 'Unknown error'}</span>`, 'output')
        });
        break;

      case 'status': case 'info':
        const stWsId = parseInt(args[0]);
        const stReqId = parseInt(args[1]);
        if (!stWsId || !stReqId) { this.cliPush('<span class="error">Usage:</span> workflow status &lt;wsId&gt; &lt;reqId&gt;', 'output'); return; }
        this.workflowService.getWorkflowStatus(stWsId, stReqId).subscribe({
          next: (wf) => {
            const stateColor = wf.state === 'APPROVED' || wf.state === 'COMPLETED' ? 'success' :
                               wf.state === 'IN_PROGRESS' ? 'warn' :
                               wf.state === 'IN_REVIEW' ? 'highlight' : 'error';
            this.cliTable(['Field', 'Value'], [
              ['Workflow ID', String(wf.id || '-')],
              ['Agent', wf.agentName || '-'],
              ['State', wf.state],
              ['Step', `${wf.sequenceNumber}/10`],
              ['Pipeline Mode', wf.pipelineMode === 'full-sequence' ? 'Full Feature Pipeline' : (wf.pipelineMode || 'Per-Story')],
              ['Completed', wf.completionStatus ? 'Yes' : 'No'],
            ]);
          },
          error: () => this.cliPush(`<span class="error">✗ No workflow found for WS:${stWsId} REQ:${stReqId}</span>`, 'output')
        });
        break;

      case 'all': case 'list': case 'ls':
        this.cliPush('<span class="dim">Fetching all workflows...</span>', 'output');
        this.workflowService.getAllWorkflows().subscribe({
          next: (wfs) => {
            if (wfs.length === 0) { this.cliPush('No workflows found. Start one with: <span class="success">workflow start &lt;wsId&gt;</span>', 'warn'); return; }
            this.cliTable(
              ['ID', 'WS', 'Req', 'Agent', 'State', 'Step'],
              wfs.map(w => [String(w.id || '-'), String(w.workspaceId), String(w.requirementId || '-'),
                this.shortAgentName(w.agentName || '-'), w.state, `${w.sequenceNumber}/10`])
            );
            this.cliPush(`<span class="dim">${wfs.length} workflow(s) found.</span>`, 'output');
          },
          error: () => this.cliPush('<span class="error">✗ Failed to fetch workflows.</span>', 'output')
        });
        break;

      case 'approve':
        this.cliApproval('APPROVE', args, tokens); break;
      case 'reject':
        this.cliApproval('REJECT', args, tokens); break;
      case 'rework':
        this.cliApproval('REWORK', args, tokens); break;

      default:
        this.cliPush('<span class="error">Usage:</span> workflow &lt;start|status|all|approve|reject|rework&gt; — type <span class="success">help workflow</span>', 'output');
    }
  }

  private cliApproval(decision: 'APPROVE' | 'REJECT' | 'REWORK', args: string[], tokens: string[]) {
    const wsId = parseInt(args[0]);
    const reqId = parseInt(args[1]);
    const comments = tokens.slice(4).join(' ') || args.slice(2).join(' ');

    if (!wsId || !reqId) {
      this.cliPush(`<span class="error">Usage:</span> workflow ${decision.toLowerCase()} &lt;wsId&gt; &lt;reqId&gt; [comments]`, 'output');
      return;
    }
    if (decision === 'REWORK' && !comments) {
      this.cliPush('<span class="error">Rework requires feedback comments.</span> Usage: workflow rework &lt;wsId&gt; &lt;reqId&gt; &lt;comments&gt;', 'output');
      return;
    }

    const emoji = decision === 'APPROVE' ? '✓' : decision === 'REJECT' ? '✗' : '↻';
    const color = decision === 'APPROVE' ? 'success' : decision === 'REJECT' ? 'error' : 'warn';
    this.cliPush(`<span class="dim">Submitting ${decision.toLowerCase()} decision...</span>`, 'output');

    const req: WorkflowApprovalRequest = {
      workspaceId: wsId, requirementId: reqId, decision,
      comments: comments || undefined
    };
    this.workflowService.approveWorkflow(req).subscribe({
      next: (wf) => {
        this.cliPush(`<span class="${color}">${emoji} ${decision}!</span> Agent: ${wf.agentName || '-'} → State: ${wf.state}`, 'output');
        if (decision === 'APPROVE') {
          this.cliPush(`<span class="dim">Pipeline advancing to step ${wf.sequenceNumber}/10...</span>`, 'output');
        }
      },
      error: (e) => this.cliPush(`<span class="error">✗ Decision failed: ${e.error?.message || e.message || 'Unknown'}</span>`, 'output')
    });
  }

  // ── Agents ───────────────────────────────────────
  private cliAgentList() {
    this.cliPush('', 'output');
    this.cliPush('<span class="info">Agent Pipeline (10 stages)</span>', 'output');
    this.cliPush('', 'output');
    const agentData = [
      ['1', '📋', 'Requirement Analysis', 'Analyze & refine requirements'],
      ['2', '🏗️', 'HLS', 'High-level solution design'],
      ['3', '📐', 'HLD', 'High-level architecture & diagrams'],
      ['4', '📖', 'User Story', 'Break down into user stories'],
      ['5', '✅', 'Test Review Agent', 'Test review scenarios'],
      ['6', '⚙️', 'LLD', 'Low-level detailed design'],
      ['7', '🧪', 'TDD', 'Test-driven development specs'],
      ['8', '💻', 'Coding', 'Code implementation'],
      ['9', '🔍', 'Static Analysis', 'Code quality analysis'],
      ['10', '🔐', 'Security', 'Security assessment'],
    ];
    this.cliTable(['#', 'Icon', 'Agent', 'Description'], agentData);
    this.cliPush('', 'output');
    this.cliPush('<span class="dim">View output: agent output &lt;number&gt; &lt;wsId&gt; &lt;reqId&gt;</span>', 'output');
  }

  private cliAgentOutput(args: string[]) {
    const agentNum = parseInt(args[0]);
    const wsId = parseInt(args[1]);
    const reqId = parseInt(args[2]);
    if (!agentNum || !wsId || !reqId) {
      this.cliPush('<span class="error">Usage:</span> agent output &lt;agentNumber&gt; &lt;wsId&gt; &lt;reqId&gt;', 'output');
      return;
    }
    this.cliPush(`<span class="dim">Fetching agent #${agentNum} output...</span>`, 'output');
    this.workflowService.getAgentOutput(agentNum, wsId, reqId).subscribe({
      next: (res) => {
        const content = res?.content;
        if (!content) {
          this.cliPush(`<span class="warn">No output yet for agent #${agentNum}. Agent may still be running.</span>`, 'output');
          return;
        }
        const output = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        this.cliPush(`<span class="info">━━━ Agent #${agentNum} Output ━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>`, 'output');
        // Display line by line with basic coloring
        output.split('\n').forEach((line: string) => {
          const escaped = this.escapeHtml(line);
          if (line.startsWith('# ')) this.cliPush(`<span class="info">${escaped}</span>`, 'output');
          else if (line.startsWith('## ')) this.cliPush(`<span class="agent-name">${escaped}</span>`, 'output');
          else if (line.startsWith('### ')) this.cliPush(`<span class="highlight">${escaped}</span>`, 'output');
          else if (line.startsWith('```')) this.cliPush(`<span class="dim">${escaped}</span>`, 'output');
          else if (line.startsWith('- ') || line.startsWith('* ')) this.cliPush(`<span class="output">  ${escaped}</span>`, 'output');
          else if (line.startsWith('> ')) this.cliPush(`<span class="warn">${escaped}</span>`, 'output');
          else this.cliPush(escaped, 'output');
        });
        this.cliPush(`<span class="info">━━━ End Output ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>`, 'output');
        this.cliPush(`<span class="dim">Download: export agent ${agentNum} ${wsId} ${reqId}</span>`, 'output');
      },
      error: () => this.cliPush(`<span class="error">✗ Failed to fetch agent output.</span>`, 'output')
    });
  }

  // ── User Stories ─────────────────────────────────
  private cliUserStory(sub: string, args: string[]) {
    if (sub === 'list' || sub === 'ls') {
      const wsId = parseInt(args[0]);
      if (!wsId) { this.cliPush('<span class="error">Usage:</span> userstory list &lt;workspaceId&gt;', 'output'); return; }
      this.cliPush('<span class="dim">Fetching user stories...</span>', 'output');
      this.systemService.getUserStoriesByWorkspace(wsId).subscribe({
        next: (stories) => {
          if (stories.length === 0) { this.cliPush(`No user stories for workspace #${wsId}.`, 'warn'); return; }
          this.cliTable(
            ['ID', 'Story ID', 'Title', 'Priority'],
            stories.map(s => [String(s.id || '-'), s.storyId || '-', (s.title || '').substring(0, 45), s.priority || '-'])
          );
        },
        error: () => this.cliPush('<span class="error">✗ Failed to fetch user stories.</span>', 'output')
      });
    } else {
      this.cliPush('<span class="error">Usage:</span> userstory list &lt;workspaceId&gt;', 'output');
    }
  }

  // ── Navigation ───────────────────────────────────
  private cliNavigate(page: string) {
    if (!page) {
      this.cliPush('<span class="error">Usage:</span> goto &lt;page&gt;', 'output');
      this.cliPush('  Pages: dashboard, workspaces, create, workflow, status, devops, ws &lt;id&gt;', 'dim');
      return;
    }
    const routes: Record<string, string> = {
      'dashboard': '/dashboard', 'home': '/dashboard', 'd': '/dashboard',
      'workspaces': '/workspaces', 'ws': '/workspaces', 'w': '/workspaces',
      'create': '/workspaces/create', 'new': '/workspaces/create',
      'workflow': '/workflow/start', 'start': '/workflow/start',
      'status': '/workflow/status', 'st': '/workflow/status',
      'devops': '/devops', 'azure': '/devops',
    };
    const route = routes[page.toLowerCase()];
    if (route) {
      this.router.navigate([route]);
      this.cliPush(`<span class="success">✓ Navigated to ${route}</span>`, 'output');
    } else if (/^\d+$/.test(page)) {
      // Navigate to workspace by ID
      this.router.navigate(['/workspaces', page]);
      this.cliPush(`<span class="success">✓ Navigated to workspace #${page}</span>`, 'output');
    } else {
      this.cliPush(`<span class="error">Unknown page:</span> "${this.escapeHtml(page)}". Type <span class="success">goto</span> for available pages.`, 'output');
    }
  }

  // ── Health ───────────────────────────────────────
  private cliHealth() {
    this.cliPush('<span class="dim">Checking system health...</span>', 'output');
    this.systemService.getHealth().subscribe({
      next: (h) => {
        const memPct = h.memory.maxMB > 0 ? Math.round((h.memory.usedMB / h.memory.maxMB) * 100) : 0;
        const barLen = 20;
        const filled = Math.round((memPct / 100) * barLen);
        const memBar = '█'.repeat(filled) + '░'.repeat(barLen - filled);

        this.cliPush('', 'output');
        this.cliPush(`  <span class="info">System Status</span>: <span class="${h.status === 'UP' ? 'success' : 'error'}">${h.status === 'UP' ? '● ONLINE' : '● OFFLINE'}</span>`, 'output');
        this.cliPush(`  <span class="info">Uptime</span>:        ${h.uptime}`, 'output');
        this.cliPush('', 'output');
        this.cliTable(['Metric', 'Value'], [
          ['JVM', `${h.jvm.version} (${h.jvm.vendor})`],
          ['OS', h.jvm.os],
          ['Memory', `${h.memory.usedMB}MB / ${h.memory.maxMB}MB (${memPct}%)`],
          ['', `[${memBar}]`],
          ['Workspaces', String(h.stats.workspaces)],
          ['Total Workflows', String(h.stats.totalWorkflows)],
          ['Active Workflows', String(h.stats.activeWorkflows)],
          ['Completed', String(h.stats.completedWorkflows)],
          ['Agents Configured', String(h.stats.configuredAgents)],
        ]);
      },
      error: () => this.cliPush('<span class="error">✗ Backend unreachable.</span> Ensure the server is running on port 8080.', 'output')
    });
  }

  private cliUptime() {
    this.systemService.getHealth().subscribe({
      next: (h) => this.cliPush(`<span class="info">Uptime:</span> ${h.uptime}`, 'output'),
      error: () => this.cliPush('<span class="error">✗ Backend unreachable.</span>', 'output')
    });
  }

  // ── Theme ────────────────────────────────────────
  private cliTheme(arg: string) {
    if (arg === 'list') {
      this.cliTable(['#', 'Theme', 'Active'],
        this.themes.map((t, i) => [String(i + 1), t.name, t.name === this.currentTheme.name ? '← current' : ''])
      );
      return;
    }
    if (arg) {
      const match = this.themes.find(t => t.name.toLowerCase().includes(arg.toLowerCase()));
      if (match) {
        this.currentTheme = match;
        this.applyTheme();
        this.cliPush(`<span class="success">✓ Theme changed to: ${match.name}</span>`, 'output');
      } else {
        this.cliPush(`<span class="error">Unknown theme.</span> Type <span class="success">theme list</span> to see options.`, 'output');
      }
    } else {
      this.currentTheme = this.themes[Math.floor(Math.random() * this.themes.length)];
      this.applyTheme();
      this.cliPush(`<span class="success">✓ Theme changed to: ${this.currentTheme.name}</span>`, 'output');
    }
  }

  private cliSetDarkMode(dark: boolean) {
    if (this.darkMode === dark) {
      this.cliPush(`Already in ${dark ? 'dark' : 'light'} mode.`, 'dim');
      return;
    }
    this.toggleDarkMode();
    this.cliPush(`<span class="success">✓ Switched to ${dark ? 'dark' : 'light'} mode.</span>`, 'output');
  }

  // ── Shortcuts ────────────────────────────────────
  private cliShortcuts() {
    this.cliPush('', 'output');
    this.cliPush('<span class="info">Keyboard Shortcuts</span>', 'output');
    this.cliPush('', 'output');
    this.cliTable(['Shortcut', 'Action'], [
      ['Alt + T', 'Toggle CLI terminal'],
      ['Alt + D', 'Go to Dashboard'],
      ['Alt + W', 'Go to Workspaces'],
      ['Alt + N', 'Create Workspace'],
      ['Alt + S', 'Start Workflow'],
      ['Alt + K', 'Toggle Dark Mode'],
      ['↑ / ↓', 'Navigate command history'],
      ['Tab', 'Autocomplete command'],
      ['Ctrl + L', 'Clear terminal'],
    ]);
  }

  // ── Export ───────────────────────────────────────
  private cliExport(sub: string, args: string[]) {
    if (sub === 'agent') {
      const agentNum = parseInt(args[0]);
      const wsId = parseInt(args[1]);
      const reqId = parseInt(args[2]);
      if (!agentNum || !wsId || !reqId) {
        this.cliPush('<span class="error">Usage:</span> export agent &lt;number&gt; &lt;wsId&gt; &lt;reqId&gt;', 'output');
        return;
      }
      this.cliPush('<span class="dim">Downloading agent output...</span>', 'output');
      this.workflowService.getAgentOutput(agentNum, wsId, reqId).subscribe({
        next: (res) => {
          const content = res?.content;
          if (!content) { this.cliPush('<span class="warn">No output available to export.</span>', 'output'); return; }
          const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
          const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `agent_${agentNum}_ws${wsId}_req${reqId}.md`;
          a.click();
          URL.revokeObjectURL(url);
          this.cliPush(`<span class="success">✓ Downloaded: agent_${agentNum}_ws${wsId}_req${reqId}.md</span>`, 'output');
        },
        error: () => this.cliPush('<span class="error">✗ Failed to fetch output for export.</span>', 'output')
      });
    } else {
      this.cliPush('<span class="error">Usage:</span> export agent &lt;number&gt; &lt;wsId&gt; &lt;reqId&gt;', 'output');
    }
  }

  private shortAgentName(name: string): string {
    return name.replace('Agent', '').replace(/([A-Z])/g, ' $1').trim();
  }

  // ── Azure DevOps (CLI) ──────────────────────────
  private cliDevOps(sub: string, args: string[], tokens: string[]) {
    switch (sub) {
      case 'connect':
        const org = args[0];
        const proj = args[1];
        const pat = args[2];
        if (!org || !proj || !pat) {
          this.cliPush('<span class="error">Usage:</span> devops connect &lt;organization&gt; &lt;project&gt; &lt;pat&gt;', 'output');
          return;
        }
        this.cliPush('<span class="dim">Testing connection...</span>', 'output');
        this.cliDevOpsConn = { organization: org, project: proj, pat };
        this.devOpsService.testConnection(this.cliDevOpsConn).subscribe({
          next: (res) => {
            if (res.connected) {
              this.cliDevOpsConnected = true;
              this.cliPush(`<span class="success">✓ Connected to Azure DevOps:</span> ${this.escapeHtml(org)}/${this.escapeHtml(proj)}`, 'output');
            } else {
              this.cliPush(`<span class="error">✗ Connection failed:</span> ${res.error || 'Check credentials'}`, 'output');
            }
          },
          error: () => this.cliPush('<span class="error">✗ Connection failed.</span>', 'output')
        });
        break;

      case 'disconnect':
        this.cliDevOpsConnected = false;
        this.cliDevOpsConn = { organization: '', project: '', pat: '' };
        this.cliPush('<span class="success">✓ Disconnected from Azure DevOps.</span>', 'output');
        break;

      case 'pull':
        if (!this.cliDevOpsConnected) {
          this.cliPush('<span class="error">Not connected.</span> Use: devops connect &lt;org&gt; &lt;project&gt; &lt;pat&gt;', 'output');
          return;
        }
        const wiType = args[0] || 'All';
        const wiState = args[1] || 'All';
        const wiTop = parseInt(args[2]) || 25;
        this.cliPush(`<span class="dim">Fetching ${wiType} work items (state: ${wiState}, max: ${wiTop})...</span>`, 'output');
        this.devOpsService.getWorkItems(this.cliDevOpsConn, wiType, wiState, wiTop).subscribe({
          next: (res) => {
            const items = (res as any).value || [];
            if (items.length === 0) { this.cliPush('No work items found.', 'warn'); return; }
            this.cliTable(
              ['ID', 'Type', 'Title', 'State', 'Priority'],
              items.map((wi: any) => [
                String(wi.id),
                wi.fields?.['System.WorkItemType'] || '-',
                (wi.fields?.['System.Title'] || '-').substring(0, 45),
                wi.fields?.['System.State'] || '-',
                String(wi.fields?.['Microsoft.VSTS.Common.Priority'] || '-')
              ])
            );
            this.cliPush(`<span class="dim">${items.length} work item(s) found.</span>`, 'output');
          },
          error: () => this.cliPush('<span class="error">✗ Failed to fetch work items.</span>', 'output')
        });
        break;

      case 'push-code':
        if (!this.cliDevOpsConnected) {
          this.cliPush('<span class="error">Not connected.</span> Use: devops connect &lt;org&gt; &lt;project&gt; &lt;pat&gt;', 'output');
          return;
        }
        const cWsId = parseInt(args[0]);
        const repoName = args[1];
        const branchName = args[2];
        if (!cWsId || !repoName || !branchName) {
          this.cliPush('<span class="error">Usage:</span> devops push-code &lt;wsId&gt; &lt;repoName&gt; &lt;branchName&gt;', 'output');
          return;
        }
        this.cliPush('<span class="dim">Getting repos...</span>', 'output');
        this.devOpsService.listRepos(this.cliDevOpsConn).subscribe({
          next: (repoRes) => {
            const repos = (repoRes as any).value || [];
            const repo = repos.find((r: any) => r.name.toLowerCase() === repoName.toLowerCase());
            if (!repo) {
              this.cliPush(`<span class="error">Repository "${this.escapeHtml(repoName)}" not found.</span> Available: ${repos.map((r: any) => r.name).join(', ')}`, 'output');
              return;
            }
            this.cliPush('<span class="dim">Fetching coding agent output...</span>', 'output');
            this.workflowService.getAllWorkflows().subscribe({
              next: (wfs) => {
                const codingWf = wfs.find(w => w.workspaceId === cWsId && w.sequenceNumber === 8);
                if (!codingWf) { this.cliPush('<span class="error">No coding workflow found.</span>', 'output'); return; }
                this.workflowService.getAgentOutput(8, codingWf.workspaceId, codingWf.requirementId!, codingWf.userStoryId).subscribe({
                  next: (res) => {
                    const content = res?.content || '';
                    if (!content) { this.cliPush('<span class="error">No code output found.</span>', 'output'); return; }
                    const files = this.parseCodeFilesForCli(content);
                    if (files.length === 0) { this.cliPush('<span class="error">No files parsed from output.</span>', 'output'); return; }
                    this.cliPush(`<span class="dim">Pushing ${files.length} files to ${repo.name}/${branchName}...</span>`, 'output');
                    this.devOpsService.pushCode({
                      ...this.cliDevOpsConn,
                      repositoryId: repo.id,
                      branchName,
                      sourceBranch: 'main',
                      commitMessage: `Code generated by AxiomDSF for workspace #${cWsId}`,
                      files
                    }).subscribe({
                      next: (pushRes) => {
                        if (pushRes.success) {
                          this.cliPush(`<span class="success">✓ Pushed ${pushRes.filesCount} files to branch '${pushRes.branch}'!</span>`, 'output');
                        } else {
                          this.cliPush(`<span class="error">✗ Push failed: ${pushRes.error}</span>`, 'output');
                        }
                      },
                      error: (e) => this.cliPush(`<span class="error">✗ Push failed: ${e.error?.error || 'Unknown'}</span>`, 'output')
                    });
                  },
                  error: () => this.cliPush('<span class="error">✗ Failed to fetch code.</span>', 'output')
                });
              },
              error: () => this.cliPush('<span class="error">✗ Failed to list workflows.</span>', 'output')
            });
          },
          error: () => this.cliPush('<span class="error">✗ Failed to list repos.</span>', 'output')
        });
        break;

      case 'push-stories':
        if (!this.cliDevOpsConnected) {
          this.cliPush('<span class="error">Not connected.</span> Use: devops connect &lt;org&gt; &lt;project&gt; &lt;pat&gt;', 'output');
          return;
        }
        const sWsId = parseInt(args[0]);
        if (!sWsId) { this.cliPush('<span class="error">Usage:</span> devops push-stories &lt;workspaceId&gt;', 'output'); return; }
        this.cliPush('<span class="dim">Fetching user stories...</span>', 'output');
        this.systemService.getUserStoriesByWorkspace(sWsId).subscribe({
          next: (stories) => {
            if (stories.length === 0) { this.cliPush('<span class="warn">No user stories found.</span>', 'output'); return; }
            this.cliPush(`<span class="dim">Pushing ${stories.length} stories to Azure DevOps...</span>`, 'output');
            const workItems = stories.map(s => ({
              title: `${s.storyId}: ${s.title}`,
              description: s.userStoryText || `<p>${s.title}</p><p>Priority: ${s.priority}</p>`,
              tags: 'AxiomDSF;AI-Generated',
              priority: s.priority === 'High' ? 1 : s.priority === 'Medium' ? 2 : 3
            }));
            this.devOpsService.createWorkItemsBatch({
              ...this.cliDevOpsConn,
              workItemType: 'User Story',
              workItems
            }).subscribe({
              next: (res) => {
                this.cliPush(`<span class="success">✓ Pushed ${res.successCount}/${res.totalCount} stories!</span>`, 'output');
                if (res.failCount > 0) this.cliPush(`<span class="warn">${res.failCount} failed.</span>`, 'output');
              },
              error: () => this.cliPush('<span class="error">✗ Failed to push stories.</span>', 'output')
            });
          },
          error: () => this.cliPush('<span class="error">✗ Failed to fetch stories.</span>', 'output')
        });
        break;

      case 'status': case 'info':
        if (this.cliDevOpsConnected) {
          this.cliPush(`<span class="success">● Connected</span> — ${this.escapeHtml(this.cliDevOpsConn.organization)}/${this.escapeHtml(this.cliDevOpsConn.project)}`, 'output');
        } else {
          this.cliPush('<span class="warn">○ Not connected.</span> Use: devops connect &lt;org&gt; &lt;project&gt; &lt;pat&gt;', 'output');
        }
        break;

      default:
        this.cliPush('<span class="error">Usage:</span> devops &lt;connect|pull|push-code|push-stories|disconnect&gt; — type <span class="success">help devops</span>', 'output');
    }
  }

  private parseCodeFilesForCli(output: string): { path: string; content: string }[] {
    const files: { path: string; content: string }[] = [];
    const fileHeaderPattern = /### FILE:\s*(.+?)\s*\n```(\w*)\s*\n([\s\S]*?)```/g;
    let match;
    let found = false;
    while ((match = fileHeaderPattern.exec(output)) !== null) {
      found = true;
      files.push({ path: match[1].trim(), content: match[3].trim() });
    }
    if (!found) {
      const codeBlockPattern = /```(\w*)\s*\n([\s\S]*?)```/g;
      let idx = 0;
      while ((match = codeBlockPattern.exec(output)) !== null) {
        idx++;
        const lang = match[1] || 'txt';
        const block = match[2];
        const ext: Record<string, string> = { java: '.java', ts: '.ts', html: '.html', css: '.css', python: '.py', py: '.py', js: '.js', xml: '.xml' };
        files.push({ path: `code-snippet-${idx}${ext[lang] || '.txt'}`, content: block.trim() });
      }
    }
    return files;
  }

  // ── Developer Mode (CLI) ────────────────────────
  private cliDevMode(sub: string, args: string[], tokens: string[]) {
    switch (sub) {
      case 'run':
        const agentNum = parseInt(args[0]);
        const wsId = parseInt(args[1]);
        const reqId = parseInt(args[2]);
        if (!agentNum || !wsId || !reqId) {
          this.cliPush('<span class="error">Usage:</span> devmode run &lt;agentNumber&gt; &lt;wsId&gt; &lt;reqId&gt;', 'output');
          return;
        }
        const agentNames: Record<number, string> = {
          1: 'RequirementAnalysisRefinementAgent', 2: 'HLSAgent', 3: 'HLDAgent',
          4: 'UserStoryAgent', 5: 'TRReviewAgent', 6: 'LLDAgent', 7: 'TDDAgent',
          8: 'CodingAgent', 9: 'StaticCodeAnalysisAgent', 10: 'SecurityAgent'
        };
        const agentName = agentNames[agentNum];
        if (!agentName) { this.cliPush('<span class="error">Invalid agent number (1-10).</span>', 'output'); return; }
        this.cliPush(`<span class="dim">Running ${this.shortAgentName(agentName)} (#${agentNum}) on WS:${wsId} REQ:${reqId}...</span>`, 'output');
        this.workflowService.startWorkflow({
          workspaceId: wsId, requirementId: reqId, agentName
        }).subscribe({
          next: (wf) => {
            this.cliPush(`<span class="success">✓ ${this.shortAgentName(agentName)} triggered!</span> State: ${wf.state}, Step: ${wf.sequenceNumber}/10`, 'output');
            this.cliPush(`<span class="dim">View output: agent output ${agentNum} ${wsId} ${reqId}</span>`, 'output');
          },
          error: (e) => this.cliPush(`<span class="error">✗ Failed: ${e.error?.message || e.message || 'Unknown'}</span>`, 'output')
        });
        break;

      case 'start':
        const sWsId = parseInt(args[0]);
        const sReqId = parseInt(args[1]);
        if (!sWsId || !sReqId) { this.cliPush('<span class="error">Usage:</span> devmode start &lt;wsId&gt; &lt;reqId&gt;', 'output'); return; }
        this.cliPush(`<span class="dim">Starting fresh full-feature-pipeline workflow for WS:${sWsId} REQ:${sReqId}...</span>`, 'output');
        this.workflowService.startWorkflow({
          workspaceId: sWsId, requirementId: sReqId, pipelineMode: 'full-sequence'
        }).subscribe({
          next: (wf) => this.cliPush(`<span class="success">✓ Workflow started!</span> Agent: ${wf.agentName}, State: ${wf.state}`, 'output'),
          error: (e) => this.cliPush(`<span class="error">✗ Failed: ${e.error?.message || e.message || 'Unknown'}</span>`, 'output')
        });
        break;

      default:
        this.cliPush('', 'output');
        this.cliPush('<span class="info">🧪 Developer Mode</span>', 'output');
        this.cliPush('', 'output');
        this.cliPush('Run agents individually for testing without waiting for the full pipeline.', 'output');
        this.cliPush('', 'output');
        this.cliPush('  <span class="success">devmode run</span> &lt;agentNum&gt; &lt;wsId&gt; &lt;reqId&gt;  — Run specific agent', 'output');
        this.cliPush('  <span class="success">devmode start</span> &lt;wsId&gt; &lt;reqId&gt;           — Fresh workflow', 'output');
        this.cliPush('', 'output');
        this.cliTable(['#', 'Agent', 'Command'], [
          ['1', 'Requirement Analysis', 'devmode run 1 <wsId> <reqId>'],
          ['2', 'HLS', 'devmode run 2 <wsId> <reqId>'],
          ['3', 'HLD', 'devmode run 3 <wsId> <reqId>'],
          ['4', 'User Story', 'devmode run 4 <wsId> <reqId>'],
          ['5', 'Test Review Agent', 'devmode run 5 <wsId> <reqId>'],
          ['6', 'LLD', 'devmode run 6 <wsId> <reqId>'],
          ['7', 'TDD', 'devmode run 7 <wsId> <reqId>'],
          ['8', 'Coding', 'devmode run 8 <wsId> <reqId>'],
          ['9', 'Static Analysis', 'devmode run 9 <wsId> <reqId>'],
          ['10', 'Security', 'devmode run 10 <wsId> <reqId>'],
        ]);
        this.cliPush('', 'output');
        if (this.cliDevOpsConnected) {
          this.cliPush(`<span class="success">Azure DevOps: ● Connected</span> (${this.escapeHtml(this.cliDevOpsConn.organization)})`, 'output');
        } else {
          this.cliPush('<span class="dim">Azure DevOps: ○ Not connected</span> — devops connect &lt;org&gt; &lt;project&gt; &lt;pat&gt;', 'output');
        }
    }
  }
}
