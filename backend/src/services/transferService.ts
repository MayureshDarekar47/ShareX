import path from 'path';
import fs from 'fs';
import { Transfer, TransferStatus, FileInfo } from '../types';
import { config } from '../config';
import { generateTransferId, sanitizeFilename, makeUniqueFilename } from '../utils/crypto';
import { computeFileChecksum } from '../utils/crypto';

export interface TransferRecord extends Transfer {
  tempFiles: TempFile[]; // server-side temp file paths
}

interface TempFile {
  originalName: string;
  sanitizedName: string;
  tempPath: string;
  size: number;
  bytesWritten: number;
  checksum?: string;
  complete: boolean;
}

class TransferService {
  private transfers = new Map<string, TransferRecord>();
  private history: TransferRecord[] = [];

  createTransfer(
    senderId: string,
    receiverId: string,
    files: FileInfo[]
  ): TransferRecord {
    const id = generateTransferId();
    const tempDir = path.join(config.tempDir, id);
    fs.mkdirSync(tempDir, { recursive: true });

    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

    const record: TransferRecord = {
      id,
      senderId,
      receiverId,
      files,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      bytesTransferred: 0,
      totalBytes,
      tempPath: tempDir,
      tempFiles: files.map((f) => ({
        originalName: f.name,
        sanitizedName: sanitizeFilename(f.name),
        tempPath: path.join(tempDir, sanitizeFilename(f.name) + '.partial'),
        size: f.size,
        bytesWritten: 0,
        complete: false,
      })),
    };

    this.transfers.set(id, record);
    return record;
  }

  getTransfer(id: string): TransferRecord | undefined {
    return this.transfers.get(id);
  }

  getAllTransfers(): TransferRecord[] {
    return Array.from(this.transfers.values());
  }

  getActiveTransfers(): TransferRecord[] {
    const active: TransferStatus[] = ['pending', 'waiting_approval', 'approved', 'uploading', 'relaying'];
    return Array.from(this.transfers.values()).filter((t) => active.includes(t.status));
  }

  updateStatus(id: string, status: TransferStatus, error?: string): TransferRecord | undefined {
    const record = this.transfers.get(id);
    if (!record) return undefined;
    record.status = status;
    record.updatedAt = Date.now();
    if (error) record.error = error;
    return record;
  }

  updateProgress(id: string, bytesTransferred: number): TransferRecord | undefined {
    const record = this.transfers.get(id);
    if (!record) return undefined;
    record.bytesTransferred = bytesTransferred;
    record.updatedAt = Date.now();
    return record;
  }

  /**
   * Mark a specific file as fully uploaded and finalize it.
   */
  async finalizeFile(
    transferId: string,
    fileIndex: number,
    checksum?: string
  ): Promise<{ ok: boolean; error?: string; finalPath?: string }> {
    const record = this.transfers.get(transferId);
    if (!record) return { ok: false, error: 'Transfer not found' };

    const tf = record.tempFiles[fileIndex];
    if (!tf) return { ok: false, error: 'File index out of range' };

    // Verify file size
    let stat: fs.Stats;
    try {
      stat = fs.statSync(tf.tempPath);
    } catch {
      return { ok: false, error: 'Temp file not found' };
    }

    if (tf.size > 0 && stat.size !== tf.size) {
      return { ok: false, error: `Size mismatch: expected ${tf.size}, got ${stat.size}` };
    }

    // Verify checksum if provided
    if (checksum) {
      const computed = await computeFileChecksum(tf.tempPath);
      if (computed !== checksum) {
        return { ok: false, error: `Checksum mismatch: expected ${checksum}, got ${computed}` };
      }
      tf.checksum = computed;
    }

    // Move to received directory (for host transfers) or keep for relay
    if (record.receiverId === 'host') {
      const uniqueName = makeUniqueFilename(config.receivedDir, tf.sanitizedName);
      const finalPath = path.join(config.receivedDir, uniqueName);
      fs.renameSync(tf.tempPath, finalPath);
      tf.tempPath = finalPath;
      tf.complete = true;
      return { ok: true, finalPath };
    }

    tf.complete = true;
    return { ok: true };
  }

  /**
   * Check if all files in a transfer are complete.
   */
  isTransferComplete(id: string): boolean {
    const record = this.transfers.get(id);
    if (!record) return false;
    return record.tempFiles.every((f) => f.complete);
  }

  /**
   * Get download path for a file in a transfer.
   */
  getFilePath(transferId: string, fileIndex: number): string | undefined {
    const record = this.transfers.get(transferId);
    if (!record) return undefined;
    const tf = record.tempFiles[fileIndex];
    if (!tf) return undefined;
    return tf.tempPath;
  }

  /**
   * Complete the transfer and move to history.
   */
  completeTransfer(id: string): void {
    const record = this.transfers.get(id);
    if (!record) return;
    record.status = 'completed';
    record.updatedAt = Date.now();
    this.history.unshift(record);
    if (this.history.length > 500) this.history.pop();
    this.transfers.delete(id);
  }

  /**
   * Cancel a transfer and clean up temp files.
   */
  cancelTransfer(id: string): void {
    const record = this.transfers.get(id);
    if (!record) return;
    record.status = 'cancelled';
    this.cleanupTransferFiles(record);
    this.history.unshift(record);
    this.transfers.delete(id);
  }

  getHistory(): TransferRecord[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }

  /**
   * Remove temp files and directory for a transfer.
   */
  private cleanupTransferFiles(record: TransferRecord): void {
    if (record.tempPath && fs.existsSync(record.tempPath)) {
      try {
        fs.rmSync(record.tempPath, { recursive: true, force: true });
      } catch (e) {
        console.error(`Failed to cleanup transfer ${record.id}:`, e);
      }
    }
  }

  /**
   * Clean up abandoned/stale transfers.
   */
  cleanupAbandoned(): void {
    const now = Date.now();
    for (const [id, record] of this.transfers.entries()) {
      if (
        record.status !== 'completed' &&
        record.status !== 'cancelled' &&
        now - record.updatedAt > config.abandonedTransferMs
      ) {
        console.log(`Cleaning up abandoned transfer ${id}`);
        this.cleanupTransferFiles(record);
        record.status = 'failed';
        record.error = 'Transfer abandoned (timeout)';
        this.history.unshift(record);
        this.transfers.delete(id);
      }
    }
  }
}

export const transferService = new TransferService();
