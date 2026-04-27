import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Workflow, WorkflowApprovalRequest, WorkflowDecision, WorkflowService } from '../../services/workflow.service';

@Component({
  selector: 'app-approval-panel',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="approval-panel" *ngIf="workspaceId && requirementId">
      <h3><i class="fas fa-gavel"></i> Approval Panel</h3>
      <form [formGroup]="form">
        <div class="input-group">
          <label>Comments (optional)</label>
          <textarea formControlName="comments" rows="3"
                    placeholder="Add remarks for this decision..."></textarea>
        </div>
        <div class="approval-buttons">
          <button type="button" class="btn approve" (click)="onDecision('APPROVE')" [disabled]="submitting">
            <i class="fas fa-check-circle"></i> Approve
          </button>
          <button type="button" class="btn reject" (click)="onDecision('REJECT')" [disabled]="submitting">
            <i class="fas fa-times-circle"></i> Reject
          </button>
          <button type="button" class="btn rework" (click)="onDecision('REWORK')" [disabled]="submitting">
            <i class="fas fa-redo"></i> Rework
          </button>
          <i *ngIf="submitting" class="fas fa-spinner fa-spin spinner"></i>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .approval-panel {
      background: white; border-radius: 10px; padding: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    }
    .approval-panel h3 {
      font-size: 1em; margin-bottom: 16px; color: #2E673A;
    }
    .approval-panel h3 i { margin-right: 8px; color: #3A7D44; }

    .input-group { margin-bottom: 16px; }
    .input-group label {
      display: block; margin-bottom: 6px; font-weight: 500;
      font-size: 0.85em; color: #555;
    }
    .input-group textarea {
      width: 100%; padding: 10px 12px; border: 1px solid #e0e0e0;
      border-radius: 8px; font-family: 'Poppins', sans-serif;
      font-size: 0.9em; resize: vertical;
    }
    .input-group textarea:focus {
      outline: none; border-color: #3A7D44;
      box-shadow: 0 0 0 3px rgba(58,125,68,0.1);
    }

    .approval-buttons {
      display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
    }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 18px; border: none; border-radius: 8px;
      font-weight: 500; font-size: 0.9em; cursor: pointer;
      font-family: 'Poppins', sans-serif; transition: all 0.3s;
    }
    .btn.approve { background: #22c55e; color: white; }
    .btn.approve:hover { background: #16a34a; }
    .btn.reject { background: white; color: #ef4444; border: 1px solid #ef4444; }
    .btn.reject:hover { background: #fef2f2; }
    .btn.rework { background: white; color: #6C63FF; border: 1px solid #6C63FF; }
    .btn.rework:hover { background: #f5f3ff; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .spinner { color: #3A7D44; margin-left: 8px; }
  `]
})
export class ApprovalPanelComponent {
  @Input() workspaceId!: number;
  @Input() requirementId!: number;
  @Input() userStoryId?: number;
  @Output() workflowUpdated = new EventEmitter<Workflow>();

  form: FormGroup;
  submitting = false;

  constructor(private fb: FormBuilder, private workflowService: WorkflowService) {
    this.form = this.fb.group({ comments: [''] });
  }

  onDecision(decision: WorkflowDecision) {
    if (this.submitting || !this.workspaceId || !this.requirementId) return;
    this.submitting = true;
    const req: WorkflowApprovalRequest = {
      workspaceId: this.workspaceId,
      requirementId: this.requirementId,
      decision,
      comments: this.form.value.comments?.trim() || undefined,
      userStoryId: this.userStoryId
    };
    this.workflowService.approveWorkflow(req).subscribe({
      next: (wf) => {
        this.submitting = false;
        this.workflowUpdated.emit(wf);
      },
      error: () => { this.submitting = false; }
    });
  }
}
