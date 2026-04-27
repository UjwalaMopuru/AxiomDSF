package com.mphasis.axiomdsf.business.port.in;

import com.mphasis.axiomdsf.business.dto.CreateWorkspaceRequest;
import com.mphasis.axiomdsf.persistence.entity.Workspace;

import java.util.List;

public interface WorkspaceUseCase {

    Workspace createWorkspace(CreateWorkspaceRequest request);

    Workspace getWorkspaceByName(String projectName);

    Workspace getWorkspaceById(Long id);

    List<Workspace> listAllWorkspaces();

    Workspace updateWorkspace(Long id, CreateWorkspaceRequest request);

    void deleteWorkspace(Long id);
}
