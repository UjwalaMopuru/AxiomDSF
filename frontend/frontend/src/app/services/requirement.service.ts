import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Requirement {
  id?: number;
  workspaceId: number;
  requirementText: string;
  userStoryId?: number;
  createdAt?: string;
}

@Injectable({ providedIn: 'root' })
export class RequirementService {
  private apiUrl = '/requirement';

  constructor(private http: HttpClient) {}

  getByWorkspace(workspaceId: number): Observable<Requirement[]> {
    return this.http.get<Requirement[]>(`${this.apiUrl}/workspace/${workspaceId}`);
  }

  create(workspaceId: number, requirementText: string): Observable<Requirement> {
    return this.http.post<Requirement>(`${this.apiUrl}/create`, { workspaceId, requirementText });
  }
}
