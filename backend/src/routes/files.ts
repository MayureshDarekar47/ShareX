import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import busboy from 'busboy';
import { requireAuth } from '../middleware/auth';
import { uploadRateLimit } from '../middleware/rateLimit';
import { transferService } from '../services/transferService';
import { deviceStore } from '../services/deviceStore';
import { wsHandler } from '../websocket/handler';
import { config } from '../config';
import { FileInfo } from '../types';
import { sanitizeFilename, assertSafePath } from '../utils/crypto';

const router = Router();

// POST /api/transfers/initiate — create a transfer record before upload
router.post('/initiate', requireAuth, (req: Request, res: Response) => {
  const sender = (req as any).device;
  const { receiverId, files } = req.body || {};

  if (!receiverId || !Array.isArray(files) || files.length === 0) {
    res.status(400).json({ success: false, error: 'receiverId and files[] are required' });
    return;
  }

  if (files.length > config.maxFilesPerTransfer) {
    res.status(400).json({ success: false, error: `Max ${config.maxFilesPerTransfer} files per transfer` });
    return;
  }

  // Validate receiver exists (if not 'host')
  if (receiverId !== 'host' && !deviceStore.getDeviceById(receiverId)) {
    res.status(404).json({ success: false, error: 'Receiver device not found' });
    return;
  }

  // Validate and sanitize file info
  const fileInfos: FileInfo[] = files.map((f: any) => ({
    name: sanitizeFilename(String(f.name || 'file')),
    size: Math.max(0, parseInt(f.size, 10) || 0),
    mimeType: String(f.mimeType || 'application/octet-stream').substring(0, 200),
  }));

  // Check total size
  const totalSize = fileInfos.reduce((s, f) => s + f.size, 0);
  if (totalSize > config.maxFileSizeBytes) {
    res.status(413).json({ success: false, error: `Transfer size ${totalSize} exceeds limit of ${config.maxFileSizeBytes}` });
    return;
  }

  const transfer = transferService.createTransfer(sender.id, receiverId, fileInfos);

  // Notify receiver if it's another device
  if (receiverId !== 'host') {
    const senderDevice = deviceStore.getDeviceById(sender.id);
    wsHandler.sendTo(receiverId, {
      type: 'transfer_request',
      payload: {
        transfer: { ...transfer, tempFiles: undefined as any },
        senderName: senderDevice?.name || 'Unknown',
      },
      timestamp: Date.now(),
    });
    transferService.updateStatus(transfer.id, 'waiting_approval');
  } else {
    transferService.updateStatus(transfer.id, 'approved');
  }

  res.json({
    success: true,
    data: {
      transferId: transfer.id,
      status: transfer.status,
    },
  });
});

// POST /api/transfers/:transferId/upload/:fileIndex — streaming upload
router.post(
  '/:transferId/upload/:fileIndex',
  requireAuth,
  uploadRateLimit,
  (req: Request, res: Response) => {
    const sender = (req as any).device;
    const { transferId, fileIndex } = req.params;
    const idx = parseInt(fileIndex, 10);

    const transfer = transferService.getTransfer(transferId);
    if (!transfer) {
      res.status(404).json({ success: false, error: 'Transfer not found' });
      return;
    }

    if (transfer.senderId !== sender.id) {
      res.status(403).json({ success: false, error: 'Not your transfer' });
      return;
    }

    if (!['approved', 'uploading'].includes(transfer.status)) {
      res.status(409).json({ success: false, error: `Transfer is ${transfer.status}, not ready for upload` });
      return;
    }

    if (isNaN(idx) || idx < 0 || idx >= transfer.tempFiles.length) {
      res.status(400).json({ success: false, error: 'Invalid file index' });
      return;
    }

    const tempFile = transfer.tempFiles[idx];
    const expectedSize = tempFile.size;

    transferService.updateStatus(transferId, 'uploading');

    // Use busboy for multipart or raw stream for direct upload
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('multipart/form-data')) {
      handleMultipartUpload(req, res, transfer, idx, tempFile, sender.id, transferId);
    } else {
      handleRawUpload(req, res, transfer, idx, tempFile, sender.id, transferId, expectedSize);
    }
  }
);

