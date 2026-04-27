import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { WorkspaceService, Workspace, AzureDevOpsValidationResponse } from '../../services/workspace.service';

interface DepSuggestion {
  name: string;
  category: string;
  description: string;
  selected: boolean;
}

@Component({
  selector: 'app-workspace-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  template: `
    <div class="create-workspace">
      <div class="page-header">
        <h1><i class="fas fa-plus-circle"></i> Create New Workspace</h1>
      </div>

      <div class="form-container">
        <div class="form-card data-card">
          <form [formGroup]="workspaceForm" (ngSubmit)="onSubmit()">
            <div class="input-group">
              <label for="projectName"><i class="fas fa-tag"></i> Workspace Name *</label>
              <input type="text" id="projectName" formControlName="projectName"
                     placeholder="Enter workspace name" [class.invalid]="isInvalid('projectName')">
              <span class="error-text" *ngIf="isInvalid('projectName')">Workspace name is required</span>
            </div>

            <div class="input-group">
              <label for="description"><i class="fas fa-align-left"></i> Description</label>
              <textarea id="description" formControlName="description"
                        placeholder="Enter workspace description (optional)" rows="4"></textarea>
            </div>

            <div class="input-group">
              <label for="techStack"><i class="fas fa-layer-group"></i> Tech Stack</label>
              <input type="text" id="techStack" formControlName="techStack"
                     placeholder="e.g., Java, Spring Boot, Angular"
                     (input)="onTechStackChange()">
              <span class="hint">Enter technologies to get dependency suggestions below</span>
            </div>

            <!-- Azure DevOps Integration -->
            <div class="azure-devops-section">
              <div class="section-header" (click)="toggleAzureDevOps()">
                <h3>
                  <i class="fab fa-microsoft"></i> Azure DevOps Integration
                  <span class="toggle-badge" [class.enabled]="workspaceForm.get('azureDevOpsEnabled')?.value">
                    {{ workspaceForm.get('azureDevOpsEnabled')?.value ? 'Enabled' : 'Disabled' }}
                  </span>
                </h3>
                <label class="toggle-switch">
                  <input type="checkbox" formControlName="azureDevOpsEnabled">
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div class="azure-devops-config" *ngIf="workspaceForm.get('azureDevOpsEnabled')?.value">
                <p class="config-hint">
                  <i class="fas fa-info-circle"></i>
                  Connect to Azure DevOps to automatically create branches, folders, and work items.
                </p>

                <div class="input-group">
                  <label for="azureDevOpsOrganizationUrl">
                    <i class="fas fa-building"></i> Organization URL *
                  </label>
                  <input type="text" id="azureDevOpsOrganizationUrl" 
                         formControlName="azureDevOpsOrganizationUrl"
                         placeholder="https://dev.azure.com/YourOrganization">
                  <span class="hint">e.g., https://dev.azure.com/NextSTEP2</span>
                </div>

                <div class="input-group">
                  <label for="azureDevOpsProject">
                    <i class="fas fa-project-diagram"></i> Project Name *
                  </label>
                  <input type="text" id="azureDevOpsProject" 
                         formControlName="azureDevOpsProject"
                         placeholder="Enter project name">
                </div>

                <div class="input-group">
                  <label for="azureDevOpsRepository">
                    <i class="fas fa-code-branch"></i> Repository Name *
                  </label>
                  <input type="text" id="azureDevOpsRepository" 
                         formControlName="azureDevOpsRepository"
                         placeholder="Enter repository name">
                </div>

                <div class="input-group">
                  <label for="azureDevOpsPersonalAccessToken">
                    <i class="fas fa-key"></i> Personal Access Token (PAT) *
                  </label>
                  <div class="password-input">
                    <input [type]="showPat ? 'text' : 'password'" 
                           id="azureDevOpsPersonalAccessToken" 
                           formControlName="azureDevOpsPersonalAccessToken"
                           placeholder="Enter your PAT">
                    <button type="button" class="toggle-visibility" (click)="showPat = !showPat">
                      <i class="fas" [ngClass]="showPat ? 'fa-eye-slash' : 'fa-eye'"></i>
                    </button>
                  </div>
                  <span class="hint">
                    <a href="https://dev.azure.com/_usersSettings/tokens" target="_blank">
                      Create a PAT <i class="fas fa-external-link-alt"></i>
                    </a> with Code & Work Items permissions
                  </span>
                </div>

                <!-- Test Connection Button -->
                <div class="test-connection-section">
                  <button type="button" class="action-btn test-connection-btn"
                          [disabled]="testingConnection || !workspaceForm.get('azureDevOpsOrganizationUrl')?.value || !workspaceForm.get('azureDevOpsProject')?.value || !workspaceForm.get('azureDevOpsRepository')?.value || !workspaceForm.get('azureDevOpsPersonalAccessToken')?.value"
                          (click)="testConnection()">
                    <i class="fas" [ngClass]="testingConnection ? 'fa-spinner fa-spin' : 'fa-plug'"></i>
                    {{ testingConnection ? 'Testing...' : 'Test Connection' }}
                  </button>
                  <div *ngIf="connectionMessage" class="connection-status"
                       [class.connection-success]="connectionValid"
                       [class.connection-error]="!connectionValid">
                    <i class="fas" [ngClass]="connectionValid ? 'fa-check-circle' : 'fa-times-circle'"></i>
                    {{ connectionMessage }}
                  </div>
                </div>

                <!-- MCP Features -->
                <div class="mcp-features">
                  <h4><i class="fas fa-magic"></i> Auto-Enabled Features</h4>
                  <ul class="feature-list">
                    <li><i class="fas fa-code-branch"></i> Auto-create workspace branch</li>
                    <li><i class="fas fa-folder-plus"></i> Dynamic folder structure in repo</li>
                    <li><i class="fas fa-tasks"></i> Auto-create User Story work items</li>
                    <li><i class="fas fa-clipboard-check"></i> Auto-create Test Case work items</li>
                    <li><i class="fas fa-bug"></i> Auto-create Bug work items</li>
                    <li><i class="fas fa-book"></i> Wiki pages for all agent I/O</li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- Dependency Suggestions -->
            <div class="dep-suggestions" *ngIf="suggestions.length > 0">
              <h4><i class="fas fa-puzzle-piece"></i> Suggested Dependencies</h4>
              <p class="dep-hint">Based on your tech stack, here are recommended dependencies:</p>
              <div class="dep-categories">
                <div *ngFor="let cat of getCategories()" class="dep-category">
                  <span class="cat-label">{{ cat }}</span>
                  <div class="dep-chips">
                    <button *ngFor="let dep of getSuggestionsByCategory(cat)"
                            type="button"
                            class="dep-chip"
                            [class.selected]="dep.selected"
                            (click)="dep.selected = !dep.selected"
                            [title]="dep.description">
                      <i class="fas" [ngClass]="dep.selected ? 'fa-check-circle' : 'fa-plus-circle'"></i>
                      {{ dep.name }}
                    </button>
                  </div>
                </div>
              </div>
              <div class="selected-deps" *ngIf="getSelectedDeps().length > 0">
                <strong>Selected:</strong> {{ getSelectedDeps().join(', ') }}
              </div>
            </div>

            <div class="button-group">
              <button type="submit" class="action-btn primary" [disabled]="!workspaceForm.valid || submitting">
                <i class="fas" [ngClass]="submitting ? 'fa-spinner fa-spin' : 'fa-check'"></i>
                {{ submitting ? 'Creating...' : 'Create Workspace' }}
              </button>
              <button type="button" class="action-btn secondary" (click)="onCancel()">
                <i class="fas fa-times"></i> Cancel
              </button>
            </div>

            <div *ngIf="error" class="alert error-alert">
              <i class="fas fa-exclamation-triangle"></i> {{ error }}
            </div>

            <div *ngIf="successMessage" class="alert success-alert">
              <i class="fas fa-check-circle"></i> {{ successMessage }}
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .create-workspace { width: 100%; }
    .page-header { margin-bottom: 28px; }
    .page-header h1 { font-size: 1.6em; }
    .page-header h1 i { margin-right: 12px; color: #3A7D44; }

    .form-container { max-width: 800px; }

    .data-card {
      background: white; padding: 32px; border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }

    .input-group { margin-bottom: 20px; }
    .input-group label {
      display: block; margin-bottom: 6px; font-weight: 500; font-size: 0.9em; color: #333;
    }
    .input-group label i { margin-right: 6px; color: #3A7D44; }
    .input-group input, .input-group textarea {
      width: 100%; padding: 12px 14px; border: 1px solid #e0e0e0;
      border-radius: 8px; font-size: 0.95em; font-family: 'Poppins', sans-serif;
      transition: border-color 0.3s, box-shadow 0.3s;
    }
    .input-group input:focus, .input-group textarea:focus {
      outline: none; border-color: #3A7D44;
      box-shadow: 0 0 0 3px rgba(58,125,68,0.1);
    }
    .input-group input.invalid {
      border-color: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,0.1);
    }
    .error-text { color: #ef4444; font-size: 0.8em; margin-top: 4px; }
    .hint { font-size: 0.78em; color: #999; margin-top: 4px; display: block; }
    .hint a { color: #3A7D44; text-decoration: none; }
    .hint a:hover { text-decoration: underline; }

    /* Pipeline Mode */
    .pipeline-mode-options { display: flex; gap: 16px; flex-wrap: wrap; }
    .radio-option {
      flex: 1; min-width: 250px; padding: 16px; border: 2px solid #e0e0e0;
      border-radius: 10px; cursor: pointer; transition: all 0.3s;
    }
    .radio-option:hover { border-color: #3A7D44; }
    .radio-option.selected { border-color: #3A7D44; background: #f0fdf4; }
    .radio-option input[type="radio"] { margin-right: 10px; }
    .radio-content { display: flex; flex-direction: column; }
    .radio-content i { font-size: 1.3em; color: #3A7D44; margin-bottom: 6px; }
    .radio-label { font-weight: 600; font-size: 0.9em; }
    .radio-desc { font-size: 0.75em; color: #666; margin-top: 4px; }

    /* Azure DevOps Section */
    .azure-devops-section {
      margin: 24px 0; padding: 20px; border-radius: 10px;
      border: 2px solid #e0e0e0; background: #fafafa;
    }
    .section-header {
      display: flex; justify-content: space-between; align-items: center; cursor: pointer;
    }
    .section-header h3 {
      display: flex; align-items: center; gap: 10px;
      font-size: 1em; margin: 0; color: #333;
    }
    .section-header h3 i.fa-microsoft { color: #0078d4; }
    .toggle-badge {
      font-size: 0.7em; padding: 3px 8px; border-radius: 12px;
      background: #e0e0e0; color: #666;
    }
    .toggle-badge.enabled { background: #dcfce7; color: #166534; }
    .toggle-switch { position: relative; display: inline-block; width: 50px; height: 26px; }
    .toggle-switch input { opacity: 0; width: 0; height: 0; }
    .toggle-slider {
      position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
      background-color: #ccc; transition: 0.4s; border-radius: 26px;
    }
    .toggle-slider:before {
      position: absolute; content: ""; height: 20px; width: 20px;
      left: 3px; bottom: 3px; background-color: white;
      transition: 0.4s; border-radius: 50%;
    }
    .toggle-switch input:checked + .toggle-slider { background-color: #3A7D44; }
    .toggle-switch input:checked + .toggle-slider:before { transform: translateX(24px); }
    .azure-devops-config {
      margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;
    }
    .config-hint {
      background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;
      padding: 12px 16px; margin-bottom: 20px; font-size: 0.85em; color: #1e40af;
    }
    .config-hint i { margin-right: 8px; }
    .password-input { position: relative; display: flex; }
    .password-input input { flex: 1; padding-right: 40px; }
    .toggle-visibility {
      position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
      background: none; border: none; cursor: pointer; color: #666; padding: 4px 8px;
    }
    .toggle-visibility:hover { color: #3A7D44; }
    .mcp-features {
      margin-top: 20px; padding: 16px; background: #f0fdf4;
      border: 1px solid #bbf7d0; border-radius: 8px;
    }
    .mcp-features h4 {
      font-size: 0.9em; color: #166534; margin: 0 0 12px;
      display: flex; align-items: center; gap: 8px;
    }
    .feature-list {
      list-style: none; padding: 0; margin: 0;
      display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px;
    }
    .feature-list li {
      display: flex; align-items: center; gap: 8px; font-size: 0.8em; color: #333;
    }
    .feature-list li i { color: #3A7D44; width: 16px; }

    /* Dependency Suggestions */
    .dep-suggestions {
      margin-bottom: 24px; padding: 18px; border-radius: 10px;
      background: linear-gradient(135deg, #f0fdf4, #ecfdf5);
      border: 1px solid #bbf7d0; animation: fadeIn 0.3s ease;
    }
    .dep-suggestions h4 { font-size: 0.95em; color: #166534; margin: 0 0 4px; }
    .dep-suggestions h4 i { margin-right: 6px; }
    .dep-hint { font-size: 0.8em; color: #6b7280; margin: 0 0 14px; }
    .dep-categories { display: flex; flex-direction: column; gap: 12px; }
    .dep-category { }
    .cat-label {
      font-size: 0.75em; font-weight: 600; color: #3A7D44; text-transform: uppercase;
      letter-spacing: 0.5px; display: block; margin-bottom: 6px;
    }
    .dep-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .dep-chip {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 6px 12px; border: 1px solid #d1fae5; border-radius: 20px;
      background: white; cursor: pointer; font-size: 0.8em; font-weight: 500;
      color: #333; transition: all 0.2s; font-family: inherit;
    }
    .dep-chip:hover { border-color: #3A7D44; }
    .dep-chip.selected {
      background: #3A7D44; color: white; border-color: #3A7D44;
    }
    .dep-chip i { font-size: 0.9em; }
    .selected-deps {
      margin-top: 12px; padding: 8px 12px; background: white;
      border-radius: 6px; font-size: 0.82em; color: #333;
    }
    .selected-deps strong { color: #3A7D44; }

    .button-group { display: flex; gap: 12px; margin-top: 28px; }
    .action-btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 12px 24px; border: none; border-radius: 8px;
      font-weight: 500; font-size: 0.95em; cursor: pointer;
      transition: all 0.3s ease; font-family: 'Poppins', sans-serif;
    }
    .action-btn.primary {
      background: linear-gradient(135deg, #5DBB63, #3A7D44);
      color: white; flex: 1; justify-content: center;
      box-shadow: 0 4px 12px rgba(58,125,68,0.3);
    }
    .action-btn.primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(58,125,68,0.4); }
    .action-btn.primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    .action-btn.secondary { background: #f3f4f6; color: #555; }
    .action-btn.secondary:hover { background: #e5e7eb; }

    .alert {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 18px; border-radius: 8px; margin-top: 20px;
      font-size: 0.9em; animation: fadeIn 0.3s ease;
    }
    .success-alert { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .error-alert { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }

    .test-connection-section {
      display: flex; align-items: center; gap: 16px; margin: 12px 0 16px;
      flex-wrap: wrap;
    }
    .test-connection-btn {
      background: #2563eb !important; color: #fff !important;
      border: none; padding: 8px 18px; border-radius: 8px; cursor: pointer;
      font-size: 0.9em; font-weight: 600;
      display: inline-flex; align-items: center; gap: 8px;
      transition: background 0.2s;
    }
    .test-connection-btn:hover:not(:disabled) { background: #1d4ed8 !important; }
    .test-connection-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .connection-status {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 16px; border-radius: 8px; font-size: 0.9em; font-weight: 500;
      animation: fadeIn 0.3s ease;
    }
    .connection-success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .connection-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class WorkspaceCreateComponent {
  workspaceForm: FormGroup;
  submitting = false;
  error: string | null = null;
  successMessage: string | null = null;
  suggestions: DepSuggestion[] = [];
  showPat = false;
  testingConnection = false;
  connectionValid = false;
  connectionMessage: string | null = null;

  private depDb: Record<string, DepSuggestion[]> = {
    'java': [
      { name: 'Spring Boot', category: 'Framework', description: 'Java web application framework', selected: false },
      { name: 'Maven', category: 'Build', description: 'Build automation tool', selected: false },
      { name: 'Gradle', category: 'Build', description: 'Build automation tool', selected: false },
      { name: 'JUnit 5', category: 'Testing', description: 'Unit testing framework', selected: false },
      { name: 'Mockito', category: 'Testing', description: 'Mocking framework', selected: false },
      { name: 'Lombok', category: 'Utility', description: 'Boilerplate code reduction', selected: false },
      { name: 'JPA/Hibernate', category: 'Database', description: 'ORM framework', selected: false },
      { name: 'SLF4J', category: 'Logging', description: 'Logging facade', selected: false },
    ],
    'spring': [
      { name: 'Spring Security', category: 'Security', description: 'Authentication & authorization', selected: false },
      { name: 'Spring Data JPA', category: 'Database', description: 'JPA repository abstraction', selected: false },
      { name: 'Spring Web', category: 'Framework', description: 'REST/MVC web framework', selected: false },
      { name: 'Spring Actuator', category: 'Monitoring', description: 'Application monitoring', selected: false },
    ],
    'angular': [
      { name: 'RxJS', category: 'Core', description: 'Reactive extensions', selected: false },
      { name: 'Angular Material', category: 'UI', description: 'Material Design components', selected: false },
      { name: 'NgRx', category: 'State', description: 'State management', selected: false },
      { name: 'Jasmine', category: 'Testing', description: 'Unit testing framework', selected: false },
      { name: 'Cypress', category: 'Testing', description: 'E2E testing framework', selected: false },
    ],
    'react': [
      { name: 'React Router', category: 'Core', description: 'Client-side routing', selected: false },
      { name: 'Redux', category: 'State', description: 'State management', selected: false },
      { name: 'Axios', category: 'HTTP', description: 'HTTP client', selected: false },
      { name: 'Material UI', category: 'UI', description: 'UI component library', selected: false },
      { name: 'Jest', category: 'Testing', description: 'Testing framework', selected: false },
      { name: 'React Hook Form', category: 'Forms', description: 'Form handling library', selected: false },
    ],
    'python': [
      { name: 'Flask', category: 'Framework', description: 'Lightweight web framework', selected: false },
      { name: 'Django', category: 'Framework', description: 'Full-featured web framework', selected: false },
      { name: 'FastAPI', category: 'Framework', description: 'Modern async API framework', selected: false },
      { name: 'SQLAlchemy', category: 'Database', description: 'ORM toolkit', selected: false },
      { name: 'pytest', category: 'Testing', description: 'Testing framework', selected: false },
      { name: 'Pydantic', category: 'Validation', description: 'Data validation', selected: false },
    ],
    'node': [
      { name: 'Express', category: 'Framework', description: 'Web application framework', selected: false },
      { name: 'TypeScript', category: 'Language', description: 'Typed JavaScript', selected: false },
      { name: 'Prisma', category: 'Database', description: 'ORM for Node.js', selected: false },
      { name: 'Jest', category: 'Testing', description: 'Testing framework', selected: false },
      { name: 'ESLint', category: 'Linting', description: 'Code linting', selected: false },
    ],
    'dotnet': [
      { name: 'Entity Framework', category: 'Database', description: 'ORM for .NET', selected: false },
      { name: 'ASP.NET Core', category: 'Framework', description: 'Web framework', selected: false },
      { name: 'xUnit', category: 'Testing', description: 'Unit testing', selected: false },
      { name: 'AutoMapper', category: 'Utility', description: 'Object mapping', selected: false },
      { name: 'Serilog', category: 'Logging', description: 'Structured logging', selected: false },
    ],
  };

  constructor(
    private fb: FormBuilder,
    private workspaceService: WorkspaceService,
    private router: Router
  ) {
    this.workspaceForm = this.fb.group({
      projectName: ['', Validators.required],
      description: [''],
      techStack: [''],
      pipelineMode: ['per-story'],
      azureDevOpsEnabled: [false],
      azureDevOpsOrganizationUrl: [''],
      azureDevOpsProject: [''],
      azureDevOpsRepository: [''],
      azureDevOpsPersonalAccessToken: ['']
    });
  }

  toggleAzureDevOps() {
    const ctrl = this.workspaceForm.get('azureDevOpsEnabled');
    ctrl?.setValue(!ctrl.value);
  }

  isInvalid(field: string): boolean {
    const ctrl = this.workspaceForm.get(field);
    return !!(ctrl && ctrl.invalid && ctrl.touched);
  }

  onTechStackChange() {
    const techStack = (this.workspaceForm.get('techStack')?.value || '').toLowerCase();
    const seen = new Set<string>();
    this.suggestions = [];
    for (const [key, deps] of Object.entries(this.depDb)) {
      if (techStack.includes(key)) {
        for (const dep of deps) {
          if (!seen.has(dep.name)) {
            seen.add(dep.name);
            this.suggestions.push({ ...dep, selected: false });
          }
        }
      }
    }
  }

  getCategories(): string[] {
    return [...new Set(this.suggestions.map(s => s.category))];
  }

  getSuggestionsByCategory(cat: string): DepSuggestion[] {
    return this.suggestions.filter(s => s.category === cat);
  }

  getSelectedDeps(): string[] {
    return this.suggestions.filter(s => s.selected).map(s => s.name);
  }

  testConnection() {
    this.testingConnection = true;
    this.connectionMessage = null;

    const organizationUrl = this.workspaceForm.get('azureDevOpsOrganizationUrl')?.value;
    const project = this.workspaceForm.get('azureDevOpsProject')?.value;
    const repository = this.workspaceForm.get('azureDevOpsRepository')?.value;
    const pat = this.workspaceForm.get('azureDevOpsPersonalAccessToken')?.value;

    this.workspaceService.validateAzureDevOpsConnection({ organizationUrl, project, repository, pat })
      .subscribe({
        next: (res: AzureDevOpsValidationResponse) => {
          this.connectionValid = res.valid;
          this.connectionMessage = res.valid
            ? 'Connection successful! Branches found: ' + (res.branches?.length || 0)
            : res.message || 'Connection failed. Check your credentials.';
          this.testingConnection = false;
        },
        error: (err: any) => {
          this.connectionValid = false;
          this.connectionMessage = 'Connection test failed: ' + (err.error?.message || err.message || 'Unknown error');
          this.testingConnection = false;
        }
      });
  }

  onSubmit() {
    if (this.workspaceForm.valid) {
      this.submitting = true;
      this.error = null;
      this.successMessage = null;

      const formValue = { ...this.workspaceForm.value };
      // Append selected deps to tech stack
      const selectedDeps = this.getSelectedDeps();
      if (selectedDeps.length > 0) {
        const existing = formValue.techStack ? formValue.techStack + ', ' : '';
        formValue.techStack = existing + selectedDeps.join(', ');
      }

      this.workspaceService.createWorkspace(formValue).subscribe({
        next: (workspace: Workspace) => {
          this.successMessage = `Workspace "${workspace.projectName}" created successfully!`;
          this.submitting = false;
          setTimeout(() => this.router.navigate(['/workspaces']), 2000);
        },
        error: (err: any) => {
          this.error = err.error?.message || err.error?.error || 'Failed to create workspace. Please try again.';
          this.submitting = false;
        }
      });
    }
  }

  onCancel() { this.router.navigate(['/workspaces']); }
}
