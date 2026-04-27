import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, startWith, shareReplay, catchError, of } from 'rxjs';

export interface SystemHealth {
  status: string;
  timestamp: string;
  uptime: string;
  uptimeMs: number;
  memory: {
    totalMB: number;
    freeMB: number;
    usedMB: number;
    maxMB: number;
  };
  stats: {
    workspaces: number;
    totalWorkflows: number;
    activeWorkflows: number;
    completedWorkflows: number;
    configuredAgents: number;
  };
  jvm: {
    version: string;
    vendor: string;
    os: string;
  };
}

export interface UserStory {
  id?: number;
  storyId: string;
  title: string;
  priority: string;
  workspaceId: number;
  requirementId: number;
  filePath?: string;
  userStoryText?: string;
  createdAt?: string;
}

@Injectable({ providedIn: 'root' })
export class SystemService {

  constructor(private http: HttpClient) {}

  getHealth(): Observable<SystemHealth> {
    return this.http.get<SystemHealth>('/api/health');
  }

  /** Polls health every 10 seconds, shared across subscribers */
  healthPolling$ = interval(10000).pipe(
    startWith(0),
    switchMap(() => this.getHealth().pipe(catchError(() => of(null)))),
    shareReplay(1)
  );

  getUserStoriesByWorkspace(workspaceId: number): Observable<UserStory[]> {
    return this.http.get<UserStory[]>(`/userstory/workspace/${workspaceId}`);
  }

  getUserStoriesByRequirement(requirementId: number): Observable<UserStory[]> {
    return this.http.get<UserStory[]>(`/userstory/requirement/${requirementId}`);
  }
}