function handleRawUpload(
  req: Request,
  res: Response,
  transfer: any,
  idx: number,
  tempFile: any,
  senderId: string,
  transferId: string,
  expectedSize: number
): void {
  const writeStream = fs.createWriteStream(tempFile.tempPath);
  let bytesReceived = 0;
  let lastProgressUpdate = Date.now();
  let startTime = Date.now();

  req.on('data', (chunk: Buffer) => {
    bytesReceived += chunk.length;
    tempFile.bytesWritten = bytesReceived;

    // Throttle progress updates to every 200ms
    const now = Date.now();
    if (now - lastProgressUpdate > 200) {
      lastProgressUpdate = now;
      const elapsed = (now - startTime) / 1000;
      const speed = elapsed > 0 ? bytesReceived / elapsed : 0;
      const eta = speed > 0 ? (expectedSize - bytesReceived) / speed : 0;

      transferService.updateProgress(transferId, transfer.bytesTransferred + bytesReceived);

      wsHandler.broadcastAll({
        type: 'transfer_progress',
        payload: {
          transferId,
          fileIndex: idx,
          bytesTransferred: bytesReceived,
          totalBytes: expectedSize,
          speed: Math.round(speed),
          eta: Math.round(eta),
          status: 'uploading',
        },
        timestamp: now,
      });
    }
  });

  req.pipe(writeStream);

  writeStream.on('finish', async () => {
    const result = await transferService.finalizeFile(
      transferId,
      idx,
      req.headers['x-checksum'] as string
    );

    if (!result.ok) {
      res.status(422).json({ success: false, error: result.error });
      return;
    }

    // If all files done
    if (transferService.isTransferComplete(transferId)) {
      await onTransferComplete(transferId, transfer);
    }

    res.json({ success: true, data: { fileIndex: idx, bytesReceived } });
  });

  writeStream.on('error', (err) => {
    console.error('Write error:', err);
    res.status(500).json({ success: false, error: 'Write failed' });
  });

  req.on('error', (err) => {
    writeStream.destroy();
    console.error('Read error:', err);
  });
}

function handleMultipartUpload(
  req: Request,
  res: Response,
  transfer: any,
  idx: number,
  tempFile: any,
  senderId: string,
  transferId: string
): void {
  const bb = busboy({
    headers: req.headers,
    limits: { fileSize: config.maxFileSizeBytes },
  });

  let bytesReceived = 0;
  let startTime = Date.now();
  let lastProgressUpdate = Date.now();
  let fileHandled = false;

  bb.on('file', (_fieldname, fileStream, info) => {
    if (fileHandled) {
      fileStream.resume(); // discard extra files
      return;
    }
    fileHandled = true;
    const writeStream = fs.createWriteStream(tempFile.tempPath);

    fileStream.on('data', (chunk: Buffer) => {
      bytesReceived += chunk.length;
      tempFile.bytesWritten = bytesReceived;

      const now = Date.now();
      if (now - lastProgressUpdate > 200) {
        lastProgressUpdate = now;
        const elapsed = (now - startTime) / 1000;
        const speed = elapsed > 0 ? bytesReceived / elapsed : 0;
        wsHandler.broadcastAll({
          type: 'transfer_progress',
          payload: {
            transferId,
            fileIndex: idx,
            bytesTransferred: bytesReceived,
            totalBytes: tempFile.size,
            speed: Math.round(speed),
            eta: 0,
            status: 'uploading',
          },
          timestamp: now,
        });
      }
    });

    fileStream.pipe(writeStream);

    writeStream.on('finish', async () => {
      const result = await transferService.finalizeFile(transferId, idx);
      if (!result.ok) {
        res.status(422).json({ success: false, error: result.error });
        return;
      }
      if (transferService.isTransferComplete(transferId)) {
        await onTransferComplete(transferId, transfer);
      }
      res.json({ success: true, data: { fileIndex: idx, bytesReceived } });
    });
  });

  bb.on('error', (err: Error) => {
    res.status(500).json({ success: false, error: 'Upload processing error' });
  });

  req.pipe(bb);
}

async function onTransferComplete(transferId: string, transfer: any): Promise<void> {
  transferService.completeTransfer(transferId);

  // Notify all parties
  wsHandler.broadcastAll({
    type: 'transfer_complete',
    payload: {
      transferId,
      downloadUrls: transfer.tempFiles.map((_: any, i: number) =>
        `/api/transfers/${transferId}/download/${i}`
      ),
    },
    timestamp: Date.now(),
  });

  // If relaying to another device, notify receiver
  if (transfer.receiverId !== 'host') {
    wsHandler.sendTo(transfer.receiverId, {
      type: 'relay_ready',
      payload: {
        transferId,
        files: transfer.files,
        senderName: deviceStore.getDeviceById(transfer.senderId)?.name || 'Unknown',
        downloadUrls: transfer.tempFiles.map((_: any, i: number) =>
          `/api/transfers/${transferId}/download/${i}`
        ),
      },
      timestamp: Date.now(),
    });
  }
}

