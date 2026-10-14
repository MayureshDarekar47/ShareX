// Shared types (copied from backend/shared/types.ts for frontend use)
export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';
export type DeviceOS = 'windows' | 'linux' | 'android' | 'ios' | 'macos' | 'unknown';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  os: DeviceOS;
  pairedAt: number;
  lastSeen: number;
  approved: boolean;
}

export type TransferStatus =
  | 'pending'
  | 'waiting_approval'
  | 'approved'
  | 'uploading'
  | 'relaying'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface FileInfo {
  name: string;
  size: number;
  mimeType: string;
  checksum?: string;
}

export interface Transfer {
  id: string;
  senderId: string;
  receiverId: string | 'host';
  files: FileInfo[];
  status: TransferStatus;
  createdAt: number;
  updatedAt: number;
  bytesTransferred: number;
  totalBytes: number;
  error?: string;
}

export interface TransferProgress {
  transferId: string;
  fileIndex: number;
  bytesTransferred: number;
  totalBytes: number;
  speed: number;
  eta: number;
  status: TransferStatus;
}

export type WSMessageType =
  | 'device_joined'
  | 'device_left'
  | 'device_updated'
  | 'transfer_request'
  | 'transfer_approved'
  | 'transfer_rejected'
  | 'transfer_progress'
  | 'transfer_complete'
  | 'transfer_failed'
  | 'transfer_cancelled'
  | 'relay_ready'
  | 'ping'
  | 'pong'
  | 'error';

export interface WSMessage {
  type: WSMessageType;
  payload: any;
  timestamp: number;
}

export interface HostInfo {
  hostName: string;
  version: string;
  addresses: string[];
  port: number;
  maxFileSizeBytes: number;
  maxStorageBytes: number;
  requiresPin: boolean;
}

export interface ActiveTransfer {
  id: string;
  transferId: string;
  files: File[];
  fileInfos: FileInfo[];
  receiverId: string;
  status: TransferStatus;
  progress: number; // 0-100
  speed: number;
  eta: number;
  error?: string;
  downloadUrls?: string[];
  direction: 'send' | 'receive';
  senderName?: string;
  transferType?: 'file' | 'text';
  textContent?: string;
}
