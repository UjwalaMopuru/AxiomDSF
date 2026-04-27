import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface StartWorkflowRequest {
  workspaceId: number;
  requirementId?: number;
  requirementText?: string;
  inputFilePath?: string;
  userStoryText?: string;
  agentName?: string;
  userStoryId?: number;
  pipelineMode?: 'per-story' | 'full-sequence';
}

export interface Workflow {
  id?: number;
  workspaceId: number;
  requirementId?: number;
  userStoryId?: number;
  agentName?: string;
  state: string;
  sequenceNumber: number;
  inputFilePath?: string;
  outputFilePath?: string;
  inputWikiUrl?: string;
  outputWikiUrl?: string;
  completionStatus: boolean;
  pipelineMode?: string;
  selectedAgents?: string;
  createdAt?: string;
}

export type WorkflowDecision = 'APPROVE' | 'REJECT' | 'REWORK';

export interface WorkflowApprovalRequest {
  workspaceId: number;
  requirementId: number;
  decision: WorkflowDecision;
  comments?: string;
  agentNumber?: number;
  userStoryId?: number;
}

export interface WorkflowRevertRequest {
  workspaceId: number;
  requirementId: number;
  version: number;
}

@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private apiUrl = '/workflow';

  constructor(private http: HttpClient) {}

  startWorkflow(request: StartWorkflowRequest): Observable<Workflow> {
    return this.http.post<Workflow>(`${this.apiUrl}/start`, request);
  }

  getWorkflowStatus(workspaceId: number, requirementId: number): Observable<Workflow> {
    return this.http.get<Workflow>(`${this.apiUrl}/status/${workspaceId}/${requirementId}`);
  }

  getAllWorkflows(): Observable<Workflow[]> {
    return this.http.get<Workflow[]>(`${this.apiUrl}/all`);
  }

  approveWorkflow(request: WorkflowApprovalRequest): Observable<Workflow> {
    return this.http.post<Workflow>(`${this.apiUrl}/approve`, request);
  }

  revertWorkflow(request: WorkflowRevertRequest): Observable<Workflow> {
    return this.http.post<Workflow>(`${this.apiUrl}/revert`, request);
  }

  getAgentOutput(agentNumber: number, workspaceId: number, requirementId: number, userStoryId?: number): Observable<any> {
    let params: any = { agentNumber, workspaceId, requirementId };
    if (userStoryId) params.userStoryId = userStoryId;
    return this.http.get(`${this.apiUrl}/agent-output`, { params });
  }

  getAgentPipelineConfig(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/agents/config`);
  }

  getWorkflowsByUserStory(userStoryId: number): Observable<Workflow[]> {
    return this.http.get<Workflow[]>(`${this.apiUrl}/by-userstory/${userStoryId}`);
  }

  getWorkflowsByContext(workspaceId: number, requirementId: number, userStoryId?: number): Observable<Workflow[]> {
    let params: any = { workspaceId, requirementId };
    if (userStoryId) params.userStoryId = userStoryId;
    return this.http.get<Workflow[]>(`${this.apiUrl}/by-context`, { params });
  }
}
