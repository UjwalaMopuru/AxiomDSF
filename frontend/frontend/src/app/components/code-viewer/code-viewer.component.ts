import { Component, Input, OnInit, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkflowService } from '../../services/workflow.service';

interface FileNode {
  name: string;
  path: string;
  isFolder: boolean;
  children?: FileNode[];
  expanded?: boolean;
  language?: string;
}

@Component({
  selector: 'app-code-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="code-viewer">
      <div class="cv-header">
        <div class="cv-title">
          <i class="fas fa-code"></i>
          <h3>Code Output</h3>
        </div>
        <div class="cv-actions">
          <span class="cv-path" *ngIf="selectedFile">{{ selectedFile.path }}</span>
          <button class="download-btn" *ngIf="fileTree.length > 0" (click)="downloadAsZip()" title="Download code as ZIP">
            <i class="fas fa-download"></i> Download ZIP
          </button>
        </div>
      </div>

      <div class="cv-layout">
        <!-- File Explorer -->
        <aside class="file-explorer">
          <div class="explorer-header">
            <i class="fas fa-folder-open"></i>
            <span>EXPLORER</span>
          </div>
          <div class="file-tree" *ngIf="fileTree.length > 0">
            <ng-container *ngFor="let node of fileTree">
              <ng-container *ngTemplateOutlet="treeNode; context: { node: node, depth: 0 }"></ng-container>
            </ng-container>
          </div>
          <div class="empty-tree" *ngIf="fileTree.length === 0 && !loading">
            <i class="fas fa-inbox"></i>
            <p>No code files generated yet</p>
          </div>
          <div class="loading-tree" *ngIf="loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Loading files...</span>
          </div>
        </aside>

        <!-- Code Panel -->
        <div class="code-panel">
          <!-- Tabs -->
          <div class="tab-bar" *ngIf="openTabs.length > 0">
            <div *ngFor="let tab of openTabs"
                 class="file-tab"
                 [class.active]="tab === selectedFile"
                 (click)="selectTab(tab)">
              <i class="fas" [ngClass]="getFileIcon(tab.name)"></i>
              <span>{{ tab.name }}</span>
              <button class="tab-close-btn" (click)="closeTab(tab); $event.stopPropagation()">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>

          <!-- Code Content -->
          <div class="code-content" *ngIf="selectedFile && fileContent">
            <div class="code-lines">
              <div class="line-row" *ngFor="let line of fileLines; let i = index">
                <span class="line-number">{{ i + 1 }}</span>
                <span class="line-text"><pre>{{ line }}</pre></span>
              </div>
            </div>
          </div>

          <div class="code-loading" *ngIf="fileLoading">
            <i class="fas fa-spinner fa-spin"></i> Loading file...
          </div>

          <!-- Empty state -->
          <div class="code-empty" *ngIf="!selectedFile && !fileLoading">
            <div class="empty-icon"><i class="fas fa-file-code"></i></div>
            <h4>Select a file to view</h4>
            <p>Choose a file from the explorer panel to view its contents.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Recursive tree node template -->
    <ng-template #treeNode let-node="node" let-depth="depth">
      <div class="tree-item"
           [style.paddingLeft.px]="depth * 16 + 8"
           [class.folder]="node.isFolder"
           [class.selected]="selectedFile?.path === node.path"
           (click)="onNodeClick(node)">
        <i *ngIf="node.isFolder" class="fas tree-arrow"
           [ngClass]="node.expanded ? 'fa-chevron-down' : 'fa-chevron-right'"></i>
        <i *ngIf="!node.isFolder" class="fas" [ngClass]="getFileIcon(node.name)" style="width:14px"></i>
        <span class="tree-name">{{ node.name }}</span>
      </div>
      <div *ngIf="node.isFolder && node.expanded && node.children">
        <ng-container *ngFor="let child of node.children">
          <ng-container *ngTemplateOutlet="treeNode; context: { node: child, depth: depth + 1 }"></ng-container>
        </ng-container>
      </div>
    </ng-template>
  `,
  styles: [`
    .code-viewer {
      background: #1e1e2e; border-radius: 12px; overflow: hidden;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2); height: 600px; display: flex; flex-direction: column;
    }
    .cv-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 16px; background: #181825; border-bottom: 1px solid #313244;
    }
    .cv-title { display: flex; align-items: center; gap: 8px; color: #cdd6f4; }
    .cv-title i { color: #89b4fa; }
    .cv-title h3 { margin: 0; font-size: 0.9em; font-weight: 500; }
    .cv-path { font-size: 0.75em; color: #6c7086; font-family: 'Consolas', monospace; }
    .cv-actions { display: flex; align-items: center; gap: 12px; }
    .download-btn {
      display: flex; align-items: center; gap: 6px; padding: 5px 12px;
      border: 1px solid #45475a; border-radius: 6px; background: #313244;
      color: #89b4fa; cursor: pointer; font-size: 0.75em; font-family: 'Poppins', sans-serif;
      transition: all 0.2s;
    }
    .download-btn:hover { background: #45475a; color: #cdd6f4; }

    .cv-layout { display: flex; flex: 1; overflow: hidden; }

    /* Explorer */
    .file-explorer {
      width: 240px; min-width: 240px; background: #181825;
      border-right: 1px solid #313244; overflow-y: auto;
      display: flex; flex-direction: column;
    }
    .explorer-header {
      padding: 10px 12px; font-size: 0.7em; font-weight: 600;
      color: #a6adc8; text-transform: uppercase; letter-spacing: 1px;
      display: flex; align-items: center; gap: 6px;
      border-bottom: 1px solid #313244;
    }
    .explorer-header i { font-size: 0.9em; color: #89b4fa; }

    .file-tree { flex: 1; overflow-y: auto; padding: 4px 0; }

    .tree-item {
      display: flex; align-items: center; gap: 6px; padding: 4px 8px;
      font-size: 0.8em; color: #cdd6f4; cursor: pointer;
      transition: background 0.15s; white-space: nowrap;
    }
    .tree-item:hover { background: #313244; }
    .tree-item.selected { background: #45475a; }
    .tree-item.folder { color: #cba6f7; }
    .tree-arrow { font-size: 0.6em; width: 10px; color: #6c7086; }
    .tree-name { font-family: 'Consolas', 'Courier New', monospace; font-size: 0.95em; }

    .empty-tree, .loading-tree {
      padding: 24px; text-align: center; color: #6c7086; font-size: 0.8em;
    }
    .empty-tree i, .loading-tree i { display: block; font-size: 1.5em; margin-bottom: 8px; }

    /* Code Panel */
    .code-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    .tab-bar {
      display: flex; background: #181825; border-bottom: 1px solid #313244;
      overflow-x: auto; min-height: 35px;
    }
    .file-tab {
      display: flex; align-items: center; gap: 6px; padding: 6px 14px;
      font-size: 0.78em; color: #a6adc8; cursor: pointer;
      border-right: 1px solid #313244; transition: all 0.15s;
      white-space: nowrap;
    }
    .file-tab:hover { background: #313244; }
    .file-tab.active { background: #1e1e2e; color: #cdd6f4; border-bottom: 2px solid #89b4fa; }
    .file-tab i { font-size: 0.9em; }
    .tab-close-btn {
      background: none; border: none; color: #6c7086; cursor: pointer;
      font-size: 0.7em; padding: 2px; margin-left: 4px;
    }
    .tab-close-btn:hover { color: #f38ba8; }

    /* Code Content */
    .code-content {
      flex: 1; overflow: auto; background: #1e1e2e;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 13px; line-height: 1.6;
    }
    .code-lines { padding: 8px 0; }
    .line-row { display: flex; min-height: 21px; }
    .line-row:hover { background: rgba(69, 71, 90, 0.3); }
    .line-number {
      width: 50px; min-width: 50px; text-align: right;
      padding-right: 16px; color: #6c7086; user-select: none;
      font-size: 12px;
    }
    .line-text { flex: 1; color: #cdd6f4; }
    .line-text pre {
      margin: 0; white-space: pre; font-family: inherit;
      font-size: inherit; color: inherit;
    }

    .code-loading { text-align: center; padding: 40px; color: #89b4fa; }

    .code-empty {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; color: #6c7086; text-align: center;
    }
    .empty-icon { font-size: 3em; margin-bottom: 12px; opacity: 0.4; }
    .code-empty h4 { margin: 0 0 6px; color: #a6adc8; }
    .code-empty p { margin: 0; font-size: 0.85em; }

    /* File icons by extension */
    .fa-file-code { color: #89b4fa; }
    .fa-java { color: #e8a87c; }
    .fa-file-alt { color: #a6e3a1; }
    .fa-cog { color: #f9e2af; }
  `]
})
export class CodeViewerComponent implements OnInit, OnChanges {
  @Input() workspaceId!: number;
  @Input() requirementId!: number;
  @Input() userStoryId?: number;

  fileTree: FileNode[] = [];
  openTabs: FileNode[] = [];
  selectedFile: FileNode | null = null;
  fileContent: string | null = null;
  fileLines: string[] = [];
  loading = false;
  fileLoading = false;

  constructor(private workflowService: WorkflowService) {}

  ngOnInit() {
    this.loadCodeOutput();
  }

  ngOnChanges(changes: any) {
    if (changes.userStoryId && !changes.userStoryId.firstChange) {
      this.fileTree = [];
      this.openTabs = [];
      this.selectedFile = null;
      this.fileContent = null;
      this.fileLines = [];
      this.fileContentMap.clear();
      this.loadCodeOutput();
    }
  }

  loadCodeOutput() {
    this.loading = true;
    // Fetch coding agent output to build file tree (agent 8 = CodingAgent)
    this.workflowService.getAgentOutput(8, this.workspaceId, this.requirementId, this.userStoryId).subscribe({
      next: (res) => {
        this.loading = false;
        const content = res?.content;
        if (content) {
          const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
          this.fileTree = this.parseCodeBlocks(text);
        }
      },
      error: () => { this.loading = false; }
    });
  }

  downloadAsZip() {
    if (this.fileContentMap.size === 0) return;
    // Build ZIP client-side using the already-parsed file content map
    // This works for both per-story and full-sequence modes
    this.buildClientZip();
  }

  private buildClientZip() {
    // Simple ZIP construction using Blob API (no external library needed)
    // We'll create a downloadable blob with all files
    const files: {name: string, content: string}[] = [];
    this.fileContentMap.forEach((content, path) => {
      files.push({ name: path, content });
    });

    if (files.length === 0) return;

    // For browsers that support it, generate a simple multi-file download
    // Create a combined text file as fallback, or trigger backend endpoint
    const params = new URLSearchParams({
      workspaceId: String(this.workspaceId),
      requirementId: String(this.requirementId)
    });
    if (this.userStoryId) params.set('userStoryId', String(this.userStoryId));
    const url = `/workflow/code-download?${params.toString()}`;

    // Try backend download first
    const link = document.createElement('a');
    link.href = url;
    link.download = this.userStoryId ? `code-US-${this.userStoryId}.zip` : 'code-output.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private parseCodeBlocks(markdown: string): FileNode[] {
    const nodes: FileNode[] = [];

    // Strategy 1: Parse ### FILE: path/to/file.ext patterns followed by code blocks
    // This is the format used by CodingAgent
    const fileHeaderRegex = /### FILE:\s*(.+)\s*\n```(\w*)\s*\n([\s\S]*?)```/g;
    let match;
    while ((match = fileHeaderRegex.exec(markdown)) !== null) {
      let fileName = match[1].trim();
      const lang = match[2] || 'text';
      const codeContent = match[3];

      nodes.push({
        name: fileName.split('/').pop() || fileName,
        path: fileName,
        isFolder: false,
        language: lang,
        children: undefined,
        expanded: false
      });
      this.fileContentMap.set(fileName, codeContent.trim());
    }

    // Strategy 2: If no ### FILE: headers found, fall back to code blocks with comments
    if (nodes.length === 0) {
      const codeBlockRegex = /```(\w*)\s*\n([\s\S]*?)```/g;
      while ((match = codeBlockRegex.exec(markdown)) !== null) {
        const lang = match[1] || 'text';
        const block = match[2];

        const lines = block.split('\n');
        let fileName = '';
        let codeContent = block;

        for (let i = 0; i < Math.min(3, lines.length); i++) {
          const fileMatch = lines[i].match(/(?:\/\/|#|--|\/\*)\s*(?:file(?:name)?|path)\s*:\s*(.+)/i);
          if (fileMatch) {
            fileName = fileMatch[1].trim().replace(/\*\//, '').trim();
            codeContent = lines.slice(i + 1).join('\n');
            break;
          }
        }

        if (!fileName) {
          const classMatch = block.match(/(?:public\s+)?class\s+(\w+)/);
          const interfaceMatch = block.match(/(?:public\s+)?interface\s+(\w+)/);
          const name = classMatch?.[1] || interfaceMatch?.[1];
          if (name) {
            const ext = lang === 'java' ? '.java' : lang === 'typescript' ? '.ts' : lang === 'python' ? '.py' : `.${lang}`;
            fileName = `src/${name}${ext}`;
          } else {
            fileName = `snippet-${nodes.length + 1}.${lang || 'txt'}`;
          }
        }

        nodes.push({
          name: fileName.split('/').pop() || fileName,
          path: fileName,
          isFolder: false,
          language: lang,
          children: undefined,
          expanded: false
        });
        this.fileContentMap.set(fileName, codeContent.trim());
      }
    }

    // If no code blocks found, treat whole output as a single file
    if (nodes.length === 0 && markdown.trim()) {
      const name = 'output.md';
      nodes.push({ name, path: name, isFolder: false, language: 'markdown' });
      this.fileContentMap.set(name, markdown);
    }

    return this.buildTree(nodes);
  }

  private fileContentMap = new Map<string, string>();

  private buildTree(files: FileNode[]): FileNode[] {
    const root: FileNode[] = [];
    const folderMap = new Map<string, FileNode>();

    for (const file of files) {
      const parts = file.path.split('/');
      if (parts.length === 1) {
        root.push(file);
        continue;
      }

      let currentLevel = root;
      let currentPath = '';

      for (let i = 0; i < parts.length - 1; i++) {
        currentPath += (currentPath ? '/' : '') + parts[i];
        let folder = folderMap.get(currentPath);
        if (!folder) {
          folder = { name: parts[i], path: currentPath, isFolder: true, children: [], expanded: true };
          folderMap.set(currentPath, folder);
          currentLevel.push(folder);
        }
        currentLevel = folder.children!;
      }
      currentLevel.push(file);
    }

    return root;
  }

  onNodeClick(node: FileNode) {
    if (node.isFolder) {
      node.expanded = !node.expanded;
    } else {
      this.openFile(node);
    }
  }

  openFile(node: FileNode) {
    if (!this.openTabs.find(t => t.path === node.path)) {
      this.openTabs.push(node);
    }
    this.selectedFile = node;
    this.fileLoading = true;
    const content = this.fileContentMap.get(node.path);
    if (content) {
      this.fileContent = content;
      this.fileLines = content.split('\n');
      this.fileLoading = false;
    } else {
      this.fileContent = '// No content available';
      this.fileLines = ['// No content available'];
      this.fileLoading = false;
    }
  }

  selectTab(node: FileNode) {
    this.openFile(node);
  }

  closeTab(node: FileNode) {
    this.openTabs = this.openTabs.filter(t => t.path !== node.path);
    if (this.selectedFile?.path === node.path) {
      this.selectedFile = this.openTabs.length > 0 ? this.openTabs[this.openTabs.length - 1] : null;
      if (this.selectedFile) {
        this.openFile(this.selectedFile);
      } else {
        this.fileContent = null;
        this.fileLines = [];
      }
    }
  }

  getFileIcon(name: string): string {
    if (!name) return 'fa-file';
    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'java': return 'fa-file-code';
      case 'ts': case 'tsx': return 'fa-file-code';
      case 'js': case 'jsx': return 'fa-file-code';
      case 'py': return 'fa-file-code';
      case 'html': return 'fa-file-code';
      case 'css': case 'scss': return 'fa-file-code';
      case 'json': return 'fa-file-code';
      case 'xml': case 'yaml': case 'yml': return 'fa-cog';
      case 'md': return 'fa-file-alt';
      case 'sql': return 'fa-database';
      default: return 'fa-file';
    }
  }
}
