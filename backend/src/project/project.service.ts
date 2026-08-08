import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectService {
  constructor(private prisma: PrismaService) {}

  private mapProject(project: any) {
    if (!project) return null;
    const { id, ...rest } = project;
    return { _id: id, ...rest };
  }

  async create(title: string) {
    const project = await this.prisma.project.create({
      data: {
        title: title || 'Untitled Project',
        resolution: { w: 1920, h: 1080 },
      },
    });

    const initialSceneGraph = {
      projectId: project.id,
      duration: 0.0,
      fps: 30,
      resolution: { w: 1920, h: 1080 },
      tracks: [],
    };

    await this.prisma.projectVersion.create({
      data: {
        projectId: project.id,
        versionNum: 1,
        sceneGraph: initialSceneGraph,
      },
    });

    return {
      project: this.mapProject(project),
      sceneGraph: initialSceneGraph,
    };
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const latestVersion = await this.prisma.projectVersion.findFirst({
      where: { projectId: id },
      orderBy: { versionNum: 'desc' },
    });

    return {
      project: this.mapProject(project),
      sceneGraph: latestVersion ? latestVersion.sceneGraph : null,
    };
  }

  async autosave(projectId: string, sceneGraph: any) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Find the latest version number
    const latestVersion = await this.prisma.projectVersion.findFirst({
      where: { projectId },
      orderBy: { versionNum: 'desc' },
    });

    const nextVersionNum = latestVersion ? latestVersion.versionNum + 1 : 1;

    // Make sure the sceneGraph has the correct projectId
    if (sceneGraph) {
      sceneGraph.projectId = projectId;
    }

    await this.prisma.projectVersion.create({
      data: {
        projectId,
        versionNum: nextVersionNum,
        sceneGraph: sceneGraph,
      },
    });

    return {
      message: 'Autosaved successfully',
      version: nextVersionNum,
    };
  }
}
