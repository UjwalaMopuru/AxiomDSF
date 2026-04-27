import { Component, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatbotService, ChatMessage } from '../../services/chatbot.service';

@Component({
  selector: 'app-chatbot-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Floating Action Button -->
    <button class="chat-fab" (click)="toggleChat()" [class.hidden]="isOpen"
            title="AxiomDSF Assistant">
      <i class="fas fa-robot"></i>
      <span class="fab-pulse"></span>
    </button>

    <!-- Chat Panel -->
    <div class="chat-panel" [class.open]="isOpen">
      <!-- Header -->
      <div class="chat-header">
        <div class="chat-header-info">
          <div class="bot-avatar">
            <i class="fas fa-robot"></i>
          </div>
          <div>
            <h4>AxiomDSF Assistant</h4>
            <span class="status-dot"></span>
            <span class="status-text">Online — AI Powered</span>
          </div>
        </div>
        <div class="chat-header-actions">
          <button class="icon-btn" (click)="clearChat()" title="Clear chat">
            <i class="fas fa-trash-alt"></i>
          </button>
          <button class="icon-btn" (click)="toggleChat()" title="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>

      <!-- Messages -->
      <div class="chat-messages" #messagesContainer>
        <!-- Welcome message -->
        <div class="message assistant" *ngIf="messages.length === 0">
          <div class="msg-avatar"><i class="fas fa-robot"></i></div>
          <div class="msg-bubble">
            <p>Hello! 👋 I'm the <strong>AxiomDSF Assistant</strong>.</p>
            <p>Ask me anything about workspaces, workflows, agents, APIs, or how to use this platform!</p>
            <div class="quick-actions">
              <button class="quick-btn" (click)="askQuick('What is AxiomDSF?')">What is AxiomDSF?</button>
              <button class="quick-btn" (click)="askQuick('How do I create a workspace?')">Create Workspace</button>
              <button class="quick-btn" (click)="askQuick('What agents are available?')">View Agents</button>
              <button class="quick-btn" (click)="askQuick('How do I start a workflow?')">Start Workflow</button>
            </div>
          </div>
        </div>

        <!-- Chat messages -->
        <div *ngFor="let msg of messages; let i = index"
             class="message" [ngClass]="msg.role">
          <div class="msg-avatar">
            <i [class]="msg.role === 'assistant' ? 'fas fa-robot' : 'fas fa-user'"></i>
          </div>
          <div class="msg-content">
            <div class="msg-bubble" [innerHTML]="formatMessage(msg.text)"></div>
            <div class="follow-ups" *ngIf="msg.role === 'assistant' && msg.suggestions?.length && i === messages.length - 1">
              <button *ngFor="let s of msg.suggestions" class="quick-btn" (click)="askQuick(s)">{{ s }}</button>
            </div>
          </div>
        </div>

        <!-- Typing indicator -->
        <div class="message assistant" *ngIf="isTyping">
          <div class="msg-avatar"><i class="fas fa-robot"></i></div>
          <div class="msg-bubble typing-indicator">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>

      <!-- Input -->
      <div class="chat-input">
        <input
          #chatInput
          type="text"
          [(ngModel)]="userInput"
          (keydown.enter)="send()"
          placeholder="Ask about AxiomDSF..."
          [disabled]="isTyping"
        />
        <button class="send-btn" (click)="send()" [disabled]="!userInput.trim() || isTyping">
          <i class="fas fa-paper-plane"></i>
        </button>
      </div>
    </div>
  `,
  styles: [`
    /* ── Floating Action Button ─────────────────────────── */
    .chat-fab {
      position: fixed;
      bottom: 28px;
      right: 28px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: none;
      background: linear-gradient(135deg, #5DBB63, #3A7D44);
      color: white;
      font-size: 26px;
      cursor: pointer;
      box-shadow: 0 6px 20px rgba(58, 125, 68, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      z-index: 10000;
      animation: bounceIn 0.6s ease-out;
    }
    .chat-fab:hover {
      transform: scale(1.1);
      box-shadow: 0 8px 28px rgba(58, 125, 68, 0.5);
    }
    .chat-fab.hidden { display: none; }

    .fab-pulse {
      position: absolute;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: 3px solid rgba(93, 187, 99, 0.6);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(1); opacity: 1; }
      100% { transform: scale(1.5); opacity: 0; }
    }

    @keyframes bounceIn {
      0% { transform: scale(0); opacity: 0; }
      60% { transform: scale(1.1); opacity: 1; }
      100% { transform: scale(1); }
    }

    /* ── Chat Panel ─────────────────────────────────────── */
    .chat-panel {
      position: fixed;
      bottom: 28px;
      right: 28px;
      width: 400px;
      height: 560px;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      z-index: 10001;
      overflow: hidden;
      transform: scale(0) translateY(20px);
      transform-origin: bottom right;
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      pointer-events: none;
    }
    .chat-panel.open {
      transform: scale(1) translateY(0);
      opacity: 1;
      pointer-events: all;
    }

    /* ── Header ─────────────────────────────────────────── */
    .chat-header {
      background: linear-gradient(135deg, #5DBB63, #3A7D44);
      color: white;
      padding: 16px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .chat-header-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .bot-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255,255,255,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }
    .chat-header h4 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      color: white;
    }
    .status-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #90EE90;
      margin-right: 5px;
    }
    .status-text {
      font-size: 11px;
      opacity: 0.85;
    }
    .chat-header-actions {
      display: flex;
      gap: 6px;
    }
    .icon-btn {
      background: rgba(255,255,255,0.15);
      border: none;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      transition: background 0.2s;
    }
    .icon-btn:hover { background: rgba(255,255,255,0.3); }

    /* ── Messages ───────────────────────────────────────── */
    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #f8faf8;
    }

    .message {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      animation: fadeIn 0.3s ease-out;
    }
    .message.user {
      flex-direction: row-reverse;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .msg-avatar {
      width: 32px;
      height: 32px;
      min-width: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }
    .message.assistant .msg-avatar {
      background: linear-gradient(135deg, #5DBB63, #3A7D44);
      color: white;
    }
    .message.user .msg-avatar {
      background: linear-gradient(135deg, #4A90D9, #3672B0);
      color: white;
    }

    .msg-bubble {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 13.5px;
      line-height: 1.55;
      word-wrap: break-word;
    }
    .message.assistant .msg-bubble {
      background: white;
      color: #333;
      border: 1px solid #e8ede8;
      border-top-left-radius: 4px;
    }
    .message.user .msg-bubble {
      background: linear-gradient(135deg, #4A90D9, #3672B0);
      color: white;
      border-top-right-radius: 4px;
    }

    .msg-content { display: flex; flex-direction: column; max-width: 80%; }
    .follow-ups {
      display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px;
    }

    /* Quick action buttons */
    .quick-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    .quick-btn {
      background: linear-gradient(135deg, #e8f5e9, #c8e6c9);
      border: 1px solid #a5d6a7;
      color: #2E673A;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }
    .quick-btn:hover {
      background: linear-gradient(135deg, #5DBB63, #3A7D44);
      color: white;
      border-color: #3A7D44;
    }

    /* Typing indicator */
    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 12px 16px !important;
    }
    .typing-indicator span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #3A7D44;
      animation: typingBounce 1.4s infinite ease-in-out;
    }
    .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes typingBounce {
      0%, 80%, 100% { transform: scale(0.5); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }

    /* ── Input ──────────────────────────────────────────── */
    .chat-input {
      display: flex;
      align-items: center;
      padding: 12px 14px;
      border-top: 1px solid #e8ede8;
      background: white;
      gap: 8px;
    }
    .chat-input input {
      flex: 1;
      border: 1px solid #dde5dd;
      border-radius: 24px;
      padding: 10px 16px;
      font-size: 13.5px;
      outline: none;
      font-family: inherit;
      transition: border-color 0.2s;
    }
    .chat-input input:focus {
      border-color: #3A7D44;
      box-shadow: 0 0 0 3px rgba(58, 125, 68, 0.1);
    }
    .send-btn {
      width: 40px;
      height: 40px;
      min-width: 40px;
      border-radius: 50%;
      border: none;
      background: linear-gradient(135deg, #5DBB63, #3A7D44);
      color: white;
      font-size: 15px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .send-btn:hover:not(:disabled) {
      transform: scale(1.08);
      box-shadow: 0 4px 12px rgba(58, 125, 68, 0.3);
    }
    .send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ── Markdown-like formatting in bubbles ─────────────── */
    :host ::ng-deep .msg-bubble strong { font-weight: 600; }
    :host ::ng-deep .msg-bubble code {
      background: rgba(58, 125, 68, 0.08);
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 12.5px;
      font-family: 'Consolas', 'Courier New', monospace;
    }
    :host ::ng-deep .msg-bubble pre {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 10px 12px;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 12px;
      margin: 8px 0;
    }
    :host ::ng-deep .msg-bubble pre code {
      background: none;
      padding: 0;
      color: inherit;
    }

    /* ── Responsive ─────────────────────────────────────── */
    @media (max-width: 480px) {
      .chat-panel {
        width: calc(100vw - 16px);
        height: calc(100vh - 80px);
        bottom: 8px;
        right: 8px;
        border-radius: 12px;
      }
      .chat-fab {
        bottom: 16px;
        right: 16px;
        width: 52px;
        height: 52px;
        font-size: 22px;
      }
      .fab-pulse { width: 52px; height: 52px; }
    }
  `]
})
export class ChatbotWidgetComponent implements AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('chatInput') private chatInputEl!: ElementRef;

  isOpen = false;
  isTyping = false;
  userInput = '';
  messages: ChatMessage[] = [];

  constructor(private chatbot: ChatbotService) {
    this.messages = this.chatbot.getHistory();
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  toggleChat(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      setTimeout(() => this.chatInputEl?.nativeElement?.focus(), 350);
    }
  }

  async send(): Promise<void> {
    const text = this.userInput.trim();
    if (!text || this.isTyping) return;

    this.userInput = '';
    this.isTyping = true;

    try {
      await this.chatbot.ask(text);
      this.messages = this.chatbot.getHistory();
    } finally {
      this.isTyping = false;
      setTimeout(() => this.chatInputEl?.nativeElement?.focus(), 100);
    }
  }

  async askQuick(question: string): Promise<void> {
    this.userInput = question;
    await this.send();
  }

  clearChat(): void {
    this.chatbot.clearHistory();
    this.messages = this.chatbot.getHistory();
  }

  /** Convert basic markdown to HTML */
  formatMessage(text: string): string {
    return text
      // Code blocks ```...```
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      // Inline code `...`
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Bold **...**
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Italic *...*
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // Newlines
      .replace(/\n/g, '<br>');
  }

  private scrollToBottom(): void {
    try {
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch (_) {}
  }
}
