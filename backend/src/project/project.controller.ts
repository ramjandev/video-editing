import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { ProjectService } from './project.service';

@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  async createProject(@Body('title') title?: string) {
    return await this.projectService.create(title || 'New Project');
  }

  @Get(':id')
  async getProject(@Param('id') id: string) {
    return await this.projectService.findOne(id);
  }

  @Put(':id/autosave')
  async autosaveProject(
    @Param('id') id: string,
    @Body('sceneGraph') sceneGraph: any,
  ) {
    return await this.projectService.autosave(id, sceneGraph);
  }
}
