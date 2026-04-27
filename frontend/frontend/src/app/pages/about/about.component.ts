import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
<div class="about-page" [attr.data-theme]="theme">

<div class="bg-grid"></div>
<canvas id="particles"></canvas>

<nav>
    <div class="nav-left">
        <a routerLink="/" class="nav-brand"><div class="nav-icon">A</div>AxiomDSF</a>
        <div class="nav-links">
            <a href="#about">About</a>
            <a href="#pipeline">Pipeline</a>
            <a href="#team">Team</a>
            <a href="#capabilities">Capabilities</a>
        </div>
    </div>
    <div class="nav-right">
        <div class="theme-toggle" (click)="toggleTheme()" title="Toggle theme">
            <div class="theme-icons"><span>&#9790;</span><span>&#9788;</span></div>
        </div>
        <a routerLink="/" class="nav-back">&larr; Home</a>
    </div>
</nav>

<div class="container">

    <section class="hero">
        <div class="hero-orb hero-orb-1"></div>
        <div class="hero-orb hero-orb-2"></div>
        <div class="hero-orb hero-orb-3"></div>
        <div class="reveal"><div class="hero-badge"><span class="pulse-dot"></span>Built by Liminal Forge</div></div>
        <h1 class="reveal reveal-d1"><span class="gradient-text">AxiomDSF</span></h1>
        <p class="hero-sub reveal reveal-d2">An AI-powered development factory that orchestrates specialized agents to transform raw requirements into production-ready, tested, and secure code.</p>
        <div class="stats-row reveal reveal-d3">
            <div class="stat-item"><div class="stat-value" [attr.data-count]="10">0</div><div class="stat-label">AI Agents</div></div>
            <div class="stat-item"><div class="stat-value">100%</div><div class="stat-label">Traceability</div></div>
            <div class="stat-item"><div class="stat-value">E2E</div><div class="stat-label">Automation</div></div>
            <div class="stat-item"><div class="stat-value" [attr.data-count]="0">0</div><div class="stat-label">Quality Gaps</div></div>
        </div>
    </section>

    <div class="divider"></div>

    <section id="about">
        <div class="reveal"><div class="section-label">About the Project</div><h2 class="section-title">Redefining How Software Gets Built</h2></div>
        <div class="about-grid">
            <div class="about-text reveal reveal-d1">
                <p><strong>AxiomDSF</strong> is a next-generation platform that eliminates the inefficiencies of traditional SDLC workflows. By deploying a coordinated pipeline of 10 specialized AI agents, it systematically transforms unstructured requirements into fully implemented, tested, and security-audited applications.</p>
                <p>Every artifact is traceable &mdash; from the initial requirement through architecture, user stories, test specifications, and final code. No handoff losses. No communication gaps. No quality blind spots.</p>
                <p>Built by <strong>Team Liminal Forge</strong>, AxiomDSF makes software engineering a deterministic, repeatable, and verifiable process.</p>
            </div>
            <div class="about-cards reveal reveal-d2 stagger-children">
                <div class="about-card"><div class="about-icon" style="background:var(--accent-dim);color:var(--accent-light);">&#9670;</div><div><h4>Deterministic Pipeline</h4><p>Linear agent flow prevents rework and ensures consistent outputs</p></div></div>
                <div class="about-card"><div class="about-icon" style="background:var(--green-dim);color:var(--green);">&#9671;</div><div><h4>Full Traceability</h4><p>Every line of code maps back to a requirement through tagged artifacts</p></div></div>
                <div class="about-card"><div class="about-icon" style="background:var(--purple-dim);color:var(--purple);">&#9674;</div><div><h4>Built-In Quality Gates</h4><p>Security scanning and static analysis are integral, not afterthoughts</p></div></div>
                <div class="about-card"><div class="about-icon" style="background:var(--amber-dim);color:var(--amber);">&#9672;</div><div><h4>Zero Handoff Loss</h4><p>Structured outputs ensure no knowledge is lost between phases</p></div></div>
            </div>
        </div>
    </section>

    <div class="divider"></div>

    <section id="pipeline">
        <div class="reveal"><div class="section-label">Agent Pipeline</div><h2 class="section-title">10 Agents. One Seamless Workflow.</h2><p class="section-desc">Each agent is a specialist. Together, they form a complete software development lifecycle.</p></div>
        <div class="pipeline-timeline stagger-children reveal reveal-d1">
            <div class="pipeline-line"></div>
            <div class="pipeline-item"><div class="pipeline-node node-1">1</div><div class="pipeline-body"><h4>Requirement Analysis <span class="phase-tag tag-design">Design</span></h4><p>Refines raw, ambiguous requirements into structured specs with scope, constraints, and deterministic acceptance criteria.</p></div></div>
            <div class="pipeline-item"><div class="pipeline-node node-2">2</div><div class="pipeline-body"><h4>HLS &mdash; High-Level Solution <span class="phase-tag tag-design">Design</span></h4><p>Selects technology stack, defines component architecture, addresses NFRs, identifies risks, and outlines deployment strategy.</p></div></div>
            <div class="pipeline-item"><div class="pipeline-node node-3">3</div><div class="pipeline-body"><h4>HLD &mdash; High-Level Design <span class="phase-tag tag-design">Design</span></h4><p>Decomposes system into containers, components, and integration points with use-case sequence flows.</p></div></div>
            <div class="pipeline-item"><div class="pipeline-node node-4">4</div><div class="pipeline-body"><h4>User Story Agent <span class="phase-tag tag-build">Build</span></h4><p>Generates INVEST-compliant user stories with acceptance criteria, edge cases, dependencies, and TDD tags.</p></div></div>
            <div class="pipeline-item"><div class="pipeline-node node-5">5</div><div class="pipeline-body"><h4>Test Review Agent <span class="phase-tag tag-build">Build</span></h4><p>Converts user stories and acceptance criteria into structured Gherkin scenarios for comprehensive test coverage.</p></div></div>
            <div class="pipeline-item"><div class="pipeline-node node-6">6</div><div class="pipeline-body"><h4>LLD &mdash; Low-Level Design <span class="phase-tag tag-build">Build</span></h4><p>Produces implementation-ready class definitions, method signatures, data models, and sequence flows.</p></div></div>
            <div class="pipeline-item"><div class="pipeline-node node-7">7</div><div class="pipeline-body"><h4>TDD &mdash; Test-Driven Development <span class="phase-tag tag-build">Build</span></h4><p>Transforms test review scenarios into compilable, runnable test code with full setup, mocks, and assertions.</p></div></div>
            <div class="pipeline-item"><div class="pipeline-node node-8">8</div><div class="pipeline-body"><h4>Coding Agent <span class="phase-tag tag-build">Build</span></h4><p>Implements production source code from LLD contracts, ensuring all TDD tests pass on first execution.</p></div></div>
            <div class="pipeline-item"><div class="pipeline-node node-9">9</div><div class="pipeline-body"><h4>Static Code Analysis <span class="phase-tag tag-quality">Quality</span></h4><p>Scans for code quality issues &mdash; style violations, complexity hotspots, duplication, and potential bugs.</p></div></div>
            <div class="pipeline-item"><div class="pipeline-node node-10">10</div><div class="pipeline-body"><h4>Security Agent <span class="phase-tag tag-quality">Quality</span></h4><p>Detects vulnerabilities mapped to CWE/OWASP standards with severity ratings and actionable remediation.</p></div></div>
        </div>
    </section>

    <div class="divider"></div>

    <section id="team">
        <div class="reveal" style="text-align:center;"><div class="section-label">The People Behind AxiomDSF</div><h2 class="section-title">Team Liminal Forge</h2></div>
        <div class="mentors-label reveal reveal-d1"><h3>Project Mentors</h3><p>Guiding the vision and technical direction</p></div>
        <div class="mentors-row reveal reveal-d1 stagger-children">
            <div class="mentor-card"><div class="mentor-avatar">PP</div><div class="mentor-name">Pradeep Patil</div><div class="mentor-role">Project Mentor</div></div>
            <div class="mentor-card"><div class="mentor-avatar">PK</div><div class="mentor-name">Prashant Kalel</div><div class="mentor-role">Project Mentor</div></div>
        </div>
        <div class="members-label reveal reveal-d2"><h3>Team Members</h3><p>15 engineers building the future of software development</p></div>
        <div class="team-grid reveal reveal-d3 stagger-children">
            <div class="team-card"><div class="team-avatar av-1">SH</div><div class="team-name">S P Harshini</div></div>
            <div class="team-card"><div class="team-avatar av-2">NS</div><div class="team-name">Neya S</div></div>
            <div class="team-card"><div class="team-avatar av-3">KK</div><div class="team-name">Kripesh K</div></div>
            <div class="team-card"><div class="team-avatar av-4">VO</div><div class="team-name">V Oviashri</div></div>
            <div class="team-card"><div class="team-avatar av-5">GJ</div><div class="team-name">Gurucharan J</div></div>
            <div class="team-card"><div class="team-avatar av-6">SP</div><div class="team-name">Shyaamalan P</div></div>
            <div class="team-card"><div class="team-avatar av-7">MP</div><div class="team-name">Maddi Padmavathi</div></div>
            <div class="team-card"><div class="team-avatar av-1">KG</div><div class="team-name">Kishor G</div></div>
            <div class="team-card"><div class="team-avatar av-2">SM</div><div class="team-name">Surya Murugan M S</div></div>
            <div class="team-card"><div class="team-avatar av-3">DM</div><div class="team-name">Devadharshini M</div></div>
            <div class="team-card"><div class="team-avatar av-4">AK</div><div class="team-name">Abhineeth K</div></div>
            <div class="team-card"><div class="team-avatar av-5">UR</div><div class="team-name">M. Ujwala Reddy</div></div>
            <div class="team-card"><div class="team-avatar av-6">PY</div><div class="team-name">Peesapati Yashwanth</div></div>
            <div class="team-card"><div class="team-avatar av-7">AJ</div><div class="team-name">Akilesh Jayashankar</div></div>
            <div class="team-card"><div class="team-avatar av-1">CM</div><div class="team-name">Cheerla Mounika</div></div>
        </div>
    </section>

    <div class="divider"></div>

    <section id="capabilities">
        <div class="reveal"><div class="section-label">Core Capabilities</div><h2 class="section-title">What Makes AxiomDSF Different</h2></div>
        <div class="cap-grid reveal reveal-d1 stagger-children">
            <div class="cap-card"><div class="cap-icon" style="background:var(--accent-dim);color:var(--accent-light);">&#9632;</div><h4>Autonomous Agent Pipeline</h4><p>10 purpose-built agents execute sequentially with zero human intervention.</p><ul><li>Single responsibility per agent</li><li>Structured markdown handoff</li><li>No feedback loops</li></ul></div>
            <div class="cap-card"><div class="cap-icon" style="background:var(--green-dim);color:var(--green);">&#9650;</div><h4>End-to-End Traceability</h4><p>Complete audit trail from requirement to deployment with tagged artifacts.</p><ul><li>&#64;REQ, &#64;US, &#64;AC tagging</li><li>Priority-based test ordering</li><li>Bi-directional mapping</li></ul></div>
            <div class="cap-card"><div class="cap-icon" style="background:var(--purple-dim);color:var(--purple);">&#9724;</div><h4>Security by Design</h4><p>Vulnerabilities caught before deployment through automated CWE/OWASP scanning.</p><ul><li>Injection &amp; auth analysis</li><li>Severity prioritization</li><li>Actionable remediation</li></ul></div>
            <div class="cap-card"><div class="cap-icon" style="background:var(--amber-dim);color:var(--amber);">&#9733;</div><h4>Test-First Development</h4><p>Tests generated before code, ensuring every implementation satisfies its spec.</p><ul><li>Test review from user stories</li><li>Compilable test generation</li><li>Framework-native patterns</li></ul></div>
            <div class="cap-card"><div class="cap-icon" style="background:var(--rose-dim);color:var(--rose);">&#9830;</div><h4>Consistent &amp; Repeatable</h4><p>Identical inputs always produce identical outputs across projects.</p><ul><li>Standardized templates</li><li>Deterministic behavior</li><li>Reproducible artifacts</li></ul></div>
            <div class="cap-card"><div class="cap-icon" style="background:var(--cyan-dim);color:var(--cyan);">&#9679;</div><h4>Accelerated Delivery</h4><p>Dramatically reduces time from requirement to working code.</p><ul><li>Hours instead of weeks</li><li>Parallel quality gates</li><li>Minimal manual intervention</li></ul></div>
        </div>
        <div style="text-align:center;margin-top:56px;" class="reveal reveal-d2">
            <div class="section-label">Technology Stack</div>
            <div class="tech-row">
                <span class="tech-tag">Spring Boot 4</span><span class="tech-tag">Java 21</span><span class="tech-tag">Angular 18</span>
                <span class="tech-tag">Hibernate 7</span><span class="tech-tag">SQLite</span><span class="tech-tag">GitHub Copilot</span>
                <span class="tech-tag">Maven</span><span class="tech-tag">JPA</span><span class="tech-tag">TypeScript</span><span class="tech-tag">Tomcat 11</span>
            </div>
        </div>
    </section>

    <footer>
        <div class="footer-brand">AxiomDSF</div>
        <div class="footer-text">AI-Powered Software Development Factory</div>
        <div class="footer-text">&copy; 2026 Liminal Forge &middot; All rights reserved</div>
        <div class="footer-links"><a routerLink="/">Home</a><a href="/swagger-ui.html">API Docs</a><a href="/api/health">Health</a></div>
    </footer>
