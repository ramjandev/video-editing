import { Controller, Post, Body, Req, Res } from '@nestjs/common';
import * as express from 'express';
import { ExportService } from './export.service';

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post()
  async exportVideo(
    @Body('sceneGraph') sceneGraph: any,
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const host = req.get('host');
    const protocol = req.protocol;
    const requestOrigin = `${protocol}://${host}`;

    try {
      await this.exportService.export(sceneGraph, res, requestOrigin);
    } catch (error: any) {
      console.error('Export initiation error:', error);
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          message: error.message || 'Failed to start export rendering',
        })}\n\n`,
      );
      res.end();
    }
  }
}
