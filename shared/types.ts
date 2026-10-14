// Shared TypeScript types for ShareX

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';
export type DeviceOS = 'windows' | 'linux' | 'android' | 'ios' | 'macos' | 'unknown';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  os: DeviceOS;
  sessionToken: string;
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
  checksum?: string; // SHA-256
}

export interface Transfer {
  id: string;
  senderId: string;
  receiverId: string | 'host'; // 'host' means save to received folder
  files: FileInfo[];
  status: TransferStatus;
  createdAt: number;
  updatedAt: number;
  bytesTransferred: number;
  totalBytes: number;
  error?: string;
  tempPath?: string; // server-side temp directory
}

export interface TransferProgress {
  transferId: string;
  fileIndex: number;
  bytesTransferred: number;
  totalBytes: number;
  speed: number; // bytes/sec
  eta: number; // seconds
  status: TransferStatus;
}

// WebSocket message types
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
  payload: unknown;
  timestamp: number;
}

export interface DeviceJoinedPayload {
  device: Omit<Device, 'sessionToken'>;
}

export interface DeviceLeftPayload {
  deviceId: string;
}

export interface TransferRequestPayload {
  transfer: Transfer;
  senderName: string;
}

export interface TransferProgressPayload extends TransferProgress {}

export interface TransferCompletePayload {
  transferId: string;
  files: FileInfo[];
  downloadUrls?: string[];
}

export interface TransferFailedPayload {
  transferId: string;
  error: string;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface PairInitResponse {
  sessionToken: string;
  deviceId: string;
  hostName: string;
  requiresApproval: boolean;
}

export interface PairCompleteResponse {
  approved: boolean;
  device: Omit<Device, 'sessionToken'>;
}

export interface UploadInitResponse {
  transferId: string;
  uploadUrl: string;
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