</div>

</div>
  `,
  styles: [`
    :host { display: block; }
    .about-page {
      --transition-theme: background 0.4s ease, color 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease;
      position: relative;
      min-height: 100vh;
    }

    .about-page[data-theme="dark"] {
      --bg-primary: #06080d; --bg-secondary: #0d1117; --bg-card: rgba(17,24,39,0.7); --bg-card-solid: #111827;
      --bg-card-hover: #1a2332; --bg-glass: rgba(17,24,39,0.5); --bg-nav: rgba(6,8,13,0.85);
      --accent: #3b82f6; --accent-light: #60a5fa; --accent-dim: rgba(59,130,246,0.08);
      --accent-glow: rgba(59,130,246,0.12); --accent-border: rgba(59,130,246,0.2);
      --green: #10b981; --green-dim: rgba(16,185,129,0.1); --purple: #8b5cf6; --purple-dim: rgba(139,92,246,0.1);
      --amber: #f59e0b; --amber-dim: rgba(245,158,11,0.1); --rose: #f43f5e; --rose-dim: rgba(244,63,94,0.1);
      --cyan: #06b6d4; --cyan-dim: rgba(6,182,212,0.1); --pink: #ec4899; --pink-dim: rgba(236,72,153,0.1);
      --text-primary: #f1f5f9; --text-secondary: #94a3b8; --text-muted: #64748b;
      --border: rgba(30,41,59,0.8); --border-light: #334155;
      --particle-color: rgba(59,130,246,0.15); --shadow-card: 0 4px 24px rgba(0,0,0,0.3);
      --shadow-hover: 0 12px 40px rgba(59,130,246,0.12);
      background: var(--bg-primary); color: var(--text-primary);
    }

    .about-page[data-theme="light"] {
      --bg-primary: #f8fafc; --bg-secondary: #ffffff; --bg-card: rgba(255,255,255,0.8); --bg-card-solid: #ffffff;
      --bg-card-hover: #f1f5f9; --bg-glass: rgba(255,255,255,0.6); --bg-nav: rgba(248,250,252,0.9);
      --accent: #2563eb; --accent-light: #3b82f6; --accent-dim: rgba(37,99,235,0.05);
      --accent-glow: rgba(37,99,235,0.08); --accent-border: rgba(37,99,235,0.2);
      --green: #059669; --green-dim: rgba(5,150,105,0.08); --purple: #7c3aed; --purple-dim: rgba(124,58,237,0.08);
      --amber: #d97706; --amber-dim: rgba(217,119,6,0.08); --rose: #e11d48; --rose-dim: rgba(225,29,72,0.08);
      --cyan: #0891b2; --cyan-dim: rgba(8,145,178,0.08); --pink: #db2777; --pink-dim: rgba(219,39,119,0.08);
      --text-primary: #0f172a; --text-secondary: #475569; --text-muted: #94a3b8;
      --border: rgba(226,232,240,0.9); --border-light: #cbd5e1;
      --particle-color: rgba(37,99,235,0.06); --shadow-card: 0 4px 24px rgba(0,0,0,0.06);
      --shadow-hover: 0 12px 40px rgba(37,99,235,0.1);
      background: var(--bg-primary); color: var(--text-primary);
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    ::selection { background: var(--accent); color: white; }

    #particles { position: fixed; inset: 0; z-index: 0; pointer-events: none; }

    .bg-grid {
      position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background-image: linear-gradient(var(--particle-color) 1px, transparent 1px), linear-gradient(90deg, var(--particle-color) 1px, transparent 1px);
      background-size: 80px 80px;
      mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
      -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
    }

    nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 1000; padding: 0 48px; height: 64px;
      display: flex; align-items: center; justify-content: space-between;
      background: var(--bg-nav); backdrop-filter: blur(24px) saturate(180%);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      border-bottom: 1px solid var(--border); transition: var(--transition-theme);
    }
    .nav-left { display: flex; align-items: center; gap: 32px; }
    .nav-brand {
      font-size: 1.15rem; font-weight: 700; color: var(--text-primary); text-decoration: none;
      letter-spacing: -0.5px; display: flex; align-items: center; gap: 10px; transition: var(--transition-theme);
    }
    .nav-icon {
      width: 30px; height: 30px; background: linear-gradient(135deg, var(--accent), var(--purple));
      border-radius: 8px; display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 0.8rem; color: white;
    }
    .nav-links { display: flex; gap: 28px; }
    .nav-links a {
      color: var(--text-muted); text-decoration: none; font-size: 0.82rem; font-weight: 500;
      transition: color 0.2s; position: relative; cursor: pointer;
    }
    .nav-links a::after {
      content: ''; position: absolute; bottom: -4px; left: 0; width: 0; height: 2px;
      background: var(--accent); border-radius: 1px; transition: width 0.3s;
    }
    .nav-links a:hover { color: var(--accent-light); }
    .nav-links a:hover::after { width: 100%; }
    .nav-right { display: flex; align-items: center; gap: 16px; }

    .theme-toggle {
      width: 44px; height: 24px; background: var(--border); border: 1px solid var(--border-light);
      border-radius: 12px; cursor: pointer; position: relative; transition: all 0.3s;
    }
    .theme-toggle::after {
      content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px;
      border-radius: 50%; background: var(--accent);
      transition: transform 0.3s cubic-bezier(0.4,0,0.2,1); box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .about-page[data-theme="light"] .theme-toggle::after { transform: translateX(20px); background: var(--amber); }
    .theme-icons {
      display: flex; align-items: center; justify-content: space-between; padding: 0 5px;
      height: 100%; font-size: 0.65rem; pointer-events: none; position: relative; z-index: 1;
    }
    .nav-back {
      padding: 7px 18px; background: transparent; border: 1px solid var(--border-light);
      color: var(--text-secondary); border-radius: 8px; text-decoration: none;
      font-size: 0.78rem; font-weight: 500; transition: all 0.25s;
    }
    .nav-back:hover { border-color: var(--accent); color: var(--accent-light); background: var(--accent-dim); }

    .container { position: relative; z-index: 1; max-width: 1200px; margin: 0 auto; padding: 0 24px; }

    .hero { padding: 140px 0 80px; text-align: center; position: relative; }
    .hero-orb {
      position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.12;
      pointer-events: none; animation: float 8s ease-in-out infinite;
    }
    .hero-orb-1 { width: 400px; height: 400px; top: 0; left: -100px; background: var(--accent); }
    .hero-orb-2 { width: 300px; height: 300px; top: 100px; right: -50px; background: var(--purple); animation-delay: -3s; }
    .hero-orb-3 { width: 200px; height: 200px; bottom: 0; left: 50%; background: var(--green); animation-delay: -5s; }
    @keyframes float { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-20px) scale(1.05)} }

    .hero-badge {
      display: inline-flex; align-items: center; gap: 8px; padding: 6px 18px;
      background: var(--accent-dim); border: 1px solid var(--accent-border);
      border-radius: 100px; font-size: 0.78rem; font-weight: 500; color: var(--accent-light);
      margin-bottom: 28px; backdrop-filter: blur(10px);
    }
    .pulse-dot {
      width: 6px; height: 6px; background: var(--accent); border-radius: 50%;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse { 0%,100%{opacity:1;box-shadow:0 0 0 0 var(--accent-glow)} 50%{opacity:0.6;box-shadow:0 0 0 8px transparent} }

    .hero h1 { font-size: 4.5rem; font-weight: 900; letter-spacing: -3px; line-height: 1; margin-bottom: 20px; }
    .gradient-text {
      background: linear-gradient(135deg, var(--accent) 0%, var(--purple) 50%, var(--pink) 100%);
      background-size: 200% 200%; -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text; animation: gradient-shift 6s ease infinite;
    }
    @keyframes gradient-shift { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }

    .hero-sub { font-size: 1.1rem; color: var(--text-secondary); max-width: 580px; margin: 0 auto 44px; font-weight: 400; line-height: 1.8; }
    .stats-row { display: flex; justify-content: center; gap: 56px; }
    .stat-item { text-align: center; }
    .stat-value {
      font-size: 2.8rem; font-weight: 800; letter-spacing: -1.5px;
      background: linear-gradient(135deg, var(--accent), var(--purple));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .stat-label { font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; margin-top: 2px; }

    section { padding: 80px 0; }
    .section-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 2.5px; color: var(--accent); font-weight: 600; margin-bottom: 12px; }
    .section-title { font-size: 2.2rem; font-weight: 800; letter-spacing: -1px; margin-bottom: 14px; }
    .section-desc { font-size: 1rem; color: var(--text-secondary); max-width: 600px; line-height: 1.7; }
    .divider { height: 1px; background: linear-gradient(90deg, transparent, var(--border-light), transparent); }

    .about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: start; }
    .about-text p { color: var(--text-secondary); margin-bottom: 18px; font-size: 0.95rem; line-height: 1.7; }
    .about-text strong { color: var(--text-primary); font-weight: 600; }
    .about-cards { display: flex; flex-direction: column; gap: 14px; }
    .about-card {
      display: flex; align-items: flex-start; gap: 16px; padding: 18px 20px;
      background: var(--bg-card); backdrop-filter: blur(12px); border: 1px solid var(--border);
      border-radius: 12px; transition: all 0.35s cubic-bezier(0.4,0,0.2,1);
    }
    .about-card:hover { border-color: var(--accent-border); transform: translateX(6px); box-shadow: var(--shadow-hover); }
    .about-icon {
      width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center;
      justify-content: center; font-size: 0.95rem; flex-shrink: 0; font-weight: 600;
    }
    .about-card h4 { font-size: 0.9rem; font-weight: 600; margin-bottom: 3px; }
    .about-card p { font-size: 0.8rem; color: var(--text-muted); margin: 0; }

    .pipeline-timeline { position: relative; padding: 40px 0 20px; }
    .pipeline-line {
      position: absolute; top: 0; bottom: 0; left: 28px; width: 2px;
      background: linear-gradient(180deg, var(--accent), var(--purple), var(--green), var(--amber), var(--rose));
      border-radius: 2px; opacity: 0.3;
    }
    .pipeline-item { display: flex; align-items: flex-start; gap: 24px; padding: 16px 0; position: relative; }
    .pipeline-node {
      width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center;
      justify-content: center; flex-shrink: 0; font-size: 1.1rem; font-weight: 800; color: white;
      position: relative; z-index: 2; transition: all 0.4s cubic-bezier(0.4,0,0.2,1); cursor: default;
    }
    .pipeline-item:hover .pipeline-node { transform: scale(1.12) rotate(-3deg); box-shadow: 0 8px 32px rgba(59,130,246,0.3); }
    .pipeline-body {
      flex: 1; padding: 12px 24px; background: var(--bg-card); backdrop-filter: blur(12px);
      border: 1px solid var(--border); border-radius: 14px;
      transition: all 0.35s cubic-bezier(0.4,0,0.2,1); cursor: default;
    }
    .pipeline-item:hover .pipeline-body { border-color: var(--accent-border); background: var(--bg-card-hover); transform: translateX(4px); box-shadow: var(--shadow-hover); }
    .pipeline-body h4 { font-size: 1rem; font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 10px; }
    .pipeline-body h4 .phase-tag {
      font-size: 0.62rem; padding: 2px 8px; border-radius: 4px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .tag-design { background: var(--green-dim); color: var(--green); }
    .tag-build { background: var(--accent-dim); color: var(--accent-light); }
    .tag-quality { background: var(--amber-dim); color: var(--amber); }
    .pipeline-body p { font-size: 0.82rem; color: var(--text-muted); line-height: 1.6; }

    .node-1{background:linear-gradient(135deg,#10b981,#059669)}.node-2{background:linear-gradient(135deg,#14b8a6,#0d9488)}
    .node-3{background:linear-gradient(135deg,#06b6d4,#0891b2)}.node-4{background:linear-gradient(135deg,#3b82f6,#2563eb)}
    .node-5{background:linear-gradient(135deg,#6366f1,#4f46e5)}.node-6{background:linear-gradient(135deg,#8b5cf6,#7c3aed)}
    .node-7{background:linear-gradient(135deg,#a855f7,#9333ea)}.node-8{background:linear-gradient(135deg,#ec4899,#db2777)}
    .node-9{background:linear-gradient(135deg,#f59e0b,#d97706)}.node-10{background:linear-gradient(135deg,#ef4444,#dc2626)}

    .mentors-label,.members-label { text-align: center; margin-bottom: 28px; }
    .mentors-label h3,.members-label h3 { font-size: 1.3rem; font-weight: 700; margin-bottom: 6px; }
    .mentors-label p,.members-label p { font-size: 0.85rem; color: var(--text-muted); }
    .mentors-row { display: grid; grid-template-columns: repeat(2,1fr); gap: 20px; max-width: 580px; margin: 0 auto 56px; }
    .mentor-card {
      padding: 32px 24px; background: var(--bg-card); backdrop-filter: blur(12px);
      border: 1px solid var(--accent-border); border-radius: 16px; text-align: center;
      position: relative; overflow: hidden; transition: all 0.35s;
    }
    .mentor-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, var(--accent), var(--purple)); }
    .mentor-card:hover { transform: translateY(-5px); box-shadow: var(--shadow-hover); border-color: var(--accent); }
    .mentor-avatar {
      width: 60px; height: 60px; border-radius: 50%;
      background: linear-gradient(135deg, var(--accent), var(--purple));
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 1.3rem; font-weight: 700; color: white; margin-bottom: 14px;
      box-shadow: 0 4px 16px rgba(59,130,246,0.3);
    }
    .mentor-name { font-size: 1.05rem; font-weight: 700; margin-bottom: 4px; }
    .mentor-role { font-size: 0.72rem; color: var(--accent-light); font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; }

    .team-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 14px; }
    .team-card {
      padding: 22px 10px; background: var(--bg-card); backdrop-filter: blur(12px);
      border: 1px solid var(--border); border-radius: 14px; text-align: center;
      transition: all 0.35s cubic-bezier(0.4,0,0.2,1); cursor: default;
    }
    .team-card:hover { border-color: var(--accent-border); transform: translateY(-5px) scale(1.02); box-shadow: var(--shadow-hover); }
    .team-avatar {
      width: 46px; height: 46px; border-radius: 50%; display: inline-flex; align-items: center;
      justify-content: center; font-size: 0.82rem; font-weight: 700; color: white;
      margin-bottom: 10px; transition: transform 0.3s;
    }
    .team-card:hover .team-avatar { transform: scale(1.1); }
    .team-name { font-size: 0.82rem; font-weight: 600; line-height: 1.3; }
    .av-1{background:linear-gradient(135deg,#3b82f6,#1d4ed8)}.av-2{background:linear-gradient(135deg,#8b5cf6,#6d28d9)}
    .av-3{background:linear-gradient(135deg,#10b981,#047857)}.av-4{background:linear-gradient(135deg,#f59e0b,#b45309)}
    .av-5{background:linear-gradient(135deg,#ef4444,#b91c1c)}.av-6{background:linear-gradient(135deg,#06b6d4,#0e7490)}
    .av-7{background:linear-gradient(135deg,#ec4899,#be185d)}

    .cap-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 18px; }
    .cap-card {
      padding: 28px 22px; background: var(--bg-card); backdrop-filter: blur(12px);
      border: 1px solid var(--border); border-radius: 14px;
      transition: all 0.35s cubic-bezier(0.4,0,0.2,1); position: relative; overflow: hidden;
    }
    .cap-card::before { content: ''; position: absolute; top: 0; left: 0; width: 3px; height: 100%; border-radius: 0 2px 2px 0; opacity: 0; transition: opacity 0.3s; }
    .cap-card:hover::before { opacity: 1; }
    .cap-card:hover { border-color: var(--accent-border); transform: translateY(-4px); box-shadow: var(--shadow-hover); }
    .cap-card:nth-child(1)::before{background:var(--accent)}.cap-card:nth-child(2)::before{background:var(--green)}
    .cap-card:nth-child(3)::before{background:var(--purple)}.cap-card:nth-child(4)::before{background:var(--amber)}
    .cap-card:nth-child(5)::before{background:var(--rose)}.cap-card:nth-child(6)::before{background:var(--cyan)}
    .cap-icon { width: 42px; height: 42px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; margin-bottom: 16px; }
    .cap-card h4 { font-size: 0.95rem; font-weight: 600; margin-bottom: 8px; }
    .cap-card p { font-size: 0.82rem; color: var(--text-muted); line-height: 1.6; }
    .cap-card ul { list-style: none; padding: 0; margin-top: 10px; }
    .cap-card li { font-size: 0.78rem; color: var(--text-secondary); padding: 4px 0 4px 16px; position: relative; }
    .cap-card li::before { content: ''; position: absolute; left: 0; top: 10px; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); opacity: 0.5; }

    .tech-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 40px; }
    .tech-tag {
      padding: 7px 16px; background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 100px; font-size: 0.76rem; font-weight: 500; color: var(--text-secondary);
      font-family: 'JetBrains Mono', monospace; transition: all 0.25s; cursor: default;
    }
    .tech-tag:hover { border-color: var(--accent); color: var(--accent-light); background: var(--accent-dim); }

    footer { padding: 48px 0; text-align: center; border-top: 1px solid var(--border); }
    .footer-brand { font-size: 1rem; font-weight: 700; margin-bottom: 6px; }
    .footer-text { font-size: 0.78rem; color: var(--text-muted); margin-bottom: 2px; }
    .footer-links { display: flex; justify-content: center; gap: 24px; margin-top: 18px; }
    .footer-links a { font-size: 0.76rem; color: var(--text-muted); text-decoration: none; font-weight: 500; transition: color 0.2s; cursor: pointer; }
    .footer-links a:hover { color: var(--accent-light); }

    .reveal { opacity: 0; transform: translateY(30px); transition: opacity 0.7s cubic-bezier(0.4,0,0.2,1), transform 0.7s cubic-bezier(0.4,0,0.2,1); }
    .reveal.visible { opacity: 1; transform: translateY(0); }
    .reveal-d1{transition-delay:0.1s}.reveal-d2{transition-delay:0.2s}.reveal-d3{transition-delay:0.3s}

    .stagger-children > * { opacity: 0; transform: translateY(20px); transition: opacity 0.5s ease, transform 0.5s ease; }
    .stagger-children.visible > *:nth-child(1){transition-delay:.05s}.stagger-children.visible > *:nth-child(2){transition-delay:.1s}
    .stagger-children.visible > *:nth-child(3){transition-delay:.15s}.stagger-children.visible > *:nth-child(4){transition-delay:.2s}
    .stagger-children.visible > *:nth-child(5){transition-delay:.25s}.stagger-children.visible > *:nth-child(6){transition-delay:.3s}
    .stagger-children.visible > *:nth-child(7){transition-delay:.35s}.stagger-children.visible > *:nth-child(8){transition-delay:.4s}
    .stagger-children.visible > *:nth-child(9){transition-delay:.45s}.stagger-children.visible > *:nth-child(10){transition-delay:.5s}
    .stagger-children.visible > * { opacity: 1; transform: translateY(0); }

    @media(max-width:1024px){ .team-grid{grid-template-columns:repeat(3,1fr)} .cap-grid{grid-template-columns:repeat(2,1fr)} }
    @media(max-width:768px){
      nav{padding:0 20px} .nav-links{display:none} .hero h1{font-size:2.8rem;letter-spacing:-2px}
      .stats-row{gap:24px;flex-wrap:wrap} .stat-value{font-size:2rem} .about-grid{grid-template-columns:1fr}
      .pipeline-line{left:24px} .pipeline-node{width:48px;height:48px;font-size:.95rem}
      .team-grid{grid-template-columns:repeat(2,1fr)} .mentors-row{grid-template-columns:1fr;max-width:300px}
      .cap-grid{grid-template-columns:1fr} section{padding:56px 0}
    }
  `]
})
export class AboutComponent implements OnInit, AfterViewInit, OnDestroy {
  theme = 'dark';
  private animFrameId: number | null = null;
  private observer: IntersectionObserver | null = null;
  private counterObserver: IntersectionObserver | null = null;

  ngOnInit() {
    const saved = localStorage.getItem('axiom-theme');
    if (saved) this.theme = saved;
  }

  ngAfterViewInit() {
    this.initObservers();
    this.initParticles();
  }

  ngOnDestroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.observer) this.observer.disconnect();
    if (this.counterObserver) this.counterObserver.disconnect();
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('axiom-theme', this.theme);
    this.initParticles();
  }

  private initObservers() {
    this.observer = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

    const el = document.querySelector('.about-page');
    if (el) {
      el.querySelectorAll('.reveal,.stagger-children').forEach(x => this.observer!.observe(x));
    }

    this.counterObserver = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { this.animateCounters(); this.counterObserver!.disconnect(); }
      });
    }, { threshold: 0.5 });

    const sr = document.querySelector('.stats-row');
    if (sr) this.counterObserver.observe(sr);
  }

  private animateCounters() {
    document.querySelectorAll<HTMLElement>('[data-count]').forEach(el => {
      const target = parseInt(el.dataset['count'] || '0', 10);
      const dur = 1500;
      const start = performance.now();
      function step(now: number) {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  private initParticles() {
    const c = document.getElementById('particles') as HTMLCanvasElement;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dk = this.theme === 'dark';

    const rs = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    rs();
    window.addEventListener('resize', rs);

    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);

    class P {
      x = 0; y = 0; s = 0; sx = 0; sy = 0; o = 0;
      constructor() { this.r(); }
      r() {
        this.x = Math.random() * c.width; this.y = Math.random() * c.height;
        this.s = Math.random() * 1.5 + 0.5;
        this.sx = (Math.random() - 0.5) * 0.3; this.sy = (Math.random() - 0.5) * 0.3;
        this.o = Math.random() * (dk ? 0.4 : 0.2) + 0.1;
      }
      u() { this.x += this.sx; this.y += this.sy; if (this.x < 0 || this.x > c.width || this.y < 0 || this.y > c.height) this.r(); }
      d() {
        ctx!.beginPath(); ctx!.arc(this.x, this.y, this.s, 0, Math.PI * 2);
        ctx!.fillStyle = dk ? `rgba(96,165,250,${this.o})` : `rgba(37,99,235,${this.o})`; ctx!.fill();
      }
    }

    const ps = Array.from({ length: 60 }, () => new P());
    const self = this;
    function anim() {
      ctx!.clearRect(0, 0, c.width, c.height);
      ps.forEach(p => { p.u(); p.d(); });
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        const dx = ps[i].x - ps[j].x; const dy = ps[i].y - ps[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx!.beginPath(); ctx!.moveTo(ps[i].x, ps[i].y); ctx!.lineTo(ps[j].x, ps[j].y);
          const a = (1 - dist / 120) * (dk ? 0.08 : 0.04);
          ctx!.strokeStyle = dk ? `rgba(96,165,250,${a})` : `rgba(37,99,235,${a})`;
          ctx!.lineWidth = 0.5; ctx!.stroke();
        }
      }
      self.animFrameId = requestAnimationFrame(anim);
    }
    anim();
  }
}
