import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand
} from "@aws-sdk/client-s3";
import { env } from "../config/env";
import { S3ObjectListPage, S3ObjectSummary } from "../types";

export class S3Connector {
  private client: S3Client;

  constructor() {
    const accessKeyId = env.AWS_ACCESS_KEY_ID?.trim() || undefined;
    const secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim() || undefined;

    this.client = new S3Client({
      region: env.AWS_REGION,
      credentials: accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey
          }
        : undefined
    });
  }

  async listBuckets(): Promise<string[]> {
    const response = await this.client.send(new ListBucketsCommand({}));
    return (response.Buckets ?? []).map((b) => b.Name ?? "").filter(Boolean);
  }

  async listFiles(bucket: string, prefix = ""): Promise<string[]> {
    const allItems: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken
        })
      );
      allItems.push(...(response.Contents ?? []).map((obj) => obj.Key ?? "").filter(Boolean));
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return allItems;
  }

  async listFilesPage(
    bucket: string,
    prefix = "",
    continuationToken?: string,
    maxKeys = 1000
  ): Promise<S3ObjectListPage> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
        ContinuationToken: continuationToken,
        FetchOwner: true
      })
    );
    const items: S3ObjectSummary[] = [];
    for (const obj of response.Contents ?? []) {
      const key = obj.Key ?? "";
      if (!key) continue;
      items.push({
        key,
        sizeBytes: obj.Size,
        lastModified: obj.LastModified?.toISOString(),
        storageClass: obj.StorageClass,
        owner: obj.Owner?.DisplayName ?? obj.Owner?.ID
      });
    }

    return {
      items,
      isTruncated: Boolean(response.IsTruncated),
      nextContinuationToken: response.NextContinuationToken
    };
  }

  async readTextFileStream(bucket: string, key: string): Promise<NodeJS.ReadableStream> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!response.Body) {
      throw new Error("Empty object body");
    }
    return response.Body as NodeJS.ReadableStream;
  }

  async getObjectMetadata(bucket: string, key: string): Promise<Record<string, unknown>> {
    const response = await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return {
      bucket,
      key,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      contentEncoding: response.ContentEncoding,
      eTag: response.ETag,
      lastModified: response.LastModified?.toISOString(),
      metadata: response.Metadata ?? {}
    };
  }
}
