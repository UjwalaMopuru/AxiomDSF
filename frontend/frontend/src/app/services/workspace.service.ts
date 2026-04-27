import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Workspace {
  id?: number;
  projectName: string;
  description?: string;
  techStack?: string;
  location?: string;
  status?: boolean;
  // Azure DevOps Configuration
  azureDevOpsOrganizationUrl?: string;
  azureDevOpsProject?: string;
  azureDevOpsRepository?: string;
  azureDevOpsPersonalAccessToken?: string;
  azureDevOpsBranch?: string;
  azureDevOpsWikiBranch?: string;
  pipelineMode?: string;
  azureDevOpsEnabled?: boolean;
  azureDevOpsPatConfigured?: boolean;
  wikiName?: string;
}

export interface AzureDevOpsValidationResponse {
  valid: boolean;
  message?: string;
  branches?: string[];
}

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private apiUrl = '/workspace';

  constructor(private http: HttpClient) {}

  listWorkspaces(): Observable<Workspace[]> {
    return this.http.get<Workspace[]>(`${this.apiUrl}/list`);
  }

  getWorkspaceById(id: number): Observable<Workspace> {
    return this.http.get<Workspace>(`${this.apiUrl}/${id}`);
  }

  createWorkspace(workspace: Workspace): Observable<Workspace> {
    return this.http.post<Workspace>(`${this.apiUrl}/create`, workspace);
  }

  updateWorkspace(id: number, workspace: Partial<Workspace>): Observable<Workspace> {
    return this.http.put<Workspace>(`${this.apiUrl}/${id}`, workspace);
  }

  deleteWorkspace(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  getWorkspaceByName(name: string): Observable<Workspace> {
    return this.http.get<Workspace>(`${this.apiUrl}/getByName`, { params: { name } });
  }

  validateAzureDevOpsConnection(config: {
    organizationUrl: string;
    project: string;
    repository: string;
    pat: string;
  }): Observable<AzureDevOpsValidationResponse> {
    return this.http.post<AzureDevOpsValidationResponse>(`${this.apiUrl}/validate-azure-devops`, config);
  }
}
