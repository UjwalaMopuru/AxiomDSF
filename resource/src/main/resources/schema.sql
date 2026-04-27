-- Drop all tables for a clean start on every restart
DROP TABLE IF EXISTS agent_state_transition;
DROP TABLE IF EXISTS event;
DROP TABLE IF EXISTS workflow;
DROP TABLE IF EXISTS user_story;
DROP TABLE IF EXISTS requirement;
DROP TABLE IF EXISTS workspace;

CREATE TABLE IF NOT EXISTS workspace (
    id INTEGER PRIMARY KEY,
    project_name VARCHAR(255) UNIQUE,
    description TEXT,
    tech_stack VARCHAR(255),
    location VARCHAR(500),
    status BOOLEAN NOT NULL DEFAULT 1,
    -- Azure DevOps Configuration
    azure_devops_organization_url VARCHAR(500),
    azure_devops_project VARCHAR(255),
    azure_devops_repository VARCHAR(255),
    azure_devops_pat TEXT,
    azure_devops_branch VARCHAR(255),
    azure_devops_wiki_branch VARCHAR(255),
    pipeline_mode VARCHAR(50) DEFAULT 'per-story',
    azure_devops_enabled BOOLEAN NOT NULL DEFAULT 0,
    wiki_name VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS requirement (
    id INTEGER PRIMARY KEY,
    workspace_id BIGINT,
    user_story_id BIGINT,
    requirement_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_story (
    id INTEGER PRIMARY KEY,
    story_id VARCHAR(20),
    title VARCHAR(255),
    priority VARCHAR(10),
    workspace_id BIGINT,
    requirement_id BIGINT,
    file_path VARCHAR(500),
    user_story_text TEXT,
    azure_work_item_id BIGINT,
    azure_branch_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workflow (
    id INTEGER PRIMARY KEY,
    workspace_id BIGINT,
    requirement_id BIGINT,
    user_story_id BIGINT,
    agent_name VARCHAR(255),
    state VARCHAR(255),
    sequence_number INTEGER NOT NULL DEFAULT 0,
    input_file_path VARCHAR(500),
    output_file_path VARCHAR(500),
    input_wiki_url VARCHAR(1000),
    output_wiki_url VARCHAR(1000),
    completion_status BOOLEAN NOT NULL DEFAULT 0,
    pipeline_mode VARCHAR(50) DEFAULT 'per-story',
    selected_agents TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event (
    id INTEGER PRIMARY KEY,
    workspace_id BIGINT,
    requirement_id BIGINT,
    user_story_id BIGINT,
    agent_name VARCHAR(255),
    state VARCHAR(255),
    input_file_location VARCHAR(500),
    output_file_location VARCHAR(500),
    input_wiki_url VARCHAR(1000),
    output_wiki_url VARCHAR(1000),
    execution_order INTEGER,
    agent_type VARCHAR(255),
    agent_enabled BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_state_transition (
    id INTEGER PRIMARY KEY,
    workspace_id BIGINT,
    workflow_id BIGINT,
    requirement_id BIGINT,
    user_story_id BIGINT,
    agent_name VARCHAR(255),
    previous_state VARCHAR(255),
    present_state VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