// GET /api/transfers/:transferId/download/:fileIndex — streaming download
router.get(
  '/:transferId/download/:fileIndex',
  requireAuth,
  (req: Request, res: Response) => {
    const requester = (req as any).device;
    const { transferId, fileIndex } = req.params;
    const idx = parseInt(fileIndex, 10);

    // Check in active transfers first, then history
    let transfer = transferService.getTransfer(transferId);
    if (!transfer) {
      const history = transferService.getHistory();
      transfer = history.find((t) => t.id === transferId) as any;
    }

    if (!transfer) {
      res.status(404).json({ success: false, error: 'Transfer not found' });
      return;
    }

    // Authorization: sender, receiver or host
    if (
      transfer.senderId !== requester.id &&
      transfer.receiverId !== requester.id &&
      transfer.receiverId !== 'host'
    ) {
      res.status(403).json({ success: false, error: 'Not authorized for this transfer' });
      return;
    }

    if (isNaN(idx) || idx < 0 || idx >= transfer.tempFiles.length) {
      res.status(400).json({ success: false, error: 'Invalid file index' });
      return;
    }

    const tempFile = transfer.tempFiles[idx];
    const filePath = tempFile.tempPath;

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    // Validate path is safe
    try {
      assertSafePath(config.receivedDir, filePath);
    } catch {
      try {
        assertSafePath(config.tempDir, filePath);
      } catch {
        res.status(403).json({ success: false, error: 'Invalid file path' });
        return;
      }
    }

    const stat = fs.statSync(filePath);
    const fileInfo = transfer.files[idx];

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileInfo.name)}"`);
    res.setHeader('Content-Type', fileInfo.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('X-Checksum-SHA256', tempFile.checksum || '');

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);

    readStream.on('error', (err) => {
      console.error('Download stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Stream error' });
      }
    });
  }
);

// POST /api/transfers/:transferId/approve — receiver approves incoming transfer
router.post('/:transferId/approve', requireAuth, (req: Request, res: Response) => {
  const requester = (req as any).device;
  const { transferId } = req.params;
  const { approve } = req.body || {};

  const transfer = transferService.getTransfer(transferId);
  if (!transfer) {
    res.status(404).json({ success: false, error: 'Transfer not found' });
    return;
  }

  if (transfer.receiverId !== requester.id) {
    res.status(403).json({ success: false, error: 'Not the intended receiver' });
    return;
  }

  if (approve) {
    transferService.updateStatus(transferId, 'approved');
    // Notify sender they can start uploading
    wsHandler.sendTo(transfer.senderId, {
      type: 'transfer_approved',
      payload: { transferId },
      timestamp: Date.now(),
    });
    res.json({ success: true, data: { approved: true } });
  } else {
    transferService.updateStatus(transferId, 'cancelled');
    wsHandler.sendTo(transfer.senderId, {
      type: 'transfer_failed',
      payload: { transferId, error: 'Receiver rejected the transfer' },
      timestamp: Date.now(),
    });
    res.json({ success: true, data: { approved: false } });
  }
});

// DELETE /api/transfers/:transferId — cancel a transfer
router.delete('/:transferId', requireAuth, (req: Request, res: Response) => {
  const requester = (req as any).device;
  const { transferId } = req.params;

  const transfer = transferService.getTransfer(transferId);
  if (!transfer) {
    res.status(404).json({ success: false, error: 'Transfer not found' });
    return;
  }

  if (transfer.senderId !== requester.id && transfer.receiverId !== requester.id) {
    res.status(403).json({ success: false, error: 'Not your transfer' });
    return;
  }

  transferService.cancelTransfer(transferId);

  wsHandler.broadcastAll({
    type: 'transfer_cancelled',
    payload: { transferId, cancelledBy: requester.id },
    timestamp: Date.now(),
  });

  res.json({ success: true, data: { cancelled: true } });
});

// GET /api/transfers/history — transfer history
router.get('/history', requireAuth, (req: Request, res: Response) => {
  const history = transferService.getHistory().map((t) => ({
    ...t,
    tempFiles: undefined, // Don't expose internal paths
  }));
  res.json({ success: true, data: { history } });
});

// DELETE /api/transfers/history — clear history
router.delete('/history', requireAuth, (req: Request, res: Response) => {
  transferService.clearHistory();
  res.json({ success: true, data: { cleared: true } });
});

export default router;
