import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAssetInput {
  original_url: string;
  preview_url?: string;
  duration?: number;
  type?: string;
  public_id?: string;
}

@Injectable()
export class AssetService {
  constructor(private prisma: PrismaService) {}

  private mapAsset(asset: any) {
    if (!asset) return null;
    const { id, ...rest } = asset;
    return { _id: id, ...rest };
  }

  async create(data: CreateAssetInput) {
    const asset = await this.prisma.asset.create({
      data: {
        original_url: data.original_url,
        preview_url: data.preview_url,
        duration: data.duration,
        type: data.type || 'video',
        public_id: data.public_id,
      },
    });
    return this.mapAsset(asset);
  }

  async findAll() {
    const assets = await this.prisma.asset.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    return assets.map((asset) => this.mapAsset(asset));
  }

  async delete(id: string) {
    const asset = await this.prisma.asset.delete({
      where: { id },
    });
    return this.mapAsset(asset);
  }
}
